from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel

AutoTradeAction = Literal['BUY', 'SELL', 'FIND', 'ERROR']
SellReason = Literal['trailing_stop', 'stop_loss', 'manual']


@dataclass
class AutoTradePosition:
    """kdaemon 자동매매 현재 포지션 + trailing stop 상태

    SQL 테이블: auto_trade_position
    """
    stk_cd: str
    stk_nm: str
    buy_price: int
    qty: int
    amount: int
    base_price: int       # trailing stop 기준가 (상승 시 업데이트)
    stop_price: int       # 매도 트리거가 = base_price * (1 - stop_rate)
    stop_rate: float = 0.05
    id: int | None = None
    bought_at: str | None = None
    updated_at: str | None = None


@dataclass
class AutoTradeLog:
    """kdaemon 매수/매도/종목발견 이력

    SQL 테이블: auto_trade_log
    """
    action: AutoTradeAction
    stk_cd: str | None = None
    stk_nm: str | None = None
    price: int | None = None
    qty: int | None = None
    amount: int | None = None
    profit: int | None = None
    profit_rate: float | None = None
    sell_reason: SellReason | None = None
    order_no: str | None = None
    memo: str | None = None
    id: int | None = None
    dt: str | None = None


class AutoTradePositionResponse(BaseModel):
    id: int
    stk_cd: str
    stk_nm: str
    buy_price: int
    qty: int
    amount: int
    base_price: int
    stop_price: int
    stop_rate: float
    bought_at: str | None = None
    updated_at: str | None = None


class AutoTradeLogResponse(BaseModel):
    id: int
    dt: str | None = None
    action: str
    stk_cd: str | None = None
    stk_nm: str | None = None
    price: int | None = None
    qty: int | None = None
    amount: int | None = None
    profit: int | None = None
    profit_rate: float | None = None
    sell_reason: str | None = None
    order_no: str | None = None
    memo: str | None = None
