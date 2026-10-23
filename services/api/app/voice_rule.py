"""목소리 바꾸기 규칙 (11 문서 4절, "평생 가져가는 목소리").

- 처음 고르기: 언제든
- 가입 후 24시간: 자유롭게 바꿈 (세지 않음)
- 그 뒤: 달력 기준 한 달에 한 번 (한국 시간). 이번 달에 바꿨으면 다음 달 1일부터
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))  # 한국은 서머타임이 없어 고정 +9 (tzdata 없이도 동작)
FREE_HOURS = 24


@dataclass(frozen=True)
class VoiceRule:
    can_change: bool
    free_until: datetime | None   # 이 시각까지는 자유 (가입 후 24시간)
    next_at: datetime | None      # 바꿀 수 없을 때, 다시 바꿀 수 있는 시각 (다음 달 1일 0시, 한국 시간)
    counts: bool                  # 지금 바꾸면 "한 달에 한 번"에 들어가는지


def _parse(stamp: str | None) -> datetime | None:
    if not stamp:
        return None
    t = datetime.fromisoformat(stamp)
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _next_month_start(t: datetime) -> datetime:
    k = t.astimezone(KST)
    year, month = (k.year + 1, 1) if k.month == 12 else (k.year, k.month + 1)
    return datetime(year, month, 1, tzinfo=KST)


def check(created_at: str, voice_id: str | None, voice_changed_at: str | None, now: datetime) -> VoiceRule:
    if voice_id is None:
        return VoiceRule(True, None, None, counts=False)
    free_until = _parse(created_at) + timedelta(hours=FREE_HOURS)
    if now < free_until:
        return VoiceRule(True, free_until, None, counts=False)
    last = _parse(voice_changed_at)
    if last is not None:
        k_now, k_last = now.astimezone(KST), last.astimezone(KST)
        if (k_now.year, k_now.month) == (k_last.year, k_last.month):
            return VoiceRule(False, free_until, _next_month_start(last), counts=True)
    return VoiceRule(True, free_until, None, counts=True)


def korean_date(t: datetime) -> str:
    k = t.astimezone(KST)
    return f"{k.month}월 {k.day}일"
