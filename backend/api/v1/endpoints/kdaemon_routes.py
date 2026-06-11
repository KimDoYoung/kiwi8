
import sqlite3
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.kdaemon.k_daemon import KDaemon

# APIRouter 인스턴스 생성
router = APIRouter()
logger = get_logger(__name__)

class CommandBody(BaseModel):
    cmd: str  # 'start' | 'stop' | 'refresh' | 'dry_run'
    args: dict | None = None

def _conn():
    DB_PATH = config.DB_PATH
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

@router.post("/command")
async def send_command(body: CommandBody):
    cmd = body.cmd.lower()
    if cmd not in {"start", "stop", "refresh", "dry_run"}:
        raise HTTPException(400, detail="invalid cmd")

    daemon = KDaemon.get(config.DB_PATH, poll_interval_sec=60, dry_run=config.KDAEMON_DRY_RUN)

    if cmd == "start":
        await daemon.start()
    elif cmd == "stop":
        await daemon.stop()
    elif cmd == "refresh":
        await daemon.refresh()
    elif cmd == "dry_run":
        value = bool((body.args or {}).get("value", True))
        daemon.dry_run = value
        with _conn() as c:
            c.execute("UPDATE auto_trade_state SET dry_run=? WHERE id=1", (int(value),))
            c.commit()

    return {"ok": True, "cmd": cmd}

@router.get("/status")
def status():
    with _conn() as c:
        row = c.execute("SELECT status, updated_at, dry_run FROM auto_trade_state WHERE id=1").fetchone()
    return {
        "status": row[0] if row else "unknown",
        "updated_at": row[1] if row else None,
        "dry_run": bool(row[2]) if row and row[2] is not None else True,
    }

@router.get("/conditions")
async def get_conditions():
    """키움 조건식 목록 조회 (ka10171 WebSocket)"""
    from backend.domains.kdaemon.auto_trader import get_condition_list
    items = await get_condition_list()
    return {"ok": True, "data": items}


# ── 매수 전략 CRUD ──────────────────────────────────

class StrategyBody(BaseModel):
    name: str
    broker: str = 'kiwoom'
    condition_seq: str
    buy_start: str
    buy_end: str
    max_positions: int = 3
    stop_rate: float = 0.05
    is_active: int = 1

@router.get("/strategies")
def list_strategies():
    with _conn() as c:
        rows = c.execute("SELECT * FROM auto_trade_buy_strategy ORDER BY id").fetchall()
        cols = [d[0] for d in c.execute("SELECT * FROM auto_trade_buy_strategy LIMIT 0").description or []]
    if not cols:
        cols = ['id','name','broker','condition_seq','buy_start','buy_end','max_positions','stop_rate','is_active']
    return [dict(zip(cols, r)) for r in rows]

@router.post("/strategies")
def create_strategy(body: StrategyBody):
    with _conn() as c:
        cur = c.execute(
            """INSERT INTO auto_trade_buy_strategy
               (name, broker, condition_seq, buy_start, buy_end, max_positions, stop_rate, is_active)
               VALUES (?,?,?,?,?,?,?,?)""",
            (body.name, body.broker, body.condition_seq, body.buy_start,
             body.buy_end, body.max_positions, body.stop_rate, body.is_active)
        )
        c.commit()
        return {"ok": True, "id": cur.lastrowid}

@router.put("/strategies/{sid}")
def update_strategy(sid: int, body: StrategyBody):
    with _conn() as c:
        c.execute(
            """UPDATE auto_trade_buy_strategy
               SET name=?, broker=?, condition_seq=?, buy_start=?, buy_end=?,
                   max_positions=?, stop_rate=?, is_active=?
               WHERE id=?""",
            (body.name, body.broker, body.condition_seq, body.buy_start,
             body.buy_end, body.max_positions, body.stop_rate, body.is_active, sid)
        )
        c.commit()
    return {"ok": True}

@router.delete("/strategies/{sid}")
def delete_strategy(sid: int):
    with _conn() as c:
        c.execute("DELETE FROM auto_trade_buy_strategy WHERE id=?", (sid,))
        c.commit()
    return {"ok": True}


# ── 직접 매수 큐 (auto_trade.data) ────────────────────

def _manual_stocks_path() -> Path:
    return Path(config.BASE_DIR) / 'db' / 'auto_trade.data'

