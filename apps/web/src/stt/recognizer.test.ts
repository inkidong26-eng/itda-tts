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

describe("빨리 다시 누르기", () => {
  it("앞 마이크의 늦은 '끝' 신호가 새 마이크를 끊지 않는다", () => {
    const made: { stopped: boolean; onend: (() => void) | null; onresult: ((e: Ev) => void) | null }[] = [];
    class Slow { lang = ""; continuous = false; interimResults = false; onresult = null; onerror = null; onend = null; onspeechstart = null; onspeechend = null;
      stopped = false; constructor() { made.push(this as never); } start() {} stop() { this.stopped = true; } abort() {} }
    vi.stubGlobal("window", { SpeechRecognition: Slow });
    const got: [string, boolean][] = [];
    const r = new Recognizer({ onText: (t, f) => got.push([t, f]) });
    r.startHold(); made[0].onresult!(res("하나")); r.stop();   // 첫 번째 누름·뗌 (끝 신호는 아직)
    r.startHold();                                            // 바로 다시 누름
    made[0].onend!();                                         // 이제야 앞 마이크 끝 신호
    expect(r.listening).toBe(true);                           // 새 마이크는 그대로
    made[1].onresult!(res("둘"));
    r.stop();
    expect(made[1].stopped).toBe(true);                       // 손을 떼면 새 마이크가 꺼진다
    expect(got.filter(([, f]) => f).map(([t]) => t)).toEqual(["하나", "둘"]);
  });
});

describe("켜기 실패", () => {
  it("앞 마이크가 꺼지는 중이라 실패하면 잠깐 뒤 다시 켜고, 오류로 마이크를 없애지 않는다", () => {
    vi.useFakeTimers();
    let busy = true;
    class Busy { lang = ""; continuous = false; interimResults = false; onresult = null; onerror = null; onend = null; onspeechstart = null; onspeechend = null;
      start() { if (busy) throw new Error("InvalidStateError"); } stop() {} abort() {} }
    vi.stubGlobal("window", { SpeechRecognition: Busy });
    const errors: string[] = [];
    const r = new Recognizer({ onText: () => {}, onError: (k) => errors.push(k) });
    r.startHold();
    expect(r.listening).toBe(false);
    busy = false;
    vi.advanceTimersByTime(300);
    expect(r.listening).toBe(true);
    expect(errors).toEqual([]);
    r.stop();
  });
});
