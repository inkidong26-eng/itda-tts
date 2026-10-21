from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import load_settings
from app.db import Database
from app.rate_limit import RateLimiter
from app.routers import auth, voices
from app.voice_catalog import load_voices_file


def create_app() -> FastAPI:
    settings = load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db = Database(settings.database_url)
        await db.init()
        await db.replace_voices(load_voices_file(settings.voices_json))
        app.state.settings = settings
        app.state.db = db
        app.state.limiter = RateLimiter()
        yield
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

    @app.get("/health")
    async def health() -> dict:
        # 서버가 살아 있는지 확인용 (TTS 상태는 T08에서 추가)
        return {"ok": True}

    return app


app = create_app()
