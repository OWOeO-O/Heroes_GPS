import requests

# 카카오 REST API 키 (카카오 개발자 사이트에서 발급받은 API 키를 입력)
api_key = '118695f495d4d82830112a933348c3f6'

# 카카오 맵 API URL
url = 'https://dapi.kakao.com/v2/local/search/keyword.json'

# 요청 헤더에 API 키 포함
headers = {
    'Authorization': f'KakaoAK {api_key}'  # KakaoAK 뒤에 실제 API 키를 넣어주세요
}

# 검색할 키워드나 장소 입력
params = {
    'query': '서울역'  # 예: '서울역'을 검색합니다.
}

# API 호출
response = requests.get(url, headers=headers, params=params)

# 응답 내용 출력
if response.status_code == 200:
    data = response.json()
    print(data)  # JSON 형태로 응답 데이터를 출력합니다.
else:
    print(f"Error: {response.status_code}")
