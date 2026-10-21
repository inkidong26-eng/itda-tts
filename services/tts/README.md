# services/tts — 음성 생성 서버 (GPU)

Qwen3-TTS 로 목소리를 만드는 내부 서버예요. 폰은 이 서버에 직접 접속하지 않고, API 서버만 `X-Key` 로 부릅니다.
명세: `docs/prd/07_기술구조_API.md` 6절

| 경로 | 설명 |
|---|---|
| `POST /synthesize` | `{"mode":"design","description":"...","text":"...","seed":1}` → wav (응답 헤더 `X-Gen-Ms` = 생성 시간) |
| `POST /warmup` | 짧은 문장 1회 생성 → `{"ready":true,"ms":...}` |
| `GET /health` | `{"ready","gpu","inFlight"}` |

- 모든 경로에 헤더 `X-Key` 가 필요해요. `TTS_KEY` 가 비어 있으면 서버가 아예 시작되지 않아요.
- 로그에는 처리 시간만 남기고, 글 내용은 남기지 않아요.
- 지금은 목소리 설계(design)만 돼요. 감정·복제 방식은 T03 결정 후에 추가해요.

## 파일
| 파일 | 내용 |
|---|---|
| `server.py` | 웹 서버 (비밀키 확인, 요청 처리) |
| `engine.py` | Qwen 모델을 올리고 음성을 만드는 부분 |
| `scripts/check_server.py` | 켜진 서버를 점검 (T02 완료 확인) |
| `requirements.txt` / `requirements-gpu.txt` / `requirements-dev.txt` | 기본 / GPU 서버용(Qwen 포함) / 테스트용 |

## A. Kaggle 무료 GPU에서 시험하기 (T02·T03 검증)
1. Kaggle → [Create] → **New Notebook**
2. 오른쪽 설정: **Accelerator → GPU T4 x2**, **Internet → On** (휴대폰 인증해야 보여요)
3. 첫 번째 칸에 아래를 붙여 넣고 ▶ 실행 (처음엔 설치·모델 내려받기로 5–10분)

```python
!git clone -q https://github.com/inkidong26-eng/itda-tts.git
!pip install -q -r itda-tts/services/tts/requirements-gpu.txt

import os, secrets, subprocess
key = secrets.token_hex(16)  # 이번 실행에만 쓰는 비밀키
env = dict(os.environ, TTS_KEY=key, TTS_DTYPE="float16")
log = open("/kaggle/working/tts_server.log", "w")
server = subprocess.Popen(
    ["python", "-m", "uvicorn", "server:app", "--port", "8001"],
    cwd="itda-tts/services/tts", env=env, stdout=log, stderr=subprocess.STDOUT,
)
!python itda-tts/services/tts/scripts/check_server.py --key {key} --out /kaggle/working/t02_out
```

4. 두 번째 칸 — 만든 소리 듣기:
```python
from IPython.display import Audio, display
for i in (1, 2, 3):
    display(Audio(f"/kaggle/working/t02_out/t02_seed{i}.wav"))
```

5. 실패하면 세 번째 칸에서 서버 로그 보기 → 마지막 줄을 복사해서 알려 주세요:
```python
!tail -40 /kaggle/working/tts_server.log
```

6. 다 쓰면 오른쪽 위 **전원 버튼(Stop session)** 으로 끄기 (무료 시간 아끼기)

> Kaggle은 서버를 노트북 안에서만 켜요. 바깥에서는 접속할 수 없어서 안전해요.
> 무료 GPU(T4)는 RTX 4090보다 느려요. 속도 수치는 참고용이에요.

## B. 임대 GPU 서버에서 실행하기 (T08 이후 실제 연결·행사용)
GPU 서버에 접속(SSH)한 뒤 순서대로:

```bash
git clone https://github.com/inkidong26-eng/itda-tts.git
cd itda-tts/services/tts
cp .env.example .env
openssl rand -hex 16          # 나온 값을 복사
nano .env                     # TTS_KEY= 뒤에 붙여 넣고 저장 (Ctrl+O, Enter, Ctrl+X)
```

Docker가 되는 서버:
```bash
docker build -t itda-tts-gpu .
docker run -d --gpus all --env-file .env -p 8001:8001 \
  -v hf-cache:/root/.cache/huggingface --name itda-tts itda-tts-gpu
```

Docker가 안 되는 서버(업체가 이미 컨테이너를 준 경우):
```bash
pip install -r requirements-gpu.txt
set -a; . ./.env; set +a
nohup uvicorn server:app --host 0.0.0.0 --port 8001 > tts_server.log 2>&1 &
```

점검:
```bash
python3 scripts/check_server.py --key 위에서_만든_비밀키
```

**⚠️ 다 쓰면 업체 화면에서 GPU 서버를 꼭 끄세요. 켜 두면 계속 요금이 나가요.**

## 테스트 (GPU 없이, 내 컴퓨터)
```powershell
cd services/tts
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python -m pytest
```

## C. T03 검증 (Kaggle, 약 30–40분)
T02와 같은 노트북에서 새 칸을 만들어 실행해요. (GPU T4 x2, Internet On)

```python
!rm -rf itda-tts && git clone -q https://github.com/inkidong26-eng/itda-tts.git
!pip install -q -r itda-tts/services/tts/requirements-gpu.txt
!python itda-tts/services/tts/scripts/spike.py --out /kaggle/working/t03_out
```

- 시간을 줄이려면 마지막 줄 끝에 `--voices v20f1` 을 붙여요 (음성 1개만, 약 15분).
- 끝나면 보고서를 보는 칸:
```python
from IPython.display import HTML
HTML(open("/kaggle/working/t03_out/spike_report.html", encoding="utf-8").read())
```
- 내 컴퓨터로 받기: 오른쪽 Output → `t03_out` → `spike_report.html` 옆 ⋮ → Download
- 각 소리 옆 체크칸(좋음·숨소리·다른 사람·어색)에 표시하고 [체크 결과 복사]로 결과를 보내 주세요.

| 파일 | 내용 |
|---|---|
| `scripts/spike.py` | 검증 순서 (기준 음성 → A/B 비교 → 10문장 → 속도 → 숨소리 → 나눠 만들기 → 다급한 문장) |
| `scripts/spike_data.py` | 음성 3개 설명, 감정 7종 문장, 시험 문장 |
| `scripts/spike_engine.py` | Qwen 모델 3개(설계 1.7B, 복제 1.7B·0.6B) |
| `scripts/spike_audio.py` | 앞 숨소리 자르기, 무음 연결, 같은 사람 점수 |
| `scripts/spike_report.py` | 보고서 HTML |

GPU 없이 흐름만 확인: `.venv\Scripts\python scripts\spike.py --fake --out t03_fake`
