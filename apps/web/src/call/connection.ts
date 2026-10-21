// 링크 통화 연결 (06 문서 2절). 끊겨도 대화가 이어지게:
// - 자동 재연결 1·2·4·8·15초 (최대 15초 간격)
// - 꼭 가야 하는 메시지(농인의 글)는 확인(ack)이 올 때까지 쥐고 있다가, 다시 연결되면 순서대로 다시 보낸다
// - 25초마다 연결 유지 신호 (휴대폰 망이 조용한 연결을 끊지 않게)
// - 방이 없음·로그인 실패·이미 통화 중·통화 끝남이면 다시 연결하지 않는다

export type ConnState = "connecting" | "open" | "reconnecting" | "ended";
export type CallMessage = { type: string; [key: string]: unknown };

type SocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number): void;
  onopen: ((ev?: unknown) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
};

export const BACKOFF_S = [1, 2, 4, 8, 15];
export const PING_MS = 25000;
const FINAL_CODES = new Set([4000, 4400, 4401, 4404, 4409]); // 다시 연결해도 소용없는 닫힘
const OPEN = 1;

export type ConnectionOptions = {
  url: string;
  token?: string;                       // 농인: 첫 메시지로 로그인 확인
  onMessage: (m: CallMessage) => void;
  onState: (s: ConnState, code?: number) => void;
  createSocket?: (url: string) => SocketLike;
};

export function wsUrl(callId: string, role: "deaf" | "hearing"): string {
  const base = (import.meta.env.VITE_API_BASE as string | undefined) || "/api";
  const origin = base.startsWith("http")
    ? base.replace(/^http/, "ws")
    : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${base}`;
  return `${origin}/ws/calls/${encodeURIComponent(callId)}?role=${role}`;
}

export class CallConnection {
  private socket: SocketLike | null = null;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private pending = new Map<string, CallMessage>(); // 확인 전인 중요한 메시지 (보낸 순서 유지)

  constructor(private opts: ConnectionOptions) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  get isOpen(): boolean {
    return this.socket?.readyState === OPEN;
  }

  /** 그냥 보내기 (재생 신호처럼 놓쳐도 되는 것). 연결이 없으면 버린다 */
  send(msg: CallMessage): boolean {
    if (!this.isOpen) return false;
    try {
      this.socket!.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  /** 꼭 가야 하는 메시지: ack(id) 를 받을 때까지 쥐고 있다가 다시 연결되면 다시 보낸다 */
  sendReliable(id: string, msg: CallMessage): void {
    this.pending.set(id, msg);
    this.send(msg);
  }

  ack(id: string): void {
    this.pending.delete(id);
  }

  /** 아직 확인 못 받은 것을 순서대로 다시 보낸다 (상대가 다시 들어왔을 때 등) */
  resendPending(): void {
    for (const msg of this.pending.values()) this.send(msg);
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  close(sendHangup = true): void {
    if (sendHangup) this.send({ type: "hangup" });
    this.stopped = true;
    this.clearTimers();
    try { this.socket?.close(1000); } catch { /* 이미 닫힘 */ }
    this.socket = null;
    this.opts.onState("ended");
  }

  private connect(): void {
    if (this.stopped) return;
    this.opts.onState(this.attempt === 0 ? "connecting" : "reconnecting");
    let socket: SocketLike;
    try {
      socket = (this.opts.createSocket ?? ((u) => new WebSocket(u) as unknown as SocketLike))(this.opts.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (this.opts.token) socket.send(JSON.stringify({ type: "auth", token: this.opts.token }));
      this.attempt = 0;
      this.opts.onState("open");
      this.resendPending();
      this.clearTimers();
      this.pingTimer = setInterval(() => this.send({ type: "ping" }), PING_MS);
    };
    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as CallMessage;
        if (msg && typeof msg.type === "string") this.opts.onMessage(msg);
      } catch { /* 이상한 메시지는 무시 */ }
    };
    socket.onerror = () => { /* onclose 에서 처리 */ };
    socket.onclose = (ev) => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (this.stopped) return;
      if (FINAL_CODES.has(ev.code)) {
        this.stopped = true;
        this.opts.onState("ended", ev.code);
        return;
      }
      this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    const wait = BACKOFF_S[Math.min(this.attempt, BACKOFF_S.length - 1)];
    this.attempt += 1;
    this.opts.onState("reconnecting");
    this.retryTimer = setTimeout(() => this.connect(), wait * 1000);
  }

  /** 폰이 다시 켜졌을 때 등: 기다리지 말고 바로 다시 연결 */
  reconnectNow(): void {
    if (this.stopped || this.isOpen) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.connect();
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
  }
}
