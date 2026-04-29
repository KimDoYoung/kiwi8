# backend/domains/infrahub/open_time_checker.py
# open_time_checker.py
"""
모듈 설명: 
    - 주식 시장의 개장 및 휴장 시간을 확인하고, 현재 시각에 적합한 시장(KRX/NXT)을 선택하는 기능을 제공합니다.
    - 싱글레톤 패턴으로 구현되어 있습니다.

사용법 예시:
    ```python
    from backend.domains.infrahub.open_time_checker import OpenTimeChecker
    from datetime import datetime
    
    checker = OpenTimeChecker.get()
    
    # 1. 오늘이 장이 열리는 날인지 확인 (토/일/공휴일 제외)
    is_open = await checker.is_open_day() # True or False
    
    # 2. 현재 시각 기준 가격 조회를 위한 시장 선택
    # - 장 중(09:00-15:30)이면 KRX, 그 외 시간이나 휴장일에는 NXT 반환
    price_market = await checker.market_choice_for_price() # "KRX" or "NXT"
    
    # 3. 현재 시각 기준 매매 가능 시장 선택
    # - 휴장일이면 None
    # - KRX 시간(09:00-15:30)이면 KRX
    # - NXT 시간(Pre/Main/After)이면 NXT
    # - 그 외 매매 불가 시간이면 None
    trade_market = await checker.market_choice_for_trade() # "KRX", "NXT" or None
    ```

작성자: 김도영
작성일: 2025-08-14
버전: 1.2 (주석 보강 및 사용법 추가)
"""
from __future__ import annotations

import asyncio
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import Literal
from zoneinfo import ZoneInfo

import aiohttp

from backend.core.config import config  # GODATA_API_KEY, TZ
from backend.domains.services.cache_keys import CacheKey

Market = Literal["KRX", "NXT"]
KST = ZoneInfo(getattr(config, "TIME_ZONE", "Asia/Seoul"))

def now_kst() -> datetime:
    """현재 한국 표준시 반환"""
    return datetime.now(tz=KST)

def yyyymmdd(d: date) -> str:
    """date 객체를 yyyymmdd 문자열로 변환"""
    return d.strftime("%Y%m%d")

@dataclass
class _MonthCache:
    """월별 휴장일 데이터를 위한 메모리 캐시 구조체"""
    holidays: set[str] = field(default_factory=set)  # {"20250815", ...}
    last_fetch_ymd: str = ""                        # 이 월 데이터를 마지막으로 가져온 날짜

