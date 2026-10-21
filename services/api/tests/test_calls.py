"""링크 통화: 가짜 농인·청인 두 명이 실제로 대화해 본다 (09 문서 T15). GPU 없이 → 음성은 비상 전환."""

import asyncio
import logging

import pytest
from starlette.websockets import WebSocketDisconnect

from app.calls import IDLE_LIMIT_S, KEEP_ENDED_S, WAIT_LIMIT_S, CallManager
from tests.conftest import auth, signup


def make_call(client, token):
    res = client.post("/calls", headers=auth(token))
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture
def room(client):
    data = signup(client)
    client.patch("/me", json={"voiceId": "v20f1"}, headers=auth(data["token"]))
    call = make_call(client, data["token"])
    return client, data["token"], call["callId"]


def join_deaf(client, call_id, token):
    ws = client.websocket_connect(f"/ws/calls/{call_id}?role=deaf").__enter__()
    ws.send_json({"type": "auth", "token": token})
    return ws


def test_create_call(client):
    token = signup(client)["token"]
    call = make_call(client, token)
    assert len(call["callId"]) >= 12
    assert call["joinUrl"].endswith(f"/c/{call['callId']}")
    assert call["qrSvg"].startswith("<svg")
    assert call["expiresAt"]
    state = client.get(f"/calls/{call['callId']}").json()
    assert state == {"state": "waiting", "deafName": "홍길동"}


def test_unknown_call(client):
    assert client.get("/calls/nope").status_code == 404
    with client.websocket_connect("/ws/calls/nope?role=hearing") as ws:
        assert ws.receive_json()["code"] == "not_found"


def test_create_call_requires_login(client):
    assert client.post("/calls").status_code == 401


def test_conversation_between_two_people(room):
    client, token, call_id = room
    deaf = join_deaf(client, call_id, token)
    with client.websocket_connect(f"/ws/calls/{call_id}?role=hearing") as hearing:
        assert hearing.receive_json() == {"type": "presence", "role": "deaf", "online": True}
        assert deaf.receive_json() == {"type": "presence", "role": "hearing", "online": True}
        assert client.get(f"/calls/{call_id}").json()["state"] == "connected"

        # 농인 글 → 청인 폰에 음성 (GPU 없음 → 비상 음성, 읽을 글은 다듬어서)
        deaf.send_json({"type": "say", "msgId": "m1", "text": "OK 3시에 봐요ㅎㅎ",
                        "emotion": {"emotion": "joy", "intensity": 2, "tremor": 0, "source": "auto"}})
        audio = hearing.receive_json()
        assert audio["type"] == "audio" and audio["msgId"] == "m1"
        assert audio["fallback"] is True and audio["url"] is None
        assert audio["displayText"] == "오케이 세 시에 봐요" and audio["text"] == "OK 3시에 봐요ㅎㅎ"
        assert audio["emotion"]["emotion"] == "joy"
        assert deaf.receive_json() == {"type": "sent", "msgId": "m1", "fallback": True}

        # 청인 폰의 실제 재생 상태 → 농인 폰 ("상대 폰에서 들리는 중")
        hearing.send_json({"type": "playback", "msgId": "m1", "state": "start"})
        hearing.send_json({"type": "playback", "msgId": "m1", "state": "level", "level": 3.0, "progress": 0.4})
        assert deaf.receive_json() == {"type": "playback", "msgId": "m1", "state": "start"}
        assert deaf.receive_json() == {"type": "playback", "msgId": "m1", "state": "level", "level": 1.0, "progress": 0.4}

        # 청인 말 → 자막, 말하는 중 표시
        hearing.send_json({"type": "caption", "text": "네 반갑습니다", "final": True})
        assert deaf.receive_json() == {"type": "caption", "text": "네 반갑습니다", "final": True}
        hearing.send_json({"type": "speaking", "level": 0.4})
        assert deaf.receive_json() == {"type": "speaking", "role": "hearing", "level": 0.4}

        # 청인은 '말하기'를 보낼 수 없고, 이상한 메시지는 무시된다
        hearing.send_json({"type": "say", "text": "가짜"})
        hearing.send_text("not json")
        hearing.send_json({"type": "playback", "msgId": "m1", "state": "hack"})
        hearing.send_json({"type": "caption", "text": "확인", "final": False})
        assert deaf.receive_json() == {"type": "caption", "text": "확인", "final": False}

    # 청인이 나가면 농인에게 알린다
    assert deaf.receive_json() == {"type": "presence", "role": "hearing", "online": False}
    deaf.__exit__(None, None, None)


