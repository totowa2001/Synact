// 최신화 260525
// 최신화내용: 3단계 페이즈 애니메이션 — 정렬→방사형 분산→클러스터 수렴, BoxGeometry 2.5D, Z 깊이
// 스크립트 이름: ArrowField.js
// 스크립트 기능: XY 평면 22²=484개 얇은 박스를 3단계로 애니메이션.
//   Phase A (0→0.30): 모든 화살표 동일 각도로 정렬 (레퍼런스 이미지 1)
//   Phase B (0.30→0.65): 중앙에서 방사형으로 흩어짐 + 개별 노이즈 (레퍼런스 이미지 2)
//   Phase C (0.65→1.00): 최근접 클러스터 방향으로 수렴 (vector field 학습)
//   Phase D: 빠른 역행 (globalT 1→0)
//   중심부 화살표 z=0, 외곽 z=-dist×0.12 → PerspectiveCamera와 결합하여 2.5D 깊이감
//
// [ 핵심 구조 ]
//   _mesh         — BoxGeometry(arrowW, arrowH, arrowD) InstancedMesh (484개)
//   _gridPos      — Float32Array (TOTAL*3) XY 격자 + z 깊이 사전 계산
//   _rndAngle     — Float32Array (TOTAL) Phase B 방사형+노이즈 각도 (결정론적)
//   _clusterAngle — Float32Array (TOTAL) Phase C 클러스터 방향각 (사전 계산)
//   _colorGroup   — Uint8Array (TOTAL) 팔레트 인덱스
//
// 입력 파라미터: tokens.js의 CLUSTERS, PARAMS / globalT(0→1), t(연속 경과초)

