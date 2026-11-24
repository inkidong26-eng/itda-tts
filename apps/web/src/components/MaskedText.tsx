import { useState } from "react";
import { maskPieces } from "../lib/mask";

/** 청인 말 자막을 보여 줄 때 불편한 말은 ○○ 로 가린다. 가린 곳을 누르면 그 글 전체가 원래대로 보인다 */
export function MaskedText({ text }: { text: string }) {
  const [shown, setShown] = useState(false);
  const pieces = maskPieces(text);
  if (shown || !pieces.some((p) => p.masked)) return <>{text}</>;
  return (
    <>
      {pieces.map((p, i) => p.masked
        ? (
          <button key={i} type="button" onClick={() => setShown(true)}
            aria-label="가린 말 (누르면 보여요)" title="잘못 알아들었을 수 있어요. 누르면 보여요"
            className="inline rounded bg-gray-100 px-1 align-baseline font-normal text-gray-500 underline decoration-dotted">
            {"○".repeat(p.text.length)}
          </button>
        )
        : <span key={i}>{p.text}</span>)}
    </>
  );
}
