FROM python:3.12-slim

# sox: qwen-tts 가 쓰는 오디오 도구
RUN apt-get update && apt-get install -y --no-install-recommends sox \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt requirements-gpu.txt ./
RUN pip install --no-cache-dir -r requirements-gpu.txt
COPY engine.py server.py ./

EXPOSE 8001
# GPU 1장 = 프로세스 1개 (모델을 한 번만 올림)
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
