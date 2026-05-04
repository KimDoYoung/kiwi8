from fastapi import APIRouter
from backend.domains.services.dependency import get_service
from backend.domains.infrahub.open_time_checker import OpenTimeChecker
from backend.core.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

@router.get("/status")
async def get_market_status():
    """
    현재 시장 상태(영업일 여부, 현재 운영 중인 시장)를 반환합니다.
    """
    checker = OpenTimeChecker.get()

    is_open = await checker.is_open_day()
    trade_market = await checker.market_choice_for_trade()
    price_market = await checker.market_choice_for_price()

    return {
        "is_open": is_open,
        "trade_market": trade_market, # "KRX", "NXT" or None
        "price_market": price_market, # "KRX" or "NXT"
    }

@router.get("/jisu")
async def get_market_jisu():
    """
    DB에 저장된 시장 지수 정보를 반환합니다.
    """
    service = get_service("market")
    jisu = await service.get_market_jisu()
    if jisu:
        return jisu
    return {
        "kospi": 0,
        "kospi_diff": 0,
        "kospi_rate": 0,
        "kosdaq": 0,
        "kosdaq_diff": 0,
        "kosdaq_rate": 0,
        "kospi200": 0,
        "kospi200_diff": 0,
        "kospi200_rate": 0,
        "updated_at": ""
    }
