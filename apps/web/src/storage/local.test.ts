import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSession, loadSession, saveSession, type Session } from "./local";

const session: Session = { token: "t", userId: "u", name: "홍길동", ageGroup: "20s", gender: "f" };

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("폰 저장소", () => {
  it("저장하고 다시 읽고 지운다", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    saveSession(session);
    expect(loadSession()).toEqual(session);
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it("사생활 보호 모드처럼 저장소가 막혀도 앱이 멈추지 않는다", () => {
    const broken = () => { throw new Error("blocked"); };
    vi.stubGlobal("localStorage", { getItem: broken, setItem: broken, removeItem: broken });
    expect(() => saveSession(session)).not.toThrow();
    expect(loadSession()).toBeNull();
    expect(() => clearSession()).not.toThrow();
  });

  it("망가진 값은 무시한다", () => {
    const store = fakeStorage();
    store.setItem("itda.session", "{not json");
    vi.stubGlobal("localStorage", store);
    expect(loadSession()).toBeNull();
  });
});
