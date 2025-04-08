import os
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, create_engine, Column, Integer, Float, DateTime, String
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.declarative import declarative_base
import pandas as pd
from math import radians, sin, cos, sqrt, atan2
import requests
from dotenv import load_dotenv

load_dotenv()

# API 키 로드
KAKAO_API_KEY = os.getenv("KAKAO_API_KEY")
KAKAO_API_URL = "https://dapi.kakao.com/v2/local/search/category.json"
KAKAO_COORD_URL = "https://dapi.kakao.com/v2/local/geo/coord2address.json"
# 요청 헤더
HEADERS = {"Authorization": f"KakaoAK {KAKAO_API_KEY}"}
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
            return road_address or address  # 도로명 주소 있으면, 우선 반환
    except Exception as e:
        print(f"Error in coord2address API: {e}")
        return "UNKNOWN"
    return "UNKNOWN"


# Stay Locations 변환 - 1) category 2) address 변환
def update_locations_with_field(locations, field_name, fetch_func):
    for location in locations:
        location[field_name] = fetch_func(location["latitude"], location["longitude"])
    return locations


# Stay Locations -> 1) category 변환
def update_stay_locations_with_category(stay_locations):
    return update_locations_with_field(stay_locations, "category", fetch_kakao_category)


# Movement pattern 및 regular hours → 2) address 변환
def update_locations_with_address(locations):
    return update_locations_with_field(locations, "address", get_address_from_coordinates)


# 개별 subject_no 처리 (좌표 변환 적용)
def process_subject(subject_no):
    db = SessionLocal()
    gps_data = get_gps_data_with_display_no(db, subject_no)
    df = pd.DataFrame(gps_data,
                      columns=['subject_no', 'collected_time', 'latitude', 'longitude', 'display_no', 'initial_name'])

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
    # Stay Locations: category update
    stay_locations_grouped = update_stay_locations_with_category(stay_locations_grouped)
    # Movement Pattern & Regular Hours: address update
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
        "stay_locations": stay_locations_grouped,  # category 변환 데이터
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

    # 각 좌표 category 조회
    stay_locations["category"] = [fetch_kakao_category(lat, lon) for lat, lon in
                                  zip(stay_locations["latitude"], stay_locations["longitude"])]
    return stay_locations.to_dict(orient='records')  # 개별 subject_no 처리


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
    # 10시 이후에 가장 많이 머문 장소 찾기
    df_filtered = df[df['collected_time'].dt.hour >= 22]
    return df_filtered.groupby(
        ['latitude', 'longitude']).size().idxmax() if not df_filtered.empty else None  # 10시 이후 데이터 없을 경우 None 반환


# 휴일: "주말" 가정.
def calculate_holiday_outing(df):
    df['date'] = df['collected_time'].dt.date
    df['weekday'] = df['collected_time'].dt.weekday
    holidays = df[df['weekday'] >= 5]  # 토요일, 일요일 필터링
    outing_count = holidays['date'].nunique()
    total_outing_time = holidays.shape[0] * 5  # 기본 주말 외출 시간 = 5분 가정
    return outing_count, total_outing_time


# 3분 이상 머문 장소 기록 및 횟수 추가
def get_stay_locations(df):
    # time_diff 계산: 이전과 현재 시간의 차이
    df['time_diff'] = df['collected_time'].diff().dt.total_seconds().fillna(0)
    # 3분 이상 머문 장소만 필터링
    stays = df[df['time_diff'] >= 180]
    # 각 장소, 방문 횟수 및 총 머문 시간 계산
    stay_locations = stays.groupby(['latitude', 'longitude']).agg(
        total_time=('time_diff', 'sum'),
        visit_count=('latitude', 'count')
    ).reset_index()
    # 방문 횟수 및 머문 시간 기준 정렬 (가장 많이 방문한 장소~)
    stay_locations = stay_locations.sort_values(by=['visit_count', 'total_time'], ascending=False)
    return stay_locations.to_dict(orient='records')


# 유사한 좌표 기준 중복 제거 (좌표 차이로 유사 장소 묶기)
def group_similar_locations(stay_locations, threshold=0.001):
    grouped = []
    for loc in stay_locations:
        added = False
        for group in grouped:
            # 두 좌표 간의 거리가 threshold 이내 경우 같은 장소로 취급
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
    headers = {"Authorization": f"KakaoAK {api_key}"}
    params = {
        "x": lon, "y": lat
    }
    response = requests.get(url, headers=headers, params=params)
    if response.status_code == 200:
        result = response.json()
        if result.get("documents"):
            return result["documents"][0].get("address", {}).get("address_name", "Unknown")
    else:
        print(f"Error {response.status_code}: {response.text}")  # 에러 로그 추가
    return "Unknown"


