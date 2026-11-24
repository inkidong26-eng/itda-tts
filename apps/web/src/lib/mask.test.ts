import { describe, expect, it } from "vitest";
import { maskedView, maskPieces } from "./mask";

describe("불편한 말 가리기", () => {
  it("잘못 알아들은 말을 가린다", () => {
    expect(maskedView("섹스")).toBe("○○");
    expect(maskedView("그 사람 변태 같아요")).toBe("그 사람 ○○ 같아요");
    expect(maskedView("씨발 진짜")).toBe("○○ 진짜");
    expect(maskedView("시발 뭐야")).toBe("○○ 뭐야");
  });

  it("일상 말은 그대로 둔다", () => {
    const plain = [
      "그거 보지 마세요", "영화 보지 않았어요", "지금 자지 마", "아기가 자지러지게 울어요",
      "꿈을 좇아요", "껌을 씹어요", "옷이 젖었어요", "걸레로 닦아요", "강아지 새끼가 귀여워요",
      "자위대 뉴스", "시발점이 어디예요", "시발역에서 만나요", "성폭행 신고하러 왔어요",
      "안녕하세요 반갑습니다", "섹시한 옷",
    ];
    for (const s of plain) expect(maskedView(s)).toBe(s);
  });

  it("원래 글은 조각에 그대로 남는다 (누르면 보이기)", () => {
    const pieces = maskPieces("아 변태네");
    expect(pieces).toEqual([
      { text: "아 ", masked: false },
      { text: "변태", masked: true },
      { text: "네", masked: false },
    ]);
    expect(pieces.map((p) => p.text).join("")).toBe("아 변태네");
  });

  it("빈 글", () => {
    expect(maskPieces("")).toEqual([]);
  });
});
