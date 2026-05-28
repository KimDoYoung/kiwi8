# Local LLM과의 연결

## 개요 
  로컬 LLM( qwen2.5-coder )과 내 데이터를 연동하기 위해 **"RAG(검색 증강 생성)라는 복잡한 기술을 꼭
  처음부터 공부하고 복잡하게 코딩해야 하는가?"**에 대해 명쾌하게 답을 드리자면, "금융/주식 데이터
  분석에는 복잡한 RAG보다 훨씬 쉽고 정확한 방법이 있습니다" 입니다.

  어떻게 구성하면 되는지, 핵심 원리와 구현 방향을 쉽게 정리해 드릴게요.
  ──────
  ## 💡 1. RAG가 아니라 "컨텍스트 주입 (Context Injection)"이 정답입니다.

  흔히 말하는 **RAG(Retrieval-Augmented Generation)**는 수천 페이지의 PDF 문서나 매뉴얼처럼 방대하고
  비정형화된 텍스트에서 필요한 내용을 찾아낼 때 쓰는 기술(벡터 DB, 유사도 검색 등)입니다.
  하지만 kiwi8 프로젝트는 모든 소중한 금융 데이터가 SQLite 데이터베이스( kiwi8.db )라는 정형화된 표
  형태로 이쁘게 저장되어 있습니다.

  숫자가 정확해야 하는 금융 데이터 분석에서 일반 RAG(유사도 검색)를 쓰면 모델이 엉뚱한 숫자를 가져와
  소설을 쓰는 현상(환각)이 발생할 수 있습니다. 대신 **"SQL 쿼리 조회 결과를 프롬프트에 직접 꽂아
  넣는 방법(Context Injection)"**을 사용하면 100% 정확하고 완벽하게 대답할 수 있습니다.
  ### 동작 원리 예시
  사용자가 **"내 계좌 상태를 보고 포트폴리오 조언을 해줘"**라고 질문했을 때의 시스템 동작
  흐름입니다.

    sequenceDiagram
        participant User as 사용자 (React UI)
        participant Backend as 백엔드 (FastAPI)
        participant DB as 데이터베이스 (SQLite)
        participant LLM as qwen2.5-coder (로컬 API)
        User->>Backend: "내 계좌 조언해줘" (질문 송신)
        Backend->>DB: SELECT * FROM my_stock; (보유 종목 조회)
        DB-->>Backend: [삼성전자, 현대차 등의 보유 현황 데이터 반환]
        Note over Backend: 조회된 표 데이터를<br/>이해하기 쉬운 텍스트(Markdown)로 변환
        Backend->>LLM: 질문 + [계좌 마크다운 데이터] 송신
        Note over LLM: qwen2.5-coder가<br/>데이터 분석 및 의견 생성
        LLM-->>Backend: "현재 반도체 비중이 높으므로..." (답변)
        Backend-->>User: AI 조언 답변 출력
  ──────
  ## 🛠️ 2. 실제로 어떻게 코딩해야 할까요? (아주 간단합니다)
  로컬에 구동 중인 Ollama API(기본 포트  11434 )를 사용해 백엔드에서 LLM을 호출하는 구조를 짜는
  것입니다.
  ### 1단계: 백엔드에 AI 서비스 추가 ( backend/domains/services/ai_service.py )

  백엔드 파이썬 코드에서 LLM 서버에 질문을 던지는 함수를 작성합니다.
    import aiohttp
    from backend.core.config import config
    class AIService:
        def __init__(self):
            # 방안 A(SSH 터널링)의 경우 host.docker.internal:11434 가 됩니다.
            self.llm_url = "http://host.docker.internal:11434/api/chat"

        async def ask_llm(self, system_instruction: str, user_question: str) -> str:
            payload = {
                "model": "qwen2.5-coder",
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": user_question}
                ],
                "stream": False # 프론트엔드로 실시간 출력을 원하면 True로 설정 가능
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(self.llm_url, json=payload) as response:
                    result = await response.json()
                    return result["message"]["content"]

  ### 2단계: 내 데이터를 조회해서 질문과 섞기

  사용자 질문을 받으면 DB에서 필요한 정보를 뽑아 LLM에게 "눈앞에 떠먹여 주는" 시스템 지시문(System
  Instruction)을 구성합니다.

    # 백엔드 API 엔드포인트 예시
    @router.post("/chat")
    async def chat_with_ai(user_msg: str, db = Depends(get_db)):
        # 1. DB에서 내 보유 주식 현황 가져오기
        my_stocks = await my_stock_service.get_hold_stocks(db)

        # 2. 데이터를 텍스트화하기
        stock_context = "현재 사용자의 보유 주식 정보:\n"
        for s in my_stocks:
            stock_context += f"- {s.stk_nm} ({s.stk_cd}): 보유여부={s.is_hold}, 메모={s.note}\n"

	# 3. LLM용 시스템 프롬프트 완성
	system_instruction = f"""
	당신은 전문 금융 분석가 및 자산 관리 AI 어시스턴트입니다.
        아래에 제공되는 사용자의 실제 주식 보유 현황(실시간 데이터)을 철저히 분석하여 사용자의
  질문에 답해 주세요.
	수치는 정확히 인용해야 하며, 모르는 정보는 지어내지 마세요.

	---
	{stock_context}
	---
	"""

	# 4. LLM에 요청 후 결과 반환
	ai_response = await ai_service.ask_llm(system_instruction, user_msg)
        return {"response": ai_response}
  ──────
  ## 🔥 3.  qwen2.5-coder  모델만의 초필살기: "Text-to-SQL"

  사용하시는  qwen2.5-coder 는 세계 최고 수준의 코딩 특화 오픈소스 모델입니다. 이 모델은 SQL 쿼리
  작성 능력이 아주 뛰어납니다.

  이를 이용해 RAG조차 뛰어넘는 **"자연어 데이터베이스 조회(Natural Language DB Query)"**를 구축할 수
  있습니다.

  1. 사용자가 **"최근 3일간 평단가보다 떨어진 종목 리스트만 골라줘"**라고 질문합니다.
  2. 백엔드가  qwen2.5-coder 에게 SQLite 테이블 스키마를 보여주며 **"위 질문에 대답하기 위한 SQLite
  SQL 쿼리문만 작성해 줘"**라고  니다.
  3.  qwen2.5-coder 가  SELECT * FROM my_stock WHERE ...  쿼리문을 자동 생성합니다.
  4. 백엔드가 이 쿼리를 받아 데이터베이스에서 안전하게 실행해 결과를 뽑아낸 뒤, 다시 LLM에게 넘겨
  자연어 답변으로 변환해 사용자에게 제공합니다.

  이렇게 하면 사용자가 데이터 구조를 전혀 몰라도 대화만으로 내 DB 데이터를 자유자재로 요리조리
  조회하고 분석할 수 있게 됩니다.
  ──────
  ### 요약하자면:

  • 어렵고 거창한 RAG 시스템을 따로 설치하거나 벡터 임베딩 코딩을 하실 필요가 전혀 없습니다.
  • 그저 **FastAPI 백엔드에서 SQLite 데이터를 가져와 LLM 질문 앞에 마크다운 텍스트로 붙여주는
  코딩(Context Injection)**만 해주시면 즉시 완벽하고 똑똑한 주식 분석 동반자가 탄생합니다.

  만약 이 "AI 주식 분석 비서" 기능을 구현해보고 싶으시다면, 백엔드에 Ollama 연동 컨트롤러를 구축하고
  프론트엔드에 AI 채팅 탭을 만드는 작업 설계를 이어서 시작해 드릴까요?



