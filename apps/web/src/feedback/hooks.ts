// 재생 신호(player.ts)를 화면 표시로 바꾸는 도우미. 가짜 애니메이션 없이 실제 신호로만 움직인다.
import { useEffect, useRef, useState } from "react";
import { player, type PlayerEvent, type Source } from "../audio/player";
import type { SignalBus } from "./bus";
import { PATTERNS, vibrate } from "./vibrate";

export type Speaking = {
  playing: boolean;
  source: Source | null;
  level: number | null;   // 서버 음성만 실제 소리 크기. 기본 음성은 잴 수 없어 null
  progress: number;       // 0~1 실제 재생 위치 (서버) / 읽는 글자 위치 (기본 음성)
};

const IDLE: Speaking = { playing: false, source: null, level: null, progress: 0 };

/** 한 메시지의 재생 상태 (이 메시지만 다시 그린다) */
export function useSpeaking(id: string | undefined, bus: SignalBus = player): Speaking {
  const [s, setS] = useState<Speaking>(IDLE);
  useEffect(() => {
    // 시작 신호가 이미 지나간 뒤에 붙은 화면도 지금 재생 중임을 알 수 있게
    const now = bus.nowPlaying();
    setS(id && now?.id === id ? { playing: true, source: now.source, level: now.source === "server" ? 0 : null, progress: 0 } : IDLE);
    if (!id) return;
    return bus.subscribe((e: PlayerEvent) => {
      if (e.id !== id) return;
      if (e.type === "start") setS({ playing: true, source: e.source, level: e.source === "server" ? 0 : null, progress: 0 });
      if (e.type === "level") setS((c) => ({ ...c, level: e.level, progress: e.progress }));
      if (e.type === "boundary") setS((c) => ({ ...c, progress: e.progress }));
      if (e.type === "end") setS((c) => ({ ...c, playing: false, level: null, progress: 1 }));
      if (e.type === "error") setS(IDLE);
    });
  }, [id, bus]);
  return s;
}

/** 지금 소리 내는 메시지 id (없으면 null) */
export function useNowPlaying(bus: SignalBus = player): string | null {
  const [id, setId] = useState<string | null>(() => bus.nowPlaying()?.id ?? null);
  useEffect(() => bus.subscribe((e) => {
    if (e.type === "start") setId(e.id);
    if (e.type === "end" || e.type === "error") setId((cur) => (cur === e.id ? null : cur));
  }), [bus]);
  return id;
}

export const MIN_PULSE_MS = 120;
const PULSE_LEVEL = 0.15;

/** 소리 크기 → 진동 펄스를 낼지 (05 문서 5절: 0.1초마다 측정, 최소 간격 120ms) */
export function pulseFor(level: number, lastAt: number, now: number): number | null {
  if (level < PULSE_LEVEL || now - lastAt < MIN_PULSE_MS) return null;
  return level > 0.5 ? 60 : 40;
}

/** 안드로이드 진동. 아이폰 브라우저는 진동을 지원하지 않아 조용히 넘어간다 */
export function useVibration(enabled: boolean, bus: SignalBus = player): void {
  const last = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    return bus.subscribe((e) => {
      if (e.type === "start") vibrate(PATTERNS.start);
      if (e.type === "end") vibrate(PATTERNS.done);
      if (e.type === "error") vibrate(PATTERNS.fail);
      if (e.type === "level") {
        const now = performance.now();
        const ms = pulseFor(e.level, last.current, now);
        if (ms) { last.current = now; vibrate([ms]); }
      }
    });
  }, [enabled, bus]);
}
