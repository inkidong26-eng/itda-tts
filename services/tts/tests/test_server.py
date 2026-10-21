import io

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

import server

KEY = "test-key"


class FakeEngine:
    gpu = "fake"

    def __init__(self):
        self.calls = []

    def design(self, description, text, seed):
        self.calls.append((description, text, seed))
        return np.zeros(2400, dtype=np.float32), 24000


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("TTS_KEY", KEY)
    fake = FakeEngine()
    monkeypatch.setattr(server, "engine", fake)
    with TestClient(server.app) as c:
        c.fake = fake
        yield c


def test_missing_key_is_rejected(client):
    res = client.post("/synthesize", json={"description": "a", "text": "b"})
    assert res.status_code == 401


def test_wrong_key_is_rejected(client):
    res = client.get("/health", headers={"X-Key": "wrong"})
    assert res.status_code == 401


def test_health_reports_ready(client):
    res = client.get("/health", headers={"X-Key": KEY})
    assert res.status_code == 200
    assert res.json() == {"ready": True, "gpu": "fake", "inFlight": 0}


def test_synthesize_returns_wav(client):
    res = client.post(
        "/synthesize",
        headers={"X-Key": KEY},
        json={"mode": "design", "description": "20대 여성", "text": "안녕하세요", "seed": 7},
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/wav"
    audio, sr = sf.read(io.BytesIO(res.content))
    assert sr == 24000 and len(audio) == 2400
    assert client.fake.calls == [("20대 여성", "안녕하세요", 7)]


def test_unknown_mode_is_rejected(client):
    res = client.post(
        "/synthesize",
        headers={"X-Key": KEY},
        json={"mode": "clone", "description": "a", "text": "b"},
    )
    assert res.status_code == 422


def test_too_long_text_is_rejected(client):
    res = client.post(
        "/synthesize",
        headers={"X-Key": KEY},
        json={"description": "a", "text": "가" * 201},
    )
    assert res.status_code == 422


def test_server_refuses_to_start_without_key(monkeypatch):
    monkeypatch.delenv("TTS_KEY", raising=False)
    monkeypatch.setattr(server, "engine", FakeEngine())
    with pytest.raises(RuntimeError):
        with TestClient(server.app):
            pass
