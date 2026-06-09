from __future__ import annotations

from dataclasses import dataclass


@dataclass
class TickData:
    price: int
    volume_1min: int | None = None     # 1분간 거래량 (누적거래량 diff)
    vol_power: float | None = None     # 체결강도 % (chdegree) — LS 정규장만
    orderbook_ratio: float | None = None  # 총매도잔량/총매수잔량 — LS 정규장만
