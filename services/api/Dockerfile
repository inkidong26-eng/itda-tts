FROM python:3.12-slim

# ffmpeg: 음성 파일을 작은 mp3 로 바꾸는 도구 (없으면 wav 로 보냄)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app

EXPOSE 8000
# 통화 방·요청 제한을 메모리에 두므로 반드시 프로세스 1개로 실행
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
