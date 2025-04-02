import os
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, Float, DateTime, String
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.declarative import declarative_base
import pandas as pd
from math import radians, sin, cos, sqrt, atan2
import requests
from dotenv import load_dotenv
import time

load_dotenv()

# 환경변수에서 API 키 로드
KAKAO_API_KEY = os.getenv("KAKAO_API_KEY")
KAKAO_API_URL = "https://dapi.kakao.com/v2/local/search/category.json"
KAKAO_COORD_URL = "https://dapi.kakao.com/v2/local/geo/coord2address.json"

# 요청 헤더
HEADERS = {"Authorization": f"KakaoAK 5da0a8d703e9ce95613b74b7e10fb2fa"}

# FastAPI 설정
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DB 연결
DATABASE_URL = "mysql+pymysql://select-user:select-mega@rds-mysql-mindheal.cgufe5mhgrbk.ap-northeast-2.rds.amazonaws.com/heroes"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# GPS 데이터 모델
table_name = 'subject_gps'


class GpsData(Base):
    __tablename__ = table_name
    subject_no = Column(Integer, primary_key=True, index=True)
    collected_time = Column(DateTime)
    latitude = Column(Float)
    longitude = Column(Float)


# Subject 테이블
table_subject = 'subject'


class Subject(Base):
    __tablename__ = table_subject
    no = Column(Integer, primary_key=True, index=True)
    display_no = Column(String)
    initial_name = Column(String)


# DB 세션 생성
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_kakao_place_info(latitude, longitude):
    url = "https://dapi.kakao.com/v2/local/search/category.json"
    headers = {"Authorization": f"KakaoAK 5da0a8d703e9ce95613b74b7e10fb2fa"}
    params = {
        "category_group_code": "FD6",  # 음식점 예시 (필요에 따라 수정 가능)
        "x": longitude,
        "y": latitude,
        "radius": 50,  # 반경 50m 내 검색
        "sort": "distance"
    }

    response = requests.get(url, headers=headers, params=params)

    if response.status_code == 200:
        places = response.json().get("documents", [])
        return [{"name": place["place_name"], "category": place["category_name"], "address": place["road_address_name"]}
                for place in places]
    else:
        return []


# 좌표 → 주소 변환 (movement pattern, regular hours locations에 적용)
def get_address_from_coordinates(lat, lng):
    try:
        params = {"x": lng, "y": lat}
        response = requests.get(KAKAO_COORD_URL, headers=HEADERS, params=params)
        result = response.json()

        if result.get("documents"):
            address = result["documents"][0].get("address", {}).get("address_name", "")
            road_address = result["documents"][0].get("road_address", {}).get("address_name", "")
            return road_address or address  # 도로명 주소가 있으면 우선 반환
    except Exception as e:
        print(f"Error in coord2address API: {e}")
        return "UNKNOWN"

    return "UNKNOWN"


# Stay Locations 카테고리 변환
def update_stay_locations_with_category(stay_locations):
    for location in stay_locations:
        location["category"] = get_location_category(location["latitude"], location["longitude"])
    return stay_locations


# Movement pattern 및 regular hours 좌표 → 장소명(주소) 변환
def update_locations_with_address(locations):
    for location in locations:
        location["address"] = get_address_from_coordinates(location["latitude"], location["longitude"])
    return locations


# 개별 subject_no 처리 (좌표 변환 적용)
def process_subject(subject_no):
    db = SessionLocal()
    gps_data = get_gps_data_with_display_no(db, subject_no)
    df = pd.DataFrame(gps_data, columns=['subject_no', 'collected_time', 'latitude', 'longitude', 'display_no', 'initial_name'])

    if df.empty:
        return None

    df['collected_time'] = pd.to_datetime(df['collected_time'])

    total_distance = df['distance_km'].sum()
    unique_dates = df['collected_time'].dt.date.nunique()
    avg_distance = total_distance / unique_dates if unique_dates else 0

    home_location = get_home_location(df)
    outing_count, total_outing_time = calculate_holiday_outing(df)
    stay_locations = get_stay_locations(df)
    stay_locations_grouped = group_similar_locations(stay_locations)
    movement_pattern = analyze_movement_pattern(df)

    # Stay Locations: 카테고리 변환
    stay_locations_grouped = update_stay_locations_with_category(stay_locations_grouped)

    # Movement Pattern & Regular Hours: 주소 변환
    movement_pattern_data = update_locations_with_address(movement_pattern.get("movement_pattern", []))
    regular_hours_locations = update_locations_with_address(movement_pattern.get("regular_hours_locations", []))

    return {
        "subject_no": subject_no,
        "display_no": df['display_no'].iloc[0],
        "initial_name": df['initial_name'].iloc[0],
        "total_distance": total_distance,
        "unique_dates": unique_dates,
        "average_distance_per_day": avg_distance,
        "home_location": home_location or "",
        "holiday_outing_count": outing_count or "",
        "total_holiday_outing_time": total_outing_time or "",
        "stay_locations": stay_locations_grouped,  # 카테고리 변환된 데이터
        "movement_pattern": movement_pattern_data,  # 주소 변환된 데이터
        "regular_hours_locations": regular_hours_locations  # 주소 변환된 데이터
    }


