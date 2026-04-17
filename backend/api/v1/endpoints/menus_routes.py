from fastapi import APIRouter

from backend.core.logger import get_logger
from backend.domains.services.dependency import get_service
from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import KiwoomApiHelper, KiwoomResponse

router = APIRouter()
logger = get_logger(__name__)

API_INFO_LIST = {"api_id": "menus_list", "description": "메뉴 트리 조회"}


@router.get("/", response_model=KiwoomResponse)
async def get_menus():
    """활성화된 전체 메뉴를 트리 구조로 반환"""
    try:
        service = get_service('menus')
        tree = await service.get_tree()
        data = [node.model_dump() for node in tree]
        return KiwoomApiHelper.create_success_response(
            data={"menus": data},
            api_info=API_INFO_LIST,
        )
    except Exception as e:
        logger.error(f"메뉴 조회 오류: {e}")
        return KiwoomApiHelper.create_error_response(
            error_code="MENUS_ERROR",
            error_message=str(e),
            api_info=API_INFO_LIST,
        )
