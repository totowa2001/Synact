// 최신화 260520
// 최신화내용: 전역 주류(global drift) 추가, 비대칭 단일 소용돌이, fBm 가중치 축소
// 스크립트 이름: FlowField.js
// 스크립트 기능: Flow Matching 벡터장 생성.
//               시간에 따라 궤도를 도는 두 개의 해석적 소용돌이(analytic vortex)와
//               fBm 난류를 합산하여, 회전하는 흐름 패턴이 공간을 이동하며
//               방향이 지속적으로 바뀌는 동적 벡터장을 생성.
// 입력 파라미터: tokens.js의 PARAMS (전역)

// ================================================================
// 내부 유틸리티
// ================================================================

// 함수 이름: _hash
// 함수 기능: 정수 n → [0,1) 의사난수 (sin 기반)
// 입력 파라미터: n (Number)
// 리턴 타입: Number [0,1)
function _hash(n) {
  return ((Math.sin(n) * 43758.5453123) % 1 + 1) % 1;
}

// 함수 이름: _noise3
// 함수 기능: 3D 스무스 값 노이즈, 퀸틱 보간. 출력 [-1, 1]
// 입력 파라미터: x, y, z (Number)
// 리턴 타입: Number [-1, 1]
function _noise3(x, y, z) {
  var ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  var fx = x - ix, fy = y - iy, fz = z - iz;
  var ux = fx*fx*fx*(fx*(fx*6-15)+10);
  var uy = fy*fy*fy*(fy*(fy*6-15)+10);
  var uz = fz*fz*fz*(fz*(fz*6-15)+10);

  var v000 = _hash(ix     + iy*57     + iz*113);
  var v100 = _hash(ix+1   + iy*57     + iz*113);
  var v010 = _hash(ix     + (iy+1)*57 + iz*113);
  var v110 = _hash(ix+1   + (iy+1)*57 + iz*113);
  var v001 = _hash(ix     + iy*57     + (iz+1)*113);
  var v101 = _hash(ix+1   + iy*57     + (iz+1)*113);
  var v011 = _hash(ix     + (iy+1)*57 + (iz+1)*113);
  var v111 = _hash(ix+1   + (iy+1)*57 + (iz+1)*113);

  var x00 = v000 + ux*(v100-v000);
  var x10 = v010 + ux*(v110-v010);
  var x01 = v001 + ux*(v101-v001);
  var x11 = v011 + ux*(v111-v011);
  var y0  = x00  + uy*(x10-x00);
  var y1  = x01  + uy*(x11-x01);
  return (y0 + uz*(y1-y0)) * 2 - 1;
}

// 함수 이름: _fbm
// 함수 기능: fractional Brownian motion — 다중 옥타브 노이즈 합산
// 입력 파라미터: x,y,z (Number) / t (Number) 시간
//               octaves, persistence, lacunarity (Number)
// 리턴 타입: Number [-1, 1]
function _fbm(x, y, z, t, octaves, persistence, lacunarity) {
  var v = 0, amp = 1, freq = 1, norm = 0;
  for (var i = 0; i < octaves; i++) {
    v    += _noise3(x*freq + t*(0.3+i*0.07), y*freq + t*(0.22+i*0.05), z*freq + t*(0.27+i*0.06)) * amp;
    norm += amp;
    amp  *= persistence;
    freq *= lacunarity;
  }
  return v / norm;
}

// 함수 이름: _vortex
// 함수 기능: Y축 기준 해석적 소용돌이 벡터 반환.
//           중심(cx,cy,cz) 주변을 XZ 평면에서 회전시키는 흐름.
//           거리에 따라 지수 감쇠로 영향 범위 제한.
// 입력 파라미터: x,y,z (Number) 샘플 위치 /
//               cx,cy,cz (Number) 소용돌이 중심 /
//               strength (Number) 회전 강도 (양수=반시계, 음수=시계)
// 리턴 타입: Object { x, y, z }
function _vortex(x, y, z, cx, cy, cz, strength) {
  var dx = x - cx, dy = y - cy, dz = z - cz;
  var r  = Math.sqrt(dx*dx + dz*dz) + 0.6;
  var vy = dy * 0.08 * strength;
  var decay = Math.exp(-r * 0.055);
  return {
    x: -dz / r * strength * decay,
    y:  vy * decay,
    z:  dx / r * strength * decay
  };
}

