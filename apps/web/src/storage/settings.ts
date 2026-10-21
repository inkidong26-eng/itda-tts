// 화면 설정 (글자 크기, 위쪽 영역 보이기). 폰 저장소에 try/catch 로.

export type FontStep = 0 | 1 | 2;
export const FONT_STEPS = [
  { label: "보통", scale: 1 },
  { label: "크게", scale: 1.2 },
  { label: "아주 크게", scale: 1.45 },
] as const;

export type ViewSettings = { font: FontStep; showTop: boolean };

const KEY = "itda.view";
const DEFAULTS: ViewSettings = { font: 0, showTop: true };

export function loadView(): ViewSettings {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "{}");
    const font = [0, 1, 2].includes(data.font) ? (data.font as FontStep) : DEFAULTS.font;
    return { font, showTop: typeof data.showTop === "boolean" ? data.showTop : DEFAULTS.showTop };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveView(v: ViewSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // 저장이 안 돼도 이번 방문은 그대로
  }
}
