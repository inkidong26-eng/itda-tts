"""관리자 화면 (폰에서 GPU 켜고 연결하기). ADMIN_PASSWORD 가 없으면 꺼져 있다.

- GET  /admin/tts          지금 GPU 주소와 상태
- POST /admin/tts          {podId} 또는 {url} → 그 GPU 를 쓴다 (파일에 남겨 서버를 다시 켜도 유지), 빈 값이면 GPU 끊기
비밀번호는 X-Admin 헤더. 틀리면 분당 5번까지만 (맞혀 보기 막기).
"""

import json
import re
import secrets
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.deps import client_ip

router = APIRouter()
POD_ID = re.compile(r"^[a-z0-9]{8,24}$")
URL = re.compile(r"^https://[a-z0-9.-]+(:\d+)?/?$")
GPU_PORT = 8001  # RunPod 템플릿에서 열어 둔 포트 (nginx 8001 → 음성 서버 8000)


def endpoint_file(request: Request) -> Path:
    return Path(request.app.state.settings.audio_dir).parent / "tts_endpoint.json"


def check(request: Request, password: str) -> None:
    settings = request.app.state.settings
    if not settings.admin_password:
        raise HTTPException(status_code=404, detail="not found")
    if not request.app.state.limiter.allow(f"admin:{client_ip(request)}", 5):
        raise HTTPException(status_code=429, detail="잠시 후 다시 해 주세요")
    if not secrets.compare_digest(password, settings.admin_password):
        raise HTTPException(status_code=401, detail="비밀번호가 맞지 않아요")


class TtsIn(BaseModel):
    podId: str = Field(default="", max_length=40)
    url: str = Field(default="", max_length=200)


def status(request: Request) -> dict:
    pool = request.app.state.tts.pool
    return {"endpoints": [{"url": e.url, "healthy": e.healthy} for e in pool.endpoints], "state": pool.state}


@router.get("/admin/tts")
async def get_tts(request: Request, x_admin: str = Header(default="")) -> dict:
    check(request, x_admin)
    return status(request)


@router.post("/admin/tts")
async def set_tts(body: TtsIn, request: Request, x_admin: str = Header(default="")) -> dict:
    check(request, x_admin)
    pod, url = body.podId.strip().lower(), body.url.strip()
    if pod:
        if not POD_ID.fullmatch(pod):
            raise HTTPException(status_code=400, detail="Pod ID 모양이 아니에요")
        url = f"https://{pod}-{GPU_PORT}.proxy.runpod.net"
    elif url and not URL.fullmatch(url):
        raise HTTPException(status_code=400, detail="주소 모양이 아니에요")
    urls = [url.rstrip("/")] if url else []
    pool = request.app.state.tts.pool
    pool.set_urls(urls)
    endpoint_file(request).write_text(json.dumps({"urls": urls}), encoding="utf-8")
    await pool.check_health()
    return status(request)


def load_saved(settings) -> list[str] | None:
    """관리자 화면에서 정한 GPU 주소 (없으면 None → .env 의 TTS_ENDPOINTS 를 쓴다)"""
    path = Path(settings.audio_dir).parent / "tts_endpoint.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))["urls"]
    except (OSError, ValueError, KeyError):
        return None
