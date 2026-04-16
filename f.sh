#!/usr/bin/env bash
#============================================================================
# f.sh - Kiwi8 프론트엔드 개발용 관리 스크립트
#
# 사용법:  ./f.sh [명령어]
# 예시:    ./f.sh run
#============================================================================

set -euo pipefail

VERSION="0.0.1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
FRONTEND_PORT=5173

# ── 색상 ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
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
    echo -e "  ${DIM}Frontend Manager${NC}  ${BOLD}v${VERSION}${NC}  ${DIM}│${NC}  port: ${YELLOW}${BOLD}${FRONTEND_PORT}${NC}"
    echo -e "  ${DIM}──────────────────────────────────────────────────────────${NC}"
    echo -e ""
}

check_node() {
    if ! command -v node &>/dev/null; then
        error "Node.js 가 설치되어 있지 않습니다."
        exit 1
    fi
    if ! command -v npm &>/dev/null; then
        error "npm 이 설치되어 있지 않습니다."
        exit 1
    fi
}

check_frontend_dir() {
    if [[ ! -d "$FRONTEND_DIR" ]]; then
        error "frontend 디렉토리가 없습니다: $FRONTEND_DIR"
        exit 1
    fi
}

# ── 명령어 함수 ──────────────────────────────────────────────────────────
do_run() {
    header "Run - 프론트엔드 개발 서버 실행"
    check_frontend_dir
    info "Vite 개발 서버 시작 중... (Ctrl+C 로 종료)"
    info "URL: http://localhost:${FRONTEND_PORT}"
    echo ""
    cd "$FRONTEND_DIR"
    npm run dev
}

do_install() {
    header "Install - 패키지 설치 (npm install)"
    check_frontend_dir
    cd "$FRONTEND_DIR"
    npm install
    info "패키지 설치 완료."
}

do_build() {
    header "Build - 프로덕션 빌드"
    check_frontend_dir
    cd "$FRONTEND_DIR"
    npm run build
    info "빌드 완료. 결과물: $FRONTEND_DIR/dist"
}

do_preview() {
    header "Preview - 빌드 결과 미리보기"
    check_frontend_dir
    cd "$FRONTEND_DIR"
    npm run preview
}

do_lint() {
    header "Lint - ESLint 코드 검사"
    check_frontend_dir
    cd "$FRONTEND_DIR"
    npm run lint
    info "Lint 완료."
}

do_status() {
    header "Status - 프론트엔드 서버 상태 확인"
    if pgrep -f "vite" > /dev/null 2>&1; then
        info "프론트엔드 서버 실행 중 (port: ${FRONTEND_PORT})"
    else
        warn "프론트엔드 서버가 실행되지 않고 있습니다."
    fi
}

print_menu() {
    local items=(
        "run:개발 서버 실행"
        "install:패키지 설치"
        "build:프로덕션 빌드"
        "preview:빌드 미리보기"
        "lint:코드 검사"
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
    check_node

    local cmds=("run" "install" "build" "preview" "lint" "status")

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
        run)      do_run ;;
        install)  do_install ;;
        build)    do_build ;;
        preview)  do_preview ;;
        lint)     do_lint ;;
        status)   do_status ;;
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
