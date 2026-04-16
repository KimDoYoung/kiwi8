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

# ── 배포 ──────────────────────────────────────────────────────────────────
main() {
    header "Kiwi8 배포 시작 → $SSH_HOST"

    check_ssh

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
