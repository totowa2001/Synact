// 최신화 260520
// 최신화내용: 정사각 박스 → 얇고 긴 직육면체(0.25×1×0.08)로 교체, 보라색 팔레트 제거
// 스크립트 이름: ArrowField.js
// 스크립트 기능: 3D 픽셀 필드 — 얇고 긴 BoxGeometry(0.25×1×0.08) InstancedMesh.
//               Y축이 흐름 방향에 정렬 → 직육면체 긴 축이 흐름 방향을 향함.
//               수렴 강도에 따라 크기·색상 변조.
//               브랜드 컬러(navy~blue 계열) + 유사색 5색 팔레트, 수렴 핫스팟은 lime.
//
// [ 핵심 구조 ]
//   _boxMesh    — BoxGeometry(0.25,1,0.08) InstancedMesh (TOTAL개)
//                 긴 축(Y)이 흐름 방향 → 스트로크처럼 흐름을 따라 정렬
//   _colorGroup — 픽셀별 고정 팔레트 인덱스 Uint8Array (init에서 1회 결정, 이후 불변)
//   _gridPos    — 구형 산포 좌표 (Float32Array, TOTAL×3)
//
// 입력 파라미터: tokens.js의 COLORS, PARAMS / FlowField.js의 FlowField (전역)

