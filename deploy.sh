#!/usr/bin/env bash
#============================================================================
# deploy.sh - Kiwi8 jskn 서버 배포 스크립트 (개발 머신에서 실행)
#
# 사용법: ./deploy.sh
# 전제조건:
#   - ssh jskn 으로 패스워드 없이 접속 가능해야 함 (~/.ssh/config 설정)
#   - jskn 서버에 소스가 /home/kdy987/work/kiwi8 에 clone 되어 있어야 함
#   - /data/docker/docker-compose.yml 에 kiwi8 서비스가 등록되어 있어야 함
#   - /home/kdy987/work/kiwi8/.env.jskn 파일이 존재해야 함
#============================================================================

set -euo pipefail

SSH_HOST="jskn"
REMOTE_SRC="/home/kdy987/work/kiwi8"
DOCKER_DIR="/data/docker"
SERVICE_NAME="kiwi8"
CONTAINER_NAME="jskn_kiwi8"
NGINX_CONTAINER="jskn_nginx"

# ── 색상 ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()   { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()  { echo -e "${RED}[ERROR]${NC} $*"; }
header() { echo -e "\n${CYAN}${BOLD}══ $* ══${NC}\n"; }

# ── SSH 접속 확인 ─────────────────────────────────────────────────────────
check_ssh() {
    if ! ssh -o ConnectTimeout=5 "$SSH_HOST" "echo ok" &>/dev/null; then
        error "SSH 접속 실패: $SSH_HOST"
        error "~/.ssh/config 설정을 확인하세요."
        exit 1
    fi
    info "SSH 접속 확인: $SSH_HOST"
}

# ── 버전 동기화 및 파일 업로드 ──────────────────────────────────────────────
sync_env() {
    header "설정 파일 동기화"

    if [ ! -f ".env.local" ]; then
        error ".env.local 파일이 없습니다."
        exit 1
    fi

    # VERSION 추출
    VERSION=$(grep "^VERSION=" .env.local | cut -d'=' -f2)
    if [ -z "$VERSION" ]; then
        error ".env.local에 VERSION 설정이 없습니다."
        exit 1
    fi
    info ".env.local에서 VERSION=$VERSION 확인"

    # .env.jskn 업데이트 또는 생성
    if [ -f ".env.jskn" ]; then
        # VERSION 업데이트
        if grep -q "^VERSION=" .env.jskn; then
            sed -i "s/^VERSION=.*/VERSION=$VERSION/" .env.jskn
        else
            echo "VERSION=$VERSION" >> .env.jskn
        fi
        # BASE_DIR을 도커 환경에 맞게 /app/data로 고정
        if grep -q "^BASE_DIR=" .env.jskn; then
            sed -i "s|^BASE_DIR=.*|BASE_DIR=/app/data|" .env.jskn
        else
            echo "BASE_DIR=/app/data" >> .env.jskn
        fi
        info ".env.jskn 설정을 업데이트했습니다 (VERSION=$VERSION, BASE_DIR=/app/data)."
    else
        echo "VERSION=$VERSION" > .env.jskn
        echo "BASE_DIR=/app/data" >> .env.jskn
        # env.sample이 있다면 참고하여 나머지 기본값 생성 (VERSION, BASE_DIR 제외)
        if [ -f "env.sample" ]; then
             grep -v -E "^VERSION=|^BASE_DIR=" env.sample >> .env.jskn
        fi
        info ".env.jskn 파일을 생성했습니다 (BASE_DIR=/app/data)."
    fi

    # 서버로 업로드
    info ".env.jskn 파일을 $SSH_HOST 서버로 업로드합니다..."
    scp ".env.jskn" "$SSH_HOST:$REMOTE_SRC/.env.jskn"
    info "업로드 완료"
}

