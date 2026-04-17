"""
레이아웃 프리셋 관련 API 엔드포인트
"""
from fastapi import APIRouter, Request

from backend.core.logger import get_logger
from backend.core.security import get_current_user
from backend.domains.models.layout_preset_model import LayoutPresetCreate
from backend.domains.services.dependency import get_service
from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import KiwoomApiHelper, KiwoomResponse

logger = get_logger(__name__)
router = APIRouter()

API_INFO_LIST = {'api_id': 'layout_presets', 'description': '레이아웃 프리셋 관리'}


@router.get('/', response_model=KiwoomResponse)
async def list_presets(request: Request):
    """내 레이아웃 프리셋 목록 조회"""
    try:
        user_id = await get_current_user(request)
        service = get_service('layout_preset')
        presets = await service.list_by_user(user_id)
        data = [
            {
                'id': p.id,
                'user_id': p.user_id,
                'name': p.name,
                'layout_json': p.layout_json,
                'created_at': p.created_at,
                'updated_at': p.updated_at,
            }
            for p in presets
        ]
        return KiwoomApiHelper.create_success_response(
            data={'presets': data}, api_info=API_INFO_LIST
        )
    except Exception as e:
        logger.error(f'레이아웃 프리셋 목록 조회 중 오류: {e}')
        return KiwoomApiHelper.create_error_response(
            error_code='PRESET_LIST_ERROR',
            error_message=f'목록 조회 중 오류가 발생했습니다: {e}',
            api_info=API_INFO_LIST,
        )


@router.post('/upsert', response_model=KiwoomResponse)
async def upsert_preset(request: Request, body: LayoutPresetCreate):
    """레이아웃 프리셋 저장 또는 덮어쓰기 (이름 기준)"""
    try:
        user_id = await get_current_user(request)
        service = get_service('layout_preset')
        preset = await service.save_or_update(user_id, body)
        logger.info(f'레이아웃 프리셋 저장: user={user_id}, name={body.name}')
        return KiwoomApiHelper.create_success_response(
            data={
                'preset': {
                    'id': preset.id,
                    'user_id': preset.user_id,
                    'name': preset.name,
                    'layout_json': preset.layout_json,
                    'created_at': preset.created_at,
                    'updated_at': preset.updated_at,
                }
            },
            api_info=API_INFO_LIST,
        )
    except Exception as e:
        logger.error(f'레이아웃 프리셋 저장 중 오류: {e}')
        return KiwoomApiHelper.create_error_response(
            error_code='PRESET_SAVE_ERROR',
            error_message=f'프리셋 저장 중 오류가 발생했습니다: {e}',
            api_info=API_INFO_LIST,
        )


@router.delete('/{preset_id}', response_model=KiwoomResponse)
async def delete_preset(preset_id: int, request: Request):
    """레이아웃 프리셋 삭제"""
    try:
        user_id = await get_current_user(request)
        service = get_service('layout_preset')
        success = await service.delete(preset_id, user_id)
        if not success:
            return KiwoomApiHelper.create_error_response(
                error_code='PRESET_NOT_FOUND',
                error_message='프리셋을 찾을 수 없습니다.',
                api_info=API_INFO_LIST,
            )
        logger.info(f'레이아웃 프리셋 삭제: user={user_id}, id={preset_id}')
        return KiwoomApiHelper.create_success_response(
            data={'deleted_id': preset_id}, api_info=API_INFO_LIST
        )
    except Exception as e:
        logger.error(f'레이아웃 프리셋 삭제 중 오류: {e}')
        return KiwoomApiHelper.create_error_response(
            error_code='PRESET_DELETE_ERROR',
            error_message=f'프리셋 삭제 중 오류가 발생했습니다: {e}',
            api_info=API_INFO_LIST,
        )
