"""prev_price_cache 추세 계산 검증 스크립트.

목적:
- PriceData._calculate_trend()의 기본 추세 분류가 기대대로 동작하는지 확인
- PriceData.set_prices()의 날짜 정렬 결과가 추세에 미치는 영향을 확인
- 날짜 포맷(YYYY-MM-DD / YYYYMMDD) 혼합 시 잠재 이슈를 빠르게 진단

실행:
    uv run python tools/chk_prev_price_cache.py
"""

from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable

# tools 폴더에서 직접 실행해도 backend 모듈을 찾을 수 있도록 프로젝트 루트를 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.domains.infrahub.prev_price_cache import PriceData, Trend, get_prev_price_cache


@dataclass(slots=True)
class TrendCase:
    name: str
    prices: list[float]
    expected: Trend


def _make_dates(start: str, count: int, fmt: str = "%Y-%m-%d") -> list[str]:
    """연속 날짜 문자열 생성."""
    base = datetime.strptime(start, "%Y-%m-%d")
    return [(base + timedelta(days=i)).strftime(fmt) for i in range(count)]


def _normalize_ymd(date_str: str) -> str:
    """YYYY-MM-DD / YYYYMMDD를 YYYYMMDD로 정규화한다."""
    if len(date_str) == 10 and "-" in date_str:
        return date_str.replace("-", "")
    return date_str


def _calc_by_normalized_date(dates: Iterable[str], prices: Iterable[float]) -> Trend:
    """날짜를 정규화해서 정렬한 뒤 추세를 계산한다.

    참고값(기대값) 계산용이며, 현재 구현(set_prices)의 동작과 비교하는 데 사용한다.
    """
    sorted_data = sorted(
        zip(dates, prices),
        key=lambda x: _normalize_ymd(x[0]),
    )
    sorted_prices = [p for _, p in sorted_data]
    return PriceData._calculate_trend(sorted_prices)


def run_trend_cases() -> tuple[int, int]:
    """순수 가격 기반 추세 판별 테스트 실행."""
    cases: list[TrendCase] = [
        TrendCase("데이터 1개", [100], "데이터 부족"),
        TrendCase("5일 연속 오름", [100, 101, 102, 103, 104], "5일연속 오름"),
        TrendCase("5일 연속 하락", [104, 103, 102, 101, 100], "5일연속 하락"),
        TrendCase("3연속 오름", [120, 118, 119, 120, 121], "3연속 오름"),
        TrendCase("3연속 하락", [120, 122, 121, 120, 119], "3연속 하락"),
        TrendCase("등락 중", [100, 102, 101, 103, 102], "등락 중"),
    ]

    ok = 0
    fail = 0

    print("\n=== 1) _calculate_trend 기본 케이스 ===")
    for case in cases:
        actual = PriceData._calculate_trend(case.prices)
        is_ok = actual == case.expected
        mark = "OK" if is_ok else "FAIL"
        print(
            f"[{mark}] {case.name:14} expected={case.expected:10} actual={actual:10} prices={case.prices}"
        )
        if is_ok:
            ok += 1
        else:
            fail += 1

    return ok, fail


