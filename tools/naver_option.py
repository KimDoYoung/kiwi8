"""
네이버 종목토론방 수집 CLI 도구

Usage:
  python tools/naver_option.py <stk_cd>

Example:
  python tools/naver_option.py 005930
  python tools/naver_option.py 160190

오늘 날짜 게시물을 수집해 stk_options 테이블에 UPSERT한다.
(배치 job과 로직 동일, 날짜만 오늘로)
"""

import sys
from datetime import datetime
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import time

import requests
from bs4 import BeautifulSoup

from backend.jobs.naver_options import (
    _HEADERS,
    _NAVER_BOARD_URL,
    _fetch_detail,
    _fetch_posts,
    _make_session,
    _save_options,
)


def _diagnose(stk_cd: str):
    """1페이지를 직접 파싱해 날짜 포맷을 출력"""
    url = f"{_NAVER_BOARD_URL}?code={stk_cd}&page=1"
    session = _make_session()
    time.sleep(0.5)
    resp = session.get(url, timeout=10)
    soup = BeautifulSoup(resp.text, "html.parser")
    table = soup.find('table', class_='type2')
    if not table:
        print("[진단] type2 테이블을 찾을 수 없습니다. 응답 앞부분:")
        print(resp.text[:500])
        return
    rows = table.find_all('tr', onmouseover=True)
    print(f"[진단] onmouseover 행 수: {len(rows)}")
    for i, row in enumerate(rows[:5]):
        tds = row.find_all('td')
        date_span = tds[0].find('span', class_='tah p10 gray03') if tds else None
        date_str = date_span.get_text(strip=True) if date_span else '(날짜 없음)'
        title_td = tds[1] if len(tds) > 1 else None
        anchor = title_td.find('a', title=True) if title_td else None
        title = anchor.get('title', '')[:40] if anchor else '(제목 없음)'
        print(f"  행{i+1}: 날짜='{date_str}'  제목='{title}'")


def main():
    if len(sys.argv) < 2:
        print("Usage: python tools/naver_option.py <stk_cd>")
        sys.exit(1)

    stk_cd = sys.argv[1].strip()
    today_dot = datetime.now().strftime('%Y.%m.%d')
    today_ymd = datetime.now().strftime('%Y%m%d')

    print(f"종목코드: {stk_cd}")
    print(f"수집 날짜: {today_dot}")
    print("-" * 60)
    _diagnose(stk_cd)
    print("-" * 60)

    posts = _fetch_posts(stk_cd, today_dot)
    if not posts:
        print("오늘 게시물이 없습니다.")
        sys.exit(0)

    print(f"게시물 {len(posts)}건 발견 — 본문 수집 중...\n")

    detail_session = _make_session()
    parts: list[str] = []

    for idx, post in enumerate(posts, 1):
        print(f"  [{idx}/{len(posts)}] {post['title']}")
        body = _fetch_detail(post['href'], detail_session)
        entry = f"[{idx}] {post['title']}"
        if body:
            entry += f"\n{body}"
        parts.append(entry)

    options_text = '\n\n'.join(parts)

    print("\n" + "=" * 60)
    print(f"집계 결과 (stk_cd={stk_cd}, date={today_ymd})")
    print("=" * 60)
    print(options_text[:1000] + ("..." if len(options_text) > 1000 else ""))
    print("=" * 60)

    _save_options(stk_cd, today_ymd, options_text)
    print(f"\nstk_options UPSERT 완료 ({len(posts)}건 → 1 row)")


if __name__ == "__main__":
    main()