# ── Git 상태 확인 ─────────────────────────────────────────────────────────────
check_git_status() {
    header "Git 상태 확인"
    
    # 1. 미커밋 변경사항 확인 (Staged + Unstaged)
    if [[ -n $(git status --porcelain) ]]; then
        error "커밋되지 않은 변경사항이 있습니다."
        git status -s
        echo ""
        warn "모든 변경사항을 커밋한 후 다시 실행해주세요."
        exit 1
    fi

    # 2. 푸시되지 않은 커밋 확인
    # 로컬 브랜치와 추적 중인 원격 브랜치 비교
    local branch=$(git rev-parse --abbrev-ref HEAD)
    local upstream=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "")
    
    if [[ -n "$upstream" ]]; then
        local unpushed=$(git log "$upstream..$branch" --oneline)
        if [[ -n "$unpushed" ]]; then
            error "원격 서버로 푸시되지 않은 커밋이 있습니다."
            echo "$unpushed"
            echo ""
            warn "git push 명령어로 커밋을 원격 저장소에 올린 후 다시 실행해주세요."
            exit 1
        fi
    else
        warn "원격 추적 브랜치가 없어 푸시 여부를 확인할 수 없습니다. 계속 진행합니다."
    fi
    
    info "Git 상태 확인 완료: 모든 변경사항이 커밋 및 푸시되었습니다."
}

# ── 사용자 확인 ─────────────────────────────────────────────────────────────
confirm_deploy() {
    header "배포 확인"
    echo -e "${BOLD}수행할 작업 목록:${NC}"
    echo -e "  1. .env.local의 VERSION($VERSION)을 .env.jskn에 동기화"
    echo -e "  2. .env.jskn 파일을 $SSH_HOST 서버로 업로드 (scp)"
    echo -e "  3. $SSH_HOST 서버에서 소스 최신화 (git pull)"
    echo -e "  4. $SSH_HOST 서버에서 기존 도커 컨테이너($SERVICE_NAME) 중지 및 제거"
    echo -e "  5. $SSH_HOST 서버에서 새 도커 이미지 빌드 및 컨테이너 실행"
    echo -e "  6. $SSH_HOST 서버에서 Nginx reload ($NGINX_CONTAINER)"
    echo -e "  7. 접속 URL 확인 (http://jskn.iptime.org/kiwi8/)"
    echo ""
    read -p "배포를 진행하시겠습니까? [Y/n/Enter]: " confirm
    if [[ "$confirm" =~ ^[Nn]$ ]]; then
        info "배포를 중단합니다."
        exit 0
    fi
}

# ── 배포 ──────────────────────────────────────────────────────────────────
main() {
    header "Kiwi8 배포 시작 → $SSH_HOST"

    check_ssh
    check_git_status
    sync_env
    confirm_deploy

    info "jskn 서버에서 배포 실행 중..."
    echo ""

    ssh "$SSH_HOST" bash <<EOF
set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()   { echo -e "\${GREEN}[INFO]\${NC}  \$*"; }
header() { echo -e "\n\${CYAN}\${BOLD}══ \$* ══\${NC}\n"; }

# 1. git pull
info "소스 최신화 (git pull)..."
cd $REMOTE_SRC
git pull
info "git pull 완료"

# 2. 기존 컨테이너 중지 & 제거
info "기존 컨테이너 중지 및 제거..."
cd $DOCKER_DIR
docker compose stop $SERVICE_NAME 2>/dev/null || true
docker compose rm -f $SERVICE_NAME 2>/dev/null || true
info "컨테이너 제거 완료"

# 3. 이미지 빌드 & 실행
info "이미지 빌드 및 컨테이너 실행 (시간이 걸립니다)..."
docker compose up -d --build $SERVICE_NAME
info "컨테이너 실행 완료"

# 4. Nginx reload
info "Nginx reload..."
docker exec $NGINX_CONTAINER nginx -s reload
info "Nginx reload 완료"

# 5. 상태 확인
echo ""
info "컨테이너 상태:"
docker ps --filter "name=$CONTAINER_NAME" --format "  {{.Names}}\t{{.Status}}\t{{.Ports}}"
EOF

    echo ""
    header "배포 완료"
    info "접속 URL: http://jskn.iptime.org/kiwi8/"

    # 6. Health check
    info "Health check 중... (10초 대기)"
    sleep 10
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://jskn.iptime.org/kiwi8/health 2>/dev/null || echo "000")
    if [[ "$HTTP_STATUS" == "200" ]]; then
        info "Health check 성공 (HTTP $HTTP_STATUS)"
    else
        warn "Health check 응답: HTTP $HTTP_STATUS (서버가 아직 뜨는 중일 수 있습니다)"
    fi
}

main "$@"
