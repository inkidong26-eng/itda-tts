import { describe, expect, it } from "vitest";
import { clampScale, cleanName, nameError, scaleWord } from "./labels";

describe("이름 검사 (서버와 같은 규칙)", () => {
  it.each(["홍길동", "Kim Minji", "  이  슬  "])("통과: %s", (name) => {
    expect(nameError(name)).toBeNull();
  });
  it.each(["", "김", "a".repeat(21), "홍길동123", "<script>"])("거절: %s", (name) => {
    expect(nameError(name)).not.toBeNull();
  });
  it("앞뒤·중복 띄어쓰기 정리", () => {
    expect(cleanName("  이  슬  ")).toBe("이 슬");
  });
});

describe("목소리 카드 눈금", () => {
  it("1–2는 낮은 쪽, 3은 보통, 4–5는 높은 쪽", () => {
    expect(scaleWord(1, "낮은 편", "높은 편")).toBe("낮은 편");
    expect(scaleWord(3, "낮은 편", "높은 편")).toBe("보통");
    expect(scaleWord(5, "낮은 편", "높은 편")).toBe("높은 편");
  });
  it("이상한 값은 1–5로 맞추거나 숨김", () => {
    expect(clampScale(9)).toBe(5);
    expect(clampScale(0)).toBe(1);
    expect(clampScale(3.6)).toBe(4);
    expect(clampScale(undefined)).toBeNull();
    expect(clampScale("abc")).toBeNull();
  });
});
