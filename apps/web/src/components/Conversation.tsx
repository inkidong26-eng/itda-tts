import { useEffect, useMemo, useRef, useState } from "react";
import { estimateWithContext, type Turn } from "../emotion/context";
import { emotionInfo, type EmotionResult } from "../emotion/types";
import type { Message } from "../storage/history";
import { DEFAULT_FAVORITES } from "../lib/favorites";
import { EmotionChips, finalEmotion, type Manual } from "./EmotionChips";
import type { SignalBus } from "../feedback/bus";
import { SpeakingBar } from "./Feedback";
import { Button } from "./ui";

export type LiveState = "sending" | "queued" | "playing" | "done" | "failed";
export type Live = { state: LiveState; fallback: boolean; silent: boolean; note?: string };

/** 말풍선 아래 상태 한 줄: 글자 + 아이콘 + 색 (소리에만 의존하지 않기). 말하는 중에는 얇은 막대가 대신한다 */
type Status = { text: string; tone: "muted" | "ok" | "warn"; sub?: string };
function statusOf(m: Message, live?: Live, failText = "⚠️ 소리가 나지 않았어요"): Status | null {
  if (live) {
    if (live.silent && live.state !== "failed") return { text: "⚠️ 소리가 안 들려요. 폰 소리를 켜 주세요", tone: "warn" };
    const sub = live.fallback ? "기본 목소리" : undefined;
    if (live.state === "sending") return { text: "⏳ 보내는 중", tone: "muted" };
    if (live.state === "queued") return { text: live.note ?? "⏳ 차례를 기다려요", tone: "muted" };
    if (live.state === "playing") return live.note ? { text: live.note, tone: "ok", sub } : null;
    if (live.state === "done") return { text: "✅ 전달 완료", tone: "ok", sub };
    return { text: failText, tone: "warn" };
  }
  if (m.result === "done") return { text: "✅ 전달 완료", tone: "ok" };
  if (m.result === "fallback") return { text: "✅ 전달 완료", tone: "ok", sub: "기본 목소리" };
  if (m.result === "failed") return { text: "⚠️ 소리가 나지 않았어요", tone: "warn" };
  return null;
}

const TONE = { muted: "text-muted", ok: "text-brand-dark", warn: "text-red-800 font-bold" };

