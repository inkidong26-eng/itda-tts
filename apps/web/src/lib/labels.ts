// 화면 문구와 값 변환. 사용자 문구는 짧고 쉬운 한국어 존댓말.

export const AGE_GROUPS = [
  { value: "10s", label: "10대" },
  { value: "20s", label: "20대" },
  { value: "30s", label: "30대" },
  { value: "40s", label: "40대" },
  { value: "50s", label: "50대" },
  { value: "60s", label: "60대" },
  { value: "70s", label: "70대 이상" },
] as const;

export const GENDERS = [
  { value: "f", label: "여성" },
  { value: "m", label: "남성" },
] as const;

export function ageLabel(value: string): string {
  return AGE_GROUPS.find((a) => a.value === value)?.label ?? value;
}

export function genderLabel(value: string): string {
  return value === "m" ? "남성" : "여성";
}

const NAME_PATTERN = /^[가-힣a-zA-Z ]{2,20}$/;

/** 서버와 같은 규칙 (한글·영문 2–20자). 문제가 없으면 null */
export function nameError(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return "이름을 적어 주세요";
  if (!NAME_PATTERN.test(name)) return "한글이나 영문 2–20자로 적어 주세요";
  return null;
}

export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** 목소리 카드 눈금 4줄 (02 문서 S4) */
export const SCALES = [
  { key: "pitch", title: "높이", low: "낮은 편", high: "높은 편" },
  { key: "speed", title: "빠르기", low: "느린 편", high: "빠른 편" },
  { key: "mood", title: "분위기", low: "차분함", high: "밝음" },
  { key: "strength", title: "힘", low: "부드러움", high: "힘참" },
] as const;

export function scaleWord(value: number, low: string, high: string): string {
  if (value <= 2) return low;
  if (value >= 4) return high;
  return "보통";
}

export function clampScale(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(5, Math.max(1, Math.round(n)));
}
