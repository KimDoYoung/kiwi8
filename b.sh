#!/usr/bin/env bash
#============================================================================
# b.sh - Kiwi8 개발용 관리 스크립트
#
# 사용법:  ./b.sh [명령어]
# 예시:    ./b.sh run
#============================================================================

set -euo pipefail

VERSION="0.0.1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT=8002
# ── 색상 ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── 유틸리티 함수 ─────────────────────────────────────────────────────────
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }
header()  { echo -e "\n${CYAN}${BOLD}══ $* ══${NC}\n"; }

# 한글 등 멀티바이트(3byte/2col) 문자를 포함한 표시 너비 계산
visual_width() {
    local str="$1"
    local bytes=${#str}
    local chars
    chars=$(printf '%s' "$str" | wc -m)
    local cjk=$(( (bytes - chars) / 2 ))
    echo $(( chars + cjk ))
}

# 지정한 표시 너비로 우측 공백 패딩
pad_visual() {
    local str="$1"
    local width="$2"
    local vw
    vw=$(visual_width "$str")
    local pad=$(( width - vw ))
    [[ $pad -lt 0 ]] && pad=0
    printf '%s%*s' "$str" "$pad" ""
}

print_banner() {
    echo -e ""
    echo -e "${CYAN}${BOLD}  ██╗  ██╗██╗██╗    ██╗██╗ █████╗ ██████╗ ${NC}"
    echo -e "${CYAN}${BOLD}  ██║ ██╔╝██║██║    ██║██║██╔══██╗╚════██╗${NC}"
    echo -e "${CYAN}${BOLD}  █████╔╝ ██║██║ █╗ ██║██║╚█████╔╝ █████╔╝${NC}"
    echo -e "${CYAN}${BOLD}  ██╔═██╗ ██║██║███╗██║██║██╔══██╗ ╚═══██╗${NC}"
    echo -e "${CYAN}${BOLD}  ██║  ██╗██║╚███╔███╔╝██║╚█████╔╝██████╔╝${NC}"
    echo -e "${CYAN}${BOLD}  ╚═╝  ╚═╝╚═╝ ╚══╝╚══╝ ╚═╝ ╚════╝ ╚═════╝ ${NC}"
    echo -e ""
    echo -e "  ${DIM}Backend Manager${NC}  ${BOLD}v${VERSION}${NC}  ${DIM}│${NC}  mode: ${YELLOW}${BOLD}${KIWI8_MODE:-?}${NC}"
    echo -e "  ${DIM}──────────────────────────────────────────────────────────${NC}"
    echo -e ""
}

resolve_mode() {
    if [[ -z "${KIWI8_MODE:-}" ]]; then
        export KIWI8_MODE="local"
        info "KIWI8_MODE 미설정 → ${BOLD}local${NC} 모드로 실행합니다."
    fi
}

load_env() {
    local env_file="$SCRIPT_DIR/.env.${KIWI8_MODE}"
    if [[ ! -f "$env_file" ]]; then
        error "환경변수 파일을 찾을 수 없습니다: $env_file"
        exit 1
    fi
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
    info "환경변수 로드 완료 ($env_file)"
}

check_uv() {
    if ! command -v uv &>/dev/null; then
        error "uv 가 설치되어 있지 않습니다. https://docs.astral.sh/uv/"
        exit 1
    fi
}

# ── 명령어 함수 ──────────────────────────────────────────────────────────
do_run() {
    header "Run - 백엔드 개발 서버 실행 (mode: ${KIWI8_MODE})"
    load_env
    info "서버 시작 중... (Ctrl+C 로 종료)"
    info "Health check: curl http://localhost:${BACKEND_PORT}/kiwi8/docs"
    echo ""
    cd "$SCRIPT_DIR"
    uv run uvicorn backend.main:app \
        --host 0.0.0.0 \
        --port "$BACKEND_PORT" \
        --reload
}

do_install() {
    header "Install - 패키지 설치 (uv sync)"
    cd "$SCRIPT_DIR"
    uv sync
    info "패키지 설치 완료."
}

do_test() {
    header "Test - pytest 실행 (mode: ${KIWI8_MODE})"
    load_env
    cd "$SCRIPT_DIR"
    uv run pytest
    info "테스트 완료."
}

do_lint() {
    header "Lint - ruff 코드 검사"
    cd "$SCRIPT_DIR"
    uv run ruff check backend/
    info "Lint 완료."
}

do_format() {
    header "Format - ruff 코드 포맷"
    cd "$SCRIPT_DIR"
    uv run ruff format backend/
    info "포맷 완료."
}

do_db_init() {
    header "DB Init - 데이터베이스 초기화 (mode: ${KIWI8_MODE})"
    load_env
    bash "$SCRIPT_DIR/tools/db/init_db.sh" "${KIWI8_MODE}"
}

do_db_backup() {
    header "DB Backup - 데이터베이스 백업 (mode: ${KIWI8_MODE})"
    load_env
    bash "$SCRIPT_DIR/tools/db/backup_db.sh" "${KIWI8_MODE}"
}

do_log() {
    header "Log - 애플리케이션 로그 보기 (mode: ${KIWI8_MODE})"
    load_env
    local base_dir="${BASE_DIR:-}"
    if [[ -z "$base_dir" ]]; then
        error "BASE_DIR 환경변수가 설정되지 않았습니다."
        exit 1
    fi
    local log_file="$base_dir/logs/kiwi8.log"
    if [[ ! -f "$log_file" ]]; then
        warn "로그 파일이 아직 없습니다: $log_file"
        warn "서버를 먼저 실행해 주세요: ./b.sh run"
        exit 1
    fi
    info "로그 파일: $log_file (Ctrl+C 로 종료)"
    echo ""
    tail -f "$log_file"
}

do_status() {
    header "Status - 애플리케이션 상태 확인"
    info "현재 모드: ${KIWI8_MODE}"

    if pgrep -f "uvicorn backend.main" > /dev/null 2>&1; then
        info "백엔드 서버 실행 중 (port: ${BACKEND_PORT})"
    else
        warn "백엔드 서버가 실행되지 않고 있습니다."
    fi

    if pgrep -f "vite" > /dev/null 2>&1; then
        info "프론트엔드 서버 실행 중 (port: ${FRONTEND_PORT})"
    else
        warn "프론트엔드 서버가 실행되지 않고 있습니다."
    fi
}

print_menu() {
    local items=(
        "run:백엔드 서버 실행"
        "install:패키지 설치"
        "test:테스트 실행"
        "lint:코드 검사"
        "format:코드 포맷"
        "db-init:DB 초기화"
        "db-backup:DB 백업"
        "log:로그 보기"
        "status:상태 확인"
    )

    echo -e "  ${BOLD}명령어${NC}"
    echo -e "  ${DIM}┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄${NC}"

    local total=${#items[@]}
    for ((i=0; i<total; i+=3)); do
        printf "  "
        for ((j=0; j<3 && i+j<total; j++)); do
            local idx=$((i+j))
            local num=$((idx+1))
            local cmd="${items[$idx]%%:*}"
            local desc="${items[$idx]#*:}"
            printf "${GREEN}${BOLD}%2d)${NC} ${YELLOW}%-10s${NC} ${DIM}%s${NC}  " \
                "$num" "$cmd" "$(pad_visual "$desc" 16)"
        done
        printf "\n"
    done

    echo -e ""
    echo -e "  ${DIM}┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄${NC}"
    echo -e "  ${YELLOW}q)${NC} 종료"
    echo -e ""
}

# ── 메인 함수 ──────────────────────────────────────────────────────────────
main() {
    check_uv
    resolve_mode

    local cmds=("run" "install" "test" "lint" "format" "db-init" "db-backup" "log" "status")

    if [[ $# -eq 0 ]]; then
        print_banner
        print_menu

        read -rp "  번호를 입력하세요: " choice
        echo ""

        if [[ "$choice" == "q" || "$choice" == "Q" ]]; then
            info "종료합니다."
            exit 0
        fi

        if ! [[ "$choice" =~ ^[0-9]+$ ]] || [[ "$choice" -lt 1 || "$choice" -gt ${#cmds[@]} ]]; then
            error "잘못된 입력입니다: $choice"
            exit 1
        fi

        local cmd="${cmds[$((choice-1))]}"
    else
        local cmd="$1"
        shift
    fi

    case "$cmd" in
        run)        do_run ;;
        install)    do_install ;;
        test)       do_test ;;
        lint)       do_lint ;;
        format)     do_format ;;
        db-init)    do_db_init ;;
        db-backup)  do_db_backup ;;
        log)        do_log ;;
        status)     do_status ;;
        help)
            print_banner
            print_menu
            ;;
        *)
            error "알 수 없는 명령어: $cmd"
            exit 1
            ;;
    esac
}

main "$@"
