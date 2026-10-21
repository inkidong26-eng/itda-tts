// 진동 (05 문서 5절). 아이폰 브라우저는 지원하지 않으므로 조용히 넘어간다.

export const PATTERNS = {
  start: [50],
  done: [40, 60, 40],
  fail: [300],
} as const;

export function vibrate(pattern: readonly number[]): void {
  try {
    if ("vibrate" in navigator) navigator.vibrate([...pattern]);
  } catch {
    // 무시
  }
}
