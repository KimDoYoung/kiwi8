from dataclasses import dataclass

from pydantic import BaseModel


@dataclass
class JudalTheme:
    """주달 테마 데이터 클래스
    
    SQL 테이블: judal_themes
    """
    id: int | None = None
    theme_name: str = ""
    stock_name: str = ""
    yesterday_ratio: float | None = None
    three_day_sum: float | None = None
    alienation_index_52w: int | None = None
    alienation_index_3y: int | None = None
    stock_index_3y: int | None = None
    expected_return: float | None = None
    pbr: float | None = None
    per: float | None = None
    eps: int | None = None
    market_cap: int | None = None
    volume_index_today: float | None = None
    volume_index_7d: float | None = None
    buffett_choice: int | None = None
    related_themes: str | None = None
    updated_at: str | None = None
    market_type: str | None = None
    stock_code: str | None = None
    current_price: int | None = None
    price_change: int | None = None
    high_52w: int | None = None
    low_52w: int | None = None
    change_rate_low_52w: float | None = None
    change_rate_high_52w: float | None = None
    high_3y: int | None = None
    low_3y: int | None = None
    change_rate_low_3y: float | None = None
    change_rate_high_3y: float | None = None
    created_at: str | None = None

class JudalThemeFilter(BaseModel):
    """테마 검색 필터 모델"""
    theme_name: str | None = None
    stock_name: str | None = None
    stock_code: str | None = None
    theme_name_like: str | None = None
    current_price_min: int | None = None
    current_price_max: int | None = None
    market_cap_min: int | None = None
    market_cap_max: int | None = None
    yesterday_ratio_min: float | None = None
    yesterday_ratio_max: float | None = None
    three_day_sum_min: float | None = None
    three_day_sum_max: float | None = None
    per_min: float | None = None
    per_max: float | None = None
    pbr_min: float | None = None
    pbr_max: float | None = None
    deduplicate: bool | None = False

class JudalThemeResponse(BaseModel):
    """테마 응답 모델"""
    success: bool = True
    data: list[dict] = []
    message: str | None = None
