import type { Voice } from "../api/client";
import { SCALES, ageLabel, clampScale, genderLabel, scaleWord } from "../lib/labels";
import { Button } from "./ui";

export type PlayState = "idle" | "loading" | "playing" | "done" | "error";

type Props = {
  voice: Voice;
  playState: PlayState;
  progress: number;
  busy: boolean;
  onPlay: () => void;
  onChoose: () => void;
};

const STATUS: Record<PlayState, string> = {
  idle: "",
  loading: "⏳ 소리를 불러오는 중이에요",
  playing: "🔊 들려주는 중이에요",
  done: "✅ 다 들려줬어요",
  error: "⚠️ 소리가 나지 않았어요. 폰 소리를 켜 주세요",
};

function Dots({ value }: { value: number }) {
  return (
    <span aria-hidden="true" className="tracking-widest text-brand-dark">
      {"●".repeat(value)}
      <span className="text-gray-300">{"●".repeat(5 - value)}</span>
    </span>
  );
}

/** 농인용 목소리 카드 (02 문서 S4): 소리를 듣지 않고도 느낌을 알 수 있게 */
export function VoiceCard({ voice, playState, progress, busy, onPlay, onChoose }: Props) {
  const card = voice.card ?? {};
  const scales = SCALES.map((s) => ({ ...s, value: clampScale(card.scales?.[s.key]) }))
    .filter((s): s is typeof s & { value: number } => s.value !== null);
  const playing = playState === "playing";

  return (
    <article className="rounded-2xl border-2 border-gray-300 p-4">
      <h2 className="text-xl font-bold">
        {voice.name} <span className="text-base font-semibold text-muted">· {ageLabel(voice.ageGroup)} {genderLabel(voice.gender)}</span>
      </h2>
      <p className="mt-2 text-lg">{card.easy || voice.description}</p>
      {card.impression && <p className="mt-2 text-muted">👂 듣는 사람 느낌: “{card.impression}”</p>}

      {scales.length > 0 && (
        <dl className="mt-3 grid grid-cols-[auto_auto_1fr] items-center gap-x-3 gap-y-1">
          {scales.map((s) => (
            <div key={s.key} className="contents">
              <dt className="font-semibold">{s.title}</dt>
              <dd><Dots value={s.value} /></dd>
              <dd className="text-muted">{scaleWord(s.value, s.low, s.high)}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.suits && <p className="mt-2 text-muted">어울리는 자리: {card.suits}</p>}
      {voice.tags.length > 0 && !card.easy && (
        <p className="mt-2 flex flex-wrap gap-2">
          {voice.tags.map((t) => <span key={t} className="rounded-full bg-gray-100 px-3 py-1 text-base">#{t}</span>)}
        </p>
      )}

      {/* 파형 + 실제 재생 위치 (가짜 애니메이션 금지) */}
      <div className={`relative mt-3 overflow-hidden rounded-xl bg-gray-100 ${playing ? "ring-4 ring-brand" : ""}`}>
        {voice.waveUrl ? <img src={voice.waveUrl} alt="" className="h-16 w-full object-cover" /> : <div className="h-6" />}
        <div className="absolute inset-y-0 left-0 bg-brand/40" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <p aria-live="polite" className="mt-2 min-h-[1.5em] font-semibold">
        {voice.previewUrl ? STATUS[playState] : "소리 준비 중이에요"}
      </p>

      <div className="mt-2 flex flex-col gap-2">
        <Button variant="secondary" onClick={onPlay} disabled={!voice.previewUrl || playState === "loading"}>
          {playing ? "■ 그만 듣기" : "▶ 들어보기"}
        </Button>
        <Button onClick={onChoose} disabled={busy}>이 목소리로 할게요</Button>
      </div>
    </article>
  );
}
