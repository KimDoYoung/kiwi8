-- jwt token 관리 
CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_id TEXT PRIMARY KEY,             -- Refresh Token 고유 식별자 (UUID 등)
    user_id TEXT NOT NULL,                 -- 사용자 ID
    hashed_token TEXT NOT NULL,            -- Refresh Token 해시값 (보안용)
    expires_at TIMESTAMP NOT NULL,         -- 토큰 만료 일시
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_revoked INTEGER DEFAULT 0           -- 폐기 여부 (1: 폐기됨, 강제 로그아웃 시 사용)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- settings table 실상은 name value
CREATE TABLE IF NOT EXISTS settings (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO settings (name, value) VALUES ('user_id', 'kdy987');
INSERT OR IGNORE INTO settings (name, value) VALUES ('user_pw', '1111');

-- kdemon_rules: 자동매매 룰
CREATE TABLE IF NOT EXISTS kdemon_rules (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  stk_cd            TEXT NOT NULL,                -- 종목코드 (예: 005930)
  condition_op      TEXT NOT NULL,                -- 'gte' | 'lte' | 'cross_up' | 'cross_down'
  threshold         REAL NOT NULL,                -- 기준값 (예: 100.0)
  action            TEXT NOT NULL,                -- 'buy' | 'sell'
  qty               INTEGER NOT NULL,             -- 수량
  status            TEXT NOT NULL DEFAULT 'active', -- 'active' | 'paused' | 'done'
  cooldown_sec      INTEGER NOT NULL DEFAULT 60,  -- 재트리거 쿨다운
  valid_from        TEXT,                         -- 'YYYYMMDDHHMMSS' (옵션)
  valid_to          TEXT,                         -- 'YYYYMMDDHHMMSS' (옵션)
  last_price        REAL,                         -- 직전 가격(크로스 판정용)
  last_triggered_at TEXT,                         -- 마지막 실행 시각 'YYYYMMDDHHMMSS'
  notes             TEXT,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- kdemon_commands: 제어 명령 큐
CREATE TABLE IF NOT EXISTS kdemon_commands (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cmd          TEXT NOT NULL,            -- 'start' | 'stop' | 'refresh'
  args_json    TEXT,                     -- 옵션 인자(JSON)
  created_at   TEXT NOT NULL,            -- 'YYYYMMDDHHMMSS'
  processed_at TEXT                      -- 처리 완료 시각
);

-- kdemon_state: 데몬 상태(싱글톤 1row)
CREATE TABLE IF NOT EXISTS kdemon_state (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  status         TEXT NOT NULL,  -- 'stopped' | 'running'
  updated_at     TEXT NOT NULL
);

-- ---------------------------------------------------------------
-- tokens: 증권사 API 토큰 관리
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tokens (
    broker_type TEXT PRIMARY KEY,           -- 'KIWOOM' | 'KIS' | 'LS'
    access_token TEXT NOT NULL,             -- 액세스 토큰
    expires_at TEXT NOT NULL,               -- 만료 시각 (ISO8601)
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- ---------------------------------------------------------------
-- my_stock
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS my_stock (
  stk_cd     TEXT    NOT NULL,                               -- 종목코드 (PK)
  stk_nm     TEXT    NOT NULL,                               -- 종목명
  sector     TEXT    NULL,                                   -- 분야
  is_hold    INTEGER NOT NULL DEFAULT 0                      -- 보유여부 (0/1)
             CHECK (is_hold IN (0,1)),
  is_watch   INTEGER NOT NULL DEFAULT 0                      -- 관심여부 (0/1)
             CHECK (is_watch IN (0,1)),
  note       TEXT,                                           -- 메모
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
  PRIMARY KEY (stk_cd)
);
-- ---------------------------------------------------------------
-- stk_diary : 주식에 대한 생각을 기록, 종목토론
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stk_diary (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,  -- 고유 ID
    ymd       TEXT NOT NULL,                     -- 날짜 (YYYYMMDD)
    stk_cd    TEXT NULL,                     -- 종목코드 (FK)
    note      TEXT NOT NULL,                     -- 일지 내용
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 생성 시각
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- 수정 시각
);

-- ---------------------------------------------------------------
-- stk_trades_history : 특정종목에 대한 매매 기록
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stk_trades_history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,  -- 고유 ID
  stk_cd    TEXT    NOT NULL,                     -- 종목코드 (FK)
  stk_nm    TEXT    NOT NULL,                     -- 종목명
  ymd       TEXT    NOT NULL,                     -- 거래일 (YYYYMMDD)     
  note      TEXT    NOT NULL,                      -- 메모
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 생성 시각
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- 수정 시각
);
-- ---------------------------------------------------------------
-- stk_cache : 전일종가와 같은 종목에 대한 일시적인 값 기록
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stk_cache (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,    -- 고유 ID
  stk_cd     TEXT    NOT NULL,                     -- 종목코드
  name       TEXT    NOT NULL,                     -- 전일종가 등 key name
  value      TEXT    NOT NULL,                     -- 전일종가 등 value
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP   -- 생성 시각
);
-- ---------------------------------------------------------------
-- 종목 기본정보 국내주식 > 종목정보 > 종목정보 리스트(ka10099) 결과를 넣어두기 위함
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stk_info (
  stk_cd              TEXT PRIMARY KEY,                                      -- 종목코드(단축코드)
  stk_nm              TEXT,                                                  -- 종목명
  list_count          TEXT,                                                  -- 상장주식수 (API 원문: String)
  audit_info          TEXT,                                                  -- 감리구분
  reg_day             TEXT,                                                  -- 상장일 (YYYYMMDD)
  last_price          TEXT,                                                  -- 전일종가
  state               TEXT,                                                  -- 종목상태
  market_code         TEXT,                                                  -- 시장구분코드
  market_name         TEXT,                                                  -- 시장명
  up_name             TEXT,                                                  -- 업종명
  up_size_name        TEXT,                                                  -- 회사크기분류
  company_class_name  TEXT,                                                  -- 회사분류 (코스닥만 존재)
  order_warning       TEXT CHECK (order_warning IN ('0','1','2','3','4','5')), 
  -- 투자유의종목여부: 0 해당없음, 2 정리매매, 3 단기과열, 4 투자위험, 5 투자경과, 1 ETF투자주의요망
  nxt_enable          TEXT CHECK (nxt_enable IN ('Y','N')),                  -- NXT 가능여부 (Y/N)
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP                    -- 생성 시각
);
-- ---------------------------------------------------------------
-- kscheduler_job: 작업 정의
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kscheduler_job (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT UNIQUE NOT NULL,
  func_name     TEXT NOT NULL,              -- 실행할 함수 키(레지스트리에서 찾음)
  schedule_type TEXT NOT NULL,              -- 'interval' | 'cron' | 'once'
  schedule_expr TEXT NOT NULL,              -- 'interval: seconds=900' | 'cron: 0 1 * * *' | 'once: 2025-09-03T01:00:00'
  timezone      TEXT DEFAULT 'Asia/Seoul',
  enabled       INTEGER DEFAULT 1,
  max_conc      INTEGER DEFAULT 1,
  overlap_policy TEXT DEFAULT 'skip',       -- 'skip' | 'queue' | 'cancel'
  timeout_sec   INTEGER DEFAULT 0,          -- 0이면 무제한
  retry_max     INTEGER DEFAULT 0,          -- 0이면 재시도 없음
  retry_backoff REAL DEFAULT 2.0,           -- 지수 백오프 배수
  jitter_sec    INTEGER DEFAULT 0,          -- 0이면 지터 없음
  next_run_at   TEXT,                       -- ISO8601
  last_run_at   TEXT,                       -- ISO8601
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------
-- kscheduler_run: 실행 이력
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kscheduler_run_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name     TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  status       TEXT,                        -- 'success' | 'error' | 'cancelled' | 'timeout'
  message      TEXT
);
-- ---------------------------------------------------------------
-- kscheduler_lock: 중복 실행 방지용(멀티 프로세스 실행 시 사용)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kscheduler_lock (
  lock_key     TEXT PRIMARY KEY,            -- e.g. 'job:nightly_scrape'
  holder       TEXT,                        -- hostname/pid
  acquired_at  TEXT DEFAULT CURRENT_TIMESTAMP
);


-- ---------------------------------------------------------------
-- 메뉴 및 화면 관리 테이블
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menus (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id   INTEGER NULL,
    level       INTEGER NOT NULL DEFAULT 1,   -- 1:대, 2:중, 3:소
    screen_no   TEXT UNIQUE NULL,
    title       TEXT NOT NULL,
    url         TEXT NULL,
    component   TEXT NULL,                    -- React 컴포넌트명
    icon        TEXT NULL,
    sort_order  INTEGER DEFAULT 0,
    is_active   BOOLEAN DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES menus (id) ON DELETE CASCADE
);



-- 빠른 조회를 위한 인덱스 설정
CREATE INDEX IF NOT EXISTS idx_menus_parent ON menus(parent_id);
CREATE INDEX IF NOT EXISTS idx_menus_screen_no ON menus(screen_no);

-- layout_presets: 사용자별 레이아웃 프리셋 저장 (HTS 스타일)
CREATE TABLE IF NOT EXISTS layout_presets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,                       -- 프리셋 이름 (예: "계좌 함께보기")
    layout_json TEXT NOT NULL,                       -- FlexLayout Model.toJson() 직렬화 결과
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)                            -- 같은 사용자 내 이름 중복 불가
);

