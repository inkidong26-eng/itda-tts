import { useState } from "react";
import { ApiError, chooseVoice, listVoices, signup, warmup } from "../api/client";
import { unlockAudio } from "../audio/player";
import { Character } from "../components/Character";
import { Notice, Screen } from "../components/ui";
import type { Session } from "../storage/local";

// 기관 창구 QR(/q) 로 처음 온 사람: 남녀만 고르면 바로 마주보고 대화 (11/24).
// 이름·나이는 묻지 않는다 → 이름은 "방문자", 목소리는 듣기 무난한 40대.
const VISITOR_NAME = "방문자";
const VISITOR_AGE = "40s";
const VISITOR_VOICE = { m: "v40m1", f: "v40f1" } as const;

export function QuickStartPage({ onReady }: { onReady: (session: Session) => void }) {
  const [busy, setBusy] = useState<"m" | "f" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (gender: "m" | "f") => {
    unlockAudio(); // 첫 터치: 소리 재생 권한 열기 (아이폰)
    warmup();
    setBusy(gender);
    setError(null);
    try {
      const res = await signup(VISITOR_NAME, VISITOR_AGE, gender);
      const voiceId = VISITOR_VOICE[gender];
      await chooseVoice(res.token, voiceId);
      const name = await listVoices(res.token, VISITOR_AGE)
        .then((list) => list.find((v) => v.id === voiceId)?.name)
        .catch(() => undefined); // 이름은 보여 주기용이라 못 받아도 계속
      onReady({ token: res.token, userId: res.userId, name: VISITOR_NAME, ageGroup: VISITOR_AGE, gender, voiceId, voiceName: name });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "문제가 생겼어요. 다시 눌러 주세요");
      setBusy(null);
    }
  };

  const choice = (gender: "m" | "f", icon: string, label: string) => (
    <button type="button" disabled={busy !== null} onClick={() => void start(gender)}
      className="flex min-h-[120px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-brand-dark bg-white text-2xl font-bold text-ink shadow-sm active:bg-teal-50 disabled:opacity-60">
      <span aria-hidden="true" className="text-4xl">{icon}</span>
      {busy === gender ? "⏳ 잠시만요…" : label}
    </button>
  );

  return (
    <Screen white>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <Character pose="wave" who="both" height={130} />
        <img src="/logo.png" alt="ITDA 잇다" width={720} height={199} className="h-auto w-56 max-w-[70vw]" />
        <div>
          <p className="text-2xl font-bold">글로 쓰면, 목소리로 말해 드려요</p>
          <p className="mt-1 text-muted">설치 없이 바로 창구 직원과 대화할 수 있어요</p>
        </div>
        <div className="w-full">
          <p className="mb-3 text-xl font-semibold text-brand-dark">어떤 목소리로 말할까요?</p>
          <div className="flex gap-3">
            {choice("m", "👨", "남자 목소리")}
            {choice("f", "👩", "여자 목소리")}
          </div>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        <p className="break-keep text-sm text-muted">
          이름 등 개인정보는 묻지 않아요. 대화 내용은 저장하지 않아요.<br />
          이미 잇다를 쓰고 계시면 홈 화면의 잇다 앱을 열어 주세요.
        </p>
      </div>
    </Screen>
  );
}
