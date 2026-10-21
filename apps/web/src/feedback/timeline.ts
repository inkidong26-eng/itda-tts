// 단어 하이라이트용 시간표 (05 문서 2절). Qwen 은 단어별 시간을 주지 않으므로 음절 수 비례로 추정한다.
// 진행률(0~1)은 실제 재생 신호에서만 온다: 서버 음성 = 재생 위치, 기본 음성 = 읽는 글자 위치.

export type WordSpan = { word: string; start: number; end: number }; // start·end 는 0~1

const SYLLABLES_PER_SEC = 6;
// 문장 부호 쉼 (04 문서 5절: … 0.5초, , 0.2초 / 문장 끝 0.3초) → 음절 단위로 바꿔 더한다
const PAUSE_SEC: [RegExp, number][] = [[/(…|\.{2,}|,{2,})$/, 0.5], [/[.?!]$/, 0.3], [/,$/, 0.2]];

/** 한 어절을 말하는 데 드는 대략의 음절 수 (한글 1자 = 1, 영문 2.5자 = 1, 숫자 1자 = 1.5) */
export function syllables(word: string): number {
  const hangul = (word.match(/[가-힣]/g) ?? []).length;
  const latin = (word.match(/[A-Za-z]/g) ?? []).length;
  const digits = (word.match(/[0-9]/g) ?? []).length;
  return Math.max(1, hangul + latin / 2.5 + digits * 1.5);
}

function pauseAfter(word: string): number {
  for (const [pattern, sec] of PAUSE_SEC) if (pattern.test(word)) return sec * SYLLABLES_PER_SEC;
  return 0;
}

export function timeline(text: string): WordSpan[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const weights = words.map((w) => ({ word: w, speak: syllables(w), pause: pauseAfter(w) }));
  const total = weights.reduce((s, w) => s + w.speak + w.pause, 0) || 1;
  let at = 0;
  return weights.map((w) => {
    const start = at / total;
    at += w.speak;
    const span = { word: w.word, start, end: at / total };
    at += w.pause;
    return span;
  });
}

/** 진행률에 해당하는 어절 번호 (쉼 구간이면 바로 앞 어절) */
export function wordAt(spans: WordSpan[], progress: number): number {
  if (!spans.length) return -1;
  let index = 0;
  for (let i = 0; i < spans.length; i++) if (progress >= spans[i].start) index = i;
  return index;
}
