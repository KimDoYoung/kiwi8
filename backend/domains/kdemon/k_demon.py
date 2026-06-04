import asyncio
import sqlite3
from datetime import datetime
from pathlib import Path

from backend.core.config import config
from backend.core.logger import get_logger

logger = get_logger(__name__)

MAX_POSITIONS = 3


def now_ymdhms() -> str:
    return datetime.now().strftime("%Y%m%d%H%M%S")


def _get_stop_rate(conn: sqlite3.Connection) -> float:
    """활성 전략 첫 번째의 stop_rate, 없으면 0.05"""
    try:
        cur = conn.cursor()
        cur.execute("SELECT stop_rate FROM auto_trade_buy_strategy WHERE is_active=1 LIMIT 1")
        row = cur.fetchone()
        if row:
            return float(row[0])
    except Exception:
        pass
    return 0.05


class KDemon:
    """
    자동매매 데몬
    - start(): auto_trade_position 확인 → 부족분 auto_trade.data에서 매수
    - _run(): 60초 간격 trailing stop 모니터링
    - stop(): 루프 종료
    dry_run=True 이면 실제 주문 없이 log + WS로만 동작 (시뮬레이션)
    """
    _instance: "KDemon|None" = None

    def __init__(self, db_path: str, poll_interval_sec: int = 60, dry_run: bool = True):
        self.db_path = db_path
        self.poll_interval_sec = poll_interval_sec
        self.dry_run = dry_run
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row

    @classmethod
    def get(cls, db_path: str, poll_interval_sec: int = 60, dry_run: bool = True) -> "KDemon":
        if cls._instance is None:
            cls._instance = KDemon(db_path, poll_interval_sec, dry_run)
        return cls._instance

    # ── DB ─────────────────────────────────────────────

    def _set_state(self, status: str):
        self._conn.execute(
            "UPDATE kdemon_state SET status=?, updated_at=? WHERE id=1",
            (status, now_ymdhms())
        )
        self._conn.commit()

    # ── WebSocket ───────────────────────────────────────

    async def _broadcast_state(self, action: str, memo: str):
        try:
            from backend.domains.infrahub.ws_manager import ws_manager
            clients = len(ws_manager._browser_clients)
            logger.info(f'kdaemon: broadcast {action} → {clients}개 클라이언트')
            await ws_manager.broadcast({
                'broker': 'kdaemon',
                'type': 'kdaemon_event',
                'data': {
                    'action': action,
                    'dt': datetime.now().strftime('%H:%M:%S'),
                    'memo': memo,
                },
            })
        except Exception as e:
            logger.warning(f'kdaemon: broadcast 실패: {e}')

    # ── 초기 매수 ───────────────────────────────────────

    async def _initial_buy(self, existing: list) -> None:
        """
        auto_trade.data에서 부족분 읽기 → 매수 (dry_run)
        읽은 종목은 파일에서 삭제
        """
        from backend.domains.kdemon.auto_trader import (
            get_available_cash, get_current_price, buy_stock, log_action,
        )

        empty_slots = MAX_POSITIONS - len(existing)
        held = {p.stk_cd for p in existing}

        data_path = Path(config.BASE_DIR) / 'db' / 'auto_trade.data'
        if not data_path.exists():
            logger.info('kdaemon: auto_trade.data 없음, 신규 매수 없음')
            log_action(self._conn, 'FIND', memo='auto_trade.data 없음')
            return

        lines = [l.strip() for l in data_path.read_text().splitlines() if l.strip()]
        to_buy = [c for c in lines if c not in held][:empty_slots]
        remaining = [c for c in lines if c not in to_buy]
        data_path.write_text('\n'.join(remaining))

        if not to_buy:
            logger.info('kdaemon: 매수할 신규 종목 없음')
            log_action(self._conn, 'FIND', memo=f'매수 종목 없음 (파일 비어있음 or 이미 보유)')
            return

        stop_rate = _get_stop_rate(self._conn)
        if self.dry_run:
            cash = 30_000_000
            logger.info(f'kdaemon: (DRY-RUN) 시뮬 예수금 {cash:,}원 사용')
            log_action(self._conn, 'FIND', memo=f'(DRY-RUN) 시뮬 예수금 {cash:,}원')
        else:
            cash = await get_available_cash()
            if cash <= 0:
                logger.error('kdaemon: 예수금 조회 실패 또는 잔액 없음')
                log_action(self._conn, 'ERROR', memo='예수금 조회 실패 또는 잔액 없음')
                return
        budget_per = cash // len(to_buy)
        logger.info(f'kdaemon: 신규 매수 {len(to_buy)}종목 예수금={cash:,}원 종목당={budget_per:,}원')
        log_action(self._conn, 'FIND', memo=f'매수 대상 {len(to_buy)}종목 예수금={cash:,}원 종목당={budget_per:,}원')

        for stk_cd in to_buy:
            cur_price = await get_current_price(stk_cd)
            if not cur_price:
                if self.dry_run:
                    cur_price = 50_000
                    logger.info(f'kdaemon: (DRY-RUN) {stk_cd} 현재가 조회 실패 → 시뮬 가격 {cur_price:,}원 사용')
                else:
                    logger.warning(f'kdaemon: {stk_cd} 현재가 조회 실패, skip')
                    log_action(self._conn, 'ERROR', stk_cd=stk_cd, memo='현재가 조회 실패')
                    continue
            qty = budget_per // cur_price
            if qty <= 0:
                logger.warning(f'kdaemon: {stk_cd} 예산 부족 price={cur_price:,} budget={budget_per:,}')
                log_action(self._conn, 'ERROR', stk_cd=stk_cd, memo=f'예산 부족 price={cur_price:,}')
                continue
            await buy_stock(self._conn, stk_cd, stk_cd, cur_price, qty,
                            stop_rate=stop_rate, dry_run=self.dry_run)

    # ── 제어 ───────────────────────────────────────────

    async def start(self):
        if self._task and not self._task.done():
            logger.info('kdaemon: already running')
            return

        self._stop_event.clear()
        self._set_state('running')

        from backend.domains.kdemon.auto_trader import get_positions
        positions = get_positions(self._conn)

        if len(positions) < MAX_POSITIONS:
            await self._initial_buy(existing=positions)
            positions = get_positions(self._conn)

        memo = f'포지션 {len(positions)}개 모니터링 시작'
        logger.info(f'kdaemon: {memo}')
        await self._broadcast_state('START', memo)

        self._task = asyncio.create_task(self._run())

    async def stop(self):
        self._stop_event.set()
        if self._task and not self._task.done():
            try:
                # stop_event 덕분에 _run()이 즉시 루프 탈출 → finally에서 STOP broadcast
                # shield: timeout 시에도 task 자체는 cancel 안 함
                await asyncio.wait_for(asyncio.shield(self._task), timeout=3)
            except asyncio.TimeoutError:
                # 3초 안에 못 끝나면 강제 cancel
                self._task.cancel()
                try:
                    await self._task
                except (asyncio.CancelledError, Exception):
                    pass
        self._task = None

    async def refresh(self):
        logger.info('kdaemon: refresh — 다음 사이클에서 포지션 재조회')

    # ── 모니터링 루프 ───────────────────────────────────

    async def _run(self):
        from backend.domains.kdemon.auto_trader import (
            get_positions, get_current_price,
            calc_trailing_stop, update_position_trailing,
            should_sell, sell_stock, log_action,
        )
        try:
            while not self._stop_event.is_set():
                positions = get_positions(self._conn)
                logger.info(f'kdaemon: 모니터링 사이클 — 포지션 {len(positions)}개')
                for pos in positions:
                    cur_price = await get_current_price(pos.stk_cd)
                    if cur_price is None:
                        logger.warning(f'kdaemon: {pos.stk_cd} 현재가 없음, skip')
                        log_action(self._conn, 'ERROR', stk_cd=pos.stk_cd, memo='현재가 조회 실패')
                        continue

                    new_base, new_stop = calc_trailing_stop(
                        pos.base_price, cur_price, pos.stop_rate
                    )
                    if new_base > pos.base_price:
                        update_position_trailing(self._conn, pos.stk_cd, new_base, new_stop)
                        pos.base_price = new_base
                        pos.stop_price = new_stop
                        logger.info(f'kdaemon: {pos.stk_cd} base={new_base:,} stop={new_stop:,}')

                    if should_sell(pos, cur_price):
                        logger.info(
                            f'kdaemon: {pos.stk_cd} trailing stop 발동 '
                            f'cur={cur_price:,} stop={pos.stop_price:,}'
                        )
                        await sell_stock(self._conn, pos, cur_price,
                                         'trailing_stop', dry_run=self.dry_run)

                # stop_event 대기 — set되면 즉시 루프 탈출
                try:
                    await asyncio.wait_for(
                        self._stop_event.wait(), timeout=self.poll_interval_sec
                    )
                    break
                except asyncio.TimeoutError:
                    pass  # 정상 주기, 계속

        except asyncio.CancelledError:
            logger.info('kdaemon: task cancelled')
        except Exception as e:
            logger.exception(f'kdaemon: fatal error: {e}')
        finally:
            self._set_state('stopped')
            logger.info('kdaemon: stopped')
            await self._broadcast_state('STOP', '데몬 정지')
