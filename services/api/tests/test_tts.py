"""/tts 파이프라인 시험. GPU 서버는 가짜(FakeGpu)이거나 아예 없다 — 진짜 GPU 없이 모두 통과해야 한다."""

import asyncio
import time

import pytest

from app.tts_client import TtsPool
from tests.conftest import auth, signup
from tests.fake_tts import FakeGpu

FAST = {"TTS_START_TIMEOUT_MS": "300", "TTS_TOTAL_TIMEOUT_MS": "800", "TTS_MAX_CONCURRENCY": "1"}


def use_gpu(client, gpu: FakeGpu, concurrency: int = 1) -> None:
    """서버 안의 GPU 연결을 가짜 GPU로 바꾼다."""
    settings = client.app.state.settings
    client.app.state.tts.pool = TtsPool(["http://fake-gpu"], settings.tts_key, concurrency, 30, gpu.transport())


def say(client, token, text="OK 3시에 봐요", voice="v20f1"):
    return client.post("/tts", json={"text": text, "voiceId": voice}, headers=auth(token))


@pytest.fixture
def fast(make_client):
    with make_client(TTS_KEY="k", **FAST) as c:
        c.token = signup(c)["token"]
        yield c


def test_no_gpu_server_falls_back_immediately(fast):
    started = time.perf_counter()
    res = say(fast, fast.token).json()
    assert res == {"url": None, "durationMs": None, "cached": False, "fallback": True,
                   "displayText": "오케이 세 시에 봐요"}
    assert time.perf_counter() - started < 1


def test_success_then_cached(fast):
    gpu = FakeGpu()
    use_gpu(fast, gpu)
    first = say(fast, fast.token).json()
    assert first["fallback"] is False and first["cached"] is False
    assert first["durationMs"] == 500 and first["displayText"] == "오케이 세 시에 봐요"
    second = say(fast, fast.token).json()
    assert second["cached"] is True and second["url"] == first["url"]
    assert len(gpu.calls) == 1  # 두 번째는 GPU를 부르지 않음
    assert gpu.calls[0] == {"voiceId": "v20f1", "emotion": "calm", "intensity": 2, "tremor": 0,
                            "text": "오케이 세 시에 봐요", "seed": 1}
    assert gpu.keys[0] == "k"  # 비밀키를 보낸다
    audio = fast.get(first["url"])
    assert audio.status_code == 200 and audio.content[:4] == b"RIFF"


def test_gpu_off_falls_back_within_3_seconds(fast):
    use_gpu(fast, FakeGpu(down=True))
    started = time.perf_counter()
    assert say(fast, fast.token).json()["fallback"] is True
    assert time.perf_counter() - started < 3
    # 고장 난 서버는 빼 두므로 다음 요청은 기다리지 않고 바로 비상 전환
    started = time.perf_counter()
    assert say(fast, fast.token, "다른 문장").json()["fallback"] is True
    assert time.perf_counter() - started < 0.5


def test_gpu_error_falls_back(fast):
    use_gpu(fast, FakeGpu(fail=True))
    assert say(fast, fast.token).json()["fallback"] is True


def test_slow_gpu_falls_back_but_keeps_generating(fast):
    use_gpu(fast, FakeGpu(delay_s=1.2))
    started = time.perf_counter()
    res = say(fast, fast.token).json()
    took = time.perf_counter() - started
    assert res["fallback"] is True and 0.7 < took < 1.2  # 총 제한(0.8초)에 맞춰 답한다
    time.sleep(1.0)  # 뒤에서 생성이 끝나 캐시에 들어갈 시간
    again = say(fast, fast.token).json()
    assert again["cached"] is True and again["fallback"] is False


@pytest.mark.parametrize("text,detail", [("가" * 101, "100자까지 보낼 수 있어요"), ("   ", "보낼 글을 적어 주세요"),
                                         ("😊😊", "읽을 글자가 없어요")])
def test_bad_text(fast, text, detail):
    res = say(fast, fast.token, text)
    assert res.status_code == 400 and res.json()["detail"] == detail


def test_exactly_100_chars_is_ok(fast):
    assert say(fast, fast.token, "가" * 100).status_code == 200


def test_unknown_voice_and_no_token(fast):
    assert say(fast, fast.token, voice="nope").status_code == 400
    assert fast.post("/tts", json={"text": "안녕", "voiceId": "v20f1"}).status_code == 401


def test_rate_limit_per_user(make_client):
    with make_client(TTS_LIMIT_PER_MIN="2") as c:
        token = signup(c)["token"]
        assert say(c, token).status_code == 200
        assert say(c, token).status_code == 200
        assert say(c, token).status_code == 429


def test_events_have_no_text(fast):
    use_gpu(fast, FakeGpu())
    say(fast, fast.token, "비밀 문장이에요")
    say(fast, fast.token, "비밀 문장이에요")
    events = asyncio.run(fast.app.state.db.events())
    assert [(e.type, e.fallback) for e in events] == [("tts", 0), ("tts_cached", 0)]
    assert set(events[0].__table__.columns.keys()) == {"id", "type", "ms", "fallback", "created_at"}


def test_warmup_and_status(fast):
    assert fast.post("/tts/warmup").json() == {"state": "off"}
    use_gpu(fast, FakeGpu())
    assert fast.post("/tts/warmup").json() == {"state": "ready"}
    status = fast.get("/tts/status").json()
    assert set(status) == {"state", "queue", "avgMs"} and status["state"] == "ready"


def test_warmup_runs_at_most_once_a_minute(fast):
    gpu = FakeGpu()
    use_gpu(fast, gpu)
    for _ in range(5):
        assert fast.post("/tts/warmup").json() == {"state": "ready"}
    time.sleep(0.2)
    assert gpu.warmups == 1  # 여러 번 눌러도 GPU 는 한 번만 깨운다


def test_long_spoken_text_is_allowed_by_gpu_server_limit():
    # 화면 100자 → 읽기 변환 뒤에도 GPU 서버 한도(400자) 안
    from app.text_normalize import normalize
    assert len(normalize("9% " * 33)) <= 400


def test_warmup_reports_warming_when_gpu_down(fast):
    use_gpu(fast, FakeGpu(down=True))
    assert fast.post("/tts/warmup").json() == {"state": "warming"}


def test_health_hides_gpu_address(fast):
    use_gpu(fast, FakeGpu())
    body = fast.get("/health").text
    assert "fake-gpu" not in body