export function MessageList({ messages, live, onRetry, bus, failText }: {
  messages: Message[];
  live: Record<string, Live>;
  onRetry: (m: Message) => void;
  bus?: SignalBus;          // 링크 통화: 상대 폰의 재생 신호
  failText?: string;        // 실패 문구 (통화: "상대 폰에서 소리가 나지 않았어요")
}) {
  const end = useRef<HTMLDivElement>(null);
  const openedAt = useRef(Date.now()); // 화면을 연 뒤 새로 들어온 상대 말만 반짝인다
  useEffect(() => {
    // 중괄호 필수: 최신 크롬의 scrollIntoView 는 Promise 를 돌려주는데, 그대로 돌려주면 React 가 정리 함수로 착각해 화면이 하얗게 멈춘다
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // 위쪽 영역을 숨기거나 키보드가 올라와 칸 크기가 바뀌어도 최신 말풍선이 보이게
  useEffect(() => {
    const box = end.current?.parentElement?.parentElement;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => { end.current?.scrollIntoView({ block: "end" }); });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {messages.length === 0 && (
        <p className="text-center text-muted">아래에 글을 적고 [보내기]를 누르면 목소리로 말해요.</p>
      )}
      {messages.map((m) => {
        const status = statusOf(m, live[m.id], failText);
        const failed = live[m.id]?.state === "failed" || (!live[m.id] && m.result === "failed");
        const emo = m.emotion ? emotionInfo(m.emotion.emotion) : null;
        return (
          <div key={m.id} className={`flex flex-col ${m.role === "me" ? "items-end" : "items-start"}`}>
            {/* 농인에게 중요한 건 상대(청인) 말: 크고 진하게. 내가 보낸 글은 작고 옅게 (10/30 사용자 의견) */}
            {m.role === "other" && <span className="mb-1 text-sm font-semibold text-[#0e6582]">🗣️ 상대</span>}
            <p className={m.role === "me"
              ? "max-w-[80%] rounded-2xl bg-teal-50 px-3 py-2 text-base text-ink"
              : `max-w-[94%] rounded-2xl border-2 border-[#0e6582] bg-white px-4 py-3 text-2xl font-semibold leading-snug text-ink shadow-sm ${m.at > openedAt.current ? "itda-new" : ""}`}
              style={emo ? { borderLeft: `8px solid ${emo.color}` } : undefined}>
              {emo && <span aria-label={`감정 ${emo.label}`} className="mr-1">{emo.icon}</span>}
              {m.text}
              {m.emotion && m.emotion.tremor > 0 && <span aria-label="떨림" className="ml-1">{"〰".repeat(m.emotion.tremor)}</span>}
            </p>
            {m.alt && <p className="mt-1 max-w-[85%] text-base text-muted" aria-label={m.role === "me" ? "통역된 글" : "원문"}>🌐 {m.alt}</p>}
            {live[m.id] && <div className="mt-1 w-2/3"><SpeakingBar id={m.id} color={emo?.color ?? "#1A9A9A"} bus={bus} /></div>}
            {status && (
              <p className={`mt-1 ${status.tone === "warn" ? "text-base" : "text-sm"} ${TONE[status.tone]}`}>
                {status.text}{status.sub && <span className="ml-1 text-xs font-normal text-gray-400">· {status.sub}</span>}
              </p>
            )}
            {failed && (
              <button type="button" onClick={() => onRetry(m)}
                className="mt-1 min-h-[56px] rounded-xl border-2 border-red-800 px-4 font-bold text-red-800">
                🔁 다시 말하기
              </button>
            )}
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

const MAX = 100;
const DRAFT_PAUSE_MS = 800; // 손을 멈추고 이만큼 지나면 미리 만들기 시작

/** 입력칸 + 보내기 + 즐겨찾기 ⭐ */
export function Composer({ onSend, onDraft, recent, disabled }: {
  onSend: (text: string, emotion: EmotionResult) => void;
  onDraft?: (text: string) => void; // 쓰다 멈추면 부른다 (미리 만들기)
  recent: Turn[];
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [favOpen, setFavOpen] = useState(false);
  const [manual, setManual] = useState<Manual>({});
  // 입력할 때마다 즉시 추정 (폰 안에서, 0.01초)
  const auto = useMemo(() => estimateWithContext(text, recent), [text, recent]);

  const send = (value: string) => {
    const t = value.trim().slice(0, MAX);
    if (!t || disabled) return;
    const base = value === text ? auto : estimateWithContext(t, recent); // 즐겨찾기는 그 문구로 다시 추정
    onSend(t, finalEmotion(base, manual));
    setText("");
    setFavOpen(false);
    setManual({}); // 보낸 뒤 자동 모드로
  };

  // 쓰다가 잠깐 멈추면 지금 글로 목소리를 미리 만들어 둔다 → [보내기]를 누르면 바로 나온다
  // (onDraft 는 ref 로: 상대 자막 등으로 화면이 다시 그려져도 기다리는 시간이 처음부터 다시 시작되지 않게)
  const drafted = useRef("");
  const draftFn = useRef(onDraft);
  draftFn.current = onDraft;
  useEffect(() => {
    const t = text.trim();
    if (disabled || t.length < 2 || t === drafted.current) return;
    const timer = setTimeout(() => {
      if (!draftFn.current) return;
      drafted.current = t;
      draftFn.current(t);
    }, DRAFT_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text, disabled]);

  // 글이 길어지면 3줄까지 늘어나는 칸
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 3 * 32 + 20)}px`;
  }, [text]);

  return (
    <div className="flex flex-col gap-2">
      {favOpen && (
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="즐겨찾기 문구">
          {DEFAULT_FAVORITES.map((f) => (
            <button key={f} type="button" onClick={() => send(f)}
              className="min-h-[56px] break-keep rounded-xl border-2 border-accent bg-orange-50 px-2 text-base font-semibold text-ink">
              {f}
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <textarea
          ref={box}
          rows={1}
          className="block min-h-[56px] w-full resize-none rounded-2xl border-2 border-slate-300 bg-white px-3 py-3 text-xl leading-8 shadow-sm focus:border-[#0e6582] focus:outline-none"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/\s*\n\s*/g, " ").slice(0, MAX))}
          onKeyDown={(e) => {
            // 한글 입력 중(조합 중) Enter 는 글자 확정용이라 보내지 않는다 (두 번 보내짐 방지)
            if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); }
          }}
          enterKeyHint="send"
          maxLength={MAX}
          placeholder="여기에 글을 적어요"
          aria-label="보낼 글"
        />
        <span className={`pointer-events-none absolute bottom-1 right-3 text-xs ${text.length >= MAX ? "font-bold text-red-800" : "text-gray-400"}`}>
          {text.length >= MAX ? "100자까지" : `${text.length}/${MAX}`}
        </span>
      </div>
      <EmotionChips auto={auto} manual={manual} onChange={setManual} trailing={
        <>
          <button type="button" onClick={() => setFavOpen((o) => !o)} aria-pressed={favOpen} aria-label="즐겨찾기"
            className={`min-h-[56px] min-w-[56px] rounded-xl border-2 text-2xl ${favOpen ? "border-accent bg-orange-100" : "border-gray-300 bg-white"}`}>
            ⭐
          </button>
          <Button className="!w-auto px-6" onClick={() => send(text)} disabled={!text.trim() || disabled}>보내기</Button>
        </>
      } />
    </div>
  );
}
