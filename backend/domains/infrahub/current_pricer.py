# backend/domains/infrahub/current_pricer.py
"""
모듈 설명:
    - 주식 현재가를 조회하는 싱글톤 클래스
    - 시장 상황(KRX/NXT/휴장)에 따라 최적의 API를 선택하여 현재가를 반환한다.
    - KIS(한국투자증권): FHKST01010100 → 단일/복수 모두 지원
    - LS증권: t8407 → KRX 정규장 시간에만, 최대 50개 멀티 조회 지원

시장 상황별 API 선택 규칙:
    1. KRX 정규장 (09:00~15:30): LS t8407 우선(멀티), 단일은 KIS
    2. NXT After market (15:40~20:00): 장이 열리는 날이라면 KIS NXT 강제
    3. NXT Pre market (08:00~08:50): KIS NXT
    4. 모든 장 종료 (20:00 이후) 또는 휴장일: 캐시 우선, 없으면 KIS NXT

캐시 전략:
    - CacheManager를 통해 (stk_cd, "current_price") 단위로 캐싱
    - 장이 진행 중일 때는 캐시를 사용하지 않음 (실시간 조회)
    - 장이 종료된 후에는 캐시 우선 사용

사용법 예시:
    ```python
    from backend.domains.infrahub.current_pricer import CurrentPricer

    pricer = CurrentPricer.get()

    # 단일 종목 현재가
    price = await pricer.get_price1("005930")

    # 복수 종목 현재가
    prices = await pricer.get_price_multi(["005930", "000660", "035720"])
    ```

작성자: kiwi8
작성일: 2026-04-28
"""
from __future__ import annotations

import asyncio
import json
from datetime import time

from backend.core.logger import get_logger
from backend.domains.infrahub.open_time_checker import OpenTimeChecker, now_kst
from backend.domains.services.cache_keys import CacheKey

logger = get_logger(__name__)

# LS t8407 최대 조회 가능 종목수
_LS_MAX_CODES = 50


def _is_all_market_closed(t_now: time) -> bool:
    """모든 시장(KRX + NXT)이 종료된 시각인지 확인 (20:00 이후 또는 08:00 이전)"""
    return t_now >= time(20, 0) or t_now < time(8, 0)


def _is_after_market_active(t_now: time) -> bool:
    """NXT After market 시간 (15:40~20:00) 여부"""
    return time(15, 40) <= t_now < time(20, 0)


