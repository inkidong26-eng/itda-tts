"""빠른 말·즐겨찾기를 목소리마다 미리 만들어 둔다 (T17). 누르면 즉시 진짜 목소리.

API 컨테이너 안에서 실행한다 (GPU 가 연결돼 있어야 함):
  docker compose -f infra/docker-compose.prod.yml exec api python -m app.prewarm
미리 만든 것은 pinned 로 저장해 24시간 정리에서 지우지 않는다. 이미 있으면 건너뛴다.
목소리를 새로 바꿨으면: ... python -m app.prewarm --redo v20m1,v30m1
  → 그 목소리는 다시 만들고(새 파일 이름이라 폰에 남은 예전 소리를 안 씀), 고정 안 된 임시 캐시는 모두 지운다.
"""

import argparse
import asyncio
import json
import time
from pathlib import Path

import httpx

from app.audio_convert import to_mp3, wav_duration_ms
from app.cache import AudioCache, cache_key
from app.config import load_settings
from app.db import Database
from app.routers.admin import load_saved
from app.storage import AudioStorage
from app.text_normalize import normalize

# 웹앱의 빠른 말(lib/phrases.ts)과 즐겨찾기(lib/favorites.ts) 문구 — 화면과 같은 글자여야 캐시가 맞는다
PHRASES_FILE = Path(__file__).parent / "data" / "prewarm_phrases.json"


async def main(redo: set[str]) -> None:
    settings = load_settings()
    phrases = json.loads(PHRASES_FILE.read_text(encoding="utf-8"))
    urls = load_saved(settings) or settings.tts_endpoints
    if not urls:
        print("GPU 가 연결돼 있지 않아요. 관리자 화면에서 먼저 연결해 주세요.")
        return
    db = Database(settings.database_url)
    await db.init()
    cache = AudioCache(db, AudioStorage(settings.audio_dir, settings.public_audio_base), settings.cache_hours)
    voices = [v.id for v in await db.approved_voices()]
    if redo:
        # 사용자가 쓴 말의 임시 캐시는 어느 목소리 것인지 알 수 없어 모두 지운다 (다시 만들면 됨)
        cleared = await AudioCache(db, cache.storage, 0).cleanup()
        print(f"임시 캐시 {cleared}개 지움 · 다시 만들 목소리: {', '.join(sorted(redo))}")
    made = skipped = failed = 0
    started = time.time()
    async with httpx.AsyncClient(headers={"X-Key": settings.tts_key}, timeout=60) as client:
        for voice in voices:
            for text in phrases:
                spoken = normalize(text)
                key = cache_key(settings.app_secret, voice, "calm", 2, 0, 1.0, spoken)
                found = None if voice in redo else await cache.lookup(key)
                if found:
                    await db.put_cache(key, found[0], found[1], True)  # 이미 있으면 지워지지 않게 고정만
                    skipped += 1
                    continue
                payload = {"voiceId": voice, "emotion": "calm", "intensity": 2, "tremor": 0, "text": spoken, "seed": 1}
                try:
                    res = await client.post(f"{urls[0]}/synthesize", json=payload)
                    res.raise_for_status()
                    data, ext = await to_mp3(res.content)
                    name = f"{key}-{int(started)}.{ext}" if voice in redo else f"{key}.{ext}"
                    old = await db.get_cache(key) if voice in redo else None
                    await cache.put(key, name, data, wav_duration_ms(res.content), pinned=True)
                    if old and old.path != name:
                        cache.storage.delete(old.path)
                    made += 1
                except httpx.HTTPError as err:
                    failed += 1
                    print(f"  실패 {voice}: {type(err).__name__}")
            print(f"{voice} 끝 (만듦 {made} · 이미 있음 {skipped} · 실패 {failed}, {time.time() - started:.0f}초)", flush=True)
    await db.close()
    print(f"완료: 목소리 {len(voices)}개 × 문구 {len(phrases)}개 → 만듦 {made}, 이미 있음 {skipped}, 실패 {failed}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--redo", default="", help="새로 바꾼 목소리 id (쉼표로)")
    asyncio.run(main({s.strip() for s in ap.parse_args().redo.split(",") if s.strip()}))
