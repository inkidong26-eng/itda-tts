"""글 → 음성 처리 한 곳 (07 문서 5절). /tts 와 링크 통화(say)가 같은 검사·캐시·비상 전환을 쓴다.
글 내용은 저장·기록하지 않는다 (events 에는 시간·비상 전환 여부만)."""

import time

from fastapi import FastAPI

from app.cache import cache_key
from app.text_normalize import normalize

MAX_CHARS = 100


class SpeechError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


async def speak_for_user(app: FastAPI, user_id: str, text: str, voice_id: str | None) -> dict:
    """{url, durationMs, cached, fallback, displayText}. 입력이 잘못되면 SpeechError."""
    started = time.perf_counter()
    if not app.state.limiter.allow(f"tts:{user_id}", app.state.settings.tts_limit_per_min):
        raise SpeechError(429, "잠시 후 다시 보내 주세요")
    text = text.strip()
    if not text:
        raise SpeechError(400, "보낼 글을 적어 주세요")
    if len(text) > MAX_CHARS:
        raise SpeechError(400, f"{MAX_CHARS}자까지 보낼 수 있어요")
    if not voice_id or await app.state.db.get_approved_voice(voice_id) is None:
        raise SpeechError(400, "없는 목소리예요")
    spoken = normalize(text)
    if not spoken:
        raise SpeechError(400, "읽을 글자가 없어요")

    # 감정·속도 반영은 T13 → 지금은 모두 평온·보통 속도로 만들고, 캐시 키도 같게 맞춘다
    emotion, intensity, tremor, speed = "calm", 2, 0, 1.0
    key = cache_key(app.state.settings.app_secret, voice_id, emotion, intensity, tremor, speed, spoken)
    payload = {"voiceId": voice_id, "emotion": emotion, "intensity": intensity, "tremor": tremor,
               "text": spoken, "seed": 1}
    result = await app.state.tts.speak(key, payload, spoken)

    ms = int((time.perf_counter() - started) * 1000)
    await app.state.db.add_event("tts_cached" if result["cached"] else "tts", ms, result["fallback"])
    return result