> db뿐만이 아니고 증권사의 restful api를 이용해서 그 정보를 가지고 와서 의뢰해도 되겠군 그래.
▸ Thought Process
  Considering Data Feeds
  정확하십니다! 바로 그 점이 kiwi8 프로젝트만이 가질 수 있는 독보적인 강점입니다.

  단순히 과거 데이터나 일지만 갖고 이야기하는 것이 아니라, **"실시간 증권사 RESTful API 호출
  결과"**를 LLM에게 실시간 컨텍스트로 함께 쥐어주면, 말 그대로 **"현재 시장 상황과 내 계좌 현황을
  실시간으로 모두 꿰뚫고 있는 초일류 인공지능 트레이더"**가 완성됩니다.

  이것이 왜 파괴적인 성능을 내는지, 그리고 구체적으로 어떻게 시너지를 낼 수 있는지 예시를 들어
  설명해 드릴게요.
  ──────
  ## ⚡ 1. 실시간 API 정보와 AI의 결합 시나리오

  사용자가 **"삼성전자 지금 추가 매수해도 될까?"**라고 질문을 던졌을 때의 작동 흐름입니다.

  ### 1단계: 백엔드가 실시간으로 정보 수집 (0.5초 이내)
  질문이 들어오는 즉시 백엔드는 이미 짜여 있는 증권사 API 모듈을 통해 다음 데이터를 즉석에서
  긁어모읍니다.
  1. 실시간 시세 API 호출 (KIS / LS): 현재가, 전일 대비 등락률, 호가 잔량(매수/매도 대기 물량 비율).
  2. 실시간 계좌 잔고 API 호출: 내 현재 예수금(가용 자금), 삼성전자 기존 보유 수량 및 평단가.
  3. DB 조회: 사용자가 작성한 삼성전자 매매 일지( stk_diary ), 그리고  my_stock 에 설정해 둔 목표
  매수가/매도율.
  ### 2단계: LLM에 '황금 프롬프트' 주입

  백엔드는 수집한 생생한 실시간 데이터를 Markdown 포맷으로 포장하여  qwen2.5-coder 에게 전송합니다.
  │ [시스템 프롬프트 예시]
  │
  │ • "현재 시각 14:15 정규 장중입니다. 사용자가 삼성전자 추가 매수 여부를 묻고 있습니다. 아래
  실시간
  │ 데이터를 분석하여 최적의 판단을 도우세요."
  │ • 실시간 시세 정보: 현재가 62,300원 (전일 대비 -1.4% 하락 중), 매수 호가 잔량이 매도보다 1.5배
  │ 많아 지지선 형성 중.
  │ • 사용자 계좌 상태: 현재 총 예수금 500만 원 보유 중. 삼성전자 20주 기보유 (평단가 65,000원, 현재
  │ 평가손익 -4.1%).
  │ • 과거 기록 (DB): 3일 전 일지 내용: "62,000원 선까지 눌리면 예수금의 20% 정도 물타기 진입할
  예정"

  ### 3단계: AI의 고도화된 의사결정 답변

   qwen2.5-coder 는 이 실시간 데이터를 종합 분석하여 다음과 같이 정밀한 답변을 내놓습니다.

  │ [AI 답변 예시]
  │ "현재 삼성전자는 전일 대비 1.4% 하락한 62,300원입니다. 3일 전 작성하신 일지에서 **'62,000원
  │ 선에서 예수금의 20%(약 100만 원) 물타기 진입'**을 계획하셨는데, 현재가 기준 목표가에 거의
  │ 근접(0.48% 차이)했습니다.
  │
  │ 현재 호가 잔량을 보면 매수 대기 물량이 매도보다 1.5배 많아 62,000원 부근에서 강한 지지가
  │ 예상됩니다. 보유 예수금 500만 원 중 계획하신 100만 원(약 16주)을 현재가 62,300원에 분할
  │ 매수하시는 것을 추천합니다. 매수를 진행할까요?"
  ──────
  ## 🛠️ 2. 한 걸음 더: AI 분석에서 "즉시 주문"으로 이어지는 인터랙티브 UX

  여기서 멈추지 않고,  qwen2.5-coder 가 대답할 때 특정 규격의 주문 제안 JSON 데이터를 답변 끝에 슬쩍
  끼워 넣게 만들 수 있습니다.

    {
      "order_recommendation": {
	"broker": "KIS",
	"stk_cd": "005930",
	"stk_nm": "삼성전자",
	"qty": 16,
	"price": 62300,
	"action": "BUY"
      }
    }

  프론트엔드 React UI가 이 답변을 받으면, 챗봇 창 아래에 [AI 추천 매수 주문 전송] 이라는 멋진
  컴포넌트 팝업을 동적으로 띄워줍니다.

  사용자가  [주문 실행]  버튼을 딱 한 번 누르면, 복잡한 주문창을 열 필요도 없이 백엔드의 KIS 주문
  RESTful API가 호출되어 실제 주식 매수 주문이 체결됩니다.
  ──────
  ## 🌟 결론: kiwi8이 가야 할 궁극의 AI 모습

  이렇게 되면 단순한 **"챗봇"**이 아니라 내 계좌와 실시간 주식 시장, 그리고 매매 실행 장치까지
  완벽하게 손에 쥔 **"AI 트레이딩 어시스턴트(AI Agent)"**가 작동하게 됩니다.

  • 과거 기록 데이터: 내장 SQLite  kiwi8.db 에서 쿼리.
  • 실시간 생생한 시장/계좌 정보: 증권사  RESTful API 에서 즉시 Fetch.
  • 똑똑한 두뇌: 로컬 GPU 서버의  qwen2.5-coder .
  • 안전하고 편리한 인터페이스:  React + shadcn/ui 로 이루어진 대시보드 탭.

  이 놀라운 하이브리드 시스템을 단계적으로 올려나가는 것은 기술적으로 100% 가능하며 구현 난이도 또한
  높지 않습니다.

  우선 백엔드에 Ollama 연동 모듈 및 실시간 데이터를 끌어와 프롬프트를 조립하는 기초적인 AI 분석
  라우터부터 구축해보는 것이 어떨까요? 개발자님이 동의하신다면 관련 상세 설계 및 구현 계획을
  잡아드리겠습니다!



