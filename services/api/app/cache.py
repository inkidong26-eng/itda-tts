"""같은 문장 캐시 (07 문서 5·7절): 키 만들기, 찾기, 24시간 정리 (즐겨찾기 미리 생성분 pinned 제외)."""

import hashlib
from datetime import datetime, timedelta, timezone

from app.db import Database
from app.storage import AudioStorage


def cache_key(voice_id: str, emotion: str, intensity: int, tremor: int, speed: float, text: str) -> str:
    raw = f"{voice_id}|{emotion}|{intensity}|{tremor}|{speed:.2f}|{text}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


class AudioCache:
    def __init__(self, db: Database, storage: AudioStorage, hours: int) -> None:
        self.db = db
        self.storage = storage
        self.hours = hours

    async def lookup(self, key: str) -> tuple[str, int] | None:
        """(파일 이름, 길이 ms). 표에는 있는데 파일이 없으면 없는 것으로."""
        row = await self.db.get_cache(key)
        if row and self.storage.exists(row.path):
            return row.path, row.duration_ms
        return None

    async def put(self, key: str, name: str, data: bytes, duration_ms: int, pinned: bool = False) -> None:
        self.storage.save(name, data)
        await self.db.put_cache(key, name, duration_ms, pinned)

    async def cleanup(self) -> int:
        before = (datetime.now(timezone.utc) - timedelta(hours=self.hours)).isoformat(timespec="seconds")
        old = await self.db.expired_cache(before)
        for row in old:
            self.storage.delete(row.path)
        await self.db.delete_cache([row.key for row in old])
        return len(old)
