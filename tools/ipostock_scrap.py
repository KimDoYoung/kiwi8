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
        self.desired_ipo_price = ""
        self.subscription_competition_rate = ""
        self.final_ipo_price = ""
        self.ipo_proceeds = ""
        self.lead_manager = ""
        self.demand_forecast_date = ""
        self.ipo_subscription_date = ""
        self.payment_date = ""
        self.refund_date = ""
        self.listing_date = ""
        self.ir_data = ""

    def to_tuple(self):
        return (
            self.track_id, self.stock_name, self.status, self.market_type, self.stock_code,
            self.industry, self.ceo, self.business_type, self.headquarters_location, self.website, self.phone_number,
            self.major_shareholder, self.revenue, self.pre_tax_continuing_operations_profit, self.net_profit, self.capital,
            self.total_ipo_shares, self.face_value, self.desired_ipo_price, self.subscription_competition_rate,
            self.final_ipo_price, self.ipo_proceeds, self.lead_manager, self.demand_forecast_date, self.ipo_subscription_date,
            self.payment_date, self.refund_date, self.listing_date, self.ir_data,
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

        # ipostock URL code (e.g. B202504217) → track_id as stable unique key
        if "code=" in url:
            ipo_data.track_id = url.split("code=")[1].split("&")[0]

        header_table = self._find_header_table(soup)
        if header_table:
            ipo_data.market_type = self._find_market_type_in_header_table(header_table)
            ipo_data.status, ipo_data.industry = self._find_status_and_industry(header_table)

        ipo_data.stock_name = self._find_with_css_query(soup, "strong.view_tit")
        ipo_data.stock_code = self._find_with_css_query(soup, "strong.view_txt01")

        ipo_data.ceo = self._find_by_contained_text(soup, "td", "대표이사")
        ipo_data.phone_number = self._find_by_contained_text(soup, "td", "대표전화")
        ipo_data.website = self._find_website(soup)
        ipo_data.total_ipo_shares = self._find_by_contained_text(soup, "td", "공모주식수")
        ipo_data.face_value = self._find_by_contained_text(soup, "td", "액면가")
        ipo_data.desired_ipo_price = self._find_by_contained_text(soup, "td", "(희망)공모가격")
        ipo_data.subscription_competition_rate = self._find_by_contained_text(soup, "td", "청약경쟁률")
        ipo_data.final_ipo_price = self._find_by_contained_text(soup, "td", "(확정)공모가격")
        ipo_data.ipo_proceeds = self._find_by_contained_text(soup, "td", "(확정)공모금액")

        ipo_data.lead_manager = self._find_lead_manager(soup)

        schedule_table = self._find_schedule_table(soup)
        if schedule_table:
            ipo_data.ir_data = self._find_ir_data(schedule_table)
            ipo_data.demand_forecast_date = self._find_by_contained_text(schedule_table, "td", "수요예측일")
            ipo_data.ipo_subscription_date = self._find_by_contained_text(schedule_table, "td", "공모청약일")
            ipo_data.refund_date = self._find_by_contained_text(schedule_table, "td", "환불일")

            payment_text = self._find_by_contained_text(schedule_table, "td", "납일일")
            if not payment_text:
                payment_text = self._find_by_contained_text(schedule_table, "td", "납입일")
            ipo_data.payment_date = payment_text

            ipo_data.listing_date = self._find_by_contained_text(schedule_table, "td", "상장일")

        return ipo_data

    def scrape_company_overview(self, url, ipo_data):
        """view_01.asp 회사개요 페이지 스크래핑 → ipo_data 필드 보완."""
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        response.encoding = response.apparent_encoding
        soup = BeautifulSoup(response.text, 'html.parser')

        def get(label):
            return self._find_by_contained_text(soup, 'td', label)

        # view_01이 더 정확한 라벨 기반 필드 → 항상 덮어씀
        ipo_data.business_type              = get('기업구분')
        ipo_data.headquarters_location      = get('본점소재지')
        ipo_data.major_shareholder          = get('청구시 최대주주')
        ipo_data.revenue                    = get('청구시 매출액')
        ipo_data.pre_tax_continuing_operations_profit = get('법인세차감전순이익')
        ipo_data.net_profit                 = get('청구시 순이익')
        ipo_data.capital                    = get('청구시 자기자본')

        # view_04에 없을 경우 보완
        if not ipo_data.ceo:
            ipo_data.ceo = get('대표이사')
        if not ipo_data.phone_number:
            ipo_data.phone_number = get('대표전화')
        if not ipo_data.website:
            ipo_data.website = self._find_website(soup)
        if not ipo_data.industry:
            ipo_data.industry = get('업종')

    def _find_header_table(self, soup):
        main_table = soup.find('table')
        if not main_table:
            return None
        for table in main_table.find_all('table'):
            if table.find('strong', class_='view_tit'):
                return table
        return None

    def _find_status_and_industry(self, header_table):
        """Extract status and industry from the cell adjacent to the company name."""
        import re
        name_el = header_table.select_one('strong.view_tit')
        if not name_el:
            return "", ""
        parent_td = name_el.find_parent('td')
        if not parent_td:
            return "", ""
        next_td = parent_td.find_next_sibling('td')
        if not next_td:
            return "", ""
        text = next_td.get_text(separator=' ', strip=True).replace('\xa0', ' ')
        m = re.match(r'\[([^\]]+)\]\s*(.*)', text)
        if m:
            return m.group(1).strip(), m.group(2).strip()
        return "", text

    def _find_website(self, soup):
        """Extract website URL from 홈페이지 anchor tag."""
        td = soup.find('td', string=lambda t: t and '홈페이지' in t)
        if td:
            next_td = td.find_next_sibling('td')
            if next_td:
                a = next_td.find('a')
                if a and a.get('href'):
                    return a['href']
                return next_td.get_text(strip=True).replace('\xa0', ' ')
        return ""

    def _find_ir_data(self, schedule_table):
        """Extract IR date rows that appear before 수요예측일 in the schedule table."""
        ir_rows = []
        collecting = False
        for tr in schedule_table.find_all('tr'):
            tds = tr.find_all('td')
            if not tds:
                continue
            first_text = tds[0].get_text(strip=True)
            if '대규모 IR일정' in first_text:
                collecting = True
                continue
            if collecting:
                if '수요예측일' in first_text:
                    break
                row_text = ' | '.join(td.get_text(strip=True) for td in tds if td.get_text(strip=True))
                if row_text:
                    ir_rows.append(row_text)
        return '\n'.join(ir_rows)

    def _find_market_type_in_header_table(self, table):
        # scan all imgs — first img is always a nav icon, not the market type indicator
        for img in table.find_all('img'):
            src = img.get('src', '')
            if '/contents/co.gif' in src: return "코스닥"
            if '/contents/u.gif' in src: return "유가증권"
            if '/contents/f.jpg' in src or '/contents/f.gif' in src: return "코넥스"
        return "Unknown"

    def _find_with_css_query(self, soup, css_query):
        elm = soup.select_one(css_query)
        if elm:
            return elm.get_text().replace('\xa0', ' ').strip()
        return ""

    def _find_by_contained_text(self, parent, tag_name, text_to_find):
        # match only short tds (labels); large tds are containers that contain keyword via descendants
        target_td = next(
            (t for t in parent.find_all(tag_name)
             if text_to_find in t.get_text() and len(t.get_text(strip=True)) <= 30),
            None
        )
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

    _INSERT_SQL = """
        INSERT INTO {table} (
            track_id, stock_name, status, market_type, stock_code,
            industry, ceo, business_type, headquarters_location, website, phone_number,
            major_shareholder, revenue, pre_tax_continuing_operations_profit, net_profit, capital,
            total_ipo_shares, face_value, desired_ipo_price, subscription_competition_rate,
            final_ipo_price, ipo_proceeds, lead_manager, demand_forecast_date, ipo_subscription_date,
            payment_date, refund_date, listing_date, ir_data
        ) VALUES (
            ?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?,?
        )
    """

    def upsert(self, data_list):
        """track_id 기준 upsert: 기존 행 삭제 후 재삽입."""
        insert_sql = self._INSERT_SQL.format(table=self.table_name)
        delete_sql = f"DELETE FROM {self.table_name} WHERE track_id = ?"
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            inserted = updated = skipped = 0
            for data in data_list:
                if not data.track_id:
                    skipped += 1
                    continue
                cursor.execute(delete_sql, (data.track_id,))
                existed = cursor.rowcount > 0
                cursor.execute(insert_sql, data.to_tuple())
                if existed:
                    updated += 1
                else:
                    inserted += 1
            conn.commit()
        print(f"upsert 완료: 신규={inserted} 업데이트={updated} 건너뜀={skipped}")


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

        # 2단계 코드로 상세페이지 + 회사개요 스크래핑
        for code in code_list:
            url04 = f"http://www.ipostock.co.kr/view_pg/view_04.asp?code={code}"
            url01 = f"http://www.ipostock.co.kr/view_pg/view_01.asp?code={code}"
            print(f"스크래핑: {code}")
            try:
                data = scraper.scrape_details(url04)
                scraper.scrape_company_overview(url01, data)
                data_list.append(data)
            except Exception as e:
                print(f"스크래핑 실패 ({code}): {e}")

        # 3단계 upsert (track_id = ipostock URL 코드 기준)
        repo = IpoRepository(DB_URL, DB_TABLENAME)
        repo.upsert(data_list)
        print("완료.")

    except Exception as e:
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()