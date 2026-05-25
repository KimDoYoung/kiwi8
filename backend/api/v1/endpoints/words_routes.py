"""
경제 용어(stk_words) 관련 API 엔드포인트
"""
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.models.stk_words_model import StkWordsFilter
from backend.domains.services.dependency import get_service
from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import (
    KiwoomApiHelper,
    KiwoomRequest,
    KiwoomResponse,
)

logger = get_logger(__name__)

router = APIRouter()

_ALLOWED_MIME = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
}


@router.post("/images")
async def upload_word_image(file: UploadFile = File(...)):
    """경제 용어 이미지 업로드 - BASE_DIR/files/images/yyyy/mm/dd/ 에 저장"""
    if file.content_type not in _ALLOWED_MIME:
        raise HTTPException(status_code=400, detail=f"허용되지 않는 파일 형식: {file.content_type}")

    ext = _ALLOWED_MIME[file.content_type]
    now = datetime.now()
    yyyy, mm, dd = now.strftime('%Y'), now.strftime('%m'), now.strftime('%d')

    target_dir = Path(config.FILE_FOLDER) / 'images' / yyyy / mm / dd
    target_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = target_dir / filename

    try:
        file_path.write_bytes(await file.read())
    except OSError as e:
        logger.error(f"이미지 저장 실패: {e}")
        raise HTTPException(status_code=500, detail="이미지 저장 중 오류가 발생했습니다.")

    url = f"/kiwi8/files/images/{yyyy}/{mm}/{dd}/{filename}"
    logger.info(f"용어 이미지 업로드 완료: {url}")
    return {"url": url}


@router.post("/", response_model=KiwoomResponse)
async def create_word(request: KiwoomRequest):
    """경제 용어 생성
    
    Request payload 예시:
    {
        "word": "인플레이션",
        "brief": "물가가 지속적으로 오르는 현상", 
        "detail": "<p>상세 내용...</p>"
    }
    """
    logger.info(f"경제 용어 생성 요청: {request}")
    
    try:
        word = request.payload.get("word", "")
        brief = request.payload.get("brief", "")
        detail = request.payload.get("detail", None)
        
        # 입력 데이터 검증
        if not word or not word.strip():
            return KiwoomApiHelper.create_error_response(
                error_code="INVALID_WORD",
                error_message="단어명은 필수 입력 사항입니다.",
                api_info={"api_id": "word_create", "description": "경제 용어 생성"}
            )
        
        if not brief or not brief.strip():
            return KiwoomApiHelper.create_error_response(
                error_code="INVALID_BRIEF",
                error_message="간단 설명은 필수 입력 사항입니다.",
                api_info={"api_id": "word_create", "description": "경제 용어 생성"}
            )

        service = get_service("stk_words")
        
        from backend.domains.models.stk_words_model import StkWordsCreate
        words_create = StkWordsCreate(
            word=word.strip(),
            brief=brief.strip(),
            detail=detail.strip() if detail else None
        )
        
        saved_word = await service.create(words_create)
        logger.info(f"경제 용어 생성 완료: ID={saved_word.id}, 단어={word}")
        
        return KiwoomApiHelper.create_success_response(
            data={
                "id": saved_word.id,
                "word": saved_word.word,
                "brief": saved_word.brief,
                "detail": saved_word.detail,
                "message": "경제 용어가 성공적으로 저장되었습니다."
            },
            api_info={"api_id": "word_create", "description": "경제 용어 생성"}
        )
        
    except ValueError as ve:
        logger.warning(f"경제 용어 생성 유효성 검사 실패: {ve}")
        return KiwoomApiHelper.create_error_response(
            error_code="WORD_DUPLICATE_ERROR",
            error_message=str(ve),
            api_info={"api_id": "word_create", "description": "경제 용어 생성"}
        )
    except Exception as e:
        logger.error(f"경제 용어 생성 중 오류: {e!s}")
        return KiwoomApiHelper.create_error_response(
            error_code="WORD_CREATE_ERROR",
            error_message=f"경제 용어 저장 중 오류가 발생했습니다: {e!s}",
            api_info={"api_id": "word_create", "description": "경제 용어 생성"}
        )


