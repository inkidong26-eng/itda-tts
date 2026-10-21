"""T03 검증: 제작 방식 A/B 비교, 같은 사람 점수, 속도, 숨소리 (09 문서 T03).

Kaggle: !python itda-tts/services/tts/scripts/spike.py --out /kaggle/working/t03_out
GPU 없이 흐름만 확인: python scripts/spike.py --fake --out ./t03_fake
"""

import argparse
import json
import sys
import time
import traceback
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).parent))
from spike_audio import cosine, duration, join_with_silence, trim_leading  # noqa: E402
from spike_data import (BREATH_SENTENCES, CONSISTENCY_SENTENCES, EMOTIONS, NO_BREATH_HINT,  # noqa: E402
                        SPLIT_TEXTS, TEST_SENTENCE, URGENT_INSTRUCT, URGENT_TEXT, VOICES)

CANDIDATES = 3  # 감정마다 만들어 보고 가장 같은 사람 같은 것을 고르는 후보 수


class Spike:
    def __init__(self, engine, out: Path, voices: list[str]) -> None:
        self.e = engine
        self.out = out
        self.voices = voices
        self.rows: list[dict] = []
        self.summary: dict = {"gpu": engine.gpu, "errors": []}
        self.refs: dict = {}   # (voice, emotion) -> (wav, sr, ref_text)
        self.anchor: dict = {}  # voice -> 평온 기준 음성의 목소리 특징
        self.started = time.time()

    # ---------- 공통 ----------
    def log(self, msg: str) -> None:
        print(f"[{(time.time() - self.started) / 60:5.1f}분] {msg}", flush=True)

    def save(self, section: str, label: str, wav, sr, text: str, sec: float | None = None,
             voice: str | None = None, extra: dict | None = None) -> dict:
        name = f"{section}_{len(self.rows):03d}.wav"
        sf.write(self.out / "wav" / name, wav, sr)
        sim = cosine(self.e.embed(wav, sr), self.anchor[voice]) if voice in self.anchor else None
        row = {"section": section, "label": label, "voice": voice, "text": text, "file": name,
               "gen_sec": round(sec, 2) if sec is not None else None,
               "audio_sec": round(duration(wav, sr), 2), "same_person": round(sim, 3) if sim is not None else None}
        row.update(extra or {})
        self.rows.append(row)
        return row

    def timed(self, fn, *args, **kw):
        t = time.perf_counter()
        res = fn(*args, **kw)
        return res, time.perf_counter() - t

    # ---------- 1. 방식 A: 감정별 기준 음성 만들기 ----------
    def build_references(self) -> None:
        for v in self.voices:
            desc = VOICES[v]
            code, _, ref_text, hint = EMOTIONS[0]
            (wavs, sr), sec = self.timed(self.e.design, [ref_text] * CANDIDATES, [f"{desc}. {hint}"] * CANDIDATES, 1)
            self.anchor[v] = self.e.embed(wavs[0], sr)
            self.refs[(v, code)] = (wavs[0], sr, ref_text)
            for i, w in enumerate(wavs):
                self.save("ref", f"평온 후보 {i + 1}" + (" ← 기준" if i == 0 else ""), w, sr, ref_text,
                          sec / CANDIDATES, v)
            for code, name, ref_text, hint in EMOTIONS[1:]:
                (wavs, sr), sec = self.timed(self.e.design, [ref_text] * CANDIDATES,
                                             [f"{desc}. {hint}"] * CANDIDATES, 1)
                sims = [cosine(self.e.embed(w, sr), self.anchor[v]) for w in wavs]
                best = int(np.argmax(sims))
                self.refs[(v, code)] = (wavs[best], sr, ref_text)
                for i, w in enumerate(wavs):
                    self.save("ref", f"{name} 후보 {i + 1}" + (" ← 선택" if i == best else ""), w, sr,
                              ref_text, sec / CANDIDATES, v)
            self.log(f"기준 음성 완료: {v}")

    # ---------- 2·3. 방식 A(복제) vs B(매번 설계): 같은 문장을 감정별로 ----------
    def compare_methods(self) -> None:
        for v in self.voices:
            for code, name, _, hint in EMOTIONS:
                wav, sr, ref_text = self.refs[(v, code)]
                items = self.e.prompt(wav, sr, ref_text)
                (wavs, sr2), sec = self.timed(self.e.clone, [TEST_SENTENCE], items, 1)
                self.save("method", f"A 복제 · {name}", wavs[0], sr2, TEST_SENTENCE, sec, v, {"method": "A"})
                (wavs, sr2), sec = self.timed(self.e.design, [TEST_SENTENCE], [f"{VOICES[v]}. {hint}"], 1)
                self.save("method", f"B 설계 · {name}", wavs[0], sr2, TEST_SENTENCE, sec, v, {"method": "B"})
            self.log(f"A/B 비교 완료: {v}")

    # ---------- 4. 같은 사람처럼 들리는지: 10문장 ----------
    def consistency(self) -> None:
        v = self.voices[0]
        wav, sr, ref_text = self.refs[(v, "calm")]
        items = self.e.prompt(wav, sr, ref_text)
        hint = EMOTIONS[0][3]
        a, _ = self.e.clone(CONSISTENCY_SENTENCES, items, 2)
        b, sr_b = self.e.design(CONSISTENCY_SENTENCES, [f"{VOICES[v]}. {hint}"] * len(CONSISTENCY_SENTENCES), 2)
        scores = {"A": [], "B": []}
        for i, text in enumerate(CONSISTENCY_SENTENCES):
            scores["A"].append(self.save("consist", f"A 복제 {i + 1}", a[i], sr, text, None, v)["same_person"])
            scores["B"].append(self.save("consist", f"B 설계 {i + 1}", b[i], sr_b, text, None, v)["same_person"])
        self.summary["consistency"] = {
            m: {"평균": round(float(np.mean(s)), 3), "최저": round(float(np.min(s)), 3)} for m, s in scores.items()}
        self.log("10문장 일관성 완료")

    # ---------- 5. 속도 ----------
    def speed(self) -> None:
        v = self.voices[0]
        wav, sr, ref_text = self.refs[(v, "calm")]
        self.e.load("base06")
        variants = {
            "설계 1.7B (방식 B)": lambda: self.e.design([TEST_SENTENCE], [f"{VOICES[v]}. 차분하게"], 3),
            "복제 1.7B 기준문장 포함": lambda: self.e.clone([TEST_SENTENCE], self.e.prompt(wav, sr, ref_text), 3),
            "복제 1.7B 목소리 특징만": lambda: self.e.clone([TEST_SENTENCE], self.e.prompt(wav, sr, None), 3),
            "복제 0.6B 기준문장 포함": lambda: self.e.clone(
                [TEST_SENTENCE], self.e.prompt(wav, sr, ref_text, "base06"), 3, "base06"),
            "복제 0.6B 목소리 특징만": lambda: self.e.clone(
                [TEST_SENTENCE], self.e.prompt(wav, sr, None, "base06"), 3, "base06"),
        }
        table = {}
        for label, fn in variants.items():
            fn()  # 첫 실행은 준비 시간이 섞이므로 제외
            secs, audio = [], 0.0
            for _ in range(3):
                (wavs, sr2), sec = self.timed(fn)
                secs.append(sec)
                audio = duration(wavs[0], sr2)
            self.save("speed", label, wavs[0], sr2, TEST_SENTENCE, float(np.mean(secs)), v)
            table[label] = {"평균초": round(float(np.mean(secs)), 2), "최소초": round(min(secs), 2),
                            "실시간배수": round(audio / float(np.mean(secs)), 2)}
            self.log(f"속도: {label} 평균 {np.mean(secs):.2f}초")
        self.summary["speed"] = table

        throughput = {}
        for model in ("base17", "base06"):
            items = self.e.prompt(wav, sr, ref_text, model)
            for n in (1, 2, 4, 8):
                texts = CONSISTENCY_SENTENCES[:n]
                _, sec = self.timed(self.e.clone, texts, items, 4, model)
                throughput[f"{model} 동시 {n}개"] = round(n / sec, 2)
        self.summary["throughput"] = throughput
        self.log("동시 처리량 측정 완료")

    # ---------- 6. 숨소리 조건 비교 + 앞 숨소리 자르기 ----------
    def breath(self) -> None:
        v = self.voices[0]
        base = f"{VOICES[v]}. 차분하게"
        conditions = {
            "기본": ({}, base),
            "지시문에 '숨소리 없이'": ({}, f"{base}, {NO_BREATH_HINT}"),
            "무작위성 낮춤": ({"temperature": 0.6, "subtalker_temperature": 0.6}, base),
            "둘 다": ({"temperature": 0.6, "subtalker_temperature": 0.6}, f"{base}, {NO_BREATH_HINT}"),
        }
        for label, (gen, instruct) in conditions.items():
            wavs, sr = self.e.design(BREATH_SENTENCES, [instruct] * len(BREATH_SENTENCES), 5, **gen)
            for text, w in zip(BREATH_SENTENCES, wavs):
                trimmed = trim_leading(w, sr)
                cut = round(duration(w, sr) - duration(trimmed, sr), 2)
                self.save("breath", f"{label}", w, sr, text, None, v)
                self.save("breath", f"{label} · 앞부분 자름({cut}초)", trimmed, sr, text, None, v)
        self.log("숨소리 조건 비교 완료")

    # ---------- 7. 문장 부호에서 나눠 만들기 ----------
    def split(self) -> None:
        v = self.voices[0]
        wav, sr, ref_text = self.refs[(v, "calm")]
        items = self.e.prompt(wav, sr, ref_text)
        for text in SPLIT_TEXTS:
            (whole, sr2), sec_whole = self.timed(self.e.clone, [text], items, 6)
            parts = [p.strip() + "." for p in text.split(".") if p.strip()]
            (pieces, _), sec_split = self.timed(self.e.clone, parts, items, 6)
            self.save("split", "한 번에 생성", whole[0], sr2, text, sec_whole, v)
            self.save("split", "나눠 생성 + 무음 연결", join_with_silence(pieces, sr2), sr2, text, sec_split, v)
        self.log("나눠 만들기 비교 완료")

    # ---------- 8. 다급한 문장 ----------
    def urgent(self) -> None:
        for v in self.voices:
            wav, sr, ref_text = self.refs[(v, "tremor")]
            (wavs, sr2), sec = self.timed(self.e.clone, [URGENT_TEXT], self.e.prompt(wav, sr, ref_text), 7)
            self.save("urgent", "A 떨림 기준 음성으로 복제", wavs[0], sr2, URGENT_TEXT, sec, v)
            (wavs, sr2), sec = self.timed(self.e.design, [URGENT_TEXT], [f"{VOICES[v]}. {URGENT_INSTRUCT}"], 7)
            self.save("urgent", "B 다급하게 지시", wavs[0], sr2, URGENT_TEXT, sec, v)
        self.log("다급한 문장 완료")

    def run(self, steps: list[str]) -> None:
        for step in steps:
            if step != "build_references" and not self.refs:
                break
            try:
                getattr(self, step)()
            except Exception as exc:  # 한 부분이 실패해도 나머지는 계속
                self.summary["errors"].append(f"{step}: {exc!r}")
                self.log(f"❌ {step} 실패: {exc!r}")
                traceback.print_exc()
            self.write()

    def write(self) -> None:
        self.summary["minutes"] = round((time.time() - self.started) / 60, 1)
        data = {"summary": self.summary, "rows": self.rows}
        (self.out / "results.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="t03_out")
    parser.add_argument("--voices", default=",".join(VOICES), help="예: v20f1 (빠른 시험)")
    parser.add_argument("--fake", action="store_true", help="GPU 없이 흐름만 확인")
    args = parser.parse_args()

    out = Path(args.out)
    (out / "wav").mkdir(parents=True, exist_ok=True)
    if args.fake:
        from spike_engine import FakeEngine
        engine = FakeEngine()
    else:
        from spike_engine import QwenSpikeEngine
        engine = QwenSpikeEngine()

    spike = Spike(engine, out, args.voices.split(","))
    spike.log(f"시작 (GPU: {engine.gpu}, 음성: {args.voices})")
    spike.run(["build_references", "compare_methods", "consistency", "speed", "breath", "split", "urgent"])

    from spike_report import build_report
    path = build_report(out)
    spike.log(f"✅ 끝. 보고서: {path}")
    if spike.summary["errors"]:
        print("⚠️ 실패한 부분:", *spike.summary["errors"], sep="\n  ")


if __name__ == "__main__":
    main()
