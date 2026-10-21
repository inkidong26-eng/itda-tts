"""POST /tts, POST /tts/warmup, GET /tts/status (07 문서 5절). 글 내용은 저장·기록하지 않는다."""

import asyncio
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.db import User
from app.deps import client_ip, current_user
from app.speech import SpeechError, speak_for_user

router = APIRouter()
_background: set[asyncio.Task] = set()  # 기다리지 않는 작업이 중간에 사라지지 않게 붙잡아 둔다


class EmotionIn(BaseModel):
    emotion: Literal["calm", "joy", "sad", "angry", "surprise", "plead"] = "calm"
    intensity: int = Field(default=2, ge=1, le=3)
    tremor: int = Field(default=0, ge=0, le=3)


class TtsIn(BaseModel):
    text: str
    voiceId: str
    emotion: EmotionIn = EmotionIn()
    speed: float = Field(default=1.0, ge=0.5, le=1.5)


@router.post("/tts")
async def tts(body: TtsIn, request: Request, user: User = Depends(current_user)) -> dict:
    try:
        return await speak_for_user(request.app, user.id, body.text, body.voiceId)
    except SpeechError as err:
        raise HTTPException(status_code=err.status, detail=err.message) from None


@router.post("/tts/warmup")
async def warmup(request: Request) -> dict:
    app = request.app
    if not app.state.limiter.allow(f"warmup:{client_ip(request)}", 10):
        return {"state": app.state.tts.pool.state}
    pool = app.state.tts.pool
    if pool.state != "off" and pool.warmup_due():
        await pool.check_health()
        task = asyncio.create_task(pool.warmup())  # 기다리지 않는다
        _background.add(task)
        task.add_done_callback(_background.discard)
    return {"state": pool.state}


@router.get("/tts/status")
async def status(request: Request) -> dict:
    tts = request.app.state.tts
    return {"state": tts.pool.state, "queue": tts.pool.queue_len(), "avgMs": tts.avg_ms}
