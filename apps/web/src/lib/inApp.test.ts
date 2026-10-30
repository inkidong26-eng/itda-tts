import { describe, expect, it } from "vitest";
import { autoLeaveUrl, detectInApp, externalUrl } from "./inApp";

const KAKAO_ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 KAKAOTALK 10.8.0";
const KAKAO_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const INSTA_ANDROID = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 Instagram 300.0";
const INSTA_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0";
const CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const URL_ = "https://itda.gyeot.ai.kr/c/aXfG9foHyBmU";

describe("앱 안 브라우저", () => {
  it("카카오톡·인스타그램을 알아채고, 크롬·사파리는 그대로 둔다", () => {
    expect(detectInApp(KAKAO_ANDROID)).toBe("kakao");
    expect(detectInApp(KAKAO_IOS)).toBe("kakao");
    expect(detectInApp(INSTA_ANDROID)).toBe("other");
    expect(detectInApp(CHROME)).toBeNull();
    expect(detectInApp(SAFARI)).toBeNull();
  });

  it("카카오톡은 바깥 브라우저 열기 주소, 안드로이드 다른 앱은 크롬 주소, 아이폰 다른 앱은 안내만", () => {
    expect(externalUrl("kakao", URL_, KAKAO_IOS)).toBe(`kakaotalk://web/openExternal?url=${encodeURIComponent(URL_)}`);
    expect(externalUrl("other", URL_, INSTA_ANDROID)).toBe("intent://itda.gyeot.ai.kr/c/aXfG9foHyBmU#Intent;scheme=https;package=com.android.chrome;end");
    expect(externalUrl("other", URL_, INSTA_IOS)).toBeNull();
  });
});

describe("안드로이드 앱 안에서는 크롬으로 저절로", () => {
  it("안드로이드 카톡·인스타만 넘기고, 아이폰·크롬·'여기서 계속'은 그대로", () => {
    expect(autoLeaveUrl(KAKAO_ANDROID, URL_, false)).toBe(`kakaotalk://web/openExternal?url=${encodeURIComponent(URL_)}`);
    expect(autoLeaveUrl(INSTA_ANDROID, URL_, false)).toContain("package=com.android.chrome");
    expect(autoLeaveUrl(KAKAO_IOS, URL_, false)).toBeNull();
    expect(autoLeaveUrl(CHROME, URL_, false)).toBeNull();
    expect(autoLeaveUrl(KAKAO_ANDROID, URL_, true)).toBeNull();
  });
});
