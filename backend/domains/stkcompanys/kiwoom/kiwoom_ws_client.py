import asyncio
import json
from collections.abc import Callable

import websockets

from backend.core.logger import get_logger
from backend.domains.stkcompanys.kiwoom.managers.kiwoom_token_manager import KiwoomTokenManager

logger = get_logger(__name__)

class KiwoomWsClient:
    def __init__(self, uri: str = 'wss://api.kiwoom.com:10000/api/dostk/websocket', token_manager: KiwoomTokenManager = None):
        self.uri = uri
        self.token_manager = token_manager
        self.websocket = None
        self.connected = False
        self.keep_running = True
        self.handlers: dict[str, Callable] = {}
        self._login_event: asyncio.Event = asyncio.Event()

    async def wait_login(self, timeout: float = 10.0) -> bool:
        try:
            await asyncio.wait_for(self._login_event.wait(), timeout=timeout)
            return True
        except TimeoutError:
            logger.error('[Kiwoom WS] 로그인 대기 타임아웃')
            return False

    async def connect(self):
        try:
            token = await self.token_manager.get_token()

            self._login_event.clear()
            self.websocket = await websockets.connect(self.uri)
            self.connected = True
            logger.info("키움 웹소켓 서버와 연결을 시도 중입니다.")

            login_msg = {
                'trnm': 'LOGIN',
                'token': token
            }

            logger.info('실시간 웹소켓 서버로 로그인 패킷을 전송합니다.')
            await self.send_message(message=login_msg)

        except Exception as e:
            logger.error(f'Connection error: {e}')
            self.connected = False

    async def send_message(self, message):
        if not self.connected:
            await self.connect()
        if self.connected:
            if not isinstance(message, str):
                message = json.dumps(message)
            await self.websocket.send(message)
            logger.info(f'웹소켓 메세지를 키움서버로 전송했습니다: {message}')

    async def receive_messages(self):
        while self.keep_running:
            try:
                response = json.loads(await self.websocket.recv())
                trnm = response.get('trnm', 'UNKNOWN')

                if trnm == 'LOGIN':
                    if response.get('return_code') != 0:
                        logger.error('웹소켓(실시간) 로그인 실패하였습니다. : ', response.get('return_msg'))
                        await self.disconnect()
                    else:
                        logger.info('웹소켓(실시간) 로그인 성공하였습니다.')
                        self._login_event.set()

                elif trnm == 'PING':
                    await self.send_message(response)

                elif trnm == 'UNKNOWN':
                    logger.warning('알 수 없는 메시지를 받았습니다:', response)

                elif trnm == 'REAL':
                    data_list = response.get('data', [])
                    if isinstance(data_list, list):
                        for data in data_list:
                            type_ = data.get('type', '')
                            if type_ in self.handlers:
                                await self.handlers[type_](data)
                            else:
                                logger.info(f"[Kiwoom] 미등록 타입: {type_} data={data}")
                    else:
                        logger.warning(f"[Kiwoom] data가 리스트가 아님: {response}")

                else:
                    logger.info(f"[Kiwoom] 실시간 응답 수신: {response}")

            except websockets.ConnectionClosed:
                logger.warning('키움 웹소켓 서버로부터 연결이 종료되었습니다')
                self.connected = False
                break

    async def subscribe(self, stock_code: str, tr_type: str = '0B', grp_no: str = '1'):
        await self.register(grp_no=grp_no, item_list=[stock_code], type_list=[tr_type])

    async def unsubscribe(self, stock_code: str, tr_type: str = '0B', grp_no: str = '1'):
        await self.unregister(grp_no=grp_no)

    def _parse_stock_ccnl(self, data: dict) -> dict:
        values = data.get('values', [])

        def v(i):
            return values[i] if len(values) > i else ''

        return {
            'stock_code': data.get('item', ''),
            'time': v(0),         # 체결시간 (20)
            'price': v(1),        # 현재가 (10)
            'change': v(2),       # 전일대비 (11)
            'change_rate': v(3),  # 등락율 (12)
            'ask_price': v(4),    # 매도호가 (27)
            'bid_price': v(5),    # 매수호가 (28)
            'volume': v(6),       # 거래량 (15)
            'acml_volume': v(7),  # 누적거래량 (13)
            'acml_amount': v(8),  # 누적거래대금 (14)
            'open_price': v(9),   # 시가 (16)
            'high_price': v(10),  # 고가 (17)
            'low_price': v(11),   # 저가 (18)
        }

    def _parse_order_ccnl(self, data: dict) -> dict:
        """주문체결통보 파싱 (KIWOOM REG 체결)"""
        values = data.get('values', [])

        def v(i):
            return values[i] if len(values) > i else ''

        raw_side = v(3)  # 매도매수구분: '1'=매도,'2'=매수
        if raw_side == '2':
            sell_buy = '01'
        elif raw_side == '1':
            sell_buy = '02'
        else:
            sell_buy = raw_side
        return {
            'acct_no':   data.get('item', ''),
            'order_no':  v(0),
            'stock_code': v(1),
            'stock_name': v(2),
            'sell_buy':  sell_buy,
            'order_qty': v(4),
            'order_price': v(5),
            'ccnl_qty':  v(6),
            'ccnl_price': v(7),
            'ccnl_time': v(8),
        }

    async def register(self, grp_no: str, item_list: list[str], type_list: list[str]):
        message = {
            "trnm": "REG",
            "grp_no": grp_no,
            "refresh": "1",
            "data": [{
                "item": item_list,
                "type": type_list
            }]
        }
        await self.send_message(message)

    async def unregister(self, grp_no: str):
        message = {
            "type": "REMOVE",
            "grp_no": grp_no
        }
        await self.send_message(message)

    def add_handler(self, msg_type: str, handler: Callable):
        """
        실시간 수신 메시지 핸들러 등록
        """
        self.handlers[msg_type] = handler

    async def run(self):
        await self.connect()
        await self.receive_messages()

    async def disconnect(self):
        self.keep_running = False
        if self.connected and self.websocket:
            await self.websocket.close()
            self.connected = False
            logger.info('키움 웹소켓 서버와의 연결이 종료되었습니다.')
