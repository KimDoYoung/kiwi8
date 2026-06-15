import sqlite3
from datetime import date, timedelta
from backend.core.config import config
from backend.core.logger import get_logger

logger = get_logger(__name__)

_FIELDS = [
    'ipo_subscription_date', 'payment_date', 'refund_date',
    'listing_date', 'demand_forecast_date',
]


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

    async def get_ipo_by_range(self, start_ymd: str, end_ymd: str) -> list[dict]:
        """start_ymd~end_ymd 그리드 범위에 일정이 있는 IPO 데이터 반환."""
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_ipo_by_range_sync, start_ymd, end_ymd)

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

    def _get_ipo_by_range_sync(self, start_ymd: str, end_ymd: str) -> list[dict]:
        start = date(int(start_ymd[:4]), int(start_ymd[4:6]), int(start_ymd[6:8]))
        end   = date(int(end_ymd[:4]),   int(end_ymd[4:6]),   int(end_ymd[6:8]))

        # 범위에 걸친 연/월 목록 ('2026.05', '2026.06', ...)
        yms: list[str] = []
        cur = start.replace(day=1)
        while cur <= end:
            yms.append(f'{cur.year:04d}.{cur.month:02d}')
            cur = (cur.replace(day=28) + timedelta(days=4)).replace(day=1)

        # 5개 필드 × N개 월 → OR 조건
        clauses: list[str] = []
        params: dict[str, str] = {}
        for i, ym in enumerate(yms):
            for field in _FIELDS:
                clauses.append(f"{field} LIKE :ym{i}")
            params[f'ym{i}'] = f'%{ym}%'

        sql = f"""
            SELECT track_id, stock_name,
                   ipo_subscription_date, payment_date, refund_date,
                   listing_date, demand_forecast_date
            FROM ipo_data
            WHERE {' OR '.join(clauses)}
        """
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            cur_db = conn.cursor()
            cur_db.execute(sql, params)
            return [dict(row) for row in cur_db.fetchall()]
