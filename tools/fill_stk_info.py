#!/usr/bin/env python3
"""
fill_stk_info.py - stk_info / kind_stk_info 테이블 채우기

Steps:
  1. DELETE stk_info, kind_stk_info
  2. Kiwoom API(ka10099) → stk_info 채우기
  3. KIND Excel 다운로드 → kind_stk_info 채우기
  4. kind_stk_info → stk_info (main_products, representative_name, homepage, location) 채우기

Usage:
  uv run python tools/fill_stk_info.py
"""
import asyncio
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests

# 프로젝트 루트를 sys.path에 추가
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.core.config import config

DB_PATH = config.DB_PATH
DATA_FOLDER = config.DATA_FOLDER  # BASE_DIR/data

KIND_URL = "https://kind.krx.co.kr/corpgeneral/corpList.do"
KIND_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://kind.krx.co.kr/corpgeneral/corpList.do?method=loadInitPage",
}
KIND_PAYLOAD = {
    "method": "download",
    "pageIndex": "1",
    "currentPageSize": "5000",
}

# KIND Excel 컬럼명 → kind_stk_info 필드명
KIND_COL_MAP = {
    "회사명": "corp_name",
    "종목코드": "stock_code",
    "업종": "industry",
    "주요제품": "main_products",
    "상장일": "listing_date",
    "결산월": "settlement_month",
    "대표자명": "representative_name",
    "홈페이지": "homepage",
    "지역": "location",
    "시장구분": "market_type",
}


# ─────────────────────────────────────────────
# Step 1
# ─────────────────────────────────────────────
def step1_delete():
    print("[1] DELETE stk_info, kind_stk_info ...")
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("DELETE FROM stk_info")
        conn.execute("DELETE FROM kind_stk_info")
        conn.commit()
    print("    done.")


