"""
IPO(공모주) 관련 API 엔드포인트
"""
import asyncio
import re
from datetime import date, timedelta
from fastapi import APIRouter, Query

from backend.core.logger import get_logger
from backend.domains.services.dependency import get_service

logger = get_logger(__name__)
router = APIRouter()

_FIELD_MAP = [
    ('ipo_subscription_date', 'subscription'),
    ('payment_date',          'payment'),
    ('refund_date',           'refund'),
    ('listing_date',          'listing'),
    ('demand_forecast_date',  'demand_forecast'),
]


def _parse_date_range(date_str: str, year: int) -> list[str]:
    """
    '2026.07.01 ~ 07.02' → ['20260701', '20260702']
    '2026.07.06'          → ['20260706']
    빈 문자열 → []
    """
    if not date_str or not date_str.strip():
        return []
    date_str = date_str.strip()

    if '~' in date_str:
        parts = [p.strip() for p in date_str.split('~')]
        if len(parts) != 2:
            return []
        start_raw, end_raw = parts[0], parts[1]

        start_match = re.match(r'(\d{4})\.(\d{2})\.(\d{2})', start_raw)
        if start_match:
            sy, sm, sd = start_match.groups()
        else:
            m = re.match(r'(\d{2})\.(\d{2})', start_raw)
            if not m:
                return []
            sy = str(year)
            sm, sd = m.groups()

        end_match = re.match(r'(\d{4})\.(\d{2})\.(\d{2})', end_raw)
        if end_match:
            ey, em, ed = end_match.groups()
        else:
            m = re.match(r'(\d{2})\.(\d{2})', end_raw)
            if not m:
                return []
            ey = sy
            em, ed = m.groups()

        try:
            start_dt = date(int(sy), int(sm), int(sd))
            end_dt = date(int(ey), int(em), int(ed))
        except ValueError:
            return []

        result = []
        cur = start_dt
        while cur <= end_dt:
            result.append(cur.strftime('%Y%m%d'))
            cur += timedelta(days=1)
        return result

    else:
        m = re.match(r'(\d{4})\.(\d{2})\.(\d{2})', date_str)
        if not m:
            return []
        y, mo, d = m.groups()
        return [f'{y}{mo}{d}']


async def _build_holiday_info_for_range(
    start_ymd: str, end_ymd: str
) -> tuple[set[str], dict[str, str]]:
    """start_ymd~end_ymd 범위의 (주말+공휴일 집합, 공휴일명 dict) 반환."""
    from backend.domains.infrahub.open_time_checker import OpenTimeChecker

    start = date(int(start_ymd[:4]), int(start_ymd[4:6]), int(start_ymd[6:8]))
    end   = date(int(end_ymd[:4]),   int(end_ymd[4:6]),   int(end_ymd[6:8]))

    # 범위 내 (year, month) 목록
    months: list[tuple[int, int]] = []
    cur = start.replace(day=1)
    while cur <= end:
        months.append((cur.year, cur.month))
        cur = (cur.replace(day=28) + timedelta(days=4)).replace(day=1)

    holiday_names: dict[str, str] = {}
    try:
        checker = OpenTimeChecker.get()
        results = await asyncio.gather(
            *[checker.get_month_holiday_names(y, m) for y, m in months],
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, dict):
                holiday_names.update(r)
    except Exception:
        pass

    holiday_set: set[str] = set(holiday_names.keys())
    cur_date = start
    while cur_date <= end:
        if cur_date.weekday() >= 5:
            holiday_set.add(cur_date.strftime('%Y%m%d'))
        cur_date += timedelta(days=1)

    return holiday_set, holiday_names


@router.get('/calendar')
async def get_ipo_calendar(
    start_ymd: str = Query(..., description='달력 그리드 시작일 (yyyyMMdd)'),
    end_ymd:   str = Query(..., description='달력 그리드 종료일 (yyyyMMdd)'),
):
    """
    start_ymd~end_ymd 그리드 범위의 IPO 이벤트 반환.
    주말·공휴일 날짜 이벤트 제외.
    응답: { data: IpoEvent[], holidays: {ymd: name} }
    """
    service = get_service('ipo')
    results = await asyncio.gather(
        service.get_ipo_by_range(start_ymd, end_ymd),
        _build_holiday_info_for_range(start_ymd, end_ymd),
    )
    rows = results[0]
    holiday_set, holiday_names = results[1]

    year = int(start_ymd[:4])
    events: list[dict] = []

    for row in rows:
        stock_name = row.get('stock_name', '')
        track_id   = row.get('track_id', '')

        for field, event_type in _FIELD_MAP:
            date_str = row.get(field, '') or ''
            for ymd in _parse_date_range(date_str, year):
                if start_ymd <= ymd <= end_ymd and ymd not in holiday_set:
                    events.append({
                        'ymd': ymd,
                        'stock_name': stock_name,
                        'event_type': event_type,
                        'track_id': track_id,
                    })

    return {'success': True, 'data': events, 'holidays': holiday_names}


@router.get('/list')
async def get_ipo_list(
    status: str = Query(default='', description='진행 상태 필터 (빈 문자열=전체)'),
):
    """ipo_data 전체 목록 반환. listing_date DESC 정렬."""
    service = get_service('ipo')
    rows = await service.get_ipo_list(status or None)
    return {'success': True, 'data': rows}
