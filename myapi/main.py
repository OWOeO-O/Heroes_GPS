from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, Float, DateTime
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

# DB에서 GPS 데이터 가져오기
def get_gps_data(db: Session, subject_no: int):
    gps_data = db.query(GpsData.subject_no, GpsData.collected_time, GpsData.latitude, GpsData.longitude)\
                 .filter(GpsData.subject_no == subject_no)\
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
    df['time_diff'] = df['collected_time'].diff().dt.total_seconds().fillna(0)
    stays = df[df['time_diff'] >= 180]
    stay_locations = stays.groupby(['latitude', 'longitude']).agg(
        total_time=('time_diff', 'sum'),
        visit_count=('latitude', 'count')
    ).reset_index()
    return stay_locations.to_dict(orient='records')

# 이동 시간의 규칙성 분석
def analyze_movement_pattern(df):
    df['hour'] = df['collected_time'].dt.hour
    movement_pattern = df.groupby('hour').size().reset_index(name='count')
    regular_hours = movement_pattern[movement_pattern['count'] > movement_pattern['count'].mean()]['hour'].tolist()
    return {
        "movement_pattern": movement_pattern.to_dict(orient='records'),
        "regular_hours": regular_hours
    }

# 각 subject_no 별로 분석을 병렬 처리로 개선
@app.get("/gps-data")
def get_processed_gps_data(db: Session = Depends(get_db)):
    subjects = db.query(GpsData.subject_no).distinct().all()
    subject_nos = [subject[0] for subject in subjects]

    # 병렬 처리
    with ProcessPoolExecutor() as executor:
        results = list(executor.map(process_subject, subject_nos))

    return {"result": results}

# 새로운 함수로 lambda 대체
def process_subject(subject_no):
    # 각 프로세스에서 새로 세션을 생성
    db = SessionLocal()
    gps_data = get_gps_data(db, subject_no)
    df = pd.DataFrame(gps_data, columns=['subject_no', 'collected_time', 'latitude', 'longitude'])
    df['collected_time'] = pd.to_datetime(df['collected_time'])

    # 이동 거리 계산
    group = df
    group['prev_latitude'] = group['latitude'].shift(1)
    group['prev_longitude'] = group['longitude'].shift(1)
    group['distance_km'] = group.apply(
        lambda row: haversine(row['prev_latitude'], row['prev_longitude'], row['latitude'], row['longitude'])
        if pd.notnull(row['prev_latitude']) else 0, axis=1
    )
    grouped = group.groupby(group['collected_time'].dt.date)['distance_km'].sum().reset_index()
    daily_distances = grouped[['collected_time', 'distance_km']].to_dict(orient='records')
    total_distance = grouped['distance_km'].sum()
    unique_dates = grouped['collected_time'].nunique()
    avg_distance = total_distance / unique_dates if unique_dates else 0

    # 집 위치, 휴일 외출 횟수 및 시간, 3분 이상 머문 장소(방문 횟수 포함), 이동 시간 규칙성
    home_location = get_home_location(group)
    outing_count, total_outing_time = calculate_holiday_outing(group)
    stay_locations = get_stay_locations(group)
    movement_pattern = analyze_movement_pattern(group)

    return {
        "subject_no": subject_no,
        "total_distance": total_distance,
        "unique_dates": unique_dates,
        "average_distance_per_day": avg_distance,
        "daily_distances": daily_distances,
        "home_location": home_location,
        "holiday_outing_count": outing_count,
        "total_holiday_outing_time": total_outing_time,
        "stay_locations": stay_locations,
        "movement_pattern": movement_pattern
    }