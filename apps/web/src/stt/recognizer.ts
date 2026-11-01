// 청인 말 → 자막 (06 문서 2절 1순위: 브라우저 음성 인식, ko-KR).
// - 자동 감지(계속 듣기)와 누르고 말하기 두 가지
// - 우리 음성이 재생되는 동안은 멈춘다 (자기 소리가 자막으로 잡히지 않게) → pause()/resume()
// - 지원 안 함·마이크 거부면 화면이 "글로 답하기"를 보여 준다

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
};

// 말이 이만큼 멈추면 한 문장으로 확정해 보낸다 (11/1 실제 통화: 천천히 말하면 "얼마나"/"얼마나 천천히"/... 가
// 따로 확정돼 말풍선이 여러 개 생김). 그 전에는 '말하는 중' 글로만 보여 준다.
export const PAUSE_FINAL_MS = 1500;

const squash = (t: string) => t.replace(/[\s.,!?~…"'·]/g, "");

/** 한 번 듣는 동안의 결과 조각을 한 문장으로. 안드로이드는 조각마다 '지금까지 전부'를 다시 보내므로 겹치면 긴 쪽만 남긴다 */
export function joinPieces(pieces: string[]): string {
  const out: string[] = [];
  for (const raw of pieces) {
    const t = raw.trim();
    if (!t) continue;
    const prev = out[out.length - 1];
    if (prev !== undefined && squash(t).startsWith(squash(prev))) out[out.length - 1] = t;
    else if (prev !== undefined && squash(prev).startsWith(squash(t))) continue;
    else out.push(t);
  }
  return out.join(" ");
}

export type SttHandlers = {
  onText: (text: string, final: boolean) => void;
  onSpeaking?: (active: boolean) => void;
  onError?: (kind: "denied" | "unsupported" | "other") => void;
};

function ctor(): (new () => Rec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function sttSupported(): boolean {
  try {
    return typeof window !== "undefined" && ctor() !== null;
  } catch {
    return false;
  }
}

export class Recognizer {
  private rec: Rec | null = null;
  private mode: "off" | "auto" | "hold" = "off";
  private paused = false;
  private running = false;
  private done = 0;          // 이번 듣기에서 이미 확정해 보낸 결과 수
  private pending = "";      // 아직 확정 안 한 말
  private sent = "";         // 마지막으로 확정해 보낸 말 (같은 말을 곧바로 다시 보내지 않기)
  private sentAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private h: SttHandlers, private lang = "ko-KR") {}

  /** 자동 감지: 말할 때마다 자막. 멈추면 저절로 다시 듣기 시작 */
  startAuto(): void {
    this.mode = "auto";
    this.begin();
  }

  /** 누르고 말하기: 누르는 동안만 */
  startHold(): void {
    this.mode = "hold";
    this.begin();
  }

  stop(): void {
    this.mode = "off";
    this.end();
  }

  /** 우리 음성 재생 중: 잠시 멈춤 */
  pause(): void {
    this.paused = true;
    this.end();
  }

  resume(): void {
    this.paused = false;
    if (this.mode === "auto") this.begin();
  }

  get listening(): boolean {
    return this.running;
  }

  private begin(): void {
    if (this.paused || this.running) return;
    const Ctor = ctor();
    if (!Ctor) {
      this.h.onError?.("unsupported");
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = this.lang; // 통역: 상대 언어로 듣는다
      rec.continuous = this.mode === "auto";
      rec.interimResults = true;
      this.done = 0;
      rec.onresult = (e) => {
        const pieces: string[] = [];
        for (let i = this.done; i < e.results.length; i++) pieces.push(e.results[i][0]?.transcript ?? "");
        const text = joinPieces(pieces);
        if (!text) return;
        if (text !== this.pending) {
          this.pending = text;
          this.h.onText(text, false);
        }
        // 말이 멈출 때까지 기다렸다가 한 문장으로 확정 (같은 글이 다시 와도 아직 말하는 중으로 본다)
        clearTimeout(this.timer);
        const upto = e.results.length;
        this.timer = setTimeout(() => this.flush(upto), PAUSE_FINAL_MS);
      };
      rec.onspeechstart = () => this.h.onSpeaking?.(true);
      rec.onspeechend = () => this.h.onSpeaking?.(false);
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          this.mode = "off";
          this.h.onError?.("denied");
        } else if (e.error !== "no-speech" && e.error !== "aborted") {
          this.h.onError?.("other");
        }
      };
      rec.onend = () => {
        this.flush();
        this.running = false;
        this.rec = null;
        this.h.onSpeaking?.(false);
        // 크롬은 조용하면 스스로 멈춘다 → 자동 감지면 다시 듣기
        if (this.mode === "auto" && !this.paused) setTimeout(() => this.begin(), 300);
      };
      this.rec = rec;
      this.running = true;
      rec.start();
    } catch {
      this.running = false;
      this.h.onError?.("other");
    }
  }

  /** 기다리던 말을 확정해 보낸다 (말이 멈춤·듣기 끝·우리 음성 재생 시작) */
  private flush(upto?: number): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const text = this.pending;
    this.pending = "";
    if (upto !== undefined) this.done = upto;
    if (!text || (squash(text) === squash(this.sent) && Date.now() - this.sentAt < 6000)) return;
    this.sent = text;
    this.sentAt = Date.now();
    this.h.onText(text, true);
  }

  private end(): void {
    this.flush();
    const rec = this.rec;
    this.rec = null;
    this.running = false;
    try { rec?.stop(); } catch { /* 이미 멈춤 */ }
  }
}
