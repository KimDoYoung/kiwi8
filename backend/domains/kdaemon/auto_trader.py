"""
kdaemon 자동매매 엔진 (도박2)

종목찾기 → 매수 → trailing stop 매도
증권사: 키움증권 전용
"""
import asyncio
import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, time
from pathlib import Path

import websockets

from backend.core.logger import get_logger
from backend.domains.infrahub.current_pricer import CurrentPricer
from backend.domains.infrahub.tick_data import TickData
from backend.domains.models.auto_trade_model import AutoTradePosition
from backend.utils.common_utils import parse_price

logger = get_logger(__name__)

_KRX = 'KRX'


# ─────────────────────────────────────────────────────────
# 매수 전략
# ─────────────────────────────────────────────────────────

@dataclass
class BuyStrategy:
    id: int
    name: str
    broker: str
    condition_seq: str
    buy_start: time
    buy_end: time
    max_positions: int
    stop_rate: float
    is_active: int


def get_active_strategies(conn: sqlite3.Connection) -> list[BuyStrategy]:
    """auto_trade_buy_strategy WHERE is_active=1 조회"""
    cur = conn.cursor()
    cur.execute("SELECT * FROM auto_trade_buy_strategy WHERE is_active=1")
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    result = []
    for row in rows:
        d = dict(zip(cols, row))
        start_parts = d['buy_start'].split(':')
        end_parts = d['buy_end'].split(':')
        result.append(BuyStrategy(
            id=d['id'], name=d['name'], broker=d['broker'],
            condition_seq=d['condition_seq'],
            buy_start=time(int(start_parts[0]), int(start_parts[1])),
            buy_end=time(int(end_parts[0]), int(end_parts[1])),
            max_positions=d['max_positions'],
            stop_rate=d['stop_rate'],
            is_active=d['is_active'],
        ))
    return result


# ─────────────────────────────────────────────────────────
# 조회 — Kiwoom API
# ─────────────────────────────────────────────────────────

async def get_available_cash() -> int:
    """키움 kt00001(qry_tp=3) → 주문가능금액(예수금) 반환 (원)"""
    from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
    from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import (
        KiwoomApiHelper,
        KiwoomRequest,
    )

    kiwoom = await get_kiwoom_api()
    req = KiwoomRequest(api_id='kt00001', payload={'qry_tp': '3'})
    resp = await kiwoom.send_request(req)
    if not resp.success:
        logger.error(f'kdaemon: 예수금 조회 실패: {resp.error_message}')
        return 0
    korea = KiwoomApiHelper.to_korea_data(resp.data, 'kt00001')
    cash = parse_price(korea.get('d+2추정예수금', 0))
    logger.info(f'kdaemon: 주문가능금액 {cash:,}원')
    return cash


async def get_condition_list() -> list[dict]:
    """키움 WebSocket ka10171 → 조건식 목록 [{seq, name}, ...]"""
    from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_token_manager

    token_manager = await get_token_manager()
    token = await token_manager.get_token()
    uri = 'wss://api.kiwoom.com:10000/api/dostk/websocket'

    try:
        async with websockets.connect(uri) as ws:
            await ws.send(json.dumps({'trnm': 'LOGIN', 'token': token}))
            # 로그인 응답 대기
            for _ in range(5):
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                if msg.get('trnm') == 'LOGIN':
                    if msg.get('return_code') != 0:
                        logger.error(f'kdaemon: WS 로그인 실패: {msg.get("return_msg")}')
                        return []
                    break

            await ws.send(json.dumps({'trnm': 'CNSRLST'}))
            for _ in range(5):
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                if msg.get('trnm') == 'CNSRLST':
                    items = msg.get('data', [])
                    return [{'seq': it.get('seq'), 'name': it.get('name')} for it in items]
    except Exception as e:
        logger.error(f'kdaemon: 조건식 목록 조회 실패: {e}')
    return []


