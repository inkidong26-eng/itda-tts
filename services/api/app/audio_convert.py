"""wav → mp3 64kbps 모노 (07 문서 3절). ffmpeg 가 없거나 실패하면 wav 그대로 (소리가 안 나는 것보다 낫다)."""

import asyncio
import io
import logging
import shutil
import wave

log = logging.getLogger("itda.audio")
CONVERT_TIMEOUT_S = 10


def wav_duration_ms(data: bytes) -> int:
    try:
        with wave.open(io.BytesIO(data)) as w:
            return int(w.getnframes() * 1000 / w.getframerate())
    except (wave.Error, EOFError, ZeroDivisionError):
        return 0


async def to_mp3(wav: bytes) -> tuple[bytes, str]:
    """(파일 내용, 확장자) 를 돌려준다."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return wav, "wav"
    try:
        proc = await asyncio.create_subprocess_exec(
            ffmpeg, "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-b:a", "64k", "-f", "mp3", "pipe:1",
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(proc.communicate(wav), CONVERT_TIMEOUT_S)
        if proc.returncode == 0 and out:
            return out, "mp3"
    except (OSError, asyncio.TimeoutError, NotImplementedError):
        pass  # NotImplementedError: 일부 윈도우 실행 환경은 하위 프로그램 실행을 지원하지 않음
    log.warning("mp3 convert failed, using wav")
    return wav, "wav"
