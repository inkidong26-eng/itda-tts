"""GPU TTS 서버 여러 대에 나눠 보내기 (07 문서 5절 3번).
- 가장 한가한 서버로, 서버당 동시 처리 수 제한 (TTS_MAX_CONCURRENCY)
- 실패한 서버는 빼고, 10초마다 /health 로 다시 확인
- 차례(빈자리)를 정해진 시간 안에 못 받으면 QueueTimeout → 부른 쪽이 비상 음성으로 전환
"""

import asyncio
import logging
import time

import httpx

log = logging.getLogger("itda.tts")
HEALTH_EVERY_S = 10
WARMUP_EVERY_S = 60  # 누가 몇 번을 눌러도 GPU 깨우기는 1분에 한 번만


class NoServer(Exception):
    """쓸 수 있는 TTS 서버가 없음"""


class QueueTimeout(Exception):
    """GPU 차례를 시간 안에 못 받음"""


class Endpoint:
    def __init__(self, url: str, concurrency: int) -> None:
        self.url = url
        self.slots = asyncio.Semaphore(concurrency)
        self.healthy = True  # 처음에는 믿고, 첫 실패나 health 확인에서 바로잡는다
        self.active = 0      # 기다리는 중 + 만드는 중


class TtsPool:
    def __init__(self, urls: list[str], key: str, concurrency: int, request_timeout_s: float,
                 transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.concurrency = concurrency
        self.endpoints = [Endpoint(u, concurrency) for u in urls]
        self.key = key
        self.request_timeout_s = request_timeout_s
        self._client = httpx.AsyncClient(transport=transport, headers={"X-Key": key})
        self._health_task: asyncio.Task | None = None
        self._last_warmup = 0.0

    async def start(self) -> None:
        # 주소가 없어도 확인은 돈다: 관리자 화면에서 나중에 GPU 주소를 넣을 수 있다
        self._health_task = asyncio.create_task(self._health_loop())

    def set_urls(self, urls: list[str]) -> None:
        """GPU 주소 바꾸기 (관리자 화면). 새 서버는 확인 전까지 쓰지 않는다 (켜지는 중일 수 있음)"""
        fresh = []
        for url in urls:
            ep = Endpoint(url, self.concurrency)
            ep.healthy = False
            fresh.append(ep)
        self.endpoints = fresh

    async def close(self) -> None:
        if self._health_task:
            self._health_task.cancel()
        await self._client.aclose()

    @property
    def state(self) -> str:
        if not self.endpoints:
            return "off"
        return "ready" if any(e.healthy for e in self.endpoints) else "warming"

    def queue_len(self) -> int:
        return sum(e.active for e in self.endpoints)

    def _pick(self) -> Endpoint:
        alive = [e for e in self.endpoints if e.healthy]
        if not alive:
            raise NoServer()
        return min(alive, key=lambda e: e.active)

    async def synthesize(self, payload: dict, wait_s: float) -> bytes:
        ep = self._pick()
        ep.active += 1
        try:
            try:
                await asyncio.wait_for(ep.slots.acquire(), wait_s)
            except asyncio.TimeoutError:
                raise QueueTimeout() from None
            try:
                res = await self._client.post(
                    f"{ep.url}/synthesize", json=payload,
                    timeout=httpx.Timeout(self.request_timeout_s, connect=1.5))
                res.raise_for_status()
                return res.content
            except httpx.HTTPStatusError as err:
                # 4xx 는 이 요청만의 문제 (글이 너무 길다 등) → 서버는 계속 쓴다. 5xx 만 고장으로 본다
                if err.response.status_code >= 500:
                    ep.healthy = False
                    log.warning("tts server error %d, marked down", err.response.status_code)
                raise
            except httpx.HTTPError:
                ep.healthy = False  # 연결 실패·시간 초과: 다음 health 확인까지 이 서버는 빼고 보낸다
                log.warning("tts server unreachable, marked down")
                raise
            finally:
                ep.slots.release()
        finally:
            ep.active -= 1

    async def check_health(self) -> None:
        async def one(ep: Endpoint) -> None:
            try:
                res = await self._client.get(f"{ep.url}/health", timeout=2)
                ep.healthy = res.status_code == 200 and bool(res.json().get("ready"))
            except (httpx.HTTPError, ValueError):
                ep.healthy = False
        await asyncio.gather(*(one(e) for e in self.endpoints))

    def warmup_due(self) -> bool:
        """마지막 깨우기에서 1분이 지났으면 True (그리고 지금을 기록)"""
        now = time.monotonic()
        if now - self._last_warmup < WARMUP_EVERY_S:
            return False
        self._last_warmup = now
        return True

    async def warmup(self) -> None:
        """살아 있는 서버를 미리 깨운다. 실패해도 조용히."""
        async def one(ep: Endpoint) -> None:
            try:
                await self._client.post(f"{ep.url}/warmup", timeout=60)
            except httpx.HTTPError:
                pass
        await asyncio.gather(*(one(e) for e in self.endpoints if e.healthy))

    async def _health_loop(self) -> None:
        while True:
            try:
                await self.check_health()
            except Exception as err:  # 한 번의 뜻밖의 오류로 확인이 영영 멈추지 않게
                log.warning("health check error: %s", type(err).__name__)
            await asyncio.sleep(HEALTH_EVERY_S)