async def find_stocks_by_condition(seq: str) -> list[str]:
    """키움 WebSocket ka10172(seq) → 조건식 매칭 종목코드 리스트"""
    from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_token_manager

    token_manager = await get_token_manager()
    token = await token_manager.get_token()
    uri = 'wss://api.kiwoom.com:10000/api/dostk/websocket'

    codes: list[str] = []
    try:
        async with websockets.connect(uri) as ws:
            await ws.send(json.dumps({'trnm': 'LOGIN', 'token': token}))
            for _ in range(5):
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                if msg.get('trnm') == 'LOGIN':
                    if msg.get('return_code') != 0:
                        logger.error(f'kdaemon: WS 로그인 실패: {msg.get("return_msg")}')
                        return []
                    break

            req = {'trnm': 'CNSRREQ', 'seq': seq, 'search_type': '0', 'stex_tp': 'K'}
            await ws.send(json.dumps(req))

            # 응답 수신 (연속 조회 처리)
            next_key = ''
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                trnm = msg.get('trnm', '')
                if trnm == 'PING':
                    await ws.send(json.dumps(msg))
                    continue
                if trnm == 'CNSRREQ':
                    if msg.get('return_code') not in (0, '0'):
                        logger.error(f'kdaemon: 조건검색 실패: {msg.get("return_msg")}')
                        break
                    for item in msg.get('data', []):
                        code = str(item.get('9001', '')).strip()
                        if code:
                            codes.append(code)
                    if msg.get('cont_yn') == 'Y':
                        next_key = msg.get('next_key', '')
                        cont_req = {**req, 'cont_yn': 'Y', 'next_key': next_key}
                        await ws.send(json.dumps(cont_req))
                    else:
                        break
    except Exception as e:
        logger.error(f'kdaemon: 조건검색 실패 seq={seq}: {e}')

    logger.info(f'kdaemon: 조건검색 결과 {len(codes)}개 seq={seq}')
    return codes


async def get_current_price(stk_cd: str) -> int | None:
    """키움 현재가 조회 (CurrentPricer 재사용) → 정수, 실패 시 None"""
    price = await CurrentPricer.get().get_price1(stk_cd)
    return price if price > 0 else None


# ─────────────────────────────────────────────────────────
# 포지션 DB
# ─────────────────────────────────────────────────────────

def get_positions(conn: sqlite3.Connection) -> list[AutoTradePosition]:
    """auto_trade_position 전체 조회"""
    cur = conn.cursor()
    cur.execute('SELECT * FROM auto_trade_position')
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    result = []
    for row in rows:
        d = dict(zip(cols, row))
        result.append(AutoTradePosition(
            id=d['id'], stk_cd=d['stk_cd'], stk_nm=d['stk_nm'],
            buy_price=d['buy_price'], qty=d['qty'], amount=d['amount'],
            base_price=d['base_price'], stop_price=d['stop_price'],
            stop_rate=d['stop_rate'], bought_at=d['bought_at'], updated_at=d['updated_at'],
            max_volume_1min=d.get('max_volume_1min') or 0,
        ))
    return result


def insert_position(conn: sqlite3.Connection, pos: AutoTradePosition) -> None:
    """auto_trade_position INSERT + my_stock.is_auto_trade=1"""
    conn.execute(
        '''INSERT OR REPLACE INTO auto_trade_position
           (stk_cd, stk_nm, buy_price, qty, amount, base_price, stop_price, stop_rate)
           VALUES (?,?,?,?,?,?,?,?)''',
        (pos.stk_cd, pos.stk_nm, pos.buy_price, pos.qty, pos.amount,
         pos.base_price, pos.stop_price, pos.stop_rate),
    )
    conn.execute(
        "INSERT OR IGNORE INTO my_stock (stk_cd, stk_nm, is_auto_trade) VALUES (?,?,1)",
        (pos.stk_cd, pos.stk_nm),
    )
    conn.execute(
        "UPDATE my_stock SET is_auto_trade=1 WHERE stk_cd=?", (pos.stk_cd,)
    )
    conn.commit()


def delete_position(conn: sqlite3.Connection, stk_cd: str) -> None:
    """auto_trade_position DELETE + my_stock.is_auto_trade=0"""
    conn.execute('DELETE FROM auto_trade_position WHERE stk_cd=?', (stk_cd,))
    conn.execute('UPDATE my_stock SET is_auto_trade=0 WHERE stk_cd=?', (stk_cd,))
    conn.commit()


def update_position_trailing(
    conn: sqlite3.Connection, stk_cd: str, base_price: int, stop_price: int, cur_price: int | None = None
) -> None:
    """base_price, stop_price, cur_price, updated_at 갱신"""
    conn.execute(
        '''UPDATE auto_trade_position
           SET base_price=?, stop_price=?, cur_price=?, updated_at=datetime('now','localtime')
           WHERE stk_cd=?''',
        (base_price, stop_price, cur_price, stk_cd),
    )
    conn.commit()


