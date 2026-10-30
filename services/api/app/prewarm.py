"""빠른 말·즐겨찾기를 목소리마다 미리 만들어 둔다 (T17). 누르면 즉시 진짜 목소리.

API 컨테이너 안에서 실행한다 (GPU 가 연결돼 있어야 함):
  docker compose -f infra/docker-compose.prod.yml exec api python -m app.prewarm
미리 만든 것은 pinned 로 저장해 24시간 정리에서 지우지 않는다. 이미 있으면 건너뛴다.
"""

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


async def main() -> None:
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
    made = skipped = failed = 0
    started = time.time()
    async with httpx.AsyncClient(headers={"X-Key": settings.tts_key}, timeout=60) as client:
        for voice in voices:
            for text in phrases:
                spoken = normalize(text)
                key = cache_key(settings.app_secret, voice, "calm", 2, 0, 1.0, spoken)
                found = await cache.lookup(key)
                if found:
                    await db.put_cache(key, found[0], found[1], True)  # 이미 있으면 지워지지 않게 고정만
                    skipped += 1
                    continue
                payload = {"voiceId": voice, "emotion": "calm", "intensity": 2, "tremor": 0, "text": spoken, "seed": 1}
                try:
                    res = await client.post(f"{urls[0]}/synthesize", json=payload)
                    res.raise_for_status()
                    data, ext = await to_mp3(res.content)
                    await cache.put(key, f"{key}.{ext}", data, wav_duration_ms(res.content), pinned=True)
                    made += 1
                except httpx.HTTPError as err:
                    failed += 1
                    print(f"  실패 {voice}: {type(err).__name__}")
            print(f"{voice} 끝 (만듦 {made} · 이미 있음 {skipped} · 실패 {failed}, {time.time() - started:.0f}초)", flush=True)
    await db.close()
    print(f"완료: 목소리 {len(voices)}개 × 문구 {len(phrases)}개 → 만듦 {made}, 이미 있음 {skipped}, 실패 {failed}")


if __name__ == "__main__":
    asyncio.run(main())
