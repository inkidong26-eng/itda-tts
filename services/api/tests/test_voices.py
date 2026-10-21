from tests.conftest import auth, signup


def ids(res):
    return [v["id"] for v in res.json()]


def test_voices_require_token(client):
    assert client.get("/voices").status_code == 401
    assert client.get("/voices/recommend?ageGroup=20s&gender=f").status_code == 401


def test_list_shows_only_approved(client):
    token = signup(client)["token"]
    res = client.get("/voices", headers=auth(token))
    assert "v20f2" not in ids(res)
    assert set(ids(res)) == {"v10f1", "v20f1", "v30f1", "v40f1", "v20m1", "v70m1"}


def test_list_filters_by_age_and_gender(client):
    token = signup(client)["token"]
    res = client.get("/voices?ageGroup=20s&gender=f", headers=auth(token))
    assert ids(res) == ["v20f1"]


def test_voice_fields(client):
    token = signup(client)["token"]
    voice = client.get("/voices?ageGroup=20s&gender=f", headers=auth(token)).json()[0]
    assert set(voice) == {"id", "name", "ageGroup", "gender", "description", "tags", "previewUrl", "waveUrl", "card"}
    assert voice["card"] == {"easy": "밝고 또렷해요."} and voice["tags"] == ["밝음"]


def test_recommend_same_age_first_then_neighbors(client):
    token = signup(client)["token"]
    res = client.get("/voices/recommend?ageGroup=20s&gender=f", headers=auth(token))
    assert ids(res) == ["v20f1", "v10f1", "v30f1"]


def test_recommend_fills_from_other_gender_when_needed(client):
    token = signup(client)["token"]
    # 남성 승인 음성은 2개뿐 → 세 번째는 가장 가까운 나이의 여성
    res = client.get("/voices/recommend?ageGroup=60s&gender=m", headers=auth(token))
    assert ids(res) == ["v70m1", "v20m1", "v40f1"]


def test_recommend_rejects_bad_query(client):
    token = signup(client)["token"]
    assert client.get("/voices/recommend?ageGroup=99s&gender=f", headers=auth(token)).status_code == 422
    assert client.get("/voices/recommend?ageGroup=20s&gender=z", headers=auth(token)).status_code == 422


def test_cors_allows_only_our_site(client):
    pre = {"Access-Control-Request-Method": "POST"}
    ok = client.options("/auth/guest", headers={"Origin": "https://itda.gyeot.ai.kr", **pre})
    assert ok.headers.get("access-control-allow-origin") == "https://itda.gyeot.ai.kr"
    bad = client.options("/auth/guest", headers={"Origin": "https://evil.example", **pre})
    assert "access-control-allow-origin" not in bad.headers
