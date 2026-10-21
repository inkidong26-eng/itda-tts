// 서버에 닿지 않을 때 폰 기본 음성이 읽을 글. 서버의 정규화(03 문서 7절)를 아주 간단히 흉내 낸다:
// 이모지·ㅋㅋ·ㅠㅠ·^^ 는 소리 내어 읽지 않는다. 'ㅋㅋ' 만 보내면 '하하'.

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2B00}-\u{2BFF}]/gu;

export function speechText(raw: string): string {
  const text = raw.trim();
  if (/^[ㅋㅎ\s]+$/.test(text) && /[ㅋㅎ]{2,}/.test(text)) return "하하";
  return text.replace(EMOJI, " ").replace(/[ㅋㅎ]{2,}|[ㅠㅜ]+|\^\^+/g, " ").replace(/\s+/g, " ").trim();
}
