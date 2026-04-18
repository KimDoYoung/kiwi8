"""
/tmp/ls_req.txt 에서 tr_code → url 매핑을 읽어
ls/models/requests/*.py 파일의 url 없는 항목에 url을 추가한다.
"""

import re
import sys
from pathlib import Path


# ── 1. ls_req.txt 파싱 → {tr_code: url} ─────────────────────────────────────

def parse_url_map(txt_path: str) -> dict[str, str]:
    """
    형식:
      'TRCODE': {
          "url": "/stock/market-data",
          ...
    TR 코드 줄 다음에 url 줄이 오면 매핑
    """
    url_map = {}
    lines = Path(txt_path).read_text(encoding='utf-8').splitlines()
    current_tr = None
    for line in lines:
        m_tr = re.match(r"^'([^']+)':\s*\{", line)
        if m_tr:
            current_tr = m_tr.group(1)
            continue
        if current_tr:
            m_url = re.match(r'\s+"url"\s*:\s*"([^"]+)"', line)
            if m_url:
                url_map[current_tr] = m_url.group(1)
                current_tr = None  # 매핑 완료
            elif re.match(r"^'[^']+':\s*\{", line):
                current_tr = None  # 다음 TR 시작 (url 없는 TR)
    return url_map


# ── 2. .py 파일 패치 ─────────────────────────────────────────────────────────

def patch_file(path: Path, url_map: dict[str, str]) -> int:
    text = path.read_text(encoding='utf-8')
    original = text
    count = 0

    # 'TRCODE': { ... } 블록을 찾아서 url 없으면 삽입
    # 전략: 'tr_cd': 'XXX', 줄을 찾고, 이후 'title': '...' 줄 다음에
    #        url 키가 없으면 삽입 (url 키가 이미 있으면 스킵)

    def replacer(m):
        nonlocal count
        tr_code = m.group(1)
        block_content = m.group(0)

        # 이미 url 키가 있으면 스킵 (공백 형태 무관하게 체크)
        if re.search(r"'url'\s*:", block_content):
            return block_content

        url = url_map.get(tr_code)
        if not url:
            return block_content

        # 'title': '...' 줄 다음에 url 삽입
        indent_m = re.search(r"^([ \t]*)'tr_cd'", block_content, re.MULTILINE)
        indent = indent_m.group(1) if indent_m else '        '

        new_block = re.sub(
            r"('title'\s*:[^\n]+)",
            lambda tm: tm.group(1) + f"\n{indent}'url': '{url}',",
            block_content,
            count=1,
        )
        if new_block != block_content:
            count += 1
        return new_block

    # 각 TR 블록: 'tr_cd' 부터 다음 TR 시작('XXX': {) 또는 파일 끝까지
    # 단순하게: 'tr_cd': 'XXX', 로 시작하는 섹션을 찾아 처리
    pattern = re.compile(
        r"(?s)'tr_cd'\s*:\s*'([^']+)'.*?(?='[^']+'\s*:\s*\{|\Z)",
    )
    text = pattern.sub(replacer, text)

    if text != original:
        path.write_text(text, encoding='utf-8')
        print(f"  패치: {path.name}  (+{count}개 url 추가)")
    else:
        print(f"  스킵: {path.name}  (변경 없음)")

    return count


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    txt_path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/ls_req.txt'
    requests_dir = Path(__file__).parent.parent / 'backend/domains/stkcompanys/ls/models/requests'

    print(f'URL 맵 로드: {txt_path}')
    url_map = parse_url_map(txt_path)
    print(f'  → {len(url_map)}개 TR 매핑 로드')

    py_files = sorted(requests_dir.glob('*.py'))
    py_files = [f for f in py_files if f.name != '__init__.py']

    total = 0
    for f in py_files:
        total += patch_file(f, url_map)

    print(f'\n완료: 총 {total}개 url 추가')


if __name__ == '__main__':
    main()