@router.get("/manual-stocks")
def get_manual_stocks():
    path = _manual_stocks_path()
    if not path.exists():
        return {"lines": []}
    lines = [l.strip() for l in path.read_text().splitlines() if l.strip()]
    return {"lines": lines}

class ManualStocksBody(BaseModel):
    lines: list[str]

@router.put("/manual-stocks")
def save_manual_stocks(body: ManualStocksBody):
    path = _manual_stocks_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    content = '\n'.join(l.strip() for l in body.lines if l.strip())
    path.write_text(content)
    return {"ok": True}


# ── 포지션 / 로그 조회 ────────────────────────────────

@router.get("/positions")
async def list_positions():
    with _conn() as c:
        rows = c.execute("SELECT * FROM auto_trade_position ORDER BY bought_at DESC").fetchall()
        cols = [d[0] for d in c.execute("SELECT * FROM auto_trade_position LIMIT 0").description or []]
    if not cols:
        cols = ['id','stk_cd','stk_nm','buy_price','qty','amount','base_price','stop_price','stop_rate','cur_price','bought_at','updated_at']
    result = [dict(zip(cols, r)) for r in rows]
    # cur_price가 null인 포지션은 실시간 조회로 보강
    null_positions = [p for p in result if not p.get('cur_price')]
    if null_positions:
        from backend.domains.kdaemon.auto_trader import get_current_price, update_position_cur_price
        with _conn() as c2:
            for p in null_positions:
                price = await get_current_price(p['stk_cd'])
                if price:
                    p['cur_price'] = price
                    update_position_cur_price(c2, p['stk_cd'], price)
    return result

@router.get("/results")
def list_results(limit: int = Query(default=200, le=1000), offset: int = Query(default=0)):
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM auto_trade_results ORDER BY bought_at DESC LIMIT ? OFFSET ?",
            (limit, offset)
        ).fetchall()
        desc = c.execute("SELECT * FROM auto_trade_results LIMIT 0").description or []
        cols = [d[0] for d in desc]
    return [dict(zip(cols, r)) for r in rows]


@router.get("/logs")
def list_logs(limit: int = Query(default=100, le=500)):
    with _conn() as c:
        rows = c.execute("SELECT * FROM auto_trade_log ORDER BY dt DESC LIMIT ?", (limit,)).fetchall()
        cols = [d[0] for d in c.execute("SELECT * FROM auto_trade_log LIMIT 0").description or []]
    if not cols:
        cols = ['id','dt','action','stk_cd','stk_nm','price','qty','amount','profit','profit_rate','sell_reason','order_no','memo']
    return [dict(zip(cols, r)) for r in rows]


# ── 강제 매도 ─────────────────────────────────────────────

@router.post("/positions/{stk_cd}/sell")
async def force_sell_position(stk_cd: str):
    from backend.domains.kdaemon.auto_trader import get_current_price, get_positions, sell_stock

    with _conn() as conn:
        positions = get_positions(conn)
        pos = next((p for p in positions if p.stk_cd == stk_cd), None)
        if pos is None:
            raise HTTPException(404, detail=f"position not found: {stk_cd}")

        cur_price = await get_current_price(stk_cd)
        if cur_price is None:
            raise HTTPException(502, detail=f"현재가 조회 실패: {stk_cd}")

        daemon = KDaemon.get(config.DB_PATH, poll_interval_sec=60, dry_run=config.KDAEMON_DRY_RUN)
        dry_run = daemon.dry_run
        ok = await sell_stock(conn, pos, cur_price, reason='manual', dry_run=dry_run)
        if not ok:
            raise HTTPException(500, detail="매도 주문 실패")

    return {"ok": True, "stk_cd": stk_cd, "price": cur_price, "dry_run": dry_run}


@router.get("/positions/{stk_cd}/ticks")
def get_position_ticks(stk_cd: str, n: int = Query(default=10, le=50)):
    from backend.domains.kdaemon.auto_trader import get_recent_ticks
    with _conn() as conn:
        ticks = get_recent_ticks(conn, stk_cd, n)
    return [
        {
            'price': t.price,
            'volume_1min': t.volume_1min,
            'vol_power': t.vol_power,
            'orderbook_ratio': t.orderbook_ratio,
        }
        for t in ticks
    ]
