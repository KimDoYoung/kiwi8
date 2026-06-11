import asyncio
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from backend.core.config import config
from backend.core.logger import get_logger

logger = get_logger(__name__)

MAX_POSITIONS = 3
BUY_TIMEOUT_TICKS = 10    # 10틱(약 10분) 신호 없으면 포기
BUY_PRICE_DRIFT = 1.02    # 진입가 대비 +2% 이상 오르면 포기


@dataclass
class PendingStock:
    stk_cd: str
    stk_nm: str
    stop_rate: float
    effective_budget: int   # 수수료 차감 후 종목당 예산
    entry_price: int        # 큐 진입 시 현재가 (이탈 기준)
    tick_count: int = field(default=0)


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


def _parse_stock_line(line: str) -> tuple[str, float | None]:
    """'005930' | '005930,5' | '005930,0.05' → (stk_cd, stop_rate|None)
    stop_rate: >1이면 %로 해석 (5 → 0.05), ≤1이면 그대로 (0.05 → 0.05)
    """
    parts = line.split(',', 1)
    stk_cd = parts[0].strip()
    if len(parts) == 2:
        try:
            val = float(parts[1].strip())
            return stk_cd, val / 100 if val > 1 else val
        except ValueError:
            pass
    return stk_cd, None


class KDaemon:
    """
    자동매매 데몬
    - start(): auto_trade_position 확인 → 부족분 auto_trade.data에서 매수
    - _run(): 60초 간격 trailing stop 모니터링
    - stop(): 루프 종료
    dry_run=True 이면 실제 주문 없이 log + WS로만 동작 (시뮬레이션)
    """
    _instance: "KDaemon|None" = None

    def __init__(self, db_path: str, poll_interval_sec: int = 60, dry_run: bool = True):
        self.db_path = db_path
        self.poll_interval_sec = poll_interval_sec
        self.dry_run = dry_run
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()
        self._tick_count: dict[str, int] = {}   # 시작 후 종목별 틱 누적 (재시작 시 리셋)
        self._pending_buy: dict[str, PendingStock] = {}  # 매수 타이밍 대기 큐
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False, timeout=10)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        for migration in [
            "ALTER TABLE auto_trade_log ADD COLUMN deposit INTEGER",
            "ALTER TABLE auto_trade_state ADD COLUMN dry_run INTEGER DEFAULT 1",
            "ALTER TABLE auto_trade_position ADD COLUMN cur_price INTEGER",
            "ALTER TABLE auto_trade_position ADD COLUMN max_volume_1min INTEGER DEFAULT 0",
            """CREATE TABLE IF NOT EXISTS auto_trade_price_tick (
               id              INTEGER PRIMARY KEY AUTOINCREMENT,
               stk_cd          TEXT NOT NULL,
               price           INTEGER NOT NULL,
               volume_1min     INTEGER,
               vol_power       REAL,
               orderbook_ratio REAL,
               recorded_at     TEXT DEFAULT (datetime('now','localtime'))
            )""",
            "CREATE INDEX IF NOT EXISTS ix_pricetick_stk ON auto_trade_price_tick(stk_cd, recorded_at DESC)",
            """CREATE TABLE IF NOT EXISTS auto_trade_results (
               id              INTEGER PRIMARY KEY AUTOINCREMENT,
               stk_cd          TEXT NOT NULL,
               stk_nm          TEXT NOT NULL,
               buy_price       INTEGER NOT NULL,
               qty             INTEGER NOT NULL,
               buy_amount      INTEGER NOT NULL,
               buy_fee         INTEGER NOT NULL DEFAULT 0,
               buy_strategy    TEXT NOT NULL DEFAULT '직접 매수',
               buy_order_no    TEXT,
               bought_at       TEXT NOT NULL,
               sell_price      INTEGER,
               sell_amount     INTEGER,
               sell_fee        INTEGER DEFAULT 0,
               sell_reason     TEXT,
               sell_order_no   TEXT,
               sold_at         TEXT,
               profit          INTEGER,
               profit_net      INTEGER,
               profit_rate     REAL,
               dry_run         INTEGER NOT NULL DEFAULT 1,
               deposit_after   INTEGER
            )""",
        ]:
            try:
                self._conn.execute(migration)
                self._conn.commit()
            except Exception:
                pass
        # DB 값 우선 적용 (config보다 DB가 우선)
        row = self._conn.execute("SELECT dry_run FROM auto_trade_state WHERE id=1").fetchone()
        if row and row['dry_run'] is not None:
            self.dry_run = bool(row['dry_run'])

    @classmethod
    def get(cls, db_path: str, poll_interval_sec: int = 60, dry_run: bool = True) -> "KDaemon":
        if cls._instance is None:
            cls._instance = KDaemon(db_path, poll_interval_sec, dry_run)
        return cls._instance

    # ── DB ─────────────────────────────────────────────

    def _set_state(self, status: str):
        self._conn.execute(
            "UPDATE auto_trade_state SET status=?, updated_at=? WHERE id=1",
            (status, now_ymdhms())
        )
        self._conn.commit()

    # ── WebSocket ───────────────────────────────────────

    async def _broadcast_state(self, action: str, memo: str):
        try:
            from backend.domains.infrahub.ws_manager import ws_manager
            clients = len(ws_manager._browser_clients)
            logger.info(f'kdaemon: broadcast {action} → {clients}개 클라이언트')
            data: dict = {
                'action': action,
                'dt': datetime.now().strftime('%H:%M:%S'),
                'memo': memo,
            }
            try:
                from backend.domains.kdaemon.auto_trader import get_available_cash
                deposit = await get_available_cash()
                if deposit:
                    data['deposit'] = deposit
            except Exception:
                pass
            await ws_manager.broadcast({
                'broker': 'kdaemon',
                'type': 'kdaemon_event',
                'data': data,
            })
        except Exception as e:
            logger.warning(f'kdaemon: broadcast 실패: {e}')

    # ── 초기 매수 ───────────────────────────────────────

    async def _initial_buy(self, existing: list) -> None:
        """
        auto_trade.data에서 부족분 읽기 → 매수 (dry_run)
        읽은 종목은 파일에서 삭제
        """
        from backend.domains.kdaemon.auto_trader import (
            get_available_cash,
            get_current_price,
            log_action,
        )

        empty_slots = MAX_POSITIONS - len(existing) - len(self._pending_buy)
        held = {p.stk_cd for p in existing}

        data_path = Path(config.BASE_DIR) / 'db' / 'auto_trade.data'
        if not data_path.exists():
            logger.info('kdaemon: auto_trade.data 없음, 신규 매수 없음')
            log_action(self._conn, 'FIND', memo='auto_trade.data 없음')
            return

        lines = [l.strip() for l in data_path.read_text().splitlines() if l.strip()]
        parsed = [_parse_stock_line(l) for l in lines]
        to_buy = [(cd, sr) for cd, sr in parsed if cd not in held and cd not in self._pending_buy][:empty_slots]
        buy_codes = {cd for cd, _ in to_buy}
        remaining = [l for l, (cd, _) in zip(lines, parsed) if cd not in buy_codes]
        data_path.write_text('\n'.join(remaining))

        if not to_buy:
            logger.info('kdaemon: 매수할 신규 종목 없음')
            log_action(self._conn, 'FIND', memo='매수 종목 없음 (파일 비어있음 or 이미 보유)')
            return

        default_stop_rate = _get_stop_rate(self._conn)
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
        budget_per = cash // empty_slots
        effective_budget = int(budget_per / (1 + config.BUY_FEE_RATE))
        logger.info(
            f'kdaemon: 신규 매수 {len(to_buy)}종목 '
            f'예수금={cash:,}원 빈슬롯={empty_slots} 종목당={budget_per:,}원(수수료차감={effective_budget:,}원)'
        )
        log_action(self._conn, 'FIND',
                   memo=f'매수 {len(to_buy)}종목 예수금={cash:,}원 슬롯당={budget_per:,}원')

        from backend.domains.infrahub.stock_resolver import StockResolver
        resolver = StockResolver.get()

        for stk_cd, per_stop_rate in to_buy:
            effective_stop_rate = per_stop_rate if per_stop_rate is not None else default_stop_rate
            stk_nm = await resolver.get_stk_nm(stk_cd) or stk_cd
            cur_price = await get_current_price(stk_cd)
            if not cur_price:
                logger.warning(f'kdaemon: {stk_nm}({stk_cd}) 현재가 조회 실패, skip')
                log_action(self._conn, 'ERROR', stk_cd=stk_cd, stk_nm=stk_nm, memo='현재가 조회 실패')
                continue
            qty = effective_budget // cur_price
            stop_pct = int(effective_stop_rate * 100)
            logger.info(f'kdaemon: {stk_nm}({stk_cd}) 가격={cur_price:,}원 → {qty}주 (예산={effective_budget:,}원, stop={stop_pct}%)')
            if qty <= 0:
                logger.warning(f'kdaemon: {stk_nm}({stk_cd}) 예산 부족 price={cur_price:,} budget={effective_budget:,}')
                log_action(self._conn, 'ERROR', stk_cd=stk_cd, stk_nm=stk_nm, memo=f'예산 부족 price={cur_price:,}')
                continue
            self._pending_buy[stk_cd] = PendingStock(
                stk_cd=stk_cd, stk_nm=stk_nm,
                stop_rate=effective_stop_rate,
                effective_budget=effective_budget,
                entry_price=cur_price,
            )
            logger.info(
                f'kdaemon: {stk_nm}({stk_cd}) 매수 대기 큐 진입 '
                f'현재가={cur_price:,}원 예산={effective_budget:,}원'
            )
            log_action(self._conn, 'FIND', stk_cd=stk_cd, stk_nm=stk_nm, price=cur_price,
                       memo=f'매수 대기 시작 — 타이밍 신호 대기 (최대 {BUY_TIMEOUT_TICKS}틱)')

    # ── 매수 타이밍 처리 ────────────────────────────────

    async def _process_pending_buys(self, allow_trade: bool) -> None:
        """pending 큐 종목 틱 수집 → 매수 신호 감지 → 매수 or 포기"""
        if not self._pending_buy:
            return

        from backend.domains.infrahub.current_pricer import CurrentPricer
        from backend.domains.kdaemon.auto_trader import (
            analyze_buy_signal,
            buy_stock,
            get_recent_ticks,
            insert_price_tick,
            log_action,
        )
        ticker = CurrentPricer.get()

        for stk_cd, pending in list(self._pending_buy.items()):
            tick = await ticker.get_tick1(stk_cd)
            cur_price = tick.price
            if not cur_price:
                logger.warning(f'kdaemon: pending {pending.stk_nm}({stk_cd}) 현재가 없음, skip')
                continue

            insert_price_tick(self._conn, stk_cd, tick)
            pending.tick_count += 1

            # 가격 이탈: entry_price 대비 +2% 이상 → 포기
            drift_pct = (cur_price / pending.entry_price - 1) * 100
            if cur_price > pending.entry_price * BUY_PRICE_DRIFT:
                logger.info(
                    f'kdaemon: {pending.stk_nm}({stk_cd}) 매수 포기 — '
                    f'가격 이탈 +{drift_pct:.1f}% ({pending.entry_price:,}→{cur_price:,}원)'
                )
                log_action(self._conn, 'FIND', stk_cd=stk_cd, stk_nm=pending.stk_nm,
                           price=cur_price, memo=f'매수 포기 — 가격 이탈 +{drift_pct:.1f}%')
                del self._pending_buy[stk_cd]
                continue

            # 타임아웃
            if pending.tick_count >= BUY_TIMEOUT_TICKS:
                logger.info(
                    f'kdaemon: {pending.stk_nm}({stk_cd}) 매수 포기 — '
                    f'{BUY_TIMEOUT_TICKS}틱 타임아웃 (신호 없음)'
                )
                log_action(self._conn, 'FIND', stk_cd=stk_cd, stk_nm=pending.stk_nm,
                           price=cur_price, memo=f'매수 포기 — {BUY_TIMEOUT_TICKS}틱 타임아웃')
                del self._pending_buy[stk_cd]
                continue

            if pending.tick_count < 3:
                logger.debug(f'kdaemon: {stk_cd} 매수 대기 {pending.tick_count}/3틱')
                continue

            recent = get_recent_ticks(self._conn, stk_cd, n=5)
            signal = analyze_buy_signal(recent)
            if signal:
                qty = pending.effective_budget // cur_price
                if qty <= 0:
                    logger.warning(f'kdaemon: {pending.stk_nm}({stk_cd}) 예산 부족 — 매수 포기')
                    log_action(self._conn, 'ERROR', stk_cd=stk_cd, stk_nm=pending.stk_nm,
                               memo=f'예산 부족 price={cur_price:,}')
                    del self._pending_buy[stk_cd]
                    continue
                logger.info(
                    f'kdaemon: {pending.stk_nm}({stk_cd}) 매수 신호 [{signal}] — '
                    f'{cur_price:,}원 × {qty}주'
                )
                if allow_trade:
                    await buy_stock(
                        self._conn, stk_cd, pending.stk_nm, cur_price, qty,
                        stop_rate=pending.stop_rate, dry_run=self.dry_run,
                        buy_strategy=f'직접 매수({signal})',
                    )
                    del self._pending_buy[stk_cd]
            else:
                logger.debug(
                    f'kdaemon: {pending.stk_nm}({stk_cd}) 매수 신호 대기 '
                    f'({pending.tick_count}/{BUY_TIMEOUT_TICKS}틱)'
                )

        self._conn.commit()

    # ── 제어 ───────────────────────────────────────────

    async def start(self):
        if self._task and not self._task.done():
            logger.info('kdaemon: already running')
            return

        self._stop_event.clear()
        self._tick_count = {}
        self._pending_buy = {}
        self._set_state('running')

        from backend.domains.kdaemon.auto_trader import get_positions
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
                await asyncio.wait_for(asyncio.shield(self._task), timeout=3)
            except TimeoutError:
                self._task.cancel()
                try:
                    await self._task
                except (asyncio.CancelledError, Exception):
                    pass
        self._task = None
        # 태스크 없이 stop() 호출(백엔드 재시작 후 등)에도 DB 상태 보장
        self._set_state('stopped')

    async def refresh(self):
        logger.info('kdaemon: refresh — 다음 사이클에서 포지션 재조회')

    # ── 모니터링 루프 ───────────────────────────────────

    async def _run(self):
        from backend.domains.infrahub.current_pricer import CurrentPricer
        from backend.domains.infrahub.open_time_checker import OpenTimeChecker
        from backend.domains.kdaemon.auto_trader import (
            analyze_trend_signal,
            calc_trailing_stop,
            cleanup_old_ticks,
            get_positions,
            get_recent_ticks,
            insert_price_tick,
            log_action,
            sell_stock,
            should_sell,
            update_position_cur_price,
            update_position_max_volume,
            update_position_trailing,
        )
        checker = OpenTimeChecker.get()
        ticker = CurrentPricer.get()

        try:
            while not self._stop_event.is_set():
                # 실제 모드: 영업일 여부 확인. 휴장일이면 사이클 전체 skip
                if not self.dry_run:
                    is_open = await checker.is_open_day()
                    if not is_open:
                        logger.debug('kdaemon: 휴장일 — 사이클 skip')
                        try:
                            await asyncio.wait_for(self._stop_event.wait(), timeout=self.poll_interval_sec)
                            break
                        except TimeoutError:
                            continue

                # 장외 시간 (09:00~15:30 외): 모니터링 불필요 — 대기
                if not checker.isKrxTime():
                    logger.debug('kdaemon: 장외시간 — 대기')
                    try:
                        await asyncio.wait_for(self._stop_event.wait(), timeout=self.poll_interval_sec)
                        break
                    except TimeoutError:
                        continue

                # 실제 매수/매도 허용 여부 (KRX 정규장 09:00~15:30)
                allow_trade = self.dry_run or checker.isKrxTime()

                positions = get_positions(self._conn)
                logger.info(f'kdaemon: 모니터링 사이클 — 포지션 {len(positions)}개')
                for pos in positions:
                    tick = await ticker.get_tick1(pos.stk_cd)
                    cur_price = tick.price
                    if not cur_price:
                        logger.warning(f'kdaemon: {pos.stk_cd} 현재가 없음, skip')
                        if not self.dry_run:
                            log_action(self._conn, 'ERROR', stk_cd=pos.stk_cd, memo='현재가 조회 실패')
                        continue

                    # 매 사이클 현재가 + tick 기록 (commit은 아래에서 한 번만)
                    update_position_cur_price(self._conn, pos.stk_cd, cur_price)
                    insert_price_tick(self._conn, pos.stk_cd, tick)
                    self._tick_count[pos.stk_cd] = self._tick_count.get(pos.stk_cd, 0) + 1

                    # max_volume_1min 갱신
                    if tick.volume_1min and tick.volume_1min > pos.max_volume_1min:
                        update_position_max_volume(self._conn, pos.stk_cd, tick.volume_1min)
                        pos.max_volume_1min = tick.volume_1min

                    self._conn.commit()

                    # 현재가/손절가 상태 브로드캐스트
                    log_action(self._conn, 'FIND',
                               stk_cd=pos.stk_cd, stk_nm=pos.stk_nm, price=cur_price,
                               memo=f'현재가 {cur_price:,}원 | 손절가 {pos.stop_price:,}원')

                    new_base, new_stop = calc_trailing_stop(
                        pos.base_price, cur_price, pos.stop_rate
                    )
                    if new_base > pos.base_price:
                        update_position_trailing(self._conn, pos.stk_cd, new_base, new_stop, cur_price)
                        pos.base_price = new_base
                        pos.stop_price = new_stop
                        log_action(self._conn, 'FIND',
                                   stk_cd=pos.stk_cd, stk_nm=pos.stk_nm, price=cur_price,
                                   memo=f'기준가↑ {new_base:,}원 → 손절가↑ {new_stop:,}원')

                    # 추세 반전 신호 (최소 3.0% 수익권 + 재시작 후 3틱 이상 쌓인 후에만)
                    _profit_pct = (cur_price - pos.buy_price) / pos.buy_price * 100
                    _ticks_ok = self._tick_count.get(pos.stk_cd, 0) >= 3
                    if not _ticks_ok:
                        logger.debug(
                            f'kdaemon: {pos.stk_cd} signal 대기 '
                            f'({self._tick_count.get(pos.stk_cd, 0)}/3틱)'
                        )
                    if _profit_pct >= 3.0 and _ticks_ok and allow_trade:
                        recent_ticks = get_recent_ticks(self._conn, pos.stk_cd, n=5)
                        trend_reason = analyze_trend_signal(recent_ticks, pos)
                        if trend_reason:
                            logger.info(
                                f'kdaemon: {pos.stk_cd} 추세 반전 신호 — '
                                f'cur={cur_price:,} highest={pos.base_price:,} profit={_profit_pct:.2f}%'
                            )
                            await sell_stock(self._conn, pos, cur_price,
                                             trend_reason, dry_run=self.dry_run)
                            continue

                    if should_sell(pos, cur_price):
                        if allow_trade:
                            logger.info(
                                f'kdaemon: {pos.stk_cd} trailing stop 발동 '
                                f'cur={cur_price:,} stop={pos.stop_price:,}'
                            )
                            await sell_stock(self._conn, pos, cur_price,
                                             'trailing_stop', dry_run=self.dry_run)
                        else:
                            logger.info(
                                f'kdaemon: {pos.stk_cd} trailing stop 조건 충족 '
                                f'(cur={cur_price:,} stop={pos.stop_price:,}) — 장외시간 대기'
                            )

                # 매수 타이밍 대기 큐 처리
                await self._process_pending_buys(allow_trade)

                # 오래된 tick 정리 + 배치 commit
                cleanup_old_ticks(self._conn, keep_hours=8)
                self._conn.commit()

                # 매도 후 포지션 재조회 → 빈 슬롯 있으면 auto_trade.data에서 보충
                positions = get_positions(self._conn)
                effective_slots = len(positions) + len(self._pending_buy)
                if effective_slots < MAX_POSITIONS and allow_trade:
                    logger.info(
                        f'kdaemon: 포지션 {len(positions)}/{MAX_POSITIONS} '
                        f'(대기 {len(self._pending_buy)}개) → 신규 종목 보충 시도'
                    )
                    await self._initial_buy(existing=positions)

                # stop_event 대기 — set되면 즉시 루프 탈출
                try:
                    await asyncio.wait_for(
                        self._stop_event.wait(), timeout=self.poll_interval_sec
                    )
                    break
                except TimeoutError:
                    pass  # 정상 주기, 계속

        except asyncio.CancelledError:
            logger.info('kdaemon: task cancelled')
        except Exception as e:
            logger.exception(f'kdaemon: fatal error: {e}')
        finally:
            self._set_state('stopped')
            logger.info('kdaemon: stopped')
            await self._broadcast_state('STOP', '데몬 정지')
