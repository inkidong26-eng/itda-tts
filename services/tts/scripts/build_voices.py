"""T05 음성 라이브러리 만들기 (03 문서 4–6절, T03 결정: 방식 A · 복제 1.7B, 10/24 청취: 0.6B 탈락).

목소리마다 감정 7개 × 후보 N개를 설계 모델로 만들고 (앞 숨소리 자동 자름),
'같은 사람 점수'로 하나를 추천해 둔 뒤, 사람이 review.html 에서 듣고 고른다.

  만들기:  python build_voices.py --out /workspace/voices            (전체, 이미 만든 목소리는 건너뜀)
           python build_voices.py --out ... --only v20f1,v30m1 --seed 2   (일부만 다시)
  확정:    python build_voices.py --out ... --apply picks.txt         (review.html 에서 복사한 결과)
  시험:    python build_voices.py --out /tmp/v --fake --only v20f1     (GPU 없이 흐름만)

결과: {out}/{id}/cand/{emotion}_{n}.wav, {emotion}.wav(고른 것), preview.wav/.mp3, wave.svg, meta.json
      {out}/review.html, {out}/summary.json
"""

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).parent))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # Windows 콘솔에서도 ✅ 같은 글자가 깨지지 않게
from spike_audio import cosine, trim_leading  # noqa: E402
from spike_data import EMOTIONS  # noqa: E402

DESIGNS = Path(__file__).resolve().parent.parent / "voice_designs.json"
PREVIEW = "안녕하세요, 저는 {name}이에요. 만나서 반가워요."
MARKS = ["좋음", "숨소리", "다른사람", "어색"]
# 설계 설명이 영어인 목소리는 감정 지시도 영어로 (10/30: 한국어 설명으로 만든 남성 목소리가 여성처럼 나옴)
# 평온도 '생기 있게': 10/30 청취에서 남성 목소리가 나이 들고 늘어진다는 의견
HINTS_EN = {"calm": "relaxed but lively, natural conversational pace", "joy": "bright and excited, with a smile", "sad": "low and slow, sad",
            "angry": "firm and strong, a little angry", "surprise": "surprised, higher and faster",
            "plead": "earnest and pleading", "tremor": "trembling voice, hesitant, words shaking at the end"}
# 목소리 높이(Hz) 기준: 남성은 이보다 낮아야, 여성은 이보다 높아야 맞는 성별로 본다
MALE_MAX_HZ, FEMALE_MIN_HZ = 170, 165


def pitch_hz(wav: np.ndarray, sr: int) -> float:
    """말하는 부분의 목소리 높이 중앙값 (자기상관). 0 이면 측정 실패."""
    fr, hop, found = int(sr * 0.04), int(sr * 0.01), []
    lo, hi = int(sr / 400), int(sr / 65)
    for i in range(0, len(wav) - fr, hop):
        x = wav[i:i + fr] - wav[i:i + fr].mean()
        if np.sqrt((x ** 2).mean()) < 0.02:
            continue
        c = np.correlate(x, x, "full")[fr - 1:]
        k = lo + int(np.argmax(c[lo:hi]))
        if c[k] > 0.3 * c[0]:
            found.append(sr / k)
    return float(np.median(found)) if found else 0.0


def gender_ok(voice: dict, hz: float) -> bool:
    if hz <= 0:
        return True
    return hz <= MALE_MAX_HZ if voice["gender"] == "m" else hz >= FEMALE_MIN_HZ


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def save_wav(path: Path, wav: np.ndarray, sr: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, wav, sr, subtype="PCM_16")


def to_mp3(src: Path) -> Path | None:
    """앱 미리듣기용 작은 mp3 (ffmpeg 가 없으면 건너뜀 → 앱은 wav 를 쓴다)."""
    if not shutil.which("ffmpeg"):
        return None
    dst = src.with_suffix(".mp3")
    res = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-b:a", "64k", str(dst)])
    return dst if res.returncode == 0 else None


def wave_svg(wav: np.ndarray, bars: int = 60) -> str:
    """미리듣기 파형 그림 (02 문서 S4). 막대 높이 = 구간 소리 크기."""
    chunks = np.array_split(np.abs(wav), bars)
    peaks = np.array([float(c.max()) if len(c) else 0.0 for c in chunks])
    peaks = peaks / (peaks.max() or 1.0)
    rects = "".join(
        f'<rect x="{i * 5}" y="{20 - h * 18:.1f}" width="3" height="{max(h * 36, 1):.1f}" rx="1.5"/>'
        for i, h in enumerate(peaks)
    )
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {bars * 5} 40" fill="#1A9A9A">{rects}</svg>'