## 가격

     3개 증권사 현재가 API

     ┌────────────────┬─────────────────┬──────────────────────────────────────────────────┐
     │     증권사     │ API ID / TR코드 │                       URL                        │
     ├────────────────┼─────────────────┼──────────────────────────────────────────────────┤
     │ KIS (한국투자) │ FHKST01010100   │ /uapi/domestic-stock/v1/quotations/inquire-price │
     ├────────────────┼─────────────────┼──────────────────────────────────────────────────┤
     │ LS증권         │ t8407           │ /stock/market-data                               │
     ├────────────────┼─────────────────┼──────────────────────────────────────────────────┤
     │ 키움           │ ka10001         │ https://api.kiwoom.com/api/dostk/stkinfo         │
     └────────────────┴─────────────────┴──────────────────────────────────────────────────┘

     상세

     - KIS: FHKST01010100 — "주식현재가 시세". 응답필드 stck_prpr
       - 파일: backend/domains/stkcompanys/kis/models/requests/kis_req_1.py
     - LS: t8407 — "API용주식멀티현재가조회". 1회 최대 50종목. 응답필드 price
       - 파일: backend/domains/stkcompanys/ls/models/requests/market_chart.py
     - 키움: ka10001 — "주식기본정보요청".
       - 파일: backend/domains/stkcompanys/kiwoom/models/kiwoom_request_definition.py

     중앙 라우팅

     backend/domains/infrahub/current_pricer.py — CurrentPricer 클래스
     - get_price1(stk_cd) — 단일종목
     - get_price_multi(stk_cds) — 멀티종목
     - 장중(09:00~15:30): LS t8407 우선 (멀티쿼리 효율)
     - NXT 시간: KIS 강제
     - 장 마감: 캐시 우선 → KIS fallback

