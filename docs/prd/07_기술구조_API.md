# 07. 기술 구조 · API · 데이터 · 도메인

## 1. 전체 구조

```
                       ┌──────────────────────────────┐
 농인 폰 / 청인 폰  ──▶ │ itda.gyeot.ai.kr  (웹앱 PWA)   │  정적 호스팅 + 무료 HTTPS
 (브라우저)            └──────────────────────────────┘
        │  HTTPS / WebSocket
        ▼
 ┌─────────────────────────────────────────┐         ┌───────────────────────────┐
 │ api.itda.gyeot.ai.kr  (FastAPI, 항상 켜짐) │ ──────▶ │ TTS 서버 (GPU, Qwen3-TTS)   │  필요할 때 켜기
 │ - 가입·음성 목록·감정 분석                    │  비밀키  │ - /synthesize              │  행사 당일 1~2대
 │ - TTS 요청 분배·대기열·캐시·비상 전환           │         │ - /warmup, /health         │
 │ - 통화 방(WebSocket)                        │         │ - (선택) /stt  Whisper      │
 │ - 음성 파일 제공 /a/{key}.mp3               │         └───────────────────────────┘
 └─────────────────────────────────────────┘
```
- 폰은 **API 서버하고만** 통신한다. TTS 서버 주소는 외부에 공개하지 않는다 (GPU 업체가 준 주소 + 비밀키). 원하면 `tts.itda.gyeot.ai.kr` 를 내부용으로 연결.
- GPU 서버가 꺼져 있거나 밀려도 API 서버는 살아 있으므로, 앱은 **폰 기본 음성으로 계속 동작**한다.

## 2. 저장소 구조 (새 GitHub 저장소 `itda-tts`)
```
itda-tts/
├─ .agents/rules/itda-rules.md      # 안티그래비티 규칙
├─ docs/prd/                         # 이 PRD 묶음
├─ apps/web/                         # React + TypeScript + Vite + Tailwind, PWA
│  └─ src/{pages,components,audio,emotion,feedback,call,storage,api}
├─ services/api/                     # Python 3.12, FastAPI, SQLite
│  └─ app/{main.py,routers/,db.py,storage.py,rate_limit.py,tts_client.py,cache.py,text_normalize.py,emotion.py,calls.py}
├─ services/tts/                     # Python 3.12, Qwen3-TTS, Docker (GPU)
│  ├─ server.py
│  ├─ scripts/build_voices.py
│  └─ voices.yaml
├─ assets/voices/                    # 기준 음성·미리보기·파형 (Git LFS 또는 저장소 외부 보관)
├─ infra/                            # docker-compose, Caddyfile, 배포 스크립트
└─ tools/loadtest/                   # 부하 테스트 (Locust 또는 k6)
```
기존 ITDA 저장소는 **참고용으로 유지** — 채팅형 화면·즐겨찾기·화자 목록 등 검증된 부분은 참고해 옮긴다.

## 3. 기술 선택
| 영역 | 선택 | 이유 |
|---|---|---|
| 웹앱 | React + TypeScript + Vite + Tailwind, `vite-plugin-pwa` | 안티그래비티가 다루기 쉽고 빠름, 홈 화면 추가 지원 |
| 폰 저장 | IndexedDB (대화 기록), localStorage (사용자 토큰·설정) — 모두 try/catch | 서버에 대화 저장 안 함 |
| API | FastAPI + Uvicorn (단일 프로세스, 비동기) + SQLite | 500개 WebSocket 동시 연결도 단일 프로세스로 처리 가능, 단순함 |
| 웹 서버/HTTPS | Caddy (자동 무료 인증서) | 설정 몇 줄 |
| TTS | Qwen3-TTS 1.7B (FP16 약 4GB VRAM, 24GB급 GPU 1장에 여유) — 속도 부족 시 0.6B | T03에서 확정 |
| 음성 형식 | mp3 모노 64kbps (ffmpeg) | 아이폰·안드로이드 모두 재생 |
| 후처리 | ffmpeg `atempo`(속도), `vibrato`(떨림), 무음 삽입 | 04 문서 |
| 비상 음성 | 브라우저 내장 음성 합성 (`speechSynthesis`, `ko-KR`) | 무료, 서버 불필요 |
| 자막 | 브라우저 음성 인식 (`webkitSpeechRecognition`, `ko-KR`) + (선택) 서버 faster-whisper | 06 문서 |
| 감정 AI | 소형 LLM API, 입력 중 미리 분석, 1.5초 제한, 보내기는 기다리지 않음 | 04 문서 3단계 |

