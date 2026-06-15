"""
IPO(공모주) 관련 API 엔드포인트
"""
import re
from fastapi import APIRouter, Query

from backend.core.logger import get_logger
from backend.domains.services.dependency import get_service

logger = get_logger(__name__)
router = APIRouter()


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

        # start: '2026.07.01' or '07.01'
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

        from datetime import date, timedelta
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


@router.get('/calendar')
async def get_ipo_calendar(
    year: int = Query(..., description='연도 (e.g. 2026)'),
    month: int = Query(..., description='월 (1~12)'),
):
    """
    지정 연/월에 일정이 있는 IPO 데이터를 달력 이벤트 형태로 반환.
    각 이벤트: { ymd, stock_name, event_type, track_id }
    event_type: 'subscription' | 'payment' | 'refund' | 'listing' | 'demand_forecast'
    """
    service = get_service('ipo')
    rows = await service.get_ipo_by_month(year, month)

    ym = f'{year:04d}{month:02d}'

    events: list[dict] = []

    field_map = [
        ('ipo_subscription_date', 'subscription'),
        ('payment_date',          'payment'),
        ('refund_date',           'refund'),
        ('listing_date',          'listing'),
        ('demand_forecast_date',  'demand_forecast'),
    ]

    for row in rows:
        stock_name = row.get('stock_name', '')
        track_id   = row.get('track_id', '')

        for field, event_type in field_map:
            date_str = row.get(field, '') or ''
            for ymd in _parse_date_range(date_str, year):
                if ymd.startswith(ym):
                    events.append({
                        'ymd': ymd,
                        'stock_name': stock_name,
                        'event_type': event_type,
                        'track_id': track_id,
                    })

    return {'success': True, 'data': events}


@router.get('/list')
async def get_ipo_list(
    status: str = Query(default='', description='진행 상태 필터 (빈 문자열=전체)'),
):
    """ipo_data 전체 목록 반환. listing_date DESC 정렬."""
    service = get_service('ipo')
    rows = await service.get_ipo_list(status or None)
    return {'success': True, 'data': rows}
