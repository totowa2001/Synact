// 최신화 260525
// 최신화내용: 균등 12³ 격자 분포 + 사전 계산 방향 + globalT 기반 방향 보간 전면 재설계
// 스크립트 이름: ArrowField.js
// 스크립트 기능: 월드 전체에 12³=1728개 화살표를 균등 격자로 배치.
//               init에서 랜덤 방향(_rndDir)과 최근접 클러스터 방향(_clusterDir)을 사전 계산.
//               update(globalT)에서 globalT² 이징으로 랜덤→클러스터 방향 보간.
//               globalT가 높을수록 화살표들이 각자의 최근접 클러스터 방향으로 정렬됨.
//
// [ 핵심 구조 ]
//   _boxMesh    — 3D 화살표(샤프트+콘 헤드) InstancedMesh (12³=1728개)
//   _rndDir     — Float32Array (TOTAL*3) 초기 랜덤 단위벡터 (결정론적)
//   _clusterDir — Float32Array (TOTAL*3) 최근접 클러스터 방향 단위벡터
//   _gridPos    — Float32Array (TOTAL*3) 균등 격자 좌표
//   _colorGroup — Uint8Array (TOTAL) 픽셀별 고정 팔레트 인덱스
//
// 입력 파라미터: tokens.js의 CLUSTERS, PARAMS / THREE.BufferGeometryUtils (전역)