## 4. 호스팅과 도메인
| 주소 | 대상 | DNS 설정 (도메인 관리 화면) |
|---|---|---|
| `itda.gyeot.ai.kr` | 웹앱 정적 호스팅 (Cloudflare Pages 등 무료 플랜) | `CNAME` → 호스팅 업체가 알려준 주소 |
| `api.itda.gyeot.ai.kr` | 소형 VPS (Docker: API + Caddy) | `A` → VPS 공인 IP |
| (선택) `tts.itda.gyeot.ai.kr` | GPU 서버 | 업체 방식에 따라 `CNAME` |

- `gyeot.ai.kr` 의 DNS를 어디서 관리하는지 확인 필요 (10 문서 확인 사항). 위 레코드 2~3줄만 추가하면 된다.
- VPS는 **한국 또는 가까운 지역**을 고른다 (응답 속도).
- GPU 서버: 평소에는 시간 단위 임대 GPU(RTX 4090급 24GB)를 **개발·시연할 때만 켜고 끈다.** 행사 당일은 1대(+선택 예비 1대)를 아침부터 켜 둔다 (08 문서). 실제 서비스 단계에서 국내 클라우드 GPU로 옮긴다.

## 5. API 명세 (`https://api.itda.gyeot.ai.kr`)
모든 요청은 `Authorization: Bearer {guestToken}` (가입·통화 참여·상태 확인 제외).

| 메서드·경로 | 설명 | 요청 → 응답 |
|---|---|---|
| `POST /auth/guest` | 이름·나이대·성별로 가입 | `{name, ageGroup:"10s".."70s", gender:"m|f", consent:true}` → `{userId, token}` |
| `PATCH /me` | 목소리·설정 변경 | `{voiceId?, speed?}` → `{ok}` |
| `DELETE /me` | 내 정보 삭제 | → `{ok}` |
| `GET /voices?ageGroup=&gender=` | 승인된 음성 목록 | → `[{id,name,ageGroup,gender,description,tags,previewUrl,waveUrl,card}]` (`card`: 농인용 목소리 카드 — `{easy, impression, scales:{pitch,speed,mood,strength}, suits}`) |
| `GET /voices/recommend?ageGroup=&gender=` | 추천 3개 | → 위와 같은 3개 |
| `POST /tts` | 음성 생성 | `{text, voiceId, emotion:{emotion,intensity,tremor}, speed}` → `{url, durationMs, cached, fallback, displayText}` |
| `POST /tts/warmup` | GPU 미리 깨우기 | → `{state:"ready|warming|off"}` |
| `GET /tts/status` | 상태 점 표시용 | → `{state, queue, avgMs}` |
| `POST /emotion/analyze` | AI 문맥 분석 (입력 중 미리 호출, 04 문서 3단계) | `{text, context:[{role,text,emotion}]}` → 감정 JSON |
| `POST /calls` | 통화 방 만들기 | → `{callId, joinUrl, qrSvg, expiresAt}` |
| `GET /calls/{id}` | 방 상태 (청인용, 토큰 불필요) | → `{state, deafName}` |
| `WS /ws/calls/{id}?role=deaf|hearing` | 통화 메시지 (06 문서 형식) | |
| `POST /stt` | (선택) 서버 음성 인식 | 오디오(webm/mp4) → `{text}` |
| `GET /a/{key}.mp3` | 음성 파일 | Caddy가 직접 제공, 캐시 헤더 |
| `GET /health` | 상태 | → `{ok, tts:[...]}` |

