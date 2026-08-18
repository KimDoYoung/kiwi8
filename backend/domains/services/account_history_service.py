from datetime import date, timedelta

import aiosqlite

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.models.account_history_model import AccountHistoryRow

logger = get_logger(__name__)

_SELECT_RANGE_SQL = """
    SELECT * FROM account_history
    WHERE record_date BETWEEN ? AND ?
    ORDER BY record_date ASC
"""


class AccountHistoryService:
    def __init__(self):
        self.db_path = config.DB_PATH

    async def get_range(self, start_date: str, end_date: str) -> list[AccountHistoryRow]:
        """record_date 범위(YYYY-MM-DD)로 계좌 이력 조회"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(_SELECT_RANGE_SQL, (start_date, end_date)) as cur:
                    rows = await cur.fetchall()
                    return [AccountHistoryRow(**dict(r)) for r in rows]
        except Exception as e:
            logger.error(f"[AccountHistory] 조회 오류: {e}")
            return []

    async def get_recent(self, days: int = 90) -> list[AccountHistoryRow]:
        """오늘 기준 최근 N일치 계좌 이력 조회"""
        end = date.today()
        start = end - timedelta(days=days)
        return await self.get_range(start.isoformat(), end.isoformat())
