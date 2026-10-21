// 1단계: 글의 표현으로 감정 추정 (04 문서 3절 표). 폰에서 즉시 계산, 서버로 보내지 않는다.

import type { EmotionCode, EmotionResult } from "./types";

type Scores = Record<Exclude<EmotionCode, "calm">, number>;

// 동점이면 덜 극단적인(평온에 가까운) 감정을 고른다
const GENTLE_FIRST: Exclude<EmotionCode, "calm">[] = ["joy", "sad", "plead", "surprise", "angry"];

const has = (text: string, words: string[]) => words.filter((w) => text.includes(w));

const SAD_EMOJI = ["😢", "😭", "🥲"];
const JOY_EMOJI = ["😄", "😆", "🤣", "😊"];
const SURPRISE_EMOJI = ["😲", "😮"];
const ANGRY_EMOJI = ["😠", "😡"];
const PLEAD_WORDS = ["제발", "부탁", "도와주세요", "꼭", "🙏"];
const ANGRY_WORDS = ["화나", "짜증", "왜 이래", "아니잖아요"];
const FEAR_WORDS = ["무서", "걱정", "떨려", "불안"];
const URGENT_WORDS = ["쫓아", "도망", "살려", "숨이", "따라와"];
const SAD_WORDS = ["아프", "아파", "편찮", "슬프", "슬퍼", "속상", "힘들", "힘드", "돌아가셨"];
const JOY_WORDS = ["감사", "고마", "좋아", "행복", "축하"];
const SORRY_WORDS = ["죄송", "미안"];
const SURPRISE_WORDS = ["헐", "대박", "진짜?"];

export function estimate(raw: string): EmotionResult {
  const text = raw.trim();
  const s: Scores = { joy: 0, sad: 0, angry: 0, surprise: 0, plead: 0 };
  const reasons: string[] = [];
  let intensity = 2;
  let tremor = 0;
  let gentle = false;

  const cry = (text.match(/[ㅠㅜ]/g) ?? []).length;
  if (cry >= 2) { s.sad += 2; tremor += cry >= 3 ? 2 : 1; reasons.push("ㅠㅠ"); }
  if (has(text, SAD_EMOJI).length) { s.sad += 2; tremor += 1; reasons.push("슬픈 이모지"); }

  if (/[ㅋㅎ]{2,}/.test(text) || has(text, JOY_EMOJI).length || text.includes("^^")) { s.joy += 2; reasons.push("웃음"); }

  const bangs = (text.match(/!/g) ?? []).length;
  if (bangs === 1) { intensity += 1; reasons.push("!"); }
  if (bangs >= 2) { intensity += 2; reasons.push("!!"); }

  if (/\?!|!\?/.test(text) || has(text, SURPRISE_WORDS).length || has(text, SURPRISE_EMOJI).length) {
    s.surprise += 2; reasons.push("놀람 표현");
  }

  const pauses = (text.match(/…|\.{2,}|,{2,}/g) ?? []).length;
  if (pauses) {
    s.sad += 1; s.plead += 1; tremor += 1; reasons.push("…");
    if (pauses >= 2) tremor += 1; // 문장 중간에 여러 번 = 머뭇거림
  }

  if (has(text, PLEAD_WORDS).length) { s.plead += 2; reasons.push("부탁 표현"); }
  if (has(text, ANGRY_WORDS).length || has(text, ANGRY_EMOJI).length || /(.)\1{4,}/.test(text.replace(/[ㅋㅎㅠㅜ!.…,\s]/g, ""))) {
    s.angry += 2; reasons.push("화난 표현");
  }
  if (has(text, FEAR_WORDS).length) { tremor += 2; s.plead += 1; s.sad += 1; reasons.push("두려움 단어"); }
  if (has(text, URGENT_WORDS).length) { tremor += 2; s.plead += 1; reasons.push("다급함 단어"); }
  if (has(text, SAD_WORDS).length) { s.sad += 2; reasons.push("슬픔 단어"); }
  if (has(text, JOY_WORDS).length) { s.joy += 1; reasons.push("좋은 말"); }
  if (has(text, SORRY_WORDS).length) { s.plead += 1; gentle = true; reasons.push("사과"); }

  let best: EmotionCode = "calm";
  let top = 0;
  for (const code of GENTLE_FIRST) {
    if (s[code] > top) { best = code; top = s[code]; }
  }
  // !! 만 있고 다른 감정이 없으면: 물음표가 있으면 놀람, 없으면 기쁨
  if (best === "calm" && bangs >= 2) best = text.includes("?") ? "surprise" : "joy";
  if (gentle && bangs === 0) intensity = 1; // 사과는 조심스럽게

  return {
    emotion: best,
    intensity: Math.min(3, Math.max(1, intensity)) as 1 | 2 | 3,
    tremor: Math.min(3, tremor) as 0 | 1 | 2 | 3,
    source: "auto",
    reasons,
  };
}
