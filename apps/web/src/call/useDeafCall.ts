// 농인 쪽 링크 통화 (02 문서 S7, 06 문서 2절). 화면과 분리한 대화 흐름:
// 글 보내기 → 서버 확인(sent) → 청인 폰의 실제 재생 신호(playback) → "상대 폰에서 들리는 중" → 전달 완료.
// 5초 안에 청인 폰에서 재생이 시작되지 않으면 경고 + 다시 보내기. 끊겨도 확인 전인 글은 다시 보낸다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, createCall, type CallInfo } from "../api/client";
import type { Live } from "../components/Conversation";
import type { EmotionResult } from "../emotion/types";
import { createBus } from "../feedback/bus";
import { vibrate } from "../feedback/vibrate";
import { history, type Message } from "../storage/history";
import type { Session } from "../storage/local";
import { CallConnection, type CallMessage, type ConnState, wsUrl } from "./connection";

export const PLAY_START_LIMIT_MS = 5000;
const CONNECTED = [60, 80, 60, 80, 60];
const DISCONNECTED = [300, 150, 300];

export type Phase = "idle" | "creating" | "waiting" | "talking" | "ended";

let seq = 0;
const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;
const baseId = (msgId: string) => msgId.split("~")[0]; // 다시 보내기는 "id~2" 처럼 새 번호 (청인 폰의 중복 무시 때문)