@router.post("/list", response_model=KiwoomResponse)
async def get_words_list(request: KiwoomRequest):
    """경제 용어 목록 조회
    
    Request payload 예시:
    {
        "word_like": "인플",
        "page": 1,
        "limit": 100
    }
    """
    word_like = request.payload.get("word_like", None)
    brief_like = request.payload.get("brief_like", None)
    detail_like = request.payload.get("detail_like", None)
    page = request.payload.get("page", 1)
    limit = request.payload.get("limit", 100)
    
    logger.info(f"경제 용어 목록 조회: 검색어={word_like}, 페이지={page}, 한계={limit}")
    
    try:
        service = get_service("stk_words")
        
        filter_data = StkWordsFilter(
            word_like=word_like if word_like else None,
            brief_like=brief_like if brief_like else None,
            detail_like=detail_like if detail_like else None,
            is_active=1  # 활성화된 것만 노출
        )
        
        all_words = await service.list_all(filter_data)
        
        # 페이징 처리
        total_count = len(all_words)
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated_words = all_words[start_idx:end_idx]
        
        words_list = []
        for w in paginated_words:
            words_list.append({
                "id": w.id,
                "word": w.word,
                "brief": w.brief,
                "detail": w.detail,
                "created_at": w.created_at,
                "updated_at": w.updated_at
            })
            
        result_data = {
            "list": words_list,
            "pagination": {
                "total": total_count,
                "page": page,
                "limit": limit,
                "total_pages": (total_count + limit - 1) // limit
            }
        }
        
        logger.info(f"경제 용어 목록 조회 완료: {len(words_list)}개 항목 반환")
        
        return KiwoomApiHelper.create_success_response(
            data=result_data,
            api_info={"api_id": "word_list", "description": "경제 용어 목록 조회"}
        )
        
    except Exception as e:
        logger.error(f"경제 용어 목록 조회 중 오류: {e!s}")
        return KiwoomApiHelper.create_error_response(
            error_code="WORD_LIST_ERROR",
            error_message=f"경제 용어 목록 조회 중 오류가 발생했습니다: {e!s}",
            api_info={"api_id": "word_list", "description": "경제 용어 목록 조회"}
        )


@router.get("/{word_id}", response_model=KiwoomResponse)
async def get_word(word_id: int):
    """경제 용어 상세 조회"""
    logger.info(f"경제 용어 상세 조회: ID={word_id}")
    
    try:
        service = get_service("stk_words")
        w = await service.get_by_id(word_id)
        
        if not w or w.is_active == 0:
            return KiwoomApiHelper.create_error_response(
                error_code="WORD_NOT_FOUND",
                error_message="해당 경제 용어를 찾을 수 없습니다.",
                api_info={"api_id": "word_get", "description": "경제 용어 상세 조회"}
            )
            
        word_data = {
            "id": w.id,
            "word": w.word,
            "brief": w.brief,
            "detail": w.detail,
            "created_at": w.created_at,
            "updated_at": w.updated_at
        }
        
        logger.info(f"경제 용어 상세 조회 완료: ID={word_id}")
        
        return KiwoomApiHelper.create_success_response(
            data=word_data,
            api_info={"api_id": "word_get", "description": "경제 용어 상세 조회"}
        )
        
    except Exception as e:
        logger.error(f"경제 용어 상세 조회 중 오류: {e!s}")
        return KiwoomApiHelper.create_error_response(
            error_code="WORD_GET_ERROR",
            error_message=f"경제 용어 상세 조회 중 오류가 발생했습니다: {e!s}",
            api_info={"api_id": "word_get", "description": "경제 용어 상세 조회"}
        )


