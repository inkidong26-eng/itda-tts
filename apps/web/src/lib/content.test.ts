import { describe, expect, it } from "vitest";
import { HELP } from "./help";
import { PHRASE_SETS } from "./phrases";
import { FONTS, THEMES } from "../storage/settings";

describe("화면 문구", () => {
  it("상황별 빠른 말: 묶음마다 문구가 있고 100자 이하, 묶음 안에서 겹치지 않는다", () => {
    for (const set of PHRASE_SETS) {
      expect(set.phrases.length).toBeGreaterThan(0);
      expect(new Set(set.phrases).size).toBe(set.phrases.length);
      expect(set.phrases.every((p) => p.length > 0 && p.length <= 100)).toBe(true);
    }
  });

  it("사용 설명서: 화면마다 제목과 설명이 있다", () => {
    for (const h of Object.values(HELP)) {
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.items.length).toBeGreaterThan(0);
    }
  });

  it("글씨체 7개, 글자색 7개 (11 문서 2절)", () => {
    expect(FONTS).toHaveLength(7);
    expect(THEMES).toHaveLength(7);
  });
});
