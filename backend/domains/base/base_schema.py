"""
공통 스키마 정의
증권사 API의 공통 Request/Response 모델을 정의합니다.
"""
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel


class ContYn(str, Enum):
    """연속조회 여부"""
    Y = 'Y'
    N = 'N'


class BaseRequest(BaseModel):
    """공통 API 요청 베이스 모델"""
    api_id: str
    cont_yn: ContYn = ContYn.N
    next_key: str | None = None
    payload: dict[str, Any]
    title: str | None = None

    class Config:
        use_enum_values = True


class BaseResponse(BaseModel):
    """공통 API 응답 베이스 모델"""
    data: dict[str, Any] | None = None
    headers: dict[str, str] | None = None
    api_info: dict[str, str] | None = None
    status_code: int = 200
    cont_yn: ContYn = ContYn.N
    next_key: str | None = None
    request_time: datetime | None = None
    response_time: datetime | None = None
    error_code: str | None = None
    error_message: str | None = None
    success: bool = True

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }
