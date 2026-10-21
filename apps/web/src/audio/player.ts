// 소리 재생은 이 파일로만 한다 (규칙). 지금은 들어보기용 최소 기능, 재생 큐·소리 크기·비상 음성은 T09에서 추가.

let ctx: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;

/** 아이폰은 첫 터치 안에서만 소리를 열 수 있다 → S1 첫 버튼에서 부른다 */
export function unlockAudio(): void {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    // 오디오를 못 여는 기기 — 재생할 때 다시 시도
  }
}

export type PlayHandlers = {
  onStart?: (durationSec: number) => void;
  onProgress?: (ratio: number) => void; // 0~1, 실제 재생 위치
  onEnd?: () => void;
  onError?: () => void;
};

export function stopAudio(): void {
  try {
    current?.stop();
  } catch {
    // 이미 멈춤
  }
  current = null;
}

export async function playUrl(url: string, h: PlayHandlers = {}): Promise<void> {
  stopAudio();
  try {
    unlockAudio();
    if (!ctx) throw new Error("no audio");
    const data = await (await fetch(url)).arrayBuffer();
    const buffer = await ctx.decodeAudioData(data);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    current = source;
    const startedAt = ctx.currentTime;
    const audioCtx = ctx;
    let raf = 0;
    const tick = () => {
      if (current !== source) return;
      h.onProgress?.(Math.min(1, (audioCtx.currentTime - startedAt) / buffer.duration));
      raf = requestAnimationFrame(tick);
    };
    source.onended = () => {
      cancelAnimationFrame(raf);
      if (current === source) current = null;
      h.onProgress?.(1);
      h.onEnd?.();
    };
    source.start();
    h.onStart?.(buffer.duration);
    raf = requestAnimationFrame(tick);
  } catch {
    h.onError?.();
  }
}
