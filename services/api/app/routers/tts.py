"""POST /tts, POST /tts/warmup, GET /tts/status (07 문서 5절). 글 내용은 저장·기록하지 않는다."""

import asyncio
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.cache import cache_key
from app.db import User
from app.deps import client_ip, current_user
from app.text_normalize import normalize

router = APIRouter()
MAX_CHARS = 100
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
    app = request.app
    started = time.perf_counter()
    if not app.state.limiter.allow(f"tts:{user.id}", app.state.settings.tts_limit_per_min):
        raise HTTPException(status_code=429, detail="잠시 후 다시 보내 주세요")
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="보낼 글을 적어 주세요")
    if len(text) > MAX_CHARS:
        raise HTTPException(status_code=400, detail=f"{MAX_CHARS}자까지 보낼 수 있어요")
    if await app.state.db.get_approved_voice(body.voiceId) is None:
        raise HTTPException(status_code=400, detail="없는 목소리예요")
    spoken = normalize(text)
    if not spoken:
        raise HTTPException(status_code=400, detail="읽을 글자가 없어요")

    # 감정·속도 반영은 T13 → 지금은 모두 평온·보통 속도로 만들고, 캐시 키도 같게 맞춘다
    emotion, intensity, tremor, speed = "calm", 2, 0, 1.0
    key = cache_key(app.state.settings.app_secret, body.voiceId, emotion, intensity, tremor, speed, spoken)
    payload = {"voiceId": body.voiceId, "emotion": emotion, "intensity": intensity, "tremor": tremor,
               "text": spoken, "seed": 1}
    result = await app.state.tts.speak(key, payload, spoken)

    ms = int((time.perf_counter() - started) * 1000)
    kind = "tts_cached" if result["cached"] else "tts"
    await app.state.db.add_event(kind, ms, result["fallback"])  # 시간·비상 전환 여부만
    return result


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
