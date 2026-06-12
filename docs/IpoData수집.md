# IpoData 수집

## 개요

1. ipo 일정과 데이터를 수집한다.
2. [IPOStock](http://www.ipostock.co.kr/main/main.asp) 에서 수집한다.
3. java로 만든 [IpoStockScrap](https://github.com/KimDoYoung/IpoStockScrap) 것을 python으로 작성
4. scheduler로 돌려서ㅕ table을 채우고 
5. calendar 1 month표시되는 것에 표시한다

## table

```sql
CREATE TABLE IF NOT EXISTS ipo_data (
    track_id TEXT,                               -- 트랙 ID
    stock_name TEXT,                             -- 종목명
    status TEXT,                                 -- 진행상황
    market_type TEXT,                            -- 시장구분
    stock_code TEXT,                             -- 종목코드
    industry TEXT,                               -- 업종
    ceo TEXT,                                    -- 대표자
    business_type TEXT,                          -- 기업구분
    headquarters_location TEXT,                  -- 본점소재지
    website TEXT,                                -- 홈페이지
    phone_number TEXT,                           -- 대표전화
    major_shareholder TEXT,                      -- 최대주주
    revenue TEXT,                                -- 매출액
    pre_tax_continuing_operations_profit TEXT,   -- 법인세비용차감전 계속사업이익
    net_profit TEXT,                             -- 순이익
    capital TEXT,                                -- 자본금
    total_ipo_shares TEXT,                       -- 총공모주식수
    face_value TEXT,                             -- 액면가
    listing_ipo TEXT,                            -- 상장공모
    desired_ipo_price TEXT,                      -- 희망공모가액
    subscription_competition_rate TEXT,          -- 청약경쟁률
    final_ipo_price TEXT,                        -- 확정공모가
    ipo_proceeds TEXT,                           -- 공모금액
    lead_manager TEXT,                           -- 주간사
    demand_forecast_date TEXT,                   -- 수요예측일
    ipo_subscription_date TEXT,                  -- 공모청약일
    newspaper_allocation_announcement_date TEXT, -- 배정공고일(신문)
    payment_date TEXT,                           -- 납입일
    refund_date TEXT,                            -- 환불일
    listing_date TEXT,                           -- 상장일
    ir_data TEXT,                                -- IR일자
    ir_location_time TEXT,                       -- IR장소/시간
    institutional_competition_rate TEXT,         -- 기관경쟁률
    lock_up_agreement TEXT                       -- 의무보유확약
);
```

## ipostock_scrap.py

1. tools/ 폴더에 작성
2. 이것을 다듬어서 