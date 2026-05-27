"""
네이버 종목토론방 수집 CLI 도구

Usage:
  python tools/naver_option.py <stk_cd>

Example:
  python tools/naver_option.py 005930
  python tools/naver_option.py 047810

오늘 날짜 게시물(최대 40건)을 제목+본문으로 수집해 stk_options 테이블에 UPSERT한다.
"""

import sys
import time
from datetime import datetime
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from backend.jobs.naver_options import (
    _fetch_detail,
    _fetch_posts,
    _make_session,
    _save_options,
)


def main():
    if len(sys.argv) < 2:
        print("Usage: python tools/naver_option.py <stk_cd>")
        sys.exit(1)

    stk_cd = sys.argv[1].strip()
    today_dot = datetime.now().strftime('%Y.%m.%d')
    today_ymd = datetime.now().strftime('%Y%m%d')

    start = time.time()

    print(f"종목코드 : {stk_cd}")
    print(f"수집 날짜: {today_dot}  (최대 40건, 제목+본문)")
    print("-" * 60)

    posts = _fetch_posts(stk_cd, today_dot)
    if not posts:
        print("오늘 게시물이 없습니다.")
        sys.exit(0)

    print(f"게시물 {len(posts)}건 수집 완료 — 본문 수집 중...\n")

    detail_session = _make_session()
    parts: list[str] = []
    for idx, post in enumerate(posts, 1):
        print(f"  [{idx}/{len(posts)}] {post['title'][:50]}")
        body = _fetch_detail(post['nid'], detail_session)
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

    elapsed = time.time() - start
    print(f"\nstk_options UPSERT 완료 ({len(posts)}건 → 1 row)")
    print(f"수집 시간: {elapsed:.1f}초")


if __name__ == "__main__":
    main()
