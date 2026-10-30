"""관리자 화면: 폰에서 GPU 주소 바꾸기 (비밀번호, 맞혀 보기 막기, 다시 켜도 유지)."""

import pytest

from app.routers import admin


@pytest.fixture
def admin_client(make_client):
    with make_client(ADMIN_PASSWORD="pw-123") as c:
        (c.app.state.settings.audio_dir.parent).mkdir(parents=True, exist_ok=True)
        yield c


def test_admin_is_off_without_password(client):
    assert client.get("/admin/tts", headers={"X-Admin": ""}).status_code == 404


def test_wrong_password_and_rate_limit(admin_client):
    codes = [admin_client.get("/admin/tts", headers={"X-Admin": "wrong"}).status_code for _ in range(6)]
    assert codes[:5] == [401] * 5 and codes[5] == 429


def test_set_pod_id_builds_runpod_url_and_persists(admin_client, monkeypatch):
    async def no_health(self):
        return None
    monkeypatch.setattr(admin_client.app.state.tts.pool.__class__, "check_health", no_health)
    h = {"X-Admin": "pw-123"}
    res = admin_client.post("/admin/tts", headers=h, json={"podId": "XvtLeffn8cz0nt"})
    assert res.status_code == 200
    assert res.json()["endpoints"] == [{"url": "https://xvtleffn8cz0nt-8001.proxy.runpod.net", "healthy": False}]
    assert admin.load_saved(admin_client.app.state.settings) == ["https://xvtleffn8cz0nt-8001.proxy.runpod.net"]
    # 잘못된 값은 거절, 빈 값은 GPU 끊기
    assert admin_client.post("/admin/tts", headers=h, json={"podId": "bad id!"}).status_code == 400
    assert admin_client.post("/admin/tts", headers=h, json={"url": "http://evil"}).status_code == 400
    assert admin_client.post("/admin/tts", headers=h, json={}).json()["endpoints"] == []
