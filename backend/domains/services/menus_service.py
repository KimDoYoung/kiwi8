import asyncio
import sqlite3
from typing import List, Dict

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.models.menus_model import Menu, MenuResponse

logger = get_logger(__name__)


class MenusService:
    def __init__(self):
        self.db_path = config.DB_PATH

    def _get_conn(self):
        return sqlite3.connect(self.db_path)

    def _row_to_menu(self, row) -> Menu:
        return Menu(
            id=row[0],
            parent_id=row[1],
            level=row[2],
            screen_no=row[3],
            title=row[4],
            url=row[5],
            component=row[6],
            icon=row[7],
            sort_order=row[8],
            is_active=row[9],
        )

    async def get_tree(self) -> List[MenuResponse]:
        """활성화된 메뉴를 트리 구조로 반환"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_tree_sync)

    def _get_tree_sync(self) -> List[MenuResponse]:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT id, parent_id, level, screen_no, title, url, component, icon, sort_order, is_active
                FROM menus
                WHERE is_active = 1
                ORDER BY level, sort_order
            """)
            rows = cur.fetchall()

        menus = [self._row_to_menu(row) for row in rows]

        # id → MenuResponse 맵 구성
        menu_map: Dict[int, MenuResponse] = {}
        for m in menus:
            menu_map[m.id] = MenuResponse(
                id=m.id,
                parent_id=m.parent_id,
                level=m.level,
                screen_no=m.screen_no,
                title=m.title,
                url=m.url,
                component=m.component,
                icon=m.icon,
                sort_order=m.sort_order,
                is_active=m.is_active,
                children=[],
            )

        # 트리 조립
        roots: List[MenuResponse] = []
        for m_id, node in menu_map.items():
            if node.parent_id is None:
                roots.append(node)
            else:
                parent = menu_map.get(node.parent_id)
                if parent:
                    parent.children.append(node)

        return roots
