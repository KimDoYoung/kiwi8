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

