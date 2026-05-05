# kiwoom_api.py
"""
모듈 설명: 
    - kiwoom 증권 OpenAPI를 활용한 주식 API 구현체
    - kiwwom_token_manager를 생성자의 인자로 받도록 함
    - 주의) 직접 사용하지 않고 kiwoom = get_kiwoom_api()로 호출하여 사용

작성자: 김도영
작성일: 2025-07-23
버전: 1.0
"""
import json
from datetime import datetime

import aiohttp

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.stkcompanys.kiwoom.managers.kiwoom_token_manager import KiwoomTokenManager
from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import (
    KiwoomApiHelper,
    KiwoomRequest,
    KiwoomResponse,
)
from backend.domains.stock_api import StockApi

logger = get_logger(__name__)

class KiwoomRestApi(StockApi):
    """
    키움증권 OpenAPI를 활용한 주식 API 구현체
    StockApi 인터페이스를 상속받아 키움증권의 실시간 주식 거래 및 정보 조회 기능을 제공합니다.
    """
    
    def __init__(self, token_manager: KiwoomTokenManager):
        """키움 API 클래스 초기화"""
        from backend.domains.stock_api import BrokerType
        super().__init__(config.KIWOOM_ACCT_NO, broker_type=BrokerType.KIWOOM)
        self.token_manager = token_manager
    
    def get_base_url(self) -> str:
        """키움증권 API 베이스 URL"""
        return config.KIWOOM_BASE_URL

    @property
    def base_url(self) -> str:
        """키움증권 API 베이스 URL (property)"""
        return self.get_base_url()

    def get_headers(self, data: KiwoomRequest, token:str) -> dict:
        """
        키움 API 요청에 필요한 HTTP 헤더를 생성합니다.

        Args:
            data: 키움 API 요청 데이터

        Returns:
            dict: HTTP 요청 헤더
        """
        # use_enum_values=True 설정으로 인해 cont_yn이 이미 문자열이므로 직접 사용
        headers = {
            'Content-Type': 'application/json;charset=UTF-8',
            'authorization': f'Bearer {token}',
            'cont-yn': data.cont_yn,
            'next-key': data.next_key or '',
            'api-id': data.api_id,
        }
        return headers

    async def send_request(self, data: KiwoomRequest) -> KiwoomResponse:
        """
        키움 API에 요청을 전송하고 응답을 처리합니다.
        토큰 만료(8005) 시 자동으로 재발급 후 1회 재시도합니다.
        
        Args:
            data: 키움 API 요청 데이터
            
        Returns:
            KiwoomResponse: 표준화된 키움 API 응답 객체
        """
        request_time = datetime.now()
        
        try:
            # API 정보 생성
            request_info = KiwoomApiHelper.get_request_info(data.api_id)
            
            # 요청 유효성 검증
            if not KiwoomApiHelper.validate_api_request(data):
                validation_errors = KiwoomApiHelper.get_validation_errors(data)
                return KiwoomApiHelper.create_error_response(
                    error_code="INVALID_REQUEST",
                    error_message=f"요청 데이터 오류: {', '.join(validation_errors)}",
                    status_code=400,
                    request_time=request_time
                )
            
            # [Step 1] 첫 번째 시도
            token = await self.token_manager.get_token()
            response = await self._do_request(data, token, request_info, request_time)

            # [Step 2] 토큰 만료 에러(8005) 감지 시 재시도 로직
            # response.error_code가 '3'이고 return_msg에 8005가 포함된 경우 (키움 특이 케이스)
            is_token_error = (
                not response.success and 
                (response.error_code == '3' or "8005" in str(response.error_message))
            )

            if is_token_error:
                logger.warning(f"[KIWOOM] API 호출 중 토큰 만료 감지(8005). 토큰 강제 재발급 후 재시도합니다. (API: {data.api_id})")
                
                # 토큰 강제 재발급 (DB 및 메모리 갱신)
                await self.token_manager.issue_access_token()
                
                # 새로운 토큰으로 재시도
                new_token = await self.token_manager.get_token()
                logger.info(f"[KIWOOM] 새 토큰으로 재시도 중... (API: {data.api_id})")
                response = await self._do_request(data, new_token, request_info, request_time)
                
                if response.success:
                    logger.info(f"[KIWOOM] 재시도 성공 (API: {data.api_id})")
                else:
                    logger.error(f"[KIWOOM] 재시도 실패 (API: {data.api_id}): {response.error_message}")

            return response
                    
        except aiohttp.ClientError as e:
            logger.error(f"HTTP 요청 오류: {e}")
            return KiwoomApiHelper.create_error_response(
                error_code="HTTP_ERROR",
                error_message=f"HTTP 요청 실패: {e!s}",
                status_code=500,
                request_time=request_time
            )
        except Exception as e:
            logger.error(f"예상치 못한 오류: {e}")
            return KiwoomApiHelper.create_error_response(
                error_code="UNEXPECTED_ERROR",
                error_message=f"요청 처리 중 오류 발생: {e!s}",
                status_code=500,
                request_time=request_time
            )

    async def _do_request(
        self, 
        data: KiwoomRequest, 
        token: str, 
        request_info: dict, 
        request_time: datetime
    ) -> KiwoomResponse:
        """실제 HTTP 요청을 수행하는 내부 헬퍼 메소드"""
        method = request_info.get('method')
        headers = self.get_headers(data, token)
        url = request_info.get('url')
        title = request_info.get('title')

        async with aiohttp.ClientSession() as session:
            if method == 'POST':
                async with session.post(url, headers=headers, json=data.payload) as response:
                    return await self._process_response(response, request_info, request_time)
            elif method == 'GET':
                async with session.get(url, headers=headers, params=data.payload) as response:
                    return await self._process_response(response, request_info, request_time)
            else:
                return KiwoomApiHelper.create_error_response(
                    error_code="UNSUPPORTED_METHOD",
                    error_message=f"지원하지 않는 HTTP 메서드: {method}",
                    status_code=400,
                    api_info=request_info,
                    request_time=request_time
                )
    
    async def _process_response(
        self, 
        response: aiohttp.ClientResponse, 
        api_info: dict, 
        request_time: datetime
    ) -> KiwoomResponse:
        """
        HTTP 응답을 처리하여 KiwoomResponse 객체로 변환합니다.
        
        Args:
            response: aiohttp 응답 객체
            api_info: API 메타 정보
            request_time: 요청 시작 시간
            
        Returns:
            KiwoomResponse: 처리된 응답 객체
        """
        try:
            # HTTP 상태 코드 확인
            if response.status != 200:
                error_text = await response.text()
                logger.error(f"API 응답 오류 - 상태코드: {response.status}")
                return KiwoomApiHelper.create_error_response(
                    error_code=f"HTTP_{response.status}",
                    error_message=f"API 응답 오류: {error_text}",
                    status_code=response.status,
                    api_info=api_info,
                    request_time=request_time
                )
            # 응답 헤더와 데이터 추출
            logger.info(f"API 요청 성공 - 상태코드: {response.status}")
            response_headers = self._extract_kiwoom_headers(response.headers)
            logger.debug(f"응답 헤더: {response_headers}")
            response_data = await response.json()
            logger.debug(f"응답 데이터: {response_data}")

            # return_code가 문자열 '0' 또는 숫자 0이 아닌 경우 오류로 처리
            return_code = response_data.get('return_code')
            if return_code is not None and str(return_code) != '0':
                logger.error(f"API 오류 응답: {response_data}")
                return KiwoomApiHelper.create_error_response(
                    error_code=str(return_code),
                    error_message=response_data.get('return_msg', '알 수 없는 오류'),
                    status_code=500,
                    api_info=api_info,
                    request_time=request_time
                )

            # 성공 응답 생성            
            return KiwoomApiHelper.create_success_response(
                data=response_data,
                headers=response_headers,
                api_info=api_info,
                request_time=request_time
            )
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON 파싱 오류: {e}")
            return KiwoomApiHelper.create_error_response(
                error_code="JSON_PARSE_ERROR",
                error_message=f"응답 내용이 JSON 형식이 아닙니다: {e!s}",
                status_code=502,
                api_info=api_info,
                request_time=request_time
            )
    
    def _extract_kiwoom_headers(self, response_headers) -> dict:
        """
        키움 API 응답 헤더에서 중요한 정보를 추출합니다.
        
        Args:
            response_headers: HTTP 응답 헤더
            
        Returns:
            dict: 추출된 키움 관련 헤더 정보
        """
        important_headers = [
            'next-key', 'cont-yn', 'api-id','resp-cnt'  
        ]
        
        extracted = {}
        for key in important_headers:
            if key in response_headers:
                extracted[key] = response_headers[key]
        
        return extracted
