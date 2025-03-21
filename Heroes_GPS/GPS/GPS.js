fetch(url)
.then(function(){
//handle the response
})
.catch(function(){
    //handle the error
});


//  // CSV 파일 읽고 JSON 데이터로 변환
//   function readCSVFile(file, callback) {
//       const reader = new FileReade  r();
//       reader.onload = function(e) {
//         const contents = e.target.result;
//         const jsonData = csvToJson(contents);  // CSV -> JSON 변환
//         console.log("Converted JSON Data:", jsonData);
//         callback(jsonData);  // JSON 데이터 콜백으로 전달
//       };
//       reader.readAsText(file);  // 파일 텍스트로 읽어오기
//     };     

  // CSV 파일을 JSON 객체로 변환
    function csvToJson(csv) {
      const lines = csv.split('\n');  // CSV 파일을 줄 단위 나눔
      const result = [];
      const headers = lines[0].split(',');  // 첫 번째 줄은 헤더로 처리
      // 나머지 데이터는 각 행을 객체로 변환
      for (let i = 1; i < lines.length; i++) {
        const obj = {};
        const currentLine = lines[i].split(',');

        for (let j = 0; j < headers.length; j++) {
          obj[headers[j].trim()] = currentLine[j].trim();
        }
        result.push(obj);
      }
      return result;  // JSON 객체 반환
    }
  // CSV 파일을 JSON 객체로 변환
function csvToJson(csv) {
    const lines = csv.split('\n');  // CSV 파일을 줄 단위 나눔
    const result = [];
    const headers = lines[0].split(',');  // 첫 번째 줄은 헤더로 처리

    // 나머지 데이터는 각 행을 객체로 변환
    for (let i = 1; i < lines.length; i++) {
        const obj = {};
        const currentLine = lines[i].split(',');

        for (let j = 0; j < headers.length; j++) {
            obj[headers[j].trim()] = currentLine[j] ? currentLine[j].trim() : "";
        }
        result.push(obj);
    }
    return result;  // JSON 객체 반환
}

// 지도 초기화 함수
function initializeMap() {
    const mapContainer = document.getElementById('map'); 
    const mapOption = {
        center: new kakao.maps.LatLng(35.8242238, 127.1479532),
        level: 4
    };
    return new kakao.maps.Map(mapContainer, mapOption);
}


    //특정 날짜 데이터를 API서 가져오기
   
    //let extraCoordinated = [];

    fetch('CSV/path.csv')
      .then(response => response.text())
      .then(text => {
        const jsonData = csvToJson(text);
        const coordinated = extraCoordinated(jsonData); 
        console.log("path")
      })
      .catch(error => console.error('Error: ', error));
  
       // 데이터를 받은 후 경로를 그리는 함수 호출 // 카카오 지도 API 로드 및 초기화
        var mapContainer = document.getElementById('map'); // 지도를 표시할 div 영역
        var mapOption = {
        center: new kakao.maps.LatLng(35.8242238, 127.1479532), // 지도의 중심 좌표: 전북 전주시
        level: 4 // 지도 확대, 축소 정도
    };

var map = new kakao.maps.Map(mapContainer, mapOption); // 지도 생성

// let polyline = new kakao.maps.Polyline({
//   strokeColor: 'black',
//   strokeOpacity: 5,
//   strokeWeight: 3,
//   strokeStyle: 'solid'
// }); // 경로 그릴 polyline 객체

let addMarkers = ["latitude, longitude"]; // 이동 경로의 마커들

// function initializeMap() {
//   const center = new kakao.maps.LatLng(35.8242238, 127.1479532); // 초기값: 전북 전주시 좌표
  
//   map = new kakao.maps.Map(mapContainer, {
//     center: center,
//     level: 10, // 초기 줌 레벨
//     draggable: true,
//     scrollwheel: true,
//   });

//   // 줌 컨트롤 추가
//   const zoomControl = new kakao.maps.ZoomControl();
//   map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

//   // 기본 설정 - 경로(polyline) 및 마커
//   polyline = new kakao.maps.Polyline({
//     path: linepath, // 경로 좌표
//     strokeWeight: 5, // 선 두께
//     strokeColor: '#FF0000', // 기본 선 색
//     strokeOpacity: 0.7, // 선 투명도
//     strokeStyle: 'solid', // 선 스타일
//   });
// }
// // GPS 데이터를 기반으로 마커 및 선 그리기
// function drawRoute(gpsData) {
//   var linePath = [gpsData(latitude,longitude)];  // 선을 그릴 좌표 배열

