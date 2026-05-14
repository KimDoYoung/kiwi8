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
            query += " AND theme_name LIKE ?"
            params.append(f"%{filter_data.theme_name_like}%")

        if filter_data.stock_name:
            query += " AND stock_name = ?"
            params.append(filter_data.stock_name)

        if filter_data.stock_code:
            query += " AND stock_code = ?"
            params.append(filter_data.stock_code)

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
