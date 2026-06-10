"""
auto_trader.py — analyze_trend_signal / calc_trailing_stop / should_sell 단위 테스트
"""
import pytest
from backend.domains.infrahub.tick_data import TickData
from backend.domains.models.auto_trade_model import AutoTradePosition
from backend.domains.kdaemon.auto_trader import (
    analyze_trend_signal,
    calc_trailing_stop,
    should_sell,
)


# ── 헬퍼 ────────────────────────────────────────────────────

def make_pos(buy_price: int = 50_000, base_price: int | None = None,
             stop_rate: float = 0.05, max_volume_1min: int = 0) -> AutoTradePosition:
    bp = base_price if base_price is not None else buy_price
    return AutoTradePosition(
        stk_cd='000000', stk_nm='테스트', buy_price=buy_price,
        qty=100, amount=buy_price * 100,
        base_price=bp, stop_price=int(bp * (1 - stop_rate)),
        stop_rate=stop_rate, max_volume_1min=max_volume_1min,
    )


def tick(price: int = 50_000, vol_power: float | None = None,
         orderbook_ratio: float | None = None,
         volume_1min: int | None = None) -> TickData:
    return TickData(price=price, vol_power=vol_power,
                    orderbook_ratio=orderbook_ratio, volume_1min=volume_1min)


# ── 공통 ────────────────────────────────────────────────────

class TestEdgeCases:
    def test_too_few_ticks_returns_none(self):
        pos = make_pos()
        assert analyze_trend_signal([], pos) is None
        assert analyze_trend_signal([tick()], pos) is None
        assert analyze_trend_signal([tick(), tick()], pos) is None

    def test_exactly_3_ticks_ok(self):
        pos = make_pos(buy_price=50_000, base_price=50_000)
        ticks = [tick(50_000), tick(50_000), tick(50_000)]
        assert analyze_trend_signal(ticks, pos) is None  # 조건 미충족, 에러 없음


# ── trend_reversal ──────────────────────────────────────────

class TestTrendReversal:
    def test_price_hits_stop_triggers(self):
        pos = make_pos(buy_price=50_000, base_price=52_000, stop_rate=0.05)
        # stop_price = 52_000 * 0.95 = 49_400
        cur_price = 49_300
        ticks = [tick(52_000), tick(51_000), tick(cur_price)]
        assert analyze_trend_signal(ticks, pos) == 'trend_reversal'

    def test_price_above_stop_no_trigger(self):
        pos = make_pos(buy_price=50_000, base_price=52_000, stop_rate=0.05)
        # stop_price = 49_400
        ticks = [tick(52_000), tick(51_000), tick(49_500)]
        result = analyze_trend_signal(ticks, pos)
        assert result != 'trend_reversal'


# ── Signal A ────────────────────────────────────────────────

class TestSignalA:
    def test_orderbook_ratio_rising_price_flat_triggers(self):
        pos = make_pos(buy_price=50_000, base_price=52_000)
        ticks = [
            tick(52_000, orderbook_ratio=0.5),
            tick(52_000, orderbook_ratio=0.9),
            tick(52_000, orderbook_ratio=1.6),  # 3틱 연속 증가 + >= 1.5, 가격 정체
        ]
        assert analyze_trend_signal(ticks, pos) == 'signal_a'

    def test_orderbook_ratio_rising_but_price_up_no_trigger(self):
        pos = make_pos(buy_price=50_000, base_price=52_000)
        ticks = [
            tick(51_000, orderbook_ratio=0.5),
            tick(51_500, orderbook_ratio=0.7),
            tick(52_000, orderbook_ratio=0.9),  # 가격 상승 중 → 발동 안 됨
        ]
        assert analyze_trend_signal(ticks, pos) != 'signal_a'

    def test_orderbook_ratio_not_monotone_no_trigger(self):
        pos = make_pos(buy_price=50_000, base_price=52_000)
        ticks = [
            tick(52_000, orderbook_ratio=0.5),
            tick(52_000, orderbook_ratio=0.9),
            tick(52_000, orderbook_ratio=0.7),  # 마지막 틱 감소 → 발동 안 됨
        ]
        assert analyze_trend_signal(ticks, pos) != 'signal_a'

    def test_orderbook_ratio_none_no_trigger(self):
        pos = make_pos(buy_price=50_000, base_price=52_000)
        ticks = [
            tick(52_000, orderbook_ratio=None),
            tick(52_000, orderbook_ratio=0.7),
            tick(52_000, orderbook_ratio=0.9),
        ]
        assert analyze_trend_signal(ticks, pos) != 'signal_a'

    def test_hyundai_construction_case_blocked(self):
        """현대건설 실제 케이스: cur orderbook_ratio=1.32 < 1.5 → 차단돼야 함"""
        pos = make_pos(buy_price=122_400, base_price=124_100)
        ticks = [
            tick(123_900, orderbook_ratio=0.802),
            tick(124_100, orderbook_ratio=0.819),
            tick(123_800, orderbook_ratio=1.32),  # 1.32 < 1.5 → 차단
        ]
        assert analyze_trend_signal(ticks, pos) != 'signal_a'

    def test_strong_orderbook_pressure_triggers(self):
        """orderbook_ratio >= 1.5 → 발동"""
        pos = make_pos(buy_price=122_400, base_price=124_100)
        ticks = [
            tick(123_900, orderbook_ratio=0.8),
            tick(124_100, orderbook_ratio=1.1),
            tick(123_800, orderbook_ratio=1.6),  # 1.6 >= 1.5 → 발동
        ]
        assert analyze_trend_signal(ticks, pos) == 'signal_a'


