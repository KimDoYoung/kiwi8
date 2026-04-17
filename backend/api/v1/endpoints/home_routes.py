# home_routes.py
"""
모듈 설명:
    - /login, /logout 엔드포인트를 정의한다.
    - /login: 로그인 처리 (JWT 발급)
    - /logout: 로그아웃 처리 (쿠키 삭제)

작성자: 김도영
작성일: 2025-07-21
버전: 1.0
"""

import uuid
import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Form, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse

from backend.core.config import config
from backend.core.logger import get_logger
from backend.core.security import create_jwt_access_token, create_jwt_refresh_token, verify_token
from backend.domains.models.settings_model import AccessToken
from backend.domains.services.dependency import get_service

logger = get_logger(__name__)

router = APIRouter()


@router.get('/health', include_in_schema=False)
async def health_check():
    """배포 상태 확인용 엔드포인트"""
    return {'status': 'ok', 'version': config.VERSION, 'mode': config.PROFILE_NAME}


@router.get('/logout', response_class=JSONResponse)
async def logout(request: Request, response: Response):
    """로그아웃 (토큰 폐기 및 쿠키 삭제)"""
    auth_service = get_service('auth')
    
    # 1. DB에서 Refresh Token 폐기 처리
    refresh_token = request.cookies.get(config.REFRESH_TOKEN_NAME)
    if refresh_token:
        try:
            payload = verify_token(refresh_token)
            token_id = payload.get("token_id")
            if token_id:
                await auth_service.revoke_refresh_token(token_id)
        except:
            pass # 유효하지 않은 토큰이면 무시

    # 2. 쿠키 삭제 설정
    response = JSONResponse(content={"status": "success", "message": "Logged out"})
    response.delete_cookie(key=config.ACCESS_TOKEN_NAME, path='/')
    response.delete_cookie(key=config.REFRESH_TOKEN_NAME, path='/kiwi8/api/auth/refresh')
    
    return response


@router.post('/login', response_model=AccessToken)
async def login_for_access_token(
    response: Response,
    userId: str = Form(...),
    password: str = Form(...),
):
    """SQLite 기반 로그인 처리 (Dual Token 발급)"""
    settings_service = get_service('settings')
    auth_service = get_service('auth')
    
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

    # 1. Access Token 생성
    access_expire = timedelta(minutes=int(config.ACCESS_TOKEN_EXPIRE_MINUTES))
    access_token = create_jwt_access_token(
        data={'user_id': userId, 'login_time': datetime.now(timezone.utc).isoformat()},
        expires_delta=access_expire
    )

    # 2. Refresh Token 생성 및 DB 저장
    token_id = str(uuid.uuid4())
    refresh_token = create_jwt_refresh_token(data={'user_id': userId, 'token_id': token_id})
    hashed_token = hashlib.sha256(refresh_token.encode()).hexdigest()
    
    refresh_expire_days = int(config.REFRESH_TOKEN_EXPIRE_DAYS)
    refresh_expire_at = datetime.now(timezone.utc) + timedelta(days=refresh_expire_days)
    
    await auth_service.save_refresh_token(userId, token_id, hashed_token, refresh_expire_at)

    # 3. 쿠키 설정 (Access Token)
    response.set_cookie(
        key=config.ACCESS_TOKEN_NAME,
        value=access_token,
        max_age=int(config.ACCESS_TOKEN_EXPIRE_MINUTES) * 60,
        httponly=True,
        secure=False,
        samesite='lax',
    )
    
    # 4. 쿠키 설정 (Refresh Token) - 경로 제한으로 보안 강화
    response.set_cookie(
        key=config.REFRESH_TOKEN_NAME,
        value=refresh_token,
        max_age=refresh_expire_days * 24 * 60 * 60,
        httponly=True,
        secure=False,
        samesite='lax',
        path='/kiwi8/api/auth/refresh' # Refresh 요청 시에만 전송
    )
    
    return AccessToken(access_token=access_token, token_type='bearer', user_id=userId)


@router.post('/api/auth/refresh')
async def refresh_access_token(request: Request, response: Response):
    """Refresh Token을 이용한 Access Token 재발급"""
    refresh_token = request.cookies.get(config.REFRESH_TOKEN_NAME)
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    try:
        # 1. JWT 유효성 검증
        payload = verify_token(refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        
        user_id = payload.get("user_id")
        token_id = payload.get("token_id")
        
        # 2. DB 검증 (해시 일치 및 폐기 여부 확인)
        auth_service = get_service('auth')
        hashed_token = hashlib.sha256(refresh_token.encode()).hexdigest()
        valid_user_id = await auth_service.verify_refresh_token(token_id, hashed_token)
        
        if not valid_user_id or valid_user_id != user_id:
            raise HTTPException(status_code=401, detail="Refresh token invalid or revoked")

        # 3. 새로운 Access Token 발급
        access_expire = timedelta(minutes=int(config.ACCESS_TOKEN_EXPIRE_MINUTES))
        new_access_token = create_jwt_access_token(
            data={'user_id': user_id, 'login_time': datetime.now(timezone.utc).isoformat()},
            expires_delta=access_expire
        )

        # 4. 쿠키 업데이트
        response.set_cookie(
            key=config.ACCESS_TOKEN_NAME,
            value=new_access_token,
            max_age=int(config.ACCESS_TOKEN_EXPIRE_MINUTES) * 60,
            httponly=True,
            secure=False,
            samesite='lax',
        )
        
        return {"status": "success", "message": "Token refreshed"}

    except Exception as e:
        logger.error(f"Token refresh failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid refresh token")
