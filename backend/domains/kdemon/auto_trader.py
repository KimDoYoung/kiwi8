"""
kdaemon 자동매매 엔진 (도박2)

종목찾기 → 매수 → trailing stop 매도
증권사: 키움증권 전용
"""
import asyncio
import json
import sqlite3
from datetime import datetime

import websockets

from backend.core.logger import get_logger
from backend.domains.infrahub.current_pricer import CurrentPricer
from backend.domains.models.auto_trade_model import AutoTradePosition
from backend.utils.common_utils import parse_price

logger = get_logger(__name__)

_KRX = 'KRX'


# ─────────────────────────────────────────────────────────
# 설정 로드
# ─────────────────────────────────────────────────────────

def load_auto_trade_settings(conn: sqlite3.Connection) -> dict:
    """settings 테이블에서 auto_trade_* 키 전체 읽어 dict 반환"""
    cur = conn.cursor()
    cur.execute("SELECT name, value FROM settings WHERE name LIKE 'auto_trade_%'")
    rows = cur.fetchall()
    result = {row[0]: row[1] for row in rows}
    return {
        'stop_rate': float(result.get('auto_trade_stop_rate', '0.05')),
        'max_positions': int(result.get('auto_trade_max_positions', '3')),
        'condition_seq': result.get('auto_trade_condition_seq', ''),
    }


# ─────────────────────────────────────────────────────────
# 조회 — Kiwoom API
# ─────────────────────────────────────────────────────────