### `/tts` 처리 순서 (가장 중요)
1. 텍스트 정규화 (03 문서 7절) → 100자 넘으면 400 오류 (화면에서 미리 막음).
2. 캐시 키 = `sha1(voiceId|emotion|intensity|tremor|speed|정규화된 텍스트)` → 파일이 있으면 즉시 URL 반환 (`cached:true`).
3. 없으면 TTS 대기열에 넣음. TTS 서버 여러 대에 **가장 한가한 서버**로 분배 (서버당 동시 처리 수 `TTS_MAX_CONCURRENCY`, 기본 4).
4. **2.5초 안에 GPU 차례가 오지 않거나(대기열에서 아직 GPU 서버로 보내지 못함) 요청부터 총 4초가 넘으면** `{fallback:true, displayText}` 반환 → 폰이 기본 음성으로 즉시 읽음. (생성은 계속 진행해 캐시에 저장)
5. 긴 문장도 **행사판은 한 파일로** 생성한다 (100자 제한이라 충분). 나눠 생성하기(`parts`)는 출시판에서 검토.
6. 후처리(속도·떨림·무음·mp3 변환) → 파일 저장 → URL 반환.
- `displayText` = 정규화된 **읽을 글** (예: "OK 3시에 봐요 ㅎㅎ" → "오케이 세 시에 봐요"). 비상 전환 때 폰 기본 음성이 이 글을 읽는다 (ㅋㅋ·이모지를 소리 내어 읽지 않게).
- 감정·속도 반영 전(T08)에는 모두 평온·보통 속도로 만들고 캐시 키도 같게 둔다 (T13에서 확장).
- ffmpeg 가 없으면 mp3 대신 wav 로 보낸다 (멈추지 않게).

## 6. TTS 서버 명세 (내부)
| 경로 | 설명 |
|---|---|
| `POST /synthesize` | `{voiceId, emotion, intensity, tremor, text, seed}` → `audio/wav` 바이트. 헤더 `X-Key` 필수 |
| `POST /warmup` | 모델 로딩 확인, 짧은 문장 1회 생성 |
| `GET /health` | `{ready, gpu, inFlight}` |
| (선택) `POST /stt` | faster-whisper small, 한국어 |
- 모델은 서버 시작 시 한 번만 메모리에 올린다. 기준 음성(03 방식 A)은 시작 시 미리 읽어 둔다.
- Docker 이미지 하나로 어느 GPU 업체에서든 같은 방식으로 실행.

## 7. 데이터 (행사판 SQLite, 출시판 PostgreSQL — 10절)
```
users(id TEXT PK, name TEXT, age_group TEXT, gender TEXT, voice_id TEXT, speed REAL DEFAULT 1.0,
      auth_provider TEXT DEFAULT 'guest',   -- 나중에 본인인증·간편 로그인 추가용
      consent_version TEXT, consent_at TEXT, -- 어떤 동의 문구에 동의했는지
      created_at TEXT, deleted_at TEXT)
voices(id TEXT PK, name TEXT, age_group TEXT, gender TEXT, description TEXT, tags TEXT,
       approved INTEGER, preview_url TEXT, wave_url TEXT,
       card TEXT)      -- voices.json에서 불러옴. card = 농인용 목소리 카드 JSON
tts_cache(key TEXT PK, path TEXT, duration_ms INTEGER, created_at TEXT, pinned INTEGER)
events(id INTEGER PK, type TEXT, ms INTEGER, fallback INTEGER, created_at TEXT)  -- 성능 기록, 글 내용 없음
```
- 통화 방은 메모리에만 (서버 재시작 시 사라져도 됨). 방 관리 코드는 `calls.py` 한 곳에 모은다 (10절).
- DB는 `db.py` 한 곳에서만 접근한다. 행사판은 서버 시작 시 표를 자동으로 만든다(`create_all`). DB 구조 변경 도구(Alembic)는 출시판 직전에 넣는다.
- **대화 글 내용은 서버 DB·로그 어디에도 남기지 않는다.** 캐시 음성 파일은 24시간 뒤 삭제 (즐겨찾기 미리 생성분 `pinned=1` 제외).

