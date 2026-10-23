// S7 스피커 방식 안내 (02 문서 S7, 06 문서 3절). 일반 전화 + 스피커폰 → ITDA 글이 폰 스피커로 나가 상대에게 들린다.
// 보조 방식: "글 → 음성"만 보장, 자막 없음. 기종에 따라 소리가 작거나 안 나올 수 있어 2대 방식을 함께 안내.
// 폰 볼륨·스피커 상태는 앱이 알 수 없으므로 상태 표시는 넣지 않는다 (안내 글만).
import { Button, Card, Screen } from "../components/ui";
import { HELP } from "../lib/help";

const STEPS = ["평소처럼 전화를 거세요", "스피커폰을 켜고, 볼륨을 최대로 올리세요", "ITDA로 돌아와 글을 치세요"];

export function SpeakerGuidePage({ onStart, onBack }: { onStart: () => void; onBack: () => void }) {
  return (
    <Screen
      title="📱 일반 전화 중에 쓰기"
      help={HELP.speaker}
      footer={
        <>
          <Button onClick={onStart}>대화 화면 열기</Button>
          <Button variant="secondary" onClick={onBack}>← 뒤로</Button>
        </>
      }
    >
      <ol className="flex flex-col gap-3">
        {STEPS.map((text, i) => (
          <li key={text} className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0e6582] text-lg font-bold text-white">{i + 1}</span>
            <span className="text-lg font-bold">{text}</span>
          </li>
        ))}
      </ol>
      <Card className="bg-sky-50">
        <p className="text-base">💡 ITDA 소리가 안 나는 폰도 있어요. 그럴 땐 <b>다른 폰·태블릿</b>에서 ITDA를 켜고 옆에 두세요.</p>
      </Card>
    </Screen>
  );
}
