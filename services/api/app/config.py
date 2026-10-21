"""환경 변수에서 설정을 읽는다 (07 문서 9절). 비밀값은 .env 로만."""

import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_VOICES_JSON = Path(__file__).resolve().parents[2] / "tts" / "voices.json"


@dataclass(frozen=True)
class Settings:
    app_secret: str
    database_url: str
    allowed_origins: list[str]
    voices_json: Path
    consent_version: str
    signup_limit_per_min: int
    audio_dir: Path
    public_audio_base: str
    tts_endpoints: list[str]
    tts_key: str
    tts_max_concurrency: int
    tts_start_timeout_s: float
    tts_total_timeout_s: float
    tts_limit_per_min: int
    cache_hours: int = 24
    tts_request_timeout_s: float = 30
    token_days: int = 30


def load_settings() -> Settings:
    secret = os.getenv("APP_SECRET", "")
    if not secret:
        # 비밀키 없이 켜지면 누구나 토큰을 만들 수 있으므로 시작하지 않는다
        raise RuntimeError("APP_SECRET 환경 변수가 없어요. .env 를 확인해 주세요.")
    origins = [o.strip() for o in os.getenv("ALLOWED_ORIGIN", "").split(",") if o.strip()]
    return Settings(
        app_secret=secret,
        database_url=os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/itda.db"),
        allowed_origins=origins,
        voices_json=Path(os.getenv("VOICES_JSON", str(DEFAULT_VOICES_JSON))),
        consent_version=os.getenv("CONSENT_VERSION", "event-2026-11-v1"),
        signup_limit_per_min=int(os.getenv("SIGNUP_LIMIT_PER_MIN", "30")),
        audio_dir=Path(os.getenv("AUDIO_DIR", "./data/audio")),
        public_audio_base=os.getenv("PUBLIC_AUDIO_BASE", "/a").rstrip("/"),
        tts_endpoints=[u.strip().rstrip("/") for u in os.getenv("TTS_ENDPOINTS", "").split(",") if u.strip()],
        tts_key=os.getenv("TTS_KEY", ""),
        tts_max_concurrency=int(os.getenv("TTS_MAX_CONCURRENCY", "4")),
        tts_start_timeout_s=int(os.getenv("TTS_START_TIMEOUT_MS", "2500")) / 1000,
        tts_total_timeout_s=int(os.getenv("TTS_TOTAL_TIMEOUT_MS", "4000")) / 1000,
        tts_limit_per_min=int(os.getenv("TTS_LIMIT_PER_MIN", "20")),
    )
