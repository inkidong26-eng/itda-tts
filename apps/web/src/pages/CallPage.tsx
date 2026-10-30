// S7 전화로 대화 — 링크 방식 (02 문서). 링크 만들기 → QR·공유 → 기다리기 → 연결됨 → 대화.
import { useCallback, useEffect, useMemo, useState } from "react";
import { prefetch } from "../api/client";
import { useDeafCall } from "../call/useDeafCall";
import { Composer, MessageList } from "../components/Conversation";
import { EdgeGlow } from "../components/Feedback";
import { Button, Card, HelpButton, Notice, Screen } from "../components/ui";
import { HELP } from "../lib/help";
import type { Turn } from "../emotion/context";
import { emotionInfo } from "../emotion/types";
import { useVibration } from "../feedback/hooks";
import type { Session } from "../storage/local";
import type { ViewSettings } from "../storage/settings";
import { useKeepScreenOn } from "../lib/wakeLock";

function useClock(since: number | null): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!since) return "00:00";
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function CallPage({ session, view, onHome, onSpeaker }: {
  session: Session;
  view: ViewSettings;
  onHome: () => void;
  onSpeaker: () => void;
}) {
  const call = useDeafCall(session);
  const clock = useClock(call.connectedAt);
  const [copied, setCopied] = useState(false);
  useVibration(view.vibrate, call.bus); // 상대 폰의 실제 재생 신호로 진동
  useKeepScreenOn(call.phase === "waiting" || call.phase === "talking"); // 통화 중 화면이 꺼지지 않게

  const colorFor = useCallback((id: string) => {
    const m = call.messages.find((x) => x.id === id);
    return m?.emotion ? emotionInfo(m.emotion.emotion).color : "#1A9A9A";
  }, [call.messages]);
  const recent: Turn[] = useMemo(
    () => call.messages.slice(-3).map((m) => ({ role: m.role, text: m.text, emotion: m.emotion })),
    [call.messages],
  );

  const share = async () => {
    if (!call.info) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "ITDA 잇다", text: `${session.name}님이 ITDA로 대화를 요청했어요`, url: call.info.joinUrl });
        return;
      }
    } catch { /* 취소하거나 지원 안 함 → 복사로 */ }
    try {
      await navigator.clipboard.writeText(call.info.joinUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (call.phase === "idle" || call.phase === "creating") {
    return (
      <Screen title="📞 전화로 대화" help={HELP.call} footer={<Button variant="secondary" onClick={onHome}>← 홈으로</Button>}>
        {call.notice && <Notice kind="error">{call.notice}</Notice>}
        <Card className="flex flex-col gap-3 border-t-4 border-[#0e6582]">
          <span className="w-fit rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-800">👍 추천</span>
          <h2 className="text-2xl font-bold">🔗 링크로 전화 걸기</h2>
          <p className="text-muted">상대는 링크만 누르면 돼요. 상대 말도 글자로 볼 수 있어요.</p>
          <Button className="!min-h-[64px] !text-xl" onClick={() => void call.start()} disabled={call.phase === "creating"}>
            {call.phase === "creating" ? "⏳ 링크를 만드는 중…" : "링크 만들기 →"}
          </Button>
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">📱 일반 전화 중에 쓰기</h2>
          <p className="text-muted">상대 말 자막은 안 나와요.</p>
          <Button variant="secondary" onClick={onSpeaker}>방법 보기 →</Button>
        </Card>
      </Screen>
    );
  }

  if (call.phase === "ended") {
    return (
      <Screen title="📞 통화가 끝났어요" footer={<Button onClick={onHome}>홈으로</Button>}>
        <p className="text-xl">통화 시간 {clock}</p>
      </Screen>
    );
  }

  if (call.phase === "waiting") {
    return (
      <Screen title="상대방을 기다리는 중…" help={HELP.call} footer={<Button variant="secondary" onClick={call.hangup}>취소</Button>}>
        <EdgeGlow enabled={view.glow} colorFor={colorFor} bus={call.bus} flash={call.flash} />
        <p className="text-muted">상대에게 아래 QR을 보여 주거나 링크를 보내 주세요.</p>
        {call.info && (
          <div className="mx-auto w-64 max-w-full rounded-xl border-2 border-gray-200 bg-white p-2"
            aria-label="참여 QR" dangerouslySetInnerHTML={{ __html: call.info.qrSvg }} />
        )}
        <Button onClick={() => void share()}>📤 링크 보내기 (문자·카톡 등)</Button>
        {copied && <Notice kind="info">✅ 링크를 복사했어요. 문자나 카톡에 붙여 넣어 보내 주세요</Notice>}
        <p className="break-all text-center text-base text-muted">{call.info?.joinUrl}</p>
        {call.conn === "reconnecting" && <Notice kind="error">인터넷 연결을 확인하는 중이에요…</Notice>}
      </Screen>
    );
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col gap-2 px-4 pb-3 pt-2">
      <EdgeGlow enabled={view.glow} colorFor={colorFor} bus={call.bus} flash={call.flash} />
      <div className="flex items-center gap-2">
        <p className="flex-1 text-lg font-bold">📞 통화 중 {clock}</p>
        <span className={`rounded-full px-3 py-1 text-base font-semibold ${call.hearingOnline ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
          {call.hearingOnline ? "🟢 연결됨" : "🔴 끊김"}
        </span>
        <HelpButton help={HELP.callTalk} />
        <button type="button" onClick={call.hangup} className="min-h-[56px] rounded-xl bg-red-700 px-4 font-bold text-white">끊기</button>
      </div>
      {call.conn === "reconnecting" && <Notice kind="error">인터넷이 끊겼어요. 다시 연결하는 중… (보낸 글은 이어서 보내요)</Notice>}
      {call.notice && <Notice kind="error">{call.notice}</Notice>}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border-2 border-gray-200 p-3">
        <MessageList messages={call.messages} live={call.live} bus={call.bus}
          failText="⚠️ 상대 폰에서 소리가 나지 않았어요" onRetry={(m) => call.send(m.text, undefined, m)} />
      </div>
      <p className="min-h-[1.5em] text-base text-muted" aria-live="polite">
        {call.hearingSpeaking || call.interim ? `🎤 상대가 말하는 중${call.interim ? `: ${call.interim}` : ""}` : ""}
      </p>
      <Composer recent={recent} onSend={(t, e) => call.send(t, e)}
        onDraft={session.voiceId ? (t) => prefetch(session.token, t, session.voiceId!) : undefined} />
    </main>
  );
}