def run_set_prices_cases() -> tuple[int, int, int]:
    """set_prices 정렬/추세 계산 관련 테스트 실행.

    반환값:
        (ok, fail, warn)
    """
    ok = 0
    fail = 0
    warn = 0

    print("\n=== 2) set_prices 날짜 정렬 케이스 ===")

    # 케이스 A: 날짜가 뒤섞여 있어도 정렬 후 5일 오름이 나와야 함
    dates_a = ["2026-04-05", "2026-04-03", "2026-04-04", "2026-04-01", "2026-04-02"]
    prices_a = [105, 103, 104, 101, 102]
    expected_a: Trend = "5일연속 오름"

    pd_a = PriceData()
    pd_a.set_prices(dates_a, prices_a)
    if pd_a.trend == expected_a:
        print(f"[OK] 날짜 뒤섞임 정렬 추세 expected={expected_a} actual={pd_a.trend}")
        ok += 1
    else:
        print(f"[FAIL] 날짜 뒤섞임 정렬 추세 expected={expected_a} actual={pd_a.trend}")
        fail += 1

    # 케이스 B: 12일 입력 시 최근 10일만 유지되는지 확인
    dates_b = _make_dates("2026-04-01", 12)
    prices_b = list(range(100, 112))

    pd_b = PriceData()
    pd_b.set_prices(dates_b, prices_b)
    length_ok = len(pd_b.prices) == 10 and len(pd_b.dates) == 10
    trend_ok = pd_b.trend == "5일연속 오름"
    if length_ok and trend_ok:
        print(
            "[OK] 12일 입력 -> 최근 10일 유지 및 추세 정상 "
            f"(len={len(pd_b.prices)}, trend={pd_b.trend})"
        )
        ok += 1
    else:
        print(
            "[FAIL] 12일 입력 검증 실패 "
            f"(len={len(pd_b.prices)}, trend={pd_b.trend})"
        )
        fail += 1

    # 케이스 C: 날짜 포맷 혼합(YYYY-MM-DD, YYYYMMDD) 진단
    # 현재 set_prices는 문자열 정렬이므로, 포맷이 섞이면 의도와 다르게 정렬될 수 있다.
    dates_c = ["2026-04-01", "20260402", "2026-04-03", "20260404", "2026-04-05"]
    prices_c = [100, 101, 102, 103, 104]

    pd_c = PriceData()
    pd_c.set_prices(dates_c, prices_c)
    current_trend = pd_c.trend
    normalized_trend = _calc_by_normalized_date(dates_c, prices_c)

    if current_trend == normalized_trend:
        print(
            "[OK] 날짜 포맷 혼합 케이스도 결과 일치 "
            f"(current={current_trend}, normalized={normalized_trend})"
        )
        ok += 1
    else:
        print(
            "[WARN] 날짜 포맷 혼합 시 결과 차이 감지 "
            f"(current={current_trend}, normalized={normalized_trend})"
        )
        print("       -> set_prices의 날짜 정렬 키 보강이 필요할 수 있습니다.")
        warn += 1

    return ok, fail, warn


async def run_real_data_cases() -> tuple[int, int, int]:
    """실제 API 데이터로 3개 종목 추세를 확인한다."""
    ok = 0
    fail = 0
    warn = 0

    print("\n=== 3) 실제 데이터 점검 (현대건설/삼성전자/현대글로비스) ===")

    # 사용자가 제공한 계좌 화면상의 추세(비교 기준)
    target_stocks: list[tuple[str, str, Trend]] = [
        ("000720", "현대건설", "등락 중"),
        ("005930", "삼성전자", "등락 중"),
        ("086280", "현대글로비스", "등락 중"),
    ]

    cache = get_prev_price_cache()

    for stk_cd, stk_nm, account_trend in target_stocks:
        print(f"\n- {stk_nm} ({stk_cd})")
        try:
            trend = await cache.get_last_trend(stk_cd)
            last_price = await cache.get_last_price(stk_cd)
            data = await cache.get(stk_cd)

            if not data or not data.prices or not data.dates:
                print("  [FAIL] 가격 데이터가 비어 있습니다.")
                fail += 1
                continue

            normalized_trend = _calc_by_normalized_date(data.dates, data.prices)
            print(f"  계좌표시 추세: {account_trend}")
            print(f"  캐시 계산 추세: {trend}")
            print(f"  정규화 재계산: {normalized_trend}")
            print(f"  어제 종가 추정: {last_price}")

            # 최근 10일 데이터 출력
            print("  최근 가격(오래된 순):")
            for date_str, price in zip(data.dates, data.prices):
                print(f"    {date_str} -> {price}")

            if trend != normalized_trend:
                print("  [FAIL] 캐시 추세와 정규화 재계산 추세가 다릅니다.")
                fail += 1
                continue

            if trend == account_trend:
                print("  [OK] 계좌표시 추세와 캐시 계산 추세가 일치합니다.")
                ok += 1
            else:
                print("  [WARN] 계좌표시 추세와 캐시 계산 추세가 다릅니다.")
                warn += 1

        except Exception as e:
            print(f"  [FAIL] 실제 데이터 조회 실패: {e}")
            fail += 1

    return ok, fail, warn


def main() -> int:
    total_ok = 0
    total_fail = 0
    total_warn = 0

    ok, fail = run_trend_cases()
    total_ok += ok
    total_fail += fail

    ok, fail, warn = run_set_prices_cases()
    total_ok += ok
    total_fail += fail
    total_warn += warn

    ok, fail, warn = asyncio.run(run_real_data_cases())
    total_ok += ok
    total_fail += fail
    total_warn += warn

    print("\n=== 요약 ===")
    print(f"OK   : {total_ok}")
    print(f"FAIL : {total_fail}")
    print(f"WARN : {total_warn}")

    # FAIL이 있으면 비정상 종료 코드로 반환
    return 1 if total_fail > 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
