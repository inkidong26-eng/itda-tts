import logging

import pytest

from app import tokens
from tests.conftest import auth, signup


def test_signup_returns_user_and_token(client):
    data = signup(client)
    assert len(data["userId"]) == 32 and data["token"]


@pytest.mark.parametrize("name", ["김", "a" * 21, "홍길동123", "<script>", ""])
def test_bad_names_are_rejected(client, name):
    res = client.post("/auth/guest", json={"name": name, "ageGroup": "20s", "gender": "f", "consent": True})
    assert res.status_code == 422


def test_consent_is_required(client):
    res = client.post("/auth/guest", json={"name": "홍길동", "ageGroup": "20s", "gender": "f", "consent": False})
    assert res.status_code == 422


@pytest.mark.parametrize("field,value", [("ageGroup", "80s"), ("gender", "x")])
def test_bad_age_or_gender_is_rejected(client, field, value):
    body = {"name": "홍길동", "ageGroup": "20s", "gender": "f", "consent": True, field: value}
    assert client.post("/auth/guest", json=body).status_code == 422


def test_signup_rate_limit_per_ip(make_client):
    with make_client(SIGNUP_LIMIT_PER_MIN="3") as c:
        for _ in range(3):
            signup(c)
        res = c.post("/auth/guest", json={"name": "홍길동", "ageGroup": "20s", "gender": "f", "consent": True})
        assert res.status_code == 429
        assert res.json()["detail"] == "잠시 후 다시 보내 주세요"


def test_name_is_not_logged(client, caplog):
    with caplog.at_level(logging.DEBUG):
        signup(client, name="비밀이름")
    assert "비밀이름" not in caplog.text


def test_me_requires_token(client):
    assert client.patch("/me", json={"speed": 1.2}).status_code == 401
    assert client.patch("/me", json={"speed": 1.2}, headers=auth("garbage")).status_code == 401


def test_tampered_or_expired_token_is_rejected(client):
    data = signup(client)
    assert client.patch("/me", json={}, headers=auth(data["token"] + "x")).status_code == 401
    expired = tokens.sign(data["userId"], "test-secret", days=1, now=0)
    assert client.patch("/me", json={}, headers=auth(expired)).status_code == 401
    other_secret = tokens.sign(data["userId"], "other-secret", days=30)
    assert client.patch("/me", json={}, headers=auth(other_secret)).status_code == 401


def test_update_voice_and_speed(client):
    data = signup(client)
    res = client.patch("/me", json={"voiceId": "v20f1", "speed": 1.2}, headers=auth(data["token"]))
    assert res.json() == {"ok": True}


def test_unknown_or_unapproved_voice_is_rejected(client):
    data = signup(client)
    for voice_id in ("nope", "v20f2"):
        res = client.patch("/me", json={"voiceId": voice_id}, headers=auth(data["token"]))
        assert res.status_code == 400


def test_speed_out_of_range_is_rejected(client):
    data = signup(client)
    assert client.patch("/me", json={"speed": 3.0}, headers=auth(data["token"])).status_code == 422


def test_delete_me_erases_and_blocks_token(client):
    data = signup(client)
    assert client.delete("/me", headers=auth(data["token"])).json() == {"ok": True}
    assert client.patch("/me", json={}, headers=auth(data["token"])).status_code == 401


def test_token_round_trip():
    token = tokens.sign("abc", "s", days=30)
    assert tokens.verify(token, "s") == "abc"
    assert tokens.verify(token, "wrong") is None
    assert tokens.verify("not-a-token", "s") is None
