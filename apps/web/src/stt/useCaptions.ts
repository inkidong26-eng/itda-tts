// T11 대면 모드 자막: 청인 말 → 농인 화면 글자 (06 문서 2절 1순위, 02 문서 S6).
// - 우리 음성이 나오는 동안은 듣기를 멈춘다 (자기 소리가 자막으로 잡히지 않게)
// - 재생이 끝나면 잠깐 쉬었다가 다시 듣는다 (스피커 울림 끝부분이 잡히지 않게)
import { useEffect, useRef, useState } from "react";
import { player } from "../audio/player";
import { Recognizer, sttSupported } from "./recognizer";

const RESUME_DELAY_MS = 400;

export type CaptionProblem = "unsupported" | "denied" | "other" | null;

export function useCaptions(onFinal: (text: string) => void, lang = "ko-KR") {
  const [on, setOn] = useState(false);
  const [interim, setInterim] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [problem, setProblem] = useState<CaptionProblem>(sttSupported() ? null : "unsupported");
  const rec = useRef<Recognizer | null>(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  const get = () => {
    rec.current ??= new Recognizer({
      onText: (text, final) => {
        if (final) {
          setInterim("");
          finalRef.current(text);
        } else {
          setInterim(text);
        }
      },
      onSpeaking: setSpeaking,
      onError: (kind) => {
        rec.current?.stop(); // 오류 뒤에 저절로 다시 켜지지 않게
        setOn(false);
        setInterim("");
        setProblem(kind);
      },
    }, lang);
    return rec.current;
  };

  // 통역 언어를 바꾸면 듣던 것을 멈추고 새 언어로 다시 듣는다
  const langRef = useRef(lang);
  useEffect(() => {
    if (langRef.current === lang) return;
    langRef.current = lang;
    const wasOn = rec.current?.listening || on;
    rec.current?.stop();
    rec.current = null;
    setInterim("");
    if (wasOn && sttSupported()) {
      const r = get();
      if (player.nowPlaying()) r.pause();
      r.startAuto();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = player.subscribe((e) => {
      if (e.type === "start") {
        clearTimeout(timer);
        rec.current?.pause();
        setInterim("");
      }
      if (e.type === "end" || e.type === "error") {
        clearTimeout(timer);
        timer = setTimeout(() => { if (!player.nowPlaying()) rec.current?.resume(); }, RESUME_DELAY_MS);
      }
    });
    return () => { off(); clearTimeout(timer); rec.current?.stop(); };
  }, []);

  const toggle = () => {
    if (on) {
      rec.current?.stop();
      setOn(false);
      setInterim("");
      setSpeaking(false);
      return;
    }
    setProblem(sttSupported() ? null : "unsupported");
    if (!sttSupported()) return;
    const r = get();
    // 우리 음성이 나오는 중에 켜면 끝난 뒤부터 듣는다
    if (player.nowPlaying()) r.pause();
    r.startAuto();
    setOn(true);
  };

  return { on, interim, speaking, problem, toggle };
}
