
import asyncio
import os
import sqlite3
from datetime import datetime

import pandas as pd
import requests

from backend.api.common.validators import validate_market_type
from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.infrahub.cache_keys import CacheKey
from backend.domains.kscheduler.k_scheduler import job_registry
from backend.domains.models.stk_info_model import (
    StkInfoBulkCreate,
    StkInfoCreate,
)
from backend.domains.services.dependency import get_service
from backend.domains.services.settings_keys import SettingsKey
from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import (
    KiwoomApiHelper,
    KiwoomRequest,
)

# from backend.domains.services.stk_info_service import get_stk_info_service
from backend.utils.kiwi_utils import get_current_timestamp, is_time_exceeded, to_str

logger = get_logger(__name__)

_KIND_URL = "https://kind.krx.co.kr/corpgeneral/corpList.do"
_KIND_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://kind.krx.co.kr/corpgeneral/corpList.do?method=loadInitPage",
}
_KIND_PAYLOAD = {"method": "download", "pageIndex": "1", "currentPageSize": "5000"}
_KIND_COL_MAP = {
    "회사명": "corp_name", "시장구분": "market_type", "종목코드": "stock_code",
    "업종": "industry", "주요제품": "main_products", "상장일": "listing_date",
    "결산월": "settlement_month", "대표자명": "representative_name",
    "홈페이지": "homepage", "지역": "location",
}


