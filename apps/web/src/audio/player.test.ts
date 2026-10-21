// 재생 큐·비상 음성·무음 감지를 가짜 소리 장치로 시험한다 (브라우저 없이).
import { describe, expect, it } from "vitest";
import { createPlayer, type PlayerDeps, type PlayerEvent } from "./player";

type Opts = { amp?: number; speechStarts?: boolean; noSpeech?: boolean };

// url 형식: "ok-<길이ms>" 정상 파일, "bad" 깨진 파일
function fakeDeps({ amp = 0.1, speechStarts = true, noSpeech = false }: Opts = {}) {
  const t0 = performance.now();
  const spoken: string[] = [];
  const ctx = {
    state: "running",
    get currentTime() { return (performance.now() - t0) / 1000; },
    destination: {},
    resume: async () => undefined,
    createAnalyser: () => ({
      fftSize: 64,
      connect() {},
      getFloatTimeDomainData(arr: Float32Array) { arr.fill(amp); },
    }),
    createBufferSource: () => {
      const node = {
        buffer: null as { duration: number } | null,
        onended: null as null | (() => void),
        connect() {},
        start() { setTimeout(() => node.onended?.(), (node.buffer?.duration ?? 0) * 1000); },
        stop() { node.onended?.(); },
      };
      return node;
    },
    decodeAudioData: async (data: ArrayBuffer) => {
      const url = new TextDecoder().decode(data);
      if (!url.startsWith("ok-")) throw new Error("decode");
      return { duration: Number(url.slice(3)) / 1000 };
    },
  };
  const speech = {
    speak(u: { text: string; onstart: null | (() => void); onend: null | (() => void); onboundary: null | ((e: { charIndex: number }) => void) }) {
      if (!u.text.trim()) return; // 깨우기용 빈 말
      spoken.push(u.text);
      if (!speechStarts) return;
      setTimeout(() => { u.onstart?.(); u.onboundary?.({ charIndex: 0 }); setTimeout(() => u.onend?.(), 30); }, 5);
    },
    cancel() {},
    getVoices: () => [{ lang: "en-US", name: "Sam" }, { lang: "ko-KR", name: "Yuna" }],
  };
  const deps: PlayerDeps = {
    createContext: () => ctx as unknown as AudioContext,
    fetchAudio: async (url) => {
      if (url === "bad") throw new Error("404");
      return new TextEncoder().encode(url).buffer as ArrayBuffer;
    },
    speech: noSpeech ? null : (speech as unknown as PlayerDeps["speech"]),
    makeUtterance: (text) => ({ text, lang: "", voice: null, volume: 1, onstart: null, onend: null, onerror: null, onboundary: null }),
    speechStartTimeoutMs: 200,
  };
  return { deps, spoken };
}

