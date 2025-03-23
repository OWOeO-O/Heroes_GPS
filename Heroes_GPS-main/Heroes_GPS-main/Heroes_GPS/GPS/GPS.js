// function drawRouteFromCSV(jsonData) {
//   const linePaths = [];
//   for (let i = 0; i < jsonData.length - 1; i++) {
//     const p1 = jsonData[i];
//     const p2 = jsonData[i + 1];

//     const lat1 = parseFloat(p1["위도"]);
//     const lon1 = parseFloat(p1["경도"]);
//     const lat2 = parseFloat(p2["위도"]);
//     const lon2 = parseFloat(p2["경도"]);
//     const time1 = p1["시간"];
//     const time2 = p2["시간"];

//     const speed = calculateSpeed(lat1, lon1, time1, lat2, lon2, time2);
//     const color = getColorBySpeed(speed);

//     // 마커 찍기
//     const marker = new kakao.maps.Marker({
//       position: new kakao.maps.LatLng(lat1, lon1),
//       map: map,
//     });
//     markers.push(marker);

//     // 선 그리기
//     const polyline = new kakao.maps.Polyline({
//       path: [
//         new kakao.maps.LatLng(lat1, lon1),
//         new kakao.maps.LatLng(lat2, lon2),
//       ],
//       strokeWeight: 5,
//       strokeColor: color,
//       strokeOpacity: 0.8,
//       strokeStyle: "solid",
//     });
//     polyline.setMap(map);
//   }
// }

// // 파일 읽고 실행
// document.getElementById("fileInput").addEventListener("change", function (e) {
//   const file = e.target.files[0];
//   const reader = new FileReader();
//   reader.onload = function (event) {
//     const csv = event.target.result;
//     const jsonData = csvToJson(csv);
//     drawRouteFromCSV(jsonData);
//   };
//   reader.readAsText(file);
// });

// 카카오맵 초기화
const container = document.getElementById("map");
const options = {
  center: new kakao.maps.LatLng(35.8268, 127.148), // 초기 지도 중심 위치 (전북 전주시)
  level: 3, // 줌 레벨
};
const map = new kakao.maps.Map(container, options);
// 일반 지도와 스카이뷰로 지도 타입을 전환할 수 있는 지도타입 컨트롤을 생성
var mapTypeControl = new kakao.maps.MapTypeControl();

// 지도에 컨트롤을 추가해야 지도위에 표시
// kakao.maps.ControlPosition은 컨트롤이 표시될 위치를 정의하는데 TOPRIGHT는 오른쪽 위를 의미
map.addControl(mapTypeControl, kakao.maps.ControlPosition.TOPRIGHT);

// 지도 확대 축소를 제어할 수 있는  줌 컨트롤을 생성
var zoomControl = new kakao.maps.ZoomControl();
map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

// CSV 파일 로드 및 파싱
fetch("CSV/path.csv")
  .then((response) => response.text())
  .then((csvData) => {
    const lines = csvData.trim().split("\n").slice(1);
    const data = lines.map((line) => {
      const [NO, time, lat, lng] = line.split(",");
      return { NO, time, lat: parseFloat(lat), lng: parseFloat(lng) };
    });
    visualize(data);
  })
  .catch((err) => console.error("CSV 파일 로드 실패:", err));

// 경로 시각화
function visualize(data) {
  const startLatLng = new kakao.maps.LatLng(data[0].lat, data[0].lng);
  map.setCenter(startLatLng); // 시작 위치로 지도 중심 변경

  const pathCoordinates = [];
  let segmentStartIndex = 0;
  let segmentStartTime = new Date(data[0].time);

  // 경로 선과 마커를 30분 단위로 처리
  for (let i = 1; i < data.length; i++) {
    const currTime = new Date(data[i].time);
    const diffMins = (currTime - segmentStartTime) / (1000 * 60);

    // 30분 단위로 마커 표시
    if (diffMins >= 30 || i === data.length - 1) {
      const segmentPoints = data.slice(segmentStartIndex, i + 1);

      // 경로 선 색상 결정 (속도에 따라)
      const startPoint = data[segmentStartIndex];
      const endPoint = data[i];
      const dist =
        getDistanceFromLatLonInKm(
          startPoint.lat,
          startPoint.lng,
          endPoint.lat,
          endPoint.lng
        ) * 1000; // m
      const timeDiffSec =
        (new Date(endPoint.time) - new Date(startPoint.time)) / 1000;
      const speed = timeDiffSec > 0 ? (dist / timeDiffSec) * 3.6 : 0; // km/h

      let color = "green";
      if (speed > 4 && speed <= 12) color = "yellow";
      else if (speed > 12) color = "red";

      // 경로 선 그리기
      const path = [];
      segmentPoints.forEach((p) =>
        path.push(new kakao.maps.LatLng(p.lat, p.lng))
      );
      const polyline = new kakao.maps.Polyline({
        path: path,
        strokeWeight: 5,
        strokeColor: color,
        strokeOpacity: 0.8,
        strokeStyle: "solid",
      });
      polyline.setMap(map);

      // 30분마다 반투명 회색 핀 모양 마커
      const markerImage = new kakao.maps.MarkerImage(
        "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/marker_red.png", // 핀 모양 아이콘
        new kakao.maps.Size(40, 60), // 아이콘 크기 (너비, 높이)
        { offset: new kakao.maps.Point(20, 60) } // 핀의 아래쪽 끝이 마커의 위치에 정확히 맞도록
      );

      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(endPoint.lat, endPoint.lng),
        image: markerImage, // 핀 아이콘 설정
        clickable: true,
      });
      marker.setMap(map);

      // 마커 클릭 시 정보 표시
      kakao.maps.event.addListener(marker, "click", function () {
        alert(
          `${startPoint.time} ~ ${endPoint.time}\n평균 속도: ${speed.toFixed(
            2
          )} km/h`
        );
      });

      // 다음 구간 시작
      segmentStartIndex = i;
      segmentStartTime = currTime;
    }
  }
}

// 두 지점 간의 거리 계산 (단위: km)
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // 지구 반지름 (km)
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // km 단위로 반환
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}
