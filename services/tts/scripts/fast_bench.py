"""faster-qwen3-tts 시험 (11/9). 지금 돌아가는 음성 서버와 따로, 별도 가상환경(/workspace/venv_fast)에서만 돌린다.

같은 목소리(기준 음성)로 길이별 문장을 만들어 걸린 시간을 재고, 들어 볼 수 있게 wav 로 남긴다.
실행 (Jupyter 터미널):
  HF_HOME=/workspace/hf /workspace/venv_fast/bin/python /workspace/itda-tts/services/tts/scripts/fast_bench.py v30f1
결과 소리: /workspace/fast_test/
"""

import json
import sys
import time
from pathlib import Path

import soundfile as sf
import torch
from faster_qwen3_tts import FasterQwen3TTS

VOICE = sys.argv[1] if len(sys.argv) > 1 else "v30f1"
ROOT = Path("/workspace/voices")
OUT = Path("/workspace/fast_test")
OUT.mkdir(exist_ok=True)

TEXTS = [
    "오늘 날씨 좋네요.",
    "은행에 가서 통장을 새로 만들고 싶은데 어떻게 하면 되나요?",
    "처음 뵙겠습니다. 저는 천안에 살고 있고, 오늘 이 부스에 처음 와 봤어요.",
    "저는 듣지 못하지만, 이 목소리로 말할 수 있어요. 은행이나 관공서에서도 혼자 일을 볼 수 있으면 좋겠어요. 오늘 와 주셔서 정말 감사합니다.",
]

meta = next(json.loads(p.read_text(encoding="utf-8")) for p in ROOT.glob("*/meta.json")
            if json.loads(p.read_text(encoding="utf-8")).get("id") == VOICE)
ref_dir = next(p.parent for p in ROOT.glob("*/meta.json") if json.loads(p.read_text(encoding="utf-8")).get("id") == VOICE)
ref_wav = str(ref_dir / "calm.wav")
ref_text = meta["emotions"]["calm"]["text"]
print("torch", torch.__version__, "| GPU", torch.cuda.get_device_name(0), "| 목소리", VOICE)

t0 = time.time()
model = FasterQwen3TTS.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-Base", device="cuda", dtype=torch.bfloat16)
print(f"모델 올림 {time.time() - t0:.1f}초")
langs = model.model.model.config.talker_config.codec_language_id
print("한국어 지원:", "korean" in [k.lower() for k in langs])

# 준비 운동 (처음 한 번은 느림: 계산 그래프를 만든다)
t0 = time.time()
model.generate_voice_clone(text="안녕하세요, 반갑습니다.", language="Korean", ref_audio=ref_wav, ref_text=ref_text)
model.generate_voice_clone(text="준비 운동을 한 번 더 합니다.", language="Korean", ref_audio=ref_wav, ref_text=ref_text)
print(f"준비 운동 {time.time() - t0:.1f}초\n")

print("== 한 번에 만들기 ==")
for i, text in enumerate(TEXTS):
    torch.manual_seed(1)
    torch.cuda.synchronize(); t0 = time.time()
    wavs, sr = model.generate_voice_clone(text=text, language="Korean", ref_audio=ref_wav, ref_text=ref_text)
    torch.cuda.synchronize(); dt = time.time() - t0
    sf.write(OUT / f"{VOICE}_{i + 1}_{len(text)}자.wav", wavs[0], sr)
    print(f"{len(text):>3}자  {dt:5.2f}초  (소리 길이 {len(wavs[0]) / sr:4.1f}초)")

print("\n== 말하면서 만들기 (첫 소리까지) ==")
for i, text in enumerate(TEXTS):
    torch.manual_seed(1)
    t0 = time.time(); first = None; chunks = []
    for chunk, sr, _ in model.generate_voice_clone_streaming(text=text, language="Korean", ref_audio=ref_wav,
                                                            ref_text=ref_text, chunk_size=8):
        if first is None:
            first = time.time() - t0
        chunks.append(chunk)
    print(f"{len(text):>3}자  첫 소리 {first:4.2f}초  다 만듦 {time.time() - t0:5.2f}초")
print("\n끝. 소리 파일:", OUT)
