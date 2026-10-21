// 소리 재생은 이 파일로만 한다 (규칙). 05 문서 7절.
// - AudioContext 하나 + 재생 큐 (연속으로 보낸 문장이 겹치지 않게)
// - 0.1초마다 실제 소리 크기(level) — 화면 막대·진동·테두리 빛은 이 값으로만 움직인다 (가짜 표시 금지)
// - 서버 음성이 없거나(fallback) 파일이 깨지면 폰 기본 음성(speechSynthesis ko-KR)으로 읽는다 (무음 금지)
// - 시작하고 1초 동안 소리 크기가 계속 0이면 "무음 의심"

export type Source = "server" | "fallback";

export type PlayerEvent =
  | { type: "queued"; id: string }
  | { type: "start"; id: string; source: Source; durationSec?: number }
  | { type: "level"; id: string; level: number; progress: number }
  | { type: "boundary"; id: string; charIndex: number }
  | { type: "silence"; id: string }
  | { type: "fallback"; id: string; reason: "server" | "audio-error" }
  | { type: "end"; id: string; source: Source }
  | { type: "error"; id: string; reason: string };

export type PlayItem = {
  id?: string;
  url?: string | null;
  text: string;          // 비상 음성이 읽을 글 (서버의 displayText)
  fallback?: boolean;    // 서버가 fallback:true 를 준 경우
};

type Utterance = {
  text: string;
  lang: string;
  voice: unknown;
  volume: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onboundary: ((e: { charIndex: number }) => void) | null;
};

export type PlayerDeps = {
  createContext: () => AudioContext | null;
  fetchAudio: (url: string) => Promise<ArrayBuffer>;
  speech: { speak: (u: Utterance) => void; cancel: () => void; getVoices: () => { lang: string }[] } | null;
  makeUtterance: (text: string) => Utterance;
  speechStartTimeoutMs?: number; // 시험용 (기본 4초)
};

const TICK_MS = 100;
const SILENCE_CHECK_MS = 1000;   // TTS 앞부분 무음(최대 0.4초 관찰)이 있어 0.5초보다 넉넉히
const SILENT_RMS = 0.003;
const SPEECH_START_TIMEOUT_MS = 4000;
const FETCH_TIMEOUT_MS = 8000;

let counter = 0;
const newId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