# GPS 데이터 조회
def get_gps_data_with_display_no(db: Session, subject_no: int):
    return db.query(
        GpsData.subject_no, GpsData.collected_time, GpsData.latitude, GpsData.longitude,
        Subject.display_no, Subject.initial_name
    ) \
        .join(Subject, Subject.no == GpsData.subject_no) \
        .filter(GpsData.subject_no == subject_no) \
        .all()

# 3분 이상 머문 장소 조회 + category mapping
def get_stay_locations(df):
    df['time_diff'] = df['collected_time'].diff().dt.total_seconds().fillna(0)
    stays = df[df['time_diff'] >= 180]

    stay_locations = stays.groupby(['latitude', 'longitude']).agg(
        total_time=('time_diff', 'sum'),
        visit_count=('latitude', 'count')
    ).reset_index()

    # 각 좌표의 category 조회
    stay_locations["category"] = stay_locations.apply(
        lambda row: get_location_category(row["latitude"], row["longitude"]), axis=1
    )

    return stay_locations.to_dict(orient='records')

# 개별 subject_no 처리
def process_subject(subject_no):
    db = SessionLocal()
    gps_data = get_gps_data_with_display_no(db, subject_no)
    df = pd.DataFrame(gps_data,
                      columns=['subject_no', 'collected_time', 'latitude', 'longitude', 'display_no', 'initial_name'])

    if df.empty:
        return None

    df['collected_time'] = pd.to_datetime(df['collected_time'])

    stay_locations = get_stay_locations(df)

    return {
        "subject_no": subject_no,
        "display_no": df['display_no'].iloc[0],
        "initial_name": df['initial_name'].iloc[0],
        "stay_locations": stay_locations
    }


# 기본 endpoint 추가
@app.get("/")
def read_root():
    return {"message": "Welcome to the FastAPI application!"}

# haversine 공식 (거리 계산)
def haversine(lat1, lon1, lat2, lon2):
    R = 6371  # 지구 반지름 (km)
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R * c  # 거리 (km)

# DB 서 GPS 데이터 (Subject 테이블 조인)
def get_gps_data_with_display_no(db: Session, subject_no: int):
    gps_data = db.query(
        GpsData.subject_no, GpsData.collected_time, GpsData.latitude, GpsData.longitude,
        Subject.display_no, Subject.initial_name  # initial_name 추가
    ) \
        .join(Subject, Subject.no == GpsData.subject_no) \
        .filter(GpsData.subject_no == subject_no) \
        .all()
    return gps_data

# 집 위치 추정 (오후 10시 이후, 가장 많이 머문 장소)
def get_home_location(df):
    # 10시 이후의 데이터 필터링
    df_filtered = df[df['collected_time'].dt.hour >= 22]

    # 10시 이후에 가장 많이 머문 장소 찾기
    if not df_filtered.empty:
        home_location = df_filtered.groupby(['latitude', 'longitude']).size().idxmax()
        return home_location
    else:
        return None  # 10시 이후 데이터 없을 경우 None 반환

# 주말: *휴일은 주말로 가정.
def calculate_holiday_outing(df):
    df['date'] = df['collected_time'].dt.date
    df['weekday'] = df['collected_time'].dt.weekday
    holidays = df[df['weekday'] >= 5]  # 토요일, 일요일 필터링
    outing_count = holidays['date'].nunique()
    total_outing_time = holidays.shape[0] * 5  # 5분을 기본 주말 외출 시간 가정
    return outing_count, total_outing_time

# 3분 이상 머문 장소 기록 및 횟수 추가
def get_stay_locations(df):
    # time_diff 계산: 이전과 현재 시간의 차이
    df['time_diff'] = df['collected_time'].diff().dt.total_seconds().fillna(0)
    # 3분 이상 머문 장소만 필터링
    stays = df[df['time_diff'] >= 180]

    # 각 장소 서 방문 횟수 및 총 머문 시간 계산
    stay_locations = stays.groupby(['latitude', 'longitude']).agg(
        total_time=('time_diff', 'sum'),
        visit_count=('latitude', 'count')
    ).reset_index()

    # 방문 횟수 및 머문 시간 기준 정렬 (가장 많이 방문한 장소~)
    stay_locations = stay_locations.sort_values(by=['visit_count', 'total_time'], ascending=False)

    return stay_locations.to_dict(orient='records')

