"""
증권사별 계좌현황 조회 라우트
GET /api/v1/stkcompany/kiwoom/account/list
GET /api/v1/stkcompany/kis/account/list
GET /api/v1/stkcompany/ls/account/list
"""

from fastapi import APIRouter

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.services.prev_price_cache import get_prev_price_cache
from backend.domains.stkcompanys.kis.kis_service import get_kis_api
from backend.domains.stkcompanys.kis.models.kis_schema import (
    KisApiHelper,
    KisRequest,
    KisResponse,
)
from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import (
    KiwoomApiHelper,
    KiwoomRequest,
    KiwoomResponse,
)
from backend.domains.stkcompanys.ls.ls_service import get_ls_api
from backend.domains.stkcompanys.ls.models.ls_schema import (
    LsApiHelper,
    LsRequest,
    LsResponse,
)

router = APIRouter()
logger = get_logger(__name__)


@router.get('/kiwoom/account/list', response_model=KiwoomResponse)
async def kiwoom_account_list():
    """키움 계좌현황 조회 (kt00004)"""
    logger.info('[계좌현황] 키움 계좌현황 조회 요청')
    try:
        kiwoom = await get_kiwoom_api()
        if not kiwoom:
            return KiwoomApiHelper.create_error_response(
                error_code='999', error_message='Kiwoom API 인스턴스 생성 실패'
            )

        req = KiwoomRequest(
            api_id='kt00004',
            title='stocklist',
            payload={
                'qry_tp': '0',       # 0:전체
                'dmst_stex_tp': 'KRX',  # KRX:한국거래소
            },
        )

        response = await kiwoom.send_request(req)
        if response.success:
            korea_data = KiwoomApiHelper.to_korea_data(response.data, 'kt00004')
            response.data = korea_data
            await _insert_prev_costs_kiwoom(response.data.get('종목별계좌평가현황', []))
            logger.info('[계좌현황] 키움 계좌현황 조회 성공')
        return response

    except Exception as e:
        logger.error(f'[계좌현황] 키움 오류: {e}')
        return KiwoomApiHelper.create_error_response(
            error_code='999', error_message=f'Internal server error: {e!s}'
        )


@router.get('/kis/account/list', response_model=KisResponse)
async def kis_account_list():
    """KIS 계좌현황 조회 (TTTC8434R)"""
    logger.info('[계좌현황] KIS 계좌현황 조회 요청')
    try:
        kis = await get_kis_api()
        if not kis:
            return KisApiHelper.create_error_response(
                error_code='999', error_message='KIS API 인스턴스 생성 실패'
            )

        req = KisRequest(
            api_id='TTTC8434R',
            title='stocklist',
            payload={
                'CANO': config.KIS_ACCT_NO[:8],
                'ACNT_PRDT_CD': config.KIS_ACCT_PRDT_CD,
                'AFHR_FLPR_YN': 'N',
                'OFL_YN': '',
                'INQR_DVSN': '02',
                'UNPR_DVSN': '01',
                'FUND_STTL_ICLD_YN': 'N',
                'FNCG_AMT_AUTO_RDPT_YN': 'N',
                'PRCS_DVSN': '00',
                'CTX_AREA_FK100': '',
                'CTX_AREA_NK100': '',
            },
        )

        response = await kis.send_request(req)
        if response.success and response.data:
            korea_data = KisApiHelper.to_korea_data(response.data, 'TTTC8434R')
            response.data = korea_data
            await _insert_prev_costs_kis(response.data.get('output1', []))
            logger.info('[계좌현황] KIS 계좌현황 조회 성공')
        return response

    except Exception as e:
        logger.error(f'[계좌현황] KIS 오류: {e}')
        return KisApiHelper.create_error_response(
            error_code='999', error_message=f'Internal server error: {e!s}'
        )


@router.get('/ls/account/list', response_model=LsResponse)
async def ls_account_list():
    """LS 계좌현황 조회 (t0424)"""
    logger.info('[계좌현황] LS 계좌현황 조회 요청')
    try:
        ls = await get_ls_api()
        if not ls:
            return LsApiHelper.create_error_response(
                error_code='999', error_message='LS API 인스턴스 생성 실패'
            )

        req = LsRequest(
            api_id='t0424',
            title='stocklist',
            payload={
                't0424InBlock': {
                    'prcgb': '1',       # 단가구분: 1:평균단가
                    'chegb': '0',       # 체결구분: 0:전체
                    'dangb': '0',       # 단일가구분: 0:전체
                    'charge': '1',      # 제비용포함여부: 1:포함
                    'cts_expcode': '',  # 연속조회키
                },
            },
        )

        response = await ls.send_request(req)
        if response.success and response.data:
            korea_data = LsApiHelper.to_korea_data(response.data, 't0424')
            response.data = korea_data
            await _insert_prev_costs_ls(response.data.get('t0424OutBlock1', []))
            logger.info('[계좌현황] LS 계좌현황 조회 성공')
        # print('[DEBUG] ls/account/list response:', json.dumps(response.model_dump(mode='json'), ensure_ascii=False, indent=2))
        return response

    except Exception as e:
        logger.error(f'[계좌현황] LS 오류: {e}')
        return LsApiHelper.create_error_response(
            error_code='999', error_message=f'Internal server error: {e!s}'
        )


async def _insert_prev_costs_kiwoom(stock_list: list):
    cache = get_prev_price_cache()
    for stock in stock_list:
        stk_cd = stock.get('종목코드', '')
        if stk_cd and len(stk_cd) == 7 and stk_cd.startswith('A'):
            stk_cd = stk_cd[1:]
        stock['전일종가'] = await cache.get_last_price(stk_cd) or 0
        stock['가격추세'] = await cache.get_last_trend(stk_cd) or '-'


async def _insert_prev_costs_kis(stock_list: list):
    cache = get_prev_price_cache()
    for stock in stock_list:
        stk_cd = stock.get('상품번호', '')
        if stk_cd and len(stk_cd) == 7 and stk_cd.startswith('A'):
            stk_cd = stk_cd[1:]
        stock['전일종가'] = await cache.get_last_price(stk_cd) or 0
        stock['가격추세'] = await cache.get_last_trend(stk_cd) or '-'


async def _insert_prev_costs_ls(stock_list: list):
    cache = get_prev_price_cache()
    for stock in stock_list:
        stk_cd = stock.get('종목번호', '')
        if stk_cd and len(stk_cd) == 7 and stk_cd.startswith('A'):
            stk_cd = stk_cd[1:]
        stock['전일종가'] = await cache.get_last_price(stk_cd) or 0
        stock['가격추세'] = await cache.get_last_trend(stk_cd) or '-'
