import sqlite3
from datetime import datetime

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.models.stk_words_model import (
    StkWords,
    StkWordsCreate,
    StkWordsFilter,
    StkWordsUpdate,
)

logger = get_logger(__name__)

class StkWordsService:
    """경제 용어 서비스 클래스
    
    경제/주식 용어에 대한 등록, 조회, 수정 및 삭제 관리 서비스
    """
    
    def __init__(self):
        self.db_path = config.DB_PATH

    def _get_conn(self):
        """DB 연결 객체 반환"""
        return sqlite3.connect(self.db_path)

    def _row_to_words(self, row) -> StkWords:
        """DB row를 StkWords 객체로 변환"""
        return StkWords(
            id=row[0],
            word=row[1],
            brief=row[2],
            detail=row[3],
            is_active=row[4],
            created_at=row[5],
            updated_at=row[6]
        )

    async def create(self, words_data: StkWordsCreate) -> StkWords:
        """새로운 경제 용어 생성"""
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._create_sync, words_data)

    def _create_sync(self, words_data: StkWordsCreate) -> StkWords:
        with self._get_conn() as conn:
            cur = conn.cursor()
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            # 단어 중복 체크
            cur.execute("SELECT id, is_active FROM stk_words WHERE word = ?", (words_data.word.strip(),))
            existing = cur.fetchone()
            if existing:
                # 이미 존재하지만 비활성화된 경우 재설정
                existing_id, is_active = existing
                if is_active == 0:
                    cur.execute("""
                        UPDATE stk_words
                        SET brief = ?, detail = ?, is_active = 1, updated_at = ?
                        WHERE id = ?
                    """, (words_data.brief, words_data.detail, now, existing_id))
                    conn.commit()
                    return StkWords(
                        id=existing_id,
                        word=words_data.word.strip(),
                        brief=words_data.brief,
                        detail=words_data.detail,
                        is_active=1,
                        created_at=now,
                        updated_at=now
                    )
                else:
                    raise ValueError(f"이미 등록된 경제 용어입니다: {words_data.word}")
            
            cur.execute("""
                INSERT INTO stk_words (word, brief, detail, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                words_data.word.strip(),
                words_data.brief,
                words_data.detail,
                1,
                now,
                now
            ))
            conn.commit()
            
            # 생성된 ID 조회
            words_id = cur.lastrowid
            return StkWords(
                id=words_id,
                word=words_data.word.strip(),
                brief=words_data.brief,
                detail=words_data.detail,
                is_active=1,
                created_at=now,
                updated_at=now
            )

    async def get_by_id(self, word_id: int) -> StkWords | None:
        """ID로 경제 용어 조회"""
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_by_id_sync, word_id)

    def _get_by_id_sync(self, word_id: int) -> StkWords | None:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT id, word, brief, detail, is_active, created_at, updated_at
                FROM stk_words
                WHERE id = ?
            """, (word_id,))
            
            row = cur.fetchone()
            if row:
                return self._row_to_words(row)
            return None

    async def get_by_word(self, word: str) -> StkWords | None:
        """용어 단어명으로 조회"""
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_by_word_sync, word)

    def _get_by_word_sync(self, word: str) -> StkWords | None:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT id, word, brief, detail, is_active, created_at, updated_at
                FROM stk_words
                WHERE word = ? AND is_active = 1
            """, (word.strip(),))
            
            row = cur.fetchone()
            if row:
                return self._row_to_words(row)
            return None

    async def update(self, word_id: int, update_data: StkWordsUpdate) -> StkWords | None:
        """경제 용어 수정"""
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._update_sync, word_id, update_data)

    def _update_sync(self, word_id: int, update_data: StkWordsUpdate) -> StkWords | None:
        # 기존 데이터 확인
        existing = self._get_by_id_sync(word_id)
        if not existing:
            return None

        # 업데이트할 필드들만 추출
        update_fields = {}
        if update_data.word is not None:
            update_fields['word'] = update_data.word.strip()
        if update_data.brief is not None:
            update_fields['brief'] = update_data.brief
        if update_data.detail is not None:
            update_fields['detail'] = update_data.detail
        if update_data.is_active is not None:
            update_fields['is_active'] = update_data.is_active

        if not update_fields:
            return existing

        # 단어 변경 시 중복 검사
        if update_data.word is not None and update_data.word.strip() != existing.word:
            with self._get_conn() as conn:
                cur = conn.cursor()
                cur.execute("SELECT id FROM stk_words WHERE word = ? AND id != ?", (update_data.word.strip(), word_id))
                if cur.fetchone():
                    raise ValueError(f"이미 등록된 경제 용어입니다: {update_data.word}")

        # SQL 쿼리 동적 생성
        set_clause = ', '.join([f"{field} = ?" for field in update_fields])
        update_fields['updated_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        set_clause += ', updated_at = ?'

        with self._get_conn() as conn:
            cur = conn.cursor()
            values = list(update_fields.values()) + [word_id]
            cur.execute(f"""
                UPDATE stk_words 
                SET {set_clause}
                WHERE id = ?
            """, values)
            conn.commit()

        # 업데이트된 데이터 반환
        return self._get_by_id_sync(word_id)

    async def delete(self, word_id: int) -> bool:
        """경제 용어 삭제 (소프트 딜리트)"""
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._delete_sync, word_id)

    def _delete_sync(self, word_id: int) -> bool:
        with self._get_conn() as conn:
            cur = conn.cursor()
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cur.execute("""
                UPDATE stk_words 
                SET is_active = 0, updated_at = ?
                WHERE id = ?
            """, (now, word_id))
            conn.commit()
            return cur.rowcount > 0

    async def list_all(self, filter_data: StkWordsFilter | None = None) -> list[StkWords]:
        """모든 경제 용어 목록 조회 (필터링 포함)"""
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._list_all_sync, filter_data)

    def _list_all_sync(self, filter_data: StkWordsFilter | None = None) -> list[StkWords]:
        query = """
            SELECT id, word, brief, detail, is_active, created_at, updated_at
            FROM stk_words
        """
        params = []
        conditions = []

        # 기본값: 활성(is_active = 1)만 조회
        is_active_val = 1
        if filter_data and filter_data.is_active is not None:
            is_active_val = filter_data.is_active

        # is_active가 -1 이면 전체(활성/비활성 무관) 조회
        if is_active_val != -1:
            conditions.append("is_active = ?")
            params.append(is_active_val)

        if filter_data:
            if filter_data.word_like is not None:
                conditions.append("word LIKE ?")
                params.append(f"%{filter_data.word_like}%")
            
            if filter_data.brief_like is not None:
                conditions.append("brief LIKE ?")
                params.append(f"%{filter_data.brief_like}%")
            
            if filter_data.detail_like is not None:
                conditions.append("detail LIKE ?")
                params.append(f"%{filter_data.detail_like}%")

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        # 단어 정렬 순서 (가나다 순)
        query += " ORDER BY word ASC"

        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(query, params)
            rows = cur.fetchall()
            
            return [self._row_to_words(row) for row in rows]
