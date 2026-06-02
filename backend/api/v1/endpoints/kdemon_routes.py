
import json
import sqlite3

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.kdemon.k_demon import KDemon, now_ymdhms

# APIRouter 인스턴스 생성
router = APIRouter()
logger = get_logger(__name__)

class CommandBody(BaseModel):
    cmd: str  # 'start' | 'stop' | 'refresh'
    args: dict | None = None

def _conn():
    DB_PATH = config.DB_PATH
    return sqlite3.connect(DB_PATH, check_same_thread=False)

@router.post("/command")
async def send_command(body: CommandBody):
    cmd = body.cmd.lower()
    if cmd not in {"start", "stop", "refresh"}:
        raise HTTPException(400, detail="invalid cmd")

    # (옵션) 명령을 테이블에 적재
    with _conn() as c:
        c.execute("""
            INSERT INTO kdemon_commands (cmd, args_json, created_at)
            VALUES (?, ?, ?)
        """, (cmd, (body.args and json.dumps(body.args)) or None, now_ymdhms()))
        c.commit()

    demon = KDemon.get(config.DB_PATH, poll_interval_sec=5, dry_run=config.KDEMON_DRY_RUN)
    if cmd == "start":
        await demon.start()
    elif cmd == "stop":
        await demon.stop()
    elif cmd == "refresh":
        await demon.refresh()

    return {"ok": True, "cmd": cmd}

@router.get("/status")
def status():
    with _conn() as c:
        row = c.execute("SELECT status, updated_at FROM kdemon_state WHERE id=1").fetchone()
        cur = c.execute("SELECT COUNT(*) FROM kdemon_rules WHERE status='active'").fetchone()
    return {
        "status": row[0] if row else "unknown",
        "updated_at": row[1] if row else None,
        "active_rules": cur[0] if cur else 0
    }

@router.get("/conditions")
async def get_conditions():
    """키움 조건식 목록 조회 (ka10171 WebSocket)"""
    from backend.domains.kdemon.auto_trader import get_condition_list
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
