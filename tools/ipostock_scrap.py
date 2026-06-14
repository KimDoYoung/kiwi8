#!/usr/bin/env python3
import sqlite3
import datetime
import requests
from bs4 import BeautifulSoup

# ==============================================================================
# CONFIGURATION CONSTANTS (설정 상수)
# ==============================================================================

DB_URL = "/home/kdy987/work/kiwi8/data/db/kiwi8.db"  # SQLite 데이터베이스 파일 경로
DB_TABLENAME = "ipo_data"    # 저장할 테이블 이름
SCRAPE_PAGES = 3             # 스크래핑할 리스트 페이지 수

# ==============================================================================

class IpoData:
    def __init__(self):
        self.track_id = ""
        self.stock_name = ""
        self.status = ""
        self.market_type = ""
        self.stock_code = ""
        self.industry = ""
        self.ceo = ""
        self.business_type = ""
        self.headquarters_location = ""
        self.website = ""
        self.phone_number = ""
        self.major_shareholder = ""
        self.revenue = ""
        self.pre_tax_continuing_operations_profit = ""
        self.net_profit = ""
        self.capital = ""
        self.total_ipo_shares = ""
        self.face_value = ""
        self.listing_ipo = ""
        self.desired_ipo_price = ""
        self.subscription_competition_rate = ""
        self.final_ipo_price = ""
        self.ipo_proceeds = ""
        self.lead_manager = ""
        self.demand_forecast_date = ""
        self.ipo_subscription_date = ""
        self.newspaper_allocation_announcement_date = ""
        self.payment_date = ""
        self.refund_date = ""
        self.listing_date = ""
        self.ir_data = ""
        self.ir_location_time = ""
        self.institutional_competition_rate = ""
        self.lock_up_agreement = ""

    def to_tuple(self):
        return (
            self.track_id, self.stock_name, self.status, self.market_type, self.stock_code,
            self.industry, self.ceo, self.business_type, self.headquarters_location, self.website, self.phone_number,
            self.major_shareholder, self.revenue, self.pre_tax_continuing_operations_profit, self.net_profit, self.capital,
            self.total_ipo_shares, self.face_value, self.listing_ipo, self.desired_ipo_price, self.subscription_competition_rate,
            self.final_ipo_price, self.ipo_proceeds, self.lead_manager, self.demand_forecast_date, self.ipo_subscription_date,
            self.newspaper_allocation_announcement_date, self.payment_date, self.refund_date, self.listing_date, self.ir_data,
            self.ir_location_time, self.institutional_competition_rate, self.lock_up_agreement
        )


class Scraper:
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

    def scrape_anchors(self, url):
        codes = []
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        response.encoding = response.apparent_encoding
        
        soup = BeautifulSoup(response.text, 'html.parser')
        anchors = soup.find_all('a', href=lambda href: href and '/view_pg/view_' in href)
        for anchor in anchors:
            href = anchor['href']
            if "code=" in href:
                code = href.split("code=")[1].split("&")[0]
                codes.append(code)
        return codes

    def scrape_details(self, url):
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        response.encoding = response.apparent_encoding
        
        soup = BeautifulSoup(response.text, 'html.parser')
        ipo_data = IpoData()
        
        header_table = self._find_header_table(soup)
        if header_table:
            ipo_data.market_type = self._find_market_type_in_header_table(header_table)
            ipo_data.status = self._find_status_in_header_table(header_table)
            
        ipo_data.stock_name = self._find_with_css_query(soup, "strong.view_tit")
        ipo_data.stock_code = self._find_with_css_query(soup, "strong.view_txt01")
        
        ipo_data.ceo = self._find_by_contained_text(soup, "td", "대표이사")
        ipo_data.phone_number = self._find_by_contained_text(soup, "td", "대표전화")
        ipo_data.total_ipo_shares = self._find_by_contained_text(soup, "td", "공모주식수")
        ipo_data.face_value = self._find_by_contained_text(soup, "td", "액면가")
        
        ipo_data.desired_ipo_price = self._find_by_contained_text(soup, "td", "(희망)공모가격")
        ipo_data.subscription_competition_rate = self._find_by_contained_text(soup, "td", "청약경쟁률")
        ipo_data.final_ipo_price = self._find_by_contained_text(soup, "td", "(확정)공모가격")
        ipo_data.ipo_proceeds = self._find_by_contained_text(soup, "td", "(희망)공모금액")
        
        ipo_data.lead_manager = self._find_lead_manager(soup)
        
        schedule_table = self._find_schedule_table(soup)
        if schedule_table:
            ipo_data.demand_forecast_date = self._find_by_contained_text(schedule_table, "td", "수요예측일")
            ipo_data.ipo_subscription_date = self._find_by_contained_text(schedule_table, "td", "공모청약일")
            ipo_data.refund_date = self._find_by_contained_text(schedule_table, "td", "환불일")
            
            payment_text = self._find_by_contained_text(schedule_table, "td", "납일일")
            if not payment_text:
                payment_text = self._find_by_contained_text(schedule_table, "td", "납입일")
            ipo_data.payment_date = payment_text
            
            ipo_data.listing_date = self._find_by_contained_text(schedule_table, "td", "상장일")
            
        return ipo_data

    def _find_header_table(self, soup):
        main_table = soup.find('table')
        if not main_table:
            print("메인 테이블을 찾을 수 없습니다.")
            return None
            
        for table in main_table.find_all('table'):
            if table.find('strong', class_='view_tit'):
                print("헤더 테이블 찾음!")
                return table
        print("조건에 맞는 헤더 테이블을 찾을 수 없습니다.")
        return None

    def _find_status_in_header_table(self, table):
        tds = table.find_all('td', attrs={"align": "right", "valign": "bottom"})
        for td in tds:
            text = td.get_text(strip=True)
            if "공모철회" in text:
                return "공모철회"
        return ""

    def _find_market_type_in_header_table(self, table):
        img = table.find('img')
        if img and img.get('src'):
            img_src = img['src']
            if "co.gif" in img_src: return "코스닥"
            elif "u.gif" in img_src: return "유가증권"
            elif "f.jpg" in img_src: return "코넥스"
        return "Unknown"

    def _find_with_css_query(self, soup, css_query):
        elm = soup.select_one(css_query)
        if elm:
            return elm.get_text().replace('\xa0', ' ').strip()
        return ""

    def _find_by_contained_text(self, parent, tag_name, text_to_find):
        target_td = parent.find(tag_name, string=lambda t: t and text_to_find in t)
        if target_td:
            next_td = target_td.find_next_sibling('td')
            if next_td:
                return next_td.get_text().replace('\xa0', ' ').strip()
        return ""

    def _find_schedule_table(self, soup):
        tables = soup.select("table.view_tb")
        for table in tables:
            first_td = table.select_one("tr:first-of-type td:first-of-type")
            if first_td and "대규모 IR일정" in first_td.get_text():
                return table
        return None

    def _find_lead_manager(self, soup):
        lead_managers = []
        tables = soup.select("table.view_tb")
        for table in tables:
            first_tr = table.find('tr')
            if first_tr and "증권회사" in first_tr.get_text():
                trs = table.find_all('tr')
                for i, tr in enumerate(trs):
                    if i > 0:
                        tds = tr.find_all('td')
                        if tds:
                            lead_managers.append(tds[0].get_text(strip=True))
                break
        return ",".join(lead_managers)


