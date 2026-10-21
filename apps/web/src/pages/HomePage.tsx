import { Button, Screen } from "../components/ui";
import type { Session } from "../storage/local";

/** S5 홈: 큰 버튼 2개 */
export function HomePage({ session, onSoon }: { session: Session; onSoon: (what: string) => void }) {
  return (
    <Screen
      footer={
        <Button variant="secondary" onClick={() => onSoon("설정")}>⚙️ 설정</Button>
      }
    >
      <div>
        <p className="text-2xl font-bold">{session.name}님, 반가워요</p>
        <p className="mt-1 text-muted">내 목소리: <b className="text-ink">{session.voiceName}</b></p>
      </div>
      <div className="flex flex-1 flex-col gap-4">
        <button type="button" onClick={() => onSoon("마주보고 대화")}
          className="flex min-h-[140px] flex-1 flex-col items-center justify-center gap-2 rounded-3xl bg-navy text-2xl font-bold text-white active:bg-blue-950">
          <span aria-hidden="true" className="text-5xl">🧑‍🤝‍🧑</span>
          마주보고 대화
        </button>
        <button type="button" onClick={() => onSoon("전화로 대화")}
          className="flex min-h-[140px] flex-1 flex-col items-center justify-center gap-2 rounded-3xl bg-brand-dark text-2xl font-bold text-white active:bg-teal-900">
          <span aria-hidden="true" className="text-5xl">📞</span>
          전화로 대화
        </button>
      </div>
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
