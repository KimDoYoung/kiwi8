# exception_handler.py
"""
모듈 설명: 
    - FastAPI 애플리케이션의 예외를 처리하는 핸들러를 정의한다.
    - HTTP 예외, 유효성 검사 오류, 일반 예외 등을 처리하여 사용자에게 적절한 에러 메시지를 반환한다.
주요 기능:
    - 각종 예외를 처리하여 일관된 형식의 에러 응답을 생성한다.

작성자: 김도영
작성일: 2025-07-25
버전: 1.0
"""
from datetime import datetime
from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.core.logger import get_logger

logger = get_logger(__name__)

def add_exception_handlers(app):
    """FastAPI 앱에 예외 핸들러를 등록하는 함수"""
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(Exception, general_exception_handler)
    app.add_exception_handler(StarletteHTTPException, custom_404_exception_handler)

async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """입력 데이터 유효성 검사 예외 처리"""
    return await create_error_response(request, exc, exc.errors())

async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """HTTP 예외 처리"""
    return await create_error_response(request, exc)

async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """일반 예외 처리"""
    return await create_error_response(request, exc)

async def custom_404_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """404 예외 처리"""
    return await create_error_response(request, exc)

async def create_error_response(request: Request, exc: Exception, errors=None) -> JSONResponse:
    """에러 응답 생성 함수"""
    logger.error(f"xxx [500] xxx --> 서버동작 중 오류 발생: {exc}")
    status_code = getattr(exc, "status_code", 500)
    return JSONResponse(
        status_code=status_code,
        content={
            "request": request.url.path,
            "status_code": status_code,
            "detail": getattr(exc, "detail", "Internal Server Error :" + str(exc)),
            "errors": errors or [],
            "server_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        },
    )

