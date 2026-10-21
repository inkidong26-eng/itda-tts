"""T03 검증용 소리 도구: 앞 숨소리 자르기, 이어 붙이기, 같은 사람 점수, 보고서용 변환."""

import base64
import io
import shutil
import subprocess

import numpy as np
import soundfile as sf


def duration(wav: np.ndarray, sr: int) -> float:
    return len(wav) / sr


def trim_leading(wav: np.ndarray, sr: int, ratio: float = 0.08, keep_ms: int = 40) -> np.ndarray:
    """말소리보다 훨씬 작은 앞부분(숨소리·잡음)을 잘라낸다. 소리 크기 기준."""
    frame = int(sr * 0.02)
    if len(wav) < frame * 2:
        return wav
    n = len(wav) // frame
    rms = np.sqrt(np.mean(wav[: n * frame].reshape(n, frame) ** 2, axis=1))
    threshold = rms.max() * ratio
    loud = np.nonzero(rms > threshold)[0]
    if len(loud) == 0:
        return wav
    start = max(0, loud[0] * frame - int(sr * keep_ms / 1000))
    return wav[start:]


def join_with_silence(parts: list[np.ndarray], sr: int, gap_sec: float = 0.25) -> np.ndarray:
    """따로 만든 문장들을 깨끗한 무음으로 잇는다 (문장 사이 숨소리 제거용)."""
    gap = np.zeros(int(sr * gap_sec), dtype=np.float32)
    out = []
    for i, p in enumerate(parts):
        if i:
            out.append(gap)
        out.append(trim_leading(p, sr))
    return np.concatenate(out)


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.float32).ravel()
    b = np.asarray(b, dtype=np.float32).ravel()
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


def to_data_uri(wav: np.ndarray, sr: int) -> str:
    """보고서에 넣을 소리. ffmpeg가 있으면 작은 mp3, 없으면 wav."""
    buf = io.BytesIO()
    sf.write(buf, wav, sr, format="WAV", subtype="PCM_16")
    data, mime = buf.getvalue(), "audio/wav"
    if shutil.which("ffmpeg"):
        res = subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-b:a", "64k", "-f", "mp3", "pipe:1"],
            input=data, capture_output=True,
        )
        if res.returncode == 0 and res.stdout:
            data, mime = res.stdout, "audio/mpeg"
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"