# 유사한 좌표 기준 중복 제거 (좌표 차이로 유사 장소 묶기)
def group_similar_locations(stay_locations, threshold=0.02):
    grouped = []
    for loc in stay_locations:
        added = False
        for group in grouped:
            # 두 좌표 간의 거리가 threshold 이내인 경우 같은 장소로 취급
            dist = haversine(loc['latitude'], loc['longitude'], group[0]['latitude'], group[0]['longitude'])
            if dist < threshold:
                group.append(loc)
                added = True
                break
        if not added:
            grouped.append([loc])
    return grouped

def fetch_kakao_place(lat, lon, api_key, radius=50):
    url = f"https://dapi.kakao.com/v2/local/geo/coord2address.json?"
    headers = {"Authorization": f"KakaoAK 5da0a8d703e9ce95613b74b7e10fb2fa"}
    params = {
        "x": lon,
        "y": lat
    }
    response = requests.get(url, headers=headers, params=params)
    if response.status_code == 200:
        result = response.json()
        if result['documents']:
            return result['documents'][0].get("category_group_code", "Unknown")
    else:
        print(f"Error {response.status_code}: {response.text}")  # 에러 로그 추가
    return "Unknown"

CATEGORY_MAP = {
    "MT1": "대형마트",
    "CS2": "편의점",
    "PS3": "어린이집, 유치원",
    "SC4": "학교",
    "AC5": "학원",
    "PK6": "주차장",
    "OL7": "주유소, 충전소",
    "SW8": "지하철역",
    "BK9": "은행",
    "CT1": "문화시설",
    "AG2": "중개업소",
    "PO3": "공공기관",
    "AT4": "관광명소",
    "AD5": "숙박",
    "FD6": "음식점",
    "CE7": "카페",
    "HP8": "병원",
    "PM9": "약국"
}

def fetch_kakao_category(lat, lon, api_key, radius=50,max_retries=5):
    """좌표를 기반으로 카카오 카테고리 코드 조회"""
    url = "https://dapi.kakao.com/v2/local/search/category.json"
    headers = {"Authorization": f"KakaoAK {api_key}"}
    category_codes = ["MT1", "CS2", "PS3", "SC4", "AC5", "PK6", "OL7", "SW8", "BK9", "CT1",
                      "AG2", "PO3", "AT4", "AD5", "FD6", "CE7", "HP8", "PM9"]  # 🔥 카테고리 리스트

    nearest_place = None
    min_distance = float('inf')

    for category in category_codes:
        params = {"x": lon, "y": lat, "radius": radius, "category_group_code": category}

        for attempt in range(max_retries):  # ✅ 최대 3번 재시도
            try:
                response = requests.get(url, headers=headers, params=params, timeout=20)  # ✅ 20초 타임아웃 설정

                if response.status_code == 200:
                    result = response.json()
                    if result.get("documents"):
                        for place in result["documents"]:
                            distance_str = place.get("distance", "999999")
                            distance = int(distance_str) if distance_str.strip().isdigit() else 999999

                            if distance < min_distance:
                                min_distance = distance
                                nearest_place = place
                    break  # ✅ 성공하면 재시도 종료

                else:
                    print(f"Error {response.status_code}: {response.text}")
                    break  # HTTP 에러는 재시도할 필요 없음

            except requests.exceptions.RequestException as e:
                error_message = f"⚠️ 요청 실패 (시도 {attempt + 1}/{max_retries}): {e}"
                print(error_message)
                with open("log.txt", "a") as log_file:
                    log_file.write(error_message + "\n")

                time.sleep(10)  # ✅ 네트워크 오류 발생 시 10초 대기 후 재시도

            return nearest_place.get("category_group_code", "Unknown")
    return "Unknown"

api_key = "5da0a8d703e9ce95613b74b7e10fb2fa"
#print(fetch_kakao_place(35.151308917717, 126.85208467134, api_key))

