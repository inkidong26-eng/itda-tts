import { speak } from "../api/client";
import { player, unlockAudio } from "../audio/player";
import { Button, Screen } from "../components/ui";
import { speechText } from "../lib/speechText";
import { PHRASE_SETS } from "../lib/phrases";
import { useState } from "react";
import type { Session } from "../storage/local";
import { HELP } from "../lib/help";

let seq = 0;

/** S5 홈 */
export function HomePage({ session, onSoon }: { session: Session; onSoon: (what: string) => void }) {
  const [setId, setSetId] = useState(PHRASE_SETS[0].id);
  const phrases = (PHRASE_SETS.find((p) => p.id === setId) ?? PHRASE_SETS[0]).phrases;
  // 약속: 어떤 오류에서도 소리로 나간다 (서버가 안 되면 폰 기본 음성)
  const say = (text: string) => {
    unlockAudio();
    const id = `q${Date.now().toString(36)}${(seq++).toString(36)}`;
    const fallback = () => player.enqueue({ id, fallback: true, text: speechText(text) || text });
    if (!session.voiceId) return fallback();
    speak(session.token, text, session.voiceId)
      .then((res) => player.enqueue({ id, url: res.url, fallback: res.fallback, text: res.displayText }))
      .catch(fallback);
  };

  return (
    <Screen help={HELP.home}>
      <header className="-mt-2 flex items-center gap-2 pr-12">
        <img src="/logo.png" alt="ITDA" width={720} height={199} className="h-auto w-24" />
        <span className="ml-auto truncate rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-brand-dark">
          ● {session.name}님 · {session.voiceName}
        </span>
      </header>

      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-brand-dark">장벽 없는 대화 ITDA</p>
        <p className="mt-1 text-2xl font-bold">{session.name}님, 반가워요</p>
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-dark text-xl text-white">🔊</span>
          <p className="min-w-0 flex-1 text-lg font-bold">내 목소리: {session.voiceName}</p>
        </div>
      </section>

      <button type="button" onClick={() => onSoon("마주보고 대화")}
        className="flex flex-col gap-2 rounded-3xl bg-gradient-to-br from-[#0e6582] to-brand-dark p-5 text-left text-white shadow-md active:opacity-90">
        <span className="w-fit rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">● 추천 · 폰 하나로 마주 앉아</span>
        <span className="text-3xl font-bold">🧑‍🤝‍🧑 마주보고 대화 →</span>
        <span className="text-base text-white/90">탁자에 폰을 두고, 내 글은 목소리로, 상대 말은 글자로 나눠 봐요.</span>
      </button>

      <button type="button" onClick={() => onSoon("전화로 대화")}
        className="flex flex-col gap-2 rounded-3xl bg-slate-800 p-5 text-left text-white shadow-md active:opacity-90">
        <span className="w-fit rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">🔗 링크 보내기 · 스피커 방식</span>
        <span className="text-3xl font-bold">📞 전화로 대화 →</span>
        <span className="text-base text-white/90">상대에게 링크를 보내거나, 일반 전화 중에 스피커로 써요.</span>
      </button>

      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <p className="text-lg font-bold">⚡ 빠른 말 <span className="text-sm font-normal text-muted">누르면 바로 말해요</span></p>
        <div className="mt-2 flex flex-wrap gap-1" role="tablist" aria-label="상황 고르기">
          {PHRASE_SETS.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={p.id === setId} onClick={() => setSetId(p.id)}
              className={`min-h-[44px] shrink-0 rounded-full border-2 px-3 text-base font-semibold ${p.id === setId ? "border-[#0e6582] bg-[#0e6582] text-white" : "border-slate-200 bg-white"}`}>
              {p.icon} {p.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {phrases.map((text, i) => {
            const wide = i === 0 && text.length > 14;
            return (
              <button key={text} type="button" onClick={() => say(text)}
                className={`relative min-h-[60px] rounded-2xl p-3 pr-8 text-left active:bg-slate-200 ${wide ? "col-span-2 bg-teal-50" : "bg-slate-50"}`}>
                <span aria-hidden="true" className="absolute right-2 top-2 text-base">🔊</span>
                <span className="block break-keep font-bold leading-snug">{text}</span>
              </button>
            );
          })}
        </div>
      </section>

      <Button variant="secondary" onClick={() => onSoon("설정")}>⚙️ 설정 (글자 크기 · 진동 알림)</Button>
    </Screen>
  );
}

/** 아직 만들지 않은 화면 */
export function SoonPage({ what, onHome }: { what: string; onHome: () => void }) {
  return (
    <Screen title={what} footer={<Button onClick={onHome}>홈으로</Button>}>
      <p className="text-xl">🛠️ 준비 중이에요. 곧 쓸 수 있어요.</p>
    </Screen>
  );
}