● ┌────────┬───────────────┬───────────────────────────┐
  │ 증권사 │    API ID     │           비고            │
  ├────────┼───────────────┼───────────────────────────┤
  │ KIS    │ FHKST01010100 │ 단일종목, 응답: stck_prpr │
  ├────────┼───────────────┼───────────────────────────┤
  │ LS     │ t8407         │ 최대 50종목 멀티쿼리      │
  ├────────┼───────────────┼───────────────────────────┤
  │ 키움   │ ka10001       │ 주식기본정보요청          │
  └────────┴───────────────┴───────────────────────────┘

  current_pricer.py가 3개를 통합 관리 — 장중엔 LS t8407 우선 사용(멀티쿼리 효율).

## LLM과 daemon
❯ 나는 kiwi8을 linux ubutun core 서버에 docker에 올려서 사용하고 있음.
  그러나 서버에는 localLLM을 갖고 있지 않음.
  단 local cachyos linux pc에 qwen2.5-coder:14b localLLM을 갖고 있음.
  이 local LLM과 kdaemon을 이용해서 어떤 식으로 kiwi8을 upgrade한 성능을 갖도록 할 수 있을까?
  내 생각에 여러가지 재미있는 기능을 만들 수 있을 것 같은데...



 Local LLM × kdaemon × kiwi8 업그레이드 아이디어

 상황 정리

 - kiwi8 서버: Ubuntu Core + Docker (LLM 없음)
 - CachyOS PC: qwen2.5-coder:14b (Ollama port 11434) + 사용자 로컬
 - 네트워크 연결: 같은 LAN이거나 SSH 터널 필요

 ---
 0. HW 제약 분석 및 연결 아키텍처

 [Ubuntu Server / Docker]              [CachyOS PC]
    kiwi8 backend                    Browser (React kiwi8)
    kdaemon / kscheduler         ←→  llmBridge.ts          →  Ollama :11434
    ai_task DB table                  (이미 서버 인증됨)         qwen2.5-coder

 서버 → CachyOS Ollama 직접 호출 ❌ 불가 (NAT/방화벽)

 해결: 브라우저가 중간자
 - 브라우저는 CachyOS에서 실행 → localhost:11434 Ollama 직접 접근 가능
 - 브라우저는 kiwi8 서버 API에 이미 인증된 상태로 접근 가능
 - 별도 데몬 불필요, TS 파일 하나로 해결

 흐름:
 kiwi8 서버  →  ai_task 생성 (pending)
      ↑               ↓
 브라우저 llmBridge.ts  ←  폴링 GET /api/v1/ai/tasks/pending
      ↓
 localhost:11434/api/chat  (Ollama)
      ↓
 결과 POST /api/v1/ai/tasks/{id}/result
      ↓
 서버 DB  status=done, result 저장
      ↓
 kdaemon/scheduler/프론트가 결과 사용

 ---
 1. 재미있는 기능 아이디어 (우선순위 순)

 🥇 A. kdaemon 자연어 룰 생성기

 "삼성전자가 62000원 이하로 떨어지면 10주 매수해줘"
 → LLM이 kdaemon DB 룰 JSON 자동 생성 → DB 저장 → kdaemon 즉시 적용

 - 사용자: 자연어 입력
 - 백엔드: kdemon_rules 스키마를 LLM에 주입 → JSON 룰 생성 요청
 - kdaemon: 실시간 반영
 - 임팩트: 비개발자도 자동매매 룰 설정 가능

 ---
 🥇 B. AI 아침 브리핑 (KScheduler 연동)

 매일 오전 8:50 스케줄러 잡이:
 1. 전날 계좌 잔고 + 수익률 (account_history)
 2. 어젯밤 수집된 보유종목 뉴스 (stk_news)
 3. 관련 테마 현황 (judal_themes)
 4. 오늘 시장 전망

 → LLM이 종합해서 500자 브리핑 텍스트 생성
 → DB 저장 + 프론트 대시보드에 표시

 구현: jobs/ai_morning_briefing.py + KScheduler 등록

 ---
 🥇 C. LLM 챗 인터페이스 (React 탭)

 프론트에 "AI 어시스턴트" 탭 추가. 사용자 질문 → 백엔드가 실시간 컨텍스트 조립 → LLM 응답.

 컨텍스트 조립 예시 ("삼성전자 지금 사도 돼?"):
 현재가: 62,300원 (CurrentPricer 호출)
 보유현황: 20주, 평단 65,000원, -4.1%
 예수금: KIS 500만원
 최근 일지: "62,000원에서 물타기 예정"
 최근 뉴스: stk_news에서 삼성전자 최근 5건
 → LLM 응답에 order_recommendation JSON 포함 → 프론트에서 [주문실행] 버튼 팝업

 ---
 🥈 D. kdaemon + LLM 하이브리드 판단

 kdaemon이 룰 조건 충족 시 → 즉시 주문 대신 LLM에게 먼저 물어봄 (dry_run 레벨 추가)

 # kdaemon 실행 전 LLM 검증
 if rule.use_llm_confirm:
     llm_ok = await ai_service.confirm_trade(rule, current_price, news_context)
     if not llm_ok:
         log("LLM이 거부함, 스킵")
         return

 설정: 룰에 use_llm_confirm: bool 필드 추가
 → "뉴스 분위기가 안 좋으면 자동매매 잠깐 멈춰줘" 효과

 ---
 🥈 E. Text-to-SQL 자유 조회

 "최근 3개월 동안 수익난 종목만 뽑아줘"
 "가장 많이 손해 본 거래 5개 알려줘"

 → qwen2.5-coder가 SQLite 스키마 보고 SQL 생성
 → 백엔드가 실행해서 결과 반환
 → LLM이 결과를 자연어로 설명

 ---
 🥉 F. 매매 일지 AI 요약 (stk_diary 활용)

 특정 종목의 stk_diary 전체 + 실제 매매 기록(stk_trades_history)을 LLM에 주입
 → "이 종목으로 나는 왜 손해봤나?" 분석 생성

 ---
 🥉 G. 포트폴리오 리밸런싱 제안

 현재 3개 계좌 보유종목 + 비중 + judal_themes 섹터 정보
 → LLM: "반도체 비중 62%로 과집중, IT/바이오 추가 검토 권장" 형태 제안

 ---
 2. 구현 우선순위 (권장 순서)

 ┌──────┬──────────────────────────────┬────────┬────────┐
 │ 순서 │             기능             │ 난이도 │ 임팩트 │
 ├──────┼──────────────────────────────┼────────┼────────┤
 │ 1    │ Ollama 연결 + AIService 기초 │ 낮음   │ 기반   │
 ├──────┼──────────────────────────────┼────────┼────────┤
 │ 2    │ LLM 챗 탭 (C)                │ 중간   │ 높음   │
 ├──────┼──────────────────────────────┼────────┼────────┤
 │ 3    │ 아침 브리핑 스케줄러 (B)     │ 중간   │ 높음   │
 ├──────┼──────────────────────────────┼────────┼────────┤
 │ 4    │ 자연어 룰 생성기 (A)         │ 중간   │ 높음   │
 ├──────┼──────────────────────────────┼────────┼────────┤
 │ 5    │ Text-to-SQL (E)              │ 중간   │ 중간   │
 ├──────┼──────────────────────────────┼────────┼────────┤
 │ 6    │ kdaemon LLM 판단 (D)         │ 높음   │ 중간   │
 └──────┴──────────────────────────────┴────────┴────────┘

 ---
 3. 핵심 컴포넌트 설계

 서버 측: ai_task 테이블 + API

 CREATE TABLE ai_task (
     id INTEGER PRIMARY KEY,
     task_type TEXT,        -- 'chat', 'briefing', 'rule_gen', 'trade_confirm'
     prompt_system TEXT,
     prompt_user TEXT,
     status TEXT DEFAULT 'pending',  -- pending / processing / done / error
     result TEXT,
     created_at TEXT,
     completed_at TEXT
 );

 # backend/api/v1/endpoints/ai_routes.py
 GET  /api/v1/ai/tasks/pending    # CachyOS 데몬이 폴링
 POST /api/v1/ai/tasks/{id}/result  # CachyOS 데몬이 결과 제출
 POST /api/v1/ai/chat             # 프론트에서 채팅 요청 → task 생성
 GET  /api/v1/ai/tasks/{id}       # 결과 조회 (polling or SSE)

 CachyOS 측: llmBridge.ts (브라우저에서 실행)

 // src/services/llmBridge.ts
 const OLLAMA_URL = 'http://localhost:11434/api/chat'
 const MODEL = 'qwen2.5-coder:14b'

 export async function callOllama(system: string, user: string): Promise<string> {
   const res = await fetch(OLLAMA_URL, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       model: MODEL,
       messages: [
         { role: 'system', content: system },
         { role: 'user', content: user },
       ],
       stream: false,
     }),
   })
   const data = await res.json()
   return data.message.content
 }

 // React 앱 초기화 시 폴링 시작 (zustand action or useEffect in App.tsx)
 export function startLlmBridge(intervalMs = 3000) {
   setInterval(async () => {
     const { data: tasks } = await api.get('/api/v1/ai/tasks/pending')
     for (const task of tasks) {
       try {
         const result = await callOllama(task.prompt_system, task.prompt_user)
         await api.post(`/api/v1/ai/tasks/${task.id}/result`, { result })
       } catch (e) {
         await api.post(`/api/v1/ai/tasks/${task.id}/result`, { error: String(e) })
       }
     }
   }, intervalMs)
 }

 Ollama CORS 설정 필요 (CachyOS에서):
 OLLAMA_ORIGINS="http://localhost:5173,http://<server-ip>:5173" ollama serve

 kdaemon과의 연결

 kdaemon 룰 트리거 시 use_llm_confirm=True인 경우:
 1. kdaemon → ai_task 생성 (task_type='trade_confirm')
 2. 최대 30초 대기 (CachyOS 응답 기다림)
 3. result가 "YES"면 주문 실행, "NO"면 스킵
 4. 30초 내 응답 없으면 기본 정책 적용 (실행 or 스킵)

 ---
 검증

 1. ai_task DB 테이블 생성 확인
 2. /api/v1/ai/tasks/pending 엔드포인트 Swagger 테스트
 3. CachyOS에서 ai_poller.py 실행, pending task 처리 확인
 4. 프론트 챗 탭에서 질문 → 결과 polling 확인



