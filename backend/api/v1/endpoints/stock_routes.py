import sqlite3

from fastapi import APIRouter

from backend.core.config import config
from backend.core.exceptions import KisApiException, KiwoomApiException
from backend.core.logger import get_logger
from backend.domains.infrahub.open_time_checker import OpenTimeChecker
from backend.domains.models.judal_theme_model import JudalThemeFilter, JudalThemeResponse
from backend.domains.services import get_service
from backend.domains.stkcompanys.kis.kis_service import get_kis_api
from backend.domains.stkcompanys.kis.models.kis_schema import KisApiHelper, KisRequest, KisResponse
from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import (
    KiwoomApiHelper,
    KiwoomRequest,
    KiwoomResponse,
)
from backend.utils.kiwi_utils import merge_dicts
from backend.utils.naver_utils import get_summary_from_naver

router = APIRouter()
logger = get_logger(__name__)

@router.get("/theme", response_model=JudalThemeResponse)
async def get_themes(
    theme_name: str | None = None,
    theme_name_like: str | None = None,
    stock_name: str | None = None,
    stock_code: str | None = None,
    current_price_min: int | None = None,
    current_price_max: int | None = None,
    market_cap_min: int | None = None,
    market_cap_max: int | None = None,
    yesterday_ratio_min: float | None = None,
    yesterday_ratio_max: float | None = None,
    three_day_sum_min: float | None = None,
    three_day_sum_max: float | None = None,
    per_min: float | None = None,
    per_max: float | None = None,
    pbr_min: float | None = None,
    pbr_max: float | None = None,
    deduplicate: bool = False,
    limit: int = 1000
):
    """
    주달 테마 데이터를 조회합니다.
    """
    try:
        service = get_service("judal_theme")
        filter_data = JudalThemeFilter(
            theme_name=theme_name,
            theme_name_like=theme_name_like,
            stock_name=stock_name,
            stock_code=stock_code,
            current_price_min=current_price_min,
            current_price_max=current_price_max,
            market_cap_min=market_cap_min,
            market_cap_max=market_cap_max,
            yesterday_ratio_min=yesterday_ratio_min,
            yesterday_ratio_max=yesterday_ratio_max,
            three_day_sum_min=three_day_sum_min,
            three_day_sum_max=three_day_sum_max,
            per_min=per_min,
            per_max=per_max,
            pbr_min=pbr_min,
            pbr_max=pbr_max,
            deduplicate=deduplicate
        )
        results = await service.list_themes(filter_data, limit=limit)
        return JudalThemeResponse(success=True, data=results)
    except Exception as e:
        logger.error(f"Error fetching themes: {e}")
        return JudalThemeResponse(success=False, data=[], message=str(e))

@router.get("/theme/names", response_model=JudalThemeResponse)
async def get_theme_names():
    """
    중복 제거된 테마명 목록을 조회합니다.
    """
    try:
        service = get_service("judal_theme")
        results = await service.get_distinct_themes()
        # frontend combo box 에서 사용하기 좋게 dict list로 변환
        data = [{"name": name} for name in results]
        return JudalThemeResponse(success=True, data=data)
    except Exception as e:
        logger.error(f"Error fetching theme names: {e}")
        return JudalThemeResponse(success=False, data=[], message=str(e))

