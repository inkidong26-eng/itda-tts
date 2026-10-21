// 05 문서 1·2·6절: "말하는 중" 막대, 단어 하이라이트, 테두리 빛. 모두 실제 재생 신호(useSpeaking)로만 움직인다.
import { Fragment, useEffect, useMemo, useState } from "react";
import { player } from "../audio/player";
import type { SignalBus } from "../feedback/bus";
import { useSpeaking } from "../feedback/hooks";
import { timeline, wordAt } from "../feedback/timeline";

/** "말하는 중" 막대 1개. 서버 음성: 소리 크기만큼 / 기본 음성: 잴 수 없으므로 말하는 동안 고정 + 배지 */
export function SpeakingBar({ id, color, bus }: { id: string | undefined; color: string; bus?: SignalBus }) {
  const s = useSpeaking(id, bus);
  if (!s.playing) return null;
  const fixed = s.level === null;
  const width = fixed ? 100 : Math.round(15 + s.level! * 85);
  return (
    <div className="flex w-full items-center gap-2" aria-hidden="true">
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full transition-[width] duration-100"
          style={{ width: `${width}%`, background: color, opacity: fixed ? 0.6 : 0.5 + s.level! * 0.5 }} />
      </div>
      {fixed && <span className="text-sm font-semibold text-muted">기본 목소리</span>}
    </div>
  );
}

/** 노래방 자막처럼: 읽은 어절은 진하게, 지금 어절은 감정 색 배경 + 살짝 크게, 아직은 옅게 */
export function HighlightText({ id, text, color, bus }: { id: string | undefined; text: string; color: string; bus?: SignalBus }) {
  const s = useSpeaking(id, bus);
  const spans = useMemo(() => timeline(text), [text]);
  const now = s.playing ? wordAt(spans, s.progress) : -1;
  return (
    <>
      {spans.map((w, i) => {
        const done = !s.playing || i < now;
        const current = i === now;
        // 띄어쓰기는 상자 밖에: inline-block 상자 안 끝 공백은 사라져 단어가 붙어 보인다
        return (
          <Fragment key={i}>
            <span className={`inline-block rounded-md px-0.5 transition-transform ${current ? "scale-110" : ""}`}
              style={{ background: current ? `${color}55` : undefined, color: done || current ? "#111827" : "#9ca3af" }}>
              {w.word}
            </span>
            {i < spans.length - 1 ? " " : ""}
          </Fragment>
        );
      })}
    </>
  );
}

type Blink = { color: string; times: number; key: number } | null;

/** 화면 가장자리 빛 (아이폰 기본). 소리 크기에 맞춰 0.2~1.0, 완료 2번·실패 빨강 3번 깜박 */
export function EdgeGlow({ enabled, colorFor, bus = player, flash }: {
  enabled: boolean;
  colorFor: (id: string) => string;
  bus?: SignalBus;
  flash?: { color: string; times: number; key: number } | null; // 연결됨(초록 3번) 같은 알림 깜박임
}) {
  const [glow, setGlow] = useState<{ color: string; opacity: number } | null>(null);
  const [blink, setBlink] = useState<Blink>(null);

  useEffect(() => {
    if (!enabled) { setGlow(null); return; }
    return bus.subscribe((e) => {
      if (e.type === "start") setGlow({ color: colorFor(e.id), opacity: e.source === "server" ? 0.2 : 0.6 });
      if (e.type === "level") setGlow((g) => g && { ...g, opacity: 0.2 + e.level * 0.8 });
      if (e.type === "end") { setGlow(null); setBlink({ color: colorFor(e.id), times: 2, key: Date.now() }); }
      if (e.type === "error") { setGlow(null); setBlink({ color: "#D93A3A", times: 3, key: Date.now() }); }
    });
  }, [enabled, colorFor, bus]);

  useEffect(() => { if (enabled && flash) setBlink(flash); }, [enabled, flash]);

  if (!enabled || (!glow && !blink)) return null;
  const color = glow?.color ?? blink!.color;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50"
      style={glow
        ? { boxShadow: `inset 0 0 0 8px ${color}`, opacity: glow.opacity, transition: "opacity 100ms" }
        : { boxShadow: `inset 0 0 0 8px ${color}`, animation: `itda-blink 500ms ease-in-out ${blink!.times}` }}
      key={glow ? "glow" : blink!.key}
      onAnimationEnd={() => setBlink(null)} />
  );
}