export function useDeafCall(session: Session) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [info, setInfo] = useState<CallInfo | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [hearingOnline, setHearingOnline] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [live, setLive] = useState<Record<string, Live>>({});
  const [interim, setInterim] = useState("");
  const [hearingSpeaking, setHearingSpeaking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ color: string; times: number; key: number } | null>(null);

  const bus = useMemo(() => createBus(), []); // 상대 폰의 재생 신호
  const socket = useRef<CallConnection | null>(null);
  const fallbackOf = useRef(new Map<string, boolean>());
  const startTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const retries = useRef(new Map<string, number>());

  const patchLive = useCallback((id: string, patch: Partial<Live>) => {
    setLive((cur) => ({ ...cur, [id]: { ...(cur[id] ?? { state: "sending", fallback: false, silent: false }), ...patch } }));
  }, []);

  const finish = useCallback((id: string, result: Message["result"]) => {
    setMessages((list) => list.map((m) => {
      if (m.id !== id) return m;
      const updated = { ...m, result };
      void history.put(updated);
      return updated;
    }));
  }, []);

  const clearStartTimer = (msgId: string) => {
    const t = startTimers.current.get(msgId);
    if (t) clearTimeout(t);
    startTimers.current.delete(msgId);
  };

  const onMessage = useCallback((m: CallMessage) => {
    const msgId = typeof m.msgId === "string" ? m.msgId : "";
    const id = baseId(msgId);
    switch (m.type) {
      case "presence":
        if (m.role !== "hearing") return;
        setHearingOnline(Boolean(m.online));
        if (m.online) {
          setNotice(null);
          setPhase((p) => (p === "waiting" ? "talking" : p));
          setConnectedAt((t) => t ?? Date.now());
          vibrate(CONNECTED);
          setFlash({ color: "#16a34a", times: 3, key: Date.now() });
          socket.current?.resendPending(); // 기다리던 글을 이제 보낸다
        } else {
          vibrate(DISCONNECTED);
          setNotice("상대방 연결이 끊겼어요. 다시 들어오면 이어서 보내요");
        }
        return;
      case "sent":
        socket.current?.ack(msgId);
        fallbackOf.current.set(msgId, Boolean(m.fallback));
        patchLive(id, { state: "queued", note: "📨 상대 폰으로 보냈어요", fallback: Boolean(m.fallback) });
        clearStartTimer(msgId);
        startTimers.current.set(msgId, setTimeout(() => {
          // 5초가 지나도 청인 폰에서 재생이 시작되지 않음 → 경고 + 다시 보내기
          bus.emit({ type: "error", id, reason: "remote-silent" });
          patchLive(id, { state: "failed" });
          finish(id, "failed");
        }, PLAY_START_LIMIT_MS));
        return;
      case "undelivered":
        patchLive(id, { state: "queued", note: "⏳ 상대방 연결을 기다려요" });
        return;
      case "error":
        if (msgId) {
          socket.current?.ack(msgId); // 잘못된 글은 다시 보내지 않는다
          patchLive(id, { state: "failed" });
          finish(id, "failed");
        }
        if (typeof m.message === "string") setNotice(m.message);
        return;
      case "playback": {
        const source = fallbackOf.current.get(msgId) ? "fallback" : "server";
        if (m.state === "start") {
          clearStartTimer(msgId);
          patchLive(id, { state: "playing", note: "🔊 상대 폰에서 들리는 중" });
          bus.emit({ type: "start", id, source });
        } else if (m.state === "level") {
          const progress = typeof m.progress === "number" ? m.progress : 0;
          if (typeof m.level === "number") bus.emit({ type: "level", id, level: m.level, progress });
          else bus.emit({ type: "boundary", id, charIndex: 0, progress });
        } else if (m.state === "end") {
          clearStartTimer(msgId);
          patchLive(id, { state: "done" });
          finish(id, source === "fallback" ? "fallback" : "done");
          bus.emit({ type: "end", id, source });
        } else if (m.state === "error") {
          clearStartTimer(msgId);
          patchLive(id, { state: "failed" });
          finish(id, "failed");
          bus.emit({ type: "error", id, reason: "remote" });
        }
        return;
      }
      case "caption":
        if (typeof m.text !== "string") return;
        if (m.final) {
          const caption: Message = { id: newId(), role: "other", text: m.text, at: Date.now() };
          setMessages((list) => [...list, caption]);
          void history.put(caption);
          setInterim("");
          vibrate([30]); // 청인 자막 도착: 아주 짧게 1회
        } else {
          setInterim(m.text);
        }
        return;
      case "speaking":
        setHearingSpeaking(typeof m.level === "number" && m.level > 0);
        return;
      case "ended":
        setPhase("ended");
        return;
    }
  }, [bus, finish, patchLive]);

  const start = useCallback(async () => {
    setPhase("creating");
    setNotice(null);
    try {
      const call = await createCall(session.token);
      setInfo(call);
      setPhase("waiting");
      const c = new CallConnection({
        url: wsUrl(call.callId, "deaf"),
        token: session.token,
        onMessage,
        onState: (s) => {
          setConn(s);
          if (s === "ended") setPhase("ended");
        },
      });
      socket.current = c;
      c.start();
    } catch (err) {
      setPhase("idle");
      setNotice(err instanceof ApiError ? err.message : "문제가 생겼어요. 다시 해 주세요");
    }
  }, [onMessage, session.token]);

  const send = useCallback((text: string, emotion?: EmotionResult, existing?: Message) => {
    const chosen = emotion ? { emotion: emotion.emotion, intensity: emotion.intensity, tremor: emotion.tremor } : existing?.emotion;
    const message: Message = existing ?? { id: newId(), role: "me", text, at: Date.now(), emotion: chosen };
    const tries = (retries.current.get(message.id) ?? 0) + 1;
    retries.current.set(message.id, tries);
    const msgId = tries === 1 ? message.id : `${message.id}~${tries}`;
    if (!existing) {
      setMessages((list) => [...list, message]);
      void history.put(message);
    }
    patchLive(message.id, { state: "sending", fallback: false, silent: false, note: undefined });
    socket.current?.sendReliable(msgId, { type: "say", msgId, text: message.text, emotion: chosen ? { ...chosen, source: emotion?.source ?? "auto" } : null });
  }, [patchLive]);

  const hangup = useCallback(() => {
    socket.current?.close();
    setPhase("ended");
  }, []);

  // 폰이 잠깐 꺼졌다 켜지면 기다리지 말고 바로 다시 연결
  useEffect(() => {
    const wake = () => { if (document.visibilityState === "visible") socket.current?.reconnectNow(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, []);

  useEffect(() => () => {
    startTimers.current.forEach((t) => clearTimeout(t));
    socket.current?.close();
  }, []);

  return { phase, info, conn, hearingOnline, connectedAt, messages, live, interim, hearingSpeaking, notice, flash, bus, start, send, hangup };
}
