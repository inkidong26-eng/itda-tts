"""게스트 토큰: 서버 비밀키로 서명한 문자열. 서버 메모리에 로그인 상태를 두지 않는다 (07 문서 8·10절)."""

import base64
import hashlib
import hmac
import time


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sig(body: str, secret: str) -> str:
    return _b64(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())


def sign(user_id: str, secret: str, days: int, now: float | None = None) -> str:
    expires = int((time.time() if now is None else now) + days * 86400)
    body = _b64(f"{user_id}:{expires}".encode())
    return f"{body}.{_sig(body, secret)}"


def verify(token: str, secret: str, now: float | None = None) -> str | None:
    """맞는 토큰이면 사용자 id, 아니면 None."""
    try:
        body, sig = token.split(".", 1)
        if not hmac.compare_digest(sig, _sig(body, secret)):
            return None
        user_id, expires = _unb64(body).decode().split(":", 1)
        if int(expires) < (time.time() if now is None else now):
            return None
        return user_id
    except (ValueError, UnicodeDecodeError):
        return None
