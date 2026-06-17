# backend/domains/infrahub/account_resolver.py
"""
모듈 설명:
    - 계좌 특성 및 잔고 정보를 조회하는 싱글톤 클래스
    - 다른 API나 서비스에서 판단 근거로 참조하는 인프라성 유틸
    - 예수금, 주문 가능 금액 등 계좌 단위의 단일 정보를 어떤 경로로든 취득해 반환한다.

사용법:
    ```python
    from backend.domains.infrahub.account_resolver import AccountResolver

    resolver = AccountResolver.get()
    cash = await resolver.get_cash("ls")    # → int (원)
    cash = await resolver.get_cash("kis")
    cash = await resolver.get_cash("kiwoom")
    ```

작성자: kiwi8
작성일: 2026-05-13
"""
from __future__ import annotations

from backend.core.logger import get_logger

logger = get_logger(__name__)


class AccountResolver:
    """계좌 특성 조회 싱글톤 클래스"""

    _instance: AccountResolver | None = None

    def __init__(self):
        pass

    @classmethod
    def get(cls) -> AccountResolver:
        if cls._instance is None:
            cls._instance = AccountResolver()
        return cls._instance

    # ------------------------------------------------------------------
    # 공개 인터페이스
    # ------------------------------------------------------------------

    async def get_cash(self, broker: str) -> int:
        """
        증권사별 현금 주문가능금액 조회

        Args:
            broker: "kiwoom" | "kis" | "ls"

        Returns:
            주문가능금액 (원). 조회 실패 시 0.
        """
        if broker == 'kiwoom':
            return await self._get_cash_kiwoom()
        if broker == 'kis':
            return await self._get_cash_kis()
        if broker == 'ls':
            return await self._get_cash_ls()
        logger.warning(f'AccountResolver.get_cash: 알 수 없는 broker={broker}')
        return 0

    # ------------------------------------------------------------------
    # 내부 구현
    # ------------------------------------------------------------------

    async def _get_cash_kiwoom(self) -> int:
        """kt00001(qry_tp=3) → d+2추정예수금"""
        try:
            from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
            from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import (
                KiwoomApiHelper,
                KiwoomRequest,
            )
            kiwoom = await get_kiwoom_api()
            resp = await kiwoom.send_request(KiwoomRequest(api_id='kt00001', payload={'qry_tp': '3'}))
            if not resp.success:
                logger.error(f'AccountResolver: kiwoom 예수금 조회 실패: {resp.error_message}')
                return 0
            korea = KiwoomApiHelper.to_korea_data(resp.data, 'kt00001')
            cash = int(korea.get('d+2추정예수금', 0) or 0)
            logger.info(f'AccountResolver: kiwoom 주문가능금액={cash:,}원')
            return cash
        except Exception as e:
            logger.error(f'AccountResolver: kiwoom 예수금 조회 예외: {e}')
            return 0

    async def _get_cash_kis(self) -> int:
        """TTTC8908R(PDNO 공란) → ord_psbl_cash(주문가능현금)"""
        try:
            from backend.core.config import config
            from backend.domains.stkcompanys.kis.kis_service import get_kis_api
            from backend.domains.stkcompanys.kis.models.kis_schema import (
                KisApiHelper,
                KisRequest,
            )
            kis = await get_kis_api()
            if not kis:
                logger.error('AccountResolver: KIS API 인스턴스 생성 실패')
                return 0
            req = KisRequest(
                api_id='TTTC8908R',
                payload={
                    'CANO': config.KIS_ACCT_NO[:8],
                    'ACNT_PRDT_CD': config.KIS_ACCT_PRDT_CD,
                    'PDNO': '',
                    'ORD_UNPR': '',
                    'ORD_DVSN': '00',
                    'CMA_EVLU_AMT_ICLD_YN': 'N',
                    'OVRS_ICLD_YN': 'N',
                },
            )
            resp = await kis.send_request(req)
            if not resp.success:
                logger.error(f'AccountResolver: KIS 예수금 조회 실패: {resp.error_message}')
                return 0
            korea = KisApiHelper.to_korea_data(resp.data, 'TTTC8908R')
            output = korea.get('output', {}) or {}
            cash = int(output.get('주문가능현금', 0) or 0)
            logger.info(f'AccountResolver: KIS 주문가능금액={cash:,}원')
            return cash
        except Exception as e:
            logger.error(f'AccountResolver: KIS 예수금 조회 예외: {e}')
            return 0

    async def _get_cash_ls(self) -> int:
        """CSPAQ12200(BalCreTp=0) → 현금주문가능금액"""
        try:
            from backend.domains.stkcompanys.ls.ls_service import get_ls_api
            from backend.domains.stkcompanys.ls.models.ls_schema import (
                LsApiHelper,
                LsRequest,
            )
            ls = await get_ls_api()
            if not ls:
                logger.error('AccountResolver: LS API 인스턴스 생성 실패')
                return 0
            resp = await ls.send_request(LsRequest(
                api_id='CSPAQ12200',
                payload={'BalCreTp': '0'},
            ))
            if not resp.success:
                logger.error(f'AccountResolver: LS 예수금 조회 실패: {resp.error_message}')
                return 0
            korea = LsApiHelper.to_korea_data(resp.data, 'CSPAQ12200')
            block2 = korea.get('CSPAQ12200OutBlock2', {}) or {}
            cash = int(block2.get('현금주문가능금액', 0) or 0)
            logger.info(f'AccountResolver: LS 주문가능금액={cash:,}원')
            return cash
        except Exception as e:
            logger.error(f'AccountResolver: LS 예수금 조회 예외: {e}')
            return 0
