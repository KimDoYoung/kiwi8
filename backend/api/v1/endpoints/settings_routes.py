
import asyncio
import sqlite3

from fastapi import APIRouter, Query
from pydantic import BaseModel

from backend.api.common.stock_functions import stk_info_fill
from backend.core.logger import get_logger
from backend.domains.infrahub.prev_price_cache import get_prev_price_cache
from backend.domains.services.dependency import get_service
from backend.domains.services.settings_keys import SettingsKey
from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import KiwoomApiHelper


class SettingValueBody(BaseModel):
    value: str

class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str

# APIRouter 인스턴스 생성
router = APIRouter()
logger = get_logger(__name__)

@router.get("/list")
async def get_all_settings():
    """모든 설정값 목록 조회"""
    settings_service = get_service("settings")
    items = await settings_service.list_all()
    return [{"name": s.name, "value": s.value} for s in items]

@router.put("/stk_info")
async def update_stk_info(force: bool = False):
    """stk_info 테이블 업데이트"""
    try:
        logger.info(f"stk_info 테이블 업데이트 시작 (force={force})")
        # stk_info_fill은 비동기 함수이므로 await 사용
        await stk_info_fill(force=force)
        service = get_service("settings")
        last_fill_time = await service.get(SettingsKey.LAST_STK_INFO_FILL)
        logger.info(f"stk_info 테이블 업데이트 완료: {last_fill_time}")
        return KiwoomApiHelper.create_success_response(data={"last_stk_info_fill": last_fill_time})
    except Exception as e:
        logger.error(f"stk_info 테이블 업데이트 중 오류 발생: {e!s}", exc_info=True)
        return KiwoomApiHelper.create_error_response(
            error_code="STK_INFO_UPDATE_ERROR",
            error_message=f"stk_info 테이블 업데이트 중 오류가 발생했습니다: {e!s}"
        )

@router.post("/change-password")
async def change_password(body: ChangePasswordBody):
    """비밀번호 변경 (현재 비밀번호 검증 후 변경)"""
    settings_service = get_service("settings")
    saved_pw = await settings_service.get(SettingsKey.USER_PW)
    if saved_pw != body.current_password:
        return KiwoomApiHelper.create_error_response(
            error_code="WRONG_PASSWORD",
            error_message="현재 비밀번호가 올바르지 않습니다."
        )
    if not body.new_password:
        return KiwoomApiHelper.create_error_response(
            error_code="EMPTY_PASSWORD",
            error_message="새 비밀번호를 입력해주세요."
        )
    await settings_service.set(SettingsKey.USER_PW, body.new_password)
    logger.info("비밀번호 변경 완료")
    return KiwoomApiHelper.create_success_response(data={"message": "비밀번호가 변경되었습니다."})

@router.get("/holidays")
async def get_holidays_range():
    """holidays 테이블의 현재 저장 범위(min/max YYYYMM) 반환."""
    from backend.core.config import config
    try:
        with sqlite3.connect(config.DB_PATH) as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT MIN(year * 100 + month), MAX(year * 100 + month), COUNT(*) FROM holidays"
            )
            row = cur.fetchone()
            if row and row[0]:
                return KiwoomApiHelper.create_success_response(data={
                    'min_ym': f'{row[0]:06d}',
                    'max_ym': f'{row[1]:06d}',
                    'count':  row[2],
                })
            return KiwoomApiHelper.create_success_response(data={'min_ym': None, 'max_ym': None, 'count': 0})
    except Exception as e:
        return KiwoomApiHelper.create_error_response(error_code="HOLIDAYS_RANGE_ERROR", error_message=str(e))


