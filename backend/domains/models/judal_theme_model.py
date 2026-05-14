from dataclasses import dataclass
from pydantic import BaseModel, Field
from typing import Optional, List

@dataclass
class JudalTheme:
    """주달 테마 데이터 클래스
    
    SQL 테이블: judal_themes
    """
    id: Optional[int] = None
    theme_name: str = ""
    stock_name: str = ""
    yesterday_ratio: Optional[float] = None
    three_day_sum: Optional[float] = None
    alienation_index_52w: Optional[int] = None
    alienation_index_3y: Optional[int] = None
    stock_index_3y: Optional[int] = None
    expected_return: Optional[float] = None
    pbr: Optional[float] = None
    per: Optional[float] = None
    eps: Optional[int] = None
    market_cap: Optional[int] = None
    volume_index_today: Optional[float] = None
    volume_index_7d: Optional[float] = None
    buffett_choice: Optional[int] = None
    related_themes: Optional[str] = None
    updated_at: Optional[str] = None
    market_type: Optional[str] = None
    stock_code: Optional[str] = None
    current_price: Optional[int] = None
    price_change: Optional[int] = None
    high_52w: Optional[int] = None
    low_52w: Optional[int] = None
    change_rate_low_52w: Optional[float] = None
    change_rate_high_52w: Optional[float] = None
    high_3y: Optional[int] = None
    low_3y: Optional[int] = None
    change_rate_low_3y: Optional[float] = None
    change_rate_high_3y: Optional[float] = None
    created_at: Optional[str] = None

class JudalThemeFilter(BaseModel):
    """테마 검색 필터 모델"""
    theme_name: Optional[str] = None
    stock_name: Optional[str] = None
    stock_code: Optional[str] = None
    theme_name_like: Optional[str] = None

class JudalThemeResponse(BaseModel):
    """테마 응답 모델"""
    success: bool = True
    data: List[dict] = []
    message: Optional[str] = None
