# APIRouter 인스턴스 생성
import asyncio
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter

from backend.core.config import config
from backend.core.exceptions import KiwoomApiException
from backend.core.logger import get_logger
from backend.domains.infrahub.open_time_checker import OpenTimeChecker
from backend.domains.infrahub.prev_price_cache import get_prev_price_cache
from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api, get_token_manager
from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import (
    KiwoomApiHelper,
    KiwoomRequest,
    KiwoomResponse,
)
from backend.utils.naver_utils import get_jisu_from_naver

router = APIRouter()
logger = get_logger(__name__)


async def _poll_kiwoom_execution(order_no: str, stk_cd: str):
    """주문 성공 후 2초 뒤 kt00009로 체결 확인 → DB 저장 + WS broadcast"""
    await asyncio.sleep(2)
    try:
        from backend.domains.infrahub.ws_manager import ws_manager
        from backend.domains.services.stk_history_service import StkHistoryService

        kiwoom = await get_kiwoom_api()
        if not kiwoom:
            return

        req = KiwoomRequest(
            api_id='kt00009',
            payload={
                'ord_dt': datetime.now().strftime('%Y%m%d'),
                'stk_bond_tp': '1',
                'mrkt_tp': '0',
                'sell_tp': '0',
                'qry_tp': '1',  # 체결만
                'stk_cd': stk_cd,
                'fr_ord_no': '',
                'dmst_stex_tp': '%',
            }
        )
        res = await kiwoom.send_request(req)
        if not res.success:
            logger.warning(f'[Kiwoom 체결폴링] 조회 실패: {res.error_message}')
            return

        logger.info(f'[Kiwoom 체결폴링] res.data keys={list(res.data.keys()) if isinstance(res.data, dict) else type(res.data)} data={res.data}')
        rows = res.data.get('acnt_ord_cntr_prst_array', []) if isinstance(res.data, dict) else []
        if not rows:
            logger.info(f'[Kiwoom 체결폴링] 체결내역 없음 order_no={order_no}')
            return
        logger.info(f'[Kiwoom 체결폴링] rows[0]={rows[0]} order_no={order_no}')

        svc = StkHistoryService()
        for row in rows:
            row_ord_no = str(row.get('ord_no', '')).lstrip('0')
            if row_ord_no != order_no.lstrip('0'):
                continue
            ccnl_qty = row.get('cntr_qty', '')
            ccnl_prc = row.get('cntr_uv', '')
            if not ccnl_qty or str(ccnl_qty).strip() in ('', '0'):
                continue
            io_tp_nm = str(row.get('io_tp_nm', ''))
            if '매수' in io_tp_nm:
                sell_buy = '01'
            elif '매도' in io_tp_nm:
                sell_buy = '02'
            else:
                sell_buy = ''
            ccnl_time = row.get('cntr_tm', '').replace(':', '')
            parsed = {
                'order_no': order_no,
                'stock_code': stk_cd,
                'stock_name': row.get('stk_nm', ''),
                'sell_buy': sell_buy,
                'order_qty': row.get('ord_qty', ''),
                'order_price': row.get('ord_uv', ''),
                'ccnl_qty': ccnl_qty,
                'ccnl_price': ccnl_prc,
                'ccnl_time': ccnl_time,
                'acct_no': config.KIWOOM_ACCT_NO,
            }
            await svc.save_execution(parsed, broker='KIWOOM')
            await ws_manager.broadcast({'broker': 'kiwoom', 'type': 'order_ccnl', 'data': parsed})
            logger.info(f'[Kiwoom 체결폴링] 저장 완료: {parsed}')
    except Exception as e:
        logger.error(f'[Kiwoom 체결폴링] 오류: {e}')