async def get_available_cash() -> int:
    """키움 kt00001(qry_tp=3) → 주문가능금액(예수금) 반환 (원)"""
    from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
    from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import KiwoomApiHelper, KiwoomRequest

    kiwoom = await get_kiwoom_api()
    req = KiwoomRequest(api_id='kt00001', payload={'qry_tp': '3'})
    resp = await kiwoom.send_request(req)
    if not resp.success:
        logger.error(f'kdaemon: 예수금 조회 실패: {resp.error_message}')
        return 0
    korea = KiwoomApiHelper.to_korea_data(resp.data, 'kt00001')
    cash = parse_price(korea.get('주문가능금액(예수금)', 0))
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
    conn: sqlite3.Connection, stk_cd: str, base_price: int, stop_price: int
) -> None:
    """base_price, stop_price, updated_at 갱신"""
    conn.execute(
        '''UPDATE auto_trade_position
           SET base_price=?, stop_price=?, updated_at=datetime('now','localtime')
           WHERE stk_cd=?''',
        (base_price, stop_price, stk_cd),
    )
    conn.commit()


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
    성공 시: insert_position(), log_action('BUY') 자동 호출
    """
    amount = price * qty
    if dry_run:
        order_no = f'DRY-{stk_cd}'
        logger.info(f'kdaemon: (DRY-RUN) BUY {stk_nm}({stk_cd}) {qty}주 @ {price:,}원 = {amount:,}원')
    else:
        from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
        from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import KiwoomApiHelper, KiwoomRequest

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
        logger.info(f'kdaemon: 매수 성공 {stk_nm}({stk_cd}) {qty}주 주문번호={order_no}')

    base_price, stop_price = calc_trailing_stop(price, price, stop_rate)
    pos = AutoTradePosition(
        stk_cd=stk_cd, stk_nm=stk_nm,
        buy_price=price, qty=qty, amount=amount,
        base_price=base_price, stop_price=stop_price,
        stop_rate=stop_rate,
    )
    insert_position(conn, pos)
    log_action(conn, 'BUY', stk_cd=stk_cd, stk_nm=stk_nm,
               price=price, qty=qty, amount=amount, order_no=order_no if not dry_run else None)
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
    profit = (cur_price - position.buy_price) * position.qty
    profit_rate = round((cur_price - position.buy_price) / position.buy_price * 100, 2) if position.buy_price > 0 else 0.0

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
    log_action(conn, 'SELL',
               stk_cd=position.stk_cd, stk_nm=position.stk_nm,
               price=cur_price, qty=position.qty, amount=cur_price * position.qty,
               profit=profit, profit_rate=profit_rate, sell_reason=reason)
    return True


# ─────────────────────────────────────────────────────────
# 로그
# ─────────────────────────────────────────────────────────

def log_action(conn: sqlite3.Connection, action: str, **kwargs) -> None:
    """auto_trade_log INSERT + logger kdaemon: prefix + ws broadcast"""
    fields = ['stk_cd', 'stk_nm', 'price', 'qty', 'amount',
              'profit', 'profit_rate', 'sell_reason', 'order_no', 'memo']
    values = {f: kwargs.get(f) for f in fields}
    conn.execute(
        '''INSERT INTO auto_trade_log
           (action, stk_cd, stk_nm, price, qty, amount, profit, profit_rate, sell_reason, order_no, memo)
           VALUES (:action, :stk_cd, :stk_nm, :price, :qty, :amount,
                   :profit, :profit_rate, :sell_reason, :order_no, :memo)''',
        {'action': action, **values},
    )
    conn.commit()
    logger.info(f'kdaemon: {action} {kwargs.get("stk_nm","")}'
                f'({kwargs.get("stk_cd","")}) {kwargs.get("memo","")}')

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
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(ws_manager.broadcast(msg))
        except Exception as e:
            logger.warning(f'kdaemon: ws broadcast 실패: {e}')


# ─────────────────────────────────────────────────────────
# 메인 사이클
# ─────────────────────────────────────────────────────────

async def run_auto_trade_cycle(
    conn: sqlite3.Connection,
    max_positions: int = 3,
    stop_rate: float = 0.05,
    condition_seq: str = '',
    dry_run: bool = True,
) -> None:
    """
    1. 현재 포지션 조회
    2. 각 포지션: 현재가 → trailing stop 갱신 → 매도 판단
    3. 빈 슬롯 있으면: 조건검색 → 예수금/빈슬롯수 = 종목당 예산 → 매수
    """
    logger.info(f'kdaemon: 사이클 시작 dry_run={dry_run}')

    # ── step1: 포지션 trailing stop 체크 ──
    positions = get_positions(conn)
    for pos in positions:
        cur_price = await get_current_price(pos.stk_cd)
        if cur_price is None:
            logger.warning(f'kdaemon: {pos.stk_cd} 현재가 조회 실패, skip')
            continue

        new_base, new_stop = calc_trailing_stop(pos.base_price, cur_price, pos.stop_rate)

        # base_price 올랐으면 DB 갱신
        if new_base > pos.base_price:
            update_position_trailing(conn, pos.stk_cd, new_base, new_stop)
            pos.base_price = new_base
            pos.stop_price = new_stop
            logger.info(f'kdaemon: {pos.stk_cd} base={new_base:,} stop={new_stop:,}')

        if should_sell(pos, cur_price):
            logger.info(f'kdaemon: {pos.stk_cd} trailing stop 발동 cur={cur_price:,} stop={pos.stop_price:,}')
            await sell_stock(conn, pos, cur_price, 'trailing_stop', dry_run=dry_run)

    # ── step2: 빈 슬롯 매수 ──
    positions = get_positions(conn)  # 매도 후 재조회
    empty_slots = max_positions - len(positions)
    if empty_slots <= 0:
        logger.info(f'kdaemon: 포지션 만석({len(positions)}/{max_positions}), 매수 skip')
        return

    if not condition_seq:
        logger.warning('kdaemon: auto_trade_condition_seq 미설정, 매수 skip')
        return

    candidates = await find_stocks_by_condition(condition_seq)
    # 이미 보유 중인 종목 제외
    held = {p.stk_cd for p in positions}
    candidates = [c for c in candidates if c not in held]

    if not candidates:
        logger.info('kdaemon: 조건검색 결과 없음')
        return

    cash = await get_available_cash()
    if cash <= 0:
        logger.warning('kdaemon: 사용가능 예수금 없음')
        return

    budget_per_stock = cash // empty_slots
    logger.info(f'kdaemon: 빈슬롯={empty_slots} 예수금={cash:,}원 종목당={budget_per_stock:,}원')

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

        # 종목명 조회 (조건검색 결과에 없으면 코드 그대로)
        stk_nm = stk_cd
        result = await buy_stock(conn, stk_cd, stk_nm, cur_price, qty,
                                 stop_rate=stop_rate, dry_run=dry_run)
        if result is not None or dry_run:
            bought += 1
            log_action(conn, 'FIND', stk_cd=stk_cd, stk_nm=stk_nm,
                       memo=f'조건식{condition_seq} 매수완료')

    logger.info(f'kdaemon: 사이클 완료 매수={bought}건')
