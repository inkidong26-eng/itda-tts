import { useEffect, useState } from "react";
import { ApiError, chooseVoice, listVoices, recommendVoices, type Voice } from "../api/client";
import { playUrl, stopAudio } from "../audio/player";
import { type PlayState, VoiceCard } from "../components/VoiceCard";
import { Button, Notice, Screen } from "../components/ui";
import { PATTERNS, vibrate } from "../feedback/vibrate";
import type { Session } from "../storage/local";

/** S4 목소리 고르기: 추천 3개 + [다른 목소리 보기] */
export function VoicePage({ session, onChosen, onAuthLost, onRestart }: {
  session: Session;
  onChosen: (voice: Voice) => void;
  onAuthLost: () => void;
  onRestart: () => void;
}) {
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [more, setMore] = useState<Voice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<{ id: string; state: PlayState; progress: number } | null>(null);

  const fail = (err: unknown) => {
    if (err instanceof ApiError && err.status === 401) return onAuthLost();
    setError(err instanceof ApiError ? err.message : "문제가 생겼어요. 다시 해 주세요");
  };

  const load = () => {
    setError(null);
    recommendVoices(session.token, session.ageGroup, session.gender).then(setVoices).catch(fail);
  };
  useEffect(load, [session.token]);
  useEffect(() => stopAudio, []);

  const play = (voice: Voice) => {
    if (playing?.id === voice.id && playing.state === "playing") {
      stopAudio();
      setPlaying({ id: voice.id, state: "idle", progress: 0 });
      return;
    }
    if (!voice.previewUrl) return;
    setPlaying({ id: voice.id, state: "loading", progress: 0 });
    void playUrl(voice.previewUrl, {
      onStart: () => {
        vibrate(PATTERNS.start);
        setPlaying({ id: voice.id, state: "playing", progress: 0 });
      },
      onProgress: (p) => setPlaying((cur) => (cur?.id === voice.id ? { ...cur, progress: p } : cur)),
      onEnd: () => {
        vibrate(PATTERNS.done);
        setPlaying((cur) => (cur?.id === voice.id && cur.state === "playing" ? { ...cur, state: "done" } : cur));
      },
      onError: () => {
        vibrate(PATTERNS.fail);
        setPlaying({ id: voice.id, state: "error", progress: 0 });
      },
    });
  };

  const choose = async (voice: Voice) => {
    setBusy(true);
    try {
      await chooseVoice(session.token, voice.id);
      stopAudio();
      onChosen(voice);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const showMore = () => {
    listVoices(session.token, session.ageGroup)
      .then((all) => setMore(all.filter((v) => !voices?.some((r) => r.id === v.id))))
      .catch(fail);
  };

  const card = (v: Voice) => (
    <VoiceCard key={v.id} voice={v} busy={busy}
      playState={playing?.id === v.id ? playing.state : "idle"}
      progress={playing?.id === v.id ? playing.progress : 0}
      onPlay={() => play(v)} onChoose={() => void choose(v)} />
  );

  return (
    <Screen
      step={{ n: 3, total: 3, label: "목소리" }}
      title="내 목소리를 골라 주세요"
      footer={
        <>
          {more === null && voices && <Button variant="secondary" onClick={showMore}>다른 목소리 보기</Button>}
          <button type="button" className="min-h-[56px] text-muted underline" onClick={onRestart}>
            처음부터 다시 하기
          </button>
        </>
      }
    >
      <p className="text-muted">[들어보기]를 누르면 소리가 나는 동안 막대가 움직여요. 안드로이드 폰은 시작과 끝에 떨려요. 옆 사람에게 들어 봐 달라고 해도 좋아요.</p>
      {error && (
        <>
          <Notice kind="error">{error}</Notice>
          <Button variant="secondary" onClick={load}>다시 불러오기</Button>
        </>
      )}
      {!voices && !error && <Notice kind="info">목소리를 불러오는 중이에요…</Notice>}
      {voices?.length === 0 && <Notice kind="info">아직 준비된 목소리가 없어요</Notice>}
      {voices?.map(card)}
      {more !== null && (
        more.length ? <>{<h2 className="mt-4 text-xl font-bold">같은 나이대 다른 목소리</h2>}{more.map(card)}</>
          : <Notice kind="info">이 나이대 목소리는 위에 있는 게 전부예요</Notice>
      )}
    </Screen>
  );
}