CATEGORY_MAP = {
    "MT1": "대형마트", "CS2": "편의점", "PS3": "어린이집, 유치원", "SC4": "학교", "AC5": "학원", "PK6": "주차장", "OL7": "주유소, 충전소", "SW8": "지하철역", "BK9": "은행",
    "CT1": "문화시설", "AG2": "중개업소", "PO3": "공공기관", "AT4": "관광명소", "AD5": "숙박", "FD6": "음식점", "CE7": "카페", "HP8": "병원", "PM9": "약국"
}

def fetch_kakao_category(lat, lon, api_key, radius=50):
    """좌표를 기반으로 카카오 카테고리 코드 조회"""
    url = "https://dapi.kakao.com/v2/local/search/category.json"
    headers = {"Authorization": f"KakaoAK {api_key}"}
    category_codes = ["MT1", "CS2", "PS3", "SC4", "AC5", "PK6", "OL7", "SW8", "BK9", "CT1",
                      "AG2", "PO3", "AT4", "AD5", "FD6", "CE7", "HP8", "PM9"]  # 🔥 카테고리 리스트

    nearest_place = None  # 가장 가까운 장소 저장
    min_distance = float('inf')  # 최소 거리 초기값 (무한대)

    for category in category_codes:  # ✅ 모든 카테고리 조회
        params = {"x": lon, "y": lat, "radius": radius, "category_group_code": category}
        response = requests.get(url, headers=headers, params=params, timeout=10)

        if response.status_code == 200:
            result = response.json()
            if result.get("documents"):
                for place in result["documents"]:  # ✅ 모든 장소 확인
                    distance_str = place.get("distance", "999999")  # 문자열 받음
                    try:
                        distance = int(distance_str) if distance_str.isdigit() else 999999
                    except ValueError:
                        distance = 999999  # 변환 오류 시 기본값 설정

                    if distance < min_distance:  # ✅ 더 가까운 장소 찾기
                        min_distance = distance
                        nearest_place = place
        else:
            print(response)

    if nearest_place:
        return nearest_place.get("category_group_code", "Unknown")  # ✅ 가장 가까운 장소 category 코드 반환
    # print(f"Error {response.status_code}: {response.text}")
    return "Unknown"

api_key = "5da0a8d703e9ce95613b74b7e10fb2fa"

# print(fetch_kakao_place(35.151308917717, 126.85208467134, api_key))

# 이동 시간 규칙성 분석 및 regular_hours - 30분 단위 방문 위치 반환
def analyze_category(df):
    flat_list = [item for sublist in df for item in sublist]  # 리스트 내부 리스트 풀기
    top_5 = sorted(flat_list, key=lambda x: x['total_time'], reverse=True)[:5]

    # filtered_df = [entry for entry in flat_list if entry['visit_count'] >= 2]
    api_key = '5da0a8d703e9ce95613b74b7e10fb2fa'
    # 카카오 API 통해 장소 정보 추가
    if api_key:
        for entry in top_5:
            category_code = fetch_kakao_category(entry["latitude"], entry["longitude"], api_key)  # 카테고리 코드 가져오기
            entry["category_code"] = category_code  # ✅ 카테고리 코드 추가
            entry["category_name"] = CATEGORY_MAP.get(category_code, "기타")
    return top_5


# 이동 규칙성
def analyze_movement_pattern(df):
    # 30분 단위로 그룹화 (0~23시간 + 0~30분 / 30~59분)
    df['half_hour'] = df['collected_time'].dt.hour * 2 + (df['collected_time'].dt.minute >= 30).astype(int)
    visit_counts = df.groupby(['half_hour', 'latitude', 'longitude']).size().reset_index(name='visit_count')
    movement_pattern = visit_counts[visit_counts['visit_count'] >= 3]
    regular_hours = sorted(movement_pattern['half_hour'].unique().tolist())
    frequent_locations = movement_pattern.to_dict(orient='records')

    #  빈 리스트 방지 (기본값 설정)
    if movement_pattern.empty:
        return {
            "movement_pattern": [],
            "regular_hours": [],
            "regular_hours_locations": []
        }
    return {
        "movement_pattern": movement_pattern.to_dict(orient='records'),
        "regular_hours": regular_hours,
        "regular_hours_locations": frequent_locations
    }

