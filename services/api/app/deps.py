"""여러 경로가 함께 쓰는 확인 절차."""

from fastapi import Header, HTTPException, Request

from app.db import User
from app.tokens import verify


async def current_user(request: Request, authorization: str = Header(default="")) -> User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="처음부터 다시 시작해 주세요")
    user_id = verify(authorization.removeprefix("Bearer "), request.app.state.settings.app_secret)
    user = await request.app.state.db.get_active_user(user_id) if user_id else None
    if user is None:
        raise HTTPException(status_code=401, detail="처음부터 다시 시작해 주세요")
    return user


def client_ip(request: Request) -> str:
    # 배포(T20)에서는 Caddy 뒤라서 uvicorn --proxy-headers 로 실제 IP를 받는다
    return request.client.host if request.client else "unknown"
