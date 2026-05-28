"""
WsManager — 3개 증권사 WebSocket 통합 관리자
Kiwoom/KIS/LS → broadcast → 연결된 브라우저 클라이언트
"""
import asyncio
import json
from collections.abc import Callable

from fastapi import WebSocket

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.services.stk_history_service import StkHistoryService
from backend.domains.services.stk_news_service import stk_news_service

_stk_history_service = StkHistoryService()
from backend.domains.stkcompanys.kis.kis_ws_client import KisWsClient
from backend.domains.stkcompanys.kiwoom.kiwoom_ws_client import KiwoomWsClient
from backend.domains.stkcompanys.ls.ls_ws_client import LsWsClient

logger = get_logger(__name__)


class WsManager:
    def __init__(self):
        self.kiwoom_ws: KiwoomWsClient | None = None
        self.kis_ws: KisWsClient | None = None
        self.ls_ws: LsWsClient | None = None
        self._browser_clients: set[WebSocket] = set()
        self._tasks: list[asyncio.Task] = []
        self._running = False

    async def broadcast(self, msg: dict):
        if not self._browser_clients:
            return
        dead: set[WebSocket] = set()
        text = json.dumps(msg, ensure_ascii=False)
        for ws in self._browser_clients.copy():
            try:
                await ws.send_text(text)
            except Exception:
                dead.add(ws)
        self._browser_clients -= dead

    async def add_client(self, ws: WebSocket):
        self._browser_clients.add(ws)
        logger.info(f"[WsManager] 브라우저 클라이언트 연결 (총 {len(self._browser_clients)}개)")

    async def remove_client(self, ws: WebSocket):
        self._browser_clients.discard(ws)
        logger.info(f"[WsManager] 브라우저 클라이언트 해제 (총 {len(self._browser_clients)}개)")

    async def subscribe_stock(self, stock_code: str):
        """매매 시 3개 브로커에 종목 체결 구독 등록"""
        tasks = []
        if self.kiwoom_ws and self.kiwoom_ws.connected:
            tasks.append(self.kiwoom_ws.subscribe(stock_code, '0B'))
        if self.kis_ws and self.kis_ws.connected:
            tasks.append(self.kis_ws.subscribe(stock_code, 'H0STCNT0'))
        if self.ls_ws and self.ls_ws.connected:
            tasks.append(self.ls_ws.subscribe(stock_code, 'S3_'))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        logger.info(f"[WsManager] 종목 체결 구독: {stock_code}")

    async def unsubscribe_stock(self, stock_code: str):
        """종목 체결 구독 해제"""
        tasks = []
        if self.kiwoom_ws and self.kiwoom_ws.connected:
            tasks.append(self.kiwoom_ws.unsubscribe(stock_code, '0B'))
        if self.kis_ws and self.kis_ws.connected:
            tasks.append(self.kis_ws.unsubscribe(stock_code, 'H0STCNT0'))
        if self.ls_ws and self.ls_ws.connected:
            tasks.append(self.ls_ws.unsubscribe(stock_code, 'S3_'))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        logger.info(f"[WsManager] 종목 체결 해제: {stock_code}")

    def _make_handler(self, broker: str, msg_type: str, data_key: str = 'parsed') -> Callable:
        async def handler(d: dict):
            await self.broadcast({
                'broker': broker,
                'type': msg_type,
                'data': d.get(data_key, d) if data_key != 'self' else d,
            })
        return handler

    async def start(self):
        if self._running:
            logger.warning("[WsManager] 이미 실행 중")
            return
        self._running = True
        logger.info("[WsManager] 3개 증권사 WS 연결 시작")

        from backend.domains.stkcompanys.kis import kis_service
        from backend.domains.stkcompanys.kiwoom import kiwoom_service
        from backend.domains.stkcompanys.ls import ls_service

        kiwoom_tm = await kiwoom_service.get_token_manager()
        kis_tm = await kis_service.get_kis_token_manager()
        ls_tm = await ls_service.get_ls_token_manager()

        self.kiwoom_ws = KiwoomWsClient(uri=config.KIWOOM_WS_URL, token_manager=kiwoom_tm)
        self.kis_ws = KisWsClient(token_manager=kis_tm)
        self.ls_ws = LsWsClient(token_manager=ls_tm)

        # Kiwoom 핸들러: '0B' 주식체결 + 계좌체결통보
        async def kiwoom_ccnl_handler(d: dict):
            await self.broadcast({
                'broker': 'kiwoom',
                'type': 'stock_ccnl',
                'data': self.kiwoom_ws._parse_stock_ccnl(d),
            })

        async def kiwoom_order_handler(d: dict):
            parsed = self.kiwoom_ws._parse_order_ccnl(d)
            logger.info(f"[Kiwoom] 체결통보 raw={d} parsed={parsed}")
            if int(parsed.get('ccnl_qty') or 0) > 0 and int(parsed.get('ccnl_price') or 0) > 0:
                asyncio.create_task(_stk_history_service.save_execution(parsed, broker='KIWOOM'))
                await self.broadcast({'broker': 'kiwoom', 'type': 'order_ccnl', 'data': parsed})

        self.kiwoom_ws.add_handler('0B', kiwoom_ccnl_handler)
        self.kiwoom_ws.add_handler('00', kiwoom_order_handler)

        # KIS 핸들러: 주식체결 + 계좌체결통보
        async def kis_ccnl_handler(d: dict):
            await self.broadcast({'broker': 'kis', 'type': 'stock_ccnl', 'data': d.get('parsed', {})})

        async def kis_order_handler(d: dict):
            parsed = d.get('parsed', {})
            if int(parsed.get('ccnl_qty') or 0) > 0 and int(parsed.get('ccnl_price') or 0) > 0:
                asyncio.create_task(_stk_history_service.save_execution(parsed, broker='KIS'))
                await self.broadcast({'broker': 'kis', 'type': 'order_ccnl', 'data': parsed})

        self.kis_ws.add_handler('H0STCNT0', kis_ccnl_handler)
        self.kis_ws.add_handler('H0STCNI0', kis_order_handler)

        # LS 핸들러: 주식체결 + 뉴스 + 장운영정보
        async def ls_ccnl_handler(d: dict):
            await self.broadcast({'broker': 'ls', 'type': 'stock_ccnl', 'data': d.get('parsed', {})})

        async def ls_news_handler(d: dict):
            raw = d.get('raw', {})
            parsed = d.get('parsed', {})
            logger.info(f"[LS NWS] raw body keys={list(raw.keys())} parsed={parsed}")
            # 주식 무관 뉴스(code 없음) 제외
            if not parsed.get('news_code') and not parsed.get('stock_codes'):
                logger.info(f"[LS NWS] 필터링됨 (stock_codes/news_code 모두 비어있음) raw={raw}")
                return
            save_data = {**parsed, 'date': raw.get('date', ''), 'category_id': raw.get('categoryid', '')}
            asyncio.create_task(stk_news_service.save_news(save_data))
            await self.broadcast({'broker': 'ls', 'type': 'news', 'data': parsed})

        async def ls_market_time_handler(d: dict):
            await self.broadcast({'broker': 'ls', 'type': 'market_time', 'data': d.get('raw', {})})

        async def ls_order_handler(d: dict):
            parsed = d.get('parsed', {})
            raw = d.get('raw', {})
            logger.info(f"[LS SC0] 체결통보 raw={raw} parsed={parsed}")
            if int(parsed.get('ccnl_qty') or 0) > 0 and int(parsed.get('ccnl_price') or 0) > 0:
                asyncio.create_task(_stk_history_service.save_execution(parsed, broker='LS'))
                await self.broadcast({'broker': 'ls', 'type': 'order_ccnl', 'data': parsed})

        self.ls_ws.add_handler('S3_', ls_ccnl_handler)
        self.ls_ws.add_handler('NWS', ls_news_handler)
        self.ls_ws.add_handler('JIF', ls_market_time_handler)
        self.ls_ws.add_handler('SC0', ls_order_handler)
        self.ls_ws.add_handler('SC1', ls_order_handler)  # 시장가 체결통보가 SC1으로 오는 경우 대비

        # 3개 브로커 비동기 시작
        self._tasks = [
            asyncio.create_task(self._run_kiwoom()),
            asyncio.create_task(self._run_kis()),
            asyncio.create_task(self._run_ls()),
        ]

    async def _run_kiwoom(self):
        delay = 10
        while self._running:
            try:
                await self.kiwoom_ws.connect()
                # receive_messages를 먼저 task로 시작해야 LOGIN 응답 수신 가능
                recv_task = asyncio.create_task(self.kiwoom_ws.receive_messages())
                logged_in = await self.kiwoom_ws.wait_login()
                if logged_in and config.KIWOOM_ACCT_NO:
                    await self.kiwoom_ws.subscribe(config.KIWOOM_ACCT_NO, '00')
                    logger.info(f"[Kiwoom WS] 계좌체결통보 구독(00): {config.KIWOOM_ACCT_NO}")
                delay = 10
                await recv_task
            except Exception as e:
                logger.error(f"[Kiwoom WS] 오류: {e}")
            if not self._running:
                break
            logger.info(f"[Kiwoom WS] {delay}초 후 재연결...")
            await asyncio.sleep(delay)
            delay = min(delay * 2, 300)

    async def _run_kis(self):
        delay = 10
        while self._running:
            try:
                await self.kis_ws.connect()
                if config.KIS_HTS_ID:
                    await self.kis_ws.subscribe(config.KIS_HTS_ID, 'H0STCNI0')
                    logger.info(f"[KIS WS] 계좌체결통보 구독: HTS_ID={config.KIS_HTS_ID}")
                else:
                    logger.warning("[KIS WS] KIS_HTS_ID 미설정 — H0STCNI0 구독 생략")
                delay = 10
                await self.kis_ws.receive_messages()
            except Exception as e:
                logger.error(f"[KIS WS] 오류: {e}")
            if not self._running:
                break
            logger.info(f"[KIS WS] {delay}초 후 재연결...")
            await asyncio.sleep(delay)
            delay = min(delay * 2, 300)

    async def _run_ls(self):
        delay = 10
        while self._running:
            try:
                self.ls_ws.connected = False
                await self.ls_ws.connect()
                await self.ls_ws.subscribe('NWS001', 'NWS')
                logger.info("[LS WS] 뉴스(NWS) 구독 완료")
                await self.ls_ws.subscribe('0', 'JIF')
                logger.info("[LS WS] 장운영정보(JIF) 구독 완료")
                if config.LS_ACCT_NO:
                    await self.ls_ws.subscribe(config.LS_ACCT_NO, 'SC0')
                    logger.info(f"[LS WS] 주식주문체결(SC0) 구독: {config.LS_ACCT_NO}")
                    await self.ls_ws.subscribe(config.LS_ACCT_NO, 'SC1')
                    logger.info(f"[LS WS] 주식주문정정/체결(SC1) 구독: {config.LS_ACCT_NO}")
                delay = 10
                await self.ls_ws.receive_messages()
            except Exception as e:
                logger.error(f"[LS WS] 오류: {e}")
            if not self._running:
                break
            logger.info(f"[LS WS] {delay}초 후 재연결 시도...")
            await asyncio.sleep(delay)
            delay = min(delay * 2, 300)

    async def stop(self):
        self._running = False
        for t in self._tasks:
            t.cancel()
        coros = []
        if self.kiwoom_ws:
            coros.append(self.kiwoom_ws.disconnect())
        if self.kis_ws:
            coros.append(self.kis_ws.disconnect())
        if self.ls_ws:
            coros.append(self.ls_ws.disconnect())
        if coros:
            await asyncio.gather(*coros, return_exceptions=True)
        logger.info("[WsManager] 종료 완료")


ws_manager = WsManager()
