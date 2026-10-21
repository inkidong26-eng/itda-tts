# ITDA TTS (잇다)

농인이 글을 치면 선택한 목소리와 감정으로 말해 주고, 청인의 말은 자막으로 돌려주는 웹앱.

- 요구사항: [docs/prd](docs/prd/00_시작하기.md)
- 에이전트 규칙: `.agents/rules/itda-rules.md`

## 폴더
| 폴더 | 내용 |
|---|---|
| `apps/web` | 웹앱 (React + TypeScript + Vite + Tailwind) |
| `services/api` | API 서버 (FastAPI) |
| `services/tts` | 음성 생성 서버 (GPU, Qwen3-TTS) — 실행 방법은 services/tts/README.md |
| `infra` | Docker 실행 설정 |

## 처음 한 번 준비
필요한 것: Node.js 20 이상, Python 3.12 (3.13도 동작 확인)

```powershell
cd apps/web
npm install
cd ../../services/api
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
copy .env.example .env
```
`.env` 의 `APP_SECRET` 는 아무 긴 글자로 바꿔 두세요 (비어 있으면 서버가 켜지지 않아요).

## 실행 (창 2개)
웹앱 — 창 1:
```powershell
cd apps/web
npm run dev
```
→ 브라우저에서 http://localhost:5173 → "ITDA 준비 중"

API — 창 2:
```powershell
cd services/api
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000 --env-file .env
```
→ http://localhost:8000/health → `{"ok":true}`
→ http://localhost:8000/docs → API 시험 화면 (가입 → 토큰 → 추천 목소리)

## 테스트
```powershell
cd services/api
.venv\Scripts\python -m pytest
```

## Docker로 API 실행 (Docker 설치 필요)
```powershell
cd infra
docker compose up --build
```