def update_position_cur_price(conn: sqlite3.Connection, stk_cd: str, cur_price: int) -> None:
    """현재가만 갱신 (매 모니터링 사이클)"""
    conn.execute(
        "UPDATE auto_trade_position SET cur_price=?, updated_at=datetime('now','localtime') WHERE stk_cd=?",
        (cur_price, stk_cd),
    )
    conn.commit()


# ─────────────────────────────────────────────────────────
# Tick 데이터 DB
# ─────────────────────────────────────────────────────────

def insert_price_tick(conn: sqlite3.Connection, stk_cd: str, tick: TickData) -> None:
    conn.execute(
        '''INSERT INTO auto_trade_price_tick
           (stk_cd, price, volume_1min, vol_power, orderbook_ratio)
           VALUES (?,?,?,?,?)''',
        (stk_cd, tick.price, tick.volume_1min, tick.vol_power, tick.orderbook_ratio),
    )


def get_recent_ticks(conn: sqlite3.Connection, stk_cd: str, n: int = 5) -> list[TickData]:
    """최근 n개 tick을 시간 오름차순(오래된 것 먼저)으로 반환"""
    cur = conn.cursor()
    cur.execute(
        '''SELECT price, volume_1min, vol_power, orderbook_ratio
           FROM auto_trade_price_tick
           WHERE stk_cd=?
           ORDER BY recorded_at DESC
           LIMIT ?''',
        (stk_cd, n),
    )
    rows = cur.fetchall()
    return [
        TickData(price=r[0], volume_1min=r[1], vol_power=r[2], orderbook_ratio=r[3])
        for r in reversed(rows)
    ]


def update_position_max_volume(conn: sqlite3.Connection, stk_cd: str, vol: int) -> None:
    conn.execute(
        'UPDATE auto_trade_position SET max_volume_1min=? WHERE stk_cd=?',
        (vol, stk_cd),
    )


def cleanup_old_ticks(conn: sqlite3.Connection, keep_hours: int = 8) -> None:
    conn.execute(
        "DELETE FROM auto_trade_price_tick WHERE recorded_at < datetime('now','localtime',?)",
        (f'-{keep_hours} hours',),
    )


_SELL_REASON_KR: dict[str, str] = {
    'signal_a': '호가창 매도압력 추세 매도',
    'signal_b': '체결강도 붕괴 추세 매도',
    'signal_c': '고점 거래량 소멸 매도',
    'trend_reversal': '수익권 추적 손절',
    'trailing_stop': '추적 손절',
    'stop_loss': '손절',
    'manual': '수동 매도',
}


def analyze_trend_signal(ticks: list[TickData], pos: AutoTradePosition) -> str | None:
    """복합 신호 기반 추세 반전 감지. 수익권에서만 호출할 것."""
    if len(ticks) < 3:
        return None

    cur   = ticks[-1]
    prev  = ticks[-2]
    prev2 = ticks[-3]
    highest = pos.base_price
    max_vol = pos.max_volume_1min or 0

    if cur.price <= highest * (1 - pos.stop_rate):
        return 'trend_reversal'

    # [Signal A] 호가창 매도압력 3틱 연속 증가 + cur >= 1.5 (강한 매도압력) + 가격 정체
    if (cur.orderbook_ratio is not None
            and prev.orderbook_ratio is not None
            and prev2.orderbook_ratio is not None
            and cur.orderbook_ratio > prev.orderbook_ratio > prev2.orderbook_ratio
            and cur.orderbook_ratio >= 1.5
            and cur.price <= prev.price):
        return 'signal_a'

    # [Signal B] 체결강도 3틱 연속 감소 + 전체 5p 이상 하락 + 마지막 틱 3p 이상 하락 + 고점권
    if (cur.vol_power is not None
            and prev.vol_power is not None
            and prev2.vol_power is not None
            and cur.vol_power < prev.vol_power < prev2.vol_power
            and (prev2.vol_power - cur.vol_power) >= 5.0
            and (prev.vol_power - cur.vol_power) >= 3.0
            and cur.price >= highest * 0.97):
        return 'signal_b'

    # [Signal C] 연속 2틱 저거래량 — 일시적 감소 오발동 방지
    if (cur.volume_1min is not None
            and prev.volume_1min is not None
            and max_vol > 0
            and cur.price >= highest * 0.98
            and cur.volume_1min < max_vol * 0.20
            and prev.volume_1min < max_vol * 0.20):
        return 'signal_c'

    return None


