"""DB 접근은 이 파일에서만 한다 (07 문서 7·10절). 지금은 SQLite, 나중에 DATABASE_URL 만 바꿔 PostgreSQL로."""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import Float, Integer, String, Text, delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


# DB 도구들은 자세한 로그에 SQL 값(이름 등)을 그대로 적는다 → 개인정보가 로그에 남지 않게 막는다
for _name in ("aiosqlite", "sqlalchemy.engine", "sqlalchemy.pool"):
    logging.getLogger(_name).setLevel(logging.WARNING)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str | None] = mapped_column(String)
    age_group: Mapped[str | None] = mapped_column(String)
    gender: Mapped[str | None] = mapped_column(String)
    voice_id: Mapped[str | None] = mapped_column(String)
    speed: Mapped[float] = mapped_column(Float, default=1.0)
    auth_provider: Mapped[str] = mapped_column(String, default="guest")
    consent_version: Mapped[str | None] = mapped_column(String)
    consent_at: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)
    deleted_at: Mapped[str | None] = mapped_column(String)


class Voice(Base):
    __tablename__ = "voices"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    age_group: Mapped[str] = mapped_column(String)
    gender: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[str] = mapped_column(Text, default="[]")
    approved: Mapped[int] = mapped_column(Integer, default=0)
    preview_url: Mapped[str | None] = mapped_column(String)
    wave_url: Mapped[str | None] = mapped_column(String)
    card: Mapped[str | None] = mapped_column(Text)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Database:
    def __init__(self, url: str) -> None:
        if url.startswith("sqlite") and ":///" in url:
            # SQLite 파일이 들어갈 폴더를 미리 만든다
            Path(url.split(":///", 1)[1]).parent.mkdir(parents=True, exist_ok=True)
        self.engine = create_async_engine(url)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)

    async def init(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def close(self) -> None:
        await self.engine.dispose()

    # ---------- 사용자 ----------
    async def create_user(self, name: str, age_group: str, gender: str, consent_version: str) -> User:
        stamp = now()
        user = User(id=uuid4().hex, name=name, age_group=age_group, gender=gender, speed=1.0,
                    auth_provider="guest", consent_version=consent_version, consent_at=stamp, created_at=stamp)
        async with self.session() as s, s.begin():
            s.add(user)
        return user

    async def get_active_user(self, user_id: str) -> User | None:
        async with self.session() as s:
            user = await s.get(User, user_id)
        return user if user and user.deleted_at is None else None

    async def update_user(self, user_id: str, **fields) -> None:
        async with self.session() as s, s.begin():
            user = await s.get(User, user_id)
            for key, value in fields.items():
                setattr(user, key, value)

    async def erase_user(self, user_id: str) -> None:
        """내 정보 삭제: 이름·나이·성별·목소리를 지우고 삭제 시각만 남긴다."""
        await self.update_user(user_id, name=None, age_group=None, gender=None, voice_id=None, deleted_at=now())

    # ---------- 음성 ----------
    async def replace_voices(self, voices: list[dict]) -> None:
        async with self.session() as s, s.begin():
            await s.execute(delete(Voice))
            for v in voices:
                s.add(Voice(
                    id=v["id"], name=v["name"], age_group=v["ageGroup"], gender=v["gender"],
                    description=v.get("description", ""), tags=json.dumps(v.get("tags", []), ensure_ascii=False),
                    approved=1 if v.get("approved") else 0, preview_url=v.get("previewUrl"),
                    wave_url=v.get("waveUrl"),
                    card=json.dumps(v["card"], ensure_ascii=False) if v.get("card") else None,
                ))

    async def approved_voices(self) -> list[Voice]:
        async with self.session() as s:
            rows = await s.scalars(select(Voice).where(Voice.approved == 1).order_by(Voice.id))
            return list(rows)

    async def get_approved_voice(self, voice_id: str) -> Voice | None:
        async with self.session() as s:
            voice = await s.get(Voice, voice_id)
        return voice if voice and voice.approved else None