var ArrowField = (function () {

  var _scene;
  var _TOTAL;
  var _gridPos;      // Float32Array (TOTAL * 3) — 균등 격자 좌표
  var _rndDir;       // Float32Array (TOTAL * 3) — 초기 랜덤 단위벡터
  var _clusterDir;   // Float32Array (TOTAL * 3) — 최근접 클러스터 방향 단위벡터
  var _colorGroup;   // Uint8Array (TOTAL) — 픽셀별 고정 팔레트 인덱스

  var _boxMesh;

  var _dummy = null;
  var _yAxis = null;
  var _dir   = null;
  var _color = null;

  // 브랜드 컬러 팔레트 (인덱스 5: lime = 수렴 핫스팟 전용)
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

  // 함수 이름: _rndUnit
  // 함수 기능: seed 기반 결정론적 랜덤 단위벡터를 out 배열의 idx 위치에 기록
  // 입력 파라미터: seed (Number) / out (Float32Array) / idx (Number) 시작 인덱스
  // 리턴 타입: void
  function _rndUnit(seed, out, idx) {
    var theta = 2 * Math.PI * _rnd(seed);
    var phi   = Math.acos(1 - 2 * _rnd(seed + 1));
    out[idx]   = Math.sin(phi) * Math.cos(theta);
    out[idx+1] = Math.cos(phi);
    out[idx+2] = Math.sin(phi) * Math.sin(theta);
  }

  // 함수 이름: init
  // 함수 기능: 균등 12³ 격자 좌표 생성, 랜덤/클러스터 방향 사전 계산, 3D 화살표 InstancedMesh 초기화
  // 입력 파라미터: scene (THREE.Scene)
  // 리턴 타입: void
  function init(scene) {
    _scene = scene;
    var N  = PARAMS.gridN;
    _TOTAL = N * N * N;
    _gridPos    = new Float32Array(_TOTAL * 3);
    _rndDir     = new Float32Array(_TOTAL * 3);
    _clusterDir = new Float32Array(_TOTAL * 3);
    _colorGroup = new Uint8Array(_TOTAL);

    var step = PARAMS.gridHalf * 2 / N;

    var i = 0;
    for (var ix = 0; ix < N; ix++) {
      for (var iy = 0; iy < N; iy++) {
        for (var iz = 0; iz < N; iz++, i++) {
          var gx = -PARAMS.gridHalf + (ix + 0.5) * step;
          var gy = -PARAMS.gridHalf + (iy + 0.5) * step;
          var gz = -PARAMS.gridHalf + (iz + 0.5) * step;
          _gridPos[i*3]   = gx;
          _gridPos[i*3+1] = gy;
          _gridPos[i*3+2] = gz;

          // 결정론적 랜덤 단위벡터
          _rndUnit(i * 7 + 3, _rndDir, i * 3);

          // 최근접 클러스터 방향
          var bestD2 = Infinity, bestC = 0;
          for (var c = 0; c < CLUSTERS.length; c++) {
            var ddx = CLUSTERS[c].x - gx;
            var ddy = CLUSTERS[c].y - gy;
            var ddz = CLUSTERS[c].z - gz;
            var d2  = ddx*ddx + ddy*ddy + ddz*ddz;
            if (d2 < bestD2) { bestD2 = d2; bestC = c; }
          }
          var cdx = CLUSTERS[bestC].x - gx;
          var cdy = CLUSTERS[bestC].y - gy;
          var cdz = CLUSTERS[bestC].z - gz;
          var clen = Math.sqrt(cdx*cdx + cdy*cdy + cdz*cdz);
          if (clen < 0.0001) { cdx = 0; cdy = 1; cdz = 0; }
          else { cdx /= clen; cdy /= clen; cdz /= clen; }
          _clusterDir[i*3]   = cdx;
          _clusterDir[i*3+1] = cdy;
          _clusterDir[i*3+2] = cdz;

          // 팔레트 인덱스 (0~4: 파란 계열)
          _colorGroup[i] = Math.floor(_rnd(i * 17 + 3) * 5);
        }
      }
    }

    // 3D 화살표: 샤프트(원기둥) + 헤드(원뿔) 병합
    // tip이 +Y → setFromUnitVectors(_yAxis, _dir)로 흐름 방향 정렬
    var shaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.70, 6);
    var headGeo  = new THREE.ConeGeometry(0.14, 0.30, 6);
    headGeo.translate(0, 0.50, 0);
    var arrowGeo = THREE.BufferGeometryUtils.mergeBufferGeometries([shaftGeo, headGeo]);
    arrowGeo.computeVertexNormals();
    var mat = new THREE.MeshLambertMaterial({ color: 0xffffff });

    _boxMesh = new THREE.InstancedMesh(arrowGeo, mat, _TOTAL);
    _boxMesh.frustumCulled = false;
    _scene.add(_boxMesh);

    _dummy = new THREE.Object3D();
    _yAxis = new THREE.Vector3(0, 1, 0);
    _dir   = new THREE.Vector3();
    _color = new THREE.Color();
  }

  // 함수 이름: update
  // 함수 기능: globalT 기반으로 각 화살표의 방향을 랜덤→클러스터 방향으로 보간,
  //           크기·색상 갱신. globalT²으로 이징하여 후반부에 급격히 정렬됨.
  // 입력 파라미터: globalT (Number) 0→1 진행도
  // 리턴 타입: void
  function update(globalT) {
    var baseSize = PARAMS.pixelBaseSize;
    var tSq = globalT * globalT;

    for (var i = 0; i < _TOTAL; i++) {
      var gx = _gridPos[i*3], gy = _gridPos[i*3+1], gz = _gridPos[i*3+2];

      // 랜덤 방향 → 클러스터 방향 선형 보간 (tSq 이징 적용)
      var rdx = _rndDir[i*3],     rdy = _rndDir[i*3+1],     rdz = _rndDir[i*3+2];
      var cdx = _clusterDir[i*3], cdy = _clusterDir[i*3+1], cdz = _clusterDir[i*3+2];
      var fdx = rdx + (cdx - rdx) * tSq;
      var fdy = rdy + (cdy - rdy) * tSq;
      var fdz = rdz + (cdz - rdz) * tSq;
      var flen = Math.sqrt(fdx*fdx + fdy*fdy + fdz*fdz);
      if (flen < 0.0001) { fdx = 0; fdy = 1; fdz = 0; }
      else { fdx /= flen; fdy /= flen; fdz /= flen; }
      _dir.set(fdx, fdy, fdz);

      // 스케일: globalT가 높을수록 약간 커짐 (수렴 강조)
      var sz = baseSize * (0.8 + 0.4 * tSq);

      _dummy.position.set(gx, gy, gz);
      _dummy.quaternion.setFromUnitVectors(_yAxis, _dir);
      _dummy.scale.set(sz, sz, sz);
      _dummy.updateMatrix();
      _boxMesh.setMatrixAt(i, _dummy.matrix);

      // 색상: tSq > 0.5 구간에서 팔레트→lime 보간
      var base = _PALETTE[_colorGroup[i]];
      var lime = _PALETTE[5];
      var tc = (tSq - 0.50) / 0.35;
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
