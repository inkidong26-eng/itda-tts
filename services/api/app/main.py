import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.cache import AudioCache
from app.calls import CallManager
from app.config import load_settings
from app.db import Database
from app.rate_limit import RateLimiter
from app.routers import auth, calls, tts, voices
from app.storage import AudioStorage
from app.tts_client import TtsPool
from app.tts_service import TtsService
from app.voice_catalog import load_voices_file

CLEANUP_EVERY_S = 30 * 60
log = logging.getLogger("itda.api")


async def _cleanup_loop(cache: AudioCache) -> None:
    while True:
        try:
            await cache.cleanup()  # 24시간 지난 음성 파일 지우기 (즐겨찾기 미리 생성분 제외)
        except Exception as err:  # 한 번 실패해도 다음 정리는 계속 (24시간 보관 약속)
            log.warning("cache cleanup error: %s", type(err).__name__)
        await asyncio.sleep(CLEANUP_EVERY_S)


def create_app() -> FastAPI:
    settings = load_settings()
    storage = AudioStorage(settings.audio_dir, settings.public_audio_base)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db = Database(settings.database_url)
        await db.init()
        await db.replace_voices(load_voices_file(settings.voices_json))
        pool = TtsPool(settings.tts_endpoints, settings.tts_key, settings.tts_max_concurrency,
                       settings.tts_request_timeout_s)
        cache = AudioCache(db, storage, settings.cache_hours)
        app.state.settings = settings
        app.state.db = db
        app.state.limiter = RateLimiter()
        app.state.tts = TtsService(pool, cache, settings.tts_start_timeout_s, settings.tts_total_timeout_s)
        app.state.calls = CallManager()
        await pool.start()
        background = [asyncio.create_task(_cleanup_loop(cache)), asyncio.create_task(app.state.calls.run_sweeper())]
        yield
        for task in background:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        await app.state.tts.pool.close()
        await db.close()

    app = FastAPI(title="ITDA API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(auth.router)
    app.include_router(voices.router)
    app.include_router(tts.router)
    app.include_router(calls.router)
    # 개발용 음성 파일 제공. 배포(T20)에서는 Caddy 가 /a/* 를 직접 제공한다
    app.mount("/a", StaticFiles(directory=storage.directory), name="audio")

    @app.get("/health")
    async def health() -> dict:
        # GPU 서버 주소는 밖에 알리지 않는다 (상태만)
        pool = app.state.tts.pool
        return {"ok": True, "tts": [{"healthy": e.healthy, "active": e.active} for e in pool.endpoints]}

    return app


app = create_app()