function record(opts?: Opts) {
  const { deps, spoken } = fakeDeps(opts);
  const player = createPlayer(deps);
  const events: PlayerEvent[] = [];
  player.subscribe((e) => events.push(e));
  const until = async (pred: () => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (!pred()) {
      if (Date.now() > end) throw new Error("시간 초과: " + JSON.stringify(events.map((e) => e.type)));
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  const done = (id: string) => events.some((e) => e.id === id && (e.type === "end" || e.type === "error"));
  return { player, events, spoken, until, done };
}

const brief = (events: PlayerEvent[]) =>
  events.filter((e) => e.type === "start" || e.type === "end").map((e) => `${e.type}:${e.id}`);

describe("재생 큐", () => {
  it("연속으로 보낸 3개가 겹치지 않고 순서대로", async () => {
    const r = record();
    ["a", "b", "c"].forEach((id) => r.player.enqueue({ id, url: "ok-150", text: id }));
    await r.until(() => r.done("c"));
    expect(brief(r.events)).toEqual(["start:a", "end:a", "start:b", "end:b", "start:c", "end:c"]);
  });

  it("재생 중에는 0.1초마다 실제 소리 크기와 진행률을 알린다", async () => {
    const r = record();
    r.player.enqueue({ id: "a", url: "ok-450", text: "a" });
    await r.until(() => r.done("a"));
    const levels = r.events.filter((e): e is Extract<PlayerEvent, { type: "level" }> => e.type === "level");
    expect(levels.length).toBeGreaterThanOrEqual(3);
    expect(levels.every((l) => l.level > 0 && l.progress <= 1)).toBe(true);
    expect(levels.at(-1)!.progress).toBeGreaterThan(levels[0].progress);
  });

  it("멈춤: 지금 것을 끝내고 남은 것은 버린다", async () => {
    const r = record();
    ["a", "b", "c"].forEach((id) => r.player.enqueue({ id, url: "ok-2000", text: id }));
    await r.until(() => r.events.some((e) => e.type === "start" && e.id === "a"));
    r.player.stopAll();
    await new Promise((res) => setTimeout(res, 150));
    expect(brief(r.events)).toEqual(["start:a", "end:a"]);
  });
});

describe("비상 음성 (무음 금지)", () => {
  it("서버가 fallback 을 주면 폰 기본 음성으로 읽는다", async () => {
    const r = record();
    r.player.enqueue({ id: "a", url: null, fallback: true, text: "오케이 세 시에 봐요" });
    await r.until(() => r.done("a"));
    expect(r.events.map((e) => e.type)).toEqual(["queued", "fallback", "start", "boundary", "end"]);
    expect(r.events.find((e) => e.type === "start")).toMatchObject({ source: "fallback" });
    expect(r.spoken).toEqual(["오케이 세 시에 봐요"]);
  });

  it("음성 파일이 깨져도 기본 음성으로 읽는다", async () => {
    const r = record();
    r.player.enqueue({ id: "a", url: "bad", text: "안녕하세요" });
    await r.until(() => r.done("a"));
    expect(r.events.find((e) => e.type === "fallback")).toMatchObject({ reason: "audio-error" });
    expect(r.spoken).toEqual(["안녕하세요"]);
  });

  it("미리듣기처럼 읽을 글이 없으면 오류로 알린다", async () => {
    const r = record();
    r.player.enqueue({ id: "a", url: "bad", text: "" });
    await r.until(() => r.done("a"));
    expect(r.events.at(-1)).toMatchObject({ type: "error", reason: "audio-error" });
  });

  it("기본 음성이 시작조차 안 되면 오류로 알린다 (다시 말하기 버튼용)", async () => {
    const r = record({ speechStarts: false });
    r.player.enqueue({ id: "a", fallback: true, text: "안녕" });
    await r.until(() => r.done("a"));
    expect(r.events.at(-1)).toMatchObject({ type: "error", reason: "speech-timeout" });
  });

  it("기본 음성 기능이 없는 브라우저면 오류로 알린다", async () => {
    const r = record({ noSpeech: true });
    r.player.enqueue({ id: "a", fallback: true, text: "안녕" });
    await r.until(() => r.done("a"));
    expect(r.events.at(-1)).toMatchObject({ type: "error", reason: "no-speech" });
  });

  it("다음 차례 소리는 비상 음성 뒤에 이어서 나온다", async () => {
    const r = record();
    r.player.enqueue({ id: "a", fallback: true, text: "첫째" });
    r.player.enqueue({ id: "b", url: "ok-100", text: "둘째" });
    await r.until(() => r.done("b"));
    expect(brief(r.events)).toEqual(["start:a", "end:a", "start:b", "end:b"]);
  });
});

describe("무음 감지", () => {
  it("1초 넘게 소리 크기가 0이면 무음 의심", async () => {
    const r = record({ amp: 0 });
    r.player.enqueue({ id: "a", url: "ok-1300", text: "a" });
    await r.until(() => r.done("a"));
    expect(r.events.filter((e) => e.type === "silence")).toHaveLength(1);
  });

  it("소리가 나면 무음 의심이 없다", async () => {
    const r = record({ amp: 0.1 });
    r.player.enqueue({ id: "a", url: "ok-1300", text: "a" });
    await r.until(() => r.done("a"));
    expect(r.events.some((e) => e.type === "silence")).toBe(false);
  });
});

it("한국어 기본 음성 목록", () => {
  const r = record();
  expect(r.player.koreanVoices()).toEqual(["Yuna (ko-KR)"]);
});