def test_third_person_is_rejected(room):
    client, token, call_id = room
    deaf = join_deaf(client, call_id, token)
    with client.websocket_connect(f"/ws/calls/{call_id}?role=hearing") as hearing:
        hearing.receive_json()
        deaf.receive_json()
        with client.websocket_connect(f"/ws/calls/{call_id}?role=hearing") as third:
            assert third.receive_json() == {"type": "error", "code": "busy", "message": "이미 통화 중이에요"}
            with pytest.raises(WebSocketDisconnect) as closed:
                third.receive_json()
            assert closed.value.code == 4409
    deaf.__exit__(None, None, None)


def test_deaf_must_prove_owner(room):
    client, _, call_id = room
    other = signup(client, name="다른사람")["token"]
    with client.websocket_connect(f"/ws/calls/{call_id}?role=deaf") as ws:
        ws.send_json({"type": "auth", "token": other})
        assert ws.receive_json()["code"] == "unauthorized"
    with client.websocket_connect(f"/ws/calls/{call_id}?role=deaf") as ws:
        ws.send_json({"type": "say", "text": "토큰 없이"})
        assert ws.receive_json()["code"] == "unauthorized"


def test_say_when_hearing_not_connected(room):
    client, token, call_id = room
    deaf = join_deaf(client, call_id, token)
    deaf.send_json({"type": "say", "msgId": "m9", "text": "여보세요"})
    assert deaf.receive_json() == {"type": "undelivered", "msgId": "m9"}
    deaf.send_json({"type": "say", "msgId": "m10", "text": "가" * 101})
    assert deaf.receive_json() == {"type": "error", "msgId": "m10", "code": "rejected", "message": "100자까지 보낼 수 있어요"}
    deaf.__exit__(None, None, None)


def test_hangup_ends_call_for_both(room):
    client, token, call_id = room
    deaf = join_deaf(client, call_id, token)
    with client.websocket_connect(f"/ws/calls/{call_id}?role=hearing") as hearing:
        hearing.receive_json()
        deaf.receive_json()
        hearing.send_json({"type": "hangup"})
        assert deaf.receive_json() == {"type": "ended", "reason": "hangup"}
    assert client.get(f"/calls/{call_id}").json()["state"] == "ended"
    with client.websocket_connect(f"/ws/calls/{call_id}?role=hearing") as late:
        assert late.receive_json()["code"] == "not_found"
    deaf.__exit__(None, None, None)


def test_nothing_from_the_conversation_is_logged(room, caplog):
    client, token, call_id = room
    with caplog.at_level(logging.DEBUG):
        deaf = join_deaf(client, call_id, token)
        with client.websocket_connect(f"/ws/calls/{call_id}?role=hearing") as hearing:
            hearing.receive_json()
            deaf.receive_json()
            deaf.send_json({"type": "say", "msgId": "m1", "text": "비밀 이야기예요"})
            hearing.receive_json()
            hearing.send_json({"type": "caption", "text": "비밀 대답이에요", "final": True})
            deaf.receive_json()
            deaf.receive_json()
        deaf.__exit__(None, None, None)
    assert "비밀" not in caplog.text and token not in caplog.text


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_ping_keeps_connection_but_is_not_activity(room):
    client, token, call_id = room
    calls = client.app.state.calls
    deaf = join_deaf(client, call_id, token)
    r = calls.get(call_id)
    before = r.last_active
    deaf.send_json({"type": "ping"})
    deaf.send_json({"type": "say", "msgId": "x", "text": "확인"})  # 다음 메시지가 처리됐다 = ping 은 무시됨
    assert deaf.receive_json()["type"] == "undelivered"
    assert r.last_active >= before
    deaf.__exit__(None, None, None)


def test_rooms_expire_and_idle_rooms_end():
    async def run():
        clock = Clock()
        calls = CallManager(clock)
        waiting = calls.create("u1", "가", None)
        active = calls.create("u2", "나", None)
        active.hearing_joined = True
        clock.now += WAIT_LIMIT_S + 1
        calls.touch(active)
        await calls.sweep()
        assert waiting.state() == "ended" and active.state() == "waiting"   # 30분 안에 안 들어오면 만료
        clock.now += IDLE_LIMIT_S + 1
        await calls.sweep()
        assert active.state() == "ended"                                    # 15분 무활동이면 종료
        clock.now += KEEP_ENDED_S + 1
        await calls.sweep()
        assert calls.get(waiting.id) is None and calls.get(active.id) is None  # 끝난 방은 지운다
    asyncio.run(run())


def test_call_ids_are_unguessable():
    calls = CallManager()
    ids = {calls.create("u", "가", None).id for _ in range(200)}
    assert len(ids) == 200 and all(len(i) >= 12 for i in ids)