export function createPlayer(deps: PlayerDeps) {
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  const queue: (PlayItem & { id: string })[] = [];
  const listeners = new Set<(e: PlayerEvent) => void>();
  let running = false;
  let stopCurrent: (() => void) | null = null;
  let generation = 0; // stopAll() 이후 이전 재생이 남긴 신호를 무시하기 위해

  const emit = (e: PlayerEvent) => listeners.forEach((l) => l(e));

  function context(): AudioContext | null {
    if (!ctx) {
      ctx = deps.createContext();
      if (ctx) {
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.connect(ctx.destination);
      }
    }
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    return ctx;
  }

  function measure(): number {
    if (!analyser) return 0;
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += v * v;
    return Math.sqrt(sum / data.length);
  }

  async function playServer(item: PlayItem & { id: string }, gen: number): Promise<void> {
    const audio = context();
    if (!audio || !analyser) throw new Error("no-audio");
    const data = await deps.fetchAudio(item.url as string);
    const buffer = await audio.decodeAudioData(data);
    if (gen !== generation) {
      emit({ type: "end", id: item.id, source: "server" }); // 멈춤 버튼으로 취소됨
      return;
    }
    const node = audio.createBufferSource();
    node.buffer = buffer;
    node.connect(analyser);
    await new Promise<void>((resolve) => {
      const startedAt = audio.currentTime;
      let heard = false;
      let warned = false;
      const timer = setInterval(() => {
        const rms = measure();
        if (rms > SILENT_RMS) heard = true;
        const elapsed = audio.currentTime - startedAt;
        if (!heard && !warned && elapsed * 1000 >= SILENCE_CHECK_MS) {
          warned = true;
          emit({ type: "silence", id: item.id });
        }
        emit({ type: "level", id: item.id, level: Math.min(1, rms * 5), progress: Math.min(1, elapsed / buffer.duration) });
      }, TICK_MS);
      const finish = () => {
        clearInterval(timer);
        stopCurrent = null;
        emit({ type: "end", id: item.id, source: "server" });
        resolve();
      };
      node.onended = finish;
      stopCurrent = () => {
        node.onended = null;
        try { node.stop(); } catch { /* 이미 멈춤 */ }
        finish();
      };
      node.start();
      emit({ type: "start", id: item.id, source: "server", durationSec: buffer.duration });
    });
  }

  function speak(item: PlayItem & { id: string }): Promise<void> {
    return new Promise((resolve) => {
      const speech = deps.speech;
      if (!speech || !item.text) {
        emit({ type: "error", id: item.id, reason: "no-speech" });
        return resolve();
      }
      const u = deps.makeUtterance(item.text);
      u.lang = "ko-KR";
      const korean = speech.getVoices().find((v) => v.lang?.toLowerCase().startsWith("ko"));
      if (korean) u.voice = korean;
      let started = false;
      let done = false;
      const end = (event: PlayerEvent) => {
        if (done) return;
        done = true;
        clearTimeout(watchdog);
        stopCurrent = null;
        emit(event);
        resolve();
      };
      // 기본 음성이 시작조차 안 되는 기기(드묾)는 오류로 알려 "다시 말하기"를 보이게 한다
      const watchdog = setTimeout(() => {
        if (!started) { speech.cancel(); end({ type: "error", id: item.id, reason: "speech-timeout" }); }
      }, deps.speechStartTimeoutMs ?? SPEECH_START_TIMEOUT_MS);
      u.onstart = () => { started = true; emit({ type: "start", id: item.id, source: "fallback" }); };
      u.onboundary = (e) => emit({ type: "boundary", id: item.id, charIndex: e.charIndex });
      u.onend = () => end({ type: "end", id: item.id, source: "fallback" });
      u.onerror = () => end({ type: "error", id: item.id, reason: "speech-error" });
      stopCurrent = () => { speech.cancel(); end({ type: "end", id: item.id, source: "fallback" }); };
      speech.cancel(); // 크롬: 이전에 걸린 말이 있으면 새 말이 시작되지 않는 경우가 있다
      speech.speak(u);
    });
  }

  async function playOne(item: PlayItem & { id: string }, gen: number): Promise<void> {
    if (item.url && !item.fallback) {
      try {
        await playServer(item, gen);
        return;
      } catch {
        if (gen !== generation) return;
        if (!item.text) {
          emit({ type: "error", id: item.id, reason: "audio-error" });
          return;
        }
        emit({ type: "fallback", id: item.id, reason: "audio-error" });
      }
    } else {
      emit({ type: "fallback", id: item.id, reason: "server" });
    }
    if (gen === generation) await speak(item);
  }

  async function run(): Promise<void> {
    if (running) return;
    running = true;
    while (queue.length) {
      const item = queue.shift()!;
      await playOne(item, generation);
    }
    running = false;
  }

  return {
    /** 재생 큐에 넣는다. 순서대로 하나씩 재생. */
    enqueue(item: PlayItem): string {
      const id = item.id ?? newId();
      queue.push({ ...item, id });
      emit({ type: "queued", id });
      void run();
      return id;
    },
    /** 화면이 받을 재생 신호. 돌려준 함수를 부르면 그만 받는다. */
    subscribe(listener: (e: PlayerEvent) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stopAll(): void {
      generation++;
      queue.length = 0;
      stopCurrent?.();
    },
    /** 아이폰 대비: 첫 터치 안에서 소리 장치와 기본 음성을 함께 깨운다 */
    unlock(): void {
      context();
      try {
        const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
        if (session) session.type = "playback"; // 아이폰 무음 스위치가 켜져 있어도 소리가 나게 (지원 기기만)
      } catch { /* 지원 안 함 */ }
      try {
        if (deps.speech) {
          const warm = deps.makeUtterance(" ");
          warm.volume = 0;
          deps.speech.speak(warm);
        }
      } catch { /* 무시 */ }
    },
    koreanVoices(): string[] {
      try {
        return (deps.speech?.getVoices() ?? [])
          .filter((v) => v.lang?.toLowerCase().startsWith("ko"))
          .map((v) => `${(v as { name?: string }).name ?? "이름 없음"} (${v.lang})`);
      } catch {
        return [];
      }
    },
  };
}

function browserDeps(): PlayerDeps {
  const hasSpeech = typeof window !== "undefined" && "speechSynthesis" in window;
  return {
    createContext: () => {
      try {
        return new AudioContext();
      } catch {
        return null;
      }
    },
    fetchAudio: async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`audio ${res.status}`);
        return await res.arrayBuffer();
      } finally {
        clearTimeout(timer);
      }
    },
    speech: hasSpeech ? (window.speechSynthesis as unknown as PlayerDeps["speech"]) : null,
    makeUtterance: (text) => new SpeechSynthesisUtterance(text) as unknown as Utterance,
  };
}

export const player = createPlayer(browserDeps());

// ---------- 화면에서 쓰기 쉬운 도우미 ----------

export function unlockAudio(): void {
  player.unlock();
}

export function stopAudio(): void {
  player.stopAll();
}

export type PlayHandlers = {
  onStart?: (durationSec: number) => void;
  onProgress?: (ratio: number) => void; // 0~1, 실제 재생 위치
  onEnd?: () => void;
  onError?: () => void;
};

/** 목소리 미리듣기: 하던 재생을 멈추고 이 파일 하나만 재생 */
export function playUrl(url: string, h: PlayHandlers = {}): void {
  player.stopAll();
  const id = newId();
  const off = player.subscribe((e) => {
    if (e.id !== id) return;
    if (e.type === "start") h.onStart?.(e.durationSec ?? 0);
    if (e.type === "level") h.onProgress?.(e.progress);
    if (e.type === "end") { h.onProgress?.(1); h.onEnd?.(); off(); }
    if (e.type === "error") { h.onError?.(); off(); }
  });
  player.enqueue({ id, url, text: "" });
}
