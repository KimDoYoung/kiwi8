from fastapi import APIRouter

from backend.core.exceptions import KiwoomApiException
from backend.core.logger import get_logger
from backend.domains.market.open_time_checker import OpenTimeChecker
from backend.domains.services import get_service
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

@router.get("/market/status")
async def get_market_status():
    """
    현재 시장 상태(영업일 여부, 현재 운영 중인 시장)를 반환합니다.
    """
    from backend.domains.market.open_time_checker import OpenTimeChecker
    checker = OpenTimeChecker.get()
    
    is_open = await checker.is_open_day()
    trade_market = await checker.market_choice_for_trade()
    price_market = await checker.market_choice_for_price()
    
    return {
        "is_open": is_open,
        "trade_market": trade_market, # "KRX", "NXT" or None
        "price_market": price_market, # "KRX" or "NXT"
        "is_krx_time": checker.isKrxTime(),
        "is_nxt_time": checker.isNxtTime(),
    }

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
        
        # 키워드로 종목 검색 (기존 search_by_name 메서드 사용)
        search_results = await stk_info_service.search_by_name(keyword)
        
        # limit 적용
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
    