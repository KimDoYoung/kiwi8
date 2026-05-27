import aiosqlite

from backend.core.config import config
from backend.core.logger import get_logger

logger = get_logger(__name__)

_INSERT_SQL = """
    INSERT INTO stk_trades_history
        (broker, acct_no, order_no, sell_buy, stk_cd, stk_nm,
         ymd, order_qty, order_price, ccnl_qty, ccnl_price, ccnl_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


class StkHistoryService:
    def __init__(self):
        self.db_path = config.DB_PATH

    async def save_execution(self, data: dict, broker: str = 'KIS') -> bool:
        """체결통보 데이터를 stk_trades_history에 저장 (KIS/LS/KIWOOM 공통)"""
        from datetime import datetime

        from backend.core.config import config
        ymd = datetime.now().strftime('%Y%m%d')

        ccnl_time = data.get('ccnl_time', '')
        if len(ccnl_time) > 6:
            ccnl_time = ccnl_time[:6]

        # 계좌번호: 데이터에 없으면 config 폴백
        acct_no = data.get('acct_no', '')
        if not acct_no:
            if broker == 'LS':
                acct_no = config.LS_ACCT_NO
            elif broker == 'KIWOOM':
                acct_no = config.KIWOOM_ACCT_NO

        params = (
            broker,
            acct_no,
            data.get('order_no', ''),
            data.get('sell_buy', ''),
            data.get('stock_code', ''),
            data.get('stock_name', ''),
            ymd,
            _to_int(data.get('order_qty')),
            _to_int(data.get('order_price')),
            _to_int(data.get('ccnl_qty')),
            _to_int(data.get('ccnl_price')),
            ccnl_time,
        )
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(_INSERT_SQL, params)
                await db.commit()
            logger.info(
                f"[StkHistory] 체결 저장: {broker} {data.get('stock_code')} "
                f"{'매도' if data.get('sell_buy') == '1' else '매수'} "
                f"qty={data.get('ccnl_qty')} price={data.get('ccnl_price')}"
            )
            return True
        except Exception as e:
            logger.error(f"[StkHistory] 저장 오류: {e}")
            return False

    async def list_recent(self, limit: int = 100) -> list[dict]:
        """최근 체결 내역 조회"""
        sql = """
            SELECT id, broker, acct_no, order_no, sell_buy, stk_cd, stk_nm,
                   ymd, order_qty, order_price, ccnl_qty, ccnl_price, ccnl_time,
                   note, created_at
            FROM stk_trades_history
            ORDER BY id DESC
            LIMIT ?
        """
        try:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(sql, (limit,)) as cur:
                    rows = await cur.fetchall()
                    return [dict(r) for r in rows]
        except Exception as e:
            logger.error(f"[StkHistory] 조회 오류: {e}")
            return []


def _to_int(val) -> int | None:
    try:
        return int(val) if val not in (None, '', ' ') else None
    except (ValueError, TypeError):
        return None
