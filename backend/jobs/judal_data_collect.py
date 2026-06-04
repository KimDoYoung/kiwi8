# backend/jobs/judal_data_collect.py
"""
모듈 설명:
    - '주달'(judal.co.kr) 사이트를 스크래핑하여 judal_themes 테이블에 적재
    - 실행 시마다 테이블 전체 삭제 후 재적재 (최신 데이터만 보관)
    - '현재가격' 컬럼이 있는 종목 페이지만 적재, 테마 요약 페이지는 스킵

스크래핑 → DB 적재 흐름:
    1. judal.co.kr 메인에서 테마/카테고리 URL 목록 수집
    2. 각 URL의 테이블 파싱:
       - '현재가격' 컬럼 → df_change() → judal_themes 적재 (theme_name = 페이지명)
       - '테마차트(90일)' 컬럼 → 스키마 다름 → 스킵
    3. 수집 완료 후 DELETE → bulk INSERT

작성자: kiwi8
작성일: 2026-05-13
"""
from __future__ import annotations

import asyncio
import random
import re
import sqlite3
import time
from datetime import datetime
from io import StringIO

import pandas as pd
import requests
from bs4 import BeautifulSoup

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.kscheduler.k_scheduler import job_registry
from backend.domains.services.settings_keys import SettingsKey

logger = get_logger(__name__)

_JUDAL_URL = "https://www.judal.co.kr/"
_HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/58.0.3029.110 Safari/537.36'
    )
}

# ==============================================================
# 데이터 변환 헬퍼
# ==============================================================

def _to_int(val) -> int | None:
    if val is None:
        return None
    try:
        f = float(str(val).replace(',', ''))
        return int(f) if str(f) != 'nan' else None
    except (ValueError, TypeError):
        return None


def _to_float(val) -> float | None:
    if val is None:
        return None
    try:
        f = float(str(val).replace('%', '').replace(',', ''))
        import math
        return None if math.isnan(f) else f
    except (ValueError, TypeError):
        return None


def _to_str(val) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    return s if s and s.lower() != 'nan' else None


# ==============================================================
# 원본 변환 함수 (judal_scrap_1.py 기반, dead code 제거)
# ==============================================================

def to_eak(value: str) -> int:
    """'조'/'억원' 단위 문자열을 억 단위 정수로 변환"""
    value = value.replace(' ', '')
    if '조' in value and '억원' in value:
        parts = value.split('조')
        return int(parts[0]) * 10000 + int(parts[1].replace('억원', ''))
    elif '조' in value:
        return int(value.replace('조', '')) * 10000
    elif '억원' in value:
        return int(value.replace('억원', ''))
    else:
        return int(value)


def split_title_count(span_text: str) -> tuple[str | None, int | None]:
    """'원자재(구리)(6)' 형태에서 제목과 카운트 분리"""
    match = re.match(r'^(.*)\((\d+)\)$', span_text)
    if match:
        return match.group(1), int(match.group(2))
    return None, None


