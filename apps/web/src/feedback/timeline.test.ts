import { describe, expect, it } from "vitest";
import { syllables, timeline, wordAt } from "./timeline";

describe("단어 하이라이트 시간표", () => {
  it("음절 수에 비례해 나눈다", () => {
    const t = timeline("안녕 반가워요");
    // 2음절 + 4음절 → 첫 어절이 1/3
    expect(t[0]).toMatchObject({ word: "안녕", start: 0 });
    expect(t[0].end).toBeCloseTo(2 / 6);
    expect(t[1].end).toBeCloseTo(1);
  });

  it("쉼표·말줄임표 뒤에는 쉬는 시간을 둔다", () => {
    const t = timeline("저… 무서워요");
    // "저"(1) + 쉼 0.5초(3) + "무서워요"(4) = 8
    expect(t[0].end).toBeCloseTo(1 / 8);
    expect(t[1].start).toBeCloseTo(4 / 8);
  });

  it("영문·숫자도 대략의 길이를 준다", () => {
    expect(syllables("OK")).toBe(1);
    expect(syllables("3시에")).toBeCloseTo(3.5);
    expect(syllables("😊")).toBe(1);
  });

  it("진행률로 지금 읽는 어절을 찾는다", () => {
    const t = timeline("하나 둘 셋");
    expect(wordAt(t, 0)).toBe(0);
    expect(wordAt(t, 0.5)).toBe(1);
    expect(wordAt(t, 0.99)).toBe(2);
    expect(wordAt(t, 1)).toBe(2);
    expect(wordAt([], 0.5)).toBe(-1);
  });

  it("쉬는 구간에서는 바로 앞 어절에 머문다", () => {
    const t = timeline("저… 무서워요");
    expect(wordAt(t, 0.3)).toBe(0);
  });
});

import { MIN_PULSE_MS, pulseFor } from "./hooks";

describe("진동 펄스 (05 문서 5절)", () => {
  it("소리가 작으면 떨지 않는다", () => {
    expect(pulseFor(0.05, 0, 1000)).toBeNull();
  });
  it("최소 간격 120ms 를 지킨다", () => {
    expect(pulseFor(0.3, 1000, 1000 + MIN_PULSE_MS - 1)).toBeNull();
    expect(pulseFor(0.3, 1000, 1000 + MIN_PULSE_MS)).toBe(40);
  });
  it("소리가 크면 조금 더 길게", () => {
    expect(pulseFor(0.8, 0, 1000)).toBe(60);
  });
});
