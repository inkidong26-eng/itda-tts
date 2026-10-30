# GPU 폰으로 켜고 끄기 (진짜 목소리)

GPU 를 켜 두면 고른 목소리로 말하고, 끄면 폰 기본 목소리로 말한다. 앱은 어느 쪽이든 그대로 돌아간다.
켜 두는 동안 시간당 약 $0.6 (A40). 저장 공간(itda-voices)은 꺼도 남고 월 $2.8.

## 켜기 (약 5분)
1. 폰에서 https://console.runpod.io 로그인
2. **Storage → itda-voices → Configure Pod with volume**
3. Workload 에 **itda-voice-server** 가 골라져 있는지 확인 (없으면 My templates 에서 고르기)
4. GPU **A40** (없으면 같은 지역의 다른 24GB 이상) → **Deploy Pod**
5. Pods 에서 새 Pod 의 **ID** 복사 (예: nw8fcwb7ov7ovk)
6. https://itda.gyeot.ai.kr/admin → 관리자 비밀번호 → ID 붙여 넣고 **연결하기**
7. 3–5분 뒤 🟢 **진짜 목소리 연결됨** 이 보이면 끝

## 끄기 (1분)
1. https://itda.gyeot.ai.kr/admin → **GPU 연결 끊기**
2. RunPod **Pods** → 그 Pod → **⋮ → Stop Pod → ⋮ → Terminate Pod**

## 안 될 때
- 10분이 지나도 🟡 이면: RunPod 에서 Pod → Connect → jupyter (비밀번호 = 바탕 화면 ITDA_GPU_열쇠.txt)
  → 새 칸에 `!tail -20 /workspace/pod_start.log; tail -20 /workspace/tts.log` 실행 후 사진을 보낸다.
- 그 지역에 GPU 빈자리가 없으면: 그날은 폰 기본 목소리로 진행하거나, 다른 지역에서 services/tts/README.md E·F 방식으로 켠다.

## 비밀 정보 (대화창·사진에 올리지 않기)
- 관리자 비밀번호: 바탕 화면 ITDA_관리자_비밀번호.txt (서버 .env ADMIN_PASSWORD)
- GPU 열쇠: 바탕 화면 ITDA_GPU_열쇠.txt (RunPod Secret ITDA_TTS_KEY = 서버 .env TTS_KEY)
