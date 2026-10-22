// S8 받는 화면 (청인, 가입·설치 없음 — 규칙 6). 02 문서 S8, 06 문서 2절.
// 농인 글 → 이 폰에서 음성 자동 재생 + 큰 글씨 + 감정 아이콘. 실제 재생 상태(시작·크기·끝)를 농인 폰으로 보낸다.
// 내 말 → 자막(브라우저 음성 인식). 우리 음성이 나오는 동안은 인식을 멈춘다. 마이크가 안 되면 글로 답하기.
import { useEffect, useRef, useState } from "react";
import { ApiError, getCall } from "../api/client";
import { player, unlockAudio } from "../audio/player";
import { CallConnection, type CallMessage, type ConnState, wsUrl } from "../call/connection";
import { HighlightText, SpeakingBar } from "../components/Feedback";
import { Button, Notice, Screen } from "../components/ui";
import { emotionInfo, type EmotionCode } from "../emotion/types";
import { Recognizer, sttSupported } from "../stt/recognizer";

type Heard = { msgId: string; text: string; emotion?: EmotionCode };

export function ReceivePage({ callId }: { callId: string }) {
  const [phase, setPhase] = useState<"loading" | "missing" | "busy" | "intro" | "talking" | "ended">("loading");
  const [deafName, setDeafName] = useState("");
  const [conn, setConn] = useState<ConnState>("connecting");
  const [deafOnline, setDeafOnline] = useState(true);
  const [heard, setHeard] = useState<Heard[]>([]);
  const [mine, setMine] = useState<{ text: string; final: boolean } | null>(null);
  const [mic, setMic] = useState<"off" | "auto" | "hold">("off");
  const [micProblem, setMicProblem] = useState<string | null>(sttSupported() ? null : "이 폰에서는 말로 답하기가 안 돼요. 글로 답해 주세요");
  const [typing, setTyping] = useState("");
  const socket = useRef<CallConnection | null>(null);
  const seen = useRef(new Set<string>());
  const rec = useRef<Recognizer | null>(null);

  useEffect(() => {
    getCall(callId)
      .then((c) => { setDeafName(c.deafName); setPhase(c.state === "ended" ? "ended" : "intro"); })
      .catch((err) => setPhase(err instanceof ApiError && err.status === 0 ? "loading" : "missing"));
  }, [callId]);

  // 이 폰의 실제 재생 신호 → 농인 폰 ("상대 폰에서 들리는 중"), 재생 중에는 음성 인식 잠시 멈춤
  useEffect(() => player.subscribe((e) => {
    const c = socket.current;
    if (!c || !seen.current.has(e.id)) return;
    if (e.type === "start") { rec.current?.pause(); c.send({ type: "playback", msgId: e.id, state: "start" }); }
    if (e.type === "level") c.send({ type: "playback", msgId: e.id, state: "level", level: e.level, progress: e.progress });
    if (e.type === "boundary") c.send({ type: "playback", msgId: e.id, state: "level", progress: e.progress });
    if (e.type === "end" || e.type === "error") {
      c.send({ type: "playback", msgId: e.id, state: e.type === "end" ? "end" : "error" });
      rec.current?.resume();
    }
  }), []);

  useEffect(() => () => { rec.current?.stop(); socket.current?.close(); player.stopAll(); }, []);

  const onMessage = (m: CallMessage) => {
    if (m.type === "audio" && typeof m.msgId === "string") {
      if (seen.current.has(m.msgId)) return; // 다시 연결 중 두 번 온 글은 한 번만
      seen.current.add(m.msgId);
      const emotion = (m.emotion as { emotion?: EmotionCode } | null)?.emotion;
      setHeard((list) => [...list, { msgId: m.msgId as string, text: String(m.text ?? ""), emotion }]);
      // 서버 음성이 없거나(비상 전환) 파일이 깨져도 이 폰 기본 음성으로 읽는다
      player.enqueue({ id: m.msgId, url: (m.url as string | null) ?? null, fallback: Boolean(m.fallback), text: String(m.displayText ?? m.text ?? "") });
    } else if (m.type === "presence" && m.role === "deaf") {
      setDeafOnline(Boolean(m.online));
    } else if (m.type === "ended") {
      setPhase("ended");
    }
  };

  const begin = () => {
    unlockAudio(); // 이 터치 안에서 소리를 연다 (아이폰)
    setPhase("talking");
    const c = new CallConnection({
      url: wsUrl(callId, "hearing"),
      onMessage,
      onState: (s, code) => {
        setConn(s);
        if (s === "ended") setPhase(code === 4409 ? "busy" : code === 4404 ? "missing" : "ended");
      },
    });
    socket.current = c;
    c.start();
    rec.current = new Recognizer({
      onText: (text, final) => {
        setMine({ text, final });
        c.send({ type: "caption", text, final });
      },
      onSpeaking: (active) => c.send({ type: "speaking", level: active ? 1 : 0 }),
      onError: (kind) => {
        rec.current?.stop(); // 오류 뒤에 저절로 다시 켜지지 않게 (화면은 꺼짐인데 듣는 일이 없도록)
        setMic("off");
        setMicProblem(kind === "denied" ? "마이크를 허용하지 않았어요. 글로 답해 주세요" : "말로 답하기가 안 돼요. 글로 답해 주세요");
      },
    });
  };

  const toggleAuto = () => {
    if (mic === "auto") { rec.current?.stop(); setMic("off"); }
    else { rec.current?.startAuto(); setMic("auto"); }
  };

  const sendTyped = () => {
    const text = typing.trim().slice(0, 500);
    if (!text || !socket.current) return;
    socket.current.send({ type: "caption", text, final: true });
    setMine({ text, final: true });
    setTyping("");
  };

  if (phase === "loading") return <Screen><p className="text-xl">⏳ 불러오는 중…</p></Screen>;
  if (phase === "busy") return <Screen title="이미 통화 중이에요"><p>다른 분이 이 통화에 먼저 들어와 있어요.</p></Screen>;
  if (phase === "missing") return <Screen title="없거나 끝난 통화예요"><p>링크를 보낸 분께 새 링크를 받아 주세요.</p></Screen>;
  if (phase === "ended") return <Screen title="📞 통화가 끝났어요"><p>이용해 주셔서 고마워요.</p></Screen>;

  if (phase === "intro") {
    return (
      <Screen title={`${deafName}님이 대화를 요청했어요`} footer={<Button onClick={begin}>대화 시작</Button>}>
        <p className="text-xl leading-relaxed">
          {deafName}님은 <b>글로 말하고</b>, ITDA가 <b>목소리로 들려드려요</b>.
        </p>
        <p className="text-muted">🔊 폰 소리를 켜고 음량을 크게 해 주세요. 설치나 가입은 필요 없어요.</p>
        <p className="text-muted">🎤 하신 말씀은 글자로 바뀌어 {deafName}님 화면에 보여요.</p>
      </Screen>
    );
  }

  const latest = heard.at(-1);
  const color = latest?.emotion ? emotionInfo(latest.emotion).color : "#1A9A9A";
  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col gap-3 px-4 pb-3 pt-2">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-lg font-bold">📞 {deafName}님과 통화 중</p>
        <button type="button" onClick={() => { socket.current?.close(); setPhase("ended"); }}
          className="min-h-[56px] rounded-xl bg-red-700 px-4 font-bold text-white">끊기</button>
      </div>
      {conn === "reconnecting" && <Notice kind="error">인터넷이 끊겼어요. 다시 연결하는 중…</Notice>}
      {!deafOnline && <Notice kind="error">상대방 연결이 끊겼어요. 잠시 기다려 주세요</Notice>}

      <section aria-label="상대방이 한 말" className="flex min-h-0 flex-1 flex-col justify-center rounded-2xl border-4 bg-blue-50 p-4" style={{ borderColor: color }}>
        <p className="text-center text-3xl font-bold leading-snug">
          {latest ? (
            <>{latest.emotion && <span aria-label={`감정 ${emotionInfo(latest.emotion).label}`}>{emotionInfo(latest.emotion).icon} </span>}
              <HighlightText id={latest.msgId} text={latest.text} color={color} /></>
          ) : "상대방의 글을 기다리는 중이에요"}
        </p>
        <div className="mt-3 min-h-3"><SpeakingBar id={latest?.msgId} color={color} /></div>
      </section>

      {mine && <p className={`text-lg ${mine.final ? "font-semibold" : "text-muted"}`}>🗨️ 내 말: {mine.text}</p>}

      {!micProblem ? (
        <div className="flex gap-2">
          <button type="button"
            onPointerDown={() => { if (mic !== "auto") { rec.current?.startHold(); setMic("hold"); } }}
            onPointerUp={() => { if (mic === "hold") { rec.current?.stop(); setMic("off"); } }}
            onPointerLeave={() => { if (mic === "hold") { rec.current?.stop(); setMic("off"); } }}
            className={`min-h-[72px] flex-1 select-none rounded-2xl text-xl font-bold text-white ${mic === "hold" ? "bg-accent" : "bg-navy"}`}>
            🎤 {mic === "hold" ? "듣는 중… (손을 떼면 보내요)" : "누르고 말하기"}
          </button>
          <button type="button" onClick={toggleAuto} aria-pressed={mic === "auto"}
            className={`min-h-[72px] w-28 rounded-2xl border-2 text-base font-semibold ${mic === "auto" ? "border-brand-dark bg-teal-50" : "border-gray-400"}`}>
            {mic === "auto" ? "✓ 자동 듣기 켜짐" : "자동 듣기"}
          </button>
        </div>
      ) : (
        <Notice kind="info">{micProblem}</Notice>
      )}
      <div className="flex gap-2">
        <input value={typing} onChange={(e) => setTyping(e.target.value)} placeholder="글로 답하기"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); sendTyped(); } }}
          className="min-h-[56px] min-w-0 flex-1 rounded-xl border-2 border-gray-400 px-3 text-lg" aria-label="글로 답하기" />
        <Button className="!w-auto px-5" onClick={sendTyped} disabled={!typing.trim()}>보내기</Button>
      </div>
    </main>
  );
}