def design_candidates(engine, voice: dict, out: Path, seed: int, candidates: int) -> None:
    """1단계 (설계 모델만): 감정 7 × 후보 N 을 만들어 저장. 이미 있는 감정은 건너뛴다 (끊겨도 이어서)."""
    cdir = out / voice["id"] / "cand"
    for code, label, ref_text, hint in EMOTIONS:
        if all((cdir / f"{code}_{i + 1}.wav").exists() for i in range(candidates)):
            continue
        t0 = time.time()
        if voice["design"].isascii():
            hint = HINTS_EN[code]
        wavs, sr = engine.design([ref_text] * candidates, [f"{voice['design']}. {hint}"] * candidates, seed)
        for i, w in enumerate(wavs):
            # 앞 숨소리·잡음 자르기 (10/24 청취: 기준음성 43% 숨소리)
            save_wav(cdir / f"{code}_{i + 1}.wav", trim_leading(w, sr), sr)
        log(f"   {voice['id']} {label} 후보 {candidates}개 ({time.time() - t0:.0f}초)")


def pick_and_finish(engine, voice: dict, out: Path, seed: int, candidates: int) -> dict:
    """2단계 (복제 모델만): 같은 사람 점수로 감정마다 하나 추천, 미리듣기·파형·meta.json."""
    vdir = out / voice["id"]
    meta = {"id": voice["id"], "name": voice["name"], "seed": seed, "emotions": {}}
    calm_embed = None
    for code, label, ref_text, _ in EMOTIONS:
        loaded = [sf.read(vdir / "cand" / f"{code}_{i + 1}.wav", dtype="float32") for i in range(candidates)]
        wavs, sr = [w for w, _ in loaded], loaded[0][1]
        embeds = [engine.embed(w, sr) for w in wavs]
        if calm_embed is None:
            # 평온: 후보끼리 가장 닮은 것(가장 '대표'인 목소리)을 기준으로 삼는다
            scores = [float(np.mean([cosine(e, o) for o in embeds])) for e in embeds]
        else:
            scores = [cosine(e, calm_embed) for e in embeds]
        pitches = [round(pitch_hz(w, sr)) for w in wavs]
        # 성별이 맞는 후보만 고른다. 평온(기준)은 반드시 맞아야 하고, 하나도 없으면 실패로 알린다
        ok = [i for i in range(len(wavs)) if gender_ok(voice, pitches[i])]
        if calm_embed is None and not ok:
            raise RuntimeError(f"성별에 맞는 평온 후보가 없어요 (높이 {pitches}Hz) → --seed 를 바꿔 다시")
        pool = ok or list(range(len(wavs)))
        best = max(pool, key=lambda i: scores[i])
        shutil.copyfile(vdir / "cand" / f"{code}_{best + 1}.wav", vdir / f"{code}.wav")
        if calm_embed is None:
            calm_embed = embeds[best]
            calm = (wavs[best], sr, ref_text)
        meta["emotions"][code] = {"label": label, "text": ref_text, "pick": best + 1,
                                  "scores": [round(s, 3) for s in scores], "pitchHz": pitches}
    write_preview(engine, voice, vdir, *calm, seed)
    (vdir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    return meta


def write_preview(engine, voice: dict, vdir: Path, wav, sr, ref_text, seed: int) -> None:
    """미리듣기는 평온 기준음성을 복제해서 만든다 (실제 앱이 말하는 방식과 같게)."""
    items = engine.prompt(wav, sr, ref_text)
    (pw,), psr = engine.clone([PREVIEW.format(name=voice["name"])], items, seed)
    pw = trim_leading(pw, psr)
    save_wav(vdir / "preview.wav", pw, psr)
    to_mp3(vdir / "preview.wav")
    (vdir / "wave.svg").write_text(wave_svg(pw), encoding="utf-8")


def apply_picks(out: Path, text: str, engine=None) -> list[str]:
    """review.html 결과 적용. 줄 형식: 'v20f1 calm 2' (그 후보로 바꿈) / 'v20f1 승인' / 'v20f1 제외'."""
    changed, problems = [], []
    for raw in text.splitlines():
        parts = raw.split()
        if len(parts) < 2 or raw.lstrip().startswith("#"):  # '#' 줄은 메모(체크 표시)
            continue
        vid, what = parts[0], parts[1]
        vdir = out / vid
        mpath = vdir / "meta.json"
        if not mpath.exists():
            problems.append(f"{vid}: 만든 적 없는 목소리")
            continue
        meta = json.loads(mpath.read_text(encoding="utf-8"))
        if what in ("승인", "제외"):
            meta["approved"] = what == "승인"
        elif what in meta["emotions"] and len(parts) >= 3 and parts[2].isdigit():
            src = vdir / "cand" / f"{what}_{parts[2]}.wav"
            if not src.exists():
                problems.append(f"{vid} {what}: 후보 {parts[2]} 없음")
                continue
            shutil.copyfile(src, vdir / f"{what}.wav")
            meta["emotions"][what]["pick"] = int(parts[2])
            if what == "calm" and engine is not None:
                # 평온을 바꾸면 미리듣기도 새 기준음성으로 다시 만든다
                wav, sr = sf.read(src, dtype="float32")
                voice = next(v for v in json.loads(DESIGNS.read_text(encoding="utf-8")) if v["id"] == vid)
                write_preview(engine, voice, vdir, wav, sr, meta["emotions"]["calm"]["text"], meta["seed"])
        else:
            problems.append(f"알 수 없는 줄: {raw}")
            continue
        mpath.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        changed.append(raw.strip())
    for p in problems:
        log(f"⚠️ {p}")
    return changed


def write_review(out: Path) -> Path:
    """사람 검수 보고서: 목소리마다 감정 7 × 후보 N. 추천 후보는 미리 선택, 고른 결과를 복사해 --apply 로."""
    from spike_audio import to_data_uri

    rows = []
    for mpath in sorted(out.glob("*/meta.json")):
        meta = json.loads(mpath.read_text(encoding="utf-8"))
        vid = meta["id"]
        vdir = mpath.parent
        rows.append(f"<h2>{vid} · {meta['name']}</h2>")
        if (vdir / "preview.wav").exists():
            pw, psr = sf.read(vdir / "preview.wav", dtype="float32")
            rows.append(f"<p>미리듣기 <audio controls preload=none src='{to_data_uri(pw, psr)}'></audio></p>")
        rows.append(f"<p><label><input type=radio name='{vid}_ok' value='승인'> ✅ 승인</label> "
                    f"<label><input type=radio name='{vid}_ok' value='제외'> ❌ 제외</label></p><table>")
        for code, e in meta["emotions"].items():
            cells = []
            for i in range(1, len(e["scores"]) + 1):
                w, sr = sf.read(vdir / "cand" / f"{code}_{i}.wav", dtype="float32")
                checked = " checked" if i == e["pick"] else ""
                marks = "".join(f"<label><input type=checkbox data-k='{m}'>{m}</label> " for m in MARKS)
                cells.append(
                    f"<td data-id='{vid}_{code}_{i}'><label><input type=radio name='{vid}_{code}' value='{i}'{checked}"
                    f" data-auto='{e['pick']}'> 후보 {i}</label> <small>점수 {e['scores'][i - 1]} · 높이 {e.get('pitchHz', [0] * 9)[i - 1]}Hz</small><br>"
                    f"<audio controls preload=none src='{to_data_uri(w, sr)}'></audio><br>{marks}</td>"
                )
            rows.append(f"<tr><th>{e['label']}<br><small>{e['text']}</small></th>{''.join(cells)}</tr>")
        rows.append("</table>")
    page = f"""<!doctype html><html lang=ko><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>ITDA 목소리 검수</title><style>
body{{font:16px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1200px;padding:16px;background:#fff;color:#111}}
h2{{border-bottom:2px solid #1A9A9A;margin-top:32px}}table{{border-collapse:collapse;width:100%}}
td,th{{border-bottom:1px solid #ddd;padding:6px;vertical-align:top;text-align:left}}label{{white-space:nowrap}}audio{{height:32px;max-width:240px}}
.box{{position:sticky;top:0;background:#f0fdfa;border:1px solid #99d;padding:10px;z-index:1}}textarea{{width:100%;height:100px}}
</style><h1>ITDA 목소리 검수</h1>
<div class=box>기준: 나이·성별이 맞게 들림 / 발음 / 감정 구분 / 잡음 없음 / <b>원치 않는 숨소리 없음</b> (숨소리는 '떨림'에서만 괜찮아요).<br>
각 감정에서 <b>가장 좋은 후보</b>를 고르고(처음엔 같은 사람 점수로 추천된 것이 골라져 있어요), 문제를 체크하고, 목소리마다 ✅/❌를 고른 뒤
<button onclick=collect()>결과 복사</button><textarea id=out placeholder="여기에 결과가 나와요. 복사해서 대화창에 붙여 넣어 주세요"></textarea></div>
{''.join(rows)}
<script>
function collect(){{
  const lines=[];
  document.querySelectorAll('input[type=radio]:checked').forEach(r=>{{
    if(r.name.endsWith('_ok')){{lines.push(r.name.slice(0,-3)+' '+r.value);return}}
    const [vid,code]=r.name.split('_');
    if(r.value!==r.dataset.auto) lines.push(vid+' '+code+' '+r.value);
  }});
  document.querySelectorAll('td[data-id]').forEach(td=>{{
    const m=[...td.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.dataset.k);
    if(m.length) lines.push('# '+td.dataset.id+' '+m.join(','));
  }});
  const t=document.getElementById('out'); t.value=lines.join('\\n')||'(바꾼 것 없음)'; t.select();
  try{{navigator.clipboard.writeText(t.value)}}catch(e){{}}
}}
</script></html>"""
    path = out / "review.html"
    tmp = out / "review.html.tmp"
    tmp.write_text(page, encoding="utf-8")
    for attempt in range(5):  # Windows 에서 바이러스 검사가 파일을 잠깐 잡고 있으면 바꾸기가 실패할 수 있다
        try:
            tmp.replace(path)
            break
        except OSError:
            if attempt == 4:
                raise
            time.sleep(0.5)
    return path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="", help="쉼표로 구분한 id (이미 만든 것도 다시 만든다)")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--candidates", type=int, default=3)
    ap.add_argument("--apply", default="", help="review.html 에서 복사한 결과 파일")
    ap.add_argument("--fake", action="store_true", help="GPU 없이 흐름만 확인")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    if args.fake:
        from spike_engine import FakeEngine
        engine = FakeEngine()
    else:
        from spike_engine import QwenSpikeEngine
        engine = QwenSpikeEngine()

    if args.apply:
        changed = apply_picks(out, Path(args.apply).read_text(encoding="utf-8"), engine)
        log(f"적용 {len(changed)}줄")
        log(f"✅ 검수 보고서 다시 만듦: {write_review(out)}")
        return

    voices = json.loads(DESIGNS.read_text(encoding="utf-8"))
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    todo = [v for v in voices if v["id"] in only] if only else voices
    for v in todo:
        if only:
            shutil.rmtree(out / v["id"], ignore_errors=True)  # --only 는 처음부터 다시 (--seed 를 바꿔 쓴다)
    skipped = [v["id"] for v in todo if (out / v["id"] / "meta.json").exists()]  # 끊겼다 다시 돌려도 이미 끝난 것은 건너뜀
    todo = [v for v in todo if v["id"] not in skipped]
    done, failed = [], []
    started = time.time()
    log(f"GPU: {getattr(engine, 'gpu', '?')} / 목소리 {len(todo)}개 × 감정 {len(EMOTIONS)} × 후보 {args.candidates}"
        + (f" (이미 끝난 {len(skipped)}개 건너뜀)" if skipped else ""))

    # 1단계: 설계 모델 하나만 올려 후보를 모두 만든다
    log("1단계: 후보 만들기 (설계 모델)")
    for n, voice in enumerate(todo, 1):
        t0 = time.time()
        try:
            design_candidates(engine, voice, out, args.seed, args.candidates)
            log(f"[{n}/{len(todo)}] {voice['id']} {voice['name']} 후보 완료 ({time.time() - t0:.0f}초)")
        except Exception as exc:  # 한 목소리가 실패해도 나머지는 계속
            failed.append(f"{voice['id']}: {exc!r}")
            log(f"[{n}/{len(todo)}] ⚠️ {voice['id']} 실패: {exc!r}")
    engine.unload("design")

    # 2단계: 복제 모델 하나만 올려 추천·미리듣기
    log("2단계: 추천·미리듣기 (복제 모델)")
    for n, voice in enumerate(todo, 1):
        if any(f.startswith(voice["id"] + ":") for f in failed):
            continue
        try:
            pick_and_finish(engine, voice, out, args.seed, args.candidates)
            done.append(voice["id"])
            log(f"[{n}/{len(todo)}] {voice['id']} {voice['name']} 완료")
        except Exception as exc:
            failed.append(f"{voice['id']}: {exc!r}")
            log(f"[{n}/{len(todo)}] ⚠️ {voice['id']} 실패: {exc!r}")
    summary = {"gpu": getattr(engine, "gpu", "?"), "seed": args.seed, "minutes": round((time.time() - started) / 60, 1),
               "done": done, "skipped": skipped, "failed": failed}
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    report = write_review(out)
    log(f"만듦 {len(done)} · 건너뜀 {len(skipped)} · 실패 {len(failed)}")
    for f in failed:
        log(f"  실패: {f}")
    log(f"✅ 끝. 검수 보고서: {report}")


if __name__ == "__main__":
    main()
