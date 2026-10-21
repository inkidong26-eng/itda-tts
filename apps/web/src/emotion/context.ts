// 2단계: 대화 흐름 반영 (04 문서 3절). 지금 문장에 단서가 없으면 최근 대화 3개 중 평온이 아닌 감정을 세기 1로 이어받는다.

import { estimate } from "./rules";
import { emotionInfo, type EmotionCode, type EmotionResult } from "./types";

export type Turn = {
  role: "me" | "other";
  text: string;
  emotion?: { emotion: EmotionCode; intensity: number; tremor: number };
};

export const CONTEXT_SIZE = 3;

/** 청인 자막에는 감정이 없으므로 같은 규칙(단어 부분)으로 추정한다 */
function emotionOf(turn: Turn): EmotionCode {
  return turn.emotion?.emotion ?? estimate(turn.text).emotion;
}

export function estimateWithContext(text: string, recent: Turn[]): EmotionResult {
  const own = estimate(text);
  if (!text.trim()) return own; // 아직 아무것도 안 쳤으면 이어받지 않는다
  if (own.reasons.length > 0 || own.emotion !== "calm") return own;
  const previous = recent.slice(-CONTEXT_SIZE).reverse().find((t) => emotionOf(t) !== "calm");
  if (!previous) return own;
  const inherited = emotionOf(previous);
  return { ...own, emotion: inherited, intensity: 1, reasons: [`앞 대화: ${emotionInfo(inherited).label}`] };
}
