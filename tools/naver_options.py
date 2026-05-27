"""
네이버 종목토론방 스크래핑 진단 + 수집 도구

Usage:
  python tools/naver_options.py <stk_cd> [--debug]

Example:
  python tools/naver_options.py 005930
  python tools/naver_options.py 005930 --debug

Naver 내부 API(front-api/discussion/detail)를 직접 호출해 contentHtml 추출.
iframe 방식 폐기 — Next.js 앱이 client-side rendering으로 전환되어 iframe HTML에 본문 없음.
"""

import json
import sys
import time
from urllib.parse import parse_qs, urljoin, urlparse

import requests
from bs4 import BeautifulSoup

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


def _make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(_HEADERS)
    return s


def _extract_nid(href: str) -> str:
    """href에서 nid(게시물 ID) 추출. 예: /item/board_read.naver?nid=421003829"""
    params = parse_qs(urlparse(href).query)
    nid_list = params.get('nid', [])
    return nid_list[0] if nid_list else ''


def _fetch_posts(stk_cd: str, target_dot: str, max_posts: int = 40, max_pages: int = 10) -> list[dict]:
    """
    target_dot('YYYY.MM.DD') 날짜의 게시물 수집.
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
            print(f"  [WARN] 페이지 {page_no} 요청 실패: {e}")
            break

        soup = BeautifulSoup(resp.text, "html.parser")
        table = soup.find('table', class_='type2')
        if not table:
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

    return posts


def _fetch_detail(nid: str, session: requests.Session, debug: bool = False) -> str:
    """
    Naver front-api를 직접 호출해 게시물 본문 추출.
    실패 시 '' 반환.
    """
    url = f"{_DISCUSS_API}?id={nid}"
    try:
        time.sleep(0.3)
        resp = session.get(url, headers=_API_HEADERS, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        if debug:
            print(f"  [DEBUG] API status={resp.status_code}, isSuccess={data.get('isSuccess')}")

        if not data.get('isSuccess'):
            if debug:
                print(f"  [DEBUG] API 실패: {data.get('message')}")
            return ''

        result = data.get('result', {})
        content_html = result.get('contentHtml', '')

        if not content_html:
            if debug:
                print("  [DEBUG] contentHtml 없음")
            return ''

        csoup = BeautifulSoup(content_html, "html.parser")
        lines = [
            p.get_text(strip=True)
            for p in csoup.find_all('p')
            if p.get_text(strip=True)
        ]
        if lines:
            return '\n'.join(lines)

        # p 태그 없으면 전체 텍스트
        text = csoup.get_text(separator='\n', strip=True)
        return text if text else ''

    except Exception as e:
        if debug:
            print(f"  [DEBUG] 예외: {e}")
        return ''


def main():
    if len(sys.argv) < 2:
        print("Usage: python tools/naver_options.py <stk_cd> [--debug]")
        sys.exit(1)

    stk_cd = sys.argv[1].strip()
    debug = '--debug' in sys.argv

    from datetime import datetime, timedelta
    today_dot = datetime.now().strftime('%Y.%m.%d')

    print(f"종목코드: {stk_cd}")
    print(f"날짜: {today_dot}  (최대 5건 테스트)")
    if debug:
        print("[DEBUG 모드]")
    print("-" * 70)

    posts = _fetch_posts(stk_cd, today_dot, max_posts=5)
    if not posts:
        yest_dot = (datetime.now() - timedelta(days=1)).strftime('%Y.%m.%d')
        print(f"오늘 게시물 없음. 어제({yest_dot}) 재시도...")
        posts = _fetch_posts(stk_cd, yest_dot, max_posts=5)
        if not posts:
            print("어제 게시물도 없음.")
            sys.exit(0)

    print(f"게시물 {len(posts)}건 수집 → 본문 추출\n")

    session = _make_session()
    ok_count = 0
    for idx, post in enumerate(posts, 1):
        print(f"[{idx}/{len(posts)}] nid={post['nid']} | {post['title'][:60]}")
        body = _fetch_detail(post['nid'], session, debug=debug)
        if body:
            ok_count += 1
            print(f"  본문 ({len(body)}자): {body[:200]}{'...' if len(body) > 200 else ''}")
        else:
            print("  본문: (없음)")
        print()

    print(f"결과: {ok_count}/{len(posts)}건 본문 추출 성공")


if __name__ == "__main__":
    main()
