"""가짜 GPU TTS 서버 (테스트용). 늦게 답하기·끊기기·실패를 흉내 낸다."""

import asyncio
import io
import wave

import httpx


def tiny_wav(ms: int = 500, rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * int(rate * ms / 1000))
    return buf.getvalue()


class FakeGpu:
    def __init__(self, delay_s: float = 0.0, fail: bool = False, down: bool = False) -> None:
        self.delay_s = delay_s
        self.fail = fail
        self.down = down
        self.calls: list[dict] = []
        self.keys: list[str] = []

    async def handler(self, request: httpx.Request) -> httpx.Response:
        if self.down:
            raise httpx.ConnectError("gpu off", request=request)
        self.keys.append(request.headers.get("X-Key", ""))
        path = request.url.path
        if path == "/health":
            return httpx.Response(200, json={"ready": True, "gpu": "fake", "inFlight": 0})
        if path == "/warmup":
            return httpx.Response(200, json={"ready": True, "ms": 1})
        if path == "/synthesize":
            import json
            self.calls.append(json.loads(request.content))
            await asyncio.sleep(self.delay_s)
            if self.fail:
                return httpx.Response(500)
            return httpx.Response(200, content=tiny_wav(), headers={"content-type": "audio/wav"})
        return httpx.Response(404)

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handler)
