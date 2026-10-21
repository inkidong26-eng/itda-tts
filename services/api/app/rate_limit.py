"""요청 제한은 이 파일에서만 (07 문서 8·10절). 지금은 서버 메모리, 서버를 여러 대로 늘리면 Redis로 바꾼다."""

import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, clock=time.monotonic) -> None:
        self._clock = clock
        self._hits: dict[str, deque] = defaultdict(deque)

    def allow(self, key: str, limit: int, window_sec: float = 60) -> bool:
        now = self._clock()
        hits = self._hits[key]
        while hits and hits[0] <= now - window_sec:
            hits.popleft()
        if len(hits) >= limit:
            return False
        hits.append(now)
        return True