---
## 설계 
1. KDaemon, LlmAgent, LLM(현재 qwen2.5) 3개가 있음
   - KDaemon -> python fastapi 에 떠 있는 daemon
   - LlmAgent -> typescript 브라우저에서 실행됨.
   - LLM -> ollama에서 돌고 있음
2. LlmAgent(이하 agent)는 LLM과 연결되어서 통신함
3. LlmAgent는 restapi를 통해서 KDaemon과 통신함.
4. 각각의 기능
    - KDaemon  
        1. 장 중에 price 모니터링
        2. rule에 따른 동작 
        3. 매수/매도 수행
    - Agent
        1. LLM과 통신
        2. ai routes 를 통한 데이터 수집 후 LLM과 통신
    - LLM
        1. agent와 통신

- ai_routes.py를 작성 /ai 로 시작하면 어떨까?
- .env.local -> config에 LLM_URL을 갖고 있게 하고
- agent가 /ai/llm-url 을 요청하면  서버가 주소를 리턴해준다.



1. KDaemon, LlmAgent, LLM(현재 qwen2.5) 3개가 있음
   - KDaemon -> python fastapi 에 떠 있는 daemon
   - LlmAgent -> typescript 브라우저에서 실행됨.
   - LLM -> ollama에서 돌고 있음
