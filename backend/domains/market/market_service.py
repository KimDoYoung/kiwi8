import sqlite3
import asyncio
from datetime import datetime
from backend.core.config import config
from backend.core.logger import get_logger
from backend.utils.naver_utils import get_jisu_from_naver
from backend.domains.models.market_model import MarketJisu
from backend.domains.kscheduler.k_scheduler import job_registry

logger = get_logger(__name__)

class MarketService:
    def __init__(self):
        self.db_path = config.DB_PATH

    def _get_conn(self):
        return sqlite3.connect(self.db_path)

    async def fetch_and_store_jisu(self):
        """네이버에서 지수를 가져와 DB에 저장 (장시간에만 실행 권장)"""
        from backend.domains.infrahub.open_time_checker import OpenTimeChecker
        checker = OpenTimeChecker.get()
        is_open = await checker.is_open_day()
        
        now = datetime.now()
        last_jisu = await self.get_market_jisu()
        
        if not is_open:
            logger.info("Today is not an open day. Skipping jisu fetch.")
            return
            
        is_krx_time = checker.isKrxTime(now)
        
        should_fetch = False
        if is_krx_time:
            should_fetch = True
        else:
            if last_jisu:
                last_updated = datetime.strptime(last_jisu.updated_at, '%Y%m%d%H%M%S')
                market_close = now.replace(hour=15, minute=30, second=0, microsecond=0)
                if last_updated < market_close:
                    should_fetch = True
            else:
                should_fetch = True

        if not should_fetch:
            logger.debug("Market closed and already updated. Skipping.")
            return

        try:
            data = await asyncio.to_thread(get_jisu_from_naver)
            if not data:
                return

            def parse_val(v):
                return float(v.replace(',', ''))

            # KOSPI
            kospi = parse_val(data['KOSPI']['index'])
            kospi_diff = parse_val(data['KOSPI']['diff'])
            kospi_rate = parse_val(data['KOSPI']['rate'])

            # KOSDAQ
            kosdaq = parse_val(data['KOSDAQ']['index'])
            kosdaq_diff = parse_val(data['KOSDAQ']['diff'])
            kosdaq_rate = parse_val(data['KOSDAQ']['rate'])

            # KOSPI200
            kospi200 = parse_val(data['KOSPI200']['index'])
            kospi200_diff = parse_val(data['KOSPI200']['diff'])
            kospi200_rate = parse_val(data['KOSPI200']['rate'])

            updated_at = now.strftime('%Y%m%d%H%M%S')

            await asyncio.to_thread(self._save_jisu_sync, 
                                   kospi, kospi_diff, kospi_rate,
                                   kosdaq, kosdaq_diff, kosdaq_rate,
                                   kospi200, kospi200_diff, kospi200_rate,
                                   updated_at)
            logger.info(f"Market Jisu updated: KOSPI {kospi}, KOSDAQ {kosdaq}")
            
        except Exception as e:
            logger.error(f"Error fetching/storing jisu: {e}")

    def _save_jisu_sync(self, kp, kpd, kpr, kq, kqd, kqr, k2, k2d, k2r, updated_at):
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT OR REPLACE INTO market_jisu (
                    id, kospi, kospi_diff, kospi_rate, 
                    kosdaq, kosdaq_diff, kosdaq_rate, 
                    kospi200, kospi200_diff, kospi200_rate, 
                    updated_at
                )
                VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (kp, kpd, kpr, kq, kqd, kqr, k2, k2d, k2r, updated_at))
            conn.commit()

    async def get_market_jisu(self) -> MarketJisu | None:
        return await asyncio.to_thread(self._get_market_jisu_sync)

    def _get_market_jisu_sync(self) -> MarketJisu | None:
        with self._get_conn() as conn:
            cur = conn.cursor()
            try:
                cur.execute("""
                    SELECT kospi, kospi_diff, kospi_rate, 
                           kosdaq, kosdaq_diff, kosdaq_rate, 
                           kospi200, kospi200_diff, kospi200_rate, 
                           updated_at 
                    FROM market_jisu WHERE id = 1
                """)
                row = cur.fetchone()
                if row:
                    return MarketJisu(
                        kospi=row[0], kospi_diff=row[1], kospi_rate=row[2],
                        kosdaq=row[3], kosdaq_diff=row[4], kosdaq_rate=row[5],
                        kospi200=row[6], kospi200_diff=row[7], kospi200_rate=row[8],
                        updated_at=row[9]
                    )
            except sqlite3.OperationalError as e:
                logger.warning(f"Market jisu table might need migration: {e}")
            return None

# Scheduler Task Registration
@job_registry.register("fetch_market_jisu")
async def fetch_market_jisu_job(_payload: dict):
    from backend.domains.services.dependency import get_service
    service = get_service("market")
    await service.fetch_and_store_jisu()


@job_registry.register("proactive_token_refresh")
async def proactive_token_refresh_job(_payload: dict):
    """
    증권사별 토큰 만료 여부를 확인하고 필요시 갱신하는 스케줄러 잡.
    내부적으로 BaseTokenManager.refresh_token()이 만료 시간을 체크하므로,
    여기서는 각 증권사별 API 인스턴스를 가져와 refresh_token을 호출하기만 함.
    """
    from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
    from backend.domains.stkcompanys.kis.kis_service import get_kis_api
    from backend.domains.stkcompanys.ls.ls_service import get_ls_api
    
    logger.info("[스케줄러] 증권사 토큰 갱신 확인 중...")
    
    # Kiwoom
    kiwoom = await get_kiwoom_api()
    if kiwoom:
        await kiwoom.token_manager.refresh_token()
        
    # KIS
    kis = await get_kis_api()
    if kis:
        await kis.token_manager.refresh_token()
        
    # LS
    ls = await get_ls_api()
    if ls:
        await ls.token_manager.refresh_token()
    
    logger.info("[스케줄러] 증권사 토큰 갱신 확인 완료")
