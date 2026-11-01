import { afterEach, describe, expect, it, vi } from "vitest";
import { joinPieces, PAUSE_FINAL_MS, Recognizer } from "./recognizer";

type Ev = { resultIndex: number; results: { 0: { transcript: string }; isFinal: boolean; length: 1 }[] };
let last: { onresult: ((e: Ev) => void) | null; onend: (() => void) | null } | null = null;
class FakeRec {
  lang = ""; continuous = false; interimResults = false;
  onresult = null; onerror = null; onend = null; onspeechstart = null; onspeechend = null;
  constructor() { last = this as never; }
  start() {} stop() {} abort() {}
}
const res = (...t: string[]): Ev => ({ resultIndex: 0, results: t.map((x) => ({ 0: { transcript: x }, isFinal: true, length: 1 as const })) });

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("말의 흐름을 기다려 한 문장으로", () => {
  it("안드로이드처럼 겹쳐 오는 조각은 긴 쪽만", () => {
    expect(joinPieces(["얼마나", "얼마나 천천히", "얼마나 천천히 할까요"])).toBe("얼마나 천천히 할까요");
    expect(joinPieces(["얼마나", " 천천히", " 할까요"])).toBe("얼마나 천천히 할까요");
    expect(joinPieces(["근데 왜 반말이야", "근데 왜"])).toBe("근데 왜 반말이야");
  });

  it("천천히 말해도 멈출 때 한 번만 확정해 보낸다", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { SpeechRecognition: FakeRec });
    const got: [string, boolean][] = [];
    const r = new Recognizer({ onText: (t, f) => got.push([t, f]) });
    r.startAuto();
    last!.onresult!(res("얼마나"));
    vi.advanceTimersByTime(800);
    last!.onresult!(res("얼마나"));
    vi.advanceTimersByTime(800);
    last!.onresult!(res("얼마나", "얼마나 천천히"));
    vi.advanceTimersByTime(900);
    last!.onresult!(res("얼마나", "얼마나 천천히", "얼마나 천천히 할까요"));
    vi.advanceTimersByTime(PAUSE_FINAL_MS);
    expect(got.filter(([, f]) => f)).toEqual([["얼마나 천천히 할까요", true]]);
    expect(got.some(([t, f]) => !f && t === "얼마나")).toBe(true); // 말하는 중 글은 바로 보인다
    r.stop();
  });

  it("듣기가 끝나면 기다리지 않고 바로 확정", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { SpeechRecognition: FakeRec });
    const got: [string, boolean][] = [];
    const r = new Recognizer({ onText: (t, f) => got.push([t, f]) });
    r.startHold();
    last!.onresult!(res("네 알겠어요"));
    r.stop();
    expect(got.filter(([, f]) => f)).toEqual([["네 알겠어요", true]]);
  });
});
