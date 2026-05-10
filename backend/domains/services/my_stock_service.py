import json
import aiosqlite
from datetime import datetime
from typing import List, Optional

from backend.core.config import config
from backend.core.logger import get_logger
from backend.domains.models.my_stock_model import (
    MyStock,
    MyStockCreate,
    MyStockFilter,
    MyStockResponse,
    MyStockUpdate,
)
from backend.domains.stkcompanys.kiwoom.kiwoom_service import get_kiwoom_api
from backend.domains.stkcompanys.kiwoom.models.kiwoom_schema import KiwoomRequest

logger = get_logger(__name__)

class MyStockService:
    def __init__(self):
        self.db_path = config.DB_PATH

    def _get_conn(self):
        return aiosqlite.connect(self.db_path)

    async def get_list(self, filter: Optional[MyStockFilter] = None) -> List[MyStockResponse]:
        """관심 종목 목록 조회 (spec 파싱 포함)"""
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

        query += " ORDER BY updated_at DESC"

        async with self._get_conn() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(query, params) as cursor:
                rows = await cursor.fetchall()
                
                result = []
                for row in rows:
                    item = dict(row)
                    # spec JSON 파싱
                    spec_data = None
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
                spec_data = None
                if item.get("spec"):
                    try:
                        spec_data = json.loads(item["spec"])
                    except Exception:
                        pass
                
                item["spec_data"] = spec_data
                return MyStockResponse(**item)

    async def create(self, data: MyStockCreate) -> MyStockResponse:
        """새로운 관심 종목 추가"""
        # 가격/비율 자동 계산
        final_data = data.model_dump()
        self._calculate_prices_and_rates(final_data)

        async with self._get_conn() as db:
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            columns = ", ".join(final_data.keys())
            placeholders = ", ".join(["?" for _ in final_data])
            
            # created_at, updated_at은 DB 기본값이지만 명시적으로 넣어줄 수도 있음
            # 여기서는 DDL의 DEFAULT 값을 따르도록 함
            
            query = f"INSERT INTO my_stock ({columns}) VALUES ({placeholders})"
            await db.execute(query, list(final_data.values()))
            await db.commit()
            
        return await self.get_by_cd(data.stk_cd)

    async def update(self, stk_cd: str, data: MyStockUpdate) -> Optional[MyStockResponse]:
        """관심 종목 정보 수정"""
        current = await self.get_by_cd(stk_cd)
        if not current:
            return None

        update_data = data.model_dump(exclude_unset=True)
        if not update_data:
            return current

        # 기존 값과 병합하여 가격/비율 재계산
        merged = current.model_dump()
        merged.update(update_data)
        
        # 어떤 필드가 업데이트 되었는지 확인하여 계산 방향 결정
        if "sell_rate" in update_data:
            self._calculate_sell_price(merged)
        elif "sell_price" in update_data:
            self._calculate_sell_rate(merged)
            
        if "buy_rate" in update_data:
            self._calculate_buy_price(merged)
        elif "buy_price" in update_data:
            self._calculate_buy_rate(merged)

        # base_price가 바뀌면 price들을 다시 계산 (rate 유지)
        if "base_price" in update_data:
            self._calculate_sell_price(merged)
            self._calculate_buy_price(merged)

        # DB 업데이트할 필드들 정리
        update_fields = {k: merged[k] for k in update_data.keys() or []}
        # 계산된 필드들도 포함
        if "sell_rate" in update_data or "base_price" in update_data: update_fields["sell_price"] = merged["sell_price"]
        if "sell_price" in update_data: update_fields["sell_rate"] = merged["sell_rate"]
        if "buy_rate" in update_data or "base_price" in update_data: update_fields["buy_price"] = merged["buy_price"]
        if "buy_price" in update_data: update_fields["buy_rate"] = merged["buy_rate"]

        if not update_fields:
            return current

        set_clause = ", ".join([f"{k} = ?" for k in update_fields.keys()])
        params = list(update_fields.values())
        params.append(stk_cd)

        async with self._get_conn() as db:
            await db.execute(f"UPDATE my_stock SET {set_clause}, updated_at = datetime('now','localtime') WHERE stk_cd = ?", params)
            await db.commit()

        return await self.get_by_cd(stk_cd)

    async def delete(self, stk_cd: str) -> bool:
        """관심 종목 삭제"""
        async with self._get_conn() as db:
            cursor = await db.execute("DELETE FROM my_stock WHERE stk_cd = ?", (stk_cd,))
            await db.commit()
            return cursor.rowcount > 0

    def _calculate_prices_and_rates(self, data: dict):
        """초기 생성 시 가격/비율 계산"""
        if data.get("base_price"):
            if data.get("sell_rate") and not data.get("sell_price"):
                self._calculate_sell_price(data)
            elif data.get("sell_price") and not data.get("sell_rate"):
                self._calculate_sell_rate(data)
                
            if data.get("buy_rate") and not data.get("buy_price"):
                self._calculate_buy_price(data)
            elif data.get("buy_price") and not data.get("buy_rate"):
                self._calculate_buy_rate(data)

    def _calculate_sell_price(self, data: dict):
        if data.get("base_price") and data.get("sell_rate") is not None:
            data["sell_price"] = int(data["base_price"] * (1 + data["sell_rate"] / 100))

    def _calculate_sell_rate(self, data: dict):
        if data.get("base_price") and data.get("sell_price") is not None:
            data["sell_rate"] = round((data["sell_price"] / data["base_price"] - 1) * 100, 2)

    def _calculate_buy_price(self, data: dict):
        if data.get("base_price") and data.get("buy_rate") is not None:
            data["buy_price"] = int(data["base_price"] * (1 + data["buy_rate"] / 100))

    def _calculate_buy_rate(self, data: dict):
        if data.get("base_price") and data.get("buy_price") is not None:
            data["buy_rate"] = round((data["buy_price"] / data["base_price"] - 1) * 100, 2)

    async def fill_spec(self, stk_cd: str) -> bool:
        """키움 API를 사용하여 spec 정보 채우기"""
        try:
            kiwoom = await get_kiwoom_api()
            
            # ka10001: 주식기본정보
            resp1 = await kiwoom.send_request(KiwoomRequest(api_id="ka10001", payload={"stk_cd": stk_cd}))
            if not resp1 or "output" not in resp1.data:
                logger.error(f"Failed to get ka10001 for {stk_cd}")
                return False
            
            out1 = resp1.data["output"]
            
            # ka10100: 종목정보조회
            resp2 = await kiwoom.send_request(KiwoomRequest(api_id="ka10100", payload={"stk_cd": stk_cd}))
            out2 = resp2.data.get("output", {}) if resp2 else {}

            spec = {
                "상태": out2.get("auditInfo", ""),
                "상장일": out2.get("regDay", ""),
                "회사크기분류": out2.get("upSizeName", ""),
                "업종명": out2.get("upName", ""),
                "NTX": out2.get("nxtEnable", ""),
                "시가총액": out1.get("mac", ""),
                "PER": out1.get("per", ""),
                "PBR": out1.get("pbr", ""),
                "매출액": out1.get("sale_amt", ""),
                "영업이익": out1.get("bus_pro", ""),
                "상장주식수": out1.get("flo_stk", ""),
                "외인소진율": out1.get("for_exh_rt", ""),
                "유통비율": out1.get("dstr_rt", ""),
                "상한가": out1.get("upl_pric", ""),
                "하한가": out1.get("lst_pric", ""),
                "기준가": out1.get("base_pric", "")
            }

            async with self._get_conn() as db:
                await db.execute(
                    "UPDATE my_stock SET spec = ?, updated_at = datetime('now','localtime') WHERE stk_cd = ?",
                    (json.dumps(spec, ensure_ascii=False), stk_cd)
                )
                await db.commit()
            
            return True
        except Exception as e:
            logger.error(f"Error in fill_spec for {stk_cd}: {e}")
            return False

    async def sync_all_specs(self):
        """모든 종목의 spec 갱신"""
        stocks = await self.get_list()
        for stock in stocks:
            await self.fill_spec(stock.stk_cd)

    async def sync_holdings(self, holdings: List[dict]):
        """보유 종목 리스트와 동기화
        holdings: [{"stk_cd": "...", "stk_nm": "...", "sector": "..."}]
        """
        async with self._get_conn() as db:
            for h in holdings:
                stk_cd = h["stk_cd"]
                stk_nm = h["stk_nm"]
                
                # 존재 여부 확인
                async with db.execute("SELECT 1 FROM my_stock WHERE stk_cd = ?", (stk_cd,)) as cursor:
                    exists = await cursor.fetchone()
                
                if exists:
                    await db.execute(
                        "UPDATE my_stock SET is_hold = 1, updated_at = datetime('now','localtime') WHERE stk_cd = ?",
                        (stk_cd,)
                    )
                else:
                    await db.execute(
                        "INSERT INTO my_stock (stk_cd, stk_nm, is_hold) VALUES (?, ?, 1)",
                        (stk_cd, stk_nm)
                    )
            await db.commit()

    async def update_base_prices(self):
        """보유 종목의 base_price 갱신
        - 전날 종가가 더 크면 갱신
        - base_price 갱신 시 sell/buy price도 갱신 (rate 유지)
        """
        stocks = await self.get_list(MyStockFilter(is_hold=1))
        kiwoom = await get_kiwoom_api()
        
        for s in stocks:
            # 키움 ka10001 로 전일 종가 확인 (기준가)
            resp = await kiwoom.send_request(KiwoomRequest(api_id="ka10001", payload={"stk_cd": s.stk_cd}))
            if not resp or "output" not in resp.data:
                continue
            
            # ka10001에서 base_pric가 기준가(전일종가) 임
            try:
                base_pric_str = resp.data["output"].get("base_pric", "0")
                base_pric = abs(int(base_pric_str)) # 가끔 -가 붙어 나오는 경우 있음 (하락)
                
                current_base = s.base_price or 0
                if base_pric > current_base:
                    # 갱신
                    new_update = MyStockUpdate(base_price=base_pric)
                    # rate가 없으면 기본 15% (매도)
                    if s.sell_rate is None:
                        new_update.sell_rate = 15.0
                    
                    await self.update(s.stk_cd, new_update)
            except Exception as e:
                logger.error(f"Failed to update base price for {s.stk_cd}: {e}")

# 싱글톤 인스턴스
instance_my_stock_service = None

def get_my_stock_service() -> MyStockService:
    global instance_my_stock_service
    if instance_my_stock_service is None:
        instance_my_stock_service = MyStockService()
    return instance_my_stock_service
