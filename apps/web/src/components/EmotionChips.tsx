// 감정 칩 (04 문서 4절). 자동 추정은 점선 테두리로 옅게, 직접 고른 칩은 진하게 + ✓.
// - 칩 누르기: 그 메시지만 덮어쓰기 / 같은 칩 다시: 자동으로 / 떨림 칩: 없음→약→중→강 순환
// - 길게 누르기(0.5초): 세기 약·보통·강 고르기 / 보낸 뒤 자동으로 초기화 (부모가 manual 을 지움)
import { useRef, useState } from "react";
import { describe, EMOTIONS, type EmotionCode, type EmotionResult, INTENSITY_LABEL, TREMOR_LABEL } from "../emotion/types";

export type Manual = { emotion?: EmotionCode; intensity?: 1 | 2 | 3; tremor?: 0 | 1 | 2 | 3 };

/** 자동 추정 위에 직접 고른 값을 덮어쓴 최종 감정 */
export function finalEmotion(auto: EmotionResult, manual: Manual): EmotionResult {
  const touched = manual.emotion !== undefined || manual.tremor !== undefined || manual.intensity !== undefined;
  return {
    emotion: manual.emotion ?? auto.emotion,
    intensity: manual.intensity ?? (manual.emotion ? 2 : auto.intensity),
    tremor: manual.tremor ?? auto.tremor,
    source: touched ? "chip" : "auto",
    reasons: auto.reasons,
  };
}

const LONG_PRESS_MS = 500;

export function EmotionChips({ auto, manual, onChange }: {
  auto: EmotionResult;
  manual: Manual;
  onChange: (m: Manual) => void;
}) {
  const [picking, setPicking] = useState<EmotionCode | null>(null);
  const timer = useRef<number | null>(null);
  const pointerAt = useRef(0); // 손가락·마우스로 처리한 시각 (뒤따르는 click 은 무시)
  const openedAt = useRef(0);  // 세기 고르기를 연 시각
  const final = finalEmotion(auto, manual);
  const tremor = final.tremor;

  const tap = (code: EmotionCode) => {
    setPicking(null);
    onChange(manual.emotion === code ? { ...manual, emotion: undefined, intensity: undefined } : { ...manual, emotion: code, intensity: undefined });
  };
  // 손을 떼는 순간 결정: 0.5초 전에 떼면 누르기, 넘게 누르고 있었으면 세기 고르기만 연다
  const press = (code: EmotionCode) => {
    cancel();
    timer.current = window.setTimeout(() => { timer.current = null; openedAt.current = Date.now(); setPicking(code); }, LONG_PRESS_MS);
  };
  const lift = (code: EmotionCode) => {
    pointerAt.current = Date.now();
    if (timer.current !== null) { cancel(); tap(code); }
  };
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  // 키보드·화면 읽기 프로그램으로 누른 경우 (손가락 처리 직후의 click 은 무시)
  const click = (code: EmotionCode) => {
    if (Date.now() - pointerAt.current > 800) tap(code);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-base" aria-live="polite">
        {final.source === "auto"
          ? <span className="text-muted">자동: {EMOTIONS.find((e) => e.code === final.emotion)?.icon} {describe(final)}</span>
          : <span className="font-semibold">내가 고름: {EMOTIONS.find((e) => e.code === final.emotion)?.icon} {describe(final)}</span>}
      </p>
      {/* 세기 고르기는 칩 "위"에 연다: 입력칸이 화면 아래에 붙어 있어 칩이 손가락 밑에서 움직이지 않는다 */}
      {picking && (
        <div className="flex items-center gap-2 rounded-xl border-2 border-gray-300 p-2" role="group" aria-label="세기 고르기">
          <span className="font-semibold">{EMOTIONS.find((e) => e.code === picking)?.label} 세기</span>
          {([1, 2, 3] as const).map((level) => (
            <button key={level} type="button"
              onClick={() => {
                if (Date.now() - openedAt.current < 400) return; // 길게 누른 손을 뗄 때 생기는 click 무시
                onChange({ ...manual, emotion: picking, intensity: level });
                setPicking(null);
              }}
              className={`min-h-[56px] flex-1 rounded-xl border-2 font-bold ${final.intensity === level && final.emotion === picking ? "border-navy bg-blue-50" : "border-gray-300"}`}>
              {INTENSITY_LABEL[level]}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-7 gap-1" role="group" aria-label="감정 고르기">
        {EMOTIONS.map((e) => {
          const chosen = manual.emotion === e.code;
          const autoPick = !manual.emotion && auto.emotion === e.code;
          return (
            <button key={e.code} type="button"
              onPointerDown={() => press(e.code)} onPointerUp={() => lift(e.code)} onPointerLeave={cancel} onPointerCancel={cancel}
              onContextMenu={(ev) => ev.preventDefault()}
              onClick={() => click(e.code)}
              aria-pressed={chosen}
              className="flex min-h-[56px] min-w-0 select-none flex-col items-center justify-center rounded-xl border-2 px-0 text-xs font-semibold text-ink"
              style={{
                borderColor: chosen || autoPick ? e.color : "#d1d5db",
                borderStyle: autoPick ? "dashed" : "solid",
                background: chosen ? `${e.color}33` : autoPick ? `${e.color}14` : "#fff",
                WebkitTouchCallout: "none", // 아이폰 길게 누르기 메뉴 막기
              }}>
              <span aria-hidden="true" className="text-xl leading-none">{e.icon}</span>
              {chosen ? "✓" : ""}{e.label}
            </button>
          );
        })}
        <button type="button" aria-label={`떨림 ${TREMOR_LABEL[tremor]}`}
          onClick={() => onChange({ ...manual, tremor: ((tremor + 1) % 4) as 0 | 1 | 2 | 3 })}
          className="flex min-h-[56px] min-w-0 flex-col items-center justify-center rounded-xl border-2 text-xs font-semibold text-ink"
          style={{ borderColor: tremor ? "#6b7280" : "#d1d5db", borderStyle: manual.tremor === undefined && tremor ? "dashed" : "solid" }}>
          <span aria-hidden="true" className="text-base leading-none">{tremor ? "〰".repeat(tremor) : "—"}</span>
          떨림
        </button>
      </div>
    </div>
  );
}
