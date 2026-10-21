import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKOFF_S, CallConnection, type ConnState, PING_MS } from "./connection";

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeSocket.all.push(this); }
  send(d: string) { this.sent.push(d); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  drop(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
  receive(m: object) { this.onmessage?.({ data: JSON.stringify(m) }); }
  types() { return this.sent.map((s) => JSON.parse(s).type); }
}

function make(token?: string) {
  const states: ConnState[] = [];
  const messages: object[] = [];
  const conn = new CallConnection({
    url: "ws://x", token,
    onMessage: (m) => messages.push(m),
    onState: (s) => states.push(s),
    createSocket: (u) => new FakeSocket(u),
  });
  conn.start();
  return { conn, states, messages, last: () => FakeSocket.all.at(-1)! };
}

beforeEach(() => { FakeSocket.all = []; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe("링크 통화 연결", () => {
  it("열리면 농인은 첫 메시지로 로그인 확인을 보낸다", () => {
    const { last, states } = make("tok");
    last().open();
    expect(JSON.parse(last().sent[0])).toEqual({ type: "auth", token: "tok" });
    expect(states).toEqual(["connecting", "open"]);
  });

  it("끊기면 1·2·4·8·15·15초 간격으로 다시 연결한다", () => {
    const { last } = make();
    const waits: number[] = [];
    for (let i = 0; i < 6; i++) {
      const before = FakeSocket.all.length;
      last().drop();
      let waited = 0;
      while (FakeSocket.all.length === before) { vi.advanceTimersByTime(500); waited += 0.5; }
      waits.push(waited);
    }
    expect(waits).toEqual([...BACKOFF_S, 15]);
  });

  it("다시 연결되면 간격을 처음부터 다시 센다", () => {
    const { last } = make();
    last().drop(); vi.advanceTimersByTime(1000); // 1초 뒤 재연결
    last().drop(); vi.advanceTimersByTime(2000); // 2초 뒤
    last().open();
    const before = FakeSocket.all.length;
    last().drop(); vi.advanceTimersByTime(1000);
    expect(FakeSocket.all.length).toBe(before + 1);
  });

  it.each([4404, 4401, 4409, 4000])("닫힘 코드 %i 이면 다시 연결하지 않는다", (code) => {
    const { last, states } = make();
    last().open();
    last().drop(code);
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(states.at(-1)).toBe("ended");
  });

  it("꼭 가야 하는 글은 끊긴 동안 쥐고 있다가 다시 연결되면 순서대로 보낸다", () => {
    const { conn, last } = make();
    last().open();
    last().drop();
    conn.sendReliable("m1", { type: "say", msgId: "m1", text: "하나" });
    conn.sendReliable("m2", { type: "say", msgId: "m2", text: "둘" });
    vi.advanceTimersByTime(1000);
    last().open();
    expect(last().sent.map((s) => JSON.parse(s).msgId).filter(Boolean)).toEqual(["m1", "m2"]);
  });

  it("확인(ack)을 받은 글은 다시 보내지 않는다", () => {
    const { conn, last } = make();
    last().open();
    conn.sendReliable("m1", { type: "say", msgId: "m1" });
    conn.ack("m1");
    last().drop();
    vi.advanceTimersByTime(1000);
    last().open();
    expect(last().types()).toEqual([]);
    expect(conn.pendingCount).toBe(0);
  });

  it("25초마다 연결 유지 신호", () => {
    const { last } = make();
    last().open();
    vi.advanceTimersByTime(PING_MS * 2 + 10);
    expect(last().types()).toEqual(["ping", "ping"]);
  });

  it("끊기 버튼: hangup 을 보내고 다시 연결하지 않는다", () => {
    const { conn, last, states } = make();
    last().open();
    const socket = last();
    conn.close();
    expect(socket.types()).toEqual(["hangup"]);
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(states.at(-1)).toBe("ended");
  });

  it("받은 메시지를 넘기고, 이상한 메시지는 무시한다", () => {
    const { last, messages } = make();
    last().open();
    last().receive({ type: "caption", text: "네" });
    last().onmessage?.({ data: "not json" });
    expect(messages).toEqual([{ type: "caption", text: "네" }]);
  });
});