@router.post("/holidays")
async def fetch_holidays(
    start_ym: str = Query(..., description='시작 연월 (YYYYMM)'),
    end_ym:   str = Query(..., description='종료 연월 (YYYYMM)'),
):
    """godata API에서 start_ym~end_ym 공휴일 수집 → holidays 테이블 저장."""
    from datetime import date
    from backend.domains.infrahub.open_time_checker import OpenTimeChecker
    from backend.core.config import config

    try:
        sy, sm = int(start_ym[:4]), int(start_ym[4:6])
        ey, em = int(end_ym[:4]),   int(end_ym[4:6])
    except (ValueError, IndexError):
        return KiwoomApiHelper.create_error_response(
            error_code="INVALID_PARAM", error_message="start_ym/end_ym은 YYYYMM 형식이어야 합니다."
        )

    months: list[tuple[int, int]] = []
    cur_d = date(sy, sm, 1)
    end_d = date(ey, em, 1)
    while cur_d <= end_d:
        months.append((cur_d.year, cur_d.month))
        cur_d = date(cur_d.year + (cur_d.month == 12), (cur_d.month % 12) + 1, 1)

    checker = OpenTimeChecker.get()
    total = 0
    try:
        with sqlite3.connect(config.DB_PATH) as conn:
            cur = conn.cursor()
            for y, m in months:
                try:
                    names = await checker._fetch_holiday_names_from_api(y, m)  # 내부 1초 sleep 포함
                except Exception as e:
                    logger.warning(f"[holidays] {y}-{m:02d} API 실패: {e}")
                    names = {}
                cur.execute("DELETE FROM holidays WHERE year=? AND month=?", (y, m))
                for ymd, name in names.items():
                    cur.execute(
                        "INSERT OR REPLACE INTO holidays (ymd, name, year, month) VALUES (?, ?, ?, ?)",
                        (ymd, name, y, m),
                    )
                    total += 1
                checker._month_names_cache.pop((y, m), None)
                logger.info(f"[holidays] {y}-{m:02d} {len(names)}건")
            conn.commit()
    except Exception as e:
        logger.error(f"[holidays] DB 오류: {e}", exc_info=True)
        return KiwoomApiHelper.create_error_response(error_code="HOLIDAYS_DB_ERROR", error_message=str(e))

    logger.info(f"[holidays] {start_ym}~{end_ym} 공휴일 {total}건 저장 완료")
    return KiwoomApiHelper.create_success_response(data={"start_ym": start_ym, "end_ym": end_ym, "count": total})


@router.put("/{setting_key}")
async def update_setting(setting_key: str, body: SettingValueBody):
    """특정 설정값 저장"""
    settings_service = get_service("settings")
    await settings_service.set(setting_key, body.value)
    return {"key": setting_key, "value": body.value}

@router.get("/{setting_key}")
async def get_setting(setting_key: str):
    """특정 설정값 조회"""
    settings_service = get_service("settings")
    value = await settings_service.get(setting_key)
    if value is None:
        return KiwoomApiHelper.create_error_response(error_code="SETTING_NOT_FOUND", error_message=f"설정값을 찾을 수 없습니다: {setting_key}")
    return {"key": setting_key, "value": value, "exists": True}


@router.delete("/cache")
async def delete_all_cache():
    """stk_cache 테이블 삭제"""
    try:
        cache_mgr = get_service("cache_manager")
        success = await cache_mgr.clear_all()

        prev_price_cache = get_prev_price_cache()
        await prev_price_cache.clear()

        if success:
            logger.info("모든 캐시가 삭제되었습니다.")
            return KiwoomApiHelper.create_success_response(data={"message": "모든 캐시가 삭제되었습니다."})
        else:
            logger.warning("stk_cache 테이블 삭제에는 실패했지만 PrevPriceCache는 초기화되었습니다.")
            return KiwoomApiHelper.create_error_response(error_code="CACHE_DELETE_ERROR", error_message="캐시 삭제에 실패했습니다. PrevPriceCache는 초기화되었습니다.")
    except Exception as e:
        logger.error(f"캐시 삭제 중 오류 발생: {e!s}", exc_info=True)
        return KiwoomApiHelper.create_error_response(
            error_code="CACHE_DELETE_ERROR",
            error_message=f"캐시 삭제 중 오류가 발생했습니다: {e!s}"
        )