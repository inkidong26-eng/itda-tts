// 청인 말 자막 합치기 (11/1 실제 링크 통화: 안드로이드 크롬이 말하는 도중 결과를 여러 번 '확정'으로 보내
// "근데" / "근데 왜" / "근데 왜 반말이야" 가 따로 말풍선이 됨). 이어지는 말은 앞 말풍선을 고쳐 쓴다.

export type LastCaption = { id: string; text: string; at: number };

const WINDOW_MS = 6000; // 이 시간 안에 이어지는 말만 합친다
const squash = (s: string) => s.replace(/[\s.,!?~…"'·]/g, "");

/** append: 새 말풍선 / replace: 앞 말풍선을 새 글로 / drop: 같은 말이거나 앞 말의 일부라 무시 */
export function mergeCaption(last: LastCaption | null, text: string, now: number): "append" | "replace" | "drop" {
  if (!last || now - last.at > WINDOW_MS) return "append";
  const before = squash(last.text);
  const next = squash(text);
  if (!next || next === before || before.startsWith(next)) return "drop";
  if (next.startsWith(before)) return "replace";
  return "append";
}
