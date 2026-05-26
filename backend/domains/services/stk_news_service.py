import aiosqlite

from backend.core.config import config
from backend.core.logger import get_logger

logger = get_logger(__name__)


class StkNewsService:
    def __init__(self):
        self.db_path = config.DB_PATH

    async def save_news(self, news: dict) -> bool:
        """뉴스 제목 저장 (중복 news_id는 무시)"""
        sql = """
            INSERT OR IGNORE INTO stk_news
                (news_id, news_code, stock_codes, title, news_time, news_date, category_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        params = (
            news.get('news_id', ''),
            news.get('news_code', ''),
            news.get('stock_codes', ''),
            news.get('title', ''),
            news.get('time', ''),
            news.get('date', ''),
            news.get('category_id', ''),
        )
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(sql, params)
                await db.commit()
            return True
        except Exception as e:
            logger.error(f"[StkNews] 저장 오류: {e}")
            return False

    async def search(self, q: str = '', limit: int = 50, offset: int = 0) -> list[dict]:
        """뉴스 검색 (제목/종목코드)"""
        if q:
            sql = """
                SELECT news_id, news_code, stock_codes, title, content,
                       news_time, news_date, category_id, created_at
                FROM stk_news
                WHERE title LIKE ? OR stock_codes LIKE ? OR news_code LIKE ?
                ORDER BY news_date DESC, news_time DESC
                LIMIT ? OFFSET ?
            """
            like = f'%{q}%'
            params = (like, like, like, limit, offset)
        else:
            sql = """
                SELECT news_id, news_code, stock_codes, title, content,
                       news_time, news_date, category_id, created_at
                FROM stk_news
                ORDER BY news_date DESC, news_time DESC
                LIMIT ? OFFSET ?
            """
            params = (limit, offset)
        try:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(sql, params) as cursor:
                    rows = await cursor.fetchall()
                    return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"[StkNews] 검색 오류: {e}")
            return []

    async def get_by_id(self, news_id: str) -> dict | None:
        """단건 조회"""
        sql = "SELECT * FROM stk_news WHERE news_id = ?"
        try:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(sql, (news_id,)) as cursor:
                    row = await cursor.fetchone()
                    return dict(row) if row else None
        except Exception as e:
            logger.error(f"[StkNews] 단건 조회 오류: {e}")
            return None

    async def update_content(self, news_id: str, content: str) -> bool:
        """본문 업데이트"""
        sql = "UPDATE stk_news SET content = ? WHERE news_id = ?"
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(sql, (content, news_id))
                await db.commit()
            return True
        except Exception as e:
            logger.error(f"[StkNews] 본문 업데이트 오류: {e}")
            return False


stk_news_service = StkNewsService()