//   gpsData.forEach((point) => {
//       var position = new kakao.maps.LatLng(point.latitude, point.longitude);  // 위도, 경도로 위치 객체 생성
//       linePath.push(position);  // 경로 좌표 추가

//       // 마커 생성
//       var marker = new kakao.maps.Marker({
//           position: position,
//           map: map
//       });
//       markers.push(marker);
//   });

//   // 경로(선) 그리기
//   polyline.setPath(linePath);  // 경로 설정
//   polyline.setMap(map);  // 지도에 선 추가
// }


// // 경로에 마커 추가 -> 하면 지도가 사라짐.... 
// function addMarkers(gpsData) {
//   gpsData.forEach((point, index) => {
//     const position = new kakao.maps.LatLng(latitude,longitude);
//     const marker = new kakao.maps.Marker({
//       position: position,
//       map: map,
//     }); 
// //     markers.push(marker);
// //     // 이동 속도 따른 경로 색 설정
// //     const speed = point.speed;
// //     let color = '#00FF00'; // 초록색 (4km/h 이하 - 느린 걷기)
// //     if (speed > 4, speed <= 12) color = '#FFFF00'; // 노란색 (4km/h 초과 12km/h 이하 - 보통 걷기 ~ 빠른 걷기)
// //     else if (speed > 12) color = '#FF0000'; // 빨간색 (12km/h 초과 - 주행)
// //     polyline.getPath().push(position);
// //     polyline.setStrokeColor(color);
// //   });
  
// //   // Polyline 및 마커 업데이트
// //   polyline.setMap(map);
// // }
// // 줌 인, 아웃 컨트롤
// document.getElementById('zoom-in').addEventListener('click', () => {
//   map.setLevel(map.getLevel() - 1);
// });

// document.getElementById('zoom-out').addEventListener('click', () => {
//   map.setLevel(map.getLevel() + 1);
// });

// 메인 실행 함수
async function main() {
  new Map();
  
  // 특정 날짜의 GPS 데이터 가져오기
  const date = '2024-12-26'; // 예시 날짜
  let gpsData = await Data(date);
  gpsData();
}
// 카카오 맵 API 로드 및 초기화
var mapContainer = document.getElementById('map'); // 지도 표시할 div 영역
var mapOption = {
    center: new kakao.maps.LatLng(35.8242238, 127.1479532), // 지도 중심 좌표
    level: 3 // 지도 확대 정도
};
var map = new kakao.maps.Map(mapContainer, mapOption);

// 일반 지도와 스카이뷰로 지도 타입 전환 가능한 지도타입 컨트롤 생성
var mapTypeControl = new kakao.maps.MapTypeControl();

// kakao.maps.ControlPosition은 컨트롤이 표시될 위치를 정의하는데 TOPRIGHT는 오른쪽 위
map.addControl(mapTypeControl, kakao.maps.ControlPosition.TOPRIGHT);

// 지도 확대 축소를 제어할 수 있는  줌 컨트롤을 생성
var zoomControl = new kakao.maps.ZoomControl();
map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

// Polyline 객체 초기화
var polyline = new kakao.maps.Polyline({
    strokeWeight: 5,    // 선 두께
    strokeColor: '#FF0000', // 선 색
    strokeOpacity: 0.7,   // 선 투명도
    strokeStyle: 'solid'  // 선 스타일
});

// 마커 배열
var markers = [];
    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        const csvToJson = csvToJson(text);
        document.getElementById("output").textContent = JSON.stringify(csvToJson, [latitude, longitude], 2);
    };
    reader.readAsText(); 
// const myForm = document.getElementById("myForm");
// const csvFile = document.getElementById("csvFile");

// myForm.addEventListener("submit", function (e) {
//   e.preventDefault();
//   console.log("Form submitted");
// });
// document.getElementById("myform").addEventListener("submit", function (e) {
//     e.preventDefault();
//     const file = document.getElementById("csvFile").files[0];
//     if (!file) return;
// const reader = new FileReader();
// reader.onload = function (event) {
//   console.log(event.target.result); // the CSV content as string
// };
// reader.readAsText("csvFile");

let formData = new FormData();
formData.append('No', ( "collected_Time", "latitude", "longitude"));
formData.get('');  


console.log(formData);
Object.entries(obj).forEach(data => formData.append(data[0], data[2]));

