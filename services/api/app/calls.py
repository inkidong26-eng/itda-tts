"""링크 통화 방 관리는 이 파일에서만 (06 문서 2절, 07 문서 10절).
지금은 서버 메모리. 서버를 여러 대로 늘리면 Redis(방 상태 + 메시지 중계)로 이 파일만 바꾼다.
대화 내용은 저장하지 않는다 — 방에는 연결 상태와 시간만 있다."""

import asyncio
import contextlib
import secrets
import time
from dataclasses import dataclass, field

from fastapi import WebSocket

ROLES = ("deaf", "hearing")
WAIT_LIMIT_S = 30 * 60     # 만든 뒤 30분 안에 청인이 안 들어오면 만료
IDLE_LIMIT_S = 15 * 60     # 통화 중 15분 무활동이면 종료
KEEP_ENDED_S = 5 * 60      # 끝난 방은 5분 뒤 지운다 (그동안 '끝난 통화' 안내용)
MAX_ROOMS = 500            # 메모리 보호


@dataclass
class Room:
    id: str
    owner_id: str           # 방을 만든 농인 사용자
    deaf_name: str
    voice_id: str | None
    created: float
    last_active: float
    hearing_joined: bool = False
    ended_at: float | None = None
    sockets: dict[str, WebSocket] = field(default_factory=dict)

    @property
    def ended(self) -> bool:
        return self.ended_at is not None

    def state(self) -> str:
        if self.ended:
            return "ended"
        return "connected" if len(self.sockets) == 2 else "waiting"


class CallManager:
    def __init__(self, clock=time.monotonic) -> None:
        self._clock = clock
        self._rooms: dict[str, Room] = {}

    def create(self, owner_id: str, deaf_name: str, voice_id: str | None) -> Room | None:
        if sum(1 for r in self._rooms.values() if not r.ended) >= MAX_ROOMS:
            return None
        now = self._clock()
        room = Room(secrets.token_urlsafe(9), owner_id, deaf_name, voice_id, now, now)  # 추측 불가능한 번호
        self._rooms[room.id] = room
        return room

    def get(self, call_id: str) -> Room | None:
        return self._rooms.get(call_id)

    def expires_in(self, room: Room) -> float:
        return max(0.0, room.created + WAIT_LIMIT_S - self._clock())

    def touch(self, room: Room) -> None:
        room.last_active = self._clock()

    async def join(self, room: Room, role: str, ws: WebSocket) -> bool:
        """역할마다 한 명만 (1:1). 이미 연결된 사람이 있으면 False → '이미 통화 중'."""
        if room.ended or role in room.sockets:
            return False
        room.sockets[role] = ws
        if role == "hearing":
            room.hearing_joined = True
        self.touch(room)
        other = "hearing" if role == "deaf" else "deaf"
        if other in room.sockets:
            await self.send(room, role, {"type": "presence", "role": other, "online": True})
            await self.send(room, other, {"type": "presence", "role": role, "online": True})
        return True

    async def leave(self, room: Room, role: str, ws: WebSocket) -> None:
        if room.sockets.get(role) is not ws:
            return
        del room.sockets[role]
        other = "hearing" if role == "deaf" else "deaf"
        if not room.ended:
            await self.send(room, other, {"type": "presence", "role": role, "online": False})

    async def send(self, room: Room, role: str, message: dict) -> bool:
        ws = room.sockets.get(role)
        if ws is None:
            return False
        try:
            await ws.send_json(message)
            return True
        except Exception:  # 끊긴 연결: 받는 쪽 접속 정리에서 처리된다
            return False

    async def end(self, room: Room, reason: str) -> None:
        if room.ended:
            return
        room.ended_at = self._clock()
        for role, ws in list(room.sockets.items()):
            await self.send(room, role, {"type": "ended", "reason": reason})
            with contextlib.suppress(Exception):
                await ws.close(code=4000)
        room.sockets.clear()

    async def sweep(self) -> None:
        now = self._clock()
        for room in list(self._rooms.values()):
            if room.ended:
                if now - room.ended_at > KEEP_ENDED_S:
                    del self._rooms[room.id]
            elif not room.hearing_joined and now - room.created > WAIT_LIMIT_S:
                await self.end(room, "expired")
            elif now - room.last_active > IDLE_LIMIT_S:
                await self.end(room, "idle")

    async def run_sweeper(self, every_s: float = 30) -> None:
        while True:
            try:
                await self.sweep()
            except Exception:  # 한 번의 오류로 정리가 멈추지 않게
                pass
            await asyncio.sleep(every_s)