// ================================================================
// 공개 인터페이스
// ================================================================

var FlowField = (function () {

  // 함수 이름: getVector
  // 함수 기능: 3D 공간의 점(x,y,z)에서 t 시각의 흐름 벡터 반환.
  //           전역 주류(global drift) + fBm 난류 + 단일 비대칭 소용돌이 합산.
  //           전역 주류가 dominant(magnitude ~1.35) → 씬 전체가 하나의 거대한 흐름으로 묶임.
  //           소용돌이는 X/Z 서로 다른 반경(16 vs 22)·주파수(0.068 vs 0.053)의 타원 궤도
  //           → 좌우 대칭 없음.
  // 입력 파라미터: x,y,z (Number) 3D 위치 / t (Number) 경과 시간(초)
  // 리턴 타입: Object { x, y, z }
  function getVector(x, y, z, t) {
    var s   = PARAMS.noiseScale;
    var spd = PARAMS.noiseSpeed;
    var oct = PARAMS.fbmOctaves;
    var per = PARAMS.fbmPersistence;
    var lac = PARAMS.fbmLacunarity;

    // 전역 주류 — 씬 전체를 단일 흐름으로 통합.
    // 두 개의 서로 다른 주파수가 겹쳐 리사주 곡선 형태로 방향이 회전 → 단조롭지 않음.
    var a1 = t * 0.028;
    var a2 = t * 0.019;
    var gfx = Math.cos(a1) * Math.cos(a2 * 0.7) * 1.35;
    var gfy = Math.sin(a2) * 0.42;
    var gfz = Math.sin(a1) * Math.cos(a2 * 0.5) * 1.35;

    // fBm 난류 — 주류에 결(texture) 부여. 가중치 0.38로 낮춰 거시 흐름 유지
    var nx = _fbm(x*s+1.73, y*s+9.23, z*s+3.11, t*spd,     oct, per, lac) * 0.38;
    var ny = _fbm(x*s+4.31, y*s+2.83, z*s+7.54, t*spd+1.0, oct, per, lac) * 0.38;
    var nz = _fbm(x*s+8.13, y*s+5.43, z*s+1.97, t*spd+2.0, oct, per, lac) * 0.38;

    // 소용돌이 — 비대칭 타원 궤도 (X반경 16 ≠ Z반경 22, 주파수 0.068 ≠ 0.053)
    var v1x = Math.cos(t * 0.068) * 16;
    var v1z = Math.sin(t * 0.053) * 22;
    var vor1 = _vortex(x, y, z, v1x, Math.sin(t*0.041)*9, v1z, PARAMS.vortexStr * 1.3);

    // 중심 수렴 드리프트
    var dist = Math.sqrt(x*x + y*y + z*z) + 0.001;
    var pull = PARAMS.convergenceStr * (0.4 + dist / (PARAMS.gridHalf * 2.0));

    return {
      x: gfx + nx + vor1.x - x/dist * pull,
      y: gfy + ny + vor1.y - y/dist * pull,
      z: gfz + nz + vor1.z - z/dist * pull
    };
  }

  // 함수 이름: getConvergenceScore
  // 함수 기능: 위치(x,y,z)의 수렴 강도 점수 반환. 0=혼돈, 1=강한 수렴.
  //           소용돌이 중심 근방 + 씬 중심 근방에서 점수 높음.
  // 입력 파라미터: x,y,z (Number) / t (Number)
  // 리턴 타입: Number [0, 1]
  function getConvergenceScore(x, y, z, t) {
    var dist  = Math.sqrt(x*x + y*y + z*z);
    var prox  = Math.max(0, 1 - dist / (PARAMS.gridHalf * 0.6));
    // 이동하는 노이즈 아일랜드
    var island = (_fbm(x*0.05+11.1, y*0.05+3.3, z*0.05+7.7, t*0.022, 3, 0.5, 2.0) + 1) * 0.5;
    return prox * 0.45 + island * 0.55;
  }

  return { getVector: getVector, getConvergenceScore: getConvergenceScore };
})();