CREATE INDEX IF NOT EXISTS idx_layout_presets_user ON layout_presets(user_id);


-- 메뉴를 모두 지우고 다시 삽입 (초기화)
DELETE FROM menus;

-- 1. 대분류 (Level 1)
-- id를 명시하여 하위 메뉴 연결을 확실히 합니다.
INSERT INTO menus (id, parent_id, level, screen_no, title, url, icon, sort_order) VALUES 
(1, NULL, 1, '1000', '통합 트레이딩 센터', NULL, 'layout-dashboard', 1),
(2, NULL, 1, '3000', '증권사별 채널', NULL, 'building-2', 2),
(3, NULL, 1, '8000', '매니지먼트', NULL, 'settings', 3);

-- 2. 중분류 (Level 2)
-- 1000번대: 통합 트레이딩 센터 하위
INSERT INTO menus (id, parent_id, level, screen_no, title, url, sort_order) VALUES 
(11, 1, 2, '1100', '자산 현황', NULL, 1),
(12, 1, 2, '1200', '시장 분석', NULL, 2),
(13, 1, 2, '1300', '주문 센터', NULL, 3);

-- 3000번대: 증권사별 채널 하위
INSERT INTO menus (id, parent_id, level, screen_no, title, url, sort_order) VALUES 
(21, 2, 2, '2100', '키움증권', NULL, 1),
(22, 2, 2, '3100', '한국투자증권(KIS)', NULL, 2),
(23, 2, 2, '4100', 'LS증권', NULL, 3);