# ─────────────────────────────────────────────────────────
# Trailing Stop 계산 (순수함수)
# ─────────────────────────────────────────────────────────

def calc_trailing_stop(
    base_price: int, cur_price: int, stop_rate: float
) -> tuple[int, int]:
    """
    반환: (new_base_price, new_stop_price)
    new_base = max(base_price, cur_price)   ← 오를 때만 갱신
    new_stop = int(new_base * (1 - stop_rate))
    """
    new_base = max(base_price, cur_price)
    new_stop = int(new_base * (1 - stop_rate))
    return new_base, new_stop


def should_sell(position: AutoTradePosition, cur_price: int) -> bool:
    """cur_price < stop_price → True"""
    return cur_price < position.stop_price


# ─────────────────────────────────────────────────────────
# 주문
# ─────────────────────────────────────────────────────────

async def _fetch_actual_fill(kiwoom, order_no: str, stk_cd: str, expected_qty: int) -> tuple[int, int]:
    """
    kt00007로 실제 체결수량·체결단가 조회 (최대 2회 시도, 1초 간격)
    반환: (체결수량합계, 가중평균단가) — 조회 실패 시 (expected_qty, 0)
    """
    from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import (
        KiwoomApiHelper,
        KiwoomRequest,
    )

    for attempt in range(2):
        await asyncio.sleep(1)
        req = KiwoomRequest(
            api_id='kt00007',
            payload={
                'qry_tp': '4',       # 체결내역만
                'stk_bond_tp': '1',  # 주식
                'sell_tp': '2',      # 매수
                'stk_cd': stk_cd,
                'fr_ord_no': order_no,
                'dmst_stex_tp': _KRX,
            },
        )
        resp = await kiwoom.send_request(req)
        if not resp.success:
            logger.warning(f'kdaemon: kt00007 조회 실패 시도{attempt+1}: {resp.error_message}')
            continue

        korea = KiwoomApiHelper.to_korea_data(resp.data, 'kt00007')
        items = korea.get('계좌별주문체결내역상세', [])

        total_qty = 0
        total_amount = 0
        for item in items:
            if str(item.get('주문번호', '')).strip() != str(order_no).strip():
                continue
            fill_qty = int(item.get('체결수량', 0) or 0)
            fill_price = int(item.get('체결단가', 0) or 0)
            total_qty += fill_qty
            total_amount += fill_qty * fill_price

        if total_qty > 0:
            avg_price = total_amount // total_qty
            logger.info(f'kdaemon: kt00007 체결확인 ord={order_no} qty={total_qty} avg={avg_price:,}원')
            return total_qty, avg_price

        if attempt == 0:
            logger.info(f'kdaemon: kt00007 체결 미확인, 1초 후 재시도 ord={order_no}')

    logger.warning(f'kdaemon: kt00007 체결 확인 실패 → 주문수량 {expected_qty}주로 fallback')
    return expected_qty, 0


