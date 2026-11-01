import { describe, expect, it } from "vitest";
import { mergeCaption } from "./captionMerge";

const last = (text: string, at = 0) => ({ id: "a", text, at });

describe("청인 자막 합치기", () => {
  it("이어지는 말은 앞 말풍선을 고친다", () => {
    expect(mergeCaption(last("근데"), "근데 왜", 1000)).toBe("replace");
    expect(mergeCaption(last("근데 왜"), "근데 왜 반말이야", 2000)).toBe("replace");
  });
  it("같은 말·앞 말의 일부가 다시 오면 무시한다 (띄어쓰기·문장부호 달라도)", () => {
    expect(mergeCaption(last("근데 왜 반말이야"), "근데 왜 반말이야", 1000)).toBe("drop");
    expect(mergeCaption(last("근데 왜 반말이야"), "근데왜 반말이야?", 1000)).toBe("drop");
    expect(mergeCaption(last("근데 왜 반말이야"), "근데 왜", 1000)).toBe("drop");
  });
  it("다른 말이거나 시간이 지나면 새 말풍선", () => {
    expect(mergeCaption(null, "안녕하세요", 0)).toBe("append");
    expect(mergeCaption(last("근데"), "네 알겠어요", 1000)).toBe("append");
    expect(mergeCaption(last("근데"), "근데 왜", 7000)).toBe("append");
  });
});
