# KDaemon의 역활

● kiwi8 목적(자동매매, 스케줄링, LLM 분석)을 고려한 제안:

  ---
  kdaemon 역할 제안

  핵심 역할: 상시 실행 백그라운드 프로세스

  FastAPI는 요청/응답 처리에 집중하고, kdaemon은 "아무도 요청 안 해도 해야 할 일"을 담당.

  ---
  담당 업무

  1. 장 스케줄러
  - 장 시작(09:00) / 종료(15:30) 이벤트 감지
  - 시간 기반 작업 트리거 (ex. 09:00에 전일 정산, 15:35에 잔고 스냅샷 저장)

  2. WebSocket 수명 관리
  - KIWOOM/LS 체결통보 WebSocket 상시 연결 유지
  - 연결 끊기면 자동 재연결

  3. 시세 데이터 수집
  - 관심 종목 현재가 주기적 수집 → stk_cache 저장
  - 전일종가, 거래량 등 일봉 데이터 EOD 수집

  4. LLM 분석 파이프라인
  - 수집된 데이터로 Local LLM 분석 요청 (장 종료 후)
  - 결과 → DB 저장 → 다음날 참조

  5. 자동매매 엔진
  - 조건 감시 루프 (N초마다 조건 체크)
  - 조건 충족 시 주문 실행

  6. 헬스체크 & 알림
  - FastAPI backend 응답 확인
  - 이상 시 로그/알림

  ---
  구조 제안

  kdaemon.py
  ├── main loop (asyncio event loop)
  ├── JobScheduler   ← 시간 기반 작업
  ├── WsKeeper       ← WebSocket 상시 연결
  ├── PriceCollector ← 시세 수집
  ├── AutoTrader     ← 자동매매 조건 감시
  └── LlmPipeline    ← EOD 분석

  ---
  가장 먼저 구현할 가치 있는 것: WsKeeper + JobScheduler — 이 둘이 없으면 체결통보가 불안정하고 스케줄
  작업이 FastAPI 수명에 종속됨.
