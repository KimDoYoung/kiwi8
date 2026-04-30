import asyncio
import sqlite3
from datetime import UTC, datetime

from backend.core.config import config
from backend.core.logger import get_logger

logger = get_logger(__name__)

class AuthService:
    """인증 관련 서비스 클래스 (Refresh Token 관리 등)"""
    
    def __init__(self):
        self.db_path = config.DB_PATH

    def _get_conn(self):
        return sqlite3.connect(self.db_path)

    async def save_refresh_token(self, user_id: str, token_id: str, hashed_token: str, expires_at: datetime):
        """Refresh Token 정보를 DB에 저장"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._save_refresh_token_sync, user_id, token_id, hashed_token, expires_at)

    def _save_refresh_token_sync(self, user_id: str, token_id: str, hashed_token: str, expires_at: datetime):
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO refresh_tokens (token_id, user_id, hashed_token, expires_at)
                VALUES (?, ?, ?, ?)
            """, (token_id, user_id, hashed_token, expires_at.isoformat()))
            conn.commit()

    async def verify_refresh_token(self, token_id: str, hashed_token: str) -> str | None:
        """DB에 저장된 Refresh Token 검증"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._verify_refresh_token_sync, token_id, hashed_token)

    def _verify_refresh_token_sync(self, token_id: str, hashed_token: str) -> str | None:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT user_id, expires_at, is_revoked 
                FROM refresh_tokens 
                WHERE token_id = ? AND hashed_token = ?
            """, (token_id, hashed_token))
            row = cur.fetchone()
            
            if not row:
                return None
            
            user_id, expires_at_str, is_revoked = row
            if is_revoked:
                return None
            
            expires_at = datetime.fromisoformat(expires_at_str)
            if expires_at < datetime.now(UTC):
                return None
                
            return user_id

    async def revoke_refresh_token(self, token_id: str):
        """Refresh Token 폐기"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._revoke_refresh_token_sync, token_id)

    def _revoke_refresh_token_sync(self, token_id: str):
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("UPDATE refresh_tokens SET is_revoked = 1 WHERE token_id = ?", (token_id,))
            conn.commit()

    async def revoke_all_user_tokens(self, user_id: str):
        """사용자의 모든 Refresh Token 폐기"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._revoke_all_user_tokens_sync, user_id)

    def _revoke_all_user_tokens_sync(self, user_id: str):
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("UPDATE refresh_tokens SET is_revoked = 1 WHERE user_id = ?", (user_id,))
            conn.commit()
