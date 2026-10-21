// 폰 저장소(localStorage). 사생활 보호 모드에서는 막힐 수 있으므로 항상 try/catch.

export type Session = {
  token: string;
  userId: string;
  name: string;
  ageGroup: string;
  gender: "m" | "f";
  voiceId?: string;
  voiceName?: string;
};

const KEY = "itda.session";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Session;
    return data && data.token && data.name ? data : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // 저장이 안 돼도 이번 방문은 계속 쓸 수 있다
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}
