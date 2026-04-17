import asyncio
import sqlite3
from datetime import datetime
from typing import List, Optional

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.models.layout_preset_model import LayoutPreset, LayoutPresetCreate

logger = get_logger(__name__)


class LayoutPresetService:
    """레이아웃 프리셋 서비스 클래스

    사용자별로 이름 붙인 레이아웃을 저장하고 불러오는 서비스
    """

    def __init__(self):
        self.db_path = config.DB_PATH

    def _get_conn(self):
        """DB 연결 객체 반환"""
        return sqlite3.connect(self.db_path)

    def _row_to_preset(self, row) -> LayoutPreset:
        """DB row를 LayoutPreset 객체로 변환"""
        return LayoutPreset(
            id=row[0],
            user_id=row[1],
            name=row[2],
            layout_json=row[3],
            created_at=row[4],
            updated_at=row[5],
        )

    async def list_by_user(self, user_id: str) -> List[LayoutPreset]:
        """사용자의 전체 프리셋 목록 조회 (최신 수정순)"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._list_by_user_sync, user_id)

    def _list_by_user_sync(self, user_id: str) -> List[LayoutPreset]:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, user_id, name, layout_json, created_at, updated_at
                FROM layout_presets
                WHERE user_id = ?
                ORDER BY updated_at DESC
                """,
                (user_id,),
            )
            return [self._row_to_preset(row) for row in cur.fetchall()]

    async def save_or_update(self, user_id: str, data: LayoutPresetCreate) -> LayoutPreset:
        """이름 기준 저장 또는 덮어쓰기 (upsert)"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._save_or_update_sync, user_id, data)

    def _save_or_update_sync(self, user_id: str, data: LayoutPresetCreate) -> LayoutPreset:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO layout_presets (user_id, name, layout_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, name) DO UPDATE SET
                    layout_json = excluded.layout_json,
                    updated_at  = excluded.updated_at
                """,
                (user_id, data.name, data.layout_json, now, now),
            )
            conn.commit()
            # 저장된 row 반환
            cur.execute(
                """
                SELECT id, user_id, name, layout_json, created_at, updated_at
                FROM layout_presets
                WHERE user_id = ? AND name = ?
                """,
                (user_id, data.name),
            )
            return self._row_to_preset(cur.fetchone())

    async def delete(self, preset_id: int, user_id: str) -> bool:
        """프리셋 삭제 (본인 것만)"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._delete_sync, preset_id, user_id)

    def _delete_sync(self, preset_id: int, user_id: str) -> bool:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                'DELETE FROM layout_presets WHERE id = ? AND user_id = ?',
                (preset_id, user_id),
            )
            conn.commit()
            return cur.rowcount > 0
