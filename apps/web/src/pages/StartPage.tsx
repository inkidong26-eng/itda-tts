import { useEffect, useState } from "react";
import { warmup } from "../api/client";
import { unlockAudio } from "../audio/player";
import { Button, Screen } from "../components/ui";

type InstallEvent = Event & { prompt: () => Promise<void> };

/** S1 시작 화면 */
export function StartPage({ onStart }: { onStart: () => void }) {
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

  useEffect(() => {
    const keep = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", keep);
    return () => window.removeEventListener("beforeinstallprompt", keep);
  }, []);

  const start = () => {
    // 첫 터치: 소리 재생 권한 열기 + 음성 서버 미리 깨우기
    unlockAudio();
    warmup();
    onStart();
  };

  return (
    <Screen
      white
      footer={
        <>
          <Button onClick={start} className="!min-h-[64px] !text-xl">시작하기 →</Button>
          <p className="text-center text-base text-muted">
            {install ? (
              <button type="button" className="min-h-[56px] font-semibold text-navy underline" onClick={() => void install.prompt()}>
                📲 홈 화면에 추가하기 (앱처럼 쓸 수 있어요)
              </button>
            ) : isIOS ? (
              "📲 홈 화면에 추가하려면: 아래 공유 버튼 → '홈 화면에 추가'"
            ) : (
              "📲 홈 화면에 추가하면 앱처럼 쓸 수 있어요 (브라우저 메뉴 → 홈 화면에 추가)"
            )}
          </p>
        </>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        {/* 다리 로고 안에 ITDA 글자가 들어 있다 */}
        <img src="/logo.png" alt="ITDA" width={720} height={199} className="h-auto w-80 max-w-[85vw]" />
        <p className="text-2xl font-bold text-brand-dark">잇다</p>
        <p className="text-xl font-semibold">소리가 없어도, 우리는 이어집니다.</p>
        <p className="text-muted">이 앱은 글을 목소리로 바꿔 상대에게 들려줘요. 상대방은 설치가 필요 없어요.</p>
      </div>
    </Screen>
  );
}
