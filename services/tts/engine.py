"""Qwen3-TTS 모델을 감싸는 부분. 모델은 서버 시작 시 한 번만 올린다."""

import os
import threading

import numpy as np


class QwenEngine:
    def __init__(self) -> None:
        # torch·qwen_tts 는 무거워서 실제로 모델을 올릴 때만 불러온다 (테스트는 GPU 없이)
        import torch
        from qwen_tts import Qwen3TTSModel

        self._torch = torch
        self.model_id = os.getenv("TTS_MODEL_ID", "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign")
        self.language = os.getenv("TTS_LANGUAGE", "Korean")
        self.gpu = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu"
        self.model = Qwen3TTSModel.from_pretrained(
            self.model_id,
            device_map="cuda:0" if torch.cuda.is_available() else "cpu",
            dtype=self._pick_dtype(),
            attn_implementation=os.getenv("TTS_ATTN", "sdpa"),
        )
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

    def design(self, description: str, text: str, seed: int) -> tuple[np.ndarray, int]:
        with self._lock:
            self._torch.manual_seed(seed)
            wavs, sr = self.model.generate_voice_design(
                text=text, language=self.language, instruct=description
            )
        return np.asarray(wavs[0], dtype=np.float32), int(sr)
