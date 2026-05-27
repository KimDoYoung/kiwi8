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

CREATE TABLE IF NOT EXISTS market_jisu (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  kospi          REAL NOT NULL,
  kospi_diff     REAL,
  kospi_rate     REAL,
  kosdaq         REAL NOT NULL,
  kosdaq_diff    REAL,
  kosdaq_rate    REAL,
  kospi200       REAL NOT NULL,
  kospi200_diff  REAL,
  kospi200_rate  REAL,
  updated_at     TEXT NOT NULL -- 'YYYYMMDDHHMMSS'
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
-- DROP TABLE IF EXISTS my_stock;
CREATE TABLE IF NOT EXISTS my_stock (
  stk_cd     TEXT    NOT NULL,                               -- 종목코드 (PK)
  stk_nm     TEXT    NOT NULL,                               -- 종목명
  sector     TEXT    NULL,                                   -- 분야
  is_hold    INTEGER NOT NULL DEFAULT 0                      -- 보유여부 (0/1)
             CHECK (is_hold IN (0,1)),
  is_watch   INTEGER NOT NULL DEFAULT 0                      -- 관심여부 (0/1)
             CHECK (is_watch IN (0,1)),
  base_price  INTEGER NULL,                                   -- 기준가(증가시 update)
  sell_rate    REAL    NULL,                                   -- 매도가격 결정을 위한 비율
  sell_price   INTEGER NULL,                                   -- 매도목표가
  buy_rate     REAL    NULL,                                   -- 매수가격 결정을 위한 비율
  buy_price    INTEGER NULL,                                   -- 매수목표가           
  spec       TEXT    NULL,                                   -- 여러가지 정보 JSON 직렬화 (예: {"매수목표가": "100000", "손절가": "90000"})
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
  main_products TEXT,                    -- 주요제품
  representative_name TEXT,              -- 대표자명
  homepage TEXT,                         -- 홈페이지
  location TEXT,                         -- 지역
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

-- 초기 스케줄러 잡 등록
INSERT OR IGNORE INTO kscheduler_job (name, func_name, schedule_type, schedule_expr, enabled) VALUES 
('fetch_market_jisu', 'fetch_market_jisu', 'interval', 'seconds=300', 1),
('proactive_token_refresh', 'proactive_token_refresh', 'interval', 'seconds=600', 1);

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

-- judal 테이블
CREATE TABLE IF NOT EXISTS judal_themes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    theme_name TEXT NOT NULL,                -- 테마명  
    stock_name TEXT NOT NULL,                -- 종목명
    yesterday_ratio REAL,                    -- 전일비
    three_day_sum REAL,                      -- 3일합산
    alienation_index_52w INTEGER,            -- 52주 소외지수
    alienation_index_3y INTEGER,             -- 3년 소외지수
    stock_index_3y INTEGER,                  -- 3년 주가지수
    expected_return REAL,                    -- 기대 수익률 (%)
    pbr REAL,                                -- PBR
    per REAL,                                -- PER
    eps INTEGER,                             -- EPS
    market_cap INTEGER,                      -- 시가총액 (억 단위 등)
    volume_index_today REAL,                 -- 당일 거래량지수
    volume_index_7d REAL,                    -- 최근7일 거래량지수
    buffett_choice INTEGER,                  -- 버핏초이스
    related_themes TEXT,                     -- 관련테마
    updated_at TEXT,                         -- 업데이트 (상대 시간)
    market_type TEXT,                        -- 시장종류 (KOSPI/KOSDAQ 등)
    stock_code TEXT,                         -- 종목코드 (6자리)
    current_price INTEGER,                   -- 현재가
    price_change INTEGER,                    -- 등락가
    high_52w INTEGER,                        -- 52주최고
    low_52w INTEGER,                         -- 52주최저
    change_rate_low_52w REAL,                -- 52주변동률최저
    change_rate_high_52w REAL,               -- 52주변동률최고
    high_3y INTEGER,                         -- 3년최고
    low_3y INTEGER,                          -- 3년최저
    change_rate_low_3y REAL,                 -- 3년변동률최저
    change_rate_high_3y REAL,                -- 3년변동률최고
    created_at DATETIME DEFAULT (DATETIME('now', 'localtime')) -- 데이터 수집 일시
);

-- 검색 최적화를 위한 인덱스 설정
CREATE INDEX IF NOT EXISTS idx_stock_code ON judal_themes(stock_code);
CREATE INDEX IF NOT EXISTS idx_created_at ON judal_themes(created_at);

-- stk_options : 네이버 종목토론방 일별 의견 집계
CREATE TABLE IF NOT EXISTS stk_options (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    stk_cd     TEXT NOT NULL,
    date       TEXT NOT NULL,    -- YYYYMMDD
    options    TEXT NOT NULL,    -- 집계된 의견 텍스트 (제목+본문)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (stk_cd, date)
);
CREATE INDEX IF NOT EXISTS idx_stk_options_stk_cd ON stk_options(stk_cd);

-- kind_stk_info
CREATE TABLE IF NOT EXISTS kind_stk_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 고유 식별자 (자동 증가)
    corp_name TEXT NOT NULL,               -- 회사명
    market_type TEXT,                      -- 시장구분
    stock_code TEXT NOT NULL,              -- 종목코드
    industry TEXT,                         -- 업종
    main_products TEXT,                    -- 주요제품
    listing_date DATE,                     -- 상장일
    settlement_month TEXT,                 -- 결산월
    representative_name TEXT,              -- 대표자명
    homepage TEXT,                         -- 홈페이지
    location TEXT,                          -- 지역
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

-- 종목코드로 조회하거나 조인하는 경우가 많으므로 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_kind_stk_info_stock_code ON kind_stk_info(stock_code);
-- (선택) 회사명 검색을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_corp_name ON kind_stk_info(corp_name);


CREATE TABLE IF NOT EXISTS account_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    record_date     TEXT    NOT NULL UNIQUE,          -- YYYY-MM-DD

    -- 전체 요약
    total_asset     INTEGER NOT NULL DEFAULT 0,       -- 전체자산
    total_buy       INTEGER NOT NULL DEFAULT 0,       -- 전체매입금액
    total_pnl       INTEGER NOT NULL DEFAULT 0,       -- 전체평가손익
    total_rate      TEXT    NOT NULL DEFAULT '0.00%', -- 전체수익률

    -- KIS (한국투자증권)
    kis_acct_no     TEXT,
    kis_total_asset INTEGER NOT NULL DEFAULT 0,
    kis_buy_amt     INTEGER NOT NULL DEFAULT 0,
    kis_eval_pnl    INTEGER NOT NULL DEFAULT 0,
    kis_rate        TEXT    NOT NULL DEFAULT '0.00%',
    kis_ord_avail   INTEGER NOT NULL DEFAULT 0,
    kis_hold_cnt    INTEGER NOT NULL DEFAULT 0,

    -- LS (LS증권)
    ls_acct_no      TEXT,
    ls_total_asset  INTEGER NOT NULL DEFAULT 0,
    ls_buy_amt      INTEGER NOT NULL DEFAULT 0,
    ls_eval_pnl     INTEGER NOT NULL DEFAULT 0,
    ls_rate         TEXT    NOT NULL DEFAULT '0.00%',
    ls_ord_avail    INTEGER NOT NULL DEFAULT 0,
    ls_hold_cnt     INTEGER NOT NULL DEFAULT 0,

    -- 키움증권
    kiwoom_acct_no      TEXT,
    kiwoom_total_asset  INTEGER NOT NULL DEFAULT 0,
    kiwoom_buy_amt      INTEGER NOT NULL DEFAULT 0,
    kiwoom_eval_pnl     INTEGER NOT NULL DEFAULT 0,
    kiwoom_rate         TEXT    NOT NULL DEFAULT '0.00%',
    kiwoom_ord_avail    INTEGER NOT NULL DEFAULT 0,
    kiwoom_hold_cnt     INTEGER NOT NULL DEFAULT 0,

    created_at      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_account_history_date ON account_history (record_date);

-- ---------------------------------------------------------------
-- stk_news : LS WS로 수신한 뉴스 (종목 관련 뉴스만 저장)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stk_news (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    news_id     TEXT    NOT NULL UNIQUE,          -- realkey (24자리, t3102 sNewsno로 사용)
    news_code   TEXT,                              -- LS code 필드 (단일 종목 코드)
    stock_codes TEXT,                              -- 관련 종목 목록 (콤마 구분)
    title       TEXT    NOT NULL,                  -- 뉴스 제목
    content     TEXT,                              -- 뉴스 본문 (t3102 sBody 조합, NULL이면 미조회)
    news_time   TEXT,                              -- 뉴스 시각 HHMMSS
    news_date   TEXT,                              -- 뉴스 날짜 YYYYMMDD
    category_id TEXT,                              -- LS categoryid
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stk_news_date  ON stk_news(news_date, news_time);
CREATE INDEX IF NOT EXISTS idx_stk_news_code  ON stk_news(news_code);

-- 경제 용어
CREATE TABLE IF NOT EXISTS stk_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL UNIQUE,
    brief TEXT NOT NULL,                  -- 필수 입력으로 변경 (글자 수 제한은 없지만 비어있지 않도록)
    detail TEXT,
    is_active INTEGER DEFAULT 1,          -- 소프트 딜리트(Soft Delete)용 flag (0: 삭제됨, 1: 노출)
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 수정 시간 자동 갱신용
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 용어(word)로 검색하는 경우가 많으므로 인덱스 추가 (UNIQUE 제약조건으로 이미 자동 생성되지만 명시적 확인)
CREATE INDEX IF NOT EXISTS idx_stk_words_word ON stk_words(word);

-- 수정 시간(updated_at)을 자동으로 업데이트하기 위한 트리거(Trigger) 생성
CREATE TRIGGER IF NOT EXISTS trg_stk_words_updated_at
AFTER UPDATE ON stk_words
FOR EACH ROW
BEGIN
    UPDATE stk_words SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- 메뉴를 모두 지우고 다시 삽입 (초기화)
DELETE FROM menus;

-- 1. 대분류 (Level 1)
-- id를 명시하여 하위 메뉴 연결을 확실히 합니다.
INSERT INTO menus (id, parent_id, level, screen_no, title, url, icon, sort_order) VALUES
(1, NULL, 1, '1000', '통합 트레이딩 센터', NULL, 'layout-dashboard', 1),
(2, NULL, 1, '5000', '증권사별 채널', NULL, 'building-2', 2),
(3, NULL, 1, '8000', '매니지먼트', NULL, 'settings', 3);

-- 2. 중분류 (Level 2)
-- 1000번대: 통합 트레이딩 센터 하위
INSERT INTO menus (id, parent_id, level, screen_no, title, url, sort_order) VALUES 
(11, 1, 2, '1100', '자산 현황', NULL, 1),
(12, 1, 2, '1200', '시장 분석', NULL, 2),
(13, 1, 2, '1300', '주문 센터', NULL, 3);

-- 3000번대: 증권사별 채널 하위
INSERT INTO menus (id, parent_id, level, screen_no, title, url, sort_order) VALUES 
(21, 2, 2, '2000', '한국투자증권', NULL, 1),
(22, 2, 2, '3000', 'LS증권', NULL, 2),
(23, 2, 2, '4000', '키움증권', NULL, 3);

-- 8000번대: 매니지먼트 하위
INSERT INTO menus (id, parent_id, level, screen_no, title, url, sort_order) VALUES 
(31, 3, 2, '8100', '투자 기록', NULL, 1),
(32, 3, 2, '8200', '시스템 설정', NULL, 2);


-- 3. 화면/기능 (Level 3 - 최하위 노드)
-- [1100 자산 현황] 하위
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES 
(11, 3, '1101', '통합 계좌 요약', '/accounts/total', 1),
(11, 3, '1102', '통합 잔고 내역', '/accounts/balance', 2),
(11, 3, '1103', '기간별 실현손익', '/accounts/profit-loss', 3),
(11, 3, '1104', '전 증권사 체결내역', '/accounts/fill', 4);

-- [1200 시장 분석] 하위
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES 
(12, 3, '1201', '종목 상세', '/stock/detail', 1),
(12, 3, '1202', '종목 평가', '/stock/evaluation', 2),
(12, 3, '1203', '全종목 탐색', '/stock/find', 3),
(12, 3, '1204', '관심종목', '/stock/mystock', 4),
(12, 3, '1205', '테마별 분석', '/stock/theme', 5),
(12, 3, '1206', '증권 뉴스', '/stock/news', 6);
-- [1300 주문 센터] 하위
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES 
(13, 3, '1301', '통합 매수 주문', '/order/buy', 1),
(13, 3, '1302', '통합 매도 주문', '/order/sell', 2);

-- [2000 KIS] 특화
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES 
(21, 3, '2101', 'KIS 계좌현황', '/kis/account/list', 1),
(21, 3, '2102', 'KIS 조건검색', '/kis/psearch', 2),
(21, 3, '2103', 'KIS 실시간 랭킹', '/kis/ranking', 3),
(21, 3, '2104', 'KIS 관심종목', '/kis/attention', 4);

-- [3000 LS증권] 특화
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES 
(22, 3, '3101', 'LS 계좌현황', '/ls/account/list', 1),
(22, 3, '3102', 'LS 상위종목', '/ls/ranking', 2),
(22, 3, '3103', 'LS 계좌상세', '/ls/account/detail', 3);

-- [4000 키움증권] 특화
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES 
(23, 3, '4101', '키움 계좌현황', '/kiwoom/account/list', 1),
(23, 3, '4102', '키움 상세잔고', '/kiwoom/account/detail', 2);

-- [8100 투자 기록] 하위
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES 
(31, 3, '8101', '매매 일지', '/manage/diary', 1),
(31, 3, '8102', '경제 용어', '/manage/stk-words', 2);

-- [8200 시스템 엔진] 하위
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES 
(32, 3, '8201', 'K-데몬 상태', '/manage/daemon', 1),
(32, 3, '8202', 'K-스케줄러 설정', '/manage/scheduler', 2);

-- [8200 시스템 설정] 하위
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES (32, 3, '8203', '시스템 설정', '/settings/system', 3);
INSERT INTO menus (parent_id, level, screen_no, title, url, sort_order) VALUES (32, 3, '8204', '로그 보기', '/settings/logs', 4);
