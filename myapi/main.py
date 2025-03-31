from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, Float, DateTime, String
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.declarative import declarative_base
import pandas as pd
from math import radians, sin, cos, sqrt, atan2
from datetime import datetime, timedelta
import pymysql
from concurrent.futures import ProcessPoolExecutor

# FastAPI 앱 설정
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 모든 도메인에서 접근을 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DB 연결 URL 설정
DATABASE_URL = "mysql+pymysql://select-user:select-mega@rds-mysql-mindheal.cgufe5mhgrbk.ap-northeast-2.rds.amazonaws.com/heroes"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# GPS 데이터 모델 정의
class GpsData(Base):
    __tablename__ = 'subject_gps'
    subject_no = Column(Integer, primary_key=True, index=True)
    collected_time = Column(DateTime)
    latitude = Column(Float)
    longitude = Column(Float)


# Subject 테이블 정의 (조인 사용을 위해 추가)
class Subject(Base):
    __tablename__ = 'subject'
    no = Column(Integer, primary_key=True, index=True)
    display_no = Column(String)
    initial_name = Column(String)  # initial_name 추가


# DB 세션 생성
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# 기본 엔드포인트 추가
@app.get("/")
def read_root():
    return {"message": "Welcome to the FastAPI application!"}


# 하버사인 공식 (거리 계산)
def haversine(lat1, lon1, lat2, lon2):
    R = 6371  # 지구 반지름 (km)
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R * c  # 거리 (km)


# DB에서 GPS 데이터 가져오기 (Subject 테이블과 조인)
def get_gps_data_with_display_no(db: Session, subject_no: int):
    gps_data = db.query(
        GpsData.subject_no, GpsData.collected_time, GpsData.latitude, GpsData.longitude,
        Subject.display_no, Subject.initial_name  # initial_name 추가
    ) \
        .join(Subject, Subject.no == GpsData.subject_no) \
        .filter(GpsData.subject_no == subject_no) \
        .all()
    return gps_data


# 집 위치 추정 (가장 많이 머문 장소)
def get_home_location(df):
    home_location = df.groupby(['latitude', 'longitude']).size().idxmax()
    return home_location


# 공휴일 고려한 휴일 외출 횟수 및 시간 계산
def calculate_holiday_outing(df):
    df['date'] = df['collected_time'].dt.date
    df['weekday'] = df['collected_time'].dt.weekday
    holidays = df[df['weekday'] >= 5]  # 토요일, 일요일 필터링
    outing_count = holidays['date'].nunique()
    total_outing_time = holidays.shape[0] * 5  # 5분을 기본 휴일 외출 시간으로 가정
    return outing_count, total_outing_time


# 3분 이상 머문 장소 기록 및 횟수 추가
def get_stay_locations(df):
    # time_diff 계산: 이전과 현재 시간의 차이
    df['time_diff'] = df['collected_time'].diff().dt.total_seconds().fillna(0)
    # 3분 이상 머문 장소만 필터링
    stays = df[df['time_diff'] >= 180]

    # 각 장소에서의 방문 횟수 및 총 머문 시간 계산
    stay_locations = stays.groupby(['latitude', 'longitude']).agg(
        total_time=('time_diff', 'sum'),
        visit_count=('latitude', 'count')
    ).reset_index()

    # 방문 횟수 및 머문 시간 기준으로 정렬 (가장 많이 방문한 장소부터)
    stay_locations = stay_locations.sort_values(by=['visit_count', 'total_time'], ascending=False)

    return stay_locations.to_dict(orient='records')


# 유사한 좌표 기준으로 중복 제거 (좌표 차이로 유사 장소를 묶기)
def group_similar_locations(stay_locations, threshold=0.0005):
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


# 이동 시간 규칙성 분석 및 regular_hours 방문 위치 반환 (개선)
def analyze_movement_pattern(df):
    df['hour'] = df['collected_time'].dt.hour

    # 시간대별 방문 횟수를 계산
    movement_pattern = df.groupby(['hour', 'latitude', 'longitude']).size().reset_index(name='visit_count')

    # 방문 횟수가 5번 이상인 시간대와 장소만 추출
    regular_hours = movement_pattern[movement_pattern['visit_count'] >= 5]['hour'].tolist()

    # 5번 이상 방문한 장소들만 선택
    frequent_locations = movement_pattern[movement_pattern['visit_count'] >= 5].to_dict(orient='records')

    return {
        "movement_pattern": movement_pattern.to_dict(orient='records'),
        "regular_hours": regular_hours,
        "regular_hours_locations": frequent_locations
    }


# 개별 subject_no 처리
def process_subject(subject_no):
    db = SessionLocal()
    gps_data = get_gps_data_with_display_no(db, subject_no)
    df = pd.DataFrame(gps_data,
                      columns=['subject_no', 'collected_time', 'latitude', 'longitude', 'display_no',
                               'initial_name'])  # initial_name 추가

    if df.empty:
        return None  # 데이터가 없는 경우 처리

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
    movement_pattern = analyze_movement_pattern(df)

    # 빈 값 처리 (None 또는 NaN -> 공백 처리)
    home_location = home_location if home_location is not None else ""
    outing_count = outing_count if outing_count is not None else ""
    total_outing_time = total_outing_time if total_outing_time is not None else ""

    # Stay locations과 Movement pattern에 대해 빈 값 처리
    stay_locations = stay_locations if stay_locations else []
    movement_pattern_data = movement_pattern.get("movement_pattern", [])
    regular_hours_locations = movement_pattern.get("regular_hours_locations", [])

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
        "stay_locations": stay_locations_grouped,  # 유사한 장소 그룹화된 리스트
        "movement_pattern": movement_pattern_data,
        "regular_hours_locations": regular_hours_locations
    }


# 병렬 처리 실행
@app.get("/gps-data")
def get_processed_gps_data(db: Session = Depends(get_db)):
    subjects = db.query(GpsData.subject_no).distinct().all()
    subject_nos = [subject[0] for subject in subjects]

    with ProcessPoolExecutor() as executor:
        results = list(executor.map(process_subject, subject_nos))

    return {"result": [res for res in results if res is not None]}
