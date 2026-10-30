import { externalUrl, type InApp } from "../lib/inApp";
import { Button } from "./ui";

/** 카카오톡 등 앱 안에서 열렸을 때: 소리·마이크가 잘 안 돼 바깥 브라우저로 넘기는 안내 */
export function InAppNotice({ kind, onStay }: { kind: NonNullable<InApp>; onStay?: () => void }) {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const target = externalUrl(kind, window.location.href, ua);
  const browser = isIOS ? "사파리" : "크롬";
  return (
    <section className="flex flex-col gap-2 rounded-2xl border-2 border-orange-300 bg-orange-50 p-4">
      <p className="text-lg font-bold">🔊 {kind === "kakao" ? "카카오톡" : "앱"} 안에서 열렸어요</p>
      <p className="text-base">여기서는 목소리가 안 들리거나 마이크 허용을 계속 물어볼 수 있어요. {browser}에서 열어 주세요.</p>
      {target ? (
        <Button onClick={() => { window.location.href = target; }}>{isIOS ? "사파리로" : "크롬으로"} 열기</Button>
      ) : (
        <p className="text-base">오른쪽 위 <b>⋯</b> 메뉴 → <b>"{browser}에서 열기"</b>를 눌러 주세요.</p>
      )}
      {onStay && (
        <button type="button" onClick={onStay} className="min-h-[48px] text-base text-muted underline">여기서 계속 쓰기</button>
      )}
    </section>
  );
}
