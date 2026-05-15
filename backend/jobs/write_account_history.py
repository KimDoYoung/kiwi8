"""
account_history 일일 기록 Job
- KScheduler cron "50 23 * * *" 로 매일 23:50 실행
- 오늘이 주식시장 개장일이 아니면 기록 생략
- 오늘 날짜 레코드 있으면 삭제 후 재삽입
"""
from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.infrahub.open_time_checker import OpenTimeChecker
from backend.domains.kscheduler.k_scheduler import job_registry
from backend.utils.acct_summary import (
    get_kis_account_summary,
    get_kiwoom_account_summary,
    get_ls_account_summary,
    get_summary_json,
)

logger = get_logger("account-history-job")

_INSERT_SQL = """
INSERT INTO account_history (
    record_date,
    total_asset, total_buy, total_pnl, total_rate,
    kis_acct_no,    kis_total_asset,    kis_buy_amt,    kis_eval_pnl,    kis_rate,    kis_ord_avail,    kis_hold_cnt,
    ls_acct_no,     ls_total_asset,     ls_buy_amt,     ls_eval_pnl,     ls_rate,     ls_ord_avail,     ls_hold_cnt,
    kiwoom_acct_no, kiwoom_total_asset, kiwoom_buy_amt, kiwoom_eval_pnl, kiwoom_rate, kiwoom_ord_avail, kiwoom_hold_cnt
) VALUES (
    :record_date,
    :total_asset, :total_buy, :total_pnl, :total_rate,
    :kis_acct_no,    :kis_total_asset,    :kis_buy_amt,    :kis_eval_pnl,    :kis_rate,    :kis_ord_avail,    :kis_hold_cnt,
    :ls_acct_no,     :ls_total_asset,     :ls_buy_amt,     :ls_eval_pnl,     :ls_rate,     :ls_ord_avail,     :ls_hold_cnt,
    :kiwoom_acct_no, :kiwoom_total_asset, :kiwoom_buy_amt, :kiwoom_eval_pnl, :kiwoom_rate, :kiwoom_ord_avail, :kiwoom_hold_cnt
)
"""


def _broker_row(accounts: dict, broker_id: str, prefix: str) -> dict:
    acc = accounts.get(broker_id, {})
    return {
        f"{prefix}_acct_no":     acc.get("계좌번호", ""),
        f"{prefix}_total_asset": acc.get("총자산", 0),
        f"{prefix}_buy_amt":     acc.get("매입금액", 0),
        f"{prefix}_eval_pnl":    acc.get("평가손익", 0),
        f"{prefix}_rate":        acc.get("수익률", "0.00%"),
        f"{prefix}_ord_avail":   acc.get("주문가능금액", 0),
        f"{prefix}_hold_cnt":    acc.get("보유종목수", 0),
    }


def _save(record_date: str, summary: dict, accounts: dict) -> None:
    row = {
        "record_date": record_date,
        "total_asset": summary["전체자산"],
        "total_buy":   summary["전체매입금액"],
        "total_pnl":   summary["전체평가손익"],
        "total_rate":  summary["전체수익률"],
        **_broker_row(accounts, "kis",    "kis"),
        **_broker_row(accounts, "ls",     "ls"),
        **_broker_row(accounts, "kiwoom", "kiwoom"),
    }
    with sqlite3.connect(config.DB_PATH) as conn:
        deleted = conn.execute(
            "DELETE FROM account_history WHERE record_date = ?", (record_date,)
        ).rowcount
        if deleted:
            logger.info(f"[account-history-job] 기존 {record_date} 레코드 삭제 후 재삽입")
        conn.execute(_INSERT_SQL, row)
        conn.commit()


@job_registry.register("write_account_history")
async def write_account_history_job(_payload: dict) -> None:
    """매일 23:50 계좌 요약을 account_history에 기록. 휴장일은 생략."""
    record_date = datetime.now(tz=UTC).date().isoformat()
    logger.info(f"[account-history-job] ===== 시작 ===== record_date={record_date}")

    # 오늘 시장 개장일 여부 확인
    checker = OpenTimeChecker.get()
    is_open = await checker.is_open_day()
    if not is_open:
        logger.info(f"[account-history-job] 휴장일({record_date}) — 기록 생략")
        return

    logger.info("[account-history-job] 개장일 확인 완료. 증권사 계좌 조회 중...")

    kiwoom = await get_kiwoom_account_summary()
    kis    = await get_kis_account_summary()
    ls     = await get_ls_account_summary()

    broker_status = {
        "kiwoom": "OK" if kiwoom else "FAIL",
        "kis":    "OK" if kis    else "FAIL",
        "ls":     "OK" if ls     else "FAIL",
    }
    logger.info(f"[account-history-job] 조회 결과: {broker_status}")

    valid = [a for a in (kiwoom, kis, ls) if a is not None]
    if not valid:
        logger.error("[account-history-job] 모든 증권사 조회 실패 — DB 저장 생략")
        return

    result  = get_summary_json(valid)
    summary = result["summary"]
    _save(record_date, summary, result["accounts"])

    logger.info(
        f"[account-history-job] ===== 완료 ===== "
        f"전체자산={summary['전체자산']:,}원 "
        f"매입={summary['전체매입금액']:,}원 "
        f"손익={summary['전체평가손익']:+,}원 "
        f"수익률={summary['전체수익률']} "
        f"증권사수={summary['계좌개수']}"
    )
