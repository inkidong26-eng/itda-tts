"""T05 목소리 만들기 스크립트: GPU 없이(가짜 모델) 흐름·확정·이어서 만들기를 확인한다."""

import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "build_voices.py"


def run(*args):
    res = subprocess.run([sys.executable, str(SCRIPT), *args, "--fake"], capture_output=True, text=True, encoding="utf-8")
    assert res.returncode == 0, res.stderr[-2000:]
    return res


def test_build_apply_and_resume(tmp_path):
    out = tmp_path / "voices"
    run("--out", str(out), "--only", "v20f1,v50m1")
    v = out / "v20f1"
    assert sorted(p.stem for p in v.glob("*.wav")) == sorted(["angry", "calm", "joy", "plead", "preview", "sad", "surprise", "tremor"])
    assert len(list((v / "cand").glob("*.wav"))) == 21  # 감정 7 × 후보 3
    assert (v / "wave.svg").read_text(encoding="utf-8").startswith("<svg")
    assert (out / "review.html").exists()

    picks = tmp_path / "picks.txt"
    picks.write_text("v20f1 calm 2\nv20f1 승인\nv50m1 제외\n# v20f1_joy_1 숨소리\n", encoding="utf-8")
    run("--out", str(out), "--apply", str(picks))
    meta = json.loads((v / "meta.json").read_text(encoding="utf-8"))
    assert meta["approved"] is True and meta["emotions"]["calm"]["pick"] == 2
    assert (v / "calm.wav").read_bytes() == (v / "cand" / "calm_2.wav").read_bytes()
    assert json.loads((out / "v50m1" / "meta.json").read_text(encoding="utf-8"))["approved"] is False

    # 전체를 다시 돌리면 이미 만든 2개는 건너뛴다 (끊겼다 이어서 할 때 GPU 시간 절약)
    run("--out", str(out))
    summary = json.loads((out / "summary.json").read_text(encoding="utf-8"))
    assert summary["skipped"] == ["v20f1", "v50m1"] and len(summary["done"]) == 12 and not summary["failed"]
