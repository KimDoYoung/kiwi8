from dataclasses import dataclass

from pydantic import BaseModel, Field


@dataclass
class LayoutPreset:
    """레이아웃 프리셋 데이터 클래스 (DB row 매핑용)"""
    id: int | None = None
    user_id: str = ''
    name: str = ''
    layout_json: str = ''
    created_at: str | None = None
    updated_at: str | None = None


class LayoutPresetCreate(BaseModel):
    """레이아웃 프리셋 저장/덮어쓰기 요청 모델"""
    name: str = Field(..., description='프리셋 이름 (예: 계좌 함께보기)', min_length=1, max_length=50)
    layout_json: str = Field(..., description='FlexLayout Model.toJson() 직렬화 문자열')


class LayoutPresetResponse(BaseModel):
    """레이아웃 프리셋 응답 모델"""
    id: int
    user_id: str
    name: str
    layout_json: str
    created_at: str
    updated_at: str
