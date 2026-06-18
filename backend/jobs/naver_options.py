# backend/jobs/naver_options.py
"""
네이버 종목토론방 일별 의견 집계 Job

매일 새벽 2시에 my_stock 테이블의 모든 종목(보유+관심)에 대해
전날 게시물을 수집, 제목+본문을 하나의 텍스트로 합쳐 stk_options에 저장.
종목+날짜 기준 UPSERT이므로 재실행해도 중복 없음.

본문 수집: Naver front-api(m.stock.naver.com/front-api/discussion/detail) 직접 호출.
iframe 방식 폐기 — Next.js 앱이 client-side rendering으로 전환되어 iframe HTML에 본문 없음.
"""
from __future__ import annotations

import asyncio
import random
import sqlite3
import time
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse

import requests
from bs4 import BeautifulSoup

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.kscheduler.k_scheduler import job_registry

logger = get_logger(__name__)

_NAVER_BOARD_URL = "https://finance.naver.com/item/board.naver"
_DISCUSS_API = "https://m.stock.naver.com/front-api/discussion/detail"
_HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/116.0.0.0 Safari/537.36'
    ),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://finance.naver.com/',
}
_API_HEADERS = {
    **_HEADERS,
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://m.stock.naver.com/',
    'Origin': 'https://m.stock.naver.com',
}


# ==============================================================
# 헬퍼
# ==============================================================

def _make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(_HEADERS)
    return s


def _get_yesterday() -> tuple[str, str]:
    """(YYYY.MM.DD, YYYYMMDD) 형식의 어제 날짜를 반환"""
    yest = datetime.now() - timedelta(days=1)
    return yest.strftime('%Y.%m.%d'), yest.strftime('%Y%m%d')


def _get_stock_codes() -> list[str]:
    """my_stock에서 보유 또는 관심 종목 코드 목록 반환"""
    with sqlite3.connect(config.DB_PATH) as conn:
        cur = conn.execute(
            "SELECT stk_cd FROM my_stock WHERE is_hold = 1 OR is_watch = 1"
        )
        return [row[0] for row in cur.fetchall()]


def _extract_nid(href: str) -> str:
    """href에서 nid(게시물 ID) 추출. 예: /item/board_read.naver?nid=421003829"""
    params = parse_qs(urlparse(href).query)
    nid_list = params.get('nid', [])
    return nid_list[0] if nid_list else ''


# ==============================================================
# 스크래핑
# ==============================================================

def _fetch_posts(stk_cd: str, target_dot: str, max_posts: int = 40, max_pages: int = 10) -> list[dict]:
    """
    target_dot('YYYY.MM.DD') 날짜의 게시물만 수집.
    반환: [{'title': ..., 'href': ..., 'nid': ...}, ...]
    """
    session = _make_session()
    posts: list[dict] = []

    for page_no in range(1, max_pages + 1):
        url = f"{_NAVER_BOARD_URL}?code={stk_cd}&page={page_no}"
        try:
            time.sleep(0.5)
            resp = session.get(url, timeout=10)
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.warning(f"[naver_options] {stk_cd} 페이지 {page_no} 요청 실패: {e}")
            break

        soup = BeautifulSoup(resp.text, "html.parser")
        table = soup.find('table', class_='type2')
        if not table:
            logger.debug(f"[naver_options] {stk_cd} 페이지 {page_no}: type2 테이블 없음")
            break

        rows = table.find_all('tr', onmouseover=True)
        done = False

        for row in rows:
            tds = row.find_all('td')
            if len(tds) < 2:
                continue
            date_span = tds[0].find('span', class_='tah p10 gray03')
            if not date_span:
                continue
            date_str = date_span.get_text(strip=True)
            date_part = date_str[:10]

            if date_part < target_dot:
                done = True
                break
            if date_part != target_dot:
                continue

            title_td = tds[1]
            if not title_td or 'title' not in title_td.get('class', []):
                continue
            anchor = title_td.find('a', title=True)
            if not anchor:
                continue
            title = anchor.get('title', '').strip()
            href = anchor.get('href', '').strip()
            nid = _extract_nid(href)
            if title and href and nid:
                posts.append({'title': title, 'href': href, 'nid': nid})
                if len(posts) >= max_posts:
                    done = True
                    break

        if done:
            break

    logger.info(f"[naver_options] {stk_cd} {target_dot} 게시물 {len(posts)}건 수집")
    return posts


