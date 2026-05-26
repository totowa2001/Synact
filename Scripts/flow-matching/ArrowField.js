// 최신화 260526
// 최신화내용: 개선 — converge 방향·색상 전환을 노이즈 80% 수렴 완료 시점(phaseT≈0.55)까지 지연
// 스크립트 이름: ArrowField.js
// 스크립트 기능: 3D 공간에 10³=1000개 직육면체를 균등 배치하여 벡터장 시각화.
//   scatter   : 결정론적 랜덤 방향 + 느린 wobble
//   converge  : 랜덤 방향 → 형상 수렴 방향 보간
//   peak      : 형상 수렴 방향 고정, #D32677 핫 색상
//   release   : 수렴 방향 유지, 조금 지연 후 랜덤 방향으로 복귀, 색상 냉각
//   setShape  : 입력 형상 점군에서 각 격자점 기준 최근접 방향 사전 계산
//
// [ 핵심 구조 ]
//   _mesh    — BoxGeometry(arrowW, arrowH, arrowD) InstancedMesh (1000개)
//   _gridPos — Float32Array (TOTAL×3) 격자 XYZ 위치
//   _rndDir  — Float32Array (TOTAL×3) 결정론적 랜덤 단위벡터
//   _convDir — Float32Array (TOTAL×3) 수렴 방향 단위벡터 (setShape 시 갱신)
//
// 입력 파라미터: tokens.js의 PARAMS / phase(string), phaseT([0,1]), t(연속 경과초)

