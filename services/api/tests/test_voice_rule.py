"""목소리 바꾸기 규칙 (11 문서 4절): 처음은 자유, 가입 후 24시간 자유, 그 뒤 달력 기준 한 달에 한 번."""

from datetime import datetime, timedelta, timezone

from app import voice_rule
from app.voice_rule import KST

from tests.conftest import auth, signup


def at(y, m, d, h=12):  # 한국 시간
    return datetime(y, m, d, h, tzinfo=KST)


CREATED = at(2026, 10, 23, 10).astimezone(timezone.utc).isoformat()


def test_first_choice_is_always_free():
    r = voice_rule.check(CREATED, None, None, at(2026, 12, 1))
    assert r.can_change and not r.counts


def test_free_for_24_hours_after_signup():
    r = voice_rule.check(CREATED, "v20f1", None, at(2026, 10, 24, 9))
    assert r.can_change and not r.counts
    r = voice_rule.check(CREATED, "v20f1", None, at(2026, 10, 24, 11))
    assert r.can_change and r.counts  # 24시간이 지나면 세기 시작


def test_once_per_calendar_month_in_korean_time():
    changed = at(2026, 11, 3).astimezone(timezone.utc).isoformat()
    r = voice_rule.check(CREATED, "v20f1", changed, at(2026, 11, 30, 23))
    assert not r.can_change
    assert r.next_at == datetime(2026, 12, 1, tzinfo=KST)
    assert voice_rule.korean_date(r.next_at) == "12월 1일"
    assert voice_rule.check(CREATED, "v20f1", changed, at(2026, 12, 1, 0)).can_change


def test_month_boundary_uses_korean_time_not_utc():
    # 한국 12월 1일 오전 8시 = UTC 11월 30일 23시 → 한국 기준으로는 이미 12월
    changed = at(2026, 11, 15).astimezone(timezone.utc).isoformat()
    assert voice_rule.check(CREATED, "v20f1", changed, at(2026, 12, 1, 8)).can_change


def test_december_rolls_to_january():
    changed = at(2026, 12, 10).astimezone(timezone.utc).isoformat()
    r = voice_rule.check(CREATED, "v20f1", changed, at(2026, 12, 20))
    assert r.next_at == datetime(2027, 1, 1, tzinfo=KST)


def test_api_enforces_rule(client):
    data = signup(client)
    h = auth(data["token"])
    assert client.patch("/me", json={"voiceId": "v20f1"}, headers=h).status_code == 200   # 처음
    assert client.patch("/me", json={"voiceId": "v30f1"}, headers=h).status_code == 200   # 24시간 안
    assert client.get("/me", headers=h).json()["canChangeVoice"] is True

    # 가입이 이틀 전이었던 것처럼 바꾼다
    db = client.app.state.db
    old = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(timespec="seconds")
    import asyncio
    asyncio.run(db.update_user(data["userId"], created_at=old))

    assert client.patch("/me", json={"voiceId": "v20f1"}, headers=h).status_code == 200   # 이번 달 첫 변경
    res = client.patch("/me", json={"voiceId": "v30f1"}, headers=h)
    assert res.status_code == 409 and "1일부터" in res.json()["detail"]
    me = client.get("/me", headers=h).json()
    assert me["canChangeVoice"] is False and me["voiceId"] == "v20f1" and me["nextVoiceChangeAt"]
    # 같은 목소리를 다시 고르는 건 바꾸기가 아님
    assert client.patch("/me", json={"voiceId": "v20f1"}, headers=h).status_code == 200


def test_existing_db_gets_new_column_without_losing_users(tmp_path):
    """서버의 기존 DB(새 칸 없음)에 칸을 더해도 가입 정보가 그대로 남는다."""
    import asyncio
    import sqlite3

    from app.db import Database

    path = tmp_path / "old.db"
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE users (id VARCHAR PRIMARY KEY, name VARCHAR, age_group VARCHAR, gender VARCHAR, voice_id VARCHAR,"
                " speed FLOAT, auth_provider VARCHAR, consent_version VARCHAR, consent_at VARCHAR, created_at VARCHAR, deleted_at VARCHAR)")
    con.execute("INSERT INTO users VALUES ('u1','홍길동','20s','f','v20f1',1.0,'guest','v1','2026-10-01T00:00:00+00:00','2026-10-01T00:00:00+00:00',NULL)")
    con.commit(); con.close()

    async def run():
        db = Database(f"sqlite+aiosqlite:///{path}")
        await db.init()
        await db.init()  # 두 번 켜도 문제없음
        user = await db.get_active_user("u1")
        await db.close()
        return user

    user = asyncio.run(run())
    assert user.name == "홍길동" and user.voice_id == "v20f1" and user.voice_changed_at is None
