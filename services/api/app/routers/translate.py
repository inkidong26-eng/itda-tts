"""POST /translate — 외국어 통역 (11 문서 5절). DeepL 무료판으로 보낸다.

- 키(DEEPL_KEY)가 없으면 503 → 화면은 원문 그대로 쓰고 안내한다 (통역이 없어도 대화는 계속)
- 글 내용은 저장·기록하지 않는다 (로그에는 걸린 시간·글자 수만)
- 사용자 동의는 화면에서 받는다 (🌐 처음 켤 때, 무료판이라 DeepL 이 보관할 수 있음을 알림)
"""

import logging
import time
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.db import User
from app.deps import current_user

router = APIRouter()
log = logging.getLogger("itda.api")

Lang = Literal["ko", "en", "ja", "zh"]
# DeepL 언어 코드: 받는 쪽(target)은 영어·중국어를 구체적으로 적어야 한다
SOURCE = {"ko": "KO", "en": "EN", "ja": "JA", "zh": "ZH"}
TARGET = {"ko": "KO", "en": "EN-US", "ja": "JA", "zh": "ZH-HANS"}
TIMEOUT_S = 4.0


class TranslateIn(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    source: Lang
    target: Lang


@router.post("/translate")
async def translate(body: TranslateIn, request: Request, user: User = Depends(current_user)) -> dict:
    settings = request.app.state.settings
    if body.source == body.target:
        return {"text": body.text}
    if not settings.deepl_key:
        raise HTTPException(status_code=503, detail="통역이 준비되지 않았어요")
    if not request.app.state.limiter.allow(f"tr:{user.id}", settings.translate_limit_per_min):
        raise HTTPException(status_code=429, detail="잠시 후 다시 해 주세요")
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            res = await client.post(
                settings.deepl_url,
                headers={"Authorization": f"DeepL-Auth-Key {settings.deepl_key}"},
                data={"text": body.text, "source_lang": SOURCE[body.source], "target_lang": TARGET[body.target]},
            )
        res.raise_for_status()
        text = res.json()["translations"][0]["text"]
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as err:
        # 상태만 남긴다 (글 내용·키 금지). 456 = 이번 달 무료 글자 다 씀
        status = getattr(getattr(err, "response", None), "status_code", None)
        log.warning("translate failed status=%s", status)
        raise HTTPException(status_code=503, detail="통역이 잠시 안 돼요") from None
    log.info("translate ms=%d chars=%d", (time.perf_counter() - started) * 1000, len(body.text))
    return {"text": text}
