"""링크 통화 (06 문서 2절): POST /calls, GET /calls/{id}, WS /ws/calls/{id}?role=deaf|hearing.
농인 글(say) → /tts 와 같은 처리 → 청인 폰에 audio. 청인 폰의 재생 상태·자막 → 농인 폰.
대화 내용은 저장·기록하지 않는다. 로그인 정보는 주소가 아니라 첫 메시지로 받는다 (접속 기록에 남지 않게)."""

import asyncio
import contextlib
import json
from datetime import datetime, timedelta, timezone

import segno
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect

from app.calls import ROLES, Room
from app.db import User
from app.deps import current_user
from app.speech import SpeechError, speak_for_user
from app.tokens import verify

router = APIRouter()
MAX_MESSAGE_BYTES = 4096
AUTH_TIMEOUT_S = 5
PLAYBACK_STATES = {"start", "level", "end", "error"}


@router.post("/calls")
async def create_call(request: Request, user: User = Depends(current_user)) -> dict:
    app = request.app
    if not app.state.limiter.allow(f"calls:{user.id}", 10):
        raise HTTPException(status_code=429, detail="잠시 후 다시 해 주세요")
    room = app.state.calls.create(user.id, user.name or "", user.voice_id)
    if room is None:
        raise HTTPException(status_code=503, detail="지금은 통화가 많아요. 잠시 후 다시 해 주세요")
    join_url = f"{app.state.settings.web_base}/c/{room.id}"
    expires = datetime.now(timezone.utc) + timedelta(seconds=app.state.calls.expires_in(room))
    return {
        "callId": room.id,
        "joinUrl": join_url,
        "qrSvg": segno.make(join_url, error="m").svg_inline(scale=6, border=2),
        "expiresAt": expires.isoformat(timespec="seconds"),
    }


@router.get("/calls/{call_id}")
async def call_state(call_id: str, request: Request) -> dict:
    room = request.app.state.calls.get(call_id)
    if room is None:
        raise HTTPException(status_code=404, detail="없거나 끝난 통화예요")
    return {"state": room.state(), "deafName": room.deaf_name}


async def _reject(ws: WebSocket, code: int, kind: str, message: str) -> None:
    with contextlib.suppress(Exception):
        await ws.send_json({"type": "error", "code": kind, "message": message})
        await ws.close(code=code)


async def _authenticate(ws: WebSocket, room: Room) -> str | None:
    """농인은 첫 메시지 {"type":"auth","token":"..."} 로 방 주인임을 보인다."""
    try:
        first = json.loads(await asyncio.wait_for(ws.receive_text(), AUTH_TIMEOUT_S))
    except (asyncio.TimeoutError, ValueError, WebSocketDisconnect):
        return None
    user_id = verify(str(first.get("token", "")), ws.app.state.settings.app_secret) if first.get("type") == "auth" else None
    if user_id != room.owner_id or await ws.app.state.db.get_active_user(user_id) is None:
        return None
    return user_id


async def _say(ws: WebSocket, room: Room, user_id: str, msg: dict) -> None:
    calls = ws.app.state.calls
    msg_id = str(msg.get("msgId", ""))[:40]
    text = str(msg.get("text", ""))
    emotion = msg.get("emotion") if isinstance(msg.get("emotion"), dict) else None
    try:
        result = await speak_for_user(ws.app, user_id, text, room.voice_id)
    except SpeechError as err:
        await calls.send(room, "deaf", {"type": "error", "msgId": msg_id, "code": "rejected", "message": err.message})
        return
    audio = {"type": "audio", "msgId": msg_id, "text": text.strip(), "displayText": result["displayText"],
             "emotion": emotion, "url": result["url"], "fallback": result["fallback"]}
    if await calls.send(room, "hearing", audio):
        await calls.send(room, "deaf", {"type": "sent", "msgId": msg_id, "fallback": result["fallback"]})
    else:
        # 청인이 잠시 끊겼다: 농인 폰이 쌓아 두었다가 다시 보낸다 (06 문서 2절)
        await calls.send(room, "deaf", {"type": "undelivered", "msgId": msg_id})


def _relay(msg: dict) -> dict | None:
    """청인 → 농인으로 넘길 메시지. 정해진 칸만 골라 넘긴다."""
    kind = msg.get("type")
    if kind == "playback" and msg.get("state") in PLAYBACK_STATES:
        out = {"type": "playback", "msgId": str(msg.get("msgId", ""))[:40], "state": msg["state"]}
        for key in ("level", "progress"):  # 소리 크기, 재생 위치 (하이라이트용) — 0~1 로 자름
            if isinstance(msg.get(key), (int, float)):
                out[key] = max(0.0, min(1.0, float(msg[key])))
        return out
    if kind == "caption" and isinstance(msg.get("text"), str):
        return {"type": "caption", "text": msg["text"][:500], "final": bool(msg.get("final"))}
    if kind == "speaking" and isinstance(msg.get("level"), (int, float)):
        return {"type": "speaking", "role": "hearing", "level": max(0.0, min(1.0, float(msg["level"])))}
    return None


@router.websocket("/ws/calls/{call_id}")
async def call_socket(ws: WebSocket, call_id: str, role: str = "") -> None:
    calls = ws.app.state.calls
    await ws.accept()
    room = calls.get(call_id)
    if room is None or room.ended:
        return await _reject(ws, 4404, "not_found", "없거나 끝난 통화예요")
    if role not in ROLES:
        return await _reject(ws, 4400, "bad_role", "잘못된 연결이에요")
    user_id = await _authenticate(ws, room) if role == "deaf" else None
    if role == "deaf" and user_id is None:
        return await _reject(ws, 4401, "unauthorized", "처음부터 다시 시작해 주세요")
    if not await calls.join(room, role, ws):
        return await _reject(ws, 4409, "busy", "이미 통화 중이에요")

    says: asyncio.Queue = asyncio.Queue()

    async def say_worker() -> None:  # 농인 글은 보낸 순서대로 하나씩 처리
        while True:
            msg = await says.get()
            try:
                await _say(ws, room, user_id, msg)
            except Exception:  # 한 문장이 실패해도 통화는 계속 (내용은 기록하지 않음)
                await calls.send(room, "deaf", {"type": "error", "msgId": str(msg.get("msgId", ""))[:40],
                                                "code": "failed", "message": "문제가 생겼어요"})

    worker = asyncio.create_task(say_worker()) if role == "deaf" else None
    try:
        while True:
            raw = await ws.receive_text()
            if len(raw.encode("utf-8")) > MAX_MESSAGE_BYTES:
                continue
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(msg, dict) or msg.get("type") == "ping":
                continue  # 연결 유지 신호는 대화 활동이 아니다 (방치된 방은 15분 뒤 정리)
            calls.touch(room)
            if msg.get("type") == "hangup":
                await calls.end(room, "hangup")
                break
            if role == "deaf" and msg.get("type") == "say":
                says.put_nowait(msg)
            elif role == "hearing":
                relayed = _relay(msg)
                if relayed:
                    await calls.send(room, "deaf", relayed)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        if worker:
            worker.cancel()
        await calls.leave(room, role, ws)
