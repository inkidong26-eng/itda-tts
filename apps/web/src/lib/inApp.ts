// 앱 안 브라우저(카카오톡 등) 알아채기 (10/24 실제 폰 시험: 안드로이드 카톡 안에서는 폰 기본 목소리가 안 나옴).
// 바깥 브라우저(크롬·사파리)로 넘기는 주소를 만든다. 넘기지 못해도 이 화면에서 그대로 대화할 수 있다.

export type InApp = "kakao" | "other" | null;

export function detectInApp(ua: string): InApp {
  if (/KAKAOTALK/i.test(ua)) return "kakao";
  // 네이버·인스타그램·페이스북·라인 앱 안 브라우저
  if (/NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua)) return "other";
  return null;
}

/** 바깥 브라우저로 여는 주소. 못 만들면 null (그때는 안내만 보여 준다) */
export function externalUrl(kind: InApp, url: string, ua: string): string | null {
  if (kind === "kakao") return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
  if (kind === "other" && /Android/i.test(ua)) {
    // 안드로이드: 크롬으로 열기 (크롬이 없으면 폰이 고르게 해 준다)
    const u = new URL(url);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;end`;
  }
  return null; // 아이폰의 다른 앱은 넘길 방법이 없어 안내만
}

/** 안드로이드 앱 안 브라우저는 크롬으로 저절로 넘긴다 (10/30 실제 폰: 카톡 안에서는 말할 때마다 마이크 허용을 다시 묻는다).
 * 아이폰 카톡은 문제없어 그대로 둔다. "여기서 계속" 을 고르면 이 창에서는 다시 넘기지 않는다. */
export function autoLeaveUrl(ua: string, url: string, stayed: boolean): string | null {
  const kind = detectInApp(ua);
  if (!kind || stayed || !/Android/i.test(ua)) return null;
  return externalUrl(kind, url, ua);
}