class IpoRepository:
    def __init__(self, db_path, table_name):
        self.db_path = db_path
        self.table_name = table_name
        self.track_id = ""

    def insert(self, data_list):
        # SQL 문장 내부에 컬럼 명세를 위한 한글 주석이 포함되어 있습니다.
        query = f"""
        INSERT INTO {self.table_name} (
            track_id,                               -- 트랙 ID
            stock_name,                             -- 종목명
            status,                                 -- 진행상황
            market_type,                            -- 시장구분
            stock_code,                             -- 종목코드
            industry,                               -- 업종
            ceo,                                    -- 대표자
            business_type,                          -- 기업구분
            headquarters_location,                  -- 본점소재지
            website,                                -- 홈페이지
            phone_number,                           -- 대표전화
            major_shareholder,                      -- 최대주주
            revenue,                                -- 매출액
            pre_tax_continuing_operations_profit,   -- 법인세비용차감전 계속사업이익
            net_profit,                             -- 순이익
            capital,                                -- 자본금
            total_ipo_shares,                       -- 총공모주식수
            face_value,                             -- 액면가
            listing_ipo,                            -- 상장공모
            desired_ipo_price,                      -- 희망공모가액
            subscription_competition_rate,          -- 청약경쟁률
            final_ipo_price,                        -- 확정공모가
            ipo_proceeds,                           -- 공모금액
            lead_manager,                           -- 주간사
            demand_forecast_date,                   -- 수요예측일
            ipo_subscription_date,                  -- 공모청약일
            newspaper_allocation_announcement_date, -- 배정공고일(신문)
            payment_date,                           -- 납입일
            refund_date,                            -- 환불일
            listing_date,                           -- 상장일
            ir_data,                                -- IR일자
            ir_location_time,                       -- IR장소/시간
            institutional_competition_rate,         -- 기관경쟁률
            lock_up_agreement                       -- 의무보유확약
        ) VALUES (
            ?, ?, ?, ?, ?, 
            ?, ?, ?, ?, ?, ?, 
            ?, ?, ?, ?, ?, 
            ?, ?, ?, ?, ?, 
            ?, ?, ?, ?, ?, 
            ?, ?, ?, ?, ?, 
            ?, ?, ?
        )
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            for data in data_list:
                data.track_id = self.track_id
                cursor.execute(query, data.to_tuple())
            conn.commit()


def main():
    try:
        scraper = Scraper()
        data_list = []
        code_list = []

        # 1단계 리스트페이지에서 코드 추출
        current_year = datetime.datetime.now().strftime("%Y")
        for page in range(1, SCRAPE_PAGES + 1):
            url = f"http://www.ipostock.co.kr/sub03/ipo04.asp?str1={current_year}&str2=all&str3=&str4=&page={page}"
            codes = scraper.scrape_anchors(url)
            code_list.extend(codes)
            print(f"{url} : {len(codes)} 추출")

        # 2단계 코드로 상세페이지 스크래핑
        for code in code_list:
            url = f"http://www.ipostock.co.kr/view_pg/view_04.asp?code={code}"
            print(f"스크래핑 url : {url}")
            try:
                data = scraper.scrape_details(url)
                data_list.append(data)
            except Exception as e:
                print(f"상세 페이지 스크래핑 실패 ({url}): {e}")

        # 3단계 기존에 만들어진 테이블에 데이터 저장
        repo = IpoRepository(DB_URL, DB_TABLENAME)
        track_id = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        print(f"TrackId : {track_id}")
        repo.track_id = track_id
        repo.insert(data_list)
        print("Data successfully scraped and stored!")

    except Exception as e:
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()