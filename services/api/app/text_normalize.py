"""TTS에 보내기 전 글을 한국어 읽기로 바꾼다 (03 문서 7절).

- 외래어·줄임말: data/loanwords.tsv (추가는 파일에만)
- 숫자: 3시 → 세 시, 5,000원 → 오천 원, 2026년 → 이천이십육 년, 010-1234-5678 → 공일공 일이삼사 오육칠팔
- 이모지·ㅋㅋ·ㅠㅠ·^^ 는 읽지 않는다 (감정 단서로만). 'ㅋㅋ' 만 보내면 '하하'.
"""

import re
import unicodedata
from functools import lru_cache
from pathlib import Path

LOANWORDS_FILE = Path(__file__).parent / "data" / "loanwords.tsv"

DIGITS = "영일이삼사오육칠팔구"
PHONE_DIGITS = "공일이삼사오육칠팔구"
NATIVE_ONES = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"]
NATIVE_TENS = ["", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔"]

# 고유어(한, 두, 세…)로 읽는 단위 — 긴 것부터 맞춘다
NATIVE_UNITS = ["시간", "그릇", "켤레", "군데", "가지", "송이", "마리", "번째", "시", "개", "명", "살", "잔", "권", "장", "대", "병", "벌", "달"]
# 한자어(일, 이, 삼…)로 읽는 단위
SINO_UNITS = ["개월", "퍼센트", "년", "월", "일", "원", "분", "초", "층", "호", "번", "회", "주", "도", "점", "세"]
SYMBOL_UNITS = {
    "%": "퍼센트", "kg": "킬로그램", "km": "킬로미터", "cm": "센티미터", "mm": "밀리미터",
    "ml": "밀리리터", "m": "미터", "g": "그램", "L": "리터",
}

EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️‍⬀-⯿]")
LAUGH_ONLY = re.compile(r"^[ㅋㅎ\s]+$")
NOISE = re.compile(r"[ㅋㅎ]{2,}|[ㅠㅜ]+|\^\^+")


def sino(n: int) -> str:
    """한자어 수: 12345 → 만이천삼백사십오"""
    if n == 0:
        return "영"
    parts = []
    for unit_index, big in enumerate(["", "만", "억", "조"]):
        group = n // (10000 ** unit_index) % 10000
        if not group:
            continue
        text = ""
        for place, small in ((1000, "천"), (100, "백"), (10, "십"), (1, "")):
            d = group // place % 10
            if d:
                text += ("" if d == 1 and small else DIGITS[d]) + small
        if big == "만" and group == 1:
            text = ""  # 일만 → 만
        parts.append(text + big)
    return "".join(reversed(parts))


def native(n: int) -> str | None:
    """고유어 수 (단위 앞): 1 → 한, 20 → 스무, 21 → 스물한. 1–99만."""
    if not 1 <= n <= 99:
        return None
    if n == 20:
        return "스무"
    return NATIVE_TENS[n // 10] + NATIVE_ONES[n % 10]


def read_decimal(text: str) -> str:
    whole, _, frac = text.partition(".")
    return f"{sino(int(whole))} 점 {''.join(DIGITS[int(c)] for c in frac)}"


def read_number_with_unit(number: str, unit: str) -> str:
    number = number.replace(",", "")
    if "." in number:
        spoken = read_decimal(number)
    else:
        n = int(number)
        if unit == "번째" and n == 1:
            return "첫 번째"
        if unit == "월" and n in (6, 10):
            return {6: "유월", 10: "시월"}[n]
        spoken = (native(n) if unit in NATIVE_UNITS else None) or sino(n)
    unit_spoken = SYMBOL_UNITS.get(unit, unit)
    return f"{spoken} {unit_spoken}" if unit_spoken else spoken


@lru_cache(maxsize=1)
def _loanword_rules() -> list[tuple[re.Pattern, str]]:
    pairs = []
    for line in LOANWORDS_FILE.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#") or "\t" not in line:
            continue
        src, dst = line.split("\t", 1)
        pairs.append((src.strip(), dst.strip()))
    pairs.sort(key=lambda p: len(p[0]), reverse=True)  # 긴 말부터 (KakaoTalk 이 Kakao 보다 먼저)
    rules = []
    for src, dst in pairs:
        if re.search(r"[A-Za-z0-9]", src):
            # 영문은 앞뒤가 영문·숫자가 아닐 때만 (5kg 의 kg, okay 안의 ok 는 건드리지 않음).
            # 대문자 약어(IT, ID)·숫자 포함(5G)은 대소문자까지 같을 때만 (it, 5g 와 헷갈리지 않게)
            exact = src.isupper() or any(c.isdigit() for c in src)
            pattern = re.compile(rf"(?<![A-Za-z0-9]){re.escape(src)}(?![A-Za-z0-9])", 0 if exact else re.IGNORECASE)
        else:
            pattern = re.compile(re.escape(src))
        rules.append((pattern, dst))
    return rules


UNIT_ALT = "|".join(re.escape(u) for u in sorted(NATIVE_UNITS + SINO_UNITS + list(SYMBOL_UNITS), key=len, reverse=True))
PHONE = re.compile(r"(?<!\d)(0\d{1,2})-(\d{3,4})-(\d{4})(?!\d)")
CLOCK = re.compile(r"(?<!\d)(\d{1,2}):(\d{2})(?!\d)")
NUMBER = re.compile(rf"(\d{{1,3}}(?:,\d{{3}})+|\d+(?:\.\d+)?)\s?({UNIT_ALT})?")


def _phone(m: re.Match) -> str:
    return " ".join("".join(PHONE_DIGITS[int(c)] for c in g) for g in m.groups())


def _clock(m: re.Match) -> str:
    hour, minute = int(m.group(1)), int(m.group(2))
    spoken = read_number_with_unit(str(hour), "시")
    return spoken + (f" {sino(minute)} 분" if minute else "")


def _number(m: re.Match) -> str:
    return read_number_with_unit(m.group(1), m.group(2) or "")


def normalize(text: str) -> str:
    """읽을 글을 돌려준다. 읽을 것이 없으면 빈 문자열."""
    text = unicodedata.normalize("NFC", text).strip()
    if LAUGH_ONLY.match(text) and re.search(r"[ㅋㅎ]{2,}", text):
        return "하하"
    text = EMOJI.sub(" ", text)
    for pattern, spoken in _loanword_rules():
        text = pattern.sub(spoken, text)
    text = NOISE.sub(" ", text)
    text = PHONE.sub(_phone, text)
    text = CLOCK.sub(_clock, text)
    text = NUMBER.sub(_number, text)
    return re.sub(r"\s+", " ", text).strip()
