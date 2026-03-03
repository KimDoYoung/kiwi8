# home_routes.py
"""
모듈 설명:
    - /main, /page, /template, /login, /logout, /login 엔드포인트를 정의한다.
    - /main: 메인 페이지
    - /page: path에 해당하는 페이지를 가져와서 보낸다.
    - /template: path에 해당하는 html에서 body추출해서 jinja2처리한 JSON을 리턴
    - /login: 로그인 페이지
    - /logout: 로그아웃 페이지
    - /login: 로그인 프로세스

작성자: 김도영
작성일: 2025-07-21
버전: 1.0
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Form, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse

from backend.core.config import config
from backend.core.logger import get_logger
from backend.core.security import create_jwt_access_token
from backend.domains.models.settings_model import AccessToken
from backend.domains.services.dependency import get_service

logger = get_logger(__name__)

router = APIRouter()


@router.get('/logout', response_class=JSONResponse)
async def logout(request: Request, response: Response):
    """로그아웃"""
    root = request.scope.get('root_path', '')
    response = RedirectResponse(url=f'{root}/login', status_code=302)
    response.delete_cookie(
        key=config.ACCESS_TOKEN_NAME, path='/', secure=False, httponly=True, samesite='lax'
    )
    return response


@router.post('/login', response_model=AccessToken)
async def login_for_access_token(
    response: Response,  # Response 추가
    userId: str = Form(...),
    password: str = Form(...),
):
    """SQLite 기반 로그인 처리"""
    settings_service = get_service('settings')
    saved_user_id = await settings_service.get('user_id')
    saved_password = await settings_service.get('user_pw')

    if not saved_user_id or not saved_password:
        raise HTTPException(status_code=400, detail='사용자 정보가 DB에 등록되어 있지 않습니다.')

    if userId != saved_user_id or password != saved_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='아이디 또는 비밀번호가 틀립니다.',
            headers={'WWW-Authenticate': 'Bearer'},
        )

    EXPIRE_MINUTES = int(config.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token_expires = timedelta(minutes=EXPIRE_MINUTES)
    jwt_token_data = {
        'user_id': userId,
        'password': password,
        'login_time': datetime.now().isoformat(),
        'exp': datetime.now() + access_token_expires,
    }
    jwt_token = create_jwt_access_token(data=jwt_token_data, expires_delta=access_token_expires)
    # 쿠키에 토큰 설정 (자동)
    response.set_cookie(
        key=config.ACCESS_TOKEN_NAME,
        value=jwt_token,
        max_age=EXPIRE_MINUTES * 60,  # 초 단위
        httponly=True,  # JavaScript에서 접근 불가 (보안)
        secure=False,  # HTTPS에서만 전송 (개발시 False)
        samesite='lax',  # CSRF 보호
    )
    return AccessToken(access_token=jwt_token, token_type='bearer', user_id=userId)
