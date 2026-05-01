"""종목 기본 정보 제공 싱글톤 클래스

stk_info 테이블을 우선 조회하고, 없으면 KIS API(CTPF1002R)로 조회 후 DB에 저장한다.
"""
from __future__ import annotations

import sqlite3

from backend.core.config import config
from backend.core.logger import get_logger

logger = get_logger(__name__)


class StkInfoProvider:
    """종목 기본 정보 제공 싱글톤 클래스"""

    _instance: StkInfoProvider | None = None

    def __init__(self):
        self._db_path = config.DB_PATH

    @classmethod
    def get(cls) -> StkInfoProvider:
        """싱글톤 인스턴스 반환"""
        if cls._instance is None:
            cls._instance = StkInfoProvider()
        return cls._instance

    def _get_conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self._db_path)

    # ------------------------------------------------------------------
    # NXT 거래 가능 여부
    # ------------------------------------------------------------------

    async def get_nxt_yn(self, stk_cd: str) -> str:
        """특정 종목의 NXT 거래 가능 여부 반환

        1. stk_info 테이블에서 nxt_enable 조회
        2. 없으면 KIS CTPF1002R API 호출 후 stk_info에 저장
        3. Y 또는 N 반환

        Args:
            stk_cd: 종목코드 (예: "005930")

        Returns:
            'Y' 또는 'N'
        """
        # 1) DB 조회
        nxt_yn = self._query_nxt_yn(stk_cd)
        if nxt_yn is not None:
            return nxt_yn

        # 2) KIS API 호출
        nxt_yn = await self._fetch_nxt_yn_from_kis(stk_cd)

        # 3) DB 저장 (upsert)
        self._upsert_stk_info(stk_cd, nxt_yn)

        return nxt_yn

    # ------------------------------------------------------------------
    # 내부 헬퍼
    # ------------------------------------------------------------------

    def _query_nxt_yn(self, stk_cd: str) -> str | None:
        """DB에서 nxt_enable 조회. 없으면 None 반환"""
        try:
            with self._get_conn() as conn:
                row = conn.execute(
                    'SELECT nxt_enable FROM stk_info WHERE stk_cd = ?',
                    (stk_cd,),
                ).fetchone()
            if row and row[0] is not None:
                return row[0]
            return None
        except Exception as e:
            logger.error(f'[StkInfoProvider] DB 조회 오류 stk_cd={stk_cd}: {e}')
            return None

    async def _fetch_nxt_yn_from_kis(self, stk_cd: str) -> str:
        """KIS CTPF1002R API로 NXT거래종목여부 조회. 실패시 'N' 반환"""
        try:
            from backend.domains.stkcompanys.kis.kis_service import get_kis_api
            from backend.domains.stkcompanys.kis.models.kis_schema import KisApiHelper, KisRequest

            kis = await get_kis_api()
            request = KisRequest(
                api_id='CTPF1002R',
                payload={'PRDT_TYPE_CD': '300', 'PDNO': stk_cd},
            )
            response = await kis.send_request(request)

            if response.success and response.data:
                korea_data = KisApiHelper.to_korea_data(response.data, 'CTPF1002R')
                nxt_yn = korea_data.get('NXT거래종목여부', 'N')
                if nxt_yn not in ('Y', 'N'):
                    nxt_yn = 'N'
                logger.info(f'[StkInfoProvider] CTPF1002R 조회 stk_cd={stk_cd} nxt_yn={nxt_yn}')
                return nxt_yn

            logger.warning(f'[StkInfoProvider] CTPF1002R 응답 실패 stk_cd={stk_cd}')
            return 'N'

        except Exception as e:
            logger.error(f'[StkInfoProvider] KIS API 오류 stk_cd={stk_cd}: {e}')
            return 'N'

    def _upsert_stk_info(self, stk_cd: str, nxt_enable: str) -> None:
        """stk_info 테이블에 nxt_enable 저장 (INSERT OR IGNORE 후 UPDATE)"""
        try:
            with self._get_conn() as conn:
                conn.execute(
                    'INSERT OR IGNORE INTO stk_info (stk_cd, nxt_enable) VALUES (?, ?)',
                    (stk_cd, nxt_enable),
                )
                conn.execute(
                    'UPDATE stk_info SET nxt_enable = ? WHERE stk_cd = ?',
                    (nxt_enable, stk_cd),
                )
                conn.commit()
            logger.info(f'[StkInfoProvider] stk_info 저장 stk_cd={stk_cd} nxt_enable={nxt_enable}')
        except Exception as e:
            logger.error(f'[StkInfoProvider] DB 저장 오류 stk_cd={stk_cd}: {e}')


def get_stk_info_provider() -> StkInfoProvider:
    """StkInfoProvider 싱글톤 인스턴스 반환 (편의 함수)"""
    return StkInfoProvider.get()
