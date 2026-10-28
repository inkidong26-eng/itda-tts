import io
import json

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

import server
from engine import load_references

KEY = "test-key"


class FakeEngine:
    gpu = "fake"
    voices = ["v20f1", "v50m1"]

    def __init__(self):
        self.calls = []

    def clone(self, voice_id, emotion, text, seed):
        self.calls.append((voice_id, emotion, text, seed))
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
    res = client.post("/synthesize", json={"voiceId": "v20f1", "text": "b"})
    assert res.status_code == 401


def test_wrong_key_is_rejected(client):
    res = client.get("/health", headers={"X-Key": "wrong"})
    assert res.status_code == 401


def test_health_reports_ready(client):
    res = client.get("/health", headers={"X-Key": KEY})
    assert res.status_code == 200
    assert res.json() == {"ready": True, "gpu": "fake", "inFlight": 0, "voices": 2}


def test_synthesize_with_api_payload_returns_wav(client):
    # API 서버(api/app/speech.py)가 보내는 모양 그대로
    payload = {"voiceId": "v20f1", "emotion": "joy", "intensity": 2, "tremor": 0, "text": "안녕하세요", "seed": 7}
    res = client.post("/synthesize", headers={"X-Key": KEY}, json=payload)
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/wav"
    audio, sr = sf.read(io.BytesIO(res.content))
    assert sr == 24000 and len(audio) == 2400
    assert client.fake.calls == [("v20f1", "joy", "안녕하세요", 7)]


def test_unknown_voice_is_404_not_5xx(client):
    # 4xx 이면 API 서버가 GPU를 고장으로 표시하지 않고 폰 기본 목소리로 넘긴다
    res = client.post("/synthesize", headers={"X-Key": KEY}, json={"voiceId": "v99x9", "text": "안녕"})
    assert res.status_code == 404


def test_bad_emotion_and_long_text_are_rejected(client):
    h = {"X-Key": KEY}
    assert client.post("/synthesize", headers=h, json={"voiceId": "v20f1", "emotion": "happy", "text": "a"}).status_code == 422
    assert client.post("/synthesize", headers=h, json={"voiceId": "v20f1", "text": "가" * 401}).status_code == 422


def test_warmup_uses_a_loaded_voice(client):
    res = client.post("/warmup", headers={"X-Key": KEY})
    assert res.json()["voices"] == 2 and client.fake.calls[0][:2] == ("v20f1", "calm")


def test_server_refuses_to_start_without_key(monkeypatch):
    monkeypatch.delenv("TTS_KEY", raising=False)
    monkeypatch.setattr(server, "engine", FakeEngine())
    with pytest.raises(RuntimeError):
        with TestClient(server.app):
            pass


def test_load_references_skips_excluded_voices(tmp_path):
    for vid, approved in (("v20f1", True), ("v50m1", False), ("v30f1", None)):
        d = tmp_path / vid
        d.mkdir()
        meta = {"id": vid, "emotions": {"calm": {"text": "안녕하세요"}, "joy": {"text": "와"}}}
        if approved is not None:
            meta["approved"] = approved
        (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        sf.write(d / "calm.wav", np.zeros(2400, dtype=np.float32), 24000)
    refs = load_references(tmp_path)
    # 제외(❌)는 빠지고, 아직 검수 전(None)은 쓸 수 있게, 파일이 없는 감정(joy)은 없음
    assert sorted(refs) == [("v20f1", "calm"), ("v30f1", "calm")]
    assert refs[("v20f1", "calm")][2] == "안녕하세요"