# ─────────────────────────────────────────────
# Step 2  Kiwoom API → stk_info
# ─────────────────────────────────────────────
async def step2_fill_from_kiwoom() -> int:
    print("[2] Kiwoom API(ka10099) → stk_info ...")
    from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
    from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import KiwoomRequest

    api = await get_kiwoom_api()
    mrkt_types = [("0", "코스피"), ("10", "코스닥"), ("3", "ELW")]
    all_items = []

    for mrkt_tp, label in mrkt_types:
        resp = await api.send_request(KiwoomRequest(api_id="ka10099", payload={"mrkt_tp": mrkt_tp}))
        if resp.success:
            items = resp.data.get("list", [])
            all_items.extend(items)
            print(f"    {label}: {len(items)}개")
        else:
            print(f"    {label} 실패: {resp.error_message}")

    if not all_items:
        print("    Kiwoom API 결과 없음 — skip")
        return 0

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    rows = [
        (
            item.get("code", ""),
            item.get("name", ""),
            item.get("listCount", ""),
            item.get("auditInfo", ""),
            item.get("regDay", ""),
            item.get("lastPrice", ""),
            item.get("state", ""),
            item.get("marketCode", ""),
            item.get("marketName", ""),
            item.get("upName", ""),
            item.get("upSizeName", ""),
            item.get("companyClassName", ""),
            item.get("orderWarning", "0"),
            item.get("nxtEnable", "N"),
            now,
        )
        for item in all_items
        if item.get("code")
    ]

    with sqlite3.connect(DB_PATH) as conn:
        conn.executemany(
            """
            INSERT OR REPLACE INTO stk_info (
                stk_cd, stk_nm, list_count, audit_info, reg_day, last_price, state,
                market_code, market_name, up_name, up_size_name, company_class_name,
                order_warning, nxt_enable, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
        conn.commit()

    print(f"    stk_info {len(rows)}건 insert.")
    return len(rows)


# ─────────────────────────────────────────────
# Step 3  KIND Excel 다운로드 → kind_stk_info
# ─────────────────────────────────────────────
def step3_download_and_fill_kind() -> int:
    today = datetime.now().strftime("%Y_%m_%d")
    xls_path = os.path.join(DATA_FOLDER, f"kind_stk_info_{today}.xls")

    print(f"[3] KIND Excel 다운로드 → {xls_path}")
    resp = requests.post(KIND_URL, data=KIND_PAYLOAD, headers=KIND_HEADERS, timeout=30)
    if resp.status_code != 200:
        print(f"    다운로드 실패: HTTP {resp.status_code}")
        return 0

    os.makedirs(DATA_FOLDER, exist_ok=True)
    with open(xls_path, "wb") as f:
        f.write(resp.content)
    print(f"    {len(resp.content):,} bytes 저장")

    # KIND XLS는 HTML table 형식
    print("    파싱 중...")
    try:
        dfs = pd.read_html(xls_path, encoding="euc-kr")
        df = dfs[0]
    except Exception as e:
        print(f"    read_html 실패({e}), xlrd 시도...")
        try:
            df = pd.read_excel(xls_path, engine="xlrd")
        except Exception as e2:
            print(f"    xlrd 실패: {e2}")
            return 0

    print(f"    컬럼: {df.columns.tolist()}")
    df = df.rename(columns=KIND_COL_MAP)

    # 종목코드 6자리 zero-pad
    if "stock_code" in df.columns:
        def normalize_code(x):
            s = str(x).strip() if pd.notna(x) else ""
            if not s or s == "nan":
                return ""
            # 숫자만 있으면 6자리 zero-pad, 알파벳 포함이면 그대로
            return s.zfill(6) if s.isdigit() else s
        df["stock_code"] = df["stock_code"].apply(normalize_code)

    def clean(val):
        s = str(val) if pd.notna(val) else ""
        return "" if s == "nan" else s

    rows = [
        (
            clean(row.get("corp_name")),
            clean(row.get("market_type")),
            clean(row.get("stock_code")),
            clean(row.get("industry")),
            clean(row.get("main_products")),
            clean(row.get("listing_date")),
            clean(row.get("settlement_month")),
            clean(row.get("representative_name")),
            clean(row.get("homepage")),
            clean(row.get("location")),
        )
        for _, row in df.iterrows()
    ]
    # stock_code 없는 행 제거
    rows = [r for r in rows if r[2]]

    with sqlite3.connect(DB_PATH) as conn:
        conn.executemany(
            """
            INSERT INTO kind_stk_info (
                corp_name, market_type, stock_code, industry, main_products,
                listing_date, settlement_month, representative_name, homepage, location
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
        conn.commit()

    print(f"    kind_stk_info {len(rows)}건 insert.")
    return len(rows)


# ─────────────────────────────────────────────
# Step 4  kind_stk_info → stk_info 4개 컬럼
# ─────────────────────────────────────────────
def step4_update_stk_info_from_kind() -> int:
    print("[4] kind_stk_info → stk_info 컬럼 업데이트 ...")
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()

        # 4개 컬럼이 없으면 추가
        cur.execute("PRAGMA table_info(stk_info)")
        existing = {row[1] for row in cur.fetchall()}
        for col in ("main_products", "representative_name", "homepage", "location"):
            if col not in existing:
                conn.execute(f"ALTER TABLE stk_info ADD COLUMN {col} TEXT")
                print(f"    ALTER TABLE stk_info ADD COLUMN {col}")
        conn.commit()

        cur.execute("""
            UPDATE stk_info SET
                main_products      = (SELECT k.main_products      FROM kind_stk_info k WHERE k.stock_code = stk_info.stk_cd LIMIT 1),
                representative_name= (SELECT k.representative_name FROM kind_stk_info k WHERE k.stock_code = stk_info.stk_cd LIMIT 1),
                homepage           = (SELECT k.homepage            FROM kind_stk_info k WHERE k.stock_code = stk_info.stk_cd LIMIT 1),
                location           = (SELECT k.location            FROM kind_stk_info k WHERE k.stock_code = stk_info.stk_cd LIMIT 1)
            WHERE stk_cd IN (SELECT stock_code FROM kind_stk_info)
        """)
        updated = cur.rowcount
        conn.commit()

    print(f"    stk_info {updated}건 업데이트.")
    return updated


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────
async def main():
    print("=" * 60)
    print("fill_stk_info.py")
    print(f"DB: {DB_PATH}")
    print("=" * 60)

    step1_delete()
    n_kiwoom  = await step2_fill_from_kiwoom()
    n_kind    = step3_download_and_fill_kind()
    n_updated = step4_update_stk_info_from_kind()

    print("=" * 60)
    print("DONE")
    print(f"  stk_info (Kiwoom)  : {n_kiwoom}건")
    print(f"  kind_stk_info      : {n_kind}건")
    print(f"  stk_info 업데이트  : {n_updated}건")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
