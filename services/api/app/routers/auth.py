"""가입·내 정보 (07 문서 5절). 이름은 로그에 남기지 않는다."""

import logging
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from app.db import User
from app.deps import client_ip, current_user
from app.tokens import sign

router = APIRouter()
log = logging.getLogger("itda.api")

NAME_PATTERN = re.compile(r"^[가-힣a-zA-Z ]{2,20}$")
AgeGroup = Literal["10s", "20s", "30s", "40s", "50s", "60s", "70s"]


class GuestIn(BaseModel):
    name: str
    ageGroup: AgeGroup
    gender: Literal["m", "f"]
    consent: bool

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not NAME_PATTERN.match(v):
            raise ValueError("이름은 한글·영문 2–20자로 적어 주세요")
        return v

    @field_validator("consent")
    @classmethod
    def check_consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("동의가 필요해요")
        return v


class MeIn(BaseModel):
    voiceId: str | None = None
    speed: float | None = Field(default=None, ge=0.5, le=1.5)


@router.post("/auth/guest")
async def guest_signup(body: GuestIn, request: Request) -> dict:
    app = request.app
    if not app.state.limiter.allow(f"signup:{client_ip(request)}", app.state.settings.signup_limit_per_min):
        raise HTTPException(status_code=429, detail="잠시 후 다시 보내 주세요")
    user = await app.state.db.create_user(body.name, body.ageGroup, body.gender, app.state.settings.consent_version)
    log.info("signup ok")
    token = sign(user.id, app.state.settings.app_secret, app.state.settings.token_days)
    return {"userId": user.id, "token": token}


@router.patch("/me")
async def update_me(body: MeIn, request: Request, user: User = Depends(current_user)) -> dict:
    fields = {}
    if body.voiceId is not None:
        if await request.app.state.db.get_approved_voice(body.voiceId) is None:
            raise HTTPException(status_code=400, detail="없는 목소리예요")
        fields["voice_id"] = body.voiceId
    if body.speed is not None:
        fields["speed"] = body.speed
    if fields:
        await request.app.state.db.update_user(user.id, **fields)
    return {"ok": True}


@router.delete("/me")
async def delete_me(request: Request, user: User = Depends(current_user)) -> dict:
    await request.app.state.db.erase_user(user.id)
    return {"ok": True}
