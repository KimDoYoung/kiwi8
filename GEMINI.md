# GEMINI.md

This file provides guidance to Gemini Code (Gemini.ai/code) when working with code in this repository.

## 개요

- 한국의 증권사 중 Restful api를 제공하는 증권사는 3개이다.
    1. [키움증권](https://www3.kiwoom.com/h/main)
    2. [한국투자증권](https://securities.koreainvestment.com/main/Main.jsp)
    3. [LS증권](https://m.ls-sec.co.kr/)
- kiwi8은 위 3개의 증권사의 계좌를 관리하는 app이다.
- backend와 frontend로 나누고 backend는 fastapi로 frontend는 react 로 개발한다.
- 개발시  PORT 는 backend는 **8003**으로, frontend는 **5173**을 사용
- 이 프로젝트는 kwi7에서 구조를 변경하여 다시 진행하는 것이다.
- **주요 변경 사항**
  - frontend를 alpine -> react로 변경
  - backend에서 jinja2를 배제하고 모든 UI는 react로 처리
  - backend는 Restful api만을 제공
  - DB 라이브러리 변경: sqlite3 -> aiosqlite

## 목적

1. 3개 계좌의 현황을 파악한다.
2. 3개 계좌를 통해서 주식을 매매 한다.
3. Scheduling과 Local LLM과 연결하여 back data를 수집하고 분석한다.
4. 자동매매를 수행한다.

## 기술스택

- python 3.12
- uv 를 사용함
- backend
  - fastapi
  - uvicorn
  - sqlite3
  - aiosqlite
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
- refresh key 발급 (sqlite를 redis대신 사용)
- cookie 베이스
- jwtmiddelware.py
- auth_routes의 post login, get logout

## 메뉴 및 layout

- docs/메뉴체계-설계.md 을 참조


## 유틸리티

- b.sh : backend 즉 fastapi를 수행한다.
- f.sh : frontend vite로 react app을 수행한다.

## DATA 위치
  /home/kdy987/work/kiwi8/data/
  ├── db/       ← kiwi8.db
  ├── logs/     ← kiwi8.log
  ├── data/
  └── files/
- **위 파일구조를 참조하여 log와 db를  조회**한다

## 참고 사이트

### 키움

- [키움Restful API 홈](https://openapi.kiwoom.com/main/home)
- [**API문서**](https://openapi.kiwoom.com/guide/apiguide)

### KIS-한국투자증권

- [API 문서](https://apiportal.koreainvestment.com/apiservice-apiservice)

### LS-LS증권

- [API 문서](https://openapi.ls-sec.co.kr/apiservice?group_id=ffd2def7-a118-40f7-a0ab-cd4c6a538a90&api_id=33bd887a-6652-4209-88cd-5324bc7c5e36)

## 배포

- docs/배포.md 참조