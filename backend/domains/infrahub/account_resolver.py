# backend/domains/infrahub/account_resolver.py
"""
모듈 설명:
    - 계좌 특성 및 잔고 정보를 조회하는 싱글톤 클래스
    - 다른 API나 서비스에서 판단 근거로 참조하는 인프라성 유틸
    - 예수금, 주문 가능 금액 등 계좌 단위의 단일 정보를 어떤 경로로든 취득해 반환한다.

TODO:
    - get_available_deposit(broker): 증권사별 주문 가능 예수금 조회
    - get_account_type(broker): 계좌 유형 (위탁/ISA/연금 등) 조회
    - 각 메서드는 캐시 → DB → API 순서로 조회하며, CacheManager를 활용한다.

사용법:
    ```python
    from backend.domains.infrahub.account_resolver import AccountResolver

    resolver = AccountResolver.get()
    # deposit = await resolver.get_available_deposit("kis")
    ```

작성자: kiwi8
작성일: 2026-05-13
"""
from __future__ import annotations

from backend.core.logger import get_logger

logger = get_logger(__name__)


class AccountResolver:
    """
    계좌 특성 조회 싱글톤 클래스

    예수금, 주문 가능 금액 등 계좌 단위의 정보를 조회한다.
    내부적으로 캐시 → DB → API 순서로 최적의 수단을 선택하며,
    호출 측은 조회 경로를 신경 쓸 필요 없이 결과만 사용한다.
    """

    _instance: AccountResolver | None = None

    def __init__(self):
        pass

    @classmethod
    def get(cls) -> AccountResolver:
        """싱글톤 인스턴스 반환"""
        if cls._instance is None:
            cls._instance = AccountResolver()
        return cls._instance

    # ------------------------------------------------------------------
    # 공개 인터페이스 (TODO)
    # ------------------------------------------------------------------

    # async def get_available_deposit(self, broker: str) -> int:
    #     """
    #     증권사별 주문 가능 예수금 조회
    #
    #     Args:
    #         broker: 증권사 구분 ("kiwoom" | "kis" | "ls")
    #
    #     Returns:
    #         주문 가능 예수금 (원). 조회 실패 시 0 반환.
    #     """
    #     raise NotImplementedError
