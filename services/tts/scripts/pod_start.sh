#!/usr/bin/env bash
# RunPod 에서 GPU 가 켜지면 저절로 음성 서버를 띄운다 (폰에서 켜기, 10/30).
# 템플릿 시작 명령:
#   bash -c "curl -fsSL https://raw.githubusercontent.com/inkidong26-eng/itda-tts/main/services/tts/scripts/pod_start.sh | bash & /start.sh"
# 필요한 것 (템플릿 환경 변수): TTS_KEY={{ RUNPOD_SECRET_ITDA_TTS_KEY }}
# 저장 공간(Network Volume)을 /workspace 에 붙이면 프로그램·모델·목소리를 다시 받지 않는다.
# 기록: /workspace/pod_start.log (Jupyter 에서 볼 수 있음)
exec >> /workspace/pod_start.log 2>&1
echo "=== $(date) pod_start ==="
set -u
W=/workspace
export HF_HOME=$W/hf                       # 모델 파일 보관 (다음부터 안 받음)
export TTS_VOICES_DIR=${TTS_VOICES_DIR:-$W/voices}

if [ -z "${TTS_KEY:-}" ]; then
  echo "TTS_KEY 가 없어요. RunPod Secret 과 템플릿 환경 변수를 확인하세요."; exit 1
fi

# 코드: 처음엔 받고, 다음부터는 최신으로 맞춤
if [ -d $W/itda-tts/.git ]; then git -C $W/itda-tts pull -q --ff-only || true
else git clone -q https://github.com/inkidong26-eng/itda-tts.git $W/itda-tts; fi

# 프로그램: 저장 공간 안의 가상환경에 한 번만 설치
if [ ! -x $W/venv/bin/uvicorn ]; then
  python -m venv --system-site-packages $W/venv
  $W/venv/bin/pip install -q -r $W/itda-tts/services/tts/requirements-gpu.txt
fi

# 목소리: 없으면 기다린다 (처음 한 번은 옮겨 오거나 build_voices.py 로 만든다)
until ls $TTS_VOICES_DIR/*/meta.json >/dev/null 2>&1; do
  echo "목소리 폴더($TTS_VOICES_DIR)를 기다리는 중…"; sleep 30
done

# 음성 서버: 8000 (nginx 가 8001 로 열어 준다). 꺼지면 다시 켠다
cd $W/itda-tts/services/tts
while true; do
  echo "$(date) 음성 서버 시작"
  $W/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000 >> $W/tts.log 2>&1
  echo "$(date) 음성 서버가 멈춰서 10초 뒤 다시 켬"; sleep 10
done
