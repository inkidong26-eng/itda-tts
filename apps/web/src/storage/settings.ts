// 화면 설정 (글자 크기·글씨체·글자색, 위쪽 영역, 알림). 폰 저장소에 try/catch 로.
// 11 문서 2절: 크기 5단계, 글씨체 7, 글자색 7

export type FontStep = 0 | 1 | 2 | 3 | 4;
export const FONT_STEPS = [
  { label: "작게", scale: 0.9 },
  { label: "보통", scale: 1 },
  { label: "크게", scale: 1.2 },
  { label: "더 크게", scale: 1.4 },
  { label: "아주 크게", scale: 1.6 },
] as const;

/** 글씨체: 모두 OFL 공개 글꼴. 프리텐다드는 앱에 기본 포함, 나머지는 고를 때만 필요한 글자를 받는다 */
export const FONTS = [
  { id: "pretendard", label: "프리텐다드", note: "깔끔한 기본", family: '"Pretendard Variable", Pretendard' },
  { id: "noto", label: "본고딕", note: "반듯하고 무난", family: '"Noto Sans KR"' },
  { id: "nanum", label: "나눔고딕", note: "익숙하고 또렷", family: '"Nanum Gothic"' },
  { id: "jua", label: "주아", note: "둥글고 귀여운", family: "Jua" },
  { id: "dodum", label: "고운돋움", note: "따뜻하고 친근", family: '"Gowun Dodum"' },
  { id: "batang", label: "고운바탕", note: "부드러운 명조", family: '"Gowun Batang"' },
  { id: "plex", label: "IBM Plex", note: "단정하고 전문적", family: '"IBM Plex Sans KR"' },
] as const;
export type FontId = (typeof FONTS)[number]["id"];

/** 글자색·바탕: 밝은 바탕 5 + 어두운 바탕 2. 모두 대비 4.5:1 이상 */
export const THEMES = [
  { id: "basic", label: "기본", ink: "#111827", muted: "#4b5563", dark: false },
  { id: "navy", label: "남색", ink: "#1e3a8a", muted: "#3b4f86", dark: false },
  { id: "teal", label: "청록", ink: "#0f4f55", muted: "#2f5f63", dark: false },
  { id: "brown", label: "갈색", ink: "#4a2f17", muted: "#6b4f37", dark: false },
  { id: "plum", label: "자주", ink: "#5b1a52", muted: "#6f3a68", dark: false },
  { id: "contrast", label: "고대비", ink: "#ffffff", muted: "#e5e7eb", dark: true },
  { id: "lowvision", label: "저시력", ink: "#ffe14d", muted: "#fff0a8", dark: true },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];

export type ViewSettings = { font: FontStep; family: FontId; theme: ThemeId; showTop: boolean; vibrate: boolean; glow: boolean };

const KEY = "itda.view";
// 테두리 빛은 아이폰 기본(진동이 안 되므로), 안드로이드는 켜서 쓸 수 있다 (05 문서 6절)
const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
const defaults = (): ViewSettings => ({ font: 1, family: "pretendard", theme: "basic", showTop: true, vibrate: true, glow: isIOS() });

export function loadView(): ViewSettings {
  try {
    const d = defaults();
    const data = JSON.parse(localStorage.getItem(KEY) || "{}");
    const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
    // 예전(3단계) 값: 보통0·크게1·아주 크게2 → 새 5단계로 옮긴다
    const font = data.v === 2
      ? ([0, 1, 2, 3, 4].includes(data.font) ? data.font : d.font)
      : ({ 0: 1, 1: 2, 2: 4 } as Record<number, FontStep>)[data.font] ?? d.font;
    return {
      font,
      family: FONTS.some((f) => f.id === data.family) ? data.family : d.family,
      theme: THEMES.some((t) => t.id === data.theme) ? data.theme : d.theme,
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
    localStorage.setItem(KEY, JSON.stringify({ ...v, v: 2 }));
  } catch {
    // 저장이 안 돼도 이번 방문은 그대로
  }
}
