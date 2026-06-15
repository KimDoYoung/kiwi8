"""
매일 08:10 ipostock.co.kr 공모주 데이터 수집 스케줄러 잡.
"""
from __future__ import annotations

import asyncio

from backend.core.logger import get_logger
from backend.domains.kscheduler.k_scheduler import job_registry

logger = get_logger(__name__)


@job_registry.register('scrap_ipo')
async def scrap_ipo_job(_payload: dict) -> None:
    """매일 08:10 ipostock.co.kr 공모주 데이터 수집 → ipo_data upsert."""
    from backend.jobs.ipostock_scrap import collect_ipo

    logger.info('[ipo_scrap] 수집 시작')
    loop = asyncio.get_event_loop()
    inserted, updated, skipped = await loop.run_in_executor(None, collect_ipo)
    logger.info(f'[ipo_scrap] 완료 — 신규={inserted} 업데이트={updated} 건너뜀={skipped}')
