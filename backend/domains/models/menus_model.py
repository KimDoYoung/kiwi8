from dataclasses import dataclass
from typing import Optional, List
from pydantic import BaseModel, Field


@dataclass
class Menu:
    """메뉴 데이터 클래스 (DB 행 표현)"""
    id: int
    parent_id: Optional[int]
    level: int
    screen_no: Optional[str]
    title: str
    url: Optional[str]
    component: Optional[str]
    icon: Optional[str]
    sort_order: int
    is_active: int


class MenuResponse(BaseModel):
    """메뉴 API 응답 모델 (트리 구조)"""
    id: int = Field(..., description="메뉴 ID")
    parent_id: Optional[int] = Field(None, description="부모 메뉴 ID")
    level: int = Field(..., description="메뉴 레벨 (1:대, 2:중, 3:소)")
    screen_no: Optional[str] = Field(None, description="화면 번호 (말단 메뉴)")
    title: str = Field(..., description="메뉴 표시 명칭")
    url: Optional[str] = Field(None, description="이동 경로")
    component: Optional[str] = Field(None, description="React 컴포넌트명")
    icon: Optional[str] = Field(None, description="아이콘 이름 (Lucide kebab-case)")
    sort_order: int = Field(0, description="정렬 순서")
    is_active: int = Field(1, description="활성화 여부")
    children: List['MenuResponse'] = Field(default_factory=list, description="하위 메뉴 목록")

    model_config = {"from_attributes": True}


MenuResponse.model_rebuild()
