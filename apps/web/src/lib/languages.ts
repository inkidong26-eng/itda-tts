// 상대 언어 (11 문서 5절). 외국인과 마주보고 대화할 때 🌐 로 고른다.
// speech: 폰 음성 인식·읽기 언어. 외국어 목소리는 우선 폰 기본 목소리로 낸다 (GPU 목소리는 한국어 전용).

export type LangCode = "ko" | "en" | "ja" | "zh";

export const LANGUAGES: { code: LangCode; flag: string; label: string; native: string; speech: string }[] = [
  { code: "ko", flag: "🇰🇷", label: "한국어", native: "한국어", speech: "ko-KR" },
  { code: "en", flag: "🇺🇸", label: "영어", native: "English", speech: "en-US" },
  { code: "ja", flag: "🇯🇵", label: "일본어", native: "日本語", speech: "ja-JP" },
  { code: "zh", flag: "🇨🇳", label: "중국어", native: "中文", speech: "zh-CN" },
];

export const langInfo = (code: LangCode) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];

const CONSENT_KEY = "itda.translateConsent";

export function hasTranslateConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveTranslateConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, "1");
  } catch {
    // 저장이 안 되면 다음에 다시 묻는다
  }
}

/** 통역을 켤 때 한 번 받는 동의 (11 문서 5절) */
export const TRANSLATE_CONSENT =
  "통역을 켜면 대화 글이 번역을 위해 DeepL(독일)로 보내져요. 무료 버전이라 DeepL이 글을 보관할 수 있어요. 주민번호·계좌번호 같은 개인정보는 쓰지 마세요.";
