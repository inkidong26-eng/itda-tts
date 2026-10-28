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


def load_references(root: Path) -> dict[tuple[str, str], tuple[np.ndarray, int, str]]:
    """{(목소리, 감정): (기준 음성, 표본율, 기준 문장)}. meta.json 이 있는 목소리만, 제외(approved=false)는 뺀다."""
    refs = {}
    for meta_path in sorted(root.glob("*/meta.json")):
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if meta.get("approved") is False:
            continue
        for code, info in meta.get("emotions", {}).items():
            wav_path = meta_path.parent / f"{code}.wav"
            if wav_path.exists():
                wav, sr = sf.read(wav_path, dtype="float32")
                refs[(meta["id"], code)] = (wav, int(sr), info["text"])
    return refs


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
        key = (voice_id, emotion if (voice_id, emotion) in self.refs else "calm")
        if key not in self.refs:
            raise KeyError(voice_id)
        with self._lock:
            prompt = self._prompt(key)
            self._torch.manual_seed(seed)
            wavs, sr = self.model.generate_voice_clone(
                text=[text], language=[self.language], voice_clone_prompt=prompt
            )
        return np.asarray(wavs[0], dtype=np.float32), int(sr)
