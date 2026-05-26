import html
import re

from fastapi import APIRouter, Query

from backend.core.logger import get_logger
from backend.domains.services.stk_news_service import stk_news_service
from backend.domains.stkcompanys.ls.ls_service import get_ls_api
from backend.domains.stkcompanys.ls.models.ls_schema import LsRequest


def _strip_html(text: str) -> str:
    # head/style/script 블록 제거
    text = re.sub(r'<head[^>]*>.*?</head>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
    # <br> → 줄바꿈
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    # 나머지 태그 제거
    text = re.sub(r'<[^>]+>', '', text)
    # EUC-KR 청크 경계에서 잘린 깨진 문자 제거
    text = text.replace('�', '')
    # HTML 엔티티 디코딩 (&nbsp; &amp; 등)
    text = html.unescape(text)
    # 줄바꿈 정규화
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    # 각 줄 앞뒤 공백 제거
    text = '\n'.join(line.strip() for line in text.splitlines())
    # 빈 줄 3개 이상 → 2개로
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _linkify_stock_codes(text: str) -> str:
    """6자리 종목코드를 네이버 증권 링크로 변환 (HTML 형식)"""
    # 줄바꿈 → <br>
    escaped = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

    def replace_code(m: re.Match) -> str:
        code = m.group(0)
        return f'<a href="https://finance.naver.com/item/main.naver?code={code}" target="_blank" class="text-blue-600 underline">{code}</a>'

    # 독립된 6자리 숫자만 (앞뒤가 숫자/문자 아닌 것)
    result = re.sub(r'(?<!\d)\d{6}(?!\d)', replace_code, escaped)
    # 줄바꿈 → <br>
    result = result.replace('\n', '<br>')
    return result

router = APIRouter()
logger = get_logger(__name__)


@router.get("")
async def list_news(
    q: str = Query(default='', description='검색어 (제목/종목코드)'),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    items = await stk_news_service.search(q=q, limit=limit, offset=offset)
    return {'success': True, 'data': items, 'total': len(items)}


@router.get("/{news_id}/content")
async def get_content(news_id: str):
    """본문 조회 — DB에 있으면 반환, 없으면 t3102 호출 후 저장"""
    row = await stk_news_service.get_by_id(news_id)
    if not row:
        return {'success': False, 'error': '뉴스를 찾을 수 없습니다.'}

    if row.get('content'):
        return {'success': True, 'data': {'content': _linkify_stock_codes(row['content']), 'title': row['title']}}

    # t3102 호출
    try:
        ls = await get_ls_api()
        req = LsRequest(
            api_id='t3102',
            payload={'sNewsno': news_id},
        )
        resp = await ls.send_request(req)
        if not resp.success:
            return {'success': False, 'error': f"t3102 오류: {resp.error_message}"}

        data = resp.data or {}
        body_blocks = data.get('t3102OutBlock1', [])
        raw_content = ''.join(b.get('sBody', '') for b in body_blocks)
        content = _strip_html(raw_content)

        if content:
            await stk_news_service.update_content(news_id, content)

        html_content = _linkify_stock_codes(content) if content else '본문 없음'
        return {'success': True, 'data': {'content': html_content, 'title': row['title']}}

    except Exception as e:
        logger.error(f"[NewsContent] t3102 오류: {e}")
        return {'success': False, 'error': str(e)}
