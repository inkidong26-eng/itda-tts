// S6 마주보고 대화 (02 문서). 위쪽은 180° 뒤집어 맞은편 청인이 읽고, 아래쪽은 농인이 쓴다.
// 약속: 보낸 글은 어떤 오류에서도 소리로 나간다 (서버가 안 되면 폰 기본 음성).
import { useEffect, useMemo, useState } from "react";
import { ApiError, speak, type TtsResult } from "../api/client";
import { type PlayerEvent, player, unlockAudio } from "../audio/player";
import { Composer, type Live, MessageList } from "../components/Conversation";
import type { Turn } from "../emotion/context";
import { emotionInfo, type EmotionResult } from "../emotion/types";
import { Notice } from "../components/ui";
import { createOrdered } from "../lib/ordered";
import { speechText } from "../lib/speechText";
import { history, type Message } from "../storage/history";
import type { Session } from "../storage/local";
import { FONT_STEPS, type ViewSettings } from "../storage/settings";

type Props = {
  session: Session;
  view: ViewSettings;
  onView: (v: ViewSettings) => void;
  onHome: () => void;
  onAuthLost: () => void;
};

let seq = 0;
const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

export function FaceToFacePage({ session, view, onView, onHome, onAuthLost }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [live, setLive] = useState<Record<string, Live>>({});
  const [problem, setProblem] = useState<"offline" | "auth" | "busy" | "empty" | null>(null);
  const inOrder = useMemo(() => createOrdered(), []);

  useEffect(() => {
    let alive = true;
    // 저장된 기록을 불러오는 사이에 보낸 새 메시지가 지워지지 않게 합친다
    void history.list().then((saved) => {
      if (!alive) return;
      setMessages((cur) => [...saved.filter((m) => !cur.some((c) => c.id === m.id)), ...cur].sort((a, b) => a.at - b.at));
    });
    return () => { alive = false; };
  }, []);

  // 재생 신호로만 상태를 바꾼다 (가짜 표시 금지)
  useEffect(() => player.subscribe((e: PlayerEvent) => {
    setLive((cur) => {
      const prev = cur[e.id];
      if (!prev) return cur;
      const next = { ...prev };
      if (e.type === "start") next.state = "playing";
      if (e.type === "fallback") { next.fallback = true; next.silent = false; } // 빈 파일 → 기본 음성이 이어서 읽는다
      if (e.type === "silence") next.silent = true;
      if (e.type === "end") next.state = "done";
      if (e.type === "error") next.state = "failed";
      return { ...cur, [e.id]: next };
    });
    if (e.type === "end" || e.type === "error") {
      setMessages((list) => {
        const m = list.find((x) => x.id === e.id);
        if (!m) return list;
        const result: Message["result"] = e.type === "error" ? "failed" : e.source === "fallback" ? "fallback" : "done";
        const updated = { ...m, result };
        void history.put(updated);
        return list.map((x) => (x.id === e.id ? updated : x));
      });
    }
  }), []);

  useEffect(() => () => player.stopAll(), []);

  const send = (text: string, emotion?: EmotionResult, existing?: Message) => {
    unlockAudio(); // 보내기 터치 안에서 소리 장치를 깨운다 (아이폰)
    if (!speechText(text)) {
      setProblem("empty"); // 이모지·ㅠㅠ만 있으면 읽을 글자가 없다
      return;
    }
    const chosen = emotion ? { emotion: emotion.emotion, intensity: emotion.intensity, tremor: emotion.tremor } : existing?.emotion;
    const message: Message = existing
      ? { ...existing, result: undefined }
      : { id: newId(), role: "me", text, at: Date.now(), emotion: chosen };
    const id = message.id;
    setLive((cur) => ({ ...cur, [id]: { state: "sending", fallback: false, silent: false } }));
    if (!existing) {
      setMessages((list) => [...list, message]);
      void history.put(message);
    }
    // 서버 요청은 바로 보내고, 재생은 보낸 순서대로
    const request: Promise<TtsResult | ApiError> = session.voiceId
      ? speak(session.token, text, session.voiceId, chosen).catch((err) => (err instanceof ApiError ? err : new ApiError(0, "")))
      : Promise.resolve(new ApiError(400, ""));
    void inOrder(request, (res) => {
      if (res instanceof ApiError) {
        setProblem(res.status === 0 ? "offline" : res.status === 401 ? "auth" : res.status === 429 ? "busy" : null);
        // 서버가 안 돼도 무음 금지: 폰 기본 음성으로 읽는다
        player.enqueue({ id, fallback: true, text: speechText(text) || text });
      } else {
        setProblem(null);
        player.enqueue({ id, url: res.url, fallback: res.fallback, text: res.displayText });
      }
      setLive((cur) => (cur[id]?.state === "sending" ? { ...cur, [id]: { ...cur[id], state: "queued" } } : cur));
    });
  };

  const lastMine = [...messages].reverse().find((m) => m.role === "me");
  const recent: Turn[] = useMemo(
    () => messages.slice(-3).map((m) => ({ role: m.role, text: m.text, emotion: m.emotion })),
    [messages],
  );
  const edge = lastMine?.emotion ? emotionInfo(lastMine.emotion.emotion).color : "#1A9A9A";
  const font = FONT_STEPS[view.font];

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col">
      {view.showTop && (
        <section aria-label="상대방이 읽는 쪽" className="flex min-h-0 basis-[32%] rotate-180 flex-col justify-center overflow-hidden border-t-8 bg-blue-50 px-4 py-3" style={{ borderColor: edge }}>
          {/* 180° 돌려 놓았으므로 border-t 가 화면에서는 위·아래 경계선(가운데)에 보인다 */}
          {/* "말하는 중" 막대·단어 하이라이트(T14) 자리 */}
          <p className={`text-center font-bold leading-snug text-ink ${(lastMine?.text.length ?? 0) > 40 ? "text-2xl" : "text-3xl"}`}>
            {lastMine?.emotion && <span aria-hidden="true">{emotionInfo(lastMine.emotion.emotion).icon} </span>}
            {lastMine?.text ?? "안녕하세요. 저는 글로 말해요. 제 말은 목소리로 들리고 여기에도 크게 보여요."}
          </p>
        </section>
      )}

      <section aria-label="내 쪽" className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-3 pt-2">
        <div className="flex gap-2">
          <button type="button" onClick={onHome} className="min-h-[56px] rounded-xl border-2 border-navy px-3 font-bold text-navy">← 홈</button>
          <button type="button" onClick={() => onView({ ...view, font: ((view.font + 1) % 3) as 0 | 1 | 2 })}
            className="min-h-[56px] flex-1 rounded-xl border-2 border-gray-400 px-2 font-semibold">가 글자: {font.label}</button>
          <button type="button" onClick={() => onView({ ...view, showTop: !view.showTop })}
            className="min-h-[56px] flex-1 rounded-xl border-2 border-gray-400 px-2 font-semibold">
            {view.showTop ? "위쪽 숨기기" : "위쪽 보이기"}
          </button>
        </div>
        <p className="text-base text-muted">🔊 폰 소리를 켜고 음량을 크게 해 주세요</p>
        {problem === "offline" && <Notice kind="error">인터넷 연결을 확인해 주세요. 지금은 기본 목소리로 말해요</Notice>}
        {problem === "empty" && <Notice kind="error">읽을 글자가 없어요. 글자를 함께 적어 주세요</Notice>}
        {problem === "busy" && <Notice kind="error">너무 빨리 보내고 있어요. 지금은 기본 목소리로 말해요</Notice>}
        {problem === "auth" && (
          <Notice kind="error">
            처음부터 다시 시작해 주세요.{" "}
            <button type="button" className="underline" onClick={onAuthLost}>다시 시작</button>
          </Notice>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border-2 border-gray-200 p-3">
          <MessageList messages={messages} live={live} onRetry={(m) => send(m.text, undefined, m)} />
        </div>
        {/* 청인 말 자막(T11) 자리 */}
        <Composer recent={recent} onSend={(t, e) => send(t, e)} />
      </section>
    </main>
  );
}