# ── Signal B ────────────────────────────────────────────────

class TestSignalB:
    def test_hl_mando_case_blocked(self):
        """HL만도 실제 케이스: 마지막 하락 2.61p → 차단돼야 함"""
        pos = make_pos(buy_price=52_000, base_price=52_200)
        ticks = [
            tick(52_200, vol_power=160.52),
            tick(52_100, vol_power=138.41),
            tick(52_200, vol_power=135.80),  # prev→cur 2.61p < 3.0p
        ]
        assert analyze_trend_signal(ticks, pos) != 'signal_b'

    def test_strong_last_drop_triggers(self):
        """마지막 하락 3p 이상 + 전체 5p 이상 + 고점권 → 발동"""
        pos = make_pos(buy_price=52_000, base_price=52_200)
        ticks = [
            tick(52_200, vol_power=150.0),
            tick(52_200, vol_power=140.0),
            tick(52_200, vol_power=136.0),  # prev→cur 4.0p ≥ 3.0p, 전체 14p ≥ 5p
        ]
        assert analyze_trend_signal(ticks, pos) == 'signal_b'

    def test_total_drop_below_5_no_trigger(self):
        """전체 하락 5p 미만 → 발동 안 됨"""
        pos = make_pos(buy_price=52_000, base_price=52_200)
        ticks = [
            tick(52_200, vol_power=140.0),
            tick(52_200, vol_power=137.0),
            tick(52_200, vol_power=133.5),  # 전체 6.5p ≥ 5, 마지막 3.5p ≥ 3 → 발동
        ]
        assert analyze_trend_signal(ticks, pos) == 'signal_b'

    def test_last_drop_exact_3_triggers(self):
        """마지막 하락 정확히 3.0p → 발동"""
        pos = make_pos(buy_price=52_000, base_price=52_200)
        ticks = [
            tick(52_200, vol_power=155.0),
            tick(52_200, vol_power=143.0),
            tick(52_200, vol_power=140.0),  # prev→cur 3.0p, 전체 15p
        ]
        assert analyze_trend_signal(ticks, pos) == 'signal_b'

    def test_not_monotone_no_trigger(self):
        """단조 감소 아님 → 발동 안 됨"""
        pos = make_pos(buy_price=52_000, base_price=52_200)
        ticks = [
            tick(52_200, vol_power=150.0),
            tick(52_200, vol_power=130.0),
            tick(52_200, vol_power=135.0),  # cur > prev → 단조 아님
        ]
        assert analyze_trend_signal(ticks, pos) != 'signal_b'

    def test_price_below_high_zone_no_trigger(self):
        """고점권(highest * 0.97) 이탈 → 발동 안 됨"""
        pos = make_pos(buy_price=52_000, base_price=60_000)
        ticks = [
            tick(57_000, vol_power=150.0),  # 60_000 * 0.97 = 58_200 이하
            tick(57_000, vol_power=140.0),
            tick(57_000, vol_power=136.0),
        ]
        assert analyze_trend_signal(ticks, pos) != 'signal_b'


# ── Signal C ────────────────────────────────────────────────

class TestSignalC:
    def test_low_volume_2_ticks_triggers(self):
        pos = make_pos(buy_price=50_000, base_price=51_100, max_volume_1min=10_000)
        ticks = [
            tick(51_000, volume_1min=9_000),
            tick(51_100, volume_1min=1_500),  # < 10_000 * 0.20 = 2_000
            tick(51_100, volume_1min=1_800),  # < 2_000, 고점권
        ]
        assert analyze_trend_signal(ticks, pos) == 'signal_c'

    def test_one_low_volume_tick_no_trigger(self):
        pos = make_pos(buy_price=50_000, base_price=51_100, max_volume_1min=10_000)
        ticks = [
            tick(51_000, volume_1min=9_000),
            tick(51_100, volume_1min=5_000),  # 정상
            tick(51_100, volume_1min=1_800),  # 저거래량 1틱만
        ]
        assert analyze_trend_signal(ticks, pos) != 'signal_c'


# ── calc_trailing_stop ──────────────────────────────────────

class TestCalcTrailingStop:
    def test_price_rises_base_updates(self):
        new_base, new_stop = calc_trailing_stop(50_000, 55_000, 0.05)
        assert new_base == 55_000
        assert new_stop == int(55_000 * 0.95)

    def test_price_falls_base_unchanged(self):
        new_base, new_stop = calc_trailing_stop(55_000, 52_000, 0.05)
        assert new_base == 55_000
        assert new_stop == int(55_000 * 0.95)

    def test_price_equal_base_unchanged(self):
        new_base, new_stop = calc_trailing_stop(50_000, 50_000, 0.05)
        assert new_base == 50_000


# ── should_sell ─────────────────────────────────────────────

class TestShouldSell:
    def test_below_stop_price_true(self):
        pos = make_pos(buy_price=50_000, base_price=50_000, stop_rate=0.05)
        # stop_price = 47_500
        assert should_sell(pos, 47_000) is True

    def test_at_stop_price_false(self):
        pos = make_pos(buy_price=50_000, base_price=50_000, stop_rate=0.05)
        assert should_sell(pos, 47_500) is False

    def test_above_stop_price_false(self):
        pos = make_pos(buy_price=50_000, base_price=50_000, stop_rate=0.05)
        assert should_sell(pos, 50_000) is False