def df_change(df: pd.DataFrame) -> pd.DataFrame:
    """종목 데이터 정제 — '현재가격' 컬럼이 있는 페이지용"""
    cost_range_pattern = r'([0-9,-]+)\s*([0-9,-]+)'
    percent_range_pattern = r'(-?\d+\.\d+%)\s*(-?\d+\.\d+%)?'

    def to_safe_int(series):
        return pd.to_numeric(
            series.astype(str).str.replace(',', '', regex=False),
            errors='coerce'
        ).fillna(0).astype(int)

    def to_safe_float(series):
        return pd.to_numeric(
            series.astype(str).str.replace('%', '', regex=False).str.replace(',', '', regex=False),
            errors='coerce'
        ).fillna(0.0).astype(float)

    # 종목명 분리
    if '종목명' in df.columns:
        array1 = df['종목명'].str.split(' ')
        df['종목명'] = array1.str[0]
        df['시장종류'] = array1.str[1]
        df['종목코드'] = array1.str[2]

    # 현재가격 → 현재가, 등락가
    if '현재가격' in df.columns:
        df[['현재가', '등락가']] = df['현재가격'].str.extract(cost_range_pattern)
        df['현재가'] = to_safe_int(df['현재가'])
        df['등락가'] = to_safe_int(df['등락가'])
        df.drop(columns=['현재가격'], inplace=True, errors='ignore')

    # 52주 최고최저
    if '52주 최고최저' in df.columns:
        df[['52주최고', '52주최저']] = df['52주 최고최저'].str.extract(cost_range_pattern)
        df['52주최고'] = to_safe_int(df['52주최고'])
        df['52주최저'] = to_safe_int(df['52주최저'])
        df.drop(columns=['52주 최고최저'], inplace=True, errors='ignore')

    # 52주 변동률
    if '52주 변동률' in df.columns:
        df[['52주변동률최저', '52주변동률최고']] = df['52주 변동률'].str.extract(percent_range_pattern)
        df['52주변동률최저'] = to_safe_float(df['52주변동률최저'])
        df['52주변동률최고'] = to_safe_float(df['52주변동률최고'])
        df.drop(columns=['52주 변동률'], inplace=True, errors='ignore')

    # 3년 최고최저
    if '3년 최고최저' in df.columns:
        df[['3년최고', '3년최저']] = df['3년 최고최저'].str.extract(cost_range_pattern)
        df['3년최고'] = to_safe_int(df['3년최고'])
        df['3년최저'] = to_safe_int(df['3년최저'])
        df.drop(columns=['3년 최고최저'], inplace=True, errors='ignore')

    # 3년 변동률
    if '3년 변동률' in df.columns:
        df[['3년변동률최저', '3년변동률최고']] = df['3년 변동률'].str.extract(percent_range_pattern)
        df['3년변동률최저'] = to_safe_float(df['3년변동률최저'])
        df['3년변동률최고'] = to_safe_float(df['3년변동률최고'])
        df.drop(columns=['3년 변동률'], inplace=True, errors='ignore')

    # 시가총액 (조/억원 단위 처리)
    if '시가총액' in df.columns:
        df['시가총액'] = df['시가총액'].apply(to_eak)

    # 수치형 컬럼 변환
    float_cols = ['기대수익률', '3일합산', '전일비', '최근7일 거래량지수', '당일 거래량지수']
    for col in float_cols:
        if col in df.columns:
            df[col] = to_safe_float(df[col])

    # 버핏초이스 (순위 숫자, '위' 제거)
    if '버핏초이스' in df.columns:
        temp = df['버핏초이스'].astype(str).str.replace(' ', '', regex=False).str.replace('위', '', regex=False)
        df['버핏초이스'] = pd.to_numeric(temp, errors='coerce').fillna(99999).astype(int)

    return df


def df_change_theme(df: pd.DataFrame) -> pd.DataFrame:
    """테마 요약 데이터 정제 — '테마차트(90일)' 컬럼이 있는 페이지용 (judal_themes 미적재)"""
    df.drop(columns=['테마차트(90일)', '업데이트', '테마토크'], inplace=True, errors='ignore')
    if '테마명' in df.columns:
        df['테마명'] = df['테마명'].str.replace('Information', '', regex=False).str.strip()

    pct_cols = ['3년 상승률', '3년 하락률', '52주 상승률', '52주 하락률', '전일비', '3일합산', '기대수익률']
    for col in pct_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(
                df[col].astype(str).str.replace('%', '', regex=False),
                errors='coerce'
            )
    return df


# ==============================================================
# df → DB row 변환
# ==============================================================