## 8. 보안·제한
- 게스트 토큰: 서버 비밀키로 서명한 토큰 (유효 30일).
- 요청 제한: 사용자당 `/tts` 분당 20회, IP당 가입 분당 30회 (부스 와이파이는 여러 명이 IP 하나를 같이 씀). 넘으면 "잠시 후 다시 보내 주세요".
- CORS: `https://itda.gyeot.ai.kr` 만 허용.
- 비밀값은 `.env` 로만 관리하고 Git에 올리지 않는다.

## 9. 환경 변수
```
# services/api/.env
APP_SECRET=...
DATABASE_URL=sqlite+aiosqlite:///./data/itda.db   # 출시판: postgresql+asyncpg://...
AUDIO_DIR=./data/audio                            # storage.py 가 음성 파일을 저장하는 곳
ALLOWED_ORIGIN=https://itda.gyeot.ai.kr
PUBLIC_AUDIO_BASE=https://api.itda.gyeot.ai.kr/a
TTS_ENDPOINTS=https://gpu1.example/,https://gpu2.example/
TTS_KEY=...
TTS_MAX_CONCURRENCY=4
TTS_START_TIMEOUT_MS=2500
TTS_TOTAL_TIMEOUT_MS=4000
EMOTION_LLM_ENABLED=false
EMOTION_LLM_API_KEY=
STT_SERVER_ENABLED=false
# apps/web/.env
VITE_API_BASE=https://api.itda.gyeot.ai.kr
```

## 10. 확장 대비 설계 원칙 (20~30만 명까지)
행사판은 **단순하게 돌리되, 사용자가 늘면 부품만 갈아 끼울 수 있게** 만든다. 확장용 서비스(Redis, PostgreSQL, 서버 여러 대, GPU 자동 늘리기)는 지금 넣지 않는다.

| 부품 | 행사판 (지금) | 출시판 (사용자 증가 시) | 지금 지킬 것 |
|---|---|---|---|
| DB | SQLite | PostgreSQL | SQLAlchemy + `DATABASE_URL` 설정값. DB 접근은 `db.py` 에서만. 표 변경 도구 Alembic은 출시판 직전에 도입 |
| 음성 파일 | API 서버 디스크 (`AUDIO_DIR`) | 클라우드 저장소(S3 방식) + CDN | 파일 저장·삭제·주소 만들기는 `storage.py` 에서만. 주소는 `PUBLIC_AUDIO_BASE` 로 만든다 |
| 통화 방 | 서버 메모리 | Redis (서버 여러 대가 공유) | 방 만들기·찾기·삭제·메시지 전달은 `calls.py` 에서만 |
| 요청 제한 | 서버 메모리 | Redis | 요청 제한은 `rate_limit.py` 에서만 |
| API 서버 | 1대, 프로세스 1개 | 여러 대 + 부하 분산 | 사용자 정보는 서명된 토큰으로 확인, 서버 메모리에 로그인 상태를 두지 않는다 |
| TTS | GPU 1~2대 | GPU 여러 대 (자동 늘리기) | `tts_client.py` 가 이미 여러 대 분배 지원. 처리량은 T03 실측값을 기준으로 계산 |
| 가입 | 이름 + 동의 (`auth_provider='guest'`) | 본인인증·간편 로그인 | `auth_provider`, `consent_version` 칸을 처음부터 둔다 |
| 설정·실행 | `.env` + Docker | 같은 방식 | 모든 설정은 환경 변수로. 코드에 주소·값을 박지 않는다 |

**확장 순서:** 1천 명 → 1만 명 → 20~30만 명처럼 단계적으로 늘리며, 단계마다 실제 숫자(동시 사용자, 초당 요청, 응답 시간)를 재고 병목인 부품만 바꾼다.

**사용자가 많아지면 다시 점검:** 24시간 음성 캐시의 개인정보 측면 (파일 암호화, 추측할 수 없는 파일 주소, 개인정보 처리방침에 보관 사실 명시).
