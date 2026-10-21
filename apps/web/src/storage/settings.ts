// 화면 설정 (글자 크기, 위쪽 영역 보이기). 폰 저장소에 try/catch 로.

export type FontStep = 0 | 1 | 2;
export const FONT_STEPS = [
  { label: "보통", scale: 1 },
  { label: "크게", scale: 1.2 },
  { label: "아주 크게", scale: 1.45 },
] as const;

export type ViewSettings = { font: FontStep; showTop: boolean; vibrate: boolean; glow: boolean };

const KEY = "itda.view";
// 테두리 빛은 아이폰 기본(진동이 안 되므로), 안드로이드는 켜서 쓸 수 있다 (05 문서 6절)
const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
const defaults = (): ViewSettings => ({ font: 0, showTop: true, vibrate: true, glow: isIOS() });

export function loadView(): ViewSettings {
  try {
    const d = defaults();
    const data = JSON.parse(localStorage.getItem(KEY) || "{}");
    const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
    return {
      font: [0, 1, 2].includes(data.font) ? (data.font as FontStep) : d.font,
      showTop: bool(data.showTop, d.showTop),
      vibrate: bool(data.vibrate, d.vibrate),
      glow: bool(data.glow, d.glow),
    };
  } catch {
    return defaults();
  }
}

export function saveView(v: ViewSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // 저장이 안 돼도 이번 방문은 그대로
  }
}
