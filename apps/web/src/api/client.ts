// API 서버 호출 (07 문서 5절). 모든 요청에 제한 시간을 둔다.

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "/api";
const TIMEOUT_MS = 10000; // 서버는 7초 안에 답한다 (10/30: 4초 → 7초)

export type VoiceCard = {
  easy?: string;
  impression?: string;
  scales?: { pitch?: number; speed?: number; mood?: number; strength?: number };
  suits?: string;
};

export type Voice = {
  id: string;
  name: string;
  ageGroup: string;
  gender: "m" | "f";
  description: string;
  tags: string[];
  previewUrl: string | null;
  waveUrl: string | null;
  card: VoiceCard | null;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function messageFor(status: number): string {
  if (status === 429) return "잠시 후 다시 보내 주세요";
  if (status === 401) return "처음부터 다시 시작해 주세요";
  if (status === 409) return "이번 달에는 이미 목소리를 바꿨어요";
  if (status === 0) return "인터넷 연결을 확인해 주세요";
  return "문제가 생겼어요. 다시 해 주세요";
}

async function request<T>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) throw new ApiError(res.status, messageFor(res.status));
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, messageFor(0));
  } finally {
    clearTimeout(timer);
  }
}

export function signup(name: string, ageGroup: string, gender: string) {
  return request<{ userId: string; token: string }>("POST", "/auth/guest", undefined, {
    name, ageGroup, gender, consent: true,
  });
}

export function recommendVoices(token: string, ageGroup: string, gender: string) {
  return request<Voice[]>("GET", `/voices/recommend?ageGroup=${ageGroup}&gender=${gender}`, token);
}

export function listVoices(token: string, ageGroup: string) {
  return request<Voice[]>("GET", `/voices?ageGroup=${ageGroup}`, token);
}

export type Me = { voiceId: string | null; canChangeVoice: boolean; voiceFreeUntil: string | null; nextVoiceChangeAt: string | null };

/** 내 정보: 목소리 바꾸기 규칙 상태 (가입 후 24시간 자유, 그 뒤 한 달에 한 번) */
export function getMe(token: string) {
  return request<Me>("GET", "/me", token);
}

/** 처음부터 다시 하기: 서버의 이 사용자 정보(이름 등)를 지운다 */
export function deleteMe(token: string) {
  return request<{ ok: boolean }>("DELETE", "/me", token);
}

export function chooseVoice(token: string, voiceId: string) {
  return request<{ ok: boolean }>("PATCH", "/me", token, { voiceId });
}

export type TtsResult = {
  url: string | null;
  durationMs: number | null;
  cached: boolean;
  fallback: boolean;
  displayText: string; // 비상 음성이 읽을 글 (정규화됨)
};

/** 글 → 음성. 서버는 7초 안에 반드시 답한다 (늦으면 fallback:true) */
export type EmotionPayload = { emotion: string; intensity: number; tremor: number };

export function speak(token: string, text: string, voiceId: string, emotion?: EmotionPayload) {
  return request<TtsResult>("POST", "/tts", token, { text, voiceId, ...(emotion ? { emotion } : {}) });
}

/** 통역 (DeepL). 실패하면 화면은 원문으로 계속 */
export function translate(token: string, text: string, source: string, target: string) {
  return request<{ text: string }>("POST", "/translate", token, { text, source, target });
}

export type CallInfo = { callId: string; joinUrl: string; qrSvg: string; expiresAt: string };

/** 링크 통화 방 만들기 (농인) */
export function createCall(token: string) {
  return request<CallInfo>("POST", "/calls", token, {});
}

/** 방 상태 (청인, 로그인 없음) */
export function getCall(callId: string) {
  return request<{ state: "waiting" | "connected" | "ended"; deafName: string }>("GET", `/calls/${encodeURIComponent(callId)}`);
}

/** 음성 서버 미리 깨우기. 실패해도 앱은 계속 (아직 /tts/warmup 이 없으면 무시) */
export function warmup(): void {
  request("POST", "/tts/warmup").catch(() => undefined);
}
