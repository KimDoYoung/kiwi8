from typing import List, Optional
import aiosqlite
from backend.core.config import config
from backend.domains.models.judal_theme_model import JudalTheme, JudalThemeFilter
from backend.core.logger import get_logger

logger = get_logger(__name__)

class JudalThemeService:
    def __init__(self, db_path: str = None):
        self.db_path = db_path or config.DB_PATH

    async def list_themes(self, filter_data: JudalThemeFilter, limit: int = 1000) -> List[dict]:
        """테마 목록 조회"""
        query = "SELECT * FROM judal_themes WHERE 1=1"
        params = []

        if filter_data.theme_name:
            query += " AND theme_name = ?"
            params.append(filter_data.theme_name)
        
        if filter_data.theme_name_like:
            query += " AND (theme_name LIKE ? OR stock_name LIKE ? OR stock_code LIKE ?)"
            like_val = f"%{filter_data.theme_name_like}%"
            params.extend([like_val, like_val, like_val])

        if filter_data.stock_name:
            query += " AND stock_name = ?"
            params.append(filter_data.stock_name)

        if filter_data.stock_code:
            query += " AND stock_code = ?"
            params.append(filter_data.stock_code)

        # 수치형 필터 추가
        if filter_data.current_price_min is not None:
            query += " AND current_price >= ?"
            params.append(filter_data.current_price_min)
        if filter_data.current_price_max is not None:
            query += " AND current_price <= ?"
            params.append(filter_data.current_price_max)
        
        if filter_data.market_cap_min is not None:
            query += " AND market_cap >= ?"
            params.append(filter_data.market_cap_min)
        if filter_data.market_cap_max is not None:
            query += " AND market_cap <= ?"
            params.append(filter_data.market_cap_max)

        if filter_data.yesterday_ratio_min is not None:
            query += " AND yesterday_ratio >= ?"
            params.append(filter_data.yesterday_ratio_min)
        if filter_data.yesterday_ratio_max is not None:
            query += " AND yesterday_ratio <= ?"
            params.append(filter_data.yesterday_ratio_max)

        if filter_data.three_day_sum_min is not None:
            query += " AND three_day_sum >= ?"
            params.append(filter_data.three_day_sum_min)
        if filter_data.three_day_sum_max is not None:
            query += " AND three_day_sum <= ?"
            params.append(filter_data.three_day_sum_max)

        if filter_data.per_min is not None:
            query += " AND per >= ?"
            params.append(filter_data.per_min)
        if filter_data.per_max is not None:
            query += " AND per <= ?"
            params.append(filter_data.per_max)

        if filter_data.pbr_min is not None:
            query += " AND pbr >= ?"
            params.append(filter_data.pbr_min)
        if filter_data.pbr_max is not None:
            query += " AND pbr <= ?"
            params.append(filter_data.pbr_max)

        if filter_data.deduplicate:
            query += " GROUP BY stock_code"

        query += " ORDER BY theme_name ASC, buffett_choice ASC"
        
        if limit and limit > 0:
            query += " LIMIT ?"
            params.append(limit)

        results = []
        try:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(query, params) as cursor:
                    async for row in cursor:
                        results.append(dict(row))
        except Exception as e:
            logger.error(f"Error listing judal themes: {e}")
            raise e

        return results

    async def get_distinct_themes(self) -> List[str]:
        """중복 제거된 테마명 목록 조회"""
        query = "SELECT DISTINCT theme_name FROM judal_themes ORDER BY theme_name"
        themes = []
        try:
            async with aiosqlite.connect(self.db_path) as db:
                async with db.execute(query) as cursor:
                    async for row in cursor:
                        themes.append(row[0])
        except Exception as e:
            logger.error(f"Error getting distinct themes: {e}")
            raise e
        return themes