async def buy_stock(
    conn: sqlite3.Connection,
    stk_cd: str,
    stk_nm: str,
    price: int,
    qty: int,
    stop_rate: float = 0.05,
    dry_run: bool = True,
) -> str | None:
    """
    kt10000 시장가 매수주문 → order_no 반환 (실패/dry_run 시 None)
    실전: kt00007로 실제 체결수량·단가 확인 후 position 기록
    성공 시: insert_position(), log_action('BUY') 자동 호출
    """
    if dry_run:
        amount = price * qty
        order_no = f'DRY-{stk_cd}'
        logger.info(f'kdaemon: (DRY-RUN) BUY {stk_nm}({stk_cd}) {qty}주 @ {price:,}원 = {amount:,}원')
        actual_qty, actual_price = qty, price
    else:
        from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
        from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import (
            KiwoomApiHelper,
            KiwoomRequest,
        )

        kiwoom = await get_kiwoom_api()
        req = KiwoomRequest(
            api_id='kt10000',
            payload={
                'dmst_stex_tp': _KRX,
                'stk_cd': stk_cd,
                'ord_qty': str(qty),
                'ord_uv': '0',
                'trde_tp': '3',  # 시장가
            },
        )
        resp = await kiwoom.send_request(req)
        if not resp.success:
            logger.error(f'kdaemon: 매수 실패 {stk_cd}: {resp.error_message}')
            log_action(conn, 'ERROR', stk_cd=stk_cd, stk_nm=stk_nm, memo=f'매수실패:{resp.error_message}')
            return None

        korea = KiwoomApiHelper.to_korea_data(resp.data, 'kt10000')
        order_no = korea.get('주문번호', '')
        logger.info(f'kdaemon: 매수주문 접수 {stk_nm}({stk_cd}) {qty}주 주문번호={order_no}')

        # 실제 체결수량·단가 확인 (부분체결 대응)
        actual_qty, fill_price = await _fetch_actual_fill(kiwoom, order_no, stk_cd, qty)
        actual_price = fill_price if fill_price > 0 else price

        if actual_qty == 0:
            logger.error(f'kdaemon: {stk_nm}({stk_cd}) 체결 0주 — position 미기록')
            log_action(conn, 'ERROR', stk_cd=stk_cd, stk_nm=stk_nm, memo=f'체결수량 0 ord={order_no}')
            return None

        if actual_qty < qty:
            logger.warning(f'kdaemon: {stk_nm}({stk_cd}) 부분체결 {actual_qty}/{qty}주 @ {actual_price:,}원')
        else:
            logger.info(f'kdaemon: 매수 체결 확정 {stk_nm}({stk_cd}) {actual_qty}주 @ {actual_price:,}원')

        amount = actual_price * actual_qty

    amount = actual_price * actual_qty
    base_price, stop_price = calc_trailing_stop(actual_price, actual_price, stop_rate)
    pos = AutoTradePosition(
        stk_cd=stk_cd, stk_nm=stk_nm,
        buy_price=actual_price, qty=actual_qty, amount=amount,
        base_price=base_price, stop_price=stop_price,
        stop_rate=stop_rate,
    )
    insert_position(conn, pos)
    try:
        deposit = await get_available_cash()
    except Exception:
        deposit = None
    log_action(conn, 'BUY', stk_cd=stk_cd, stk_nm=stk_nm,
               price=actual_price, qty=actual_qty, amount=amount,
               order_no=order_no if not dry_run else None,
               deposit=deposit or None)
    return order_no if not dry_run else None


async def sell_stock(
    conn: sqlite3.Connection,
    position: AutoTradePosition,
    cur_price: int,
    reason: str,
    dry_run: bool = True,
) -> bool:
    """
    kt10001 시장가 매도주문 → 성공 여부
    성공 시: delete_position(), log_action('SELL') 자동 호출
    reason: 'trailing_stop' | 'stop_loss' | 'manual'
    """
    from backend.core.config import config as _cfg
    sell_amount = cur_price * position.qty
    buy_cost = int(position.buy_price * position.qty * (1 + _cfg.BUY_FEE_RATE))
    sell_fee = int(sell_amount * _cfg.SELL_FEE_RATE)
    profit = sell_amount - buy_cost - sell_fee
    profit_rate = round(profit / buy_cost * 100, 2) if buy_cost > 0 else 0.0

    if dry_run:
        logger.info(
            f'kdaemon: (DRY-RUN) SELL {position.stk_nm}({position.stk_cd}) '
            f'{position.qty}주 @ {cur_price:,}원 손익={profit:,}원({profit_rate}%) reason={reason}'
        )
    else:
        from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
        from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import KiwoomRequest

        kiwoom = await get_kiwoom_api()
        req = KiwoomRequest(
            api_id='kt10001',
            payload={
                'dmst_stex_tp': _KRX,
                'stk_cd': position.stk_cd,
                'ord_qty': str(position.qty),
                'ord_uv': '0',
                'trde_tp': '3',  # 시장가
            },
        )
        resp = await kiwoom.send_request(req)
        if not resp.success:
            logger.error(f'kdaemon: 매도 실패 {position.stk_cd}: {resp.error_message}')
            log_action(conn, 'ERROR', stk_cd=position.stk_cd, stk_nm=position.stk_nm,
                       memo=f'매도실패:{resp.error_message}')
            return False
        logger.info(f'kdaemon: 매도 성공 {position.stk_nm}({position.stk_cd}) reason={reason}')

    delete_position(conn, position.stk_cd)
    try:
        deposit = await get_available_cash()
    except Exception:
        deposit = None
    reason_kr = _SELL_REASON_KR.get(reason, reason)
    log_action(conn, 'SELL',
               stk_cd=position.stk_cd, stk_nm=position.stk_nm,
               price=cur_price, qty=position.qty, amount=cur_price * position.qty,
               profit=profit, profit_rate=profit_rate, sell_reason=reason,
               memo=reason_kr,
               deposit=deposit or None)
    return True