@router.get("/chart/candle", response_model=KisResponse)
async def get_candle_chart(
    stk_code: str,
    start_date: str,
    end_date: str,
):
    """
    KIS API를 사용하여 캔들 차트 데이터를 가져옵니다.
    TR_ID: FHKST03010100 (국내주식기간별시세)

    market_div는 stk_code의 NXT 거래 가능 여부에 따라 자동 결정:
    - NXT 가능: "UN" (통합)
    - NXT 불가: "J" (KRX)
    """
    logger.info(f"[STOCK] 캔들 차트 요청: stk_code={stk_code}, range={start_date}~{end_date}")

    try:
        from backend.domains.infrahub.stock_resolver import StockResolver
        is_nxt = await StockResolver.get().is_enable_nxt(stk_code)
        market_div = "UN" if is_nxt else "J"
        logger.debug(f"[STOCK] market_div 결정: {stk_code} is_nxt={is_nxt} -> {market_div}")

        kis = await get_kis_api()
        if not kis:
            return KisApiHelper.create_error_response(error_code="999", error_message="KIS API 인스턴스 생성 실패")

        payload = {
            "FID_COND_MRKT_DIV_CODE": market_div,
            "FID_INPUT_ISCD": stk_code,
            "FID_INPUT_DATE_1": start_date,
            "FID_INPUT_DATE_2": end_date,
            "FID_PERIOD_DIV_CODE": "D", # 일 단위
            "FID_ORG_ADJ_PRC": "0"
        }

        req = KisRequest(
            api_id="FHKST03010100",
            title="stock_candle_chart",
            payload=payload
        )

        response = await kis.send_request(req)
        
        if response.success and response.data:
            # 한글 필드명 변환 적용
            response.data = KisApiHelper.to_korea_data(response.data, "FHKST03010100")
            
        return response

    except KisApiException as e:
        logger.error(f"[STOCK] KIS API 예외: {e}")
        return KisApiHelper.create_error_response(error_code=e.error_code or "999", error_message=str(e))
    except Exception as e:
        logger.error(f"[STOCK] 캔들 차트 조회 오류: {e}")
        return KisApiHelper.create_error_response(error_code="999", error_message=str(e))

@router.get("/info/{stk_code}", response_model=KiwoomResponse)
async def get_stock_info(stk_code: str):
    '''
    stk_code 에 대해서  ka10001(주식기본정보)와 ka10100(종목정보조회) 2개의 api를 호출해서
    데이터를 merge한 후에  주식 정보를 가져온다.
     '''
    logger.info(f"Received request for stock info: stk_code={stk_code}")

    kiwoom = await get_kiwoom_api()
    if not kiwoom:
        return KiwoomApiHelper.create_error_response(error_code="999", error_message="Kiwoom API 클래스를 생성하는데 실패했습니다")

    try:
        # 시간에 따라서  거래소를 선택해야함 :  거래소별 종목코드 (KRX:039490,NXT:039490_NX,SOR:039490_AL)
        checker = OpenTimeChecker.get()
        price_market = await checker.market_choice_for_price() # "KRX" or "NXT"
        stk_code = stk_code + "_NX" if price_market == "NXT" else stk_code

        req = KiwoomRequest(api_id="ka10001", payload={"stk_cd": stk_code})
        response1 = await kiwoom.send_request(req)
        if response1.success:
            korea_data = KiwoomApiHelper.to_korea_data(response1.data, response1.api_info['api_id'])
            response1.data = korea_data           

        # ka10100(종목정보조회)는 거래소 구분 없이 원본 코드로 조회해야 정보가 나옴
        base_stk_code = stk_code.replace("_NX", "")
        req = KiwoomRequest(api_id="ka10100", payload={"stk_cd": base_stk_code})
        response2 = await kiwoom.send_request(req)
        if response2.success:
            korea_data = KiwoomApiHelper.to_korea_data(response2.data, response2.api_info['api_id'])
            response2.data = korea_data
        else:
            logger.error(f"종목상세 실패 {base_stk_code} using ka10100: {response2.error_message}")
            return KiwoomApiHelper.create_error_response(
                error_code="999",
                error_message=f"Failed to fetch stock info for {base_stk_code} using ka10100: {response2.error_message}"
            )    

        response = merge_dicts(response1.data, response2.data)

        # naver의 company_summary를 구한다. (Naver는 _NX를 모르므로 원본 코드를 사용)
        base_stk_code = stk_code.replace("_NX", "")
        company_summary = get_summary_from_naver(base_stk_code)
        if company_summary:
            response['company_summary'] = company_summary

        return KiwoomApiHelper.create_success_response(
            data=response
        )

    except KiwoomApiException as e:
        return KiwoomApiHelper.create_error_response(error_code="999", error_message=str(e))
    except Exception as e:
        logger.error(f"Error occurred while fetching stock info: {e}")
        return KiwoomApiHelper.create_error_response(error_code="999", error_message= str(e))

