import { speak } from "../api/client";
import { player, unlockAudio } from "../audio/player";
import { Button, Screen } from "../components/ui";
import { speechText } from "../lib/speechText";
import type { Session } from "../storage/local";

// 홈에서 바로 말하는 빠른 말 4개 (기록에는 남기지 않는다)
const QUICK = [
  { text: "안녕하세요", note: "인사" },
  { text: "감사합니다", note: "인사·감사" },
  { text: "잠시만 기다려 주세요", note: "양해 구하기" },
  { text: "저는 글로 대화해요", note: "농인 안내" },
];

let seq = 0;

/** S5 홈 */
export function HomePage({ session, onSoon, onVoice }: { session: Session; onSoon: (what: string) => void; onVoice: () => void }) {
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
    <Screen>
      <header className="-mt-2 flex items-center gap-2">
        <img src="/logo.png" alt="ITDA" width={720} height={199} className="h-auto w-24" />
        <span className="ml-auto truncate rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-brand-dark">
          ● {session.name}님 · {session.voiceName}
        </span>
        <button type="button" onClick={() => onSoon("설정")} aria-label="설정"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl active:bg-slate-100">⚙️</button>
      </header>

      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-brand-dark">장벽 없는 대화 ITDA</p>
        <p className="mt-1 text-2xl font-bold">{session.name}님, 반가워요</p>
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-dark text-xl text-white">🔊</span>
          <p className="min-w-0 flex-1 text-lg font-bold">내 목소리: {session.voiceName}</p>
          <button type="button" onClick={onVoice}
            className="min-h-[48px] shrink-0 whitespace-nowrap rounded-xl border-2 border-gray-300 bg-white px-3 font-semibold">변경 ›</button>
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
        <p className="text-lg font-bold">⚡ 자주 쓰는 빠른 말 <span className="text-sm font-normal text-muted">누르면 바로 말해요</span></p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {QUICK.map((q) => (
            <button key={q.text} type="button" onClick={() => say(q.text)}
              className="relative min-h-[64px] rounded-2xl bg-slate-50 p-3 pr-8 text-left active:bg-slate-200">
              <span aria-hidden="true" className="absolute right-2 top-2 text-base">🔊</span>
              <span className="block break-keep font-bold leading-snug">{q.text}</span>
              <span className="block text-sm text-muted">{q.note}</span>
            </button>
          ))}
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
