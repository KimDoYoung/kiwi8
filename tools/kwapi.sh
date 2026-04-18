#!/usr/bin/env bash
# 키움증권 API 호출
# Usage: ./tools/kwapi.sh <api_id> [key=value ...]
# Examples:
#   ./tools/kwapi.sh kt00004             # → 필드 목록 출력
#   ./tools/kwapi.sh kt00004 qry_tp=0 dmst_stex_tp=KRX
#   ./tools/kwapi.sh ka10086 stk_cd=005930 qry_dt=20260418 indc_tp=1
cd "$(dirname "$0")/.."
uv run python tools/api_call.py kiwoom "$@"