@router.post("/find", response_model=KiwoomResponse)
async def find_stock(request: KiwoomRequest):
    """
    종목명 또는 종목코드로 종목을 검색합니다.
    stk_info 테이블에서 키워드를 포함하는 종목들을 찾아서 리스트로 반환합니다.
    
    Request payload 예시:
    {
        "keyword": "삼성전자",
        "limit": 10
    }
    """
    try:
        # payload에서 키워드와 limit 추출
        keyword = request.payload.get("keyword", "")
        limit = request.payload.get("limit", 10)
        
        if not keyword.strip():
            return KiwoomApiHelper.create_error_response(
                error_code="400",
                error_message="검색어를 입력해주세요.",
                status_code=400,
                api_info={"api_id": "stock_find", "description": "종목 검색"}
            )
        
        logger.info(f"종목 검색 요청: keyword={keyword}, limit={limit}")
        
        # stk_info 서비스 가져오기
        stk_info_service = get_service("stk_info")
        
        # 키워드로 종목 검색 (이름 또는 코드)
        from backend.domains.models.stk_info_model import StkInfoFilter
        filter_data = StkInfoFilter(stk_nm_like=keyword)
        results_by_name = await stk_info_service.list_all(filter_data, limit=limit)
        
        filter_data_cd = StkInfoFilter(stk_cd_like=keyword)
        results_by_code = await stk_info_service.list_all(filter_data_cd, limit=limit)
        
        # 결과 합치기 (중복 제거)
        seen_cds = set()
        search_results = []
        for stock in results_by_name + results_by_code:
            if stock.stk_cd not in seen_cds:
                search_results.append(stock)
                seen_cds.add(stock.stk_cd)
        
        # limit 재적용
        if limit > 0:
            search_results = search_results[:limit]
        
        # 응답 데이터 변환
        result_data = []
        for stock in search_results:
            result_data.append({
                "stk_cd": stock.stk_cd,
                "stk_nm": stock.stk_nm or "",
                "market_name": stock.market_name or "",
                "up_name": stock.up_name or "",
                "list_count": stock.list_count or "",
                "reg_day": stock.reg_day or "",
                "last_price": stock.last_price or "",
                "nxt_enable": stock.nxt_enable or ""
            })
        
        response_data = {
            "results": result_data,
            "total_count": len(result_data),
            "keyword": keyword,
            "message": f"'{keyword}' 검색 결과 {len(result_data)}건을 찾았습니다."
        }
        
        return KiwoomApiHelper.create_success_response(
            data=response_data,
            api_info={"api_id": "stock_find", "description": "종목 검색"}
        )
        
    except Exception as e:
        logger.error(f"종목 검색 중 오류 발생: {e!s}")
        return KiwoomApiHelper.create_error_response(
            error_code="500",
            error_message=f"종목 검색 중 오류가 발생했습니다: {e!s}",
            status_code=500,
            api_info={"api_id": "stock_find", "description": "종목 검색"}
        )


