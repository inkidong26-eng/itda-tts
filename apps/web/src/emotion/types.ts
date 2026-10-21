// 감정 체계 (04 문서 2절). 색은 칩 테두리·말풍선 띠·경계선에, 글자색은 항상 진한 색(대비 4.5:1)으로.

export type EmotionCode = "calm" | "joy" | "sad" | "angry" | "surprise" | "plead";

export type EmotionResult = {
  emotion: EmotionCode;
  intensity: 1 | 2 | 3;
  tremor: 0 | 1 | 2 | 3;
  source: "auto" | "chip";
  reasons: string[];
};

export const EMOTIONS: { code: EmotionCode; label: string; icon: string; color: string }[] = [
  { code: "calm", label: "평온", icon: "🙂", color: "#1A9A9A" },
  { code: "joy", label: "기쁨", icon: "😄", color: "#F5B700" },
  { code: "sad", label: "슬픔", icon: "😢", color: "#3B6FD8" },
  { code: "angry", label: "화남", icon: "😠", color: "#D93A3A" },
  { code: "surprise", label: "놀람", icon: "😲", color: "#F08A4B" },
  { code: "plead", label: "간절", icon: "🙏", color: "#8A5CD8" },
];

export const INTENSITY_LABEL = { 1: "약", 2: "보통", 3: "강" } as const;
export const TREMOR_LABEL = { 0: "없음", 1: "약", 2: "중", 3: "강" } as const;

export function emotionInfo(code: EmotionCode) {
  return EMOTIONS.find((e) => e.code === code) ?? EMOTIONS[0];
}

export const CALM: EmotionResult = { emotion: "calm", intensity: 2, tremor: 0, source: "auto", reasons: [] };

/** "슬픔 · 떨림 약" 처럼 짧게 */
export function describe(r: Pick<EmotionResult, "emotion" | "intensity" | "tremor">): string {
  const parts = [emotionInfo(r.emotion).label];
  if (r.intensity !== 2) parts.push(`세기 ${INTENSITY_LABEL[r.intensity]}`);
  if (r.tremor > 0) parts.push(`떨림 ${TREMOR_LABEL[r.tremor]}`);
  return parts.join(" · ");
}
