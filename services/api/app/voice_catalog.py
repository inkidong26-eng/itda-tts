"""음성 목록 파일 읽기와 추천 규칙 (02 문서 S4, 03 문서 6절)."""

import json
from pathlib import Path

from app.db import Voice

AGE_GROUPS = ["10s", "20s", "30s", "40s", "50s", "60s", "70s"]


def load_voices_file(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def to_api(v: Voice) -> dict:
    return {
        "id": v.id, "name": v.name, "ageGroup": v.age_group, "gender": v.gender,
        "description": v.description, "tags": json.loads(v.tags or "[]"),
        "previewUrl": v.preview_url, "waveUrl": v.wave_url,
        "card": json.loads(v.card) if v.card else None,
    }


def recommend(voices: list[Voice], age_group: str, gender: str, count: int = 3) -> list[Voice]:
    """같은 나이대·성별 우선, 모자라면 인접 나이대(같은 성별), 그래도 모자라면 다른 성별에서 채운다."""
    target = AGE_GROUPS.index(age_group)

    def order(v: Voice) -> tuple:
        distance = abs(AGE_GROUPS.index(v.age_group) - target)
        return (v.gender != gender, distance, AGE_GROUPS.index(v.age_group), v.id)

    return sorted(voices, key=order)[:count]
