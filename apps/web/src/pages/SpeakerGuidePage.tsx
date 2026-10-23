// S7 스피커 방식 안내 (02 문서 S7, 06 문서 3절). 일반 전화 + 스피커폰 → ITDA 글이 폰 스피커로 나가 상대에게 들린다.
// 보조 방식: "글 → 음성"만 보장, 자막 없음. 기종에 따라 소리가 작거나 안 나올 수 있어 2대 방식을 함께 안내.
// 폰 볼륨·스피커 상태는 앱이 알 수 없으므로 상태 표시는 넣지 않는다 (안내 글만).
import { Button, Card, Screen } from "../components/ui";

const STEPS = [
  { icon: "📞", title: "평소처럼 전화를 거세요", text: "기본 전화 앱으로 상대와 먼저 연결해요." },
  { icon: "🔊", title: "통화 화면에서 스피커폰을 켜세요", text: "폰 볼륨도 끝까지 올려 주세요." },
  { icon: "⌨️", title: "ITDA로 돌아와 글을 치세요", text: "내 글이 목소리로 바뀌어 상대에게 들려요." },
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
          <li key={s.title} className="flex items-start gap-3 rounded-3xl bg-white p-4 shadow-sm">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0e6582] text-lg font-bold text-white">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold">{s.title}</span>
              <span className="block text-base text-muted">{s.text}</span>
            </span>
            <span aria-hidden="true" className="text-3xl">{s.icon}</span>
          </li>
        ))}
      </ol>
      <Card className="flex flex-col gap-2 bg-sky-50">
        <p className="text-lg font-bold">💡 알아 두세요</p>
        <p className="text-base">🔊 소리가 작으면 상대가 못 들을 수 있어요. 볼륨을 최대로 해 주세요.</p>
        <p className="text-base">💬 이 방식은 상대 말이 글자로 나오지 않아요. 자막이 필요하면 "링크로 전화 걸기"를 쓰세요.</p>
        <p className="text-base">📱 통화 중에 ITDA 소리가 안 나는 폰도 있어요. 그럴 땐 <b>다른 폰이나 태블릿</b>에서 ITDA를 켜고 통화 중인 폰 옆에 두세요.</p>
      </Card>
    </Screen>
  );
}