2. LlmAgent(이하 agent)는 LLM과 연결되어서 통신함
3. LlmAgent는 restapi를 통해서 KDaemon과 통신함.
4. 각각의 기능
    - KDaemon  
        1. 장 중에 price 모니터링
        2. rule에 따른 동작 
        3. 매수/매도 수행
    - Agent
        1. LLM과 통신
        2. ai routes 를 통한 데이터 수집 후 LLM과 통신
    - LLM
        1. agent와 통신

- ai_routes.py를 작성 /ai 로 시작하면 어떨까?
- .env.local -> config에 LLM_URL을 갖고 있게 하고
- agent가 /ai/llm-url 을 요청하면  서버가 주소를 리턴해준다.



● Ollama 시스템 서비스. OLLAMA_ORIGINS override 파일 생성 필요. sudo 권한으로 실행해야 함.

  다음 명령어를 터미널에서 실행:

  sudo mkdir -p /etc/systemd/system/ollama.service.d
  sudo tee /etc/systemd/system/ollama.service.d/override.conf << 'EOF'
  [Service]
  Environment="OLLAMA_ORIGINS=*"
  EOF
  sudo systemctl daemon-reload
  sudo systemctl restart ollama

  재시작 후 브라우저에서 다시 시도. OLLAMA_ORIGINS=* 설정하면 모든 origin 허용 — 로컬 사용이므로 OK.