def _df_to_rows(df: pd.DataFrame, theme_name: str) -> list[dict]:
    """df_change() 처리된 DataFrame을 judal_themes INSERT용 dict 리스트로 변환"""
    rows = []
    for _, row in df.iterrows():
        stock_name = _to_str(row.get('종목명'))
        if not stock_name:
            continue
        rows.append({
            'theme_name': theme_name,
            'stock_name': stock_name,
            'stock_code': _to_str(row.get('종목코드')),
            'market_type': _to_str(row.get('시장종류')),
            'current_price': _to_int(row.get('현재가')),
            'price_change': _to_int(row.get('등락가')),
            'yesterday_ratio': _to_float(row.get('전일비')),
            'three_day_sum': _to_float(row.get('3일합산')),
            'expected_return': _to_float(row.get('기대수익률')),
            'pbr': _to_float(row.get('PBR')),
            'per': _to_float(row.get('PER')),
            'eps': _to_int(row.get('EPS')),
            'market_cap': _to_int(row.get('시가총액')),
            'volume_index_today': _to_float(row.get('당일 거래량지수')),
            'volume_index_7d': _to_float(row.get('최근7일 거래량지수')),
            'buffett_choice': _to_int(row.get('버핏초이스')),
            'high_52w': _to_int(row.get('52주최고')),
            'low_52w': _to_int(row.get('52주최저')),
            'change_rate_low_52w': _to_float(row.get('52주변동률최저')),
            'change_rate_high_52w': _to_float(row.get('52주변동률최고')),
            'high_3y': _to_int(row.get('3년최고')),
            'low_3y': _to_int(row.get('3년최저')),
            'change_rate_low_3y': _to_float(row.get('3년변동률최저')),
            'change_rate_high_3y': _to_float(row.get('3년변동률최고')),
            'alienation_index_52w': _to_int(row.get('52주 소외지수')),
            'alienation_index_3y': _to_int(row.get('3년 소외지수')),
            'stock_index_3y': _to_int(row.get('3년 주가지수')),
            'related_themes': _to_str(row.get('관련테마')),
            'updated_at': _to_str(row.get('업데이트')),
        })
    return rows


# ==============================================================
# DB 적재
# ==============================================================

_INSERT_SQL = """
INSERT INTO judal_themes (
    theme_name, stock_name, stock_code, market_type,
    current_price, price_change, yesterday_ratio, three_day_sum,
    expected_return, pbr, per, eps, market_cap,
    volume_index_today, volume_index_7d, buffett_choice,
    high_52w, low_52w, change_rate_low_52w, change_rate_high_52w,
    high_3y, low_3y, change_rate_low_3y, change_rate_high_3y,
    alienation_index_52w, alienation_index_3y, stock_index_3y,
    related_themes, updated_at
) VALUES (
    :theme_name, :stock_name, :stock_code, :market_type,
    :current_price, :price_change, :yesterday_ratio, :three_day_sum,
    :expected_return, :pbr, :per, :eps, :market_cap,
    :volume_index_today, :volume_index_7d, :buffett_choice,
    :high_52w, :low_52w, :change_rate_low_52w, :change_rate_high_52w,
    :high_3y, :low_3y, :change_rate_low_3y, :change_rate_high_3y,
    :alienation_index_52w, :alienation_index_3y, :stock_index_3y,
    :related_themes, :updated_at
)
"""


def _save_to_db(rows: list[dict]) -> int:
    """judal_themes 전체 삭제 후 bulk INSERT. 삽입 건수 반환."""
    with sqlite3.connect(config.DB_PATH) as conn:
        conn.execute("DELETE FROM judal_themes")
        conn.executemany(_INSERT_SQL, rows)
        conn.commit()
    return len(rows)


# ==============================================================
# 메인 수집 함수 (동기)
# ==============================================================

