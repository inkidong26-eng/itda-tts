from fastapi import FastAPI

app = FastAPI(title="ITDA API")


@app.get("/health")
async def health() -> dict:
    # 서버가 살아 있는지 확인용 (TTS 상태는 T08에서 추가)
    return {"ok": True}
