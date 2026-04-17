# jwtmiddleware.py
"""
모듈 설명:
    -  JWT 토큰을 검증하는 미들웨어
주요 기능:
    -  header에서 토큰 추출 확인
    -  cookie에서 토큰 확인

작성자: 김도영
작성일: 2024-07-19
버전: 1.0
"""

from fastapi import HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from backend.core.config import config
from backend.core.security import verify_token


class JWTAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        root = request.scope.get('root_path', '')

        # 토큰이 필요 없는 URL 경로 정의
        STATIC_PATHS = ['/public', '/favicon.ico']

        # root_path를 제거한 실제 경로로 비교
        path = request.url.path
        if path.startswith(root):
            path = path[len(root) :]

        OPEN_PATHS = ['/login', '/logout', '/health', '/docs', '/redoc', '/openapi.json']

        if path in OPEN_PATHS or any(path.startswith(p) for p in STATIC_PATHS):
            response = await call_next(request)
            return response

        # Authorization 헤더에서 토큰 추출
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header[len('Bearer ') :]
        else:
            cookie_name = config.ACCESS_TOKEN_NAME
            token = request.cookies.get(cookie_name)

        def get_unauthorized_response():
            # API 요청인 경우 401 Unauthorized JSON을 반환하여 프론트엔드가 감지하게 함
            if path.startswith('/api/'):
                return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
            # 일반 페이지 요청인 경우 로그인 페이지로 리다이렉트
            return RedirectResponse(url=f'{root}/login')

        try:
            if token:
                verify_token(token)
                response = await call_next(request)
            else:
                return get_unauthorized_response()
        except HTTPException:
            return get_unauthorized_response()

        return response
