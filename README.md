# kiwi8-키움,KIS,LS 증권 Restful API를 이용한 주식매매

## 개요

- 한국의 증권사 중 Restful api를 제공하는 증권사는 3개이다.
    1. [키움증권](https://www3.kiwoom.com/h/main)
    2. [한국투자증권](https://securities.koreainvestment.com/main/Main.jsp)
    3. [LS증권](https://m.ls-sec.co.kr/)
- kiwi8은 위 3개의 증권사의 계좌를 관리하는 app이다.
- backend와 frontend로 나누고 backend는 fastapi로 frontend는 react 로 개발한다.
- 개발시  PORT 는 backend는 8003으로, frontend는 5173을 사용
- 이 프로젝트는 kwi7에서 구조를 변경하여 다시 진행하는 것이다.
- 주요 변경 사항
  - frontend를 alpine-> react
  - backend에서 jinja2를 배제, 모든 ui는 react로 처리.
  - backend는 Restful api만을 제공하다.
  - db라이브러리 변경 sqlite3->aiosqlite
  
## 기술스택

- python 3.12
- uv 를 사용함
- backend
  - fastapi
  - uvicorn
  - sqlite3
  - jwt
  - pydantic
  - dotenv
  - aiohttp

- frontend

| 구분 | 기술 | 안정 버전 | 라이센스 | 역할 |
|------|------|-----------|----------|------|
| 1  | React              | 19.2.4             | MIT          | UI 컴포넌트 라이브러리. 컴포넌트 기반 아키텍처로 재사용 가능한 UI 구축 |
| 2  | Vite               | 6.x                | MIT          | 프론트엔드 빌드 도구 및 개발 서버. 빠른 HMR, 프록시 설정, 프로덕션 번들링 제공 |
| 3  | React Router       | 7.x                | MIT          | 클라이언트 사이드 라우팅. SPA 페이지 전환 및 중첩 라우트 처리 |
| 4  | TypeScript         | 5.7.x              | Apache-2.0   | 정적 타입 시스템. 금융 데이터의 타입 안정성 확보 및 개발 생산성 향상 |
| 5  | Tailwind CSS       | 4.1.x              | MIT          | 유틸리티 기반 CSS 프레임워크. 빠른 UI 스타일링 |
| 6  | shadcn/ui          | latest (CLI 3.8.x) | MIT          | Radix UI 기반 컴포넌트 라이브러리. 버튼, 콤보박스, 탭, 다이얼로그 등 UI 컴포넌트 제공 |
| 7  | AG Grid Community  | 34.3.1             | MIT          | 고성능 데이터 그리드. 가상 스크롤, 셀 편집, 정렬, 필터링, 고정 컬럼 제공 |
| 8  | Zustand            | 5.0.11             | MIT          | 경량 전역 상태관리. 멀티 탭 간 주문 상태 공유, 화면 간 데이터 연동 |
| 9  | React Hook Form    | 7.71.x             | MIT          | 고성능 폼 상태관리. 조회 조건, 주문 입력 등 복잡한 폼 처리 |
| 10 | Zod                | 3.x (LTS)          | MIT          | 스키마 기반 유효성 검증. TypeScript 타입 추론과 런타임 검증 통합 |
| 11 | axios              | 1.7.x              | MIT          | HTTP 클라이언트. 인터셉터 기반 JWT 토큰 자동 첨부, 공통 에러 처리 |
| 12 | TanStack Query     | 5.x                | MIT          | 서버 상태 관리. API 캐싱, 자동 리페치, 뮤테이션 및 낙관적 업데이트 처리 |

## 보안

- auth 는 jwt사용
- refresh key 발급
- cookie 베이스
- jwtmiddelware.py
- auth_routes의 post login, get logout
  
## 참고 사이트

### 키움

- [키움Restful API 홈](https://openapi.kiwoom.com/main/home)
- [**API문서**](https://openapi.kiwoom.com/guide/apiguide)

### KIS-한국투자증권

- [API 문서](https://apiportal.koreainvestment.com/apiservice-apiservice)

### LS-LS증권

- [API 문서](https://openapi.ls-sec.co.kr/apiservice?group_id=ffd2def7-a118-40f7-a0ab-cd4c6a538a90&api_id=33bd887a-6652-4209-88cd-5324bc7c5e36)

## 배포 (jskn 서버 - Docker)

### 서버 구조

```
[Nginx 컨테이너] :80/:443
  └── /kiwi8/* → jskn_kiwi8:8003 (프록시)

[jskn_kiwi8 컨테이너] :8003
  ├── FastAPI (uvicorn)
  └── React dist (frontend/dist/)

데이터 볼륨: /data/docker/apps/kiwi8/
  ├── db/kiwi8.db
  ├── logs/kiwi8.log
  ├── data/
  └── files/
```

### 최초 배포 순서

**1. jskn 서버에 소스 clone**
```bash
cd /home/kdy987/work
git clone <repo URL> kiwi8
```

**2. 환경변수 파일 작성**
```bash
cp /home/kdy987/work/kiwi8/.env.local /home/kdy987/work/kiwi8/.env.jskn
vi /home/kdy987/work/kiwi8/.env.jskn
# BASE_DIR=/app/data  ← 반드시 이 값으로 설정
```

**3. 데이터 디렉토리 생성**
```bash
mkdir -p /data/docker/apps/kiwi8
```

**4. `/data/docker/docker-compose.yml` 에 kiwi8 서비스 추가**
```yaml
  # 9. kiwi8
  kiwi8:
    build:
      context: /home/kdy987/work/kiwi8
      dockerfile: /home/kdy987/work/kiwi8/Dockerfile
    image: jskn_kiwi8_img
    container_name: jskn_kiwi8
    restart: always
    user: "1000:1000"
    ports:
      - "8003:8003"
    volumes:
      - /data/docker/apps/kiwi8:/app/data
    env_file:
      - /home/kdy987/work/kiwi8/.env.jskn
    environment:
      - TZ=Asia/Seoul
      - PYTHONPATH=/app
      - KIWI8_MODE=jskn
```

**5. Nginx conf 추가 (`/data/docker/nginx/conf.d/kiwi8.conf` 또는 default.conf에 추가)**
```nginx
location /kiwi8/ {
    proxy_pass http://jskn_kiwi8:8003/kiwi8/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

**6. 빌드 & 실행**
```bash
cd /data/docker
docker compose up -d --build kiwi8
```

**7. Nginx reload**
```bash
docker exec jskn_nginx nginx -s reload
```

### 업데이트 배포

```bash
cd /home/kdy987/work/kiwi8
git pull

cd /data/docker
docker compose stop kiwi8
docker compose rm -f kiwi8
docker compose up -d --build kiwi8
```

### 유용한 명령어

```bash
# 로그 확인
docker logs -f jskn_kiwi8

# 컨테이너 상태 확인
docker ps | grep kiwi8

# nginx 설정 문법 검사
docker exec jskn_nginx nginx -t

# nginx reload
docker exec jskn_nginx nginx -s reload
```

## 유틸리티

- code_samples
- 키움api문서에서 제공하는 excel파일을 읽어서 request definition을 추출

```shell
python extract_kw_req_def.py.py c:\\tmp\\kwapi.xlsx > 1.txt
```
