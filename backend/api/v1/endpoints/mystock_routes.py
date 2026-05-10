from typing import List, Optional
from fastapi import APIRouter, Query, HTTPException

from backend.core.logger import get_logger
from backend.domains.models.my_stock_model import (
    MyStockCreate,
    MyStockFilter,
    MyStockUpdate,
)
from backend.domains.services.dependency import get_service
from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import (
    KiwoomApiHelper,
    KiwoomResponse,
)

router = APIRouter()
logger = get_logger(__name__)

@router.get("/", response_model=KiwoomResponse)
async def get_my_stocks(
    is_hold: Optional[int] = Query(None),
    is_watch: Optional[int] = Query(None),
    sector: Optional[str] = Query(None),
    stk_nm_like: Optional[str] = Query(None),
):
    """나의 관심/보유 종목 리스트 조회"""
    try:
        service = get_service("my_stock")
        filter_data = MyStockFilter(
            is_hold=is_hold,
            is_watch=is_watch,
            sector=sector,
            stk_nm_like=stk_nm_like
        )
        stocks = await service.get_list(filter_data)
        return KiwoomApiHelper.create_success_response(data={"list": stocks})
    except Exception as e:
        logger.error(f"MyStock 조회 실패: {e}")
        return KiwoomApiHelper.create_error_response(error_code="MYSTOCK_GET_ERROR", error_message=str(e))

@router.get("/{stk_cd}", response_model=KiwoomResponse)
async def get_my_stock(stk_cd: str):
    """특정 종목 상세 조회"""
    try:
        service = get_service("my_stock")
        stock = await service.get_by_cd(stk_cd)
        if not stock:
            return KiwoomApiHelper.create_error_response(error_code="NOT_FOUND", error_message="종목을 찾을 수 없습니다.")
        return KiwoomApiHelper.create_success_response(data=stock)
    except Exception as e:
        logger.error(f"MyStock 상세 조회 실패: {e}")
        return KiwoomApiHelper.create_error_response(error_code="MYSTOCK_DETAIL_ERROR", error_message=str(e))

@router.post("/", response_model=KiwoomResponse)
async def create_my_stock(data: MyStockCreate):
    """새로운 관심/보유 종목 추가"""
    try:
        service = get_service("my_stock")
        stock = await service.create(data)
        return KiwoomApiHelper.create_success_response(data=stock)
    except Exception as e:
        logger.error(f"MyStock 생성 실패: {e}")
        return KiwoomApiHelper.create_error_response(error_code="MYSTOCK_CREATE_ERROR", error_message=str(e))

@router.put("/{stk_cd}", response_model=KiwoomResponse)
async def update_my_stock(stk_cd: str, data: MyStockUpdate):
    """종목 정보 수정"""
    try:
        service = get_service("my_stock")
        stock = await service.update(stk_cd, data)
        if not stock:
            return KiwoomApiHelper.create_error_response(error_code="NOT_FOUND", error_message="종목을 찾을 수 없습니다.")
        return KiwoomApiHelper.create_success_response(data=stock)
    except Exception as e:
        logger.error(f"MyStock 수정 실패: {e}")
        return KiwoomApiHelper.create_error_response(error_code="MYSTOCK_UPDATE_ERROR", error_message=str(e))

@router.delete("/{stk_cd}", response_model=KiwoomResponse)
async def delete_my_stock(stk_cd: str):
    """종목 삭제"""
    try:
        service = get_service("my_stock")
        success = await service.delete(stk_cd)
        return KiwoomApiHelper.create_success_response(data={"success": success})
    except Exception as e:
        logger.error(f"MyStock 삭제 실패: {e}")
        return KiwoomApiHelper.create_error_response(error_code="MYSTOCK_DELETE_ERROR", error_message=str(e))

@router.post("/{stk_cd}/fill-spec", response_model=KiwoomResponse)
async def fill_stock_spec(stk_cd: str):
    """키움 API를 통한 상세 정보(spec) 갱신"""
    try:
        service = get_service("my_stock")
        success = await service.fill_spec(stk_cd)
        return KiwoomApiHelper.create_success_response(data={"success": success})
    except Exception as e:
        logger.error(f"MyStock Spec 갱신 실패: {e}")
        return KiwoomApiHelper.create_error_response(error_code="MYSTOCK_SPEC_ERROR", error_message=str(e))

@router.post("/sync-holdings", response_model=KiwoomResponse)
async def sync_holdings_manually():
    """수동으로 보유 종목 동기화 실행"""
    try:
        from backend.utils.holdings_utils import get_all_holdings
        service = get_service("my_stock")
        holdings = await get_all_holdings()
        await service.sync_holdings(holdings)
        return KiwoomApiHelper.create_success_response(data={"count": len(holdings)})
    except Exception as e:
        logger.error(f"보유 종목 동기화 실패: {e}")
        return KiwoomApiHelper.create_error_response(error_code="SYNC_ERROR", error_message=str(e))
