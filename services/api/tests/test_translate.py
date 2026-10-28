"""POST /translate (11 문서 5절): DeepL 로 보내고, 실패·키 없음이면 503 (화면은 원문으로 계속)."""

import httpx
import pytest

from app.routers import translate as tr
from tests.conftest import auth, signup


class FakeDeepL:
    def __init__(self, status=200, body=None):
        self.status, self.body, self.sent = status, body or {"translations": [{"text": "Hello"}]}, []

    def __call__(self, *args, **kwargs):
        fake = self

        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def post(self, url, headers=None, data=None):
                fake.sent.append((url, headers, data))
                return httpx.Response(fake.status, json=fake.body, request=httpx.Request("POST", url))

        return Client()


@pytest.fixture
def with_key(client):
    client.app.state.settings = client.app.state.settings.__class__(
        **{**client.app.state.settings.__dict__, "deepl_key": "test:fx"})
    return client


def test_translates_with_deepl_codes(with_key, monkeypatch):
    fake = FakeDeepL()
    monkeypatch.setattr(tr.httpx, "AsyncClient", fake)
    h = auth(signup(with_key)["token"])
    res = with_key.post("/translate", headers=h, json={"text": "안녕하세요", "source": "ko", "target": "en"})
    assert res.status_code == 200 and res.json() == {"text": "Hello"}
    url, headers, data = fake.sent[0]
    assert headers["Authorization"] == "DeepL-Auth-Key test:fx"
    assert data == {"text": "안녕하세요", "source_lang": "KO", "target_lang": "EN-US"}


def test_same_language_skips_deepl(with_key, monkeypatch):
    fake = FakeDeepL()
    monkeypatch.setattr(tr.httpx, "AsyncClient", fake)
    h = auth(signup(with_key)["token"])
    assert with_key.post("/translate", headers=h, json={"text": "안녕", "source": "ko", "target": "ko"}).json() == {"text": "안녕"}
    assert fake.sent == []


def test_no_key_or_deepl_error_is_503(client, with_key, monkeypatch):
    h = auth(signup(client)["token"])
    body = {"text": "안녕", "source": "ko", "target": "ja"}
    monkeypatch.setattr(tr.httpx, "AsyncClient", FakeDeepL(status=456))  # 이번 달 무료 글자 다 씀
    assert with_key.post("/translate", headers=h, json=body).status_code == 503


def test_requires_login_and_valid_input(client):
    assert client.post("/translate", json={"text": "a", "source": "ko", "target": "en"}).status_code == 401
    h = auth(signup(client)["token"])
    assert client.post("/translate", headers=h, json={"text": "a", "source": "ko", "target": "fr"}).status_code == 422
    assert client.post("/translate", headers=h, json={"text": "가" * 301, "source": "ko", "target": "en"}).status_code == 422
    # 키가 없으면 503
    assert client.post("/translate", headers=h, json={"text": "a", "source": "ko", "target": "en"}).status_code == 503
