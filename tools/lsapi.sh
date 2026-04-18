#!/usr/bin/env bash
# LS증권 API 호출
# Usage: ./tools/lsapi.sh <api_id> [key=value ...]
# Examples:
#   ./tools/lsapi.sh t0424              # → 필드 목록 출력
#   ./tools/lsapi.sh t0424 pession=0 cts_expcode=
#   ./tools/lsapi.sh t8410 shcode=005930 gubun=2
cd "$(dirname "$0")/.."
uv run python tools/api_call.py ls "$@"