class OpenTimeChecker:
    """정부공휴일 + 주말 기반 휴장/영업시간(KRX/NXT) 판정 (DB 및 메모리 캐시 활용)"""
    _instance: OpenTimeChecker | None = None
    _fetch_lock = asyncio.Lock()

    def __init__(self):
        self._today_key: str | None = None
        self._today_is_holiday: bool | None = None
        self._month_cache: dict[tuple[int, int], _MonthCache] = {}
        self._api_url = getattr(
            config, 
            "GODATA_URL",
            "http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo"
        )
        self._api_key = config.GODATA_API_KEY

    @classmethod
    def get(cls) -> OpenTimeChecker:
        """싱글레톤 인스턴스 반환"""
        if cls._instance is None:
            cls._instance = OpenTimeChecker()
        return cls._instance

    async def getMarket(self, dt: datetime | None = None) -> Market | None:
        """현재 시각 기준 운영 중인 시장 반환 (KRX 우선)"""
        dt = dt.astimezone(KST) if dt else now_kst()
        if await self.isHoliday(dt.date()):
            return None
        if self.isKrxTime(dt):
            return "KRX"
        if self.isNxtTime(dt):
            return "NXT"
        return None

    async def is_open_day(self, d: date | None = None) -> bool:
        """
        해당 날짜가 장이 열리는 날(영업일)인지 확인합니다.
        
        - 토요일, 일요일은 False
        - 공공데이터 API를 통한 공휴일 정보 확인
        - CacheManager를 통해 결과를 캐싱하여 불필요한 API 호출 방지
        """
        d = d or now_kst().date()
        key = yyyymmdd(d)
        
        try:
            from backend.domains.services.cache_manager import CacheManager
            cache_mgr = CacheManager.get_instance()
            
            # 1. cache_manager에서 먼저 확인
            cached_val = await cache_mgr.get("SYSTEM", f"{CacheKey.OPENDAY}_{key}")
            if cached_val:
                return cached_val == "Y"
        except Exception:
            pass

        # 2. 휴장일(주말 포함) 체크
        is_hol = await self.isHoliday(d)
        is_open = not is_hol
        
        try:
            # 3. 결과 캐싱
            val = "Y" if is_open else "N"
            await cache_mgr.put("SYSTEM", f"{CacheKey.OPENDAY}_{key}", val)
        except Exception:
            pass

        return is_open

    async def market_choice_for_price(self, dt: datetime | None = None) -> Market:
        """
        가격 정보를 가져오기 위해 현재 시각을 기준으로 KRX, NXT 중 하나를 선택합니다.
        
        - 장 오픈일이고 KRX 정규장 시간(09:00-15:30)이면 'KRX' 반환
        - 그 외 모든 상황(장 마감 후, 휴장일 등)에서는 'NXT' 반환 (데이터 조회를 위해)
        """
        dt = dt.astimezone(KST) if dt else now_kst()
        
        if await self.is_open_day(dt.date()):
            if self.isKrxTime(dt):
                return "KRX"
            else:
                return "NXT"
        else:
            return "NXT"

    async def market_choice_for_trade(self, dt: datetime | None = None) -> Market | None:
        """
        매매 가능 여부를 판단하고 현재 시각을 기준으로 KRX, NXT 중 적합한 시장을 선택합니다.
        
        - 장 오픈일이 아니면 None 반환
        - KRX 정규장 시간(09:00-15:30)이면 'KRX' 반환
        - NXT 운영 시간(Pre/Main/After)이면 'NXT' 반환
        - 매매 가능 시간이 아니면 None 반환
        """
        dt = dt.astimezone(KST) if dt else now_kst()
        
        if not await self.is_open_day(dt.date()):
            return None
            
        if self.isKrxTime(dt):
            return "KRX"
        
        if self.isNxtTime(dt):
            return "NXT"
            
        return None

    async def isHoliday(self, d: date | None = None) -> bool:
        """주말 및 정부 지정 공휴일 여부 확인"""
        d = d or now_kst().date()
        key = yyyymmdd(d)

        if self._today_key == key and self._today_is_holiday is not None:
            return self._today_is_holiday

        if d.weekday() >= 5: # 토, 일
            self._set_today_cache(key, True)
            return True

        hol_set = await self._get_month_holidays(d.year, d.month, today_ymd=key)

        if d.day >= 25:
            asyncio.create_task(self._prefetch_next_month(d, today_ymd=key))

        is_hol = key in hol_set
        self._set_today_cache(key, is_hol)
        return is_hol

    def isKrxTime(self, dt: datetime | None = None) -> bool:
        """KRX 정규장 시간(09:00 - 15:30) 여부 확인"""
        dt = dt.astimezone(KST) if dt else now_kst()
        t = dt.time()
        return time(9, 0) <= t < time(15, 30)

    def isNxtTime(self, dt: datetime | None = None) -> bool:
        """
        NXT 운영 시간 여부 확인
        1. Pre market   : 08:00 - 08:50
        2. Main market  : 09:00:30 - 15:20
        3. After market : 15:40 - 20:00
        """
        dt = dt.astimezone(KST) if dt else now_kst()
        t = dt.time()
        pre = time(8, 0) <= t < time(8, 50)
        main = time(9, 0, 30) <= t < time(15, 20)
        after = time(15, 40) <= t < time(20, 0)
        return pre or main or after

    async def force_refresh(self):
        """메모리 캐시 강제 초기화"""
        self._today_key = None
        self._today_is_holiday = None
        self._month_cache.clear()

    def _set_today_cache(self, key: str, value: bool):
        self._today_key = key
        self._today_is_holiday = value

    async def _get_month_holidays(self, year: int, month: int, today_ymd: str) -> set[str]:
        """특정 월의 휴장일 목록 조회 (메모리 캐시 활용)"""
        k = (year, month)

        async with self._fetch_lock:
            mc = self._month_cache.get(k)

            if mc is None:
                hol, fetched_today = await self._fetch_holidays_from_api(year, month), today_ymd
                self._month_cache[k] = _MonthCache(holidays=hol, last_fetch_ymd=fetched_today)
                return hol

            if mc.last_fetch_ymd != today_ymd:
                hol, fetched_today = await self._fetch_holidays_from_api(year, month), today_ymd
                mc.holidays = hol
                mc.last_fetch_ymd = fetched_today
                return hol

            return mc.holidays

    async def _prefetch_next_month(self, d: date, today_ymd: str):
        """다음 달 휴장일 미리 가져오기"""
        nm_year = d.year + (1 if d.month == 12 else 0)
        nm_month = 1 if d.month == 12 else d.month + 1
        _ = await self._get_month_holidays(nm_year, nm_month, today_ymd=today_ymd)

    async def _fetch_holidays_from_api(self, year: int, month: int) -> set[str]:
        """공공데이터 API를 통한 공휴일 정보 조회"""
        await asyncio.sleep(1) # Rate-limit 고려
        params = {
            "serviceKey": self._api_key,
            "solYear": str(year),
            "solMonth": f"{month:02d}",
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(self._api_url, params=params, ssl=False) as resp:
                    if resp.status != 200:
                        return set()
                    text = await resp.text()
        except Exception:
            return set()

        root = ET.fromstring(text)
        holidays = set()
        for item in root.findall(".//item"):
            if item.findtext("isHoliday") == "Y":
                loc = item.findtext("locdate")
                if loc:
                    holidays.add(loc.strip())
        return holidays