@router.put("/{word_id}", response_model=KiwoomResponse)
async def update_word(word_id: int, request: KiwoomRequest):
    """경제 용어 수정
    
    Request payload 예시:
    {
        "word": "인플레이션 수정",
        "brief": "물가가 계속하여 상승하는 경제 현상",
        "detail": "<p>수정된 상세 내용...</p>"
    }
    """
    logger.info(f"경제 용어 수정 요청: ID={word_id}, Payload={request.payload}")
    
    try:
        word = request.payload.get("word", None)
        brief = request.payload.get("brief", None)
        detail = request.payload.get("detail", None)
        is_active = request.payload.get("is_active", None)
        
        # 입력 데이터 검증 (필드가 전달된 경우에만 검증)
        if word is not None and not word.strip():
            return KiwoomApiHelper.create_error_response(
                error_code="INVALID_WORD",
                error_message="단어명은 비어있을 수 없습니다.",
                api_info={"api_id": "word_update", "description": "경제 용어 수정"}
            )
            
        if brief is not None and not brief.strip():
            return KiwoomApiHelper.create_error_response(
                error_code="INVALID_BRIEF",
                error_message="간단 설명은 비어있을 수 없습니다.",
                api_info={"api_id": "word_update", "description": "경제 용어 수정"}
            )

        service = get_service("stk_words")
        
        from backend.domains.models.stk_words_model import StkWordsUpdate
        words_update = StkWordsUpdate(
            word=word.strip() if word is not None else None,
            brief=brief.strip() if brief is not None else None,
            detail=detail.strip() if detail is not None else None,
            is_active=is_active
        )
        
        updated_word = await service.update(word_id, words_update)
        
        if not updated_word:
            return KiwoomApiHelper.create_error_response(
                error_code="WORD_NOT_FOUND",
                error_message="경제 용어를 찾을 수 없거나 수정에 실패했습니다.",
                api_info={"api_id": "word_update", "description": "경제 용어 수정"}
            )
            
        logger.info(f"경제 용어 수정 완료: ID={word_id}")
        
        return KiwoomApiHelper.create_success_response(
            data={
                "id": updated_word.id,
                "word": updated_word.word,
                "brief": updated_word.brief,
                "detail": updated_word.detail,
                "message": "경제 용어가 성공적으로 수정되었습니다."
            },
            api_info={"api_id": "word_update", "description": "경제 용어 수정"}
        )
        
    except ValueError as ve:
        logger.warning(f"경제 용어 수정 유효성 검사 실패: {ve}")
        return KiwoomApiHelper.create_error_response(
            error_code="WORD_DUPLICATE_ERROR",
            error_message=str(ve),
            api_info={"api_id": "word_update", "description": "경제 용어 수정"}
        )
    except Exception as e:
        logger.error(f"경제 용어 수정 중 오류: {e!s}")
        return KiwoomApiHelper.create_error_response(
            error_code="WORD_UPDATE_ERROR",
            error_message=f"경제 용어 수정 중 오류가 발생했습니다: {e!s}",
            api_info={"api_id": "word_update", "description": "경제 용어 수정"}
        )


@router.delete("/{word_id}", response_model=KiwoomResponse)
async def delete_word(word_id: int):
    """경제 용어 삭제 (소프트 딜리트)"""
    logger.info(f"경제 용어 삭제 요청: ID={word_id}")
    
    try:
        service = get_service("stk_words")
        success = await service.delete(word_id)
        
        if not success:
            return KiwoomApiHelper.create_error_response(
                error_code="WORD_DELETE_FAILED",
                error_message="경제 용어를 찾을 수 없거나 삭제에 실패했습니다.",
                api_info={"api_id": "word_delete", "description": "경제 용어 삭제"}
            )
            
        logger.info(f"경제 용어 삭제(비활성화) 성공: ID={word_id}")
        return KiwoomApiHelper.create_success_response(
            data={
                "id": word_id,
                "message": "경제 용어가 성공적으로 삭제(비활성화)되었습니다."
            },
            api_info={"api_id": "word_delete", "description": "경제 용어 삭제"}
        )
        
    except Exception as e:
        logger.error(f"경제 용어 삭제 중 오류: {e!s}")
        return KiwoomApiHelper.create_error_response(
            error_code="WORD_DELETE_ERROR",
            error_message=f"경제 용어 삭제 중 오류가 발생했습니다: {e!s}",
            api_info={"api_id": "word_delete", "description": "경제 용어 삭제"}
        )
