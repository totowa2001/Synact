// 최신화 260520
// 최신화내용: pixelBaseSize/pixelMaxScale 도입, animSpeed 15.0으로 3배 증속
// 스크립트 이름: tokens.js
// 스크립트 기능: 디자인 시스템 고정값 — 색상 토큰, 애니메이션 파라미터
// 입력 파라미터: 없음 (전역 변수로 노출)

// ================================================================
// 배경색 — RGB를 개별 변수로 분리하여 자유롭게 조정 가능
// 기본값: #F2F3F8 (Synact Primary Background, 살짝 푸른 흰색)
// 조정 방법: 아래 숫자를 변경 후 브라우저 새로고침
// ================================================================
var BG_R = 242;
var BG_G = 243;
var BG_B = 248;

// ================================================================
// 색상 토큰 — Synact 브랜딩 기반
// ================================================================
var COLORS = {
  // Three.js hex 정수
  primary : 0x181858,
  interp  : 0x37537F,
  deep2   : 0x080946,
  accent  : 0xC0FF00,  // Lime — 수렴 hot spot
  white   : 0xF9F9F9,

  // float [r,g,b] — 색상 보간용
  primaryF: [24/255,  24/255,  88/255 ],
  interpF : [55/255,  83/255, 127/255 ],
  deep2F  : [ 8/255,   9/255,  70/255 ],
  accentF : [192/255, 255/255,   0/255],

  bgColor: function () {
    return new THREE.Color(BG_R / 255, BG_G / 255, BG_B / 255);
  }
};

// ================================================================
// 씬 파라미터
// ================================================================
var PARAMS = {
  // --- 픽셀 분포 (구형 무작위 산포) ---
  arrowCount   : 2500,  // 총 픽셀 수 (ArrowField 내부에서 사용)
  gridHalf     : 28,    // 분포 구(球) 반경. 카메라가 내부(camRadius < gridHalf)에 위치

  // 픽셀 박스 크기 (BoxGeometry 균일 스케일)
  pixelBaseSize: 1.8,   // 픽셀 기본 크기
  pixelMaxScale: 2.8,   // 강한 수렴에서 최대 스케일 배율

  // --- 애니메이션 속도 ---
  // animSpeed를 높이면 흐름 방향 변화 속도와 소용돌이 공전 속도가 함께 빨라짐
  animSpeed    : 15.0,  // 전체 애니메이션 속도 배율 (이전 5.0의 3배)

  // --- Flow Field ---
  noiseScale   : 0.03,
  noiseSpeed   : 0.18,
  fbmOctaves   : 4,
  fbmPersistence: 0.50,
  fbmLacunarity : 2.10,

  convergenceStr: 0.22,
  vortexStr    : 2.8,

  // --- 스트림라인 ---
  // streamStep을 크게 하면 선이 더 빨리 전진하고 꼬리가 더 멀리 펼쳐짐
  streamCount  : 360,    // 스트림라인 수
  streamLen    : 55,    // 궤적 길이 (점 수, 클수록 꼬리가 길어짐)
  streamStep   : 0.22,  // 헤드 전진 거리 (world units/frame)

  // --- 씬 ---
  fogDensity   : 0.003,  // 외부 시점용 저밀도 (카메라 구 외부에서 바라봄)

  // --- 카메라 (OrthographicCamera, 구 외부 시점) ---
  camRadius    : 80,     // 카메라~원점 거리 (gridHalf=28보다 충분히 크게)
  camHalfH     : 35,     // 직교 카메라 반폭(Y) — 마우스 휠로 줌 조정
  camAutoRot   : 0.00012,
};