# ─────────────────────────────────────────────────────────
# 로그
# ─────────────────────────────────────────────────────────

def log_action(conn: sqlite3.Connection, action: str, **kwargs) -> None:
    """auto_trade_log INSERT + logger kdaemon: prefix + ws broadcast"""
    fields = ['stk_cd', 'stk_nm', 'price', 'qty', 'amount',
              'profit', 'profit_rate', 'sell_reason', 'order_no', 'memo', 'deposit']
    values = {f: kwargs.get(f) for f in fields}
    conn.execute(
        '''INSERT INTO auto_trade_log
           (action, stk_cd, stk_nm, price, qty, amount, profit, profit_rate, sell_reason, order_no, memo, deposit)
           VALUES (:action, :stk_cd, :stk_nm, :price, :qty, :amount,
                   :profit, :profit_rate, :sell_reason, :order_no, :memo, :deposit)''',
        {'action': action, **values},
    )
    conn.commit()
    deposit_str = f' 예수금={values["deposit"]:,}원' if values.get("deposit") else ''
    logger.info(f'kdaemon: {action} {kwargs.get("stk_nm","")}'
                f'({kwargs.get("stk_cd","")}) {kwargs.get("memo","")}{deposit_str}')

    # BUY/SELL/ERROR 는 WebSocket으로 브라우저에 실시간 전송
    if action in ('BUY', 'SELL', 'ERROR', 'FIND'):
        import asyncio

        from backend.domains.infrahub.ws_manager import ws_manager
        msg = {
            'broker': 'kdaemon',
            'type': 'kdaemon_event',
            'data': {
                'action': action,
                'dt': datetime.now().strftime('%H:%M:%S'),
                **{k: v for k, v in values.items() if v is not None},
            },
        }
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(ws_manager.broadcast(msg))
            logger.debug(f'kdaemon: ws broadcast scheduled {action}')
        except RuntimeError:
            pass  # 이벤트 루프 없는 컨텍스트 (테스트 등)
        except Exception as e:
            logger.warning(f'kdaemon: ws broadcast 실패: {e}')


# ─────────────────────────────────────────────────────────
# 직접 지정 종목 매수 (auto_trade.data 파일 기반)
# ─────────────────────────────────────────────────────────

async def process_manual_stocks(
    conn: sqlite3.Connection,
    data_file: str,
    stop_rate: float = 0.05,
    dry_run: bool = True,
) -> None:
    """
    auto_trade.data 파일 → 한 줄씩 종목코드 → 매수 → 성공 시 해당 줄 제거
    예수금 부족 / 현재가 조회 실패 종목은 파일에 유지
    """
    path = Path(data_file)
    if not path.exists():
        return

    lines = [l.strip() for l in path.read_text().splitlines() if l.strip()]
    if not lines:
        return

    logger.info(f'kdaemon: 직접지정 종목 {len(lines)}개 처리 시작')
    positions = get_positions(conn)
    held = {p.stk_cd for p in positions}
    remaining = []
    cash = await get_available_cash()

    for stk_cd in lines:
        if stk_cd in held:
            logger.info(f'kdaemon: {stk_cd} 이미 보유중 — 큐에서 제거')
            continue

        if cash <= 0:
            logger.warning(f'kdaemon: 직접지정 {stk_cd} 예수금 없음 — 큐 유지')
            remaining.append(stk_cd)
            continue

        cur_price = await get_current_price(stk_cd)
        if not cur_price:
            logger.warning(f'kdaemon: {stk_cd} 현재가 조회 실패 — 큐 유지')
            remaining.append(stk_cd)
            continue

        qty = cash // cur_price
        if qty <= 0:
            logger.warning(f'kdaemon: {stk_cd} 예산 부족 price={cur_price:,} cash={cash:,} — 큐 유지')
            remaining.append(stk_cd)
            continue

        result = await buy_stock(conn, stk_cd, stk_cd, cur_price, qty,
                                 stop_rate=stop_rate, dry_run=dry_run)
        if result is not None or dry_run:
            held.add(stk_cd)
            cash -= cur_price * qty
        else:
            remaining.append(stk_cd)

    path.write_text('\n'.join(remaining))
    logger.info(f'kdaemon: 직접지정 처리 완료, 남은 큐={len(remaining)}개')


