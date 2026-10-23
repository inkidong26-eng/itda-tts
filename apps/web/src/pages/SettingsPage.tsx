// S9 설정 (11 문서 3절): 글자 크기 5 · 글씨체 7 · 글자색 7 · 알림 · 대화 기록 · 잇다 이야기 · 계정 관리(깊은 곳)
import { useState } from "react";
import { Button, Card, Notice, Screen } from "../components/ui";
import { HELP } from "../lib/help";
import { history } from "../storage/history";
import { FONT_STEPS, FONTS, type FontStep, THEMES, type ViewSettings } from "../storage/settings";

export function SettingsPage({ view, onView, onHome, onAbout, onRestart }: {
  view: ViewSettings;
  onView: (v: ViewSettings) => void;
  onHome: () => void;
  onAbout: () => void;
  onRestart: () => void; // 처음부터 다시 하기 (새 가입)
}) {
  const [confirm, setConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [restartStep, setRestartStep] = useState<0 | 1 | 2>(0);

  const clear = async () => {
    await history.clear();
    setConfirm(false);
    setCleared(true);
  };

  const restart = async () => {
    await history.clear();
    onRestart();
  };

  return (
    <Screen title="⚙️ 설정" help={HELP.settings} footer={<Button onClick={onHome}>홈으로</Button>}>
      <Card>
        <h2 className="mb-2 text-lg font-bold">🔠 글자 크기</h2>
        <div className="grid grid-cols-5 gap-1" role="group" aria-label="글자 크기">
          {FONT_STEPS.map((f, i) => {
            const on = view.font === i;
            return (
              <button key={f.label} type="button" aria-pressed={on} aria-label={f.label}
                onClick={() => onView({ ...view, font: i as FontStep })}
                className={`flex min-h-[64px] flex-col items-center justify-center rounded-xl border-2 ${on ? "border-[#0e6582] bg-[#0e6582] text-white" : "border-slate-200 bg-white"}`}>
                <span aria-hidden="true" className="font-bold leading-none" style={{ fontSize: `${14 + i * 4}px` }}>가</span>
                <span className="mt-1 text-[11px] leading-none">{f.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-center text-xl font-bold" aria-label="미리보기">소리가 없어도, 우리는 이어집니다</p>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-bold">✒️ 글씨체</h2>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="글씨체">
          {FONTS.map((f) => {
            const on = view.family === f.id;
            return (
              <button key={f.id} type="button" aria-pressed={on} onClick={() => onView({ ...view, family: f.id })}
                className={`min-h-[56px] rounded-xl border-2 px-3 py-2 text-left ${on ? "border-[#0e6582] bg-teal-50" : "border-slate-200 bg-white"}`}>
                <span className="block font-bold">{on ? "✓ " : ""}{f.label}</span>
                <span className="block text-sm text-muted">{f.note}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-bold">🎨 글자색</h2>
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="글자색">
          {THEMES.map((t) => {
            const on = view.theme === t.id;
            return (
              <button key={t.id} type="button" aria-pressed={on} onClick={() => onView({ ...view, theme: t.id })}
                className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border-2 ${on ? "border-[#0e6582] ring-2 ring-[#0e6582]" : "border-slate-200"}`}
                style={{ background: t.dark ? "#121212" : "#ffffff" }}>
                <span aria-hidden="true" className="text-2xl font-bold leading-none" style={{ color: t.ink }}>가</span>
                <span className="text-xs font-semibold" style={{ color: t.ink }}>{on ? "✓ " : ""}{t.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-muted">고대비·저시력은 눈이 불편한 분께 추천해요.</p>
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

      <Button variant="secondary" onClick={onAbout}>🌉 잇다 이야기</Button>

      {/* 계정 관리: 일부러 접어 두어 잘 보이지 않게 (11 문서 3절) */}
      <details className="rounded-2xl px-1 text-muted">
        <summary className="min-h-[48px] cursor-pointer py-3 text-base">계정 관리</summary>
        <div className="flex flex-col gap-2 pb-2">
          {restartStep === 0 && (
            <button type="button" className="min-h-[48px] text-left text-base underline" onClick={() => setRestartStep(1)}>처음부터 다시 하기</button>
          )}
          {restartStep === 1 && (
            <>
              <Notice kind="error">처음부터 다시 하면 이름·목소리를 새로 정하고, 이 폰의 대화 기록도 지워져요.</Notice>
              <Button variant="secondary" onClick={() => setRestartStep(2)}>계속</Button>
              <Button variant="secondary" onClick={() => setRestartStep(0)}>아니요</Button>
            </>
          )}
          {restartStep === 2 && (
            <>
              <Notice kind="error">정말 처음부터 할까요? 지금 목소리는 다시 쓸 수 없어요.</Notice>
              <Button onClick={() => void restart()}>네, 처음부터 할게요</Button>
              <Button variant="secondary" onClick={() => setRestartStep(0)}>아니요</Button>
            </>
          )}
        </div>
      </details>
    </Screen>
  );
}
