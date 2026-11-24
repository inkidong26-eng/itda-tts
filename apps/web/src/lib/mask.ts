// 청인 말 자막에서 불편한 말 가리기 (11/24 시연: 음성 인식이 잘못 알아들어 "변태"·"섹스" 등이 자막에 뜸).
// 브라우저 음성 인식에는 거르는 설정이 없어서, 화면에 그릴 때만 가린다. 원래 글은 그대로 두고 누르면 보인다.
// 목록은 일상 말과 겹치지 않는 것만. 겹치는 말은 넣지 않는다: 보지(보지 마), 자지(자지 마·자지러지다),
// 좇(꿈을 좇다), 씹(씹다), 젖(젖다), 걸레, 새끼(강아지 새끼), 자위(자위대), 강간·성폭행(신고할 때 필요한 말).

const WORDS = [
  // 성적인 말
  "섹스", "섹파", "변태", "야동", "포르노", "오르가즘", "딸딸이", "꼴려", "꼴리", "몸캠", "창녀",
  // 욕
  "씨발", "씨팔", "씨벌", "씨바", "존나", "좆", "병신", "개새끼", "개새기", "지랄", "미친놈", "미친년",
  "썅", "씹새끼", "씹할", "니미럴", "염병", "엠창",
];

// "시발"은 시발점·시발역(처음 출발)과 겹쳐서 뒤에 점·역이 오면 가리지 않는다
const PATTERN = new RegExp(`${WORDS.join("|")}|시발(?![점역])`, "gi");

export type Piece = { text: string; masked: boolean };

/** 글을 조각으로 나눈다. 가릴 말은 masked: true */
export function maskPieces(text: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const at = m.index ?? 0;
    if (at > last) pieces.push({ text: text.slice(last, at), masked: false });
    pieces.push({ text: m[0], masked: true });
    last = at + m[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last), masked: false });
  return pieces;
}

/** 가린 모습 (글자 수만큼 ○) — 시험·화면 공통 */
export function maskedView(text: string): string {
  return maskPieces(text).map((p) => (p.masked ? "○".repeat(p.text.length) : p.text)).join("");
}