@router.post('/{api_id}', response_model=KiwoomResponse)
async def kiwoom_rest_api(api_id: str, req: KiwoomRequest):
    """kiwoom rest api 호출"""
    title = req.title
    logger.info(f'Received Kiwoom API request: api_id={api_id}, title={title}, req=[{req}]')

    try:
        kiwoom = await get_kiwoom_api()
        if not kiwoom:
            return KiwoomApiHelper.create_error_response(
                error_code='999', error_message='Kiwoom API 클래스를 생성하는데 실패했습니다'
            )

        # URL path의 api_id로 request body의 api_id 업데이트
        req.api_id = api_id

        # payload 유효성 검증 명시적 호출
        validation_errors = req.validate_payload()
        if validation_errors:
            return KiwoomApiHelper.create_error_response(
                error_code='400',
                error_message=f'요청 데이터 검증 실패: {", ".join(validation_errors)}',
            )

        response = await kiwoom.send_request(req)
        if response.success:
            korea_data = KiwoomApiHelper.to_korea_data(response.data, response.api_info['api_id'])
            response.data = korea_data
            if title == 'stocklist':
                logger.info(f'보유종목 데이터 변환 완료: {korea_data}')
                await insert_prev_costs_kiwoom(response.data['종목별계좌평가현황'])
            logger.info(f'Kiwoom API response: [{response}]')
            # 주문(매수/매도) 성공 시 체결 폴링
            if api_id in ('kt10000', 'kt10001') and isinstance(response.data, dict):
                order_no = str(response.data.get('주문번호', ''))
                stk_cd = req.payload.get('stk_cd', '') if req.payload else ''
                if order_no and stk_cd:
                    asyncio.create_task(_poll_kiwoom_execution(order_no, stk_cd))
        return response
    except KiwoomApiException as e:
        return KiwoomApiHelper.create_error_response(error_code='999', error_message=str(e))
    except Exception as e:
        logger.error(f'Error occurred while placing order: {e}')
        return KiwoomApiHelper.create_error_response(
            error_code='999', error_message='Internal server error'
        )


async def insert_prev_costs_kiwoom(stock_list: list):
    """보유종목 데이터에 이전 매입 단가 삽입"""
    cache = get_prev_price_cache()
    for stock in stock_list:
        stk_cd = stock.get('종목코드')
        # A005930 형태에서 005930 형태로 변환
        if stk_cd and len(stk_cd) == 7 and stk_cd.startswith('A'):
            stk_cd = stk_cd[1:]
        price = await cache.get_last_price(stk_cd)
        trend = await cache.get_last_trend(stk_cd)
        stock['전일종가'] = price if price else 0
        stock['가격추세'] = trend if trend else '-'


@router.get('/issue-new-token', response_model=KiwoomResponse)
async def issue_new_token():
    """새로운 토큰 발급"""
    logger.info('새로운 토큰 발급 요청 받음')

    try:
        token_manager = await get_token_manager()
        if not token_manager:
            return KiwoomApiHelper.create_error_response(
                error_code='999', error_message='Kiwoom API 클래스를 생성하는데 실패했습니다'
            )

        await token_manager.discard_token()
        await token_manager.issue_access_token()
        return KiwoomApiHelper.create_success_response(
            data={'message': '새로운 토큰이 발급되었습니다.'},
            api_info={'api_id': 'issue_new_token'},
        )

    except KiwoomApiException as e:
        return KiwoomApiHelper.create_error_response(error_code='999', error_message=str(e))
    except Exception as e:
        logger.error(f'Error occurred while issuing new token: {e}')
        return KiwoomApiHelper.create_error_response(
            error_code='999', error_message='Internal server error'
        )


@router.get('/jisu')
async def get_jisu():
    """지수 정보 조회"""
    logger.info('지수 정보 조회 요청 받음')
    checker = OpenTimeChecker.get()
    now = datetime.now(tz=ZoneInfo(config.TIME_ZONE))
    market = await checker.getMarket(now)

    try:
        jisu_data = get_jisu_from_naver()  # await 제거 (동기 함수)
        if not jisu_data:
            return {
                'success': False,
                'error_code': '999',
                'error_message': '지수 정보를 가져오는데 실패했습니다',
            }
        jisu_data['market'] = market if market else '장마감'
        logger.info(f'지수 정보 조회 성공: {jisu_data}')
        return jisu_data

    except Exception as e:
        logger.error(f'지수 정보 조회 중 오류 발생: {e}')
        return {
            'success': False,
            'error_code': '999',
            'error_message': '지수 정보 조회 중 오류가 발생했습니다',
        }
