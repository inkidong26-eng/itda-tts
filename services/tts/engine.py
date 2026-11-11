"""Qwen3-TTS 모델을 감싸는 부분. 모델은 서버 시작 시 한 번만 올린다.

T03 결정(방식 A): 목소리마다 미리 만든 감정별 기준 음성(assets: {id}/{emotion}.wav)을 복제(Base 1.7B)해서 말한다.
기준 음성 목록은 build_voices.py 가 만든 폴더(TTS_VOICES_DIR)에서 읽는다.
"""

import json
import os
import threading
from pathlib import Path

import numpy as np
import soundfile as sf

EMOTIONS = ("calm", "joy", "sad", "angry", "surprise", "plead", "tremor")


def reference_files(root: Path) -> dict[tuple[str, str], tuple[Path, str]]:
    """{(목소리, 감정): (기준 음성 파일, 기준 문장)}. meta.json 이 있는 목소리만, 제외(approved=false)는 뺀다."""
    refs = {}
    for meta_path in sorted(root.glob("*/meta.json")):
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if meta.get("approved") is False:
            continue
        for code, info in meta.get("emotions", {}).items():
            wav_path = meta_path.parent / f"{code}.wav"
            if wav_path.exists():
                refs[(meta["id"], code)] = (wav_path, info["text"])
    return refs


def load_references(root: Path) -> dict[tuple[str, str], tuple[np.ndarray, int, str]]:
    """{(목소리, 감정): (기준 음성, 표본율, 기준 문장)}"""
    refs = {}
    for key, (wav_path, text) in reference_files(root).items():
        wav, sr = sf.read(wav_path, dtype="float32")
        refs[key] = (wav, int(sr), text)
    return refs


def pick_key(refs: dict, voice_id: str, emotion: str) -> tuple[str, str]:
    """그 감정의 기준 음성이 없으면 차분함(calm)으로. 목소리가 없으면 KeyError."""
    key = (voice_id, emotion if (voice_id, emotion) in refs else "calm")
    if key not in refs:
        raise KeyError(voice_id)
    return key


class QwenEngine:
    def __init__(self) -> None:
        # torch·qwen_tts 는 무거워서 실제로 모델을 올릴 때만 불러온다 (테스트는 GPU 없이)
        import torch
        from qwen_tts import Qwen3TTSModel

        self._torch = torch
        self.model_id = os.getenv("TTS_MODEL_ID", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")
        self.language = os.getenv("TTS_LANGUAGE", "Korean")
        self.gpu = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu"
        self.model = Qwen3TTSModel.from_pretrained(
            self.model_id,
            device_map="cuda:0" if torch.cuda.is_available() else "cpu",
            dtype=self._pick_dtype(),
            attn_implementation=os.getenv("TTS_ATTN", "sdpa"),
        )
        self.refs = load_references(Path(os.getenv("TTS_VOICES_DIR", "/workspace/voices")))
        self._prompts: dict[tuple[str, str], list] = {}
        # GPU 1장에서 동시에 생성하면 꼬일 수 있어 한 번에 하나씩
        self._lock = threading.Lock()

    def _pick_dtype(self):
        torch = self._torch
        choice = os.getenv("TTS_DTYPE", "auto")
        if choice == "float16":
            return torch.float16
        if choice == "bfloat16":
            return torch.bfloat16
        # auto: RTX 30·40 계열 이상은 bfloat16, 무료 GPU(T4 등)는 float16
        if torch.cuda.is_available() and torch.cuda.get_device_capability(0)[0] >= 8:
            return torch.bfloat16
        return torch.float16

    @property
    def voices(self) -> list[str]:
        return sorted({v for v, _ in self.refs})

    def _prompt(self, key: tuple[str, str]) -> list:
        # 기준 음성 준비(복제 프롬프트)는 목소리·감정마다 한 번만 만들어 둔다
        if key not in self._prompts:
            wav, sr, text = self.refs[key]
            self._prompts[key] = self.model.create_voice_clone_prompt(ref_audio=(wav, sr), ref_text=text)
        return self._prompts[key]

    def clone(self, voice_id: str, emotion: str, text: str, seed: int) -> tuple[np.ndarray, int]:
        key = pick_key(self.refs, voice_id, emotion)
        with self._lock:
            prompt = self._prompt(key)
            self._torch.manual_seed(seed)
            wavs, sr = self.model.generate_voice_clone(
                text=[text], language=[self.language], voice_clone_prompt=prompt
            )
        return np.asarray(wavs[0], dtype=np.float32), int(sr)


class FastEngine:
    """faster-qwen3-tts (11/9 시험: 같은 모델·같은 목소리로 약 4배 빠름). 별도 가상환경 /workspace/venv_fast 에서만 돈다.
    pod_start.sh 가 /workspace/tts_engine 파일에 fast 라고 적혀 있을 때만 이 엔진을 쓴다 (지우면 원래 엔진)."""

    def __init__(self) -> None:
        import torch
        from faster_qwen3_tts import FasterQwen3TTS

        self._torch = torch
        self.model_id = os.getenv("TTS_MODEL_ID", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")
        self.language = os.getenv("TTS_LANGUAGE", "Korean")
        self.gpu = torch.cuda.get_device_name(0)
        self.model = FasterQwen3TTS.from_pretrained(self.model_id, device="cuda", dtype=torch.bfloat16)
        self.refs = reference_files(Path(os.getenv("TTS_VOICES_DIR", "/workspace/voices")))
        self._lock = threading.Lock()
        # 처음 두 번은 느리다(계산 그래프 만들기) → 손님 말 전에 미리
        if self.refs:
            first = next(iter(self.refs))
            self.clone(first[0], first[1], "안녕하세요, 반갑습니다.", 1)
            self.clone(first[0], first[1], "준비 운동을 한 번 더 합니다.", 1)

    @property
    def voices(self) -> list[str]:
        return sorted({v for v, _ in self.refs})

    def clone(self, voice_id: str, emotion: str, text: str, seed: int) -> tuple[np.ndarray, int]:
        key = pick_key(self.refs, voice_id, emotion)
        wav_path, ref_text = self.refs[key]
        with self._lock:
            self._torch.manual_seed(seed)
            wavs, sr = self.model.generate_voice_clone(
                text=text, language=self.language, ref_audio=str(wav_path), ref_text=ref_text
            )
        return np.asarray(wavs[0], dtype=np.float32), int(sr)


def make_engine(name: str):
    return FastEngine() if name == "fast" else QwenEngine()
