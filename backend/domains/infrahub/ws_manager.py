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
from backend.domains.stkcompanys.kiwoom.kiwoom_ws_client import KiwoomWsClient
from backend.domains.stkcompanys.kis.kis_ws_client import KisWsClient
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

        from backend.domains.stkcompanys.kiwoom import kiwoom_service
        from backend.domains.stkcompanys.kis import kis_service
        from backend.domains.stkcompanys.ls import ls_service

        kiwoom_tm = await kiwoom_service.get_token_manager()
        kis_tm = await kis_service.get_kis_token_manager()
        ls_tm = await ls_service.get_ls_token_manager()

        self.kiwoom_ws = KiwoomWsClient(uri=config.KIWOOM_WS_URL, token_manager=kiwoom_tm)
        self.kis_ws = KisWsClient(token_manager=kis_tm)
        self.ls_ws = LsWsClient(token_manager=ls_tm)

        # Kiwoom 핸들러: '0B' 주식체결
        async def kiwoom_ccnl_handler(d: dict):
            await self.broadcast({
                'broker': 'kiwoom',
                'type': 'stock_ccnl',
                'data': self.kiwoom_ws._parse_stock_ccnl(d),
            })
        self.kiwoom_ws.add_handler('0B', kiwoom_ccnl_handler)

        # KIS 핸들러: 주식체결 + 계좌체결통보
        async def kis_ccnl_handler(d: dict):
            await self.broadcast({'broker': 'kis', 'type': 'stock_ccnl', 'data': d.get('parsed', {})})

        async def kis_order_handler(d: dict):
            await self.broadcast({'broker': 'kis', 'type': 'order_ccnl', 'data': d.get('parsed', {})})

        self.kis_ws.add_handler('H0STCNT0', kis_ccnl_handler)
        self.kis_ws.add_handler('H0STCNI0', kis_order_handler)

        # LS 핸들러: 주식체결 + 뉴스 + 장운영정보
        async def ls_ccnl_handler(d: dict):
            await self.broadcast({'broker': 'ls', 'type': 'stock_ccnl', 'data': d.get('parsed', {})})

        async def ls_news_handler(d: dict):
            await self.broadcast({'broker': 'ls', 'type': 'news', 'data': d.get('parsed', {})})

        async def ls_market_time_handler(d: dict):
            await self.broadcast({'broker': 'ls', 'type': 'market_time', 'data': d.get('raw', {})})

        self.ls_ws.add_handler('S3_', ls_ccnl_handler)
        self.ls_ws.add_handler('NWS', ls_news_handler)
        self.ls_ws.add_handler('JIF', ls_market_time_handler)

        # 3개 브로커 비동기 시작
        self._tasks = [
            asyncio.create_task(self._run_kiwoom()),
            asyncio.create_task(self._run_kis()),
            asyncio.create_task(self._run_ls()),
        ]

    async def _run_kiwoom(self):
        try:
            await self.kiwoom_ws.connect()
            await self.kiwoom_ws.receive_messages()
        except Exception as e:
            logger.error(f"[Kiwoom WS] 오류: {e}")

    async def _run_kis(self):
        try:
            await self.kis_ws.connect()
            # 계좌체결통보 구독 (종목코드 대신 계좌번호 사용)
            if config.KIS_ACCT_NO:
                await self.kis_ws.subscribe(config.KIS_ACCT_NO, 'H0STCNI0')
            await self.kis_ws.receive_messages()
        except Exception as e:
            logger.error(f"[KIS WS] 오류: {e}")

    async def _run_ls(self):
        try:
            await self.ls_ws.connect()
            # 장운영정보 + 뉴스 구독 (종목코드 불필요)
            await self.ls_ws.subscribe('0000', 'JIF')
            await self.ls_ws.subscribe('0000', 'NWS')
            await self.ls_ws.receive_messages()
        except Exception as e:
            logger.error(f"[LS WS] 오류: {e}")

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
