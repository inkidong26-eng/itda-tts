"""차례 기다리기·같은 문장 동시 요청·캐시 정리를 직접 시험한다."""

import asyncio

from app.cache import AudioCache, cache_key
from app.db import Database
from app.storage import AudioStorage
from app.tts_client import TtsPool
from app.tts_service import TtsService
from tests.fake_tts import FakeGpu


async def make_service(tmp_path, gpu: FakeGpu, concurrency=1, start=0.3, total=0.8):
    db = Database(f"sqlite+aiosqlite:///{(tmp_path / 's.db').as_posix()}")
    await db.init()
    storage = AudioStorage(tmp_path / "audio", "/a")
    pool = TtsPool(["http://fake-gpu"], "k", concurrency, 30, gpu.transport())
    return TtsService(pool, AudioCache(db, storage, 24), start, total), db, storage


def payload(text):
    return {"voiceId": "v", "emotion": "calm", "intensity": 2, "tremor": 0, "text": text, "seed": 1}


def test_busy_gpu_queue_timeout_falls_back(tmp_path):
    async def run():
        service, db, _ = await make_service(tmp_path, FakeGpu(delay_s=1.0), concurrency=1, start=0.3, total=2.0)
        a = asyncio.create_task(service.speak("a", payload("첫 문장"), "첫 문장"))
        await asyncio.sleep(0.05)
        loop = asyncio.get_running_loop()
        started = loop.time()
        b = await service.speak("b", payload("둘째 문장"), "둘째 문장")  # 자리가 없어 0.3초 뒤 비상 전환
        waited = loop.time() - started
        first = await a
        await service.pool.close()
        await db.close()
        return first, b, waited

    first, second, waited = asyncio.run(run())
    assert first["fallback"] is False
    assert second["fallback"] is True and 0.25 < waited < 0.8


def test_same_sentence_at_once_is_generated_once(tmp_path):
    async def run():
        gpu = FakeGpu(delay_s=0.2)
        service, db, _ = await make_service(tmp_path, gpu, concurrency=4)
        results = await asyncio.gather(*(service.speak("same", payload("같은 말"), "같은 말") for _ in range(3)))
        await service.pool.close()
        await db.close()
        return gpu, results

    gpu, results = asyncio.run(run())
    assert len(gpu.calls) == 1
    assert all(r["fallback"] is False for r in results)


def test_cleanup_keeps_pinned_and_new(tmp_path):
    async def run():
        db = Database(f"sqlite+aiosqlite:///{(tmp_path / 'c.db').as_posix()}")
        await db.init()
        storage = AudioStorage(tmp_path / "audio", "/a")
        cache = AudioCache(db, storage, hours=24)
        for key, pinned in (("old", False), ("fav", True), ("new", False)):
            await cache.put(key, f"{key}.wav", b"x", 100, pinned=pinned)
        old_time = "2000-01-01T00:00:00+00:00"
        async with db.session() as s, s.begin():
            from app.db import TtsCache
            for key in ("old", "fav"):
                (await s.get(TtsCache, key)).created_at = old_time
        removed = await cache.cleanup()
        state = {k: await cache.lookup(k) is not None for k in ("old", "fav", "new")}
        await db.close()
        return removed, state, storage

    removed, state, storage = asyncio.run(run())
    assert removed == 1
    assert state == {"old": False, "fav": True, "new": True}
    assert not storage.exists("old.wav")


def test_cache_key_changes_with_every_part():
    base = cache_key("v1", "calm", 2, 0, 1.0, "안녕")
    assert base != cache_key("v2", "calm", 2, 0, 1.0, "안녕")
    assert base != cache_key("v1", "joy", 2, 0, 1.0, "안녕")
    assert base != cache_key("v1", "calm", 2, 0, 1.2, "안녕")
    assert base != cache_key("v1", "calm", 2, 0, 1.0, "안녕하세요")
    assert len(base) == 40


def test_storage_refuses_paths_outside_folder(tmp_path):
    storage = AudioStorage(tmp_path / "audio", "/a")
    import pytest
    for bad in ("../x.wav", "a/b.wav", "a\\b.wav"):
        with pytest.raises(ValueError):
            storage.save(bad, b"x")
