// /dev/audio — 소리 재생 시험 페이지 (T09). 화면 없이 쓰는 player.ts 를 폰에서 직접 확인한다.
import { useEffect, useRef, useState } from "react";
import { ApiError, speak } from "../api/client";
import { type PlayerEvent, player, unlockAudio } from "../audio/player";
import { toneUrl } from "../audio/testTones";
import { Button, Notice, Screen } from "../components/ui";
import { loadSession } from "../storage/local";

const LABEL: Record<PlayerEvent["type"], string> = {
  queued: "⏳ 대기", start: "🔊 시작", level: "", boundary: "🔤 단어", silence: "⚠️ 무음 의심",
  fallback: "🗣️ 기본 목소리로 전환", end: "✅ 끝", error: "❌ 오류",
};

export function DevAudioPage() {
  const [log, setLog] = useState<string[]>([]);
  const [level, setLevel] = useState(0);
  const [mic, setMic] = useState<number | null>(null);
  const [voices, setVoices] = useState<string[]>([]);
  const [text, setText] = useState("OK 3시에 봐요");
  const [notice, setNotice] = useState<string | null>(null);
  const micStop = useRef<(() => void) | null>(null);

  useEffect(() => {
    const t0 = performance.now();
    const off = player.subscribe((e) => {
      if (e.type === "level") return setLevel(e.level);
      if (e.type === "end" || e.type === "error") setLevel(0);
      const extra = e.type === "start" ? ` (${e.source === "server" ? "서버 음성" : "기본 목소리"})`
        : e.type === "error" || e.type === "fallback" ? ` (${"reason" in e ? e.reason : ""})` : "";
      const sec = ((performance.now() - t0) / 1000).toFixed(1);
      setLog((l) => [`${sec}초 ${e.id} ${LABEL[e.type]}${extra}`, ...l].slice(0, 40));
    });
    const loadVoices = () => setVoices(player.koreanVoices());
    loadVoices();
    try { window.speechSynthesis?.addEventListener("voiceschanged", loadVoices); } catch { /* 없음 */ }
    return () => { off(); micStop.current?.(); };
  }, []);

  const go = (fn: () => void) => () => { unlockAudio(); setNotice(null); fn(); };

  const threeTones = () => [440, 554, 659].forEach((f, i) =>
    player.enqueue({ id: `소리${i + 1}`, url: toneUrl(f, 1.2), text: `${i + 1}번째 소리` }));
  const threeFallback = () => ["첫 번째 문장이에요.", "두 번째 문장이에요.", "세 번째 문장이에요."]
    .forEach((t, i) => player.enqueue({ id: `기본${i + 1}`, fallback: true, text: t }));
  const brokenFile = () => player.enqueue({ id: "깨진파일", url: "/없는-파일.mp3", text: "파일이 깨져서 기본 목소리로 읽어요." });
  const silentFile = () => player.enqueue({ id: "조용한파일", url: toneUrl(440, 2, 0), text: "조용한 파일" });

  const viaServer = async () => {
    const s = loadSession();
    if (!s?.token || !s.voiceId) return setNotice("먼저 첫 화면에서 가입하고 목소리를 골라 주세요 (주소 끝의 /dev/audio 를 지우면 돼요)");
    try {
      const res = await speak(s.token, text, s.voiceId);
      player.enqueue({ id: res.fallback ? "서버(비상)" : "서버", url: res.url, fallback: res.fallback, text: res.displayText });
    } catch (err) {
      // 인터넷이 끊겨도 무음 금지: 적은 글을 그대로 기본 목소리로
      setNotice(err instanceof ApiError ? err.message : "서버에 닿지 않아요");
      player.enqueue({ id: "끊김", fallback: true, text });
    }
  };

  const micTest = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return setNotice("이 주소에서는 마이크를 쓸 수 없어요. 마이크는 https 주소(배포 후)나 이 컴퓨터(localhost)에서만 돼요");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      ctx.createMediaStreamSource(stream).connect(an);
      const data = new Float32Array(an.fftSize);
      const timer = setInterval(() => {
        an.getFloatTimeDomainData(data);
        setMic(Math.min(1, Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length) * 5));
      }, 100);
      micStop.current = () => { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); void ctx.close(); setMic(null); };
      player.enqueue({ id: "마이크켠채", url: toneUrl(523, 3), text: "마이크를 켠 채로 재생해요" });
      setTimeout(() => micStop.current?.(), 4000);
    } catch {
      setNotice("마이크를 허용하지 않았어요");
    }
  };

  return (
    <Screen title="🔧 소리 재생 시험">
      <p className="text-muted">아래 버튼을 눌러 소리가 순서대로 나는지, 막대가 소리에 맞춰 움직이는지 확인해요.</p>
      {notice && <Notice kind="error">{notice}</Notice>}

      <div aria-label="재생 소리 크기" className="h-6 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full bg-brand transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
      {mic !== null && (
        <div aria-label="마이크 소리 크기" className="h-6 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full bg-accent" style={{ width: `${Math.round(mic * 100)}%` }} />
        </div>
      )}

      <Button onClick={go(threeTones)}>① 소리 파일 3개 연속</Button>
      <Button onClick={go(threeFallback)}>② 기본 목소리 3문장 연속</Button>
      <Button variant="secondary" onClick={go(brokenFile)}>③ 깨진 파일 → 기본 목소리</Button>
      <Button variant="secondary" onClick={go(silentFile)}>④ 조용한 파일 → 무음 경고</Button>
      <Button variant="secondary" onClick={go(() => void micTest())}>⑤ 마이크 켠 채 재생 (아이폰 확인)</Button>
      <label className="flex flex-col gap-2">
        <span className="font-semibold">⑥ 서버로 보내기 (와이파이를 끄면 기본 목소리)</span>
        <input className="min-h-[56px] rounded-xl border-2 border-gray-400 px-4" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <Button variant="secondary" onClick={go(() => void viaServer())}>보내기</Button>
      <Button variant="secondary" onClick={() => player.stopAll()}>■ 모두 멈추기</Button>

      <section>
        <h2 className="font-bold">이 폰의 한국어 기본 목소리</h2>
        <p className="text-muted">{voices.length ? voices.join(", ") : "없음 (또는 아직 불러오는 중) — 없으면 비상 음성이 영어 발음일 수 있어요"}</p>
      </section>
      <section>
        <h2 className="font-bold">재생 기록 (최근 것이 위)</h2>
        <ol className="text-base">{log.map((l, i) => <li key={i}>{l}</li>)}</ol>
      </section>
    </Screen>
  );
}
