# services/tts — 음성 생성 서버 (GPU)

Qwen3-TTS 로 목소리를 만드는 내부 서버예요. 폰은 이 서버에 직접 접속하지 않고, API 서버만 `X-Key` 로 부릅니다.

- 명세: `docs/prd/07_기술구조_API.md` 6절
- 실제 서버 코드는 **T02** 에서 만들어요. 지금 `server.py` 는 빈 파일이에요.
