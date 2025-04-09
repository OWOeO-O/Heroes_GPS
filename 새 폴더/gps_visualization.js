document.addEventListener("DOMContentLoaded", () => {

    const displayNoElement = document.getElementById("display_no");
    const dataTimeRangeElement = document.getElementById("dataTimeRange");
    const categoryContainer = document.getElementById("categoryCheckboxContainer");
    const selectAllCheckbox = document.getElementById("selectAllCategories");
    let gpsData = [];

    // let filteredData = [...gpsData]; // 초기 데이터 복사
    const noDataMessage = document.getElementById("noDataMessage");
    const datePicker = document.getElementById("datePicker");

    // ✅ 초기 상태: CSV 파일 업로드 요청 메시지
    noDataMessage.innerText = "📡 데이터를 가져오는 중입니다...";

    if (!window.kakao || !window.kakao.maps) {
        console.error("🚨 카카오 지도 API가 로드되지 않았습니다! 스크립트 URL을 확인하세요.");
        return;
    }

    // 카카오 지도 생성
    const map = new kakao.maps.Map(document.getElementById("map"), {
        center: new kakao.maps.LatLng(35.8471032, 127.1410461),
        level: 5,
    });

    // 확대/축소 컨트롤 추가
    const zoomControl = new kakao.maps.ZoomControl();
    map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

    // 카테고리 마커 ON/OFF 상태 변수
    let categoryMarkersVisible = true;

    // 지도 요소들 관리
    let polylines = [];
    let markers = [];
    let labels = [];
    let categoryMarkers = [];
    // ✅ 선택된 카테고리 목록을 저장
    let tooltipOverlay = new kakao.maps.CustomOverlay({ content: "", position: null });

    // 장소 검색 서비스 객체
    const ps = new kakao.maps.services.Places();

    // ✅ 카카오 카테고리 코드 (업데이트된 전체 목록)
    const categoryCodes = [
        "MT1", "CS2", "PS3", "SC4", "PK6", "SW8", "BK9", "CT1",
        "PO3", "AT4", "AD5", "FD6", "CE7", "HP8", "PM9"
    ];

    // 카테고리 아이콘 URL
    const categoryIcons = {
        "MT1": "/img/gps/mart.png", // 대형마트 ⭕
        "CS2": "/img/gps/convenience.png", // 편의점⭕
        "PS3": "/img/gps/kindergarten.png", // 어린이집, 유치원
        "SC4": "/img/gps/school.png", // 학교 ⭕
        "AC5": "/img/gps/academy.png", // 학원 ⭕
        "PK6": "/img/gps/parking.png",  // 주차장⭕
        "OL7": "/img/gps/gas_station.png", // 주유소, 충전소⭕
        "SW8": "/img/gps/subway.png", // 지하철역⭕
        "BK9": "/img/gps/bank.png", // 은행⭕
        "CT1": "/img/gps/culture.png", // 문화시설⭕
        "PO3": "/img/gps/public_office.png", // 공공기관⭕
        "AT4": "/img/gps/tourist.png",  // 관광명소⭕
        "AD5": "/img/gps/hotel.png", // 숙박 ⭕
        "FD6": "/img/gps/restaurant.png", // 음식점⭕
        "CE7": "/img/gps/cafe.png", // 카페 ⭕
        "HP8": "/img/gps/hospital.png", // 병원⭕
        "PM9": "/img/gps/pharmacy.png", // 약국⭕
        "아파트": "/img/gps/apartment.png", //아파트⭕
    };

    let selectedCategories = new Set(Object.keys(categoryIcons)); // 기본값: 모든 카테고리 표시

    /** 📌 지도 초기화 (기존 마커, 선, 라벨 제거) */
    function clearMap() {
        markers.forEach(marker => marker.setMap(null));
        categoryMarkers.forEach(markerObj => markerObj.marker.setMap(null));
        polylines.forEach(polyline => polyline.setMap(null));
        labels.forEach(label => label.setMap(null));

        tooltipOverlay.setMap(null);

        markers.length = 0;
        categoryMarkers.length = 0;
        polylines.length = 0;
        labels.length = 0;
    }

    /**
     * GPS 데이터에 검정색 점 추가
     * @param {Array} data - GPS 데이터 배열 (latitude, longitude, collected_time 포함)
     */
    function addBlueDot(position) {
        const circle = new kakao.maps.Circle({
            center: position,
            radius: 1, // 반경 (픽셀)
            strokeWeight: 0, // 테두리 없음
            fillColor: "#000000", // 검정색
            fillOpacity: 0.8 // 투명도 조절
        });

        circle.setMap(map);
        markers.push(circle); // 제거할 수 있도록 저장
    }


    /**
     * 📌 GPS 경로 선 그리기 (속도에 따라 색상 다르게 표시)
     * @param {Array} data - GPS 데이터 배열 (latitude, longitude, collected_time 포함)
     */
    function drawPath(data) {
        if (!data || data.length < 2) return;

        clearMap(); // 🔥 기존 데이터 완전 제거

        for (let i = 0; i < data.length - 1; i++) {
            const point1 = data[i];
            const point2 = data[i + 1];

            const latLng1 = new kakao.maps.LatLng(point1.latitude, point1.longitude);
            const latLng2 = new kakao.maps.LatLng(point2.latitude, point2.longitude);

            // 두 지점 간 거리 (km)
            const distance = haversineDistance(
                point1.latitude, point1.longitude,
                point2.latitude, point2.longitude
            );

            // 두 지점 간 시간 차이 (초)
            const timeDiff = (new Date(point2.collected_time) - new Date(point1.collected_time)) / 1000;

            // 속도 계산 (km/h)
            const speed = timeDiff > 0 ? (distance / (timeDiff / 3600)) : 0;

            // 속도 기준으로 색상 설정 (4km/h 이하 초록, 초과 빨강)
            let color;
            if (speed <= 4) {
                color = "#0000FF"; // 💙 진한 파란색 (느린 걷기)
            } else if (speed > 4 && speed <= 12) {
                color = "#FF0000"; // 🔴 진한 빨간색 (보통~빠른 걷기)
            } else {
                color = "#CCCCCC"; // 🔘 흐린 회색 (주행: "걷기"와 무관, 눈에 안 띄게)
            }

            let polyline = new kakao.maps.Polyline({
                path: [latLng1, latLng2],
                strokeWeight: 5,
                strokeColor: color,
                strokeOpacity: 0.6,
                strokeStyle: "solid",
            });

            polyline.setMap(map);
            polylines.push(polyline); // 🔥 polyline 배열에 추가
        }

        fitMapToData(data); // 지도 영역 조정

        // 📌 Polyline 마우스 이벤트 활성화
        enablePolylineTimeTooltip();
    }

    let frequentCircle = null;
    function drawFrequentVisitCircle(gpsData, filterStart, filterEnd, intervalMinutes = 30) {
        if (!gpsData || gpsData.length === 0) return;

        const groupMap = new Map();

        // 시간 문자열을 분으로 변환
        const startMinutes = parseTime(filterStart);
        const endMinutes = parseTime(filterEnd);

        // 주어진 시간 범위 내에 있는지 확인
        function isInTimeRange(mins, start, end) {
            if (start <= end) {
                return mins >= start && mins <= end; // 간단한 시간 범위 처리
            } else {
                return mins >= start || mins <= end; // 자정 넘는 시간 처리
            }
        }

        const filteredPoints = [];

        // 30분 간격으로 GPS 데이터 필터링
        const filteredByInterval = filterDataByInterval(gpsData, intervalMinutes);

        filteredByInterval.forEach(point => {
            const lat = parseFloat(point.latitude);
            const lng = parseFloat(point.longitude);
            if (isNaN(lat) || isNaN(lng)) return;

            const time = new Date(point.collected_time);
            const hours = time.getUTCHours() + 9; // KST 보정 (UTC -> KST)
            const minutes = time.getUTCMinutes();
            const timeMinutes = (hours % 24) * 60 + minutes; // 시간을 분 단위로 변환 (자정 넘는 시간 처리)

            // 해당 시간대가 필터 범위에 포함되는지 확인
            if (!isInTimeRange(timeMinutes, startMinutes, endMinutes)) return;

            filteredPoints.push(point);

            const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
            if (!groupMap.has(key)) {
                groupMap.set(key, { count: 1, latSum: lat, lngSum: lng });
            } else {
                const g = groupMap.get(key);
                g.count += 1;
                g.latSum += lat;
                g.lngSum += lng;
            }
        });

        console.log(`✅ ${filterStart} ~ ${filterEnd} GPS 데이터 필터링`);
        console.log("총 GPS 포인트:", gpsData.length);
        console.log("⏱️ 필터 후 포인트:", filteredPoints.length);

        if (filteredPoints.length === 0 || groupMap.size === 0) {
            console.warn("⚠️ 이 시간대에는 GPS 포인트가 없습니다.");
            return;
        }

        // 그룹화된 위치 중 가장 빈도 높은 그룹 찾기
        const sortedGroups = [...groupMap.entries()].sort((a, b) => b[1].count - a[1].count);
        const mostFrequent = sortedGroups[0];
        const group = mostFrequent[1];
        const centerLat = group.latSum / group.count;
        const centerLng = group.lngSum / group.count;
        const center = new kakao.maps.LatLng(centerLat, centerLng);

        // 이전 원이 있으면 삭제
        if (frequentCircle) frequentCircle.setMap(null);

        // 새로운 원 그리기
        frequentCircle = new kakao.maps.Circle({
            center: center,
            radius: 50,
            strokeWeight: 2,
            strokeColor: '#FF6347',
            strokeOpacity: 0.8,
            fillColor: '#FF6347',
            fillOpacity: 0.4
        });

        frequentCircle.setMap(map);

        console.log("⭐️ 가장 빈도 높은 위치 그룹:", mostFrequent[0], "빈도:", group.count);
    }

// 30분 간격으로 필터링된 GPS 데이터를 반환
    function filterDataByInterval(data, intervalMinutes) {
        const result = [];
        let lastTimestamp = null;

        data.forEach(point => {
            const time = new Date(point.collected_time);
            const timeMinutes = time.getUTCHours() * 60 + time.getUTCMinutes(); // 시간을 분 단위로 변환

            if (!lastTimestamp || timeMinutes - lastTimestamp >= intervalMinutes) {
                result.push(point);
                lastTimestamp = timeMinutes;
            }
        });

        return result;
    }

    function parseTime(timeStr) {
        if (!timeStr || !timeStr.includes(':')) return 0;
        const [hour, minute] = timeStr.split(":").map(Number);
        return hour * 60 + minute;  // 시간과 분을 분 단위로 변환
    }


    /**
     * 📌 마커 및 라벨 추가
     *
     * 주어진 위치에 마커와 라벨을 추가하고, 마우스 오버 시 툴팁과 강조 표시
     *
     * @param {kakao.maps.LatLng} position - 마커를 표시할 지도상의 좌표 (위도, 경도)
     * @param {number} label - 마커의 번호
     * @param {string} time - 마커에 해당하는 GPS 데이터의 수집 시간
     * @returns {kakao.maps.Marker} - 생성된 카카오 맵 마커 객체를 반환
     */
    function addMarker(position, label, time) {
        // ✅ 기본 마커와 강조 마커 이미지 설정
        const markerIcons = {
            normal: new kakao.maps.MarkerImage(
                "../img/gps/marker_default.png", // 기본 마커 이미지
                new kakao.maps.Size(32, 32), // 크기 설정
                { offset: new kakao.maps.Point(16, 32) } // 중심 좌표
            ),
            highlight: new kakao.maps.MarkerImage(
                "../img/gps/marker_highlight.png", // 강조 마커 이미지
                new kakao.maps.Size(38, 38), // 강조 시 크기 증가
                { offset: new kakao.maps.Point(19, 38) }
            )
        };

        // ✅ 마커 생성
        const marker = new kakao.maps.Marker({
            position,
            map,
            image: markerIcons.normal, // 기본 마커
        });
        markers.push(marker);

        // ✅ 라벨 스타일 개선 (더 크고 가독성 좋게)
        const customOverlay = new kakao.maps.CustomOverlay({
            position,
            content: `<div class="marker-label">#${label}</div>`, // ✅ 새로운 스타일 적용
            yAnchor: 2.5, // ✅ 기존보다 라벨을 위쪽에 배치
        });
        customOverlay.setMap(map);
        labels.push(customOverlay);

        // 기존 툴팁 표시 여부 확인
        let isTooltipVisible = false;

        // 마커 마우스 오버 이벤트 (툴팁 깜빡임 방지)
        kakao.maps.event.addListener(marker, "mouseover", () => {
            if (!isTooltipVisible) {
                const formattedTime = formatCollectedTime(time);
                showTooltip(position, `시간: ${formattedTime}`);
                isTooltipVisible = true;
                marker.setImage(markerIcons.highlight); // 강조 이미지 변경
            }
        });

        // 마우스 아웃 시 툴팁 숨김 (약간의 지연 추가)
        kakao.maps.event.addListener(marker, "mouseout", () => {
            setTimeout(() => {
                hideTooltip();
                isTooltipVisible = false;
                marker.setImage(markerIcons.normal);
            }, 500); // 0.1초 후 제거하여 깜빡임 방지
        });
        return marker;
    }

    /**
     * 📌 툴팁 표시
     * @param {kakao.maps.LatLng} position - 툴팁을 표시할 지도상의 좌표 (위도, 경도)
     * @param {string} content - 툴팁에 표시할 HTML 형식의 내용
     */
    function showTooltip(position, content) {
        if (!tooltipOverlay) {
            tooltipOverlay = new kakao.maps.CustomOverlay({ content: "", position: null });
        }

        const offsetY = 30; // ✅ 툴팁을 위로 30px 올림
        const newPosition = new kakao.maps.LatLng(
            position.getLat() + offsetY * 0.00001, // 🔥 LatLng 좌표 직접 조정
            position.getLng()
        );

        tooltipOverlay.setContent(`
            <div style="background: white; padding: 5px; border: 1px solid #333; border-radius: 5px; box-shadow: 2px 2px 5px rgba(0,0,0,0.3);">
                ${content}
            </div>
        `);
        tooltipOverlay.setPosition(newPosition);
        tooltipOverlay.setMap(map);
    }

    /** 📌 툴팁 숨김 */
    function hideTooltip() {
        tooltipOverlay.setMap(null);
    }

    /**
     * 📌 30분 간격 데이터 필터링
     * @param {Array} data - 원본 GPS 데이터 배열
     * @param {number} [intervalMinutes=30] - 필터링할 시간 간격
     * @returns {Array} 필터링된 GPS 데이터 배열 (각 시간 간격마다 하나의 데이터만 포함)
     */
    function filterDataByInterval(data, intervalMinutes = 30) {
        const result = [];
        let lastTime = null;
        const sortedData = data.sort((a, b) => new Date(a.collected_time) - new Date(b.collected_time));

        sortedData.forEach(point => {
            const currentTime = new Date(point.collected_time);
            if (!lastTime || currentTime - lastTime >= intervalMinutes * 60 * 1000) {
                result.push(point);
                lastTime = currentTime;
            }
        });
        return result;
    }



    /**
     * 📌 지도 자동 이동 및 줌 설정
     * @param {Array} data - GPS 데이터 배열
     */
    function fitMapToData(data) {
        if (!data || data.length === 0) return;
        const bounds = new kakao.maps.LatLngBounds();
        data.forEach(({ latitude, longitude }) => bounds.extend(new kakao.maps.LatLng(latitude, longitude)));
        map.setBounds(bounds);
    }

    /**
     * 📌 GPS 경로 및 마커 추가
     * @param {Array} data - GPS 데이터 배열
     */
    function drawPathAndMarkers(data) {
        clearMap();
        drawPath(data);

        const markerList = document.getElementById("markerList");
        markerList.innerHTML = "";

        let fragment = document.createDocumentFragment(); // ✅ DOM 조작 최소화

        // ✅ 모든 GPS 데이터에 검정색 점 추가 (이동하면서 마커 추가)
        data.forEach(point => {
            addBlueDot(new kakao.maps.LatLng(point.latitude, point.longitude));
        });

        // ✅ 마커는 30분 간격으로 추가하여 성능 최적화
        const filteredData = filterDataByInterval(data, 30);

        filteredData.forEach((point, index) => {
            const position = new kakao.maps.LatLng(point.latitude, point.longitude);
            const marker = addMarker(position, index + 1, point.collected_time);

            const dateObj = new Date(point.collected_time);

            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, "0"); // JS에서 월은 0부터 시작
            const day = String(dateObj.getDate()).padStart(2, "0");
            const localHours = dateObj.getHours(); // UTC 기준 시간
            const minutes = String(dateObj.getMinutes()).padStart(2, "0");

            // ✅ AM/PM 판별
            const ampm = localHours >= 12 ? "PM" : "AM";

            // ✅ 12시간제로 변환 (0시는 12 AM, 12시는 12 PM 유지)
            let hours = localHours % 12;
            hours = hours ? hours : 12; // 0시는 12로 변경

            // ✅ 변환된 시간 문자열 (년-월-일 시:분 AM/PM)
            const formattedTime = `${year}-${month}-${day} ${hours}:${minutes} ${ampm}`;

            // ✅ 리스트 아이템 생성 및 시간 추가
            const listItem = document.createElement("li");
            listItem.textContent = `마커 ${index + 1} (${hours}:${minutes} ${ampm})`;

            // 📌 마우스 오버 시 툴팁 표시 (변환된 시간 적용)
            listItem.addEventListener("mouseover", () => {
                marker.setImage(new kakao.maps.MarkerImage(
                    "/img/gps/marker_highlight.png",
                    new kakao.maps.Size(48, 48),
                    { offset: new kakao.maps.Point(20, 45) }
                ));
                map.panTo(position);
                const formattedTime = formatCollectedTime(point.collected_time);
                showTooltip(position, `시간: ${formattedTime}`);
            });

            listItem.addEventListener("mouseout", () =>{
                marker.setImage(new kakao.maps.MarkerImage(
                    "/img/gps/marker_default.png",
                    new kakao.maps.Size(32, 32),
                    { offset: new kakao.maps.Point(16, 32) }
                ));
                hideTooltip();
            });
            fragment.appendChild(listItem); // ✅ 리스트 아이템 한꺼번에 추가
        });
        markerList.appendChild(fragment); // ✅ DOM 업데이트 한 번만 실행
        fitMapToData(filteredData);
    }

    /**
     * 📌 Polyline 위에서 마우스 오버 시 시간 표시
     */
    function enablePolylineTimeTooltip() {
        polylines.forEach((polyline, index) => {
            kakao.maps.event.addListener(polyline, "mousemove", function (event) {
                const latLng = event.latLng;

                const nearestPoint = getNearestPoint(latLng, gpsData);

                if (nearestPoint) {
                    const formattedTime = formatCollectedTime(nearestPoint.time);

                    showTooltip(latLng, `시간: ${formattedTime}`);
                }else {
                    console.warn("🚨 가장 가까운 지점을 찾을 수 없음");
                }
            });

            kakao.maps.event.addListener(polyline, "mouseout", function () {
                setTimeout(() => {
                    hideTooltip();
                }, 1000); // 🔥 1초 후 툴팁 숨기기
            });
        });
    }

    /**
     * 📌 특정 위치(latLng)와 가장 가까운 GPS 데이터 찾기
     * @param {kakao.maps.LatLng} targetLatLng - 마우스를 오버한 좌표
     * @param data @param {Array} data - 비교할 GPS 데이터 배열
     * @returns {Object|null} - 가장 가까운 GPS 데이터 객체
     */
    function getNearestPoint(targetLatLng, data) {
        if (!data || data.length === 0) {
            console.warn("🚨 GPS 데이터가 없음");
            return null;
        }

        let nearestPoint = null;
        let minDistance = Infinity;

        data.forEach(({ latitude, longitude, collected_time }) => {
            if (isNaN(latitude) || isNaN(longitude)) {
                console.warn("🚨 NaN 좌표 발견, 거리 계산 제외:", { latitude, longitude });
                return;
            }

            const distance = haversineDistance(
                targetLatLng.getLat(),
                targetLatLng.getLng(),
                latitude,
                longitude
            );

            if (distance < minDistance) {
                minDistance = distance;
                nearestPoint = {
                    latLng: new kakao.maps.LatLng(latitude, longitude),
                    time: collected_time,
                };
            }
        });

        if (!nearestPoint) {
            console.warn("🚨 가장 가까운 GPS 데이터를 찾을 수 없음");
        } else {

        }

        return nearestPoint;
    }

    /**
     * 📌 두 좌표(lat, lng) 간 거리 계산 (하버사인 공식)
     * @param {number} lat1 - 첫 번째 좌표의 위도
     * @param {number} lng1 - 첫 번째 좌표의 경도
     * @param {number} lat2 - 두 번째 좌표의 위도
     * @param {number} lng2 - 두 번째 좌표의 경도
     * @returns {number} - 두 좌표 간 거리
     */
    function haversineDistance(lat1, lng1, lat2, lng2) {
        if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) {

            return Infinity; // NaN 값이 있으면 무한대 반환
        }

        const toRad = (value) => (value * Math.PI) / 180;
        const R = 6371; // 지구 반지름 (km)

        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        const distance = R * c; // 거리 (km)

        return distance;
    }

    /**
     * 📌 하루 단위 이동 거리 계산 (GPS 튐 방지)
     *
     * 주어진 GPS 데이터를 이용하여 하루 동안 이동한 총 거리를 계산.
     *
     * @param {Array} gpsData - GPS 데이터 배열
     * @returns {string} - 계산된 총 이동 거리
     */
    function calculateDailyDistance(gpsData) {
        if (!gpsData || gpsData.length < 2) {
            console.warn("🚨 GPS 데이터가 부족하여 이동 거리를 계산할 수 없습니다.");
            return "데이터 없음";
        }

        let totalDistance = 0;
        const MIN_DISTANCE_THRESHOLD = 5; // 🔥 5m 이하 이동은 무시
        const MIN_TIME_THRESHOLD = 30; // 🔥 30초 이하 데이터는 무시

        for (let i = 1; i < gpsData.length; i++) {
            const prevPoint = gpsData[i - 1];
            const currentPoint = gpsData[i];

            const distance = haversineDistance(
                parseFloat(prevPoint.latitude), parseFloat(prevPoint.longitude),
                parseFloat(currentPoint.latitude), parseFloat(currentPoint.longitude)
            ) * 1000; // km → m 변환

            const timeDiff = (new Date(currentPoint.collected_time) - new Date(prevPoint.collected_time)) / 1000; // 초 단위

            // ✅ 너무 짧은 거리 이동 또는 짧은 시간 간격이면 무시
            if (distance < MIN_DISTANCE_THRESHOLD || timeDiff < MIN_TIME_THRESHOLD) {
                continue;
            }

            totalDistance += distance;
        }

        return (totalDistance / 1000).toFixed(2) + " km"; // km 단위 변환
    }

    /**
     * 📌 하루 이동 거리 UI에 표시 ✅
     * @param {Array} gpsData - GPS 데이터 배열
     */
    function displayDailyDistance(gpsData) {
        const distanceElement = document.getElementById("dailyDistance");

        if (!distanceElement) {
            console.error("🚨 dailyDistance 요소를 찾을 수 없습니다! HTML을 확인하세요.");
            return;
        }

        const dailyDistance = calculateDailyDistance(gpsData);

        // 🚀 UI 업데이트 확실히 적용하기 위해 requestAnimationFrame 사용
        requestAnimationFrame(() => {
            distanceElement.innerHTML = `<strong>📊 하루 이동 거리:</strong> ${dailyDistance}`;
        });

        console.log("✅ 하루 이동 거리 갱신 완료:", dailyDistance);
    }

    let apiCallCount = 0;

    /**
     * 📌 특정 GPS 데이터 반경 30m 이내에서 카테고리 검색 (비동기 병렬 처리)
     * 📌 병렬적으로 GPS 데이터의 모든 카테고리 검색
     *
     * - 사용자의 GPS 데이터 위치를 기준으로 반경 내 지정된 카테고리(마트, 편의점, 지하철 등) 장소를 검색하여 지도에 표시.
     * - 카테고리별 검색을 병렬적으로 실행하여 빠른 처리 가능.
     * - GPS 좌표를 클러스터링하여 중복 요청을 방지하고 최적화된 API 호출 수행.
     * - "아파트" 카테고리는 카테고리 검색이 아닌 키워드 검색을 사용하여 조회.
     *
     * @param {Array} gpsData - GPS 데이터 배열
     * @returns {Promise<void>} - 비동기 처리 함수
     */
    async function searchCategoryNearGPSData(gpsData) {
        if (!categoryMarkersVisible || !gpsData.length) return;

        categoryMarkers.forEach(markerObj => markerObj.marker.setMap(null)); // 기존 마커 제거
        categoryMarkers = [];

        apiCallCount = 0; // ✅ API 호출 카운트 초기화

        if (selectedCategories.size === 0) return;

        const places = new kakao.maps.services.Places();
        const groupedGPSData = clusterGPSData(gpsData, 0.15);

        groupedGPSData.forEach(gpsGroup => {
            if (isNaN(gpsGroup.latitude) || isNaN(gpsGroup.longitude)) {

                return;
            }

            const gpsPosition = new kakao.maps.LatLng(gpsGroup.latitude, gpsGroup.longitude);

            selectedCategories.forEach(category => {
                // 🔥 "아파트"는 categorySearch 대신 keywordSearch 사용
                if (category === "아파트") {
                    places.keywordSearch("아파트", (data, status) => {
                        if (status === kakao.maps.services.Status.OK) {
                            addCategoryMarkersWithinRadius(data, gpsPosition, "아파트");
                        }

                    }, { location: gpsPosition, radius: 150 });
                } else {
                    places.categorySearch(category, (data, status) => {
                        if (status === kakao.maps.services.Status.OK) {
                            addCategoryMarkersWithinRadius(data, gpsPosition, category);
                        }

                    }, { location: gpsPosition, radius: 150 });
                }
            });
            apiCallCount++;
        });
        console.log(`🎯 최종 카카오 API 호출 횟수: ${apiCallCount}회`);
    }

    /**
     * 📌 GPS 데이터 좌표들을 주어진 반경 내에서 클러스터링하여 대표 좌표를 계산(100M)
     * - GPS 데이터 포인트들을 주어진 반경 내에서 묶어 하나의 대표 좌표를 생성.
     * - 클러스터링을 통해 중복된 위치 데이터를 줄이고, 검색 성능을 최적화.
     *
     * @param {Array} gpsData - GPS 데이터 배열
     * @param {number} clusterRadius - 클러스터 반경 (기본값: 0.1km = 100m)
     * @returns {Array} - 클러스터링된 GPS 데이터 배열
     */
    function clusterGPSData(gpsData, clusterRadius = 0.1) {
        const clusteredData = [];
        const used = new Set();

        for (let i = 0; i < gpsData.length; i++) {
            if (used.has(i)) continue;

            const current = gpsData[i];

            // 🚨 NaN 좌표 필터링 추가
            if (isNaN(current.latitude) || isNaN(current.longitude)) {
                console.warn("🚨 NaN 좌표 발견 (클러스터링 제외):", current);
                continue;
            }

            let latSum = current.latitude;
            let lngSum = current.longitude;
            let count = 1;

            for (let j = i + 1; j < gpsData.length; j++) {
                if (used.has(j)) continue;

                const other = gpsData[j];
                if (isNaN(other.latitude) || isNaN(other.longitude)) continue; // 🚨 NaN 좌표 건너뛰기

                const distance = haversineDistance(current.latitude, current.longitude, other.latitude, other.longitude);

                if (distance <= clusterRadius) {
                    latSum += other.latitude;
                    lngSum += other.longitude;
                    count++;
                    used.add(j);
                }
            }

            clusteredData.push({
                latitude: latSum / count,
                longitude: lngSum / count
            });
        }

        return clusteredData;
    }

    /**
     * 📌 반경 30m 내의 장소만 카테고리 마커로 추가
     * -GPS 좌표를 중심으로 반경 `maxDistance` 내의 카테고리 장소를 필터링하여 지도에 마커 추가
     *
     * @param {Array} places - 카카오 장소 검색 API에서 반환된 장소 데이터 배열
     * @param {Object} gpsPosition - 기준이 되는 GPS 좌표 (`kakao.maps.LatLng` 객체)
     * @param {string} category - 선택된 장소 카테고리
     * @param {number} [maxDistance=30] - 마커를 추가할 최대 거리
     */
    function addCategoryMarkersWithinRadius(places, gpsPosition, category, maxDistance = 30) {
        if (!categoryMarkersVisible || !selectedCategories.has(category)) return;

        const iconUrl = categoryIcons[category] || "/img/gps/default.png";

        places.forEach(place => {
            const position = new kakao.maps.LatLng(place.y, place.x);
            const distance = haversineDistance(gpsPosition.getLat(), gpsPosition.getLng(), place.y, place.x) * 1000;

            if (distance <= maxDistance) {
                const marker = new kakao.maps.Marker({
                    map: map,
                    position: position,
                    image: new kakao.maps.MarkerImage(iconUrl, new kakao.maps.Size(48, 48), { offset: new kakao.maps.Point(25, 50) }),
                });

                categoryMarkers.push({ marker, category });

                const infowindow = new kakao.maps.InfoWindow({
                    content: `<div style="padding:8px; font-size:12px; max-width:250px; min-width:150px;
                    word-wrap:break-word; white-space:normal; background:white; border-radius: 8px;
                    border:1px solid #666; box-shadow: 2px 2px 5px rgba(0,0,0,0.3);">
                    <strong>(${getCategoryName(category)}) ${place.place_name}</strong><br>${place.road_address_name || place.address_name}
                </div>`,
                });

                kakao.maps.event.addListener(marker, "mouseover", () => infowindow.open(map, marker));
                kakao.maps.event.addListener(marker, "mouseout", () => infowindow.close());
            }
        });
    }

    // ✅ 범례 요소 가져오기
    const legend = document.getElementById("legend");
    let legendTimeout;

    /**
     * 📌 Legend (범례) 표시 함수
     * @param {number} [duration=5000] - 범례를 표시할 시간
     */
    function showLegend(duration = 5000) {
        legend.style.display = "block"; // 보이게 설정
        clearTimeout(legendTimeout);
        legendTimeout = setTimeout(() => {
            legend.style.display = "none"; // 일정 시간 후 숨김
        }, duration);
    }

    /** 📌 초기 상태: 메시지 표시 */
    noDataMessage.style.display = "block";

    /**
     * ✅ Debounce 함수 추가 (짧은 시간 내 API 호출 방지)
     * @param {Function} func - 지연 후 실행할 함수 (예: API 요청 함수)
     * @param {number} [delay=500] - 디바운스 시간
     * @returns {Function} - 지정된 시간 후 실행될 함수
     */
    function debounce(func, delay = 500) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // ✅ Debounce 적용
    const debouncedFetchGpsData = debounce(fetchGpsData, 500);

    /** 📌 날짜 선택 시 해당 날짜 데이터만 지도에 표시 */
    datePicker.addEventListener("change", function () {
        const selectedDate = datePicker.value;
        if (!selectedDate) return;


        debouncedFetchGpsData(subjectNo, selectedDate); // ✅ Debounce 적용된 함수 호출
    });

    /**
     * ✅ 시간 변환 함수 (요일 포함)
     * @param {string} collectedTime - 변환할 원본 시간
     * @returns {string} - 변환된 날짜 및 시간
     */
    function formatCollectedTime(collectedTime) {
        const dateObj = new Date(collectedTime);

        // ✅ 요일 변환 (JS 요일 배열 사용)
        const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
        const dayOfWeek = weekdays[dateObj.getDay()]; // ✅ getUTCDay() → getDay() 변경 (로컬 시간 기준)

        // ✅ 년-월-일
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, "0"); // ✅ 월(0부터 시작) 보정
        const day = String(dateObj.getDate()).padStart(2, "0");

        // ✅ 24시간제 → 12시간제 변환
        const hours = dateObj.getHours();
        const minutes = String(dateObj.getMinutes()).padStart(2, "0");

        // ✅ AM/PM 판별 및 변환
        const ampm = hours >= 12 ? "PM" : "AM";
        const formattedHours = hours % 12 || 12; // ✅ 0시는 12 AM, 12시는 12 PM 유지

        return `${year}-${month}-${day} (${dayOfWeek}) ${formattedHours}:${minutes} ${ampm}`;
    }

    /** 📌 "전체 선택" 체크박스 이벤트 리스너 */
    selectAllCheckbox.addEventListener("change", function () {
        const checkboxes = categoryContainer.querySelectorAll("input[type='checkbox']");
        checkboxes.forEach(cb => {
            cb.checked = this.checked;
            if (this.checked) {
                selectedCategories.add(cb.value);
            } else {
                selectedCategories.delete(cb.value);
            }
        });

        updateCategoryMarkers();
    });

    /**
     * 📌 기존 카테고리 체크박스 변경 이벤트 핸들러 수정
     * @param {Event} event - 체크박스 변경 이벤트 객체
     */
    function handleCategoryCheckboxChange(event) {
        const category = event.target.value;
        const isChecked = event.target.checked;

        if (isChecked) {
            selectedCategories.add(category);
        } else {
            selectedCategories.delete(category);
        }

        // ✅ "전체 선택" 체크박스 상태 업데이트
        const checkboxes = categoryContainer.querySelectorAll("input[type='checkbox']");
        const allChecked = [...checkboxes].every(cb => cb.checked);
        selectAllCheckbox.checked = allChecked;

        // ✅ 선택된 카테고리의 마커만 표시
        updateCategoryMarkers();
    }

    /** 📌 선택된 카테고리에 해당하는 마커만 보이도록 업데이트 */
    function updateCategoryMarkers() {
        categoryMarkers.forEach(({ marker, category }) => {
            if (selectedCategories.has(category)) {
                marker.setMap(map); // ✅ 선택된 카테고리만 지도에 표시
            } else {
                marker.setMap(null); // ❌ 선택되지 않은 카테고리는 숨김
            }
        });
    }

    /**
     * 📌 선택된 카테고리의 마커만 보이기/숨기기
     * @param {string} category - 표시하거나 숨길 카테고리 코드
     * @param {boolean} show - true면 마커를 보이고, false면 숨김
     */
    function toggleCategoryMarkers(category, show) {
        if (show) {
            selectedCategories.add(category);
        } else {
            selectedCategories.delete(category);
        }

        categoryMarkers.forEach(markerObj => {
            if (markerObj.category === category) {
                markerObj.marker.setMap(show ? map : null);
            }
        });

        // ✅ 체크박스 변경 시 카테고리 마커 다시 로드
        searchCategoryNearGPSData(gpsData);
    }

    searchCategoryNearGPSData(gpsData);

    /** 📌 카테고리 체크박스 생성 */
    function createCategoryCheckboxes() {
        categoryContainer.innerHTML = ""; // 기존 체크박스 초기화

        Object.keys(categoryIcons).forEach(category => {
            const label = document.createElement("label");
            label.style.marginRight = "10px";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = category;
            checkbox.checked = selectedCategories.has(category); // ✅ 선택된 카테고리 유지
            checkbox.addEventListener("change", handleCategoryCheckboxChange);

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${getCategoryName(category)}`));
            categoryContainer.appendChild(label);
        });

        // ✅ "전체 선택" 체크박스 초기화
        selectAllCheckbox.checked = true;
    }

    /**
     * 📌 카테고리 코드에 맞는 한글 이름 반환
     * @param {string} categoryCode - 카카오맵 API에서 제공하는 카테고리 코드
     * @returns {string} 해당 카테고리의 한글 이름
     */
    function getCategoryName(categoryCode) {
        const categoryNames = {
            "MT1": "대형마트", "CS2": "편의점", "PS3": "어린이집/유치원", "SC4": "학교",
            "AC5": "학원", "PK6": "주차장", "OL7": "주유소", "SW8": "지하철역",
            "BK9": "은행", "CT1": "문화시설", "PO3": "공공기관", "AT4": "관광명소",
            "AD5": "숙박", "FD6": "음식점", "CE7": "카페", "HP8": "병원",
            "PM9": "약국", "아파트": "아파트"
        };
        return categoryNames[categoryCode] || categoryCode;
    }

    createCategoryCheckboxes();  // 📌 체크박스 생성 실행

    /**
     * 📌 subject_no 가져오기
     * @param {string} param - subject_no 쿼리 파라미터
     * @returns {string|null} subject_no 파라미터의 값
     */
    function getQueryParam(param) {
        let urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    }

    // ✅ URL에서 subject_no 추출
    const subjectNo = getQueryParam("subject_no");

    if (!subjectNo) {
        alert("🚨 대상자 정보가 없습니다. URL을 확인해주세요!");
    }

    // 📌 시작 날짜: 2021-01-01
    const startDate = "2024-01-01";

    // 📌 종료 날짜: 오늘 날짜 (YYYY-MM-DD 형식)
    const today = new Date();
    const endDate = today.getFullYear() + "-" +
        String(today.getMonth() + 1).padStart(2, '0') + "-" +
        String(today.getDate()).padStart(2, '0');

    let availableDates = [];

    //가능한 날짜만 불러오기
    let initialDisplayNo = "N/A"; // ✅ 최초 대상자 ID 저장
    let initialDataTimeRange = "N/A"; // ✅ 최초 데이터 수집 시간 저장

    /**
     * 📌 사용 가능한 날짜 불러오기
     * -사용 가능한 GPS 데이터가 존재하는 날짜 목록을 API에서 가져옴.
     * @param {string} subjectNo - 대상자의 고유 번호 (subject_no)
     * @param {string} startDate - 조회할 데이터의 시작 날짜 (YYYY-MM-DD 형식)
     * @param {string} endDate - 조회할 데이터의 종료 날짜 (YYYY-MM-DD 형식)
     * @returns {Promise<string[]>} 사용 가능한 날짜 목록을 포함하는 Promise 객체
     */
    function fetchAvailableDates(subjectNo, startDate, endDate) {
        const apiUrl = `https://heroes.mindheal.today/api/data/gps/available-dates?subject_no=${subjectNo}&start_date=${startDate}&end_date=${endDate}`;

        return fetch(apiUrl, {
            method: "GET",
            headers: {
                "Authorization": "Bearer " + sessionStorage.getItem("token"),
                "Content-Type": "application/json"
            },
            mode: "cors"
        })
            .then(response => response.json())
            .then(data => {
                if (!data.available_dates || data.available_dates.length === 0) {
                    alert("🚨 사용 가능한 GPS 데이터가 없습니다.");
                    dataTimeRangeElement.textContent = "데이터 없음";
                    return [];
                }



                // ✅ 대상자 ID가 있으면 초기값 저장
                if (data.display_no) {
                    initialDisplayNo = data.display_no; // 🔥 최초 대상자 ID 저장
                    displayNoElement.textContent = initialDisplayNo;

                } else {
                    displayNoElement.textContent = "N/A";
                }

                // ✅ 데이터 수집 시간 초기값 저장 (최소~최대 날짜)
                if (data.available_dates.length > 0) {
                    const minDate = data.available_dates[0]; // 가장 빠른 날짜
                    const maxDate = data.available_dates[data.available_dates.length - 1]; // 가장 늦은 날짜
                    initialDataTimeRange = `${minDate} ~ ${maxDate}`; // 🔥 최초 시간 저장
                    dataTimeRangeElement.textContent = initialDataTimeRange;
                } else {
                    dataTimeRangeElement.textContent = "데이터 없음";
                }

                return data.available_dates;
            })
            .catch(error => {
                console.error("🚨 GPS 날짜 리스트 가져오기 실패:", error);
                dataTimeRangeElement.textContent = "🚨 오류 발생";
                return [];
            });
    }

    // ✅ 단 한 번 실행되도록 보장
    fetchAvailableDates(subjectNo, startDate, endDate).then(availableDates => {
        if (availableDates.length > 0) {
            initializeDatePicker(availableDates);
        } else {
            console.warn("📅 사용 가능한 날짜가 없습니다.");
        }
    });

    /**
     * 📌 대상자 ID 및 데이터 수집 시간 업데이트 함수 추가
     * - GPS 데이터(`gpsData`)를 기반으로 대상자의 display_no와 데이터 수집 시간을 화면에 표시
     * @param {Array} gpsData - 대상자의 GPS 데이터 배열
     */
    function updateInfoDisplay(gpsData) {
        if (!gpsData || gpsData.length === 0) {
            console.warn("🚨 GPS 데이터가 없습니다.");
            displayNoElement.textContent = "N/A";
            dataTimeRangeElement.textContent = "데이터 없음";
            return;
        }

        // ✅ 대상자 ID (API에서 받은 `no` 값)
        displayNoElement.textContent = gpsData[0].no ? gpsData[0].no : "N/A";


        // ✅ 수집 시간 (최소~최대 찾기)
        const sortedData = gpsData.sort((a, b) => new Date(a.collected_time) - new Date(b.collected_time));
        const startTime = formatCollectedTime(sortedData[0].collected_time);
        const endTime = formatCollectedTime(sortedData[sortedData.length - 1].collected_time);

        dataTimeRangeElement.textContent = `${startTime} ~ ${endTime}`;

    }

    let gpsDataCache = {};

    /**
     * 📌 GPS 데이터 불러오기
     * - 주어진 `subjectNo`(대상자 번호)와 `selectedDate`(선택한 날짜)를 사용하여 GPS 데이터를 가져옴.
     * - 동일한 요청을 반복하지 않도록 `sessionStorage`에 데이터를 캐싱하여 저장하고, 캐시된 데이터가 있으면 API 호출을 생략하고 즉시 사용.
     * - GPS 데이터를 기반으로 다음 기능을 수행:
     *   1. `findHomeLocation(gpsData)`: 집 위치 자동 설정
     *   2. `updateVisualization(gpsData)`: 지도에 경로 및 마커 표시
     *   3. `displayDailyDistance(gpsData)`: 하루 이동 거리 계산 및 UI 업데이트
     *   4. `analyzeHomeStayAndOutings(gpsData, selectedDate)`: Home Stay(집 머문 시간) 및 외출 횟수 분석
     * - 데이터를 가져오는 동안 UI에 "데이터를 가져오는 중" 메시지를 표시하고, 오류 발생 시 경고 메시지를 출력함.
     *
     * ✅ 날짜 선택 후, 해당 날짜의 데이터만 가져와서 지도에 표시
     * @param {string} subjectNo - 대상자의 고유 식별 번호
     * @param {string} selectedDate - 선택한 날짜
     * @returns {Promise<void>} - 비동기 함수로, 데이터를 가져와 지도 및 UI를 업데이트함
     */
    async function fetchGpsData(subjectNo, selectedDate) {
        const cacheKey = `${subjectNo}_${selectedDate}`;

        // ✅ 캐시된 데이터가 있을 경우 바로 사용
        if (sessionStorage.getItem(cacheKey)) {
            gpsData = JSON.parse(sessionStorage.getItem(cacheKey));

            findHomeLocation(gpsData); // 🏠 집 위치 설정 ✅
            updateVisualization(gpsData);
            drawFrequentVisitCircle(gpsData);
            fetchAndDrawFrequentCircle(gpsData);
            displayDailyDistance(gpsData); // ✅ 하루 이동 거리 갱신
            analyzeHomeStayAndOutings(gpsData, selectedDate); // ✅ Home Stay 분석 실행
            console.log("✅ 캐시된 데이터 사용");
            return;
        }

        const apiUrl = `https://heroes.mindheal.today/api/data/gps/all?subject_no=${subjectNo}&start_date=${selectedDate}&end_date=${selectedDate}`;

        noDataMessage.innerText = "📡 데이터를 가져오는 중입니다...";
        noDataMessage.style.display = "block";

        try {
            const response = await fetch(apiUrl, {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + sessionStorage.getItem("token"),
                    "Content-Type": "application/json"
                },
                mode: "cors"
            });

            const data = await response.json();

            if (!data.data || data.data.length === 0) {
                alert("🚨 해당 날짜에 GPS 데이터가 없습니다.");
                noDataMessage.innerText = "📅 데이터가 없습니다. 다른 날짜를 선택하세요.";
                return;
            }

            // ✅ 캐시에 데이터 저장하여 중복 요청 방지
            sessionStorage.setItem(cacheKey, JSON.stringify(data.data));

            gpsData = [...data.data];
            findHomeLocation(gpsData); // 🏠 집 위치 설정 ✅
            updateVisualization(gpsData);
            // ✅ 자주 방문하는 구간 반경 표시

            // ✅ 하루 이동 거리 표시
            displayDailyDistance(gpsData);
            analyzeHomeStayAndOutings(gpsData, selectedDate);
            noDataMessage.style.display = "none";

        } catch (error) {
            console.error("🚨 GPS 데이터 가져오기 실패:", error);
            noDataMessage.innerText = "🚨 데이터를 불러오는 중 오류가 발생했습니다.";
            alert("🚨 GPS 데이터를 불러오는 중 오류가 발생했습니다.");
        }
    }

    /**
     * 📌 특정 시간대의 GPS 데이터만 필터링
     * @param {Array} gpsData - GPS 데이터 배열
     * @param {string} startTime - 시작 시간
     * @param {string} endTime - 종료 시간
     * @returns {Array} - 필터링된 GPS 데이터 배열 (선택한 시간 범위 내의 데이터만 포함)
     */
    function filterGpsDataByTimeRange(gpsData, startTime, endTime) {
        if (!gpsData || gpsData.length === 0) return [];

        return gpsData.filter(point => {
            const pointTime = new Date(point.collected_time).getHours() * 60 + new Date(point.collected_time).getMinutes(); // 🔥 분 단위 변환
            const start = parseInt(startTime.split(":")[0]) * 60 + parseInt(startTime.split(":")[1]); // 🔥 시작 시간 (분)
            const end = parseInt(endTime.split(":")[0]) * 60 + parseInt(endTime.split(":")[1]); // 🔥 종료 시간 (분)

            return pointTime >= start && pointTime <= end;
        });
    }

    /** 📌 특정 시간대 데이터 필터링 후 지도 업데이트 */
    document.getElementById("filterTimeBtn").addEventListener("click", function () {
        const startTime = document.getElementById("startTime").value;
        const endTime = document.getElementById("endTime").value;

        console.log(`✅ ${startTime} ~ ${endTime} GPS 데이터 필터링`);

        const filteredData = filterGpsDataByTimeRange(gpsData, startTime, endTime);

        if (filteredData.length === 0) {
            alert("🚨 선택한 시간대에 GPS 데이터가 없습니다.");
            return;
        }

        clearMap(); // 기존 데이터 삭제
        drawPathAndMarkers(filteredData); // ✅ 선택한 시간대 데이터 지도에 표시
    });


    let homeLocation = null;  // 집 좌표 저장

    /**
     * 📌 집 위치 자동 설정 (22:00~06:00 가장 오래 머문 장소 찾기)
     * 차후 사용 안함
     * @param {Array} gpsData - GPS 데이터 배열
     */
    function findHomeLocation(gpsData) {
        const nightData = gpsData.filter(point => {
            const hour = new Date(point.collected_time).getHours();
            return (hour >= 22 || hour < 6); // 22:00 ~ 06:00 데이터 필터링
        });

        if (nightData.length === 0) {
            console.warn("🚨 밤 시간대 GPS 데이터 없음. 집 좌표 설정 불가");
            return;
        }

        // ✅ 가장 오래 머문 장소 찾기 (가장 많이 등장한 좌표)
        const locationCounts = {};
        nightData.forEach(({ latitude, longitude }) => {
            const key = `${latitude},${longitude}`;
            locationCounts[key] = (locationCounts[key] || 0) + 1;
        });

        const mostStayedLocation = Object.entries(locationCounts).reduce((max, entry) =>
            entry[1] > max[1] ? entry : max
        );

        const [lat, lng] = mostStayedLocation[0].split(",").map(Number);
        homeLocation = { latitude: lat, longitude: lng };

        console.log("🏠 집 좌표 설정 완료:", homeLocation);
        // 🏠 집 마커 추가
        addHomeMarker(homeLocation);
    }

    /**
     * 📌 특정 날짜에서 집 머문 시간 & 외출 횟수 분석
     * - GPS 데이터를 기반으로 사용자가 하루 동안 집에 머문 시간과 외출 횟수를 계산.
     * - GPS 좌표가 설정된 집 위치(homeLocation) 반경 100m 내에 있으면 집에 머문 것으로 간주.
     * @param {Array} gpsData - 특정 날짜의 GPS 데이터 배열
     * @param {string} selectedDate - 분석할 날짜
     */
    function analyzeHomeStayAndOutings(gpsData, selectedDate) {
        if (!homeLocation) {
            console.warn("🚨 집 좌표가 설정되지 않음.");
            return;
        }

        let totalHomeStayTime = 0; // 총 집 머문 시간 (분 단위)
        let totalOutTime = 0; // 총 외출 시간 (분 단위)
        let outingCount = 0; // 외출 횟수

        let lastLocation = null;
        let lastTime = null;
        let isAtHome = false; // 현재 집에 있는지 여부

        gpsData.forEach((point, index) => {
            const { latitude, longitude, collected_time } = point;
            const currentTime = new Date(collected_time);

            if (lastTime) {
                const timeDiff = (currentTime - lastTime) / 60000; // 분 단위 시간 차이

                if (isAtHome) {
                    totalHomeStayTime += timeDiff;
                } else {
                    totalOutTime += timeDiff;
                }
            }

            // ✅ 현재 위치가 집과 가까운지 확인
            const distance = haversineDistance(latitude, longitude, homeLocation.latitude, homeLocation.longitude) * 1000;
            const atHome = distance < 100; // 집 반경 50m 이내면 집으로 간주

            if (!isAtHome && atHome) {
                outingCount++; // 집에 없다가 집으로 들어오면 외출 횟수 증가
            }

            isAtHome = atHome;
            lastTime = currentTime;
        });

        console.log(`📊 ${selectedDate} 분석 결과:`);
        console.log(`🏠 집 머문 시간: ${totalHomeStayTime.toFixed(1)} 분`);
        console.log(`🚶 외출 횟수: ${outingCount} 회`);
        console.log(`⏳ 외출 시간: ${totalOutTime.toFixed(1)} 분`);

        // ✅ UI 업데이트
        updateHomeStayUI(selectedDate, totalHomeStayTime, outingCount, totalOutTime);
    }

    /**
     * 📌 공휴일 및 주말 확인
     * @param {string} date - 확인할 날짜`
     * @returns {boolean} - 주어진 날짜가 공휴일 또는 주말이면 `true`, 아니면 `false`
     */
    function isHoliday(date) {
        const day = new Date(date).getDay();
        const publicHolidays = ["2024-01-01", "2024-03-01", "2024-05-05", "2024-06-06", "2024-08-15", "2024-10-03", "2024-12-25"]; // 공휴일 리스트

        return day === 0 || day === 6 || publicHolidays.includes(date);
    }

    /**
     * 📌 UI 업데이트 (집 머문 시간 & 외출 횟수 & 휴일 여부)
     * - 주어진 날짜에 대한 집 머문 시간, 외출 횟수, 외출 시간을 UI 요소에 업데이트하는 함수.
     * - 집에서 머문 시간과 외출 시간을 분 단위에서 시간 단위로 변환하여 표시.
     * - 해당 날짜가 휴일인지 확인하고, UI에 휴일 여부 표시.
     *
     * @param {string} date - 분석할 날짜
     * @param {number} homeStayMinutes - 집에서 머문 총 시간
     * @param {number} outingCount - 외출 횟수
     * @param {number} outTimeMinutes - 외출한 총 시간 (분 단위)
     */
    function updateHomeStayUI(date, homeStayMinutes, outingCount, outTimeMinutes) {
        const homeStayHours = (homeStayMinutes / 60).toFixed(1);
        const outTimeHours = (outTimeMinutes / 60).toFixed(1);
        const holidayStatus = isHoliday(date) ? "✅ 휴일 외출 포함" : "❌ 평일";

        // ✅ HTML 요소 가져오기
        const homeStayTimeElement = document.getElementById("homeStayTime");
        const outingCountElement = document.getElementById("outingCount");
        const outTimeElement = document.getElementById("outTime");
        const holidayStatusElement = document.getElementById("holidayStatus");

        // ✅ 요소가 없을 경우 콘솔 경고 추가
        if (!homeStayTimeElement || !outingCountElement || !outTimeElement || !holidayStatusElement) {
            console.warn("🚨 Home Stay 관련 UI 요소가 존재하지 않음! HTML을 확인하세요.");
            return;
        }

        // ✅ UI 업데이트 강제 적용 (requestAnimationFrame 사용)
        requestAnimationFrame(() => {
            homeStayTimeElement.textContent = `🏠 집 머문 시간: ${homeStayHours} 시간`;
            outingCountElement.textContent = `🚶 외출 횟수: ${outingCount} 회`;
            outTimeElement.textContent = `⏳ 외출 시간: ${outTimeHours} 시간`;
            holidayStatusElement.textContent = `📅 ${holidayStatus}`;
        });

        console.log("✅ Home Stay 정보 갱신 완료!");
    }

    // ✅ 기존 집 마커 및 원을 저장할 변수
    let homeMarker = null;
    let homeCircle = null;

    /**
     * 🏠 집 마커 + 원 추가 함수 (이전 마커 제거)
     * @param {Object} homeLocation - 집 위치의 위도(latitude)와 경도(longitude) 정보를 포함한 객체
     */
    function addHomeMarker(homeLocation) {
        if (!homeLocation) {
            console.warn("🚨 집 위치가 설정되지 않음!");
            return;
        }

        // ✅ 이전 집 마커 및 원 제거
        if (homeMarker) homeMarker.setMap(null);
        if (homeCircle) homeCircle.setMap(null);

        const homePosition = new kakao.maps.LatLng(homeLocation.latitude, homeLocation.longitude);

        // ✅ 집 마커 이미지 설정
        const homeMarkerImage = new kakao.maps.MarkerImage(
            "/img/gps/home.png", // 🔥 사용자 지정 집 아이콘
            new kakao.maps.Size(50, 50), // 아이콘 크기 설정
            { offset: new kakao.maps.Point(25, 50) } // 중심 좌표
        );

        // ✅ 집 마커 추가
        homeMarker = new kakao.maps.Marker({
            position: homePosition,
            map: map,
            image: homeMarkerImage, // 🏠 아이콘 적용
        });

        // // ✅ 집 반경 원 추가 (가독성 향상)
        // homeCircle = new kakao.maps.Circle({
        //     center: homePosition,
        //     radius: 100, // 🔥 반경 100m
        //     strokeWeight: 2, // ✅ 테두리 굵기
        //     strokeColor: "#0066FF", // ✅ 테두리 색상 (연한 파랑)
        //     strokeOpacity: 0.7, // ✅ 테두리 투명도
        //     fillColor: "#66AAFF", // ✅ 내부 색상 (연한 하늘색)
        //     fillOpacity: 0.2 // ✅ 내부 투명도 (배경 안 가리게)
        // });
        //
        // homeCircle.setMap(map); // 원 지도에 추가
        //
        // console.log("✅ 새로운 집 마커 및 원 추가 완료:", homeLocation);
    }

    /**
     * 📌 데이터 시각화 업데이트 함수
     * @param {Array} data - GPS 데이터를 포함하는 배열
     */
    function updateVisualization(data) {
        clearMap();
        drawPathAndMarkers(data);
        searchCategoryNearGPSData(data);
    }

    /**
     * 📌 Flatpickr로 달력 UI 구성
     * @param {Array} availableDates - 사용 가능한 날짜 배열
     */
    function initializeDatePicker(availableDates) {
        if (!datePicker) {
            console.error("🚨 datePicker 요소를 찾을 수 없습니다.");
            return;
        }

        if (availableDates.length === 0) {
            console.warn("📅 사용 가능한 날짜가 없습니다.");
            datePicker.disabled = true;
            noDataMessage.innerText = "📅 날짜를 선택해주세요";
            noDataMessage.style.display = "block";
            return;
        }

        // ✅ datePicker 활성화 및 메시지 변경
        datePicker.disabled = false;
        noDataMessage.innerText = "📅 날짜를 선택해주세요";
        noDataMessage.style.display = "block";

        // ✅ 최소 및 최대 날짜 설정
        const minDate = availableDates[0];
        const maxDate = availableDates[availableDates.length - 1];

        // ✅ Flatpickr 설정
        flatpickr(datePicker, {
            locale: "ko",
            dateFormat: "Y-m-d",
            minDate: minDate,
            maxDate: maxDate,
            enable: availableDates,  // 📅 사용 가능한 날짜만 활성화
            defaultDate: null,
            disableMobile: true,
            onOpen: function () {
                if (!datePicker.value) {
                    noDataMessage.innerText = "📅 날짜를 선택해주세요";
                    noDataMessage.style.display = "block";
                }
            },
            onChange: function (selectedDates, dateStr) {
                if (!dateStr || !availableDates.includes(dateStr)) {
                    const closestDate = findClosestAvailableDate(dateStr, availableDates);
                    datePicker._flatpickr.setDate(closestDate, true);
                    alert(`🚨 선택한 날짜에 GPS 데이터가 없습니다!\n📅 자동으로 ${closestDate} 날짜로 변경됩니다.`);
                }

                // ✅ 날짜가 선택되었으므로 메시지 숨김
                noDataMessage.style.display = "none";

            }
        });
    }

    /**
     * 📌 가장 가까운 사용 가능한 날짜 찾기
     * @param {string} selectedDate - 사용자가 선택한 날짜
     * @param {Array} availableDates - 사용 가능한 날짜 목록
     * @returns {string} closestDate - 사용자가 선택한 날짜와 가장 가까운 사용 가능한 날짜.
     */
    function findClosestAvailableDate(selectedDate, availableDates) {
        let closestDate = availableDates[0];
        let minDiff = Infinity;

        availableDates.forEach(date => {
            const diff = Math.abs(new Date(date) - new Date(selectedDate));
            if (diff < minDiff) {
                minDiff = diff;
                closestDate = date;
            }
        });

        return closestDate;
    }

    /**
     * 📌 달력이 minDate 이전, maxDate 이후로 이동하지 않도록 설정
     * @param {Object} instance - Flatpickr 인스턴스 (달력 객체)
     * @param {string} minDate - 선택할 수 있는 최소 날짜
     * @param {string} maxDate - 선택할 수 있는 최대 날짜
     */
    function checkMonthNavigation(instance, minDate, maxDate) {
        const prevBtn = instance.calendarContainer.querySelector(".flatpickr-prev-month");
        const nextBtn = instance.calendarContainer.querySelector(".flatpickr-next-month");

        // 현재 보여지는 연도와 월
        const currentYear = instance.currentYear;
        const currentMonth = instance.currentMonth; // 0 (January) ~ 11 (December)

        // minDate와 maxDate의 연도와 월
        const minYear = new Date(minDate).getFullYear();
        const minMonth = new Date(minDate).getMonth();
        const maxYear = new Date(maxDate).getFullYear();
        const maxMonth = new Date(maxDate).getMonth();

        // ✅ 이전 달 버튼 비활성화 (현재 연도, 월이 minDate와 같으면)
        if (currentYear === minYear && currentMonth <= minMonth) {
            prevBtn.style.visibility = "hidden"; // 이전 버튼 숨김
        } else {
            prevBtn.style.visibility = "visible"; // 이전 버튼 활성화
        }

        // ✅ 다음 달 버튼 비활성화 (현재 연도, 월이 maxDate와 같으면)
        if (currentYear === maxYear && currentMonth >= maxMonth) {
            nextBtn.style.visibility = "hidden"; // 다음 버튼 숨김
        } else {
            nextBtn.style.visibility = "visible"; // 다음 버튼 활성화
        }
    }

    /**
     * ✅ 사용 가능한 날짜 범위 표시 (최소 ~ 최대)
     * @param {Array} availableDates - 사용 가능한 날짜 목록
     */
    function updateAvailableDatesDisplay(availableDates) {
        if (availableDates.length === 0) {
            dataTimeRangeElement.textContent = "데이터 없음";
            return;
        }

        const minDate = availableDates[0]; // 가장 빠른 날짜
        const maxDate = availableDates[availableDates.length - 1]; // 가장 늦은 날짜

        dataTimeRangeElement.textContent = `${minDate} ~ ${maxDate}`;

    }

});