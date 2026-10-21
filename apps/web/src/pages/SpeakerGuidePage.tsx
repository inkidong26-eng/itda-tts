// S7 스피커 방식 안내 (02 문서 S7, 06 문서 3절). 일반 전화 + 스피커폰 → ITDA 글이 폰 스피커로 나가 상대에게 들린다.
// 보조 방식: "글 → 음성"만 보장, 자막 없음. 기종에 따라 소리가 작거나 안 나올 수 있어 2대 방식을 함께 안내.
import { Button, Notice, Screen } from "../components/ui";

const STEPS = [
  { icon: "📞", text: "평소처럼 전화를 거세요" },
  { icon: "🔊", text: "통화 화면에서 스피커폰을 켜세요" },
  { icon: "⌨️", text: "ITDA로 돌아와 글을 치면 상대에게 들려요" },
];

export function SpeakerGuidePage({ onStart, onBack }: { onStart: () => void; onBack: () => void }) {
  return (
    <Screen
      title="📱 일반 전화 중에 쓰기"
      footer={
        <>
          <Button onClick={onStart}>대화 화면 열기</Button>
          <Button variant="secondary" onClick={onBack}>← 뒤로</Button>
        </>
      }
    >
      <ol className="flex flex-col gap-3">
        {STEPS.map((s, i) => (
          <li key={s.text} className="flex items-center gap-4 rounded-2xl border-2 border-gray-200 p-4">
            <span aria-hidden="true" className="text-4xl">{s.icon}</span>
            <span className="text-lg font-semibold">{i + 1}. {s.text}</span>
          </li>
        ))}
      </ol>
      <Notice kind="info">폰 볼륨을 최대로 올려 주세요. 소리가 작으면 상대가 못 들을 수 있어요.</Notice>
      <Notice kind="info">이 방식은 상대 말 자막이 나오지 않아요. 자막이 필요하면 "링크로 전화 걸기"를 쓰세요.</Notice>
      <p className="text-base text-muted">
        통화 중에 ITDA 소리가 안 나는 폰도 있어요. 그럴 때는 <b>다른 폰이나 태블릿</b>에서 ITDA를 켜고, 통화 중인 폰 옆에 두고 쓰세요.
      </p>
    </Screen>
  );
}