var ArrowField = (function () {

  var _scene;
  var _TOTAL;
  var _gridPos;      // Float32Array (TOTAL * 3) — XY 격자 좌표 + z 깊이
  var _rndAngle;     // Float32Array (TOTAL) — Phase B 방향각
  var _clusterAngle; // Float32Array (TOTAL) — Phase C 클러스터 방향각
  var _colorGroup;   // Uint8Array (TOTAL) — 팔레트 인덱스

  var _mesh;

  var _dummy = null;
  var _zAxis = null;
  var _color = null;

  // 브랜드 컬러 팔레트 (인덱스 5: lime = Phase C 수렴 핫스팟 전용)
  var _PALETTE = [
    [ 24/255,  24/255,  88/255],  // 0: primary navy  #181858
    [ 55/255,  83/255, 127/255],  // 1: mid blue      #37537F
    [ 30/255,  52/255, 148/255],  // 2: bright navy   #1E3494
    [ 25/255,  88/255, 170/255],  // 3: light blue    #1958AA
    [105/255, 168/255, 220/255],  // 4: sky blue      #69A8DC
    [192/255, 255/255,   0/255],  // 5: lime accent   #C0FF00
  ];

  // 함수 이름: _rnd
  // 함수 기능: seed → [0,1) 결정론적 의사난수
  // 입력 파라미터: seed (Number)
  // 리턴 타입: Number [0,1)
  function _rnd(seed) {
    return ((Math.sin(seed * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
  }

  // 함수 이름: _smoothstep
  // 함수 기능: 3차 smoothstep 이징 t²(3-2t)
  // 입력 파라미터: t (Number) [0,1]
  // 리턴 타입: Number [0,1]
  function _smoothstep(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t * t * (3 - 2 * t);
  }

  // 함수 이름: init
  // 함수 기능: 22² XY 격자 생성, z 깊이 사전 계산, Phase B/C 각도 사전 계산,
  //           BoxGeometry InstancedMesh (2.5D 입체 화살표) 초기화
  // 입력 파라미터: scene (THREE.Scene)
  // 리턴 타입: void
  function init(scene) {
    _scene = scene;
    var N  = PARAMS.gridN;
    _TOTAL = N * N;
    _gridPos      = new Float32Array(_TOTAL * 3);
    _rndAngle     = new Float32Array(_TOTAL);
    _clusterAngle = new Float32Array(_TOTAL);
    _colorGroup   = new Uint8Array(_TOTAL);

    var step = PARAMS.gridHalf * 2 / N;

    var i = 0;
    for (var ix = 0; ix < N; ix++) {
      for (var iy = 0; iy < N; iy++, i++) {
        var gx   = -PARAMS.gridHalf + (ix + 0.5) * step;
        var gy   = -PARAMS.gridHalf + (iy + 0.5) * step;
        var dist = Math.sqrt(gx*gx + gy*gy);

        _gridPos[i*3]   = gx;
        _gridPos[i*3+1] = gy;
        // z 깊이: 중심 z=0, 외곽 z=-dist×0.12 — 원근 + 조명이 깊이감 생성
        _gridPos[i*3+2] = -dist * 0.12;

        // Phase B 각도: 중심에서 방사형(radial) + 개별 노이즈 (±0.5 rad)
        // 방사형 → 중앙에서 폭발하듯 흩어지는 시각 효과
        var radialA = dist > 0.01 ? Math.atan2(gy, gx) : _rnd(i * 11) * Math.PI * 2;
        _rndAngle[i] = radialA + (_rnd(i * 7 + 1) - 0.5) * 1.0;

        // Phase C 각도: 최근접 클러스터 방향
        var bestD2 = Infinity, bestC = 0;
        for (var c = 0; c < CLUSTERS.length; c++) {
          var ddx = CLUSTERS[c].x - gx;
          var ddy = CLUSTERS[c].y - gy;
          var d2  = ddx*ddx + ddy*ddy;
          if (d2 < bestD2) { bestD2 = d2; bestC = c; }
        }
        _clusterAngle[i] = Math.atan2(CLUSTERS[bestC].y - gy, CLUSTERS[bestC].x - gx);

        _colorGroup[i] = Math.floor(_rnd(i * 17 + 3) * 5);
      }
    }

    // BoxGeometry: 얇고 긴 박스 (arrowD 두께가 측면 입체감 생성)
    var geo = new THREE.BoxGeometry(PARAMS.arrowW, PARAMS.arrowH, PARAMS.arrowD);
    var mat = new THREE.MeshLambertMaterial({ color: 0xffffff });

    _mesh = new THREE.InstancedMesh(geo, mat, _TOTAL);
    _mesh.frustumCulled = false;
    _scene.add(_mesh);

    _dummy = new THREE.Object3D();
    _zAxis = new THREE.Vector3(0, 0, 1);
    _color = new THREE.Color();
  }

  // 함수 이름: update
  // 함수 기능: globalT 3단계에 따른 Z축 회전각 결정 및 색상 갱신.
  //   Phase A: fixedAngle (단위벡터 보간으로 부드럽게 시작)
  //   Phase B: radial+noise 각도, 시간 wobble 추가 (t 기반)
  //   Phase C: noise→clusterAngle 수렴, wobble 점감
  //   단위벡터(cos/sin) 보간 → atan2 — 각도 래핑 없는 최단 경로 보간
  // 입력 파라미터: globalT (Number) 0→1 / t (Number) 연속 경과 시간(초)
  // 리턴 타입: void
  function update(globalT, t) {
    var tA    = PARAMS.phaseA;   // 0.30
    var tB    = PARAMS.phaseB;   // 0.65
    var fixedA = PARAMS.fixedAngle;

    for (var i = 0; i < _TOTAL; i++) {
      var gx = _gridPos[i*3], gy = _gridPos[i*3+1], gz = _gridPos[i*3+2];

      var angle;

      if (globalT <= tA) {
        // Phase A: 모든 화살표 동일 각도 (고정)
        angle = fixedA;

      } else if (globalT <= tB) {
        // Phase A→B: 고정 각도 → 방사형+노이즈 각도
        var prog = _smoothstep((globalT - tA) / (tB - tA));
        // 시간 wobble — Phase B에서 화살표들이 살짝 흔들림
        var noiseA = _rndAngle[i] + Math.sin(t * 1.4 + i * 0.07) * 0.40;
        var fx = Math.cos(fixedA) * (1 - prog) + Math.cos(noiseA) * prog;
        var fy = Math.sin(fixedA) * (1 - prog) + Math.sin(noiseA) * prog;
        angle = Math.atan2(fy, fx);

      } else {
        // Phase B→C: 방사형+노이즈 → 클러스터 방향 수렴
        var prog = _smoothstep((globalT - tB) / (1.0 - tB));
        // wobble 강도는 수렴할수록 점감
        var wobble = Math.sin(t * 1.4 + i * 0.07) * 0.40 * (1 - prog);
        var noiseA = _rndAngle[i] + wobble;
        var fx = Math.cos(noiseA) * (1 - prog) + Math.cos(_clusterAngle[i]) * prog;
        var fy = Math.sin(noiseA) * (1 - prog) + Math.sin(_clusterAngle[i]) * prog;
        angle = Math.atan2(fy, fx);
      }

      _dummy.position.set(gx, gy, gz);
      _dummy.quaternion.setFromAxisAngle(_zAxis, angle);
      _dummy.scale.setScalar(1);
      _dummy.updateMatrix();
      _mesh.setMatrixAt(i, _dummy.matrix);

      // 색상: Phase C 진행도에 따라 팔레트→lime 보간 (수렴 핫스팟 강조)
      var convScore = globalT > tB ? (globalT - tB) / (1.0 - tB) : 0;
      var base = _PALETTE[_colorGroup[i]];
      var lime = _PALETTE[5];
      var tc = Math.max(0, Math.min(1, (convScore - 0.48) / 0.40));
      _color.setRGB(
        base[0] + (lime[0] - base[0]) * tc,
        base[1] + (lime[1] - base[1]) * tc,
        base[2] + (lime[2] - base[2]) * tc
      );
      _mesh.setColorAt(i, _color);
    }

    _mesh.instanceMatrix.needsUpdate = true;
    if (_mesh.instanceColor) _mesh.instanceColor.needsUpdate = true;
  }

  return { init: init, update: update };

})();