class CurrentPricer:
    """
    주식 현재가 조회 싱글톤 클래스

    시장 상황(시간대, 영업일 여부)을 판단하여
    KIS 또는 LS 중 가장 적합한 API를 선택해 현재가를 반환한다.
    """

    _instance: CurrentPricer | None = None
    _lock = asyncio.Lock()

    def __init__(self):
        # 메모리 캐시: {stk_cd: price}
        # 장이 닫혔을 때 재사용
        self._mem_cache: dict[str, int] = {}

    @classmethod
    def get(cls) -> CurrentPricer:
        """싱글톤 인스턴스 반환"""
        if cls._instance is None:
            cls._instance = CurrentPricer()
        return cls._instance

    # ------------------------------------------------------------------
    # 공개 인터페이스
    # ------------------------------------------------------------------

    async def get_price1(self, stk_cd: str) -> int:
        """
        단일 종목 현재가 조회

        Args:
            stk_cd: 종목코드 (예: "005930")

        Returns:
            현재가 (int). 조회 실패 시 0 반환.
        """
        result = await self.get_price_multi([stk_cd])
        return result.get(stk_cd, 0)

    async def get_price_multi(self, stk_cds: list[str]) -> dict[str, int]:
        """
        복수 종목 현재가 조회

        Args:
            stk_cds: 종목코드 리스트 (최대 50개 권장)

        Returns:
            {stk_cd: 현재가(int)} 딕셔너리. 조회 실패 종목은 0.
        """
        if not stk_cds:
            return {}

        checker = OpenTimeChecker.get()
        dt = now_kst()
        t_now = dt.time()

        is_open = await checker.is_open_day(dt.date())
        price_market = await checker.market_choice_for_price(dt)

        # --- 시장 상황 판별 ---
        if not is_open or _is_all_market_closed(t_now):
            # 휴장일이거나 모든 장이 종료된 시간 → 캐시 우선
            logger.debug(f"[CurrentPricer] 캐시 우선 모드 (is_open={is_open}, t={t_now})")
            return await self._get_with_cache_first(stk_cds, market_div="NX")

        if price_market == "KRX":
            # KRX 정규장 시간 (09:00~15:30) → LS 멀티 조회 우선
            logger.debug(f"[CurrentPricer] KRX 정규장 모드 (t={t_now})")
            return await self._get_krx_prices(stk_cds)

        # NXT 시간대 (Pre market 또는 After market)
        if _is_after_market_active(t_now):
            # After market (15:40~20:00): 장이 열리는 날이므로 KIS에서 반드시 조회
            logger.debug(f"[CurrentPricer] NXT After market 모드 (t={t_now})")
            return await self._get_from_kis_multi(stk_cds, market_div="NX", use_cache=False)
        else:
            # Pre market (08:00~08:50)
            logger.debug(f"[CurrentPricer] NXT Pre market 모드 (t={t_now})")
            return await self._get_from_kis_multi(stk_cds, market_div="NX", use_cache=False)

    # ------------------------------------------------------------------
    # 내부 조회 메서드
    # ------------------------------------------------------------------

    async def _get_krx_prices(self, stk_cds: list[str]) -> dict[str, int]:
        """
        KRX 정규장 시간: LS t8407 멀티 조회 우선.
        50개 초과 시 분할 처리. LS 실패 시 KIS로 fallback.
        """
        result: dict[str, int] = {}

        # 50개씩 분할
        chunks = [stk_cds[i:i + _LS_MAX_CODES] for i in range(0, len(stk_cds), _LS_MAX_CODES)]

        for chunk in chunks:
            try:
                chunk_result = await self._get_from_ls_t8407(chunk)
                result.update(chunk_result)
            except Exception as e:
                logger.warning(f"[CurrentPricer] LS t8407 조회 실패, KIS로 fallback: {e}")
                # LS 실패 종목만 KIS로 재조회
                failed_codes = [c for c in chunk if c not in result or result[c] == 0]
                if failed_codes:
                    fallback = await self._get_from_kis_multi(failed_codes, market_div="J", use_cache=False)
                    result.update(fallback)

        # 조회되지 않은 종목 0으로 채움
        for code in stk_cds:
            result.setdefault(code, 0)

        return result

    async def _get_with_cache_first(
        self, stk_cds: list[str], market_div: str
    ) -> dict[str, int]:
        """
        캐시 우선 조회.
        캐시 히트: 캐시 값 반환.
        캐시 미스: KIS API 조회 후 캐시 저장.
        """
        result: dict[str, int] = {}
        miss_codes: list[str] = []

        for stk_cd in stk_cds:
            cached = await self._load_from_cache(stk_cd)
            if cached is not None:
                result[stk_cd] = cached
            else:
                miss_codes.append(stk_cd)

        if miss_codes:
            # 캐시 미스 종목은 KIS로 조회
            fetched = await self._get_from_kis_multi(miss_codes, market_div=market_div, use_cache=True)
            result.update(fetched)

        for code in stk_cds:
            result.setdefault(code, 0)

        return result

    async def _get_from_ls_t8407(self, stk_cds: list[str]) -> dict[str, int]:
        """
        LS증권 t8407 (API용 주식 멀티현재가조회) 호출.
        종목코드를 붙여서 입력 (6자리 * n개).
        """
        from backend.domains.stkcompanys.ls.ls_service import get_ls_api
        from backend.domains.stkcompanys.ls.models.ls_schema import LsRequest

        # 6자리로 zero-padding 후 연결
        shcode = "".join(c.zfill(6) for c in stk_cds)

        request = LsRequest(
            api_id="t8407",
            payload={
                "nrec": len(stk_cds),
                "shcode": shcode,
            },
        )

        ls_api = await get_ls_api()
        response = await ls_api.send_request(request)

        result: dict[str, int] = {}

        if not response.success:
            logger.error(f"[CurrentPricer] LS t8407 실패: {response.error_message}")
            return result

        blocks = (response.data or {}).get("t8407OutBlock1", [])
        if not isinstance(blocks, list):
            blocks = [blocks] if blocks else []

        for item in blocks:
            code = str(item.get("shcode", "")).strip().lstrip("0").zfill(6)
            # 실제 종목코드 매핑 (요청한 코드 기준)
            price_raw = item.get("price", 0)
            try:
                price = int(float(price_raw))
            except (ValueError, TypeError):
                price = 0

            # shcode를 키로 저장 (요청 코드와 동일 형식)
            raw_code = str(item.get("shcode", "")).strip()
            result[raw_code] = price

        logger.info(f"[CurrentPricer] LS t8407 조회 완료: {len(result)}개 종목")
        return result

    async def _get_from_kis_multi(
        self,
        stk_cds: list[str],
        market_div: str,
        use_cache: bool = False,
    ) -> dict[str, int]:
        """
        KIS FHKST01010100을 사용해 복수 종목 현재가 조회 (개별 호출).

        Args:
            stk_cds: 종목코드 리스트
            market_div: "J" (KRX), "NX" (NXT), "UN" (통합)
            use_cache: True이면 조회 결과를 캐시에 저장
        """
        tasks = [self._get_from_kis_single(code, market_div, use_cache) for code in stk_cds]
        prices = await asyncio.gather(*tasks, return_exceptions=True)

        result: dict[str, int] = {}
        for code, price in zip(stk_cds, prices):
            if isinstance(price, Exception):
                logger.warning(f"[CurrentPricer] KIS 단일 조회 실패 {code}: {price}")
                result[code] = 0
            else:
                result[code] = price  # type: ignore[assignment]

        return result

    async def _get_from_kis_single(
        self, stk_cd: str, market_div: str, use_cache: bool
    ) -> int:
        """
        KIS FHKST01010100 단일 종목 현재가 조회.

        Args:
            stk_cd: 종목코드
            market_div: "J" (KRX), "NX" (NXT), "UN" (통합)
            use_cache: True이면 결과를 캐시에 저장(메모리/DB), False이면 캐시 쓰기 금지

        Returns:
            현재가 (int). 실패 시 0.
        """
        from backend.domains.stkcompanys.kis.kis_service import get_kis_api
        from backend.domains.stkcompanys.kis.models.kis_schema import KisRequest

        request = KisRequest(
            api_id="FHKST01010100",
            payload={
                "FID_COND_MRKT_DIV_CODE": market_div,
                "FID_INPUT_ISCD": stk_cd,
            },
        )

        try:
            kis_api = await get_kis_api()
            response = await kis_api.send_request(request)

            if not response.success:
                logger.warning(
                    f"[CurrentPricer] KIS FHKST01010100 실패 {stk_cd}: {response.error_message}"
                )
                return 0

            output = (response.data or {}).get("output", {})
            stck_prpr = output.get("stck_prpr", "0")
            try:
                price = int(stck_prpr)
            except (ValueError, TypeError):
                price = 0

            if use_cache and price > 0:
                await self._save_to_cache(stk_cd, price)

            logger.debug(f"[CurrentPricer] KIS 조회 완료: {stk_cd} = {price:,}원")
            return price

        except Exception as e:
            logger.error(f"[CurrentPricer] KIS 조회 예외 {stk_cd}: {e}")
            return 0

    # ------------------------------------------------------------------
    # 캐시 관련
    # ------------------------------------------------------------------

    async def _load_from_cache(self, stk_cd: str) -> int | None:
        """
        캐시에서 현재가 로드.
        메모리 캐시 → CacheManager 순서로 조회.

        Returns:
            캐시된 가격(int) 또는 None (미존재)
        """
        # 1. 메모리 캐시 우선
        if stk_cd in self._mem_cache:
            return self._mem_cache[stk_cd]

        # 2. CacheManager (DB 기반)
        try:
            from backend.domains.services.cache_manager import CacheManager
            cache_mgr = CacheManager.get_instance()
            raw = await cache_mgr.get(stk_cd, CacheKey.CURRENT_PRICE)
            if raw is not None:
                price = int(json.loads(raw))
                self._mem_cache[stk_cd] = price
                return price
        except Exception as e:
            logger.debug(f"[CurrentPricer] 캐시 로드 실패 {stk_cd}: {e}")

        return None

    async def _save_to_cache(self, stk_cd: str, price: int) -> None:
        """현재가를 CacheManager에 저장"""
        try:
            from backend.domains.services.cache_manager import CacheManager
            cache_mgr = CacheManager.get_instance()
            await cache_mgr.put(stk_cd, CacheKey.CURRENT_PRICE, json.dumps(price))
            self._mem_cache[stk_cd] = price
        except Exception as e:
            logger.debug(f"[CurrentPricer] 캐시 저장 실패 {stk_cd}: {e}")

    def clear_mem_cache(self) -> None:
        """메모리 캐시 초기화 (장 시작 전 호출 권장)"""
        self._mem_cache.clear()
        logger.info("[CurrentPricer] 메모리 캐시 초기화 완료")
