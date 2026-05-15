import requests

# 1. 요청 URL 및 데이터 설정
url = "https://kind.krx.co.kr/corpgeneral/corpList.do"

# JavaScript의 fnDownload() 내부 로직을 파라미터로 변환
payload = {
    'method': 'download',
    'pageIndex': '1',
    'currentPageSize': '5000', # 3000보다 넉넉하게 설정하여 전체 리스트 확보
}

# 2. 헤더 설정 (Referer와 User-Agent가 중요할 수 있음)
headers = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://kind.krx.co.kr/corpgeneral/corpList.do?method=loadInitPage'
}

def download_krx_excel():
    try:
        # POST 방식으로 요청 전송
        response = requests.post(url, data=payload, headers=headers)
        
        if response.status_code == 200:
            # 파일 저장 (KIND의 엑셀은 실제로는 HTML table 형식의 .xls 파일인 경우가 많음)
            with open("krx_corp_list.xls", "wb") as f:
                f.write(response.content)
            print("성공적으로 다운로드되었습니다: krx_corp_list.xls")
        else:
            print(f"다운로드 실패. 상태 코드: {response.status_code}")
            
    except Exception as e:
        print(f"오류 발생: {e}")

if __name__ == "__main__":
    download_krx_excel()