def collect_judal() -> int:
    """
    주달 사이트 전체 스크래핑 → judal_themes 적재.

    Returns:
        적재된 총 행 수
    """
    logger.info("[judal] 수집 시작")

    # 메인 페이지 접속
    response = requests.get(_JUDAL_URL, headers=_HEADERS)
    soup = BeautifulSoup(response.content, "html.parser")

    # 테마 목록과 카테고리 URL 수집
    divs = soup.find_all('div', class_='list-group-item list-group-item-action disabled')
    start_div = divs[0] if len(divs) >= 1 else None
    end_div = divs[1] if len(divs) >= 2 else None

    theme_list: list[dict] = []
    if start_div and end_div:
        for sibling in start_div.find_next_siblings():
            if sibling == end_div:
                break
            if (sibling.name == 'a' and
                    'list-group-item list-group-item-action list-group-item-sub px-4 py-0'
                    in ' '.join(sibling.get('class', []))):
                theme_list.append({'name': sibling.text.strip(), 'href': sibling.get('href')})

    href_list: list[dict] = []
    if end_div:
        for sibling in end_div.find_next_siblings():
            if sibling.name != 'a':
                break
            name, _ = split_title_count(sibling.find('span').text.strip())
            href_list.append({'name': name, 'href': sibling.get('href')})

    all_items = theme_list + href_list
    logger.info(f"[judal] 수집 대상 URL: {len(all_items)}개")

    # URL별 스크래핑 및 rows 누적
    all_rows: list[dict] = []
    scraped_urls: set[str] = set()

    for item in all_items:
        url = item['href']
        name = item['name'] or ''

        if url in scraped_urls:
            continue

        try:
            resp = requests.get(url, headers=_HEADERS)
            page_soup = BeautifulSoup(resp.content, "html.parser")
            table_tag = page_soup.find(
                'table',
                class_='table table-sm table-bordered table-hover align-middle small'
            )

            if not table_tag:
                logger.debug(f"[judal] 테이블 없음: {name} ({url})")
                scraped_urls.add(url)
                continue

            df = pd.read_html(StringIO(str(table_tag)))[0]

            if '현재가격' in df.columns:
                # 종목 데이터 → judal_themes 적재 대상
                df = df_change(df)
                if '종목명' in df.columns:
                    rows = _df_to_rows(df, theme_name=name)
                    all_rows.extend(rows)
                    logger.debug(f"[judal] 종목 수집: {name} → {len(rows)}행")
                else:
                    logger.warning(f"[judal] df_change 후 종목명 없음: {name}")

            elif '테마차트(90일)' in df.columns:
                # 테마 요약 페이지 → 스킵 (schema 다름)
                df_change_theme(df)
                logger.debug(f"[judal] 테마 요약 페이지 스킵: {name}")

            else:
                logger.debug(f"[judal] 알 수 없는 테이블 구조 스킵: {name}")

        except Exception as e:
            logger.error(f"[judal] 수집 오류 {name} ({url}): {e}")

        scraped_urls.add(url)
        time.sleep(random.uniform(1, 5))

    # DB 적재
    if not all_rows:
        logger.warning("[judal] 수집된 데이터 없음 — DB 적재 스킵")
        return 0

    try:
        count = _save_to_db(all_rows)
        logger.info(f"[judal] DB 적재 완료: {count}행")
        _save_scrap_time()
        return count
    except Exception as e:
        logger.error(f"[judal] DB 적재 실패: {e}")
        raise


def _save_scrap_time():
    """스크래핑 완료 시각을 settings 테이블에 저장."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with sqlite3.connect(config.DB_PATH) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings (name, value) VALUES (?, ?)",
            (SettingsKey.LAST_SCRAP_JUDAL.value, now),
        )
        conn.commit()


# ==============================================================
# Scheduler Job 등록
# ==============================================================

@job_registry.register("scrap_judal")
async def scrap_judal_job(_payload: dict):
    """
    매일 01:00 주달 사이트 수집 → judal_themes 적재.

    requests/time.sleep 동기 코드이므로 run_in_executor로 감싸
    FastAPI 이벤트 루프 블로킹을 방지한다.
    """
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, collect_judal)
