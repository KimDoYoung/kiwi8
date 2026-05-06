import asyncio
from fastapi import APIRouter
from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import KiwoomRequest, KiwoomApiHelper
from backend.domains.stkcompanys.kis.kis_service import get_kis_api
from backend.domains.stkcompanys.kis.models.kis_schema import KisRequest, KisApiHelper
from backend.domains.stkcompanys.ls.ls_service import get_ls_api
from backend.domains.stkcompanys.ls.models.ls_schema import LsRequest, LsApiHelper

router = APIRouter()
logger = get_logger(__name__)

@router.get("/{start_date}/{end_date}/profit")
async def get_profit_trend(start_date: str, end_date: str):
    """
    기간별 실현손익 통합 조회 API
    Kiwoom: ka10074
    KIS: TTTC8715R
    LS: FOCCQ337600
    """
    logger.info(f"[Trend] 기간별 실현손익 조회 요청: {start_date} ~ {end_date}")

    # 3개 증권사 API 호출을 위한 태스크 생성
    tasks = [
        _fetch_kiwoom_profit(start_date, end_date),
        _fetch_kis_profit(start_date, end_date),
        _fetch_ls_profit(start_date, end_date)
    ]

    # 병렬 실행
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # 결과 취합
    kiwoom_data = results[0] if not isinstance(results[0], Exception) else {"success": False, "error": str(results[0])}
    kis_data = results[1] if not isinstance(results[1], Exception) else {"success": False, "error": str(results[1])}
    ls_data = results[2] if not isinstance(results[2], Exception) else {"success": False, "error": str(results[2])}

    return {
        "success": True,
        "data": {
            "kiwoom": kiwoom_data,
            "kis": kis_data,
            "ls": ls_data
        }
    }

async def _fetch_kiwoom_profit(start_date: str, end_date: str):
    try:
        kiwoom = await get_kiwoom_api()
        if not kiwoom:
            return {"success": False, "error": "Kiwoom API 인스턴스 생성 실패"}
        
        req = KiwoomRequest(
            api_id='ka10074',
            title='일자별실현손익',
            payload={
                'strt_dt': start_date.replace('-', ''),
                'end_dt': end_date.replace('-', '')
            }
        )
        response = await kiwoom.send_request(req)
        if response.success:
            return KiwoomApiHelper.to_korea_data(response.data, 'ka10074')
        return {"success": False, "error": response.error_message}
    except Exception as e:
        logger.error(f"[Trend] Kiwoom 조회 오류: {e}")
        return {"success": False, "error": str(e)}

async def _fetch_kis_profit(start_date: str, end_date: str):
    try:
        kis = await get_kis_api()
        if not kis:
            return {"success": False, "error": "KIS API 인스턴스 생성 실패"}
        
        req = KisRequest(
            api_id='TTTC8715R',
            title='기간별매매손익현황조회',
            payload={
                'CANO': config.KIS_ACCT_NO[:8],
                'ACNT_PRDT_CD': config.KIS_ACCT_PRDT_CD,
                'FK100': '',
                'NK100': '',
                'INQR_STRT_DT': start_date.replace('-', ''),
                'INQR_END_DT': end_date.replace('-', ''),
                'CTAC_DVSN_CODE': '01',
                'DPRT_CD': '',
                'COST_ICLD_YN': 'Y'
            }
        )
        response = await kis.send_request(req)
        if response.success:
            return KisApiHelper.to_korea_data(response.data, 'TTTC8715R')
        return {"success": False, "error": response.error_message}
    except Exception as e:
        logger.error(f"[Trend] KIS 조회 오류: {e}")
        return {"success": False, "error": str(e)}

async def _fetch_ls_profit(start_date: str, end_date: str):
    try:
        ls = await get_ls_api()
        if not ls:
            return {"success": False, "error": "LS API 인스턴스 생성 실패"}
        
        req = LsRequest(
            api_id='FOCCQ33600',
            title='주식계좌 기간별수익률 상세',
            payload={
                'FOCCQ33600InBlock1': {
                    'QrySrtDt': start_date.replace('-', ''),
                    'QryEndDt': end_date.replace('-', ''),
                    'TermTp': '1'  # 1:일별
                }
            }
        )
        response = await ls.send_request(req)
        if response.success:
            return LsApiHelper.to_korea_data(response.data, 'FOCCQ33600')
        return {"success": False, "error": response.error_message}
    except Exception as e:
        logger.error(f"[Trend] LS 조회 오류: {e}")
        return {"success": False, "error": str(e)}
