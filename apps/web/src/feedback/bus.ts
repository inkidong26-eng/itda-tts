// 재생 신호 통로. 대면 모드는 내 폰의 player, 링크 통화는 "상대 폰에서 온 재생 신호"를 같은 모양으로 흘려보낸다.
// 그래서 막대·하이라이트·진동·테두리 빛이 어느 쪽이든 같은 부품으로 실제 신호를 따라 움직인다.
import type { PlayerEvent, Source } from "../audio/player";

export type SignalBus = {
  subscribe(listener: (e: PlayerEvent) => void): () => void;
  nowPlaying(): { id: string; source: Source } | null;
};

export function createBus(): SignalBus & { emit(e: PlayerEvent): void } {
  const listeners = new Set<(e: PlayerEvent) => void>();
  let current: { id: string; source: Source } | null = null;
  return {
    emit(e) {
      if (e.type === "start") current = { id: e.id, source: e.source };
      if ((e.type === "end" || e.type === "error") && current?.id === e.id) current = null;
      listeners.forEach((l) => l(e));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    nowPlaying: () => current,
  };
}
