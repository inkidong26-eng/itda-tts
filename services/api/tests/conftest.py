import json
import os

import pytest
from fastapi.testclient import TestClient

# app.main 을 불러오기 전에 필요한 환경 변수 (비밀키 없으면 서버가 시작되지 않음)
os.environ.setdefault("APP_SECRET", "test-secret")

from app.main import create_app  # noqa: E402

VOICES = [
    {"id": "v10f1", "name": "이슬", "ageGroup": "10s", "gender": "f", "approved": True, "tags": ["맑음"]},
    {"id": "v20f1", "name": "봄볕", "ageGroup": "20s", "gender": "f", "approved": True, "tags": ["밝음"],
     "card": {"easy": "밝고 또렷해요."}},
    {"id": "v20f2", "name": "미승인", "ageGroup": "20s", "gender": "f", "approved": False},
    {"id": "v30f1", "name": "단비", "ageGroup": "30s", "gender": "f", "approved": True},
    {"id": "v40f1", "name": "가람", "ageGroup": "40s", "gender": "f", "approved": True},
    {"id": "v20m1", "name": "햇살", "ageGroup": "20s", "gender": "m", "approved": True},
    {"id": "v70m1", "name": "큰산", "ageGroup": "70s", "gender": "m", "approved": True},
]


@pytest.fixture
def make_client(tmp_path, monkeypatch):
    """설정을 바꿔 가며 새 서버를 만든다 (테스트마다 빈 DB)."""
    def _make(**env):
        voices_path = tmp_path / "voices.json"
        voices_path.write_text(json.dumps(VOICES, ensure_ascii=False), encoding="utf-8")
        monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{(tmp_path / 'test.db').as_posix()}")
        monkeypatch.setenv("VOICES_JSON", str(voices_path))
        monkeypatch.setenv("ALLOWED_ORIGIN", "https://itda.gyeot.ai.kr")
        for key, value in env.items():
            monkeypatch.setenv(key, value)
        return TestClient(create_app())
    return _make


@pytest.fixture
def client(make_client):
    with make_client() as c:
        yield c


def signup(client, name="홍길동", age="20s", gender="f"):
    res = client.post("/auth/guest", json={"name": name, "ageGroup": age, "gender": gender, "consent": True})
    assert res.status_code == 200, res.text
    return res.json()


def auth(token):
    return {"Authorization": f"Bearer {token}"}
