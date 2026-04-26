import requests
import json

url = "http://localhost:8003/kiwi8/api/v1/diary/list"
payload = {
    "api_id": "diary_list",
    "payload": {
        "start_ymd": "20260327",
        "end_ymd": "20260426",
        "page": 1,
        "limit": 100
    }
}

try:
    response = requests.post(url, json=payload)
    print(f"Status Code: {response.status_code}")
    print(json.dumps(response.json(), indent=2, ensure_ascii=False))
except Exception as e:
    print(f"Error: {e}")
