// S6 마주보고 대화 (02 문서). 위쪽은 180° 뒤집어 맞은편 청인이 읽고, 아래쪽은 농인이 쓴다.
// 약속: 보낸 글은 어떤 오류에서도 소리로 나간다 (서버가 안 되면 폰 기본 음성).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, speak, translate, type TtsResult } from "../api/client";
import { type PlayerEvent, player, unlockAudio } from "../audio/player";
import { Composer, type Live, MessageList } from "../components/Conversation";
import { EdgeGlow, HighlightText } from "../components/Feedback";
import { useNowPlaying, useVibration } from "../feedback/hooks";
import type { Turn } from "../emotion/context";
import { emotionInfo, type EmotionResult } from "../emotion/types";
import { Button, HelpButton, Notice } from "../components/ui";
import { HELP } from "../lib/help";
import { hasTranslateConsent, langInfo, LANGUAGES, type LangCode, saveTranslateConsent, TRANSLATE_CONSENT } from "../lib/languages";
import { createOrdered } from "../lib/ordered";
import { speechText } from "../lib/speechText";
import { useCaptions } from "../stt/useCaptions";
import { history, type Message } from "../storage/history";
import type { Session } from "../storage/local";
import { FONT_STEPS, type FontStep, type ViewSettings } from "../storage/settings";
import { useKeepScreenOn } from "../lib/wakeLock";

type Props = {
  session: Session;
  view: ViewSettings;
  onView: (v: ViewSettings) => void;
  onHome: () => void;
  onAuthLost: () => void;
  speaker?: boolean; // 스피커 방식(06 문서 3절): 위쪽 뒤집힌 영역 없이 대화 화면만
};

let seq = 0;
const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