@router.get("/stk-info-list", response_model=KiwoomResponse)
async def get_stk_info_list():
    """stk_info 전체 목록 조회 (전종목 탐색용)"""
    try:
        service = get_service("stk_info")
        items = await service.list_all()
        data = [
            {
                "stk_cd": s.stk_cd,
                "stk_nm": s.stk_nm,
                "market_code": s.market_code,
                "market_name": s.market_name,
                "up_name": s.up_name,
                "up_size_name": s.up_size_name,
                "audit_info": s.audit_info,
                "reg_day": s.reg_day,
                "last_price": s.last_price,
                "state": s.state,
                "nxt_enable": s.nxt_enable,
                "order_warning": s.order_warning,
                "main_products": s.main_products,
                "representative_name": s.representative_name,
                "homepage": s.homepage,
                "location": s.location,
            }
            for s in items
        ]
        return KiwoomApiHelper.create_success_response(data={"list": data, "count": len(data)})
    except Exception as e:
        logger.error(f"stk_info 목록 조회 오류: {e!s}")
        return KiwoomApiHelper.create_error_response(error_code="500", error_message=str(e))


@router.get("/stk-info/{stk_cd}", response_model=KiwoomResponse)
async def get_stk_info_by_code(stk_cd: str):
    """stk_info 단건 조회"""
    try:
        service = get_service("stk_info")
        item = await service.get_by_code(stk_cd)
        if not item:
            return KiwoomApiHelper.create_error_response(error_code="404", error_message="종목 정보 없음")
        data = {
            "stk_cd": item.stk_cd,
            "stk_nm": item.stk_nm,
            "list_count": item.list_count,
            "audit_info": item.audit_info,
            "reg_day": item.reg_day,
            "last_price": item.last_price,
            "state": item.state,
            "market_code": item.market_code,
            "market_name": item.market_name,
            "up_name": item.up_name,
            "up_size_name": item.up_size_name,
            "company_class_name": item.company_class_name,
            "order_warning": item.order_warning,
            "nxt_enable": item.nxt_enable,
            "main_products": item.main_products,
            "representative_name": item.representative_name,
            "homepage": item.homepage,
            "location": item.location,
        }
        return KiwoomApiHelper.create_success_response(data=data)
    except Exception as e:
        logger.error(f"stk_info 단건 조회 오류 ({stk_cd}): {e!s}")
        return KiwoomApiHelper.create_error_response(error_code="500", error_message=str(e))


@router.get("/options/{stk_cd}", response_model=KiwoomResponse)
async def get_stock_options(stk_cd: str, limit: int = 10):
    """stk_options 조회 — 특정 종목의 네이버 토론방 의견 (날짜 최신순)"""
    try:
        with sqlite3.connect(config.DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute(
                "SELECT id, stk_cd, date, options, created_at FROM stk_options "
                "WHERE stk_cd = ? ORDER BY date DESC LIMIT ?",
                (stk_cd, limit)
            )
            rows = [dict(row) for row in cur.fetchall()]
        return KiwoomApiHelper.create_success_response(data={"list": rows, "count": len(rows)})
    except Exception as e:
        logger.error(f"stk_options 조회 오류 ({stk_cd}): {e!s}")
        return KiwoomApiHelper.create_error_response(error_code="500", error_message=str(e))


@router.get("/trades-history", response_model=KiwoomResponse)
async def get_trades_history(limit: int = 200, ymd: str = '', broker: str = ''):
    """stk_trades_history 조회 — 체결내역 (최신순)"""
    try:
        conditions = []
        params: list = []
        if ymd:
            conditions.append("ymd = ?")
            params.append(ymd)
        if broker:
            conditions.append("broker = ?")
            params.append(broker)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        params.append(limit)
        with sqlite3.connect(config.DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute(
                f"SELECT id, broker, acct_no, order_no, sell_buy, stk_cd, stk_nm, "
                f"ymd, order_qty, order_price, ccnl_qty, ccnl_price, ccnl_time, note, created_at "
                f"FROM stk_trades_history {where} ORDER BY id DESC LIMIT ?",
                params
            )
            rows = [dict(row) for row in cur.fetchall()]
        return KiwoomApiHelper.create_success_response(data={"list": rows, "count": len(rows)})
    except Exception as e:
        logger.error(f"trades-history 조회 오류: {e!s}")
        return KiwoomApiHelper.create_error_response(error_code="500", error_message=str(e))
