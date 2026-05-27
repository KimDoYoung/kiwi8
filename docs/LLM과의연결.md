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

