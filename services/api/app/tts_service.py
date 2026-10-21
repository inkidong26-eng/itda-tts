"""/tts 처리 순서 (07 문서 5절). 핵심 약속: 어떤 경우에도 정해진 시간 안에 답한다.
GPU가 늦거나 꺼져 있으면 fallback:true → 폰이 기본 음성으로 바로 읽는다 (무음 금지).
"""

import asyncio
import logging
import time
from collections import deque

import httpx

from app.audio_convert import to_mp3, wav_duration_ms
from app.cache import AudioCache
from app.tts_client import NoServer, QueueTimeout, TtsPool

log = logging.getLogger("itda.tts")


class TtsService:
    def __init__(self, pool: TtsPool, cache: AudioCache, start_timeout_s: float, total_timeout_s: float) -> None:
        self.pool = pool
        self.cache = cache
        self.start_timeout_s = start_timeout_s
        self.total_timeout_s = total_timeout_s
        self._inflight: dict[str, asyncio.Task] = {}  # 같은 문장을 동시에 두 번 만들지 않게
        self._recent_ms: deque[int] = deque(maxlen=50)

    @property
    def avg_ms(self) -> int:
        return int(sum(self._recent_ms) / len(self._recent_ms)) if self._recent_ms else 0

    async def speak(self, key: str, payload: dict, display_text: str) -> dict:
        started = time.perf_counter()
        hit = await self.cache.lookup(key)
        if hit:
            name, duration = hit
            return self._ok(name, duration, cached=True, display_text=display_text)
        if self.pool.state != "ready":
            return self._fallback(display_text)

        task = self._inflight.get(key)
        if task is None:
            task = asyncio.create_task(self._generate(key, payload))
            self._inflight[key] = task
            task.add_done_callback(lambda t, k=key: self._finished(k, t))

        remaining = self.total_timeout_s - (time.perf_counter() - started)
        try:
            # shield: 시간이 지나도 생성은 계속해서 캐시에 넣는다
            name, duration = await asyncio.wait_for(asyncio.shield(task), max(0.05, remaining))
        except (asyncio.TimeoutError, QueueTimeout, NoServer, httpx.HTTPError, OSError):
            return self._fallback(display_text)
        return self._ok(name, duration, cached=False, display_text=display_text)

    async def _generate(self, key: str, payload: dict) -> tuple[str, int]:
        started = time.perf_counter()
        wav = await self.pool.synthesize(payload, wait_s=self.start_timeout_s)
        duration = wav_duration_ms(wav)
        data, ext = await to_mp3(wav)
        name = f"{key}.{ext}"
        await self.cache.put(key, name, data, duration)
        self._recent_ms.append(int((time.perf_counter() - started) * 1000))
        return name, duration

    def _finished(self, key: str, task: asyncio.Task) -> None:
        self._inflight.pop(key, None)
        if not task.cancelled() and task.exception() is not None:
            # 아무도 기다리지 않는 실패도 여기서 받아 둔다 (경고가 쌓이지 않게). 글 내용은 남기지 않음
            log.info("tts generate failed: %s", type(task.exception()).__name__)

    def _ok(self, name: str, duration: int, cached: bool, display_text: str) -> dict:
        return {"url": self.cache.storage.url(name), "durationMs": duration, "cached": cached,
                "fallback": False, "displayText": display_text}

    @staticmethod
    def _fallback(display_text: str) -> dict:
        return {"url": None, "durationMs": None, "cached": False, "fallback": True, "displayText": display_text}
