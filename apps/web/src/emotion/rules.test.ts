// 04 문서 7절 완료 확인용 문장 11개 + 경계 사례
import { describe as group, expect, it } from "vitest";
import { estimateWithContext, type Turn } from "./context";
import { estimate } from "./rules";
import { describe as label } from "./types";

group("04 문서 7절 테스트 문장", () => {
  it("1. 안녕하세요 → 평온", () => {
    expect(estimate("안녕하세요")).toMatchObject({ emotion: "calm", tremor: 0 });
  });
  it("2. 정말 감사해요!! → 기쁨, 세기 3", () => {
    expect(estimate("정말 감사해요!!")).toMatchObject({ emotion: "joy", intensity: 3 });
  });
  it("3. 괜찮아요ㅠㅠ → 슬픔, 떨림 1", () => {
    expect(estimate("괜찮아요ㅠㅠ")).toMatchObject({ emotion: "sad", tremor: 1 });
  });
  it("4. 괜찮아요ㅠㅠㅠㅠ → 슬픔, 떨림 2", () => {
    expect(estimate("괜찮아요ㅠㅠㅠㅠ")).toMatchObject({ emotion: "sad", tremor: 2 });
  });
  it("5. 제발 도와주세요… → 간절, 떨림 1", () => {
    expect(estimate("제발 도와주세요…")).toMatchObject({ emotion: "plead", tremor: 1 });
  });
  it("6. 헐 진짜요?! → 놀람", () => {
    expect(estimate("헐 진짜요?!").emotion).toBe("surprise");
  });
  it("7. 왜 이렇게 하세요 이건 아니잖아요 → 화남", () => {
    expect(estimate("왜 이렇게 하세요 이건 아니잖아요").emotion).toBe("angry");
  });
  it("8. 저… 조금… 무서워요 → 간절 또는 슬픔, 떨림 2 이상", () => {
    const r = estimate("저… 조금… 무서워요");
    expect(["plead", "sad"]).toContain(r.emotion);
    expect(r.tremor).toBeGreaterThanOrEqual(2);
  });
  it("9. (앞 청인 자막 '많이 편찮으세요') 그렇군요 → 슬픔, 세기 1", () => {
    const recent: Turn[] = [{ role: "other", text: "많이 편찮으세요" }];
    expect(estimateWithContext("그렇군요", recent)).toMatchObject({ emotion: "sad", intensity: 1 });
  });
  it("10. OK 알겠어요 ㅎㅎ → 기쁨", () => {
    expect(estimate("OK 알겠어요 ㅎㅎ").emotion).toBe("joy");
  });
  it("11. 가쁜 숨소리는 누가 쫓아오는 듯해,,, → 간절 또는 슬픔, 떨림 2 이상", () => {
    const r = estimate("가쁜 숨소리는 누가 쫓아오는 듯해,,,");
    expect(["plead", "sad"]).toContain(r.emotion);
    expect(r.tremor).toBeGreaterThanOrEqual(2);
  });
});

group("대화 흐름", () => {
  it("단서가 있으면 앞 대화를 따르지 않는다", () => {
    const recent: Turn[] = [{ role: "other", text: "많이 편찮으세요" }];
    expect(estimateWithContext("정말 축하해요ㅎㅎ", recent).emotion).toBe("joy");
  });
  it("최근 3개 안에서만 이어받는다", () => {
    const recent: Turn[] = [
      { role: "me", text: "x", emotion: { emotion: "angry", intensity: 2, tremor: 0 } },
      { role: "me", text: "a", emotion: { emotion: "calm", intensity: 2, tremor: 0 } },
      { role: "me", text: "b", emotion: { emotion: "calm", intensity: 2, tremor: 0 } },
      { role: "me", text: "c", emotion: { emotion: "calm", intensity: 2, tremor: 0 } },
    ];
    expect(estimateWithContext("네", recent).emotion).toBe("calm");
  });
  it("아직 아무것도 안 쳤으면 이어받지 않는다", () => {
    const recent: Turn[] = [{ role: "other", text: "많이 편찮으세요" }];
    expect(estimateWithContext("  ", recent).emotion).toBe("calm");
  });
  it("가장 최근의 평온이 아닌 감정을 이어받는다", () => {
    const recent: Turn[] = [
      { role: "me", text: "a", emotion: { emotion: "sad", intensity: 2, tremor: 0 } },
      { role: "me", text: "b", emotion: { emotion: "joy", intensity: 2, tremor: 0 } },
    ];
    const r = estimateWithContext("그렇군요", recent);
    expect(r).toMatchObject({ emotion: "joy", intensity: 1 });
    expect(r.reasons).toEqual(["앞 대화: 기쁨"]);
  });
});

group("경계 사례", () => {
  it("!! 만 있고 다른 단서가 없으면 기쁨, 물음표가 있으면 놀람", () => {
    expect(estimate("내일 가요!!").emotion).toBe("joy");
    expect(estimate("내일 가요?!!").emotion).toBe("surprise");
  });
  it("사과는 세기 1", () => {
    expect(estimate("죄송합니다")).toMatchObject({ emotion: "plead", intensity: 1 });
  });
  it("떨림은 3을 넘지 않는다", () => {
    expect(estimate("저… 정말… 무서워요ㅠㅠㅠ 살려 주세요").tremor).toBe(3);
  });
  it("빈 글은 평온", () => {
    expect(estimate("   ")).toMatchObject({ emotion: "calm", reasons: [] });
  });
  it("짧은 설명 문구", () => {
    expect(label(estimate("괜찮아요ㅠㅠ"))).toBe("슬픔 · 떨림 약");
    expect(label(estimate("죄송합니다"))).toBe("간절 · 세기 약");
  });
});
