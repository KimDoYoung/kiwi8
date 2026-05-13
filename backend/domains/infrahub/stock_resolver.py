# backend/domains/infrahub/stock_resolver.py
"""
모듈 설명:
    - 종목 특성을 조회하는 싱글톤 클래스
    - 다른 API나 서비스에서 판단 근거로 참조하는 인프라성 유틸
    - 내부 구현(캐시/DB/API 선택)을 숨기고 확정된 값 하나를 보장한다.

현재 제공 기능:
    - is_enable_nxt(stk_cd): 종목의 NXT 거래 가능 여부

is_enable_nxt 조회 순서:
    1. stk_cache 테이블에서 24시간 이내 기록이 있으면 반환
    2. stk_info 테이블에서 nxt_enable 필드 조회 → 캐시 저장 후 반환
    3. 키움 ka10100 API 호출 → 캐시 저장 후 반환

사용법:
    ```python
    from backend.domains.infrahub.stock_resolver import StockResolver

    resolver = StockResolver.get()
    is_nxt = await resolver.is_enable_nxt("005930")
    ```

작성자: kiwi8
작성일: 2026-05-13
"""
from __future__ import annotations

import json
import sqlite3

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.infrahub.cache_keys import CacheKey

logger = get_logger(__name__)

# NXT 캐시 유효 시간 (24시간)
_NXT_CACHE_HOURS = 24


class StockResolver:
    """
    종목 특성 조회 싱글톤 클래스

    종목이 NXT 거래 가능한지 등 종목의 고유 특성을 조회한다.
    내부적으로 캐시 → DB → API 순서로 최적의 수단을 선택하며,
    호출 측은 조회 경로를 신경 쓸 필요 없이 결과만 사용한다.
    """

    _instance: StockResolver | None = None

    def __init__(self):
        self._db_path = config.DB_PATH

    @classmethod
    def get(cls) -> StockResolver:
        """싱글톤 인스턴스 반환"""
        if cls._instance is None:
            cls._instance = StockResolver()
        return cls._instance

    # ------------------------------------------------------------------
    # 공개 인터페이스
    # ------------------------------------------------------------------

    async def is_enable_nxt(self, stk_cd: str) -> bool:
        """
        종목의 NXT 거래 가능 여부 반환

        조회 순서:
            1. stk_cache (24시간 유효)
            2. stk_info 테이블
            3. 키움 ka10100 API

        Args:
            stk_cd: 종목코드 (예: "005930")

        Returns:
            True: NXT 거래 가능, False: 불가
        """
        # 1. 캐시 조회 (24시간)
        cached = self._get_nxt_from_cache(stk_cd)
        if cached is not None:
            logger.debug(f"[StockResolver] NXT 캐시 히트: {stk_cd} = {cached}")
            return cached

        # 2. stk_info 테이블 조회
        nxt_yn = self._get_nxt_from_stk_info(stk_cd)
        if nxt_yn is not None:
            logger.debug(f"[StockResolver] stk_info 히트: {stk_cd} = {nxt_yn}")
            await self._save_nxt_to_cache(stk_cd, nxt_yn)
            return nxt_yn == "Y"

        # 3. 키움 ka10100 API 조회
        nxt_yn = await self._fetch_nxt_from_kiwoom(stk_cd)
        logger.info(f"[StockResolver] ka10100 조회: {stk_cd} = {nxt_yn}")
        await self._save_nxt_to_cache(stk_cd, nxt_yn)
        return nxt_yn == "Y"

    # ------------------------------------------------------------------
    # 내부: 캐시 조회/저장 (stk_cache 직접 쿼리 — 24h 만료)
    # ------------------------------------------------------------------

    def _get_nxt_from_cache(self, stk_cd: str) -> bool | None:
        """
        stk_cache 테이블에서 NXT 가능 여부 조회 (24시간 유효).

        CacheManager의 기본 만료(8h)가 아닌 24h 기준으로 직접 쿼리한다.

        Returns:
            True/False: 캐시 히트, None: 캐시 미스
        """
        try:
            with sqlite3.connect(self._db_path) as conn:
                row = conn.execute(
                    """
                    SELECT value FROM stk_cache
                    WHERE stk_cd = ? AND name = ?
                      AND created_at >= datetime('now', ? )
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (stk_cd, CacheKey.NXT_ENABLE.value, f"-{_NXT_CACHE_HOURS} hours"),
                ).fetchone()
            if row:
                data = json.loads(row[0])
                return data == "Y"
            return None
        except Exception as e:
            logger.debug(f"[StockResolver] NXT 캐시 조회 실패 {stk_cd}: {e}")
            return None

    async def _save_nxt_to_cache(self, stk_cd: str, nxt_yn: str) -> None:
        """NXT 가능 여부를 CacheManager를 통해 저장"""
        try:
            from backend.domains.infrahub.cache_manager import CacheManager
            cache_mgr = CacheManager.get_instance()
            await cache_mgr.put(stk_cd, CacheKey.NXT_ENABLE, json.dumps(nxt_yn))
        except Exception as e:
            logger.debug(f"[StockResolver] NXT 캐시 저장 실패 {stk_cd}: {e}")

    # ------------------------------------------------------------------
    # 내부: stk_info 테이블 조회
    # ------------------------------------------------------------------

    def _get_nxt_from_stk_info(self, stk_cd: str) -> str | None:
        """
        stk_info 테이블에서 nxt_enable 조회.

        Returns:
            'Y' 또는 'N': DB에 값이 있을 때, None: 레코드 없음
        """
        try:
            with sqlite3.connect(self._db_path) as conn:
                row = conn.execute(
                    "SELECT nxt_enable FROM stk_info WHERE stk_cd = ?",
                    (stk_cd,),
                ).fetchone()
            if row and row[0] is not None:
                return row[0]
            return None
        except Exception as e:
            logger.debug(f"[StockResolver] stk_info 조회 실패 {stk_cd}: {e}")
            return None

    # ------------------------------------------------------------------
    # 내부: 키움 ka10100 API 조회
    # ------------------------------------------------------------------

    async def _fetch_nxt_from_kiwoom(self, stk_cd: str) -> str:
        """
        키움 ka10100 (종목정보 조회) API로 NXT 가능 여부 조회.

        Returns:
            'Y': NXT 가능, 'N': 불가 (실패 시에도 'N' 반환)
        """
        try:
            from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
            from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import KiwoomRequest

            api = await get_kiwoom_api()
            response = await api.send_request(
                KiwoomRequest(api_id="ka10100", payload={"stk_cd": stk_cd})
            )

            if not response.success or not response.data:
                logger.warning(f"[StockResolver] ka10100 응답 실패: {stk_cd}")
                return "N"

            nxt_enable = response.data.get("nxtEnable", "")
            return "Y" if nxt_enable == "Y" else "N"

        except Exception as e:
            logger.error(f"[StockResolver] ka10100 예외 {stk_cd}: {e}")
            return "N"