def _kind_stk_info_fill_sync():
    """KIND Excel 다운로드 → kind_stk_info INSERT → stk_info 4개 컬럼 UPDATE (동기)"""
    today = datetime.now().strftime("%Y_%m_%d")
    xls_path = os.path.join(config.DATA_FOLDER, f"kind_stk_info_{today}.xls")

    # 다운로드
    logger.info(f"KIND Excel 다운로드 → {xls_path}")
    resp = requests.post(_KIND_URL, data=_KIND_PAYLOAD, headers=_KIND_HEADERS, timeout=30)
    if resp.status_code != 200:
        logger.error(f"KIND 다운로드 실패: HTTP {resp.status_code}")
        return

    os.makedirs(config.DATA_FOLDER, exist_ok=True)
    with open(xls_path, "wb") as f:
        f.write(resp.content)
    logger.info(f"KIND Excel 저장: {len(resp.content):,} bytes")

    # 파싱
    try:
        df = pd.read_html(xls_path, encoding="euc-kr")[0]
    except Exception as e:
        logger.warning(f"read_html 실패({e}), xlrd 시도")
        try:
            df = pd.read_excel(xls_path, engine="xlrd")
        except Exception as e2:
            logger.error(f"KIND Excel 파싱 실패: {e2}")
            return

    df = df.rename(columns=_KIND_COL_MAP)

    def normalize_code(x):
        s = str(x).strip() if pd.notna(x) else ""
        return "" if s in ("", "nan") else (s.zfill(6) if s.isdigit() else s)

    if "stock_code" in df.columns:
        df["stock_code"] = df["stock_code"].apply(normalize_code)

    def clean(val):
        s = str(val) if pd.notna(val) else ""
        return "" if s == "nan" else s

    rows = [
        (
            clean(row.get("corp_name")), clean(row.get("market_type")),
            clean(row.get("stock_code")), clean(row.get("industry")),
            clean(row.get("main_products")), clean(row.get("listing_date")),
            clean(row.get("settlement_month")), clean(row.get("representative_name")),
            clean(row.get("homepage")), clean(row.get("location")),
        )
        for _, row in df.iterrows()
    ]
    rows = [r for r in rows if r[2]]  # stock_code 없는 행 제거

    with sqlite3.connect(config.DB_PATH) as conn:
        conn.execute("DELETE FROM kind_stk_info")
        conn.executemany(
            """INSERT INTO kind_stk_info
               (corp_name, market_type, stock_code, industry, main_products,
                listing_date, settlement_month, representative_name, homepage, location)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )

        # stk_info에 4개 컬럼 없으면 추가
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(stk_info)")
        existing_cols = {r[1] for r in cur.fetchall()}
        for col in ("main_products", "representative_name", "homepage", "location"):
            if col not in existing_cols:
                conn.execute(f"ALTER TABLE stk_info ADD COLUMN {col} TEXT")
                logger.info(f"ALTER TABLE stk_info ADD COLUMN {col}")

        # stk_info upsert: 이미 있으면 4개 컬럼만 갱신, 없으면 신규 row 생성
        # (stk_info_fill()을 따로 안 돌려도 KIND 데이터만으로 최소 정보가 채워지도록)
        cur.executemany(
            """INSERT INTO stk_info (stk_cd, stk_nm, main_products, representative_name, homepage, location)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(stk_cd) DO UPDATE SET
                   main_products       = excluded.main_products,
                   representative_name = excluded.representative_name,
                   homepage             = excluded.homepage,
                   location             = excluded.location""",
            [(r[2], r[0], r[4], r[7], r[8], r[9]) for r in rows],
        )
        conn.commit()

    logger.info(f"kind_stk_info {len(rows)}건 insert, stk_info {cur.rowcount}건 upsert 완료")


async def kind_stk_info_fill():
    """KIND stk_info 채우기 (비동기 래퍼)"""
    await asyncio.to_thread(_kind_stk_info_fill_sync)


@job_registry.register("fill_kind_stk_info")
async def fill_kind_stk_info_job(_payload: dict):
    """매일 03:00 KIND Excel 다운로드 → kind_stk_info + stk_info 갱신."""
    await asyncio.to_thread(_kind_stk_info_fill_sync)

async def stk_info_fill(force:bool=False):
    """ 
    stk_info 테이블을 채운다. 
    만약 force가 True이면 무조건 채운다. 
    모두 지우고 채운다.
    force가 False이면  settings테이블의 LAST_STK_INFO_FILL을 체크해서 일정시간이 지났다면 채운다.
    """
    # settings 에서 LAST_STK_INFO_FILL 을 찾아서
    settings_service = get_service("settings")
    last_fill_time = await settings_service.get(SettingsKey.LAST_STK_INFO_FILL)
    #  유효시간이 지났거나, force이면
    if not last_fill_time or (not force and is_time_exceeded(last_fill_time)) or force:
        # kiwoom에서 가져온다.
        api = await get_kiwoom_api()
        # 0:코스피,10:코스닥,3:ELW,8:ETF,30:K-OTC,50:코넥스,5:신주인수권,4:뮤추얼펀드,6:리츠,9:하이일드
        mrkt_types = ["0", "10", "3"]
        results = []
        for mrkt_tp in mrkt_types:
            if not validate_market_type(mrkt_tp):
                return KiwoomApiHelper.create_error_response(error_code="999", error_message=f"유효하지 않은 시장 타입: {mrkt_tp}")
            response = await api.send_request(KiwoomRequest(api_id="ka10099", payload={"mrkt_tp": mrkt_tp}))
            if response.success:
                # 성공적으로 데이터를 가져온 경우
                results.extend(response.data.get("list", []))
            else:
                logger.error(f"Failed to fetch stock info for market type {mrkt_tp}: {response.error_message}")
        if results:
            stk_info_service = get_service("stk_info")
            await stk_info_service.delete_all()
            logger.info("stk_info 테이블의 레코드를 모두 삭제함")
            
            # results 리스트를 StkInfoCreate 객체들로 변환
            stk_info_list = []
            for item in results:
                try:
                    stk_info = StkInfoCreate(
                        stk_cd=item.get('code', ''),
                        stk_nm=item.get('name', ''),
                        list_count=item.get('listCount', ''),
                        audit_info=item.get('auditInfo', ''),
                        reg_day=item.get('regDay', ''),
                        last_price=item.get('lastPrice', ''),
                        state=item.get('state', ''),
                        market_code=item.get('marketCode', ''),
                        market_name=item.get('marketName', ''),
                        up_name=item.get('upName', ''),
                        up_size_name=item.get('upSizeName', ''),
                        company_class_name=item.get('companyClassName', ''),
                        order_warning=item.get('orderWarning', '0'),
                        nxt_enable=item.get('nxtEnable', 'N')
                    )
                    stk_info_list.append(stk_info)
                except Exception as e:
                    logger.error(f"종목 정보 변환 실패: {item}, 오류: {e}")
                    continue
            
            # StkInfoBulkCreate 객체 생성
            bulk_data = StkInfoBulkCreate(stocks=stk_info_list, overwrite=True)

            # 대량 생성 실행
            success_count, error_count = await stk_info_service.bulk_create(bulk_data)
            logger.info(f"종목 정보 저장 완료 - 성공: {success_count}, 실패: {error_count}")
            
            # 타임스탬프 업데이트
            await settings_service.set(
                SettingsKey.LAST_STK_INFO_FILL,
                get_current_timestamp()
            )
            logger.info("LAST_STK_INFO_FILL 타임스탬프 업데이트 완료")

    # KIND Excel → kind_stk_info → stk_info 4개 컬럼 채우기
    try:
        await kind_stk_info_fill()
    except Exception as e:
        logger.error(f"KIND stk_info 채우기 실패: {e}")

async def get_stock_name(stk_code: str) -> str:
    ''' stk_code로 stk_name을 구한다. stk_info테이블에서 구하고 없으면 api로 구함'''
    stk_info_service = get_service("stk_info")
    stk_info = await stk_info_service.get_by_code(stk_code)
    if stk_info and stk_info.stk_nm:
        return stk_info.stk_nm
    else:
        api = await get_kiwoom_api()
        api_response = await api.send_request(KiwoomRequest(api_id="ka10001", payload={"stk_cd": stk_code}))
        if api_response.success and api_response.data:
            name = api_response.data.get("stk_nm", "")
            if name:
                return name
            else:
                logger.error(f"get_stock_name 함수에서 ka10001 요청은 성공했으나 이름이 없음: {stk_code}")
    return None

async def fetch_stk_info(stk_code_list):
    '''
    stk_code_list를 받아서 종목정보조회(ka10100)를 호출해서 모은 후 리스트로 리턴
    캐시에서 먼저 찾고, 없으면 API 호출

    캐시 매니저를 사용하여 간단한 인터페이스로 캐시 처리:
    - get_dict(): JSON 파싱 + 손상된 캐시 자동 삭제
    - put(): 캐시 저장
    - CacheKey enum으로 타입 안전한 캐시 키 관리
    '''
    api_id = "ka10100"
    cache_mgr = get_service("cache_manager")
    api = await get_kiwoom_api()
    results = []

    for stk_cd in stk_code_list:
        # 1. 캐시에서 먼저 조회 (8시간 만료 정책 자동 적용)
        # get_dict()는 JSON 파싱과 손상된 캐시 삭제를 자동으로 처리
        cached_value = await cache_mgr.get_dict(
            stk_cd, CacheKey.STK_INFO_KA10100
        )

        if cached_value:
            results.append(cached_value)
            continue

        # 2. 캐시 미스: API 호출
        response = await api.send_request(
            KiwoomRequest(api_id="ka10100", payload={"stk_cd": stk_cd})
        )
        if response.success:
            # 결과 추가 및 캐시 저장
            korea_data = KiwoomApiHelper.to_korea_data(
                response.data, api_id
            )
            results.append(korea_data)
            await cache_mgr.put(
                stk_cd, CacheKey.STK_INFO_KA10100, to_str(korea_data)
            )
        else:
            logger.error(
                f"fetch_stk_info 함수에서 {stk_cd}로 ka10100 "
                f"요청 실패: {response.error_message}"
            )
    return results