function csvToJson(csv, delimiter = ",") {
    const lines = csv.trim().split("\n");
    const headers = lines[0].split(delimiter);
    return lines.slice(1).map(line => {
        const values = line.split(delimiter);
        return headers.reduce((obj, header, index) => {
            obj[header.trim()] = values[index] ? values[index].trim() : "";
            return obj;
        }, {});
    });
}

function csvToGpsData(csv) {
  const lines = csv.split('\n');
  const headers = lines[0].split(',').map(h => h.trim()); // 헤더 가져오기
  const gpsData = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 3) continue; // 데이터 부족한 줄은 스킵

    // 필요한 데이터만 추출
    const collectedTime = values[headers.indexOf('collected_time')];
    const latitude = parseFloat(values[headers.indexOf('latitude')]);
    const longitude = parseFloat(values[headers.indexOf('longitude')]);

    if (!isNaN(latitude) && !isNaN(longitude)) {
      gpsData.push({ collectedTime, latitude, longitude });
    }
  }

  return gpsData;
}

// GPS 데이터를 기반으로 마커 및 선 그리기
function drawRoute(gpsData) {
    var linePath = [];  // 선을 그릴 좌표 배열

    gpsData.forEach((point) => {
        var position = new kakao.maps.LatLng(point.latitude, point.longitude);  // 위도, 경도로 위치 객체 생성
        linePath.push(position);  // 경로 좌표 추가

        // 마커 생성
        var marker = new kakao.maps.Marker({
            position: position,
            map: map
        });
        markers.push(marker);
    });


    // 경로(선) 그리기
    polyline.setPath(linePath);  // 경로 설정
    polyline.setMap(map);  // 지도에 선 추가
}


document.addEventListener('DOMContentLoaded', function() {
    const button = document.getElementById('csvFileInput');
    if (button) {
        button.addEventListener('click', function() {
            // Handle the button click
        });
    }
});

// 2. CSV 파일 처리
document.getElementById('csvFileInput').addEventListener('change', function() {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const csvData = e.target.result;
        Papa.parse(csvData, {
            header: true, // 첫 번째 행을 헤더로 처리
            skipEmptyLines: true,
            complete: function(results) {
                processCSVData(results.data);
            }
        });
    };
    reader.readAsText(file);
});

// 3. CSV 데이터 처리
function processCSVData(data) {
    if (polyline) polyline.setMap(null);  // 기존 선 삭제
    markers.forEach(marker => marker.setMap(map));  // 기존 마커 삭제
    markers = [];

    let path = [];
    let prevTime = null;

    data.forEach((row, index) => {
        const lat = parseFloat(row["위도"]);
        const lng = parseFloat(row["경도"]);
        const time = new Date(row["시간"]); // CSV의 시간 값
        const position = new kakao.maps.LatLng(point.lat, point.lng);

        // 마커 추가
        let marker = new kakao.maps.Marker({
            position: position,
            map: map
        });
        markers.push(marker);

        // 마커에 정보 표시
        let infoWindow = new kakao.maps.InfoWindow({
            content: `<div style="padding:5px;">${row["번호"]}: ${row["시간"]}</div>`
        });
        kakao.maps.event.addListener(marker, 'mouseover', function() {
            infoWindow.open(map, marker);
        });
        kakao.maps.event.addListener(marker, 'mouseout', function() {
            infoWindow.close();
        });

        // 30분 단위로 선 연결
        if (prevTime === null || (time - prevTime) >= (30 * 60 * 1000)) {
            if (path.length > 1) {
                drawPolyline(path); // 이전 경로 그리기
            }
            path = []; // 새로운 경로 시작
            prevTime = time;
        }
        path.push(position);
    });

    // 마지막 경로 선 그리기
    if (path.length > 1) {
        drawPolyline(path);
    }
}

// 4. 이동 경로 선 그리기
function drawPolyline(path) {
    polyline = new kakao.maps.Polyline({
        path: path,
        strokeWeight: 4,
        strokeColor: 'blue',
        strokeOpacity: 0.8,
        strokeStyle: 'solid'
    });
    polyline.setMap(map);
}

// 지도 로딩 후 초기화 실행
window.onload = initializeMap;



// // 예시 GPS 데이터
var gpsData = 
     (collected_time, latitude, longitude);
//    [ { collected_time: '2025-03-19T08:05:00', latitude: 35.8252238, longitude: 127.1489532 },
//      { collected_time: '2025-03-19T08:10:00', latitude: 35.8262238, longitude: 127.1499532 }
// ] ;

// 경로 그리기
drawRoute(gpsData);

// drawRouteOnMap(data);

