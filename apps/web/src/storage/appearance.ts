// 고른 글씨체·글자색·크기를 화면 전체에 적용한다. 글꼴 파일은 고를 때만 받는다 (11 문서 2절).
import { FONT_STEPS, FONTS, type FontId, THEMES, type ViewSettings } from "./settings";

// 프리텐다드는 main.tsx 에서 늘 불러온다. 나머지는 고를 때 필요한 글자 묶음만 받는다
const LOADERS: Partial<Record<FontId, () => Promise<unknown>>> = {
  noto: () => Promise.all([import("@fontsource/noto-sans-kr/400.css"), import("@fontsource/noto-sans-kr/700.css")]),
  nanum: () => Promise.all([import("@fontsource/nanum-gothic/400.css"), import("@fontsource/nanum-gothic/700.css")]),
  jua: () => import("@fontsource/jua/400.css"),
  dodum: () => import("@fontsource/gowun-dodum/400.css"),
  batang: () => Promise.all([import("@fontsource/gowun-batang/400.css"), import("@fontsource/gowun-batang/700.css")]),
  plex: () => Promise.all([import("@fontsource/ibm-plex-sans-kr/400.css"), import("@fontsource/ibm-plex-sans-kr/700.css")]),
};

export function applyAppearance(v: ViewSettings): void {
  const root = document.documentElement;
  root.style.fontSize = `${18 * FONT_STEPS[v.font].scale}px`;

  const font = FONTS.find((f) => f.id === v.family) ?? FONTS[0];
  // 글꼴 파일을 못 받아도(인터넷 끊김 등) 기본 글꼴로 그대로 보인다
  LOADERS[font.id]?.().catch(() => undefined);
  root.style.setProperty("--app-font", font.family);
  root.setAttribute("data-font", font.id);

  const theme = THEMES.find((t) => t.id === v.theme) ?? THEMES[0];
  root.style.setProperty("--color-ink", theme.ink);
  root.style.setProperty("--color-muted", theme.muted);
  root.toggleAttribute("data-dark", theme.dark);
  root.setAttribute("data-theme", theme.id);
}
