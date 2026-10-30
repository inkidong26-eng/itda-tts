import { type ReactNode, useState } from "react";
import { detectInApp } from "../lib/inApp";
import { InAppNotice } from "./InAppNotice";

/** 크롬으로 넘긴 뒤 카톡 안 창에 남는 화면. 넘어가지 않았으면 버튼으로 다시, 또는 여기서 계속 */
export function InAppGate({ stayKey, app }: { stayKey: string; app: ReactNode }) {
  const [stay, setStay] = useState(false);
  const kind = detectInApp(navigator.userAgent);
  if (stay || !kind) return <>{app}</>;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 bg-slate-50 px-4 py-6">
      <p className="text-center text-2xl font-bold">크롬에서 열고 있어요</p>
      <InAppNotice kind={kind} onStay={() => {
        try { sessionStorage.setItem(stayKey, "1"); } catch { /* 저장 못 해도 계속 */ }
        setStay(true);
      }} />
    </main>
  );
}
