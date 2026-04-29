"""
증권사별 계좌현황 조회 라우트
GET /api/v1/stkcompany/kiwoom/account/list
GET /api/v1/stkcompany/kis/account/list
GET /api/v1/stkcompany/ls/account/list
"""

from fastapi import APIRouter

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.infrahub.current_pricer import CurrentPricer
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
from backend.domains.infrahub.open_time_checker import OpenTimeChecker
from backend.utils.acct_summary import (
    get_kis_account_summary,
    get_kiwoom_account_summary,
    get_ls_account_summary,
    get_summary_json,
)
from backend.utils.common_utils import parse_price

router = APIRouter()
logger = get_logger(__name__)


@router.get('/summary')
async def get_summary():
    """계좌 요약 정보 조회"""
    logger.info('계좌 요약 정보 조회 요청 받음')

    accounts = []

    # 각 증권사별 계좌 조회
    kiwoom_account = await get_kiwoom_account_summary()
    if kiwoom_account:
        accounts.append(kiwoom_account)

    kis_account = await get_kis_account_summary()
    if kis_account:
        accounts.append(kis_account)

    ls_account = await get_ls_account_summary()
    if ls_account:
        accounts.append(ls_account)

    # 결과 반환
    if accounts:
        return get_summary_json(accounts)
    else:
        logger.error('조회된 계좌가 없습니다.')
        return {'summary': {}, 'accounts': {}}


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
        checker = OpenTimeChecker.get()
        price_market = await checker.market_choice_for_price() # "KRX" or "NXT"
            
        req = KiwoomRequest(
            api_id='kt00004',
            title='stocklist',
            payload={
                'qry_tp': '0',       # 0:전체
                'dmst_stex_tp': price_market,  # KRX:한국거래소, NXT:코넥스
            },
        )

        response = await kiwoom.send_request(req)
        # debug
        logger.debug(f'[계좌현황] 키움 API 응답: {response.model_dump(mode="json")}')
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
        checker = OpenTimeChecker.get()
        price_market = await checker.market_choice_for_price() # "KRX" or "NXT"
        market = "X" if price_market == "NXT" else "N"
                  
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
                'AFHR_FLPR_YN': market,  # N:한국거래소, X:코넥스
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
# prcgb 단가구분 (1:평균단가,2:BEP단가),
# chegb 체결구분 (0:결제기준잔고,2:체결기준잔고 - 잔고가 0이아 닌 종목만 조회) ,
# dangb 단일가구분 (0:정규장, 1:시간외단일가),
# charge 제비용 포함여부 (0:미포함,1:포함),
        checker = OpenTimeChecker.get()
        price_market = await checker.market_choice_for_price() # "KRX" or "NXT"
        market = "1" if price_market == "NXT" else "0"
        req = LsRequest(
            api_id='t0424',
            title='stocklist',
            payload={
                't0424InBlock': {
                    'prcgb': '1',       # 단가구분: 1:평균단가
                    'chegb': '0',       # 체결구분: 0:전체
                    'dangb': market,    # 단일가구분: 0:정규장, 1:시간외단일가
                    'charge': '1',      # 제비용포함여부: 1:포함
                    'cts_expcode': '',  # 연속조회키
                },
            },
        )

        response = await ls.send_request(req)
        if response.success and response.data:
            korea_data = LsApiHelper.to_korea_data(response.data, 't0424')
            response.data = korea_data
            await _insert_prev_costs_ls(response.data.get('t0424OutBlock1', []), price_market)
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
        
        cur_price = parse_price(stock.get('현재가', 0))
        avg_price = parse_price(stock.get('평균단가', 0))
        
        stock['전일종가'] = await cache.get_last_price(stk_cd) or 0
        stock['가격추세'] = await cache.get_last_trend(stk_cd) or '-'
        stock['전일대비'] = cur_price - int(stock['전일종가'])
        stock['1주당'] = cur_price - avg_price

async def _insert_prev_costs_kis(stock_list: list):
    cache = get_prev_price_cache()
    for stock in stock_list:
        stk_cd = stock.get('상품번호', '')
        if stk_cd and len(stk_cd) == 7 and stk_cd.startswith('A'):
            stk_cd = stk_cd[1:]
            
        cur_price = parse_price(stock.get('현재가', 0))
        avg_price = parse_price(stock.get('매입평균가격', 0))
            
        stock['전일종가'] = await cache.get_last_price(stk_cd) or 0
        stock['가격추세'] = await cache.get_last_trend(stk_cd) or '-'
        stock['전일대비'] = cur_price - int(stock['전일종가'])
        stock['1주당'] = cur_price - avg_price

async def _insert_prev_costs_ls(stock_list: list, price_market: str):
    cache = get_prev_price_cache()
    for stock in stock_list:
        stk_cd = stock.get('종목번호', '')
        # LS API는 NXT에서의 현재가를 가져오지 못한다. 그래서 NXT인 경우 현재가를 코넥스 종목코드로 다시 조회해서 넣어준다. 😡
        if price_market == "NXT":  # 코넥스는 종목코드에 시장구분이 없으므로 'A' 제거
           pricer = CurrentPricer.get() 
           cost = await pricer.get_price1(stk_cd) or 0
           stock['현재가'] = cost 
        cur_price = parse_price(stock.get('현재가', 0))
        avg_price = parse_price(stock.get('평균단가', 0))
            
        stock['전일종가'] = await cache.get_last_price(stk_cd) or 0
        stock['가격추세'] = await cache.get_last_trend(stk_cd) or '-'
        stock['전일대비'] = cur_price - int(stock['전일종가'])
        stock['1주당'] = cur_price - avg_price
