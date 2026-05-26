from dataclasses import dataclass

from pydantic import BaseModel, Field


@dataclass
class StkWords:
    """경제 용어 데이터 클래스
    
    주식 및 경제 관련 단어에 대한 정의 및 상세 해설 기록
    """
    id: int | None = None                    # 고유 ID (자동 증가)
    word: str = ""                             # 경제 용어 (Unique)
    brief: str = ""                            # 간단 요약 (Not Null)
    detail: str | None = None                 # 상세 해설 (TipTap HTML 등)
    is_active: int = 1                         # 활성화 여부 (0: 소프트 딜리트, 1: 활성)
    created_at: str | None = None           # 생성 시각 (DB에서 자동 설정)
    updated_at: str | None = None           # 수정 시각 (DB에서 자동 설정)

class StkWordsCreate(BaseModel):
    """경제 용어 생성 요청 모델"""
    word: str = Field(..., description="경제 용어", example="인플레이션")
    brief: str = Field(..., description="간단 요약", example="물가 수준이 지속적으로 상승하는 현상")
    detail: str | None = Field(None, description="상세 해설")

class StkWordsUpdate(BaseModel):
    """경제 용어 수정 요청 모델"""
    word: str | None = Field(None, description="경제 용어")
    brief: str | None = Field(None, description="간단 요약")
    detail: str | None = Field(None, description="상세 해설")
    is_active: int | None = Field(None, description="활성화 여부")

class StkWordsResponse(BaseModel):
    """경제 용어 응답 모델"""
    id: int = Field(..., description="고유 ID")
    word: str = Field(..., description="경제 용어")
    brief: str = Field(..., description="간단 요약")
    detail: str | None = Field(None, description="상세 해설")
    is_active: int = Field(..., description="활성화 여부")
    created_at: str = Field(..., description="생성 시각")
    updated_at: str = Field(..., description="수정 시각")

class StkWordsFilter(BaseModel):
    """경제 용어 필터링 모델"""
    word_like: str | None = Field(None, description="단어 검색어")
    brief_like: str | None = Field(None, description="간단 요약 검색어")
    detail_like: str | None = Field(None, description="상세 해설 검색어")
    is_active: int | None = Field(1, description="활성화 여부 (기본: 1)")