-- 8000번대: 매니지먼트 하위
INSERT INTO menus (id, parent_id, level, screen_no, title, url, sort_order) VALUES 
(31, 3, 2, '8100', '투자 기록', NULL, 1),
(32, 3, 2, '8200', '시스템 엔진', NULL, 2);

-- 3. 화면/기능 (Level 3 - 최하위 노드)
-- [1100 자산 현황] 하위
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES 
(11, 3, '1101', '통합 계좌 요약', '/accounts/total', 1),
(11, 3, '1102', '실시간 통합 잔고', '/accounts/balance', 2),
(11, 3, '1103', '통합 수익률 추이', '/accounts/profit-loss', 3),
(11, 3, '1104', '전 증권사 체결내역', '/accounts/fill', 4);

-- [1200 시장 분석] 하위
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES 
(12, 3, '1201', '전종목 탐색', '/stock/find', 1),
(12, 3, '1202', '공통 관심종목', '/stock/mystock', 2),
(12, 3, '1203', '외인/기관 수급', '/stock/foreign-trade', 3),
(12, 3, '1204', '증권사 통합 의견', '/stock/opinion', 4);

-- [1300 주문 센터] 하위
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES 
(13, 3, '1301', '통합 매수 주문', '/order/buy', 1),
(13, 3, '1302', '통합 매도 주문', '/order/sell', 2);

-- [2100 키움증권] 특화
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES 
(21, 3, '2101', '키움 계좌현황', '/kiwoom/account/list', 1),
(21, 3, '2102', '키움 상세잔고', '/kiwoom/account/detail', 2);

-- [3100 KIS] 특화
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES 
(22, 3, '3101', 'KIS 조건검색', '/kis/psearch', 1),
(22, 3, '3102', 'KIS 실시간 랭킹', '/kis/ranking', 2),
(22, 3, '3103', 'KIS 관심종목', '/kis/attention', 3);

-- [4100 LS증권] 특화
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES 
(23, 3, '4101', 'LS 상위종목', '/ls/ranking', 1),
(23, 3, '4102', 'LS 계좌상세', '/ls/account/detail', 2);

-- [8100 투자 기록] 하위
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES 
(31, 3, '8101', '매매 일지', '/manage/diary', 1);

-- [8200 시스템 엔진] 하위
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES 
(32, 3, '8201', 'K-데몬 상태', '/manage/daemon', 1),
(32, 3, '8202', 'K-스케줄러 설정', '/manage/scheduler', 2);