# 개별 subject_no 처리
def process_subject(subject_no, db):
    db = SessionLocal()
    gps_data = get_gps_data_with_display_no(db, subject_no)
    df = pd.DataFrame(gps_data,
                      columns=['subject_no', 'collected_time', 'latitude', 'longitude', 'display_no',
                               'initial_name'])  # initial_name 추가
    if df.empty:
        return {"subject_no": subject_no, "error": "No GPS data"}

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
    stay_locations_category = analyze_category(stay_locations_grouped)  # 유사한 장소로 그룹화 카테고리
    movement_pattern = analyze_movement_pattern(df)

    # 빈 값 처리 (None 또는 NaN -> 공백 처리)
    home_location = home_location if home_location is not None else ""
    outing_count = outing_count if outing_count is not None else ""
    total_outing_time = total_outing_time if total_outing_time is not None else ""

    # Stay locations, Movement pattern 대해 빈 값 처리
    # stay_locations = stay_locations if stay_locations else []
    # movement_pattern_data = movement_pattern.get("movement_pattern", [])
    # regular_hours_locations = movement_pattern.get("regular_hours_locations", [])

    # df['collected_time'] = pd.to_datetime(df['collected_time'], errors='coerce')
    # def get_analysis_period(df):
    #     # 1. datetime 타입으로 변환 (혹시 문자열 등일 수 있으니까)
    #     if not pd.api.types.is_datetime64_any_dtype(df['collected_time']):
    #         df['collected_time'] = pd.to_datetime(df['collected_time'], errors='coerce')
    #
    #     # 2. 변환 실패한 null 값 제거
    #     df = df.dropna(subset=['collected_time'])
    #
    #     # 3. 데이터 없으면 기본값 리턴
    #     if df.empty:
    #         return {"start_date": None, "end_date": None, "duration_days": 0}
    #
    #     # 4. 분석 기간 계산
    #     start = df['collected_time'].min()
    #     end = df['collected_time'].max()
    #
    #     return {
    #         "start_date": str(start.date()),
    #         "end_date": str(end.date()),
    #         "duration_days": (end - start).days + 1
    #     }

    def get_weekend_outing_info(df):
        if not pd.api.types.is_datetime64_any_dtype(df['collected_time']):
            df['collected_time'] = pd.to_datetime(df['collected_time'], errors='coerce')
        df = df.dropna(subset=['collected_time'])

        # 요일 컬럼 추가
        df['weekday'] = df['collected_time'].dt.dayofweek  # Monday=0, Sunday=6
        weekend_df = df[df['weekday'] >= 5]  # 5=Saturday, 6=Sunday

        if weekend_df.empty:
            return {
                "total_weekend_outing_time": 0,
                "weekend_days_count": 0,
                "avg_outing_time_per_day": 0,
                "most_common_outing_day": None
            }

        # 일별로 머문 시간 계산 (외출 시간 계산 방식은 stay 기준 또는 머무른 시간 합산 등 사용자 정의 가능)
        # 여기선 예시로 하루에 머문 시간의 합을 외출 시간으로 정의
        outing_by_date = weekend_df.groupby(weekend_df['collected_time'].dt.date).size()
        weekend_days_count = outing_by_date.shape[0]

        # 총 외출 시간: 임의로 1 point = 1분 가정 (실제는 머무른 시간 합산 로직으로 대체 가능)
        total_weekend_outing_time = outing_by_date.sum()  # 단위: 분이라고 가정

        avg_outing_time_per_day = total_weekend_outing_time / weekend_days_count if weekend_days_count > 0 else 0

        # 가장 자주 외출한 요일
        most_common_day = weekend_df['weekday'].mode().iloc[0]
        weekday_map = {5: 'Saturday', 6: 'Sunday'}
        most_common_outing_day = weekday_map.get(most_common_day, None)

        return {
            "total_weekend_outing_time": int(total_weekend_outing_time),
            "weekend_days_count": int(weekend_days_count),
            "avg_outing_time_per_day": round(avg_outing_time_per_day, 2),
            "most_common_outing_day": most_common_outing_day
        }

    def main():
        db = SessionLocal()
        try:
            subject_no_list = get_all_subject_nos(db)
            for subject_no in subject_no_list:
                process_subject(subject_no, db)
        finally:
            db.close()

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
        "stay_locations": stay_locations_category,  # 유사한 장소 그룹화 리스트
        "movement_pattern": movement_pattern
        # ,
        # # "analysis_period": analysis_period
        # # "analysis_period"
        # # "regular_hours_locations": regular_hours_locations
    }

@app.get("/gps-data")
def get_processed_gps_data(
        request: Request,
        db: Session = Depends(get_db)
):
    # 쿼리 파라미터 추출
    params = request.query_params
    page = int(params.get("page", 1))  # 기본값 1
    size = int(params.get("size", 10))  # 기본값 10
    offset = (page - 1) * size  # offset 계산
    # 전체 subject_no 개수 먼저 구함 (distinct count!)

    total_count = db.query(func.count(func.distinct(GpsData.subject_no))).scalar()
    # 데이터 조회
    subjects = (
        db.query(GpsData.subject_no)
        .distinct()
        .offset(offset)
        .limit(size)
        .all()
    )

    subject_nos = [subject[0] for subject in subjects]
    results = [process_subject(subject_no, db) for subject_no in subject_nos]

    return {
        "page": page,
        "size": size,
        "count": len(results),  # 현재 페이지 아이템 수
        "total_count": total_count,  # ✅ 전체 subject 수 (프론트용)
        "result": results
    }

    # with ProcessPoolExecutor() as executor:
    # Stay Locations 좌표를 카카오 API 통해 category 코드로 변환
    # for res in results:
    #     if res is not None:
    #         res["stay_locations"] = update_stay_locations_with_category(res["stay_locations"])
    #
    # return {"result": [res for res in results if res is not None]}