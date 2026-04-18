#!/usr/bin/env bash
# KIS(한국투자증권) API 호출
# Usage: ./tools/kisapi.sh <api_id> [key=value ...]
# Examples:
#   ./tools/kisapi.sh TTTC8434R          # → 필드 목록 출력
#   ./tools/kisapi.sh TTTC8434R CANO=12345678 ACNT_PRDT_CD=01 ...
cd "$(dirname "$0")/.."
uv run python tools/api_call.py kis "$@"