var ArrowField = (function () {

  var _scene;
  var _TOTAL;
  var _gridPos;      // Float32Array (TOTAL * 3)
  var _colorGroup;   // Uint8Array (TOTAL) — 픽셀별 고정 팔레트 인덱스

  var _boxMesh;      // THREE.InstancedMesh — 얇고 긴 직육면체 픽셀

  // 매 프레임 재사용 오브젝트 (GC 방지)
  var _dummy = null;
  var _yAxis = null;  // Y축 기준 회전 (직육면체 긴 축 = 흐름 방향)
  var _dir   = null;
  var _color = null;

  // 브랜드 컬러 + 유사색 5색 팔레트 (보라색 제외)
  // 인덱스 0~4: 파란 계열 메인 / 인덱스 5: lime (수렴 핫스팟 전용)
  var _PALETTE = [
    [ 24/255,  24/255,  88/255],  // 0: primary navy  #181858
    [ 55/255,  83/255, 127/255],  // 1: mid blue       #37537F
    [ 30/255,  52/255, 148/255],  // 2: bright navy    #1E3494 (유사색)
    [ 25/255,  88/255, 170/255],  // 3: light blue     #1958AA (유사색)
    [105/255, 168/255, 220/255],  // 4: sky blue       #69A8DC (유사색)
    [192/255, 255/255,   0/255],  // 5: lime accent    #C0FF00 (수렴 핫스팟 보색 포인트)
  ];

  // ----------------------------------------------------------------

  // 함수 이름: _rnd
  // 함수 기능: seed → [0,1) 결정론적 의사난수 (위치·색상이 매 실행마다 동일하게 재현됨)
  // 입력 파라미터: seed (Number)
  // 리턴 타입: Number [0,1)
  function _rnd(seed) {
    return ((Math.sin(seed * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
  }

  // ----------------------------------------------------------------

  // 함수 이름: init
  // 함수 기능: 구형 산포 좌표 생성, 픽셀별 팔레트 그룹 결정, BoxGeometry InstancedMesh 초기화.
  //           BoxGeometry(0.25, 1, 0.08): 긴 축 Y=1, 폭 X=0.25, 두께 Z=0.08.
  //           Y축 → 흐름 방향 정렬 시 직육면체 긴 면이 흐름을 따라 정렬 → 스트로크 효과.
  // 입력 파라미터: scene (THREE.Scene)
  // 리턴 타입: void
  function init(scene) {
    _scene = scene;
    _TOTAL      = PARAMS.arrowCount;
    _gridPos    = new Float32Array(_TOTAL * 3);
    _colorGroup = new Uint8Array(_TOTAL);

    // 구형 균일 분포 — _rnd로 결정론적 난수, cbrt 적용으로 중심부 과밀 방지
    var R = PARAMS.gridHalf;
    for (var i = 0; i < _TOTAL; i++) {
      var r     = R * Math.pow(_rnd(i * 3),     0.3333);
      var theta = 2 * Math.PI * _rnd(i * 3 + 1);
      var phi   = Math.acos(1 - 2 * _rnd(i * 3 + 2));
      _gridPos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      _gridPos[i*3+1] = r * Math.cos(phi);
      _gridPos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
      // 픽셀별 고정 색상 (0~4: 파란 계열, 5는 lime 핫스팟 전용이므로 제외)
      _colorGroup[i] = Math.floor(_rnd(i * 17 + 3) * 5);
    }

    // 얇고 긴 직육면체: 폭(X)=0.25, 길이(Y)=1.0, 두께(Z)=0.08
    // Y축을 흐름 방향으로 정렬하면 긴 축이 흐름을 따라 배치됨
    var boxGeo = new THREE.BoxGeometry(0.25, 1, 0.08);
    var mat    = new THREE.MeshLambertMaterial({ color: 0xffffff });

    _boxMesh = new THREE.InstancedMesh(boxGeo, mat, _TOTAL);
    _boxMesh.frustumCulled = false;
    _scene.add(_boxMesh);

    _dummy = new THREE.Object3D();
    _yAxis = new THREE.Vector3(0, 1, 0);
    _dir   = new THREE.Vector3();
    _color = new THREE.Color();
  }

  // 함수 이름: update
  // 함수 기능: 매 프레임 모든 픽셀의 방향·크기·색상 갱신.
  //           Y축 → 흐름 방향 / 수렴 점수 → 크기(0.2×~2.8×) + lime 핫스팟 보간.
  //           수렴 강도 0.5~0.85 구간에서 기본 색상 → lime으로 선형 보간.
  // 입력 파라미터: t (Number) 경과 시간(초, animSpeed 적용됨) / dt (Number) 프레임 델타
  // 리턴 타입: void
  function update(t, dt) {
    var baseSize = PARAMS.pixelBaseSize;
    var maxScale = PARAMS.pixelMaxScale;

    for (var i = 0; i < _TOTAL; i++) {
      var gx = _gridPos[i*3], gy = _gridPos[i*3+1], gz = _gridPos[i*3+2];

      // 벡터장 샘플링
      var v    = FlowField.getVector(gx, gy, gz, t);
      var vlen = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);

      // 방향 정규화 (영벡터 방지 — 기본값 Y축 방향)
      var dx, dy, dz;
      if (vlen < 0.0001) {
        dx = 0; dy = 1; dz = 0; vlen = 0.0001;
      } else {
        dx = v.x/vlen; dy = v.y/vlen; dz = v.z/vlen;
      }
      _dir.set(dx, dy, dz);

      // 수렴 점수 → 픽셀 크기
      var conv     = FlowField.getConvergenceScore(gx, gy, gz, t);
      var strength = Math.min(1, vlen * 0.5);
      var sz = baseSize * (0.2 + strength * 0.3 + conv * (maxScale - 1.0));

      // 변환 — 직육면체 Y축(긴 축)을 흐름 방향으로 정렬
      _dummy.position.set(gx, gy, gz);
      _dummy.quaternion.setFromUnitVectors(_yAxis, _dir);
      _dummy.scale.set(sz, sz, sz);
      _dummy.updateMatrix();
      _boxMesh.setMatrixAt(i, _dummy.matrix);

      // 색상 — 수렴 강도에 따라 기본 팔레트 색상 → lime으로 선형 보간
      // tc=0(conv<0.5): 기본 색, tc=1(conv≥0.85): lime 핫스팟
      var base = _PALETTE[_colorGroup[i]];
      var lime = _PALETTE[5];
      var tc = (conv - 0.50) / 0.35;
      if (tc < 0) tc = 0;
      if (tc > 1) tc = 1;
      _color.setRGB(
        base[0] + (lime[0] - base[0]) * tc,
        base[1] + (lime[1] - base[1]) * tc,
        base[2] + (lime[2] - base[2]) * tc
      );
      _boxMesh.setColorAt(i, _color);
    }

    _boxMesh.instanceMatrix.needsUpdate = true;
    if (_boxMesh.instanceColor) _boxMesh.instanceColor.needsUpdate = true;
  }

  return { init: init, update: update };
})();
