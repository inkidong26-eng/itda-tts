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

  constructor(private h: SttHandlers) {}

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
      rec.lang = "ko-KR";
      rec.continuous = this.mode === "auto";
      rec.interimResults = true;
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const text = r[0]?.transcript?.trim();
          if (text) this.h.onText(text, r.isFinal);
        }
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

  private end(): void {
    const rec = this.rec;
    this.rec = null;
    this.running = false;
    try { rec?.stop(); } catch { /* 이미 멈춤 */ }
  }
}
