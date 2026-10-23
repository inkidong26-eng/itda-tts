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
      footer={
        <>
          <Button onClick={start} className="!min-h-[64px] !text-xl">대화 시작하기 →</Button>
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
      <div className="flex flex-1 flex-col justify-center gap-4">
        {/* 다리 로고 안에 ITDA 글자가 들어 있다 */}
        <img src="/logo.png" alt="ITDA" width={720} height={199} className="mx-auto h-auto w-64 max-w-[75vw]" />
        <div>
          <h1 className="text-2xl font-bold leading-snug">글과 소리로 서로를 잇는 <span className="text-brand-dark">잇다</span></h1>
          <p className="mt-2 text-lg text-muted">내 글은 목소리로, 상대 말은 글자로. 상대방은 설치 없이 바로 대화해요.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-2xl bg-sky-50 p-3">
            <span aria-hidden="true" className="text-2xl">✍️</span>
            <span><span className="block font-bold">글 → 목소리</span><span className="block text-sm text-muted">내 목소리로 들려줘요</span></span>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-orange-50 p-3">
            <span aria-hidden="true" className="text-2xl">👂</span>
            <span><span className="block font-bold">말 → 글자</span><span className="block text-sm text-muted">큰 글씨 자막</span></span>
          </div>
        </div>
      </div>
    </Screen>
  );
}