# 이동 시간 규칙성 분석 및 regular_hours - 30분 단위 방문 위치 반환
def analyze_movement_pattern(df):
    flat_list = [item for sublist in df for item in sublist]  # 리스트 내부 리스트 풀기
    filtered_df = [entry for entry in flat_list if entry['visit_count'] >= 2]
    api_key = '5da0a8d703e9ce95613b74b7e10fb2fa'
    # 카카오 API를 통해 장소 정보 추가
    if api_key:
        for entry in filtered_df:
            category_code = fetch_kakao_category(entry["latitude"], entry["longitude"], api_key)  # 카테고리 코드 가져오기
            entry["category_code"] = category_code  # ✅ 카테고리 코드 추가
            entry["category_name"] = CATEGORY_MAP.get(category_code, "기타")

    return filtered_df

    # #  30분 단위로 그룹화 (0~23시간 + 0~30분 / 30~59분)
    # df['half_hour'] = df['collected_time'].dt.hour * 2 + (df['collected_time'].dt.minute >= 30).astype(int)
    # #  30분 단위 방문 횟수 계산 ( visit_count >= 3 필터 적용)
    # movement_pattern = df.groupby(['half_hour', 'latitude', 'longitude']).size().reset_index(name='visit_count')
    # movement_pattern = movement_pattern[movement_pattern[''] >= 3]  # 여기서 미리 필터링! -> 데이터 너무 많지 않게 처리
    # #  방문 횟수가 3번 이상인 시간대, 장소 추출visit_count
    # regular_hours = movement_pattern['half_hour'].unique().tolist()
    # #  3번 이상 방문한 장소만 리스트 반환
    # frequent_locations = movement_pattern.to_dict(orient='records')
    #
    #
    # #  빈 리스트 방지 (기본값 설정)
    # if movement_pattern.empty:
    #     return {
    #         "movement_pattern": [ 0 ],
    #         "regular_hours": [ 0 ],
    #         "regular_hours_locations": [ 0 ]
    #     }
    #
    # return {
    #     "movement_pattern": movement_pattern.to_dict(orient='records'),
    #     "regular_hours": regular_hours,
    #     "regular_hours_locations": frequent_locations
    # }

# 개별 subject_no 처리
def process_subject(subject_no):
    db = SessionLocal()
    gps_data = get_gps_data_with_display_no(db, subject_no)
    df = pd.DataFrame(gps_data,
                      columns=['subject_no', 'collected_time', 'latitude', 'longitude', 'display_no',
                               'initial_name'])  # initial_name 추가
    if df.empty:
        return None  # 데이터 없는 경우 처리

    df['collected_time'] = pd.to_datetime(df['collected_time'])

    # 이동 거리 계산
    df['prev_latitude'] = df['latitude'].shift(1)
    df['prev_longitude'] = df['longitude'].shift(1)
    df['distance_km'] = df.apply(
        lambda row: haversine(row['prev_latitude'], row['prev_longitude'], row['latitude'], row['longitude'])
        if pd.notnull(row['prev_latitude']) else 0, axis=1
    )

    total_distance = df['distance_km'].sum()
    unique_dates = df['collected_time'].dt.date.nunique()
    avg_distance = total_distance / unique_dates if unique_dates else 0

    # 집 위치, 휴일 외출 횟수 및 시간, 3분 이상 머문 장소, 이동 규칙성 분석
    home_location = get_home_location(df)
    outing_count, total_outing_time = calculate_holiday_outing(df)
    stay_locations = get_stay_locations(df)
    stay_locations_grouped = group_similar_locations(stay_locations)  # 유사한 장소로 그룹화
    movement_pattern = analyze_movement_pattern(stay_locations_grouped)

    # 빈 값 처리 (None 또는 NaN -> 공백 처리)
    home_location = home_location if home_location is not None else ""
    outing_count = outing_count if outing_count is not None else ""
    total_outing_time = total_outing_time if total_outing_time is not None else ""

    # Stay locations, Movement pattern 대해 빈 값 처리
    # stay_locations = stay_locations if stay_locations else []
    # movement_pattern_data = movement_pattern.get("movement_pattern", [])
    # regular_hours_locations = movement_pattern.get("regular_hours_locations", [])

    return {
        "subject_no": subject_no,
        "display_no": df['display_no'].iloc[0],
        "initial_name": df['initial_name'].iloc[0],  # initial_name 추가
        "total_distance": total_distance,
        "unique_dates": unique_dates,
        "average_distance_per_day": avg_distance,
        "home_location": home_location,
        "holiday_outing_count": outing_count,
        "total_holiday_outing_time": total_outing_time,
        "stay_locations": stay_locations_grouped,  # 유사한 장소 그룹화 리스트
        "movement_pattern": movement_pattern
        # "regular_hours_locations": regular_hours_locations
    }

# 병렬 처리 실행
@app.get("/gps-data")
def get_processed_gps_data(db: Session = Depends(get_db)):
    subjects = db.query(GpsData.subject_no).distinct().all()
    subject_nos = [subject[0] for subject in subjects]

    results = list(map(process_subject, subject_nos))
    print({"result":results})
    return {"result": results}

        # with ProcessPoolExecutor() as executor:
    # Stay Locations 좌표를 카카오 API 통해 category 코드로 변환
    # for res in results:
    #     if res is not None:
    #         res["stay_locations"] = update_stay_locations_with_category(res["stay_locations"])
    #
    # return {"result": [res for res in results if res is not None]}