var ArrowField = (function () {

  var _scene, _mesh, _TOTAL;
  var _gridPos;    // Float32Array (TOTAL*3)
  var _rndDir;     // Float32Array (TOTAL*3) 결정론적 랜덤 방향
  var _convDir;    // Float32Array (TOTAL*3) 현재 shape 수렴 방향
  var _rndFreq;    // Float32Array (TOTAL) wobble 주파수
  var _rndPhase;   // Float32Array (TOTAL) wobble 위상
  var _dummy, _yAxis, _dir, _color;

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
  // 함수 기능: 10³ 균등 격자 좌표 생성, 결정론적 랜덤 방향 사전 계산,
  //           BoxGeometry InstancedMesh 초기화
  // 입력 파라미터: scene (THREE.Scene)
  // 리턴 타입: void
  function init(scene) {
    _scene = scene;
    var N  = PARAMS.gridN;
    _TOTAL = N * N * N;
    _gridPos  = new Float32Array(_TOTAL * 3);
    _rndDir   = new Float32Array(_TOTAL * 3);
    _convDir  = new Float32Array(_TOTAL * 3);
    _rndFreq  = new Float32Array(_TOTAL);
    _rndPhase = new Float32Array(_TOTAL);

    var step = PARAMS.gridHalf * 2 / N;
    var i = 0;
    for (var ix = 0; ix < N; ix++) {
      for (var iy = 0; iy < N; iy++) {
        for (var iz = 0; iz < N; iz++, i++) {
          _gridPos[i*3]   = -PARAMS.gridHalf + (ix + 0.5) * step;
          _gridPos[i*3+1] = -PARAMS.gridHalf + (iy + 0.5) * step;
          _gridPos[i*3+2] = -PARAMS.gridHalf + (iz + 0.5) * step;

          // 구면 균일 분포로 결정론적 랜덤 방향 생성
          var theta = _rnd(i*3+0) * 2 * Math.PI;
          var phi   = Math.acos(1 - 2 * _rnd(i*3+1));
          _rndDir[i*3]   = Math.sin(phi) * Math.cos(theta);
          _rndDir[i*3+1] = Math.cos(phi);
          _rndDir[i*3+2] = Math.sin(phi) * Math.sin(theta);

          // convDir 초기값 = rndDir
          _convDir[i*3]   = _rndDir[i*3];
          _convDir[i*3+1] = _rndDir[i*3+1];
          _convDir[i*3+2] = _rndDir[i*3+2];

          _rndFreq[i]  = 0.25 + _rnd(i*17)    * 0.40;
          _rndPhase[i] = _rnd(i*19 + 7) * Math.PI * 2;
        }
      }
    }

    var geo = new THREE.BoxGeometry(PARAMS.arrowW, PARAMS.arrowH, PARAMS.arrowD);
    var mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    _mesh = new THREE.InstancedMesh(geo, mat, _TOTAL);
    _mesh.frustumCulled = false;
    _scene.add(_mesh);

    _dummy = new THREE.Object3D();
    _yAxis = new THREE.Vector3(0, 1, 0);
    _dir   = new THREE.Vector3();
    _color = new THREE.Color();
  }

  // 함수 이름: setShape
  // 함수 기능: 수렴 목표 형상 점군으로 각 격자점의 최근접 방향 (convDir) 사전 계산.
  //           O(TOTAL × shapeCount) — 페이즈 전환 시 1회 실행
  // 입력 파라미터: shapePoints (Float32Array) 형상 XYZ 점군
  // 리턴 타입: void
  function setShape(shapePoints) {
    var n = shapePoints.length / 3;
    for (var i = 0; i < _TOTAL; i++) {
      var ax = _gridPos[i*3], ay = _gridPos[i*3+1], az = _gridPos[i*3+2];
      var bestD2 = Infinity, bx = 0, by = 1, bz = 0;
      for (var j = 0; j < n; j++) {
        var dx = shapePoints[j*3]   - ax;
        var dy = shapePoints[j*3+1] - ay;
        var dz = shapePoints[j*3+2] - az;
        var d2 = dx*dx + dy*dy + dz*dz;
        if (d2 < bestD2) { bestD2 = d2; bx = dx; by = dy; bz = dz; }
      }
      var len = Math.sqrt(bx*bx + by*by + bz*bz);
      if (len > 0.001) { bx /= len; by /= len; bz /= len; }
      _convDir[i*3]   = bx;
      _convDir[i*3+1] = by;
      _convDir[i*3+2] = bz;
    }
  }

  // 함수 이름: update
  // 함수 기능: phase/phaseT에 따라 각 직육면체 방향·색상 갱신.
  //   scatter  : rndDir + 느린 wobble
  //   converge : rndDir → convDir 보간
  //   peak     : convDir 고정, #D32677
  //   release  : convDir 유지 후 지연 시작하여 rndDir 복귀, 색상 냉각
  //   직육면체 Y축을 방향 벡터에 정렬 (setFromUnitVectors)
  // 입력 파라미터: phase (string), phaseT (Number) [0,1], t (Number) 연속 경과초
  // 리턴 타입: void
  function update(phase, phaseT, t) {
    // converge: 노이즈가 ~80% 수렴 완료되는 phaseT≈0.55 이후에 방향·색상 전환 시작
    // (입자는 ease-out으로 진행하므로 phaseT=0.55일 때 easeOut(0.55)≈0.80 수렴)
    var CONV_DELAY = 0.55;
    var convProg = 0;
    if (phase === 'converge') {
      var d = Math.max(0, (phaseT - CONV_DELAY) / (1.0 - CONV_DELAY));
      convProg = _smoothstep(d);
    }

    // heat 계수: 0=#515F75, 1=#D32677
    var heat;
    if      (phase === 'peak')     heat = 1.0;
    else if (phase === 'converge') heat = convProg;
    else if (phase === 'release')  heat = 1.0 - _smoothstep(phaseT);
    else                           heat = 0;

    // 색상 성분 (#515F75 ↔ #D32677)
    var vR = 81/255, vG = 95/255, vB = 117/255;
    var pR = 211/255, pG = 38/255, pB = 119/255;

    for (var i = 0; i < _TOTAL; i++) {
      var gx = _gridPos[i*3], gy = _gridPos[i*3+1], gz = _gridPos[i*3+2];
      var dx, dy, dz, len, prog, wobble;

      if (phase === 'scatter') {
        // 결정론적 랜덤 방향 + 느린 wobble
        wobble = Math.sin(t * _rndFreq[i] + _rndPhase[i]) * 0.12;
        dx = _rndDir[i*3]   + wobble;
        dy = _rndDir[i*3+1] + Math.cos(t * _rndFreq[i] * 0.8 + _rndPhase[i]) * 0.10;
        dz = _rndDir[i*3+2] + wobble;
        len = Math.sqrt(dx*dx + dy*dy + dz*dz);
        dx /= len; dy /= len; dz /= len;

      } else if (phase === 'converge') {
        prog = convProg;  // 루프 외부 사전 계산값 (지연 적용)
        dx = _rndDir[i*3]   * (1 - prog) + _convDir[i*3]   * prog;
        dy = _rndDir[i*3+1] * (1 - prog) + _convDir[i*3+1] * prog;
        dz = _rndDir[i*3+2] * (1 - prog) + _convDir[i*3+2] * prog;
        len = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (len > 0.001) { dx /= len; dy /= len; dz /= len; }

      } else if (phase === 'peak') {
        dx = _convDir[i*3];
        dy = _convDir[i*3+1];
        dz = _convDir[i*3+2];

      } else {  // release — 약간 지연 후 rndDir 복귀 (사용자: "조금 이후에 풀려나듯")
        var delayed = Math.max(0, (phaseT - 0.25) / 0.75);
        prog = _smoothstep(delayed);
        dx = _convDir[i*3]   * (1 - prog) + _rndDir[i*3]   * prog;
        dy = _convDir[i*3+1] * (1 - prog) + _rndDir[i*3+1] * prog;
        dz = _convDir[i*3+2] * (1 - prog) + _rndDir[i*3+2] * prog;
        len = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (len > 0.001) { dx /= len; dy /= len; dz /= len; }
      }

      _dir.set(dx, dy, dz);
      _dummy.position.set(gx, gy, gz);
      _dummy.quaternion.setFromUnitVectors(_yAxis, _dir);
      _dummy.scale.setScalar(1);
      _dummy.updateMatrix();
      _mesh.setMatrixAt(i, _dummy.matrix);

      _color.setRGB(
        vR + (pR - vR) * heat,
        vG + (pG - vG) * heat,
        vB + (pB - vB) * heat
      );
      _mesh.setColorAt(i, _color);
    }

    _mesh.instanceMatrix.needsUpdate = true;
    if (_mesh.instanceColor) _mesh.instanceColor.needsUpdate = true;
  }

  return { init: init, setShape: setShape, update: update };

})();
