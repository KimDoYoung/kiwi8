import sqlite3
from backend.core.config import config
from backend.core.logger import get_logger

logger = get_logger(__name__)


class IpoService:
    def __init__(self):
        self.db_path = config.DB_PATH

    def _get_conn(self):
        return sqlite3.connect(self.db_path)

    async def get_ipo_by_month(self, year: int, month: int) -> list[dict]:
        """해당 연/월에 일정이 있는 IPO 데이터 반환."""
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_ipo_by_month_sync, year, month)

    async def get_ipo_list(self, status: str | None = None) -> list[dict]:
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_ipo_list_sync, status)

    def _get_ipo_list_sync(self, status: str | None) -> list[dict]:
        sql = """
            SELECT track_id, stock_name, status, market_type, stock_code,
                   industry, ceo, business_type, headquarters_location, website, phone_number,
                   major_shareholder, revenue, pre_tax_continuing_operations_profit, net_profit, capital,
                   total_ipo_shares, face_value, desired_ipo_price, subscription_competition_rate,
                   final_ipo_price, ipo_proceeds, lead_manager,
                   demand_forecast_date, ipo_subscription_date, payment_date, refund_date, listing_date,
                   ir_data
            FROM ipo_data
        """
        params: list = []
        if status:
            sql += ' WHERE status = ?'
            params.append(status)
        sql += ' ORDER BY listing_date DESC, ipo_subscription_date DESC'

        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(sql, params)
            return [dict(row) for row in cur.fetchall()]

    def _get_ipo_by_month_sync(self, year: int, month: int) -> list[dict]:
        ym = f'{year:04d}.{month:02d}'
        # 해당 연/월 문자열이 날짜 필드 중 하나에 포함된 행 조회
        sql = """
            SELECT track_id, stock_name,
                   ipo_subscription_date, payment_date, refund_date,
                   listing_date, demand_forecast_date
            FROM ipo_data
            WHERE ipo_subscription_date LIKE :ym
               OR payment_date          LIKE :ym
               OR refund_date           LIKE :ym
               OR listing_date          LIKE :ym
               OR demand_forecast_date  LIKE :ym
        """
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(sql, {'ym': f'%{ym}%'})
            return [dict(row) for row in cur.fetchall()]
