import json
import aiosqlite
from typing import List, Optional

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.models.my_stock_model import (
    MyStockCreate,
    MyStockFilter,
    MyStockResponse,
    MyStockUpdate,
)
from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import KiwoomRequest, KiwoomApiHelper

logger = get_logger(__name__)

class MyStockService:
    def __init__(self):
        self.db_path = config.DB_PATH

    def _get_conn(self):
        return aiosqlite.connect(self.db_path)

    async def get_list(self, filter: Optional[MyStockFilter] = None) -> List[MyStockResponse]:
        """나의 관심/보유 종목 리스트 조회 (spec 파싱 포함)"""
        # is_hold, is_watch 모두 false인 레코드 먼저 삭제
        async with self._get_conn() as db:
            await db.execute("DELETE FROM my_stock WHERE is_hold = 0 AND is_watch = 0")
            await db.commit()

        query = "SELECT * FROM my_stock WHERE 1=1"
        params = []

        if filter:
            if filter.is_hold is not None:
                query += " AND is_hold = ?"
                params.append(filter.is_hold)
            if filter.is_watch is not None:
                query += " AND is_watch = ?"
                params.append(filter.is_watch)
            if filter.sector:
                query += " AND sector = ?"
                params.append(filter.sector)
            if filter.stk_nm_like:
                query += " AND stk_nm LIKE ?"
                params.append(f"%{filter.stk_nm_like}%")

        query += " ORDER BY is_hold DESC, updated_at DESC"

        async with self._get_conn() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(query, params) as cursor:
                rows = await cursor.fetchall()
                
                result = []
                for row in rows:
                    item = dict(row)
                    # spec JSON 파싱하여 spec_data에 담기
                    spec_data = {}
                    if item.get("spec"):
                        try:
                            spec_data = json.loads(item["spec"])
                        except Exception as e:
                            logger.error(f"Failed to parse spec for {item['stk_cd']}: {e}")
                    
                    item["spec_data"] = spec_data
                    result.append(MyStockResponse(**item))
                    
                return result

    async def get_by_cd(self, stk_cd: str) -> Optional[MyStockResponse]:
        """종목 코드로 상세 조회"""
        async with self._get_conn() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM my_stock WHERE stk_cd = ?", (stk_cd,)) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return None
                
                item = dict(row)
                spec_data = {}
                if item.get("spec"):
                    try:
                        spec_data = json.loads(item["spec"])
                    except Exception:
                        pass
                
                item["spec_data"] = spec_data
                return MyStockResponse(**item)

    async def _get_initial_prices(self, stk_cd: str, is_hold: int) -> dict:
        """현재가 기준 기준가/매도비율 또는 매수비율 초기값 반환
        - is_hold=1: 매도비율 -15% (기준가의 15% 아래를 매도 목표가로)
        - is_hold=0(관심): 매수비율 -20% (기준가의 20% 아래를 매수 목표가로)
        """
        try:
            from backend.domains.infrahub.current_pricer import CurrentPricer
            current_price = await CurrentPricer.get().get_price1(stk_cd)
        except Exception as e:
            logger.warning(f"현재가 조회 실패 ({stk_cd}): {e}")
            current_price = 0

        if not current_price:
            return {}

        result = {'base_price': current_price}
        if is_hold:
            result['sell_rate'] = -15.0   # 기준가 -15% = 매도 목표가
        else:
            result['buy_rate'] = -20.0    # 기준가 -20% = 매수 목표가
        return result

    async def create(self, data: MyStockCreate) -> MyStockResponse:
        """새로운 관심/보유 종목 추가"""
        final_data = data.model_dump()

        # base_price가 없으면 현재가 기준으로 기준가/목표가 초기화
        if not final_data.get('base_price'):
            price_fields = await self._get_initial_prices(data.stk_cd, final_data.get('is_hold', 0))
            final_data.update(price_fields)

        # 가격/비율 자동 계산
        self._calculate_prices_and_rates(final_data)

        async with self._get_conn() as db:
            columns = ", ".join(final_data.keys())
            placeholders = ", ".join(["?" for _ in final_data])
            query = f"INSERT INTO my_stock ({columns}) VALUES ({placeholders})"
            await db.execute(query, list(final_data.values()))
            await db.commit()
            
        # 생성이 완료되면 spec 정보를 채운다
        await self.fill_spec(data.stk_cd)
        
        return await self.get_by_cd(data.stk_cd)

    async def update(self, stk_cd: str, data: MyStockUpdate) -> Optional[MyStockResponse]:
        """종목 정보 수정 및 가격/비율 자동 계산"""
        current_resp = await self.get_by_cd(stk_cd)
        if not current_resp:
            return None

        update_dict = data.model_dump(exclude_unset=True)
        if not update_dict:
            return current_resp

        # 현재 데이터를 딕셔너리로 변환 (계산을 위해)
        merged = current_resp.model_dump()
        
        # base_price가 변경되었는지 확인
        base_price_changed = "base_price" in update_dict
        
        # 각 필드 업데이트 시 상호 계산 로직
        # 1. sell_rate 가 들어오면 sell_price 계산
        if "sell_rate" in update_dict:
            merged["sell_rate"] = update_dict["sell_rate"]
            self._calculate_sell_price(merged)
            update_dict["sell_price"] = merged["sell_price"]
        # 2. sell_price 가 들어오면 sell_rate 계산 (sell_rate가 명시적으로 들어오지 않았을 때만)
        elif "sell_price" in update_dict:
            merged["sell_price"] = update_dict["sell_price"]
            self._calculate_sell_rate(merged)
            update_dict["sell_rate"] = merged["sell_rate"]

        # 3. buy_rate 가 들어오면 buy_price 계산
        if "buy_rate" in update_dict:
            merged["buy_rate"] = update_dict["buy_rate"]
            self._calculate_buy_price(merged)
            update_dict["buy_price"] = merged["buy_price"]
        # 4. buy_price 가 들어오면 buy_rate 계산
        elif "buy_price" in update_dict:
            merged["buy_price"] = update_dict["buy_price"]
            self._calculate_buy_rate(merged)
            update_dict["buy_rate"] = merged["buy_rate"]

        # 5. base_price만 변경된 경우, 기존 rate를 바탕으로 price들을 재계산
        if base_price_changed:
            merged["base_price"] = update_dict["base_price"]
            # sell_rate가 있으면 sell_price 재계산
            if merged.get("sell_rate") is not None:
                self._calculate_sell_price(merged)
                update_dict["sell_price"] = merged["sell_price"]
            else:
                update_dict["sell_price"] = None
                
            # buy_rate가 있으면 buy_price 재계산
            if merged.get("buy_rate") is not None:
                self._calculate_buy_price(merged)
                update_dict["buy_price"] = merged["buy_price"]
            else:
                update_dict["buy_price"] = None

        # DB 업데이트
        set_clause = ", ".join([f"{k} = ?" for k in update_dict.keys()])
        params = list(update_dict.values())
        params.append(stk_cd)

        async with self._get_conn() as db:
            await db.execute(
                f"UPDATE my_stock SET {set_clause}, updated_at = datetime('now','localtime') WHERE stk_cd = ?",
                params
            )
            await db.commit()

        return await self.get_by_cd(stk_cd)

    def _calculate_prices_and_rates(self, data: dict):
        """초기 생성 시 또는 대량 업데이트 시 가격/비율 계산"""
        if data.get("base_price"):
            # Sell
            if data.get("sell_rate") is not None:
                self._calculate_sell_price(data)
            elif data.get("sell_price") is not None:
                self._calculate_sell_rate(data)
            # Buy
            if data.get("buy_rate") is not None:
                self._calculate_buy_price(data)
            elif data.get("buy_price") is not None:
                self._calculate_buy_rate(data)

    def _calculate_sell_price(self, data: dict):
        base = data.get("base_price")
        rate = data.get("sell_rate")
        if base and rate is not None:
            data["sell_price"] = int(base * (1 + rate / 100))

    def _calculate_sell_rate(self, data: dict):
        base = data.get("base_price")
        price = data.get("sell_price")
        if base and price:
            data["sell_rate"] = round(((price / base) - 1) * 100, 2)

    def _calculate_buy_price(self, data: dict):
        base = data.get("base_price")
        rate = data.get("buy_rate")
        if base and rate is not None:
            data["buy_price"] = int(base * (1 + rate / 100))

    def _calculate_buy_rate(self, data: dict):
        base = data.get("base_price")
        price = data.get("buy_price")
        if base and price:
            data["buy_rate"] = round(((price / base) - 1) * 100, 2)

    async def delete(self, stk_cd: str) -> bool:
        """종목 삭제"""
        logger.info(f"Deleting MyStock: {stk_cd}")
        async with self._get_conn() as db:
            cursor = await db.execute("DELETE FROM my_stock WHERE stk_cd = ?", (stk_cd,))
            await db.commit()
            deleted_count = cursor.rowcount
            logger.info(f"Deleted {deleted_count} record(s) for stk_cd: {stk_cd}")
            return deleted_count > 0

    async def fill_spec(self, stk_cd: str) -> bool:
        """키움 API(ka10001, ka10100)를 사용하여 spec(JSON) 정보 채우기"""
        try:
            logger.info(f"Filling spec for {stk_cd}...")
            kiwoom = await get_kiwoom_api()
            
            # 주식기본정보 (ka10001)
            resp1 = await kiwoom.send_request(KiwoomRequest(api_id="ka10001", payload={"stk_cd": stk_cd}))
            if not resp1 or not resp1.success:
                logger.error(f"ka10001 failed for {stk_cd}: {resp1.error_message if resp1 else 'No response'}")
                return False
            
            # 한글 필드명으로 변환
            out1 = KiwoomApiHelper.to_korea_data(resp1.data, "ka10001")
            logger.debug(f"ka10001 processed output (Korean) for {stk_cd}: {out1}")
            
            # 종목정보조회 (ka10100)
            resp2 = await kiwoom.send_request(KiwoomRequest(api_id="ka10100", payload={"stk_cd": stk_cd}))
            if resp2 and resp2.success:
                out2 = KiwoomApiHelper.to_korea_data(resp2.data, "ka10100")
            else:
                out2 = {}
            logger.debug(f"ka10100 processed output (Korean) for {stk_cd}: {out2}")

            spec = {
                "상태": out2.get("감리구분", ""),
                "상장일": out2.get("상장일", ""),
                "회사크기분류": out2.get("회사크기분류", ""),
                "업종명": out2.get("업종명", ""),
                "NTX": out2.get("NXT가능여부", ""),
                "시가총액": out1.get("시가총액", ""),
                "PER": out1.get("PER", ""),
                "PBR": out1.get("PBR", ""),
                "매출액": out1.get("매출액", ""),
                "영업이익": out1.get("영업이익", ""),
                "상장주식수": out1.get("상장주식", ""),
                "외인소진율": out1.get("외인소진률", ""),
                "유통비율": out1.get("유통비율", ""),
                "상한가": out1.get("상한가", ""),
                "하한가": out1.get("하한가", ""),
                "기준가": out1.get("기준가", "")
            }
            logger.info(f"Final spec object for {stk_cd}: {spec}")

            async with self._get_conn() as db:
                await db.execute(
                    "UPDATE my_stock SET spec = ?, updated_at = datetime('now','localtime') WHERE stk_cd = ?",
                    (json.dumps(spec, ensure_ascii=False), stk_cd)
                )
                await db.commit()
            return True
        except Exception as e:
            logger.error(f"fill_spec error for {stk_cd}: {e}")
            return False

    async def scheduler_sync_and_update(self):
        """스케줄러에 의한 통합 동작
        1. 보유 종목 동기화 (3개 증권사)
        2. 모든 레코드 spec 갱신
        3. 보유 종목 base_price 갱신 및 목표가 재계산
        """
        logger.info("Starting MyStock scheduler task...")
        
        # 1. 보유 종목 리스트 구하기 (유틸리티 사용)
        from backend.utils.holdings_utils import get_all_holdings
        hold_stocks = await get_all_holdings()
        
        # 2. hold_stocks 동기화
        async with self._get_conn() as db:
            # 먼저 모든 종목의 is_hold를 0으로 초기화 (현재 보유 중인 것만 1로 만들기 위해)
            # 단, 이 방식은 실시간 동기화 시 주의 필요. 여기서는 요구사항에 맞춰 진행.
            await db.execute("UPDATE my_stock SET is_hold = 0")
            
            for h in hold_stocks:
                cd = h["stk_cd"]
                nm = h["stk_nm"]
                
                async with db.execute("SELECT 1 FROM my_stock WHERE stk_cd = ?", (cd,)) as cursor:
                    if await cursor.fetchone():
                        await db.execute("UPDATE my_stock SET is_hold = 1, stk_nm = ? WHERE stk_cd = ?", (nm, cd))
                    else:
                        await db.execute("INSERT INTO my_stock (stk_cd, stk_nm, is_hold) VALUES (?, ?, 1)", (cd, nm))
            await db.commit()
            
        # 3. 모든 레코드 spec 갱신
        all_stocks = await self.get_list()
        for s in all_stocks:
            await self.fill_spec(s.stk_cd)
            
        # 4. 보유 종목 base_price 갱신
        kiwoom = await get_kiwoom_api()
        for s in all_stocks:
            if s.is_hold != 1:
                continue
                
            # ka10001로 전일 종가(기준가) 조회
            resp = await kiwoom.send_request(KiwoomRequest(api_id="ka10001", payload={"stk_cd": s.stk_cd}))
            if resp and resp.success:
                try:
                    out = resp.data.get("output", {})
                    prev_close = abs(int(out.get("base_pric", "0")))
                    
                    current_base = s.base_price
                    should_update = False
                    
                    if current_base is None:
                        # base_price가 없으면 전날 종가로 설정, default rate 15%
                        should_update = True
                        new_base = prev_close
                        new_sell_rate = s.sell_rate if s.sell_rate is not None else 15.0
                        new_buy_rate = s.buy_rate
                    elif prev_close > current_base:
                        # 전날 종가가 더 크면 업데이트
                        should_update = True
                        new_base = prev_close
                        new_sell_rate = s.sell_rate
                        new_buy_rate = s.buy_rate
                    
                    if should_update:
                        await self.update(s.stk_cd, MyStockUpdate(
                            base_price=new_base,
                            sell_rate=new_sell_rate,
                            buy_rate=new_buy_rate
                        ))
                except Exception as e:
                    logger.error(f"Failed to update base_price for {s.stk_cd}: {e}")
                    
        logger.info("MyStock scheduler task completed.")

    async def sync_holdings(self, holdings: List[dict]):
        """수동 보유 종목 동기화 (holdings_utils 결과물을 인자로 받음)
        - DB에 있고 실제 보유 아닌 종목: is_watch=false면 삭제, true면 is_hold=0 유지
        - 실제 보유하나 DB에 없는 종목: 추가 (현재가 기준 기준가/매도가 초기화)
        """
        # 1. 기존 DB 종목 코드 파악
        async with self._get_conn() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT stk_cd FROM my_stock") as cursor:
                rows = await cursor.fetchall()
            existing_cds = {row['stk_cd'] for row in rows}

        # 2. 신규 종목 현재가 일괄 조회
        new_cds = [h['stk_cd'] for h in holdings if h['stk_cd'] not in existing_cds]
        current_prices: dict = {}
        if new_cds:
            try:
                from backend.domains.infrahub.current_pricer import CurrentPricer
                current_prices = await CurrentPricer.get().get_price_multi(new_cds)
                logger.info(f"신규 종목 현재가 조회: {len(current_prices)}개")
            except Exception as e:
                logger.warning(f"현재가 일괄 조회 실패: {e}")

        # 3. DB 동기화
        async with self._get_conn() as db:
            await db.execute("UPDATE my_stock SET is_hold = 0")
            for h in holdings:
                cd = h["stk_cd"]
                nm = h["stk_nm"]
                if cd in existing_cds:
                    await db.execute("UPDATE my_stock SET is_hold = 1 WHERE stk_cd = ?", (cd,))
                else:
                    price = current_prices.get(cd, 0)
                    if price:
                        sell_price = int(price * (1 + (-15.0) / 100))
                        await db.execute(
                            "INSERT INTO my_stock (stk_cd, stk_nm, is_hold, base_price, sell_rate, sell_price) VALUES (?, ?, 1, ?, ?, ?)",
                            (cd, nm, price, -15.0, sell_price)
                        )
                    else:
                        await db.execute(
                            "INSERT INTO my_stock (stk_cd, stk_nm, is_hold) VALUES (?, ?, 1)",
                            (cd, nm)
                        )
            await db.execute("DELETE FROM my_stock WHERE is_hold = 0 AND is_watch = 0")
            await db.commit()
        return True

# 싱글톤 인스턴스
_instance = None

def get_my_stock_service() -> MyStockService:
    global _instance
    if _instance is None:
        _instance = MyStockService()
    return _instance