def _fetch_detail(nid: str, session: requests.Session) -> str:
    """
    Naver front-api를 직접 호출해 게시물 본문 텍스트 추출.
    실패 시 '' 반환 (제목만이라도 집계에 포함되도록).
    """
    url = f"{_DISCUSS_API}?id={nid}"
    try:
        time.sleep(0.3)
        resp = session.get(url, headers=_API_HEADERS, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        if not data.get('isSuccess'):
            logger.debug(f"[naver_options] nid={nid} API 실패: {data.get('message')}")
            return ''

        content_html = data.get('result', {}).get('contentHtml', '')
        if not content_html:
            return ''

        csoup = BeautifulSoup(content_html, "html.parser")
        lines = [
            p.get_text(strip=True)
            for p in csoup.find_all('p')
            if p.get_text(strip=True)
        ]
        if lines:
            return '\n'.join(lines)

        return csoup.get_text(separator='\n', strip=True)

    except Exception as e:
        logger.debug(f"[naver_options] nid={nid} 본문 추출 실패: {e}")
        return ''


# ==============================================================
# DB 저장
# ==============================================================

_UPSERT_SQL = """
INSERT INTO stk_options (stk_cd, date, options)
VALUES (?, ?, ?)
ON CONFLICT(stk_cd, date) DO UPDATE SET
    options = excluded.options
"""


def _save_options(stk_cd: str, date_ymd: str, options_text: str) -> None:
    with sqlite3.connect(config.DB_PATH) as conn:
        conn.execute(_UPSERT_SQL, (stk_cd, date_ymd, options_text))
        conn.commit()


# ==============================================================
# 메인 수집 함수 (동기)
# ==============================================================

def collect_naver_options() -> int:
    """
    my_stock의 모든 종목에 대해 어제 네이버 종목토론방 게시물을 수집·집계.

    Returns:
        stk_options에 저장된 종목 수
    """
    logger.info("[naver_options] 수집 시작")
    yest_dot, yest_ymd = _get_yesterday()
    stk_codes = _get_stock_codes()

    if not stk_codes:
        logger.warning("[naver_options] my_stock에 대상 종목 없음 — 종료")
        return 0

    logger.info(f"[naver_options] 대상 종목 {len(stk_codes)}개, 날짜: {yest_dot}")

    saved_count = 0

    for stk_cd in stk_codes:
        posts = _fetch_posts(stk_cd, yest_dot)
        if not posts:
            logger.info(f"[naver_options] {stk_cd}: 어제 게시물 없음 — 스킵")
            continue

        session = _make_session()
        parts: list[str] = []
        for idx, post in enumerate(posts, 1):
            body = _fetch_detail(post['nid'], session)
            if body:
                parts.append(f"[{idx}] {post['title']}\n{body}")
            else:
                parts.append(f"[{idx}] {post['title']}")

        options_text = '\n\n'.join(parts)
        try:
            _save_options(stk_cd, yest_ymd, options_text)
            logger.info(f"[naver_options] {stk_cd} 저장 완료 ({len(posts)}건)")
            saved_count += 1
        except Exception as e:
            logger.error(f"[naver_options] {stk_cd} DB 저장 실패: {e}")

        wait = random.uniform(2, 5)
        logger.debug(f"[naver_options] 다음 종목까지 {wait:.1f}초 대기")
        time.sleep(wait)

    logger.info(f"[naver_options] 완료 — {saved_count}/{len(stk_codes)} 종목 저장")
    return saved_count


# ==============================================================
# Scheduler Job 등록
# ==============================================================

@job_registry.register("scrap_naver_options")
async def scrap_naver_options_job(_payload: dict):
    """
    매일 02:00 네이버 종목토론방 수집 → stk_options 저장.

    my_stock이 새벽 시간대엔 비어있을 수 있어(자동 동기화 cron이 없음),
    수집 대상을 정하기 전에 my_stock 동기화를 먼저 실행한다.
    requests/time.sleep 동기 코드이므로 run_in_executor로 감싸
    FastAPI 이벤트 루프 블로킹을 방지한다.
    """
    from backend.domains.services.my_stock_service import get_my_stock_service

    try:
        await get_my_stock_service().scheduler_sync_and_update()
    except Exception as e:
        logger.error(f"[naver_options] my_stock 동기화 실패: {e}")

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, collect_naver_options)