export function FaceToFacePage({ session, view, onView, onHome, onAuthLost, speaker = false }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [live, setLive] = useState<Record<string, Live>>({});
  const [problem, setProblem] = useState<"offline" | "auth" | "busy" | "empty" | "translate" | null>(null);
  // 통역 (11 문서 5절): 상대 언어. 한국어면 통역 없이 지금과 같다
  const [partner, setPartner] = useState<LangCode>("ko");
  const [langOpen, setLangOpen] = useState(false);
  const [askConsent, setAskConsent] = useState<LangCode | null>(null);
  const foreign = partner !== "ko";
  const inOrder = useMemo(() => createOrdered(), []);
  const nowPlaying = useNowPlaying();
  useVibration(view.vibrate);
  useKeepScreenOn(); // 대화 중 화면이 꺼지지 않게

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

  // 청인 말 자막 (T11): 확정된 말만 대화 기록에 '상대' 말풍선으로 남긴다
  const update = (id: string, patch: Partial<Message>) => setMessages((list) => list.map((m) => {
    if (m.id !== id) return m;
    const next = { ...m, ...patch };
    void history.put(next);
    return next;
  }));
  const captions = useCaptions((text) => {
    const message: Message = { id: newId(), role: "other", text, at: Date.now() };
    setMessages((list) => [...list, message]);
    void history.put(message);
    if (!foreignRef.current) return;
    // 통역: 상대 말(외국어) → 한국어. 안 되면 원문 그대로 둔다
    const from = foreignRef.current;
    translate(session.token, text, from, "ko")
      .then((r) => update(message.id, { text: r.text, alt: text }))
      .catch(() => setProblem("translate"));
  }, langInfo(partner).speech);
  const foreignRef = useRef<LangCode | null>(null);
  foreignRef.current = foreign ? partner : null;

  const choose = (code: LangCode) => {
    if (code !== "ko" && !hasTranslateConsent()) { setAskConsent(code); return; }
    setPartner(code);
    setLangOpen(false);
    setAskConsent(null);
  };

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
    if (foreign) {
      // 통역: 번역 → 상대 언어 기본 목소리로 말한다 (GPU 목소리는 한국어 전용). 번역이 안 되면 한국어로 말한다
      const target = langInfo(partner);
      const translated = translate(session.token, text, "ko", partner).catch(() => null);
      void inOrder(translated, (r) => {
        if (r) {
          update(id, { alt: r.text });
          player.enqueue({ id, fallback: true, text: r.text, lang: target.speech });
        } else {
          setProblem("translate");
          player.enqueue({ id, fallback: true, text: speechText(text) || text });
        }
        setLive((cur) => (cur[id]?.state === "sending" ? { ...cur, [id]: { ...cur[id], state: "queued" } } : cur));
      });
      return;
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
  // 위쪽에는 지금 말하는 문장을, 말하는 중이 아니면 마지막으로 보낸 문장을 보여 준다
  const topMessage = (nowPlaying && messages.find((m) => m.id === nowPlaying)) || lastMine;
  const colorOf = (m?: Message) => (m?.emotion ? emotionInfo(m.emotion.emotion).color : "#1A9A9A");
  const edge = colorOf(topMessage);
  // 위쪽(상대가 읽는 쪽)은 통역된 글을 보여 준다
  const topText = topMessage ? (topMessage.role === "me" && topMessage.alt) || topMessage.text : "";
  const latest = useRef(messages);
  latest.current = messages;
  const colorFor = useCallback((id: string) => colorOf(latest.current.find((m) => m.id === id)), []);
  const font = FONT_STEPS[view.font];

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col">
      <EdgeGlow enabled={view.glow} colorFor={colorFor} />
      {view.showTop && !speaker && (
        <section aria-label="상대방이 읽는 쪽" className="flex min-h-0 basis-[32%] [@media(max-height:700px)]:basis-[22%] rotate-180 flex-col justify-center overflow-hidden border-t-8 bg-blue-50 px-4 py-3" style={{ borderColor: edge }}>
          {/* 180° 돌려 놓았으므로 border-t 가 화면에서는 위·아래 경계선(가운데)에 보인다 */}
          {foreign && <p className="mb-1 text-center text-base font-semibold text-muted">{langInfo(partner).flag} {langInfo(partner).native}</p>}
          <p className={`text-center font-bold leading-snug text-ink ${topText.length > 40 ? "text-2xl" : "text-3xl"}`}>
            {topMessage?.emotion && <span aria-hidden="true">{emotionInfo(topMessage.emotion.emotion).icon} </span>}
            {topMessage
              ? <HighlightText id={topMessage.id === nowPlaying ? nowPlaying : undefined} text={topText} color={edge} />
              : "안녕하세요. 저는 글로 말해요. 제 말은 목소리로 들리고 여기에도 크게 보여요."}
          </p>
        </section>
      )}

      <section aria-label="내 쪽" className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-3 pt-2">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onHome} className="min-h-[56px] whitespace-nowrap rounded-xl border-2 border-navy px-3 font-bold text-navy">← 홈</button>
          <button type="button" onClick={() => onView({ ...view, font: ((view.font + 1) % FONT_STEPS.length) as FontStep })}
            aria-label={`글자 크기: ${font.label}`} className="min-h-[56px] flex-1 whitespace-nowrap rounded-xl border-2 border-gray-400 px-2 text-base font-semibold">가 {font.label}</button>
          {!speaker && (
            <button type="button" onClick={() => onView({ ...view, showTop: !view.showTop })}
              className="min-h-[56px] flex-1 whitespace-nowrap rounded-xl border-2 border-gray-400 px-2 text-base font-semibold">
              {view.showTop ? "위쪽 숨김" : "위쪽 보임"}
            </button>
          )}
          {!speaker && (
            <button type="button" onClick={() => { setLangOpen((o) => !o); setAskConsent(null); }} aria-expanded={langOpen}
              aria-label={`상대 언어: ${langInfo(partner).label}`}
              className={`min-h-[56px] min-w-[52px] shrink-0 rounded-xl border-2 px-2 text-xl ${foreign ? "border-[#0e6582] bg-teal-50" : "border-gray-400"}`}>
              🌐
            </button>
          )}
          <div className="shrink-0"><HelpButton help={speaker ? HELP.speaker : HELP.face} /></div>
        </div>
        {langOpen && (
          <div className="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm" role="group" aria-label="상대 언어 고르기">
            <p className="text-base font-semibold">🌐 상대방 언어</p>
            {askConsent ? (
              <>
                <p className="text-base">{TRANSLATE_CONSENT}</p>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => { saveTranslateConsent(); choose(askConsent); }}>동의하고 켜기</Button>
                  <Button variant="secondary" className="flex-1" onClick={() => setAskConsent(null)}>취소</Button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-4 gap-1">
                {LANGUAGES.map((l) => (
                  <button key={l.code} type="button" aria-pressed={partner === l.code} onClick={() => choose(l.code)}
                    className={`flex min-h-[56px] flex-col items-center justify-center rounded-xl border-2 text-sm font-semibold ${partner === l.code ? "border-[#0e6582] bg-teal-50" : "border-slate-200"}`}>
                    <span aria-hidden="true" className="text-xl leading-none">{l.flag}</span>{l.native}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {speaker && <p className="text-base text-muted">📱 스피커 방식: 볼륨 최대 · 상대 말 자막은 나오지 않아요</p>}
        {problem === "offline" && <Notice kind="error">인터넷 연결을 확인해 주세요. 지금은 기본 목소리로 말해요</Notice>}
        {problem === "translate" && <Notice kind="error">통역이 잠시 안 돼요. 원래 글(한국어)로 보여 주고 말할게요</Notice>}
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
        {!speaker && (
          <>
            {/* 공간이 좁으므로 안내·중간 결과는 한 줄에 */}
            <p className={`min-h-[1.5em] shrink-0 text-base ${captions.problem ? "font-semibold text-red-800" : "text-muted"}`} aria-live="polite">
              {captions.problem === "unsupported" ? "이 폰(브라우저)은 자막이 안 돼요. 상대에게 글로 써 달라고 해 주세요"
                : captions.problem === "denied" ? "마이크를 허용해 주세요 (주소창 자물쇠 → 마이크)"
                : captions.problem === "other" ? "자막이 멈췄어요. 아래 버튼을 다시 눌러 주세요"
                : captions.interim ? `🎤 ${captions.interim}` : captions.on && captions.speaking ? "🎤 상대가 말하는 중…" : ""}
            </p>
            {captions.problem !== "unsupported" && (
              <button type="button" onClick={captions.toggle} aria-pressed={captions.on}
                className={`min-h-[56px] shrink-0 rounded-xl border-2 text-lg font-bold ${captions.on ? "border-brand-dark bg-teal-50 text-ink" : "border-navy text-navy"}`}>
                {captions.on ? "🎤 상대 말 듣는 중 · 끄기" : "🎤 상대 말 자막 켜기"}
              </button>
            )}
          </>
        )}
        <Composer recent={recent} onSend={(t, e) => send(t, e)} />
      </section>
    </main>
  );
}
