"""T03 검증용 모델 묶음. 실제 Qwen 모델과, GPU 없이 흐름만 확인하는 가짜 모델."""

import numpy as np

MODELS = {
    "design": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    "base17": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    "base06": "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
}
LANGUAGE = "Korean"


class QwenSpikeEngine:
    def __init__(self) -> None:
        import torch
        from qwen_tts import Qwen3TTSModel

        self._torch = torch
        self._cls = Qwen3TTSModel
        self._models = {}
        count = torch.cuda.device_count()
        self.gpu = torch.cuda.get_device_name(0) if count else "cpu"
        # GPU가 2장이면 설계 모델과 복제 모델을 나눠 올린다 (Kaggle T4 x2)
        self._device = {"design": "cuda:0", "base17": "cuda:1" if count > 1 else "cuda:0",
                        "base06": "cuda:1" if count > 1 else "cuda:0"}
        major = torch.cuda.get_device_capability(0)[0] if count else 0
        self._dtype = torch.bfloat16 if major >= 8 else torch.float16

    def _model(self, name: str):
        if name not in self._models:
            self._models[name] = self._cls.from_pretrained(
                MODELS[name], device_map=self._device[name], dtype=self._dtype, attn_implementation="sdpa"
            )
        return self._models[name]

    def load(self, name: str) -> None:
        self._model(name)

    def design(self, texts: list[str], instructs: list[str], seed: int, **gen):
        self._torch.manual_seed(seed)
        wavs, sr = self._model("design").generate_voice_design(
            text=texts, instruct=instructs, language=[LANGUAGE] * len(texts), **gen
        )
        return [np.asarray(w, dtype=np.float32) for w in wavs], int(sr)

    def prompt(self, wav: np.ndarray, sr: int, ref_text: str | None, model: str = "base17"):
        """기준 음성으로 복제 준비. ref_text 가 없으면 목소리 특징(x-vector)만 사용."""
        return self._model(model).create_voice_clone_prompt(
            ref_audio=(wav, sr), ref_text=ref_text, x_vector_only_mode=ref_text is None
        )

    def clone(self, texts: list[str], prompt_items: list, seed: int, model: str = "base17", **gen):
        self._torch.manual_seed(seed)
        wavs, sr = self._model(model).generate_voice_clone(
            text=texts, language=[LANGUAGE] * len(texts),
            voice_clone_prompt=prompt_items * len(texts), **gen
        )
        return [np.asarray(w, dtype=np.float32) for w in wavs], int(sr)

    def embed(self, wav: np.ndarray, sr: int) -> np.ndarray:
        """같은 사람 점수용 목소리 특징 (1.7B Base 기준으로 통일)."""
        item = self.prompt(wav, sr, None, "base17")[0]
        return item.ref_spk_embedding.float().cpu().numpy()


class FakeEngine:
    """GPU 없이 스크립트 흐름과 보고서만 확인할 때 쓰는 가짜 모델."""

    gpu = "fake"

    def __init__(self) -> None:
        self._rng = np.random.default_rng(0)

    def load(self, name: str) -> None:
        pass

    def _wav(self, text: str) -> np.ndarray:
        sr = 24000
        t = np.arange(int(sr * (0.3 + 0.08 * len(text)))) / sr
        return (0.2 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)

    def design(self, texts, instructs, seed, **gen):
        return [self._wav(t) for t in texts], 24000

    def prompt(self, wav, sr, ref_text, model="base17"):
        return [object()]

    def clone(self, texts, prompt_items, seed, model="base17", **gen):
        return [self._wav(t) for t in texts], 24000

    def embed(self, wav, sr):
        return self._rng.normal(size=16) + 3.0
