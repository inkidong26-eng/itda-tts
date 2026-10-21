"""승인된 음성 목록과 추천 3개 (07 문서 5절)."""

from fastapi import APIRouter, Depends, Query, Request

from app.deps import current_user
from app.routers.auth import AgeGroup
from app.voice_catalog import recommend, to_api

router = APIRouter(dependencies=[Depends(current_user)])


@router.get("/voices")
async def list_voices(request: Request, ageGroup: AgeGroup | None = None, gender: str | None = Query(
        default=None, pattern="^[mf]$")) -> list[dict]:
    voices = await request.app.state.db.approved_voices()
    return [to_api(v) for v in voices
            if (ageGroup is None or v.age_group == ageGroup) and (gender is None or v.gender == gender)]


@router.get("/voices/recommend")
async def recommend_voices(request: Request, ageGroup: AgeGroup, gender: str = Query(pattern="^[mf]$")) -> list[dict]:
    voices = await request.app.state.db.approved_voices()
    return [to_api(v) for v in recommend(voices, ageGroup, gender)]
