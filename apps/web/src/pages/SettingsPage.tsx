// S9 설정 (일부). 지금은 글자 크기와 대화 기록 지우기. 목소리 바꾸기·속도·진동 등은 다음 작업에서.
import { useState } from "react";
import { Button, Card, Notice, Screen } from "../components/ui";
import { history } from "../storage/history";
import { FONT_STEPS, type ViewSettings } from "../storage/settings";

export function SettingsPage({ view, onView, onHome, onVoice }: {
  view: ViewSettings;
  onView: (v: ViewSettings) => void;
  onHome: () => void;
  onVoice: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);

  const clear = async () => {
    await history.clear();
    setConfirm(false);
    setCleared(true);
  };

  return (
    <Screen title="⚙️ 설정" footer={<Button onClick={onHome}>홈으로</Button>}>
      <Card>
      <fieldset>
        <legend className="mb-2 text-lg font-bold">🔠 글자 크기</legend>
        <div className="grid grid-cols-3 gap-2">
          {FONT_STEPS.map((f, i) => (
            <Button key={f.label} variant="choice" selected={view.font === i}
              onClick={() => onView({ ...view, font: i as 0 | 1 | 2 })}>{f.label}</Button>
          ))}
        </div>
      </fieldset>
      <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-center text-xl font-bold" aria-label="글자 크기 미리보기">가나다 ITDA 잇다</p>
      </Card>

      <Card>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-bold">🔔 말할 때 알림</legend>
        <Button variant="choice" selected={view.vibrate} onClick={() => onView({ ...view, vibrate: !view.vibrate })}>
          📳 진동 {view.vibrate ? "켜짐" : "꺼짐"} <span className="font-normal">(안드로이드)</span>
        </Button>
        <Button variant="choice" selected={view.glow} onClick={() => onView({ ...view, glow: !view.glow })}>
          💡 테두리 빛 {view.glow ? "켜짐" : "꺼짐"} <span className="font-normal">(아이폰 권장)</span>
        </Button>
      </fieldset>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">🔒 대화 기록</h2>
        <p className="text-muted">대화 기록은 이 폰에만 저장돼요. 서버에는 남지 않아요.</p>
        {!confirm ? (
          <Button variant="secondary" onClick={() => { setConfirm(true); setCleared(false); }}>🗑️ 대화 기록 지우기</Button>
        ) : (
          <>
            <Notice kind="error">이 폰의 대화 기록을 모두 지울까요? 되돌릴 수 없어요.</Notice>
            <Button onClick={() => void clear()}>네, 지울게요</Button>
            <Button variant="secondary" onClick={() => setConfirm(false)}>아니요</Button>
          </>
        )}
        {cleared && <Notice kind="info">✅ 대화 기록을 지웠어요</Notice>}
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">🔊 내 목소리</h2>
        <Button variant="secondary" onClick={onVoice}>목소리 바꾸기 ›</Button>
        <p className="text-base text-muted">🛠️ 말하기 속도는 준비 중이에요.</p>
      </Card>
    </Screen>
  );
}
