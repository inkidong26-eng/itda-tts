// 대화 중 화면 꺼짐 막기 (11 문서 3절). 지원하지 않는 폰이면 아무 일도 하지 않는다.
import { useEffect } from "react";

type Sentinel = { release: () => Promise<void> };
type WakeLockApi = { request: (type: "screen") => Promise<Sentinel> };

export function useKeepScreenOn(active = true): void {
  useEffect(() => {
    if (!active) return;
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!api) return;
    let lock: Sentinel | null = null;
    let alive = true;
    const take = () => {
      if (document.visibilityState !== "visible") return;
      api.request("screen").then((l) => {
        if (alive) lock = l; else void l.release().catch(() => undefined);
      }).catch(() => undefined); // 배터리 절약 모드 등으로 거절돼도 대화는 그대로
    };
    take();
    // 다른 앱에 갔다 돌아오면 다시 잡는다 (폰이 자동으로 풀기 때문)
    document.addEventListener("visibilitychange", take);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", take);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
