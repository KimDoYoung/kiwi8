"""
보유 종목 리스트 조회 유틸리티
"""
from typing import List, Dict
from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.stkcompanys.kis.kis_service import get_kis_api
from backend.domains.stkcompanys.kis.models.kis_schema import KisApiHelper, KisRequest
from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import KiwoomApiHelper, KiwoomRequest
from backend.domains.stkcompanys.ls.ls_service import get_ls_api
from backend.domains.stkcompanys.ls.models.ls_schema import LsApiHelper, LsRequest
from backend.domains.infrahub.open_time_checker import OpenTimeChecker

logger = get_logger(__name__)

async def get_all_holdings() -> List[Dict[str, str]]:
    """모든 증권사 계좌의 보유 종목 리스트 통합 조회"""
    all_holdings = []
    seen_cds = set()

    # Kiwoom
    try:
        kiwoom = await get_kiwoom_api()
        if kiwoom:
            checker = OpenTimeChecker.get()
            price_market = await checker.market_choice_for_price()
            resp = await kiwoom.send_request(KiwoomRequest(api_id='kt00004', payload={'qry_tp': '0', 'dmst_stex_tp': price_market}))
            if resp.success and resp.data:
                kdata = KiwoomApiHelper.to_korea_data(resp.data, 'kt00004')
                items = kdata.get('종목별계좌평가현황', [])
                for item in items:
                    cd = item.get('종목코드', '').strip()
                    if cd and cd not in seen_cds:
                        all_holdings.append({'stk_cd': cd, 'stk_nm': item.get('종목명', '')})
                        seen_cds.add(cd)
    except Exception as e:
        logger.error(f"Failed to get Kiwoom holdings: {e}")

    # KIS
    try:
        kis = await get_kis_api()
        if kis:
            acct_no_full = config.KIS_ACCT_NO
            cano = acct_no_full[:8]
            acnt_prdt_cd = acct_no_full[8:10]
            checker = OpenTimeChecker.get()
            price_market = await checker.market_choice_for_price()
            market_flag = "X" if price_market == "NXT" else "N"
            
            payload = {
                'CANO': cano,
                'ACNT_PRDT_CD': acnt_prdt_cd,
                'AFHR_FLPR_YN': market_flag,
                'OFL_YN': '',
                'INQR_DVSN': '02',
                'UNPR_DVSN': '01',
                'FUND_STTL_ICLD_YN': 'N',
                'FNCG_AMT_AUTO_RDPT_YN': 'N',
                'PRCS_DVSN': '00',
                'CTX_AREA_FK100': '',
                'CTX_AREA_NK100': '',
            }
            resp = await kis.send_request(KisRequest(api_id='TTTC8434R', payload=payload))
            if resp.success and resp.data:
                kdata = KisApiHelper.to_korea_data(resp.data, 'TTTC8434R')
                items = kdata.get('output1', [])
                for item in items:
                    cd = item.get('상품번호', '').strip()
                    if cd and cd not in seen_cds:
                        all_holdings.append({'stk_cd': cd, 'stk_nm': item.get('상품명', '')})
                        seen_cds.add(cd)
    except Exception as e:
        logger.error(f"Failed to get KIS holdings: {e}")

    # LS
    try:
        ls = await get_ls_api()
        if ls:
            resp = await ls.send_request(LsRequest(api_id='t0424', payload={'prcgb': '0', 'chegb': '0', 'dangb': '0', 'charge': '0'}))
            if resp.success and resp.data:
                kdata = LsApiHelper.to_korea_data(resp.data, 't0424')
                items = kdata.get('t0424OutBlock1', [])
                for item in items:
                    cd = item.get('종목번호', '').strip()
                    # LS는 종목코드 앞에 A가 붙는 경우가 있음
                    if cd.startswith('A'): cd = cd[1:]
                    qty = int(item.get('잔고수량', 0) or 0)
                    if cd and qty > 0 and cd not in seen_cds:
                        all_holdings.append({'stk_cd': cd, 'stk_nm': item.get('종목명', '')})
                        seen_cds.add(cd)
    except Exception as e:
        logger.error(f"Failed to get LS holdings: {e}")

    return all_holdings
