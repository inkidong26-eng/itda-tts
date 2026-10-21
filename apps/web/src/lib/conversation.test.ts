import { afterEach, describe, expect, it, vi } from "vitest";
import { createHistory, MAX_MESSAGES, memoryStore, type Message } from "../storage/history";
import { loadView, saveView } from "../storage/settings";
import { DEFAULT_FAVORITES } from "./favorites";
import { createOrdered } from "./ordered";
import { speechText } from "./speechText";

afterEach(() => vi.unstubAllGlobals());

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("보낸 순서대로 말하기", () => {
  it("뒤에 보낸 문장이 먼저 답해도 순서는 지킨다", async () => {
    const inOrder = createOrdered();
    const order: string[] = [];
    const a = deferred<string>();
    const b = deferred<string>();
    const done = Promise.all([inOrder(a.promise, (v) => order.push(v)), inOrder(b.promise, (v) => order.push(v))]);
    b.resolve("둘째");       // 둘째가 먼저 도착
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual([]); // 첫째를 기다린다
    a.resolve("첫째");
    await done;
    expect(order).toEqual(["첫째", "둘째"]);
  });

  it("앞 문장이 실패해도 다음 문장은 나간다", async () => {
    const inOrder = createOrdered();
    const order: string[] = [];
    const a = deferred<string>();
    const first = inOrder(a.promise, (v) => order.push(v));
    const second = inOrder(Promise.resolve("둘째"), (v) => order.push(v));
    a.reject(new Error("네트워크"));
    await expect(first).rejects.toThrow();
    await second;
    expect(order).toEqual(["둘째"]);
  });
});

describe("서버 없이 읽을 글", () => {
  it.each([
    ["안녕하세요ㅎㅎ", "안녕하세요"],
    ["괜찮아요ㅠㅠ 😢", "괜찮아요"],
    ["ㅋㅋㅋ", "하하"],
    ["좋아요^^", "좋아요"],
    ["😊", ""],
  ])("%s → %s", (raw, expected) => {
    expect(speechText(raw)).toBe(expected);
  });
});

const msg = (id: string, at: number): Message => ({ id, role: "me", text: id, at });

describe("대화 기록 (폰에만)", () => {
  it("시간 순서로 보여 주고 같은 id 는 고쳐 쓴다", async () => {
    const store = memoryStore();
    await store.put(msg("b", 2));
    await store.put(msg("a", 1));
    await store.put({ ...msg("a", 1), result: "done" });
    const list = await store.list();
    expect(list.map((m) => m.id)).toEqual(["a", "b"]);
    expect(list[0].result).toBe("done");
  });

  it(`최근 ${MAX_MESSAGES}개까지만 둔다`, async () => {
    const store = memoryStore();
    for (let i = 0; i < MAX_MESSAGES + 5; i++) await store.put(msg(`m${i}`, i));
    const list = await store.list();
    expect(list).toHaveLength(MAX_MESSAGES);
    expect(list[0].id).toBe("m5");
  });

  it("지우기", async () => {
    const store = memoryStore();
    await store.put(msg("a", 1));
    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it("IndexedDB 가 없으면(사생활 보호 모드 등) 메모리로 계속 동작한다", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const store = createHistory();
    await store.put(msg("a", 1));
    expect((await store.list()).map((m) => m.id)).toEqual(["a"]);
  });

  it("IndexedDB 가 오류를 내도 멈추지 않는다", async () => {
    vi.stubGlobal("indexedDB", { open: () => { throw new Error("blocked"); } });
    const store = createHistory();
    await store.put(msg("a", 1));
    expect((await store.list()).map((m) => m.id)).toEqual(["a"]);
  });
});

describe("화면 설정", () => {
  it("저장하고 다시 읽는다, 망가진 값은 기본값", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    });
    expect(loadView()).toEqual({ font: 0, showTop: true, vibrate: true, glow: false });
    saveView({ font: 2, showTop: false, vibrate: false, glow: true });
    expect(loadView()).toEqual({ font: 2, showTop: false, vibrate: false, glow: true });
    data.set("itda.view", '{"font":9,"showTop":"x"}');
    expect(loadView()).toEqual({ font: 0, showTop: true, vibrate: true, glow: false });
  });
});

it("즐겨찾기 기본 12문구 (03 문서 8절)", () => {
  expect(DEFAULT_FAVORITES).toHaveLength(12);
  expect(DEFAULT_FAVORITES.every((f) => f.length <= 100)).toBe(true);
});
