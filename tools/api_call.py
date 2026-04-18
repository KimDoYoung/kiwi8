"""
3개 증권사 API 통합 호출 스크립트

Usage:
  python tools/api_call.py <broker> <api_id> [key=value ...]

Brokers: ls, kis, kiwoom

Examples:
  python tools/api_call.py ls t0424 pession=0
  python tools/api_call.py kis TTTC8434R
  python tools/api_call.py kiwoom kt00004 qry_tp=0 dmst_stex_tp=KRX
  python tools/api_call.py kiwoom ka10086 stk_cd=005930 qry_dt=20260418 indc_tp=1

api_id만 지정하면 required 필드 목록을 출력합니다.
"""

import asyncio
import json
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# ---------------------------------------------------------------------------
# Definition 조회
# ---------------------------------------------------------------------------

def get_ls_def(api_id: str) -> dict | None:
    from backend.domains.stkcompanys.ls.models.ls_request_definition import LS_REQUEST_DEF
    return LS_REQUEST_DEF.get(api_id)


def get_kis_def(api_id: str) -> dict | None:
    from backend.domains.stkcompanys.kis.models.kis_request_definition import KIS_REQUEST_DEF
    return KIS_REQUEST_DEF.get(api_id)


def get_kiwoom_def(api_id: str) -> dict | None:
    from backend.domains.stkcompanys.kiwoom.models.kiwoom_request_definition import KIWOOM_REQUEST_DEF
    return KIWOOM_REQUEST_DEF.get(api_id)


DEF_FUNCS = {
    'ls': get_ls_def,
    'kis': get_kis_def,
    'kiwoom': get_kiwoom_def,
}

# ---------------------------------------------------------------------------
# Broker call functions
# ---------------------------------------------------------------------------

async def call_ls(api_id: str, payload: dict) -> dict:
    from backend.domains.stkcompanys.ls.ls_rest_api import LsRestApi
    from backend.domains.stkcompanys.ls.managers.ls_token_manager import LsTokenManager
    from backend.domains.stkcompanys.ls.models.ls_schema import LsApiHelper, LsRequest

    api = LsRestApi(token_manager=LsTokenManager())
    response = await api.send_request(LsRequest(api_id=api_id, payload=payload))
    result = response.model_dump(mode='json')
    if result.get('data'):
        result['data'] = LsApiHelper.to_korea_data(result['data'], api_id)
    return result


async def call_kis(api_id: str, payload: dict) -> dict:
    from backend.domains.stkcompanys.kis.kis_rest_api import KisRestApi
    from backend.domains.stkcompanys.kis.managers.kis_token_manager import KisTokenManager
    from backend.domains.stkcompanys.kis.models.kis_schema import KisApiHelper, KisRequest

    api = KisRestApi(token_manager=KisTokenManager())
    response = await api.send_request(KisRequest(api_id=api_id, payload=payload))
    result = response.model_dump(mode='json')
    if result.get('data'):
        result['data'] = KisApiHelper.to_korea_data(result['data'], api_id)
    return result


async def call_kiwoom(api_id: str, payload: dict) -> dict:
    from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
    from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import KiwoomApiHelper, KiwoomRequest

    kiwoom = await get_kiwoom_api()
    if not kiwoom:
        return {'success': False, 'error_message': 'Kiwoom API 인스턴스 생성 실패'}
    response = await kiwoom.send_request(KiwoomRequest(api_id=api_id, payload=payload))
    result = response.model_dump(mode='json')
    if result.get('data'):
        result['data'] = KiwoomApiHelper.to_korea_data(result['data'], api_id)
    return result


BROKER_FUNCS = {
    'ls': call_ls,
    'kis': call_kis,
    'kiwoom': call_kiwoom,
}

# ---------------------------------------------------------------------------
# Helper: definition에서 필드 목록 추출 (증권사별 구조 차이 처리)
# ---------------------------------------------------------------------------

def extract_fields(api_def: dict) -> list[dict]:
    """broker별로 다른 definition 구조에서 필드 목록을 통일해서 반환"""
    if not api_def:
        return []
    # Kiwoom: body 리스트
    if 'body' in api_def:
        return api_def['body']
    # KIS: query 리스트
    if 'query' in api_def:
        return api_def['query']
    # LS: blocks.{block_name}.fields 중첩 구조
    if 'blocks' in api_def:
        fields = []
        for block in api_def['blocks'].values():
            fields.extend(block.get('fields', []))
        return fields
    return []


def print_definition(broker: str, api_id: str, api_def: dict):
    print(f'\n[{broker.upper()}] {api_id} - {api_def.get("title", "")}', file=sys.stderr)
    fields = extract_fields(api_def)
    if not fields:
        print('  (입력 필드 없음)', file=sys.stderr)
        return
    print(f'  {"필드":<30} {"필수":^4}  설명', file=sys.stderr)
    print(f'  {"-"*30} {"----":^4}  {"----"}', file=sys.stderr)
    for f in fields:
        req = ' ✓ ' if f.get('required') else '   '
        name = f.get('name', '')
        desc = f.get('description', '') or f.get('desc', '')
        label = f'{name}  {desc}'.strip() if desc else name
        print(f'  {f["key"]:<30} {req:^4}  {label}', file=sys.stderr)
    print(file=sys.stderr)

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(0)

    broker = args[0].lower()
    if broker not in BROKER_FUNCS:
        print(f'[오류] 지원하지 않는 broker: {broker}  (ls | kis | kiwoom)', file=sys.stderr)
        sys.exit(1)

    if len(args) < 2:
        print(f'[오류] api_id를 입력하세요.', file=sys.stderr)
        sys.exit(1)

    api_id = args[1]
    extra = args[2:]

    # definition 조회
    api_def = DEF_FUNCS[broker](api_id)
    if not api_def:
        print(f'[경고] definition 없음: {broker} / {api_id}', file=sys.stderr)
        api_def = {}

    # key=value → payload
    payload = {}
    for kv in extra:
        if '=' in kv:
            k, v = kv.split('=', 1)
            payload[k] = v
        else:
            print(f'[경고] 파싱 불가 인수 무시: {kv}', file=sys.stderr)

    # payload 없으면 definition 출력 후 종료
    fields = extract_fields(api_def)
    if not payload and fields:
        print_definition(broker, api_id, api_def)
        required = [f['key'] for f in fields if f.get('required')]
        if required:
            print(f'필수 필드: {" ".join(f"{k}=" for k in required)}', file=sys.stderr)
        sys.exit(0)

    # required 필드 누락 경고
    for f in fields:
        if f.get('required') and f['key'] not in payload:
            desc = f.get('description', '') or f.get('desc', '')
            print(f'[경고] 필수 필드 누락: {f["key"]} ({desc})', file=sys.stderr)

    return broker, api_id, payload


async def main():
    broker, api_id, payload = parse_args()
    fn = BROKER_FUNCS[broker]

    print(f'>>> [{broker.upper()}] {api_id}  payload={payload}', file=sys.stderr)
    try:
        result = await fn(api_id, payload)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as e:
        import traceback
        print(f'[오류] {e}', file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
