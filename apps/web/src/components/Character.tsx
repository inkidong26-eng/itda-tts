// 잇다 캐릭터 그림 (11/4). 꾸밈용이라 버튼·대화·마이크와 얽히지 않게:
// - 크기를 미리 잡아 늦게 떠도 화면이 밀리지 않고, 안 뜨면 저절로 숨는다
// - 눌리지 않고, 화면 읽기 프로그램은 건너뛴다
// - 대화·통화 중 화면에는 넣지 않는다 (글 읽기 방해)
// 문제가 생기면 CHARACTERS_ON 을 false 로 → 모든 캐릭터가 사라진다
import { useState } from "react";
import { loadSession } from "../storage/local";

export const CHARACTERS_ON = true;

export type Pose = "wave" | "listen" | "phone" | "sorry" | "thanks" | "love";
/** me = 가입 때 고른 성별(모르면 여자), both = 남녀 둘이 함께 (청인 화면처럼 상대 성별을 모를 때) */
export type Who = "me" | "m" | "f" | "both";

// 수어 그림은 한 사람씩만 있다
const ONLY: Partial<Record<Pose, "m" | "f">> = { thanks: "f", love: "m" };
const RATIO = 0.75; // 가로 ÷ 세로 (그림은 세로 480)

function Figure({ file, height, bob }: { file: string; height: number; bob: boolean }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <img src={`/char/${file}.webp`} alt="" aria-hidden="true" draggable={false} decoding="async"
      width={Math.round(height * RATIO)} height={height} onError={() => setBroken(true)}
      className={`pointer-events-none h-auto select-none object-contain ${bob ? "itda-bob" : ""}`}
      style={{ height, width: "auto", maxWidth: "45vw" }} />
  );
}

export function Character({ pose, who = "me", height = 160, bob = false }: { pose: Pose; who?: Who; height?: number; bob?: boolean }) {
  if (!CHARACTERS_ON) return null;
  const only = ONLY[pose];
  const people: ("m" | "f")[] = only ? [only]
    : who === "both" ? ["f", "m"]
    : who === "me" ? [loadSession()?.gender === "m" ? "m" : "f"]
    : [who];
  return (
    <div aria-hidden="true" className="flex shrink-0 items-end justify-center gap-2" style={{ minHeight: height }}>
      {people.map((g) => <Figure key={g} file={`${g}-${pose}`} height={height} bob={bob} />)}
    </div>
  );
}
