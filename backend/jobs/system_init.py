import asyncio
import json
import sqlite3

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.kscheduler.k_scheduler import job_registry
from backend.utils.holdings_utils import get_all_holdings

logger = get_logger(__name__)


async def _sync_holdings():
    """1. my_stock is_hold 정합성: 3개 증권사 보유종목 기준으로 동기화."""
    holdings = await get_all_holdings()
    if not holdings:
        logger.warning("[system_init] holdings 빈 리스트 — 정합성 체크 건너뜀")
        return

    hold_cds = {h["stk_cd"] for h in holdings}
    hold_map = {h["stk_cd"]: h["stk_nm"] for h in holdings}

    def _sync():
        with sqlite3.connect(config.DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT stk_cd, stk_nm, is_watch, is_auto_trade FROM my_stock"
            ).fetchall()
            existing_cds = {r["stk_cd"] for r in rows}

            added = deleted = updated = 0

            # 신규 보유 종목 INSERT
            for cd, nm in hold_map.items():
                if cd not in existing_cds:
                    conn.execute(
                        "INSERT INTO my_stock (stk_cd, stk_nm, is_hold) VALUES (?, ?, 1)",
                        (cd, nm),
                    )
                    added += 1
                    logger.info(f"[system_init] my_stock 추가: {cd} {nm}")

            # 기존 종목 갱신
            for r in rows:
                cd = r["stk_cd"]
                if cd in hold_cds:
                    conn.execute(
                        "UPDATE my_stock SET is_hold = 1 WHERE stk_cd = ?", (cd,)
                    )
                    updated += 1
                else:
                    if r["is_watch"] == 0 and r["is_auto_trade"] == 0:
                        conn.execute(
                            "DELETE FROM my_stock WHERE stk_cd = ?", (cd,)
                        )
                        deleted += 1
                        logger.info(f"[system_init] my_stock 삭제: {cd}")
                    else:
                        conn.execute(
                            "UPDATE my_stock SET is_hold = 0 WHERE stk_cd = ?", (cd,)
                        )

            conn.commit()
        logger.info(
            f"[system_init] holdings 동기화: 추가={added}, 삭제={deleted}, 갱신={updated}"
        )

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _sync)


def _fill_sector_sync():
    """2. my_stock.sector를 judal_themes에서 채우기."""
    with sqlite3.connect(config.DB_PATH) as conn:
        stocks = conn.execute("SELECT stk_cd FROM my_stock").fetchall()
        updated = 0
        for (stk_cd,) in stocks:
            rows = conn.execute(
                "SELECT DISTINCT theme_name FROM judal_themes WHERE stock_code = ?",
                (stk_cd,),
            ).fetchall()
            if rows:
                sector = "/".join(r[0] for r in rows if r[0])
                conn.execute(
                    "UPDATE my_stock SET sector = ? WHERE stk_cd = ?", (sector, stk_cd)
                )
                updated += 1
        conn.commit()
    logger.info(f"[system_init] sector 갱신: {updated}개")


def _fill_spec_from_kind_sync():
    """3. my_stock.spec에 kind_stk_info의 대표자/홈페이지/지역 병합."""
    with sqlite3.connect(config.DB_PATH) as conn:
        stocks = conn.execute("SELECT stk_cd, spec FROM my_stock").fetchall()
        updated = 0
        for stk_cd, existing_spec in stocks:
            row = conn.execute(
                "SELECT representative_name, homepage, location FROM kind_stk_info WHERE stock_code = ?",
                (stk_cd,),
            ).fetchone()
            if not row:
                continue
            try:
                spec = json.loads(existing_spec) if existing_spec else {}
            except (json.JSONDecodeError, TypeError):
                spec = {}
            spec["representative_name"] = row[0]
            spec["homepage"] = row[1]
            spec["location"] = row[2]
            conn.execute(
                "UPDATE my_stock SET spec = ? WHERE stk_cd = ?",
                (json.dumps(spec, ensure_ascii=False), stk_cd),
            )
            updated += 1
        conn.commit()
    logger.info(f"[system_init] spec(kind) 갱신: {updated}개")


def _cleanup_old_data_sync():
    """4~7. 오래된 데이터 삭제."""
    with sqlite3.connect(config.DB_PATH) as conn:
        r1 = conn.execute(
            "DELETE FROM stk_news WHERE news_date < strftime('%Y%m%d', 'now', '-7 days')"
        )
        r2 = conn.execute(
            "DELETE FROM stk_cache WHERE created_at < datetime('now', '-1 day')"
        )
        r3 = conn.execute(
            "DELETE FROM stk_options WHERE date < strftime('%Y%m%d', 'now', '-7 days')"
        )
        r4 = conn.execute(
            "DELETE FROM refresh_tokens WHERE created_at < datetime('now', '-3 days')"
        )
        conn.commit()
    logger.info(
        f"[system_init] cleanup: stk_news -{r1.rowcount}, stk_cache -{r2.rowcount},"
        f" stk_options -{r3.rowcount}, refresh_tokens -{r4.rowcount}"
    )


@job_registry.register("system_init")
async def system_init_job(_payload: dict):
    """매일 04:00 시스템 유지보수 작업."""
    logger.info("[system_init] 시작")

    await _sync_holdings()

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _fill_sector_sync)
    await loop.run_in_executor(None, _fill_spec_from_kind_sync)
    await loop.run_in_executor(None, _cleanup_old_data_sync)

    logger.info("[system_init] 완료")
