"""TTS 내부 서버. 폰은 직접 접속하지 않고 API 서버만 X-Key 로 부른다 (07 문서 6절)."""

import asyncio
import io
import logging
import os
import secrets
import time
from contextlib import asynccontextmanager
from typing import Literal

import soundfile as sf
from fastapi import Depends, FastAPI, Header, HTTPException, Response
from pydantic import BaseModel, Field

log = logging.getLogger("tts")

# 테스트에서는 가짜 엔진을 미리 넣어 둔다
engine = None
state = {"ready": False, "in_flight": 0}

WARMUP_DESCRIPTION = "20대 여성, 밝고 또렷한 목소리"
WARMUP_TEXT = "안녕하세요."


def load_engine():
    from engine import QwenEngine

    return QwenEngine()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    if not os.getenv("TTS_KEY"):
        # 비밀키 없이 열리면 누구나 GPU를 쓸 수 있으므로 시작하지 않는다
        raise RuntimeError("TTS_KEY 환경 변수가 없어요. .env 를 확인해 주세요.")
    if engine is None:
        started = time.perf_counter()
        engine = await asyncio.to_thread(load_engine)
        log.info("model loaded ms=%d", (time.perf_counter() - started) * 1000)
    state["ready"] = True
    yield
    state["ready"] = False


app = FastAPI(title="ITDA TTS", lifespan=lifespan)


def check_key(x_key: str = Header(default="")) -> None:
    if not secrets.compare_digest(x_key, os.getenv("TTS_KEY", "")):
        raise HTTPException(status_code=401, detail="unauthorized")


class SynthesizeRequest(BaseModel):
    # T02 는 목소리 설계(design)만. 감정·복제 방식은 T03 결정 후 추가
    mode: Literal["design"] = "design"
    description: str = Field(min_length=1, max_length=500)
    text: str = Field(min_length=1, max_length=400)  # 화면 100자 → 읽기 변환 뒤 최대 약 3배
    seed: int = 1


async def run_design(description: str, text: str, seed: int) -> tuple[bytes, int]:
    state["in_flight"] += 1
    started = time.perf_counter()
    try:
        audio, sr = await asyncio.to_thread(engine.design, description, text, seed)
    finally:
        state["in_flight"] -= 1
    ms = int((time.perf_counter() - started) * 1000)
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    # 로그에는 처리 시간만 (글 내용 금지)
    log.info("synthesize ms=%d", ms)
    return buf.getvalue(), ms


@app.post("/synthesize", dependencies=[Depends(check_key)])
async def synthesize(req: SynthesizeRequest) -> Response:
    wav, ms = await run_design(req.description, req.text, req.seed)
    return Response(content=wav, media_type="audio/wav", headers={"X-Gen-Ms": str(ms)})


@app.post("/warmup", dependencies=[Depends(check_key)])
async def warmup() -> dict:
    _, ms = await run_design(WARMUP_DESCRIPTION, WARMUP_TEXT, 1)
    return {"ready": True, "ms": ms}


@app.get("/health", dependencies=[Depends(check_key)])
async def health() -> dict:
    return {
        "ready": state["ready"],
        "gpu": getattr(engine, "gpu", None),
        "inFlight": state["in_flight"],
    }
