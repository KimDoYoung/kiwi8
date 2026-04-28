"""
CurrentPricer 현재가 조회 테스트

시장 상황(KRX/NXT/휴장)에 따라 올바른 API를 선택하는지 검증합니다.

실행 방법:
    cd /home/kdy987/work/kiwi8
    python tools/chk_current_pricer.py

테스트 항목:
    1. 단일 종목 현재가 조회 (get_price1)
    2. 복수 종목 현재가 조회 (get_price_multi)
    3. 현재 시장 상황 출력 (OpenTimeChecker 연동 확인)
    4. 캐시 동작 확인
"""

import asyncio
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.core.logger import get_logger
from backend.domains.infrahub.current_pricer import CurrentPricer
from backend.domains.infrahub.open_time_checker import OpenTimeChecker, now_kst

logger = get_logger(__name__)

# 테스트할 종목 코드
TEST_CODES_SINGLE = "005930"  # 삼성전자
TEST_CODES_MULTI = [
    "005930",  # 삼성전자
    "000660",  # SK하이닉스
    "035720",  # 카카오
    "035420",  # NAVER
    "051910",  # LG화학
]

SEP = "=" * 60


def print_sep(title: str = ""):
    print(f"\n{SEP}")
    if title:
        print(f"  {title}")
        print(SEP)


async def check_market_status():
    """현재 시장 상황 출력"""
    print_sep("현재 시장 상황")
    checker = OpenTimeChecker.get()
    dt = now_kst()
    t = dt.time()

    is_open = await checker.is_open_day(dt.date())
    price_market = await checker.market_choice_for_price(dt)
    trade_market = await checker.market_choice_for_trade(dt)
    is_krx = checker.isKrxTime(dt)
    is_nxt = checker.isNxtTime(dt)

    print(f"  현재 시각     : {dt.strftime('%Y-%m-%d %H:%M:%S')} (KST)")
    print(f"  영업일 여부   : {'✅ 영업일' if is_open else '❌ 휴장일'}")
    print(f"  KRX 시간대    : {'✅ KRX 정규장' if is_krx else '❌'}")
    print(f"  NXT 시간대    : {'✅ NXT 운영중' if is_nxt else '❌'}")
    print(f"  가격조회 시장 : {price_market}")
    print(f"  매매 가능 시장: {trade_market or '없음 (매매불가)'}")

    return is_open, price_market


async def test_single_price():
    """단일 종목 현재가 조회 테스트"""
    print_sep(f"단일 종목 현재가 조회: {TEST_CODES_SINGLE}")
    pricer = CurrentPricer.get()

    try:
        price = await pricer.get_price1(TEST_CODES_SINGLE)
        if price > 0:
            print(f"  ✅ {TEST_CODES_SINGLE} 현재가: {price:,}원")
        else:
            print(f"  ⚠️  {TEST_CODES_SINGLE} 현재가: 0원 (조회 실패 또는 장 마감)")
    except Exception as e:
        print(f"  ❌ 조회 실패: {e}")
        logger.exception(f"단일 종목 조회 예외: {e}")


async def test_multi_price():
    """복수 종목 현재가 조회 테스트"""
    print_sep(f"복수 종목 현재가 조회: {len(TEST_CODES_MULTI)}개 종목")
    pricer = CurrentPricer.get()

    try:
        prices = await pricer.get_price_multi(TEST_CODES_MULTI)

        # 종목명 매핑 (간단한 표시용)
        names = {
            "005930": "삼성전자",
            "000660": "SK하이닉스",
            "035720": "카카오",
            "035420": "NAVER",
            "051910": "LG화학",
        }

        success_count = 0
        for code in TEST_CODES_MULTI:
            price = prices.get(code, 0)
            name = names.get(code, code)
            if price > 0:
                print(f"  ✅ [{code}] {name:<12}: {price:>10,}원")
                success_count += 1
            else:
                print(f"  ⚠️  [{code}] {name:<12}: 조회 실패 (0원)")

        print(f"\n  결과: {success_count}/{len(TEST_CODES_MULTI)}개 종목 조회 성공")

    except Exception as e:
        print(f"  ❌ 조회 실패: {e}")
        logger.exception(f"복수 종목 조회 예외: {e}")


async def test_cache():
    """캐시 동작 확인"""
    print_sep("캐시 동작 확인")
    pricer = CurrentPricer.get()
    code = TEST_CODES_SINGLE

    # 1차 조회 (캐시 없을 수도 있음)
    print(f"  [1차 조회] {code}...")
    t1 = datetime.now()
    price1 = await pricer.get_price1(code)
    elapsed1 = (datetime.now() - t1).total_seconds()
    print(f"  결과: {price1:,}원 (소요: {elapsed1:.3f}s)")

    # 2차 조회 (메모리 캐시 히트 예상)
    print(f"\n  [2차 조회 - 메모리 캐시 히트 예상] {code}...")
    t2 = datetime.now()
    price2 = await pricer.get_price1(code)
    elapsed2 = (datetime.now() - t2).total_seconds()
    print(f"  결과: {price2:,}원 (소요: {elapsed2:.3f}s)")

    if elapsed2 < elapsed1 * 0.5 or elapsed2 < 0.01:
        print("  ✅ 2차 조회가 빠름 (캐시 효과 확인)")
    else:
        print("  ℹ️  캐시 효과 불명확 (네트워크 편차일 수 있음)")

    # 메모리 캐시 초기화 후 재조회
    print(f"\n  [메모리 캐시 초기화 후 재조회] {code}...")
    pricer.clear_mem_cache()
    t3 = datetime.now()
    price3 = await pricer.get_price1(code)
    elapsed3 = (datetime.now() - t3).total_seconds()
    print(f"  결과: {price3:,}원 (소요: {elapsed3:.3f}s)")
    print(f"  ℹ️  메모리 캐시 없이 CacheManager 또는 API 조회")


async def test_large_multi():
    """50개 초과 종목 분할 처리 테스트 (소수 종목으로 대체)"""
    print_sep("LS t8407 멀티 조회 (분할 처리 확인)")
    pricer = CurrentPricer.get()

    # 10개 코드로 테스트
    codes = [
        "005930", "000660", "035720", "035420", "051910",
        "005380", "012330", "000270", "068270", "207940",
    ]

    try:
        prices = await pricer.get_price_multi(codes)
        success = sum(1 for p in prices.values() if p > 0)
        print(f"  결과: {success}/{len(codes)}개 종목 조회 성공")
        for code, price in prices.items():
            marker = "✅" if price > 0 else "⚠️ "
            print(f"    {marker} {code}: {price:,}원")
    except Exception as e:
        print(f"  ❌ 조회 실패: {e}")
        logger.exception(f"멀티 조회 예외: {e}")


async def main():
    print(f"\n{'#' * 60}")
    print("  CurrentPricer 현재가 조회 테스트")
    print(f"{'#' * 60}")

    # 시장 상황 확인
    is_open, price_market = await check_market_status()

    if not is_open:
        print("\n  ⚠️  현재 휴장일입니다. 캐시 우선 또는 KIS NXT로 조회합니다.")
    elif price_market == "KRX":
        print("\n  ℹ️  KRX 정규장 시간: LS t8407(멀티) 우선 사용")
    else:
        print("\n  ℹ️  NXT 시간대 또는 장 외 시간: KIS 사용")

    # 각 테스트 실행
    await test_single_price()
    await test_multi_price()
    await test_cache()
    await test_large_multi()

    print(f"\n{SEP}")
    print("  테스트 완료")
    print(SEP)


if __name__ == "__main__":
    asyncio.run(main())