# ─────────────────────────────────────────────────────────
# 메인 사이클
# ─────────────────────────────────────────────────────────

async def run_auto_trade_cycle(conn: sqlite3.Connection, dry_run: bool = True) -> None:
    """
    자동매매 사이클:
    0. 직접지정 종목 매수 (auto_trade.data)
    1. trailing stop 체크 → 매도 (항상)
    2. 활성 전략별: 현재 시각이 buy_start~buy_end 범위면 → 조건검색 → 매수
    """
    from backend.core.config import config
    now_t = datetime.now().time()

    # ── step0: 직접지정 종목 매수 (우선) ──
    data_file = str(Path(config.BASE_DIR) / 'db' / 'auto_trade.data')
    await process_manual_stocks(conn, data_file, dry_run=dry_run)

    # ── step1: 포지션 trailing stop 체크 (항상 실행) ──
    positions = get_positions(conn)
    for pos in positions:
        cur_price = await get_current_price(pos.stk_cd)
        if cur_price is None:
            logger.warning(f'kdaemon: {pos.stk_cd} 현재가 조회 실패, skip')
            continue

        new_base, new_stop = calc_trailing_stop(pos.base_price, cur_price, pos.stop_rate)
        if new_base > pos.base_price:
            update_position_trailing(conn, pos.stk_cd, new_base, new_stop, cur_price)
            pos.base_price = new_base
            pos.stop_price = new_stop
            logger.info(f'kdaemon: {pos.stk_cd} base={new_base:,} stop={new_stop:,}')
        else:
            update_position_trailing(conn, pos.stk_cd, pos.base_price, pos.stop_price, cur_price)

        if should_sell(pos, cur_price):
            logger.info(f'kdaemon: {pos.stk_cd} trailing stop 발동 cur={cur_price:,} stop={pos.stop_price:,}')
            await sell_stock(conn, pos, cur_price, 'trailing_stop', dry_run=dry_run)

    # ── step2: 전략별 매수 (시간 조건 체크) ──
    strategies = get_active_strategies(conn)
    if not strategies:
        return

    positions = get_positions(conn)  # 매도 후 재조회
    held = {p.stk_cd for p in positions}

    for strategy in strategies:
        if not (strategy.buy_start <= now_t <= strategy.buy_end):
            continue  # 매수 허용 시간 아님

        empty_slots = strategy.max_positions - len(positions)
        if empty_slots <= 0:
            logger.info(f'kdaemon: [{strategy.name}] 포지션 만석 ({len(positions)}/{strategy.max_positions})')
            continue

        if not strategy.condition_seq:
            logger.warning(f'kdaemon: [{strategy.name}] condition_seq 미설정, skip')
            continue

        candidates = await find_stocks_by_condition(strategy.condition_seq)
        candidates = [c for c in candidates if c not in held]

        if not candidates:
            logger.info(f'kdaemon: [{strategy.name}] 조건검색 결과 없음')
            continue

        cash = await get_available_cash()
        if cash <= 0:
            logger.warning(f'kdaemon: [{strategy.name}] 예수금 없음')
            continue

        budget_per_stock = cash // empty_slots
        logger.info(f'kdaemon: [{strategy.name}] 빈슬롯={empty_slots} 예수금={cash:,}원 종목당={budget_per_stock:,}원')

        bought = 0
        for stk_cd in candidates:
            if bought >= empty_slots:
                break
            cur_price = await get_current_price(stk_cd)
            if not cur_price or cur_price <= 0:
                continue
            qty = budget_per_stock // cur_price
            if qty <= 0:
                logger.warning(f'kdaemon: {stk_cd} 예산 부족 price={cur_price:,} budget={budget_per_stock:,}')
                continue
            result = await buy_stock(conn, stk_cd, stk_cd, cur_price, qty,
                                     stop_rate=strategy.stop_rate, dry_run=dry_run)
            if result is not None or dry_run:
                bought += 1
                held.add(stk_cd)

        logger.info(f'kdaemon: [{strategy.name}] 매수={bought}건')
