// 잇다 이야기 (11 문서 1절, docs/ui/잇다_이야기.md). 개발 동기와 철학.
import { Button, Screen } from "../components/ui";

export function AboutPage({ onBack }: { onBack: () => void }) {
  return (
    <Screen white footer={<Button variant="secondary" onClick={onBack}>← 설정으로</Button>}>
      <div className="flex flex-col gap-5">
        <img src="/logo.png" alt="ITDA" width={720} height={199} className="mx-auto h-auto w-56" />
        <p className="text-center text-base font-semibold text-muted">ITDA는 이렇게 시작되었습니다.</p>
        <p className="text-center text-2xl font-bold leading-snug text-brand-dark">"소리가 없어도, 이어집니다."</p>
        <p className="text-lg leading-relaxed">
          먼저 말을 걸기 어려운 불편을 덜고, 실시간으로 통화할 수 있고, 은행 창구나 관공서 같은 일상의 일도 혼자 해내기를 소원했습니다.
        </p>
        <p className="text-lg leading-relaxed">
          잇다는 그 어려운 거리를 잇는 <b>따뜻한 다리</b>가 되고 싶습니다.
          농인이 먼저 말을 걸 수 있고, 청인과 전화로도 이야기할 수 있고, 혼자서도 일상의 일을 해낼 수 있도록.
        </p>
        <p className="text-lg leading-relaxed">
          우리 사회에 어려움이 있다면 살피고, <b>차별 없는 밝은 미래</b>를 함께 만들어 가기 위함입니다.
        </p>
      </div>
    </Screen>
  );
}
