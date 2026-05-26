// 최신화 260526
// 최신화내용: 신규 — 3D 가우시안 분포 입자, 직선 이동, vertex color 꼬리 시스템,
//            scatter/converge/peak/release 4단계 위치 보간
// 스크립트 이름: ParticleSystem.js
// 스크립트 기능: 500개 구형 입자(#171839)와 꼬리 선으로 Flow Matching 노이즈→형상 수렴 시각화.
//   scatter  : 가우시안 초기 위치에서 느린 진동
//   converge : 현재 위치 → 형상 타깃 직선 이동 (꼬리 활성)
//   peak     : 형상 위치 도달, 꼬리 페이드아웃
//   release  : 형상 위치 → 가우시안 산란 위치 직선 이동 (꼬리 활성, 점차 페이드)
//
// [ 핵심 구조 ]
//   _mesh      — SphereGeometry(0.28) InstancedMesh (500개)
//   _trails    — THREE.Line 배열 (500개, vertexColors)
//   _trailBuf  — Float32Array (TOTAL × TRAIL_LEN × 3) XYZ 링 버퍼
//   _trailHead — Uint8Array (TOTAL) 쓰기 커서
//   _pos       — Float32Array (TOTAL×3) 현재 위치
//   _p0        — Float32Array (TOTAL×3) 페이즈 시작 위치
//   _p1        — Float32Array (TOTAL×3) 페이즈 목표 위치
//
// 입력 파라미터: tokens.js의 PARAMS, COLORS, BG_R/G/B (전역)

var ParticleSystem = (function () {

  var _scene, _mesh, _TOTAL, _TRAIL_LEN;
  var _dummy;
  var _pos;          // Float32Array (TOTAL*3) 현재 위치
  var _p0;           // Float32Array (TOTAL*3) 페이즈 시작 위치
  var _p1;           // Float32Array (TOTAL*3) 페이즈 목표 위치
  var _shapePts;     // Float32Array (TOTAL*3) 현재 수렴 형상 목표점
  var _scatterFreq;  // Float32Array (TOTAL) 산란 진동 주파수
  var _scatterPhase; // Float32Array (TOTAL*3) 산란 진동 위상 (XYZ)
  var _trailBuf;     // Float32Array (TOTAL * TRAIL_LEN * 3)
  var _trailHead;    // Uint8Array (TOTAL) 링 버퍼 쓰기 커서
  var _trails;       // THREE.Line 배열
  var _releaseCount = 0;

  // 함수 이름: _rnd
  // 함수 기능: seed → [0,1) 결정론적 의사난수
  // 입력 파라미터: seed (Number)
  // 리턴 타입: Number [0,1)
  function _rnd(seed) {
    return ((Math.sin(seed * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
  }

  // 함수 이름: _gauss
  // 함수 기능: Box-Muller 변환으로 결정론적 표준 가우시안 난수 생성
  // 입력 파라미터: seed (Number)
  // 리턴 타입: Number (표준 정규 분포)
  function _gauss(seed) {
    var u = _rnd(seed)     * 0.9998 + 0.0001;
    var v = _rnd(seed + 1) * 0.9998 + 0.0001;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
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
  // 함수 기능: 가우시안 초기 위치·진동 파라미터·꼬리 버퍼 초기화,
  //           SphereGeometry InstancedMesh + Line 꼬리 배열 생성
  // 입력 파라미터: scene (THREE.Scene)
  // 리턴 타입: void
  function init(scene) {
    _scene     = scene;
    _TOTAL     = PARAMS.particleCount;
    _TRAIL_LEN = PARAMS.trailLen;

    _pos        = new Float32Array(_TOTAL * 3);
    _p0         = new Float32Array(_TOTAL * 3);
    _p1         = new Float32Array(_TOTAL * 3);
    _shapePts   = new Float32Array(_TOTAL * 3);
    _scatterFreq  = new Float32Array(_TOTAL);
    _scatterPhase = new Float32Array(_TOTAL * 3);
    _trailBuf   = new Float32Array(_TOTAL * _TRAIL_LEN * 3);
    _trailHead  = new Uint8Array(_TOTAL);

    var sigma = PARAMS.particleSigma;
    for (var i = 0; i < _TOTAL; i++) {
      _pos[i*3]   = _gauss(i*7+1) * sigma;
      _pos[i*3+1] = _gauss(i*7+3) * sigma;
      _pos[i*3+2] = _gauss(i*7+5) * sigma;
      _p0[i*3]    = _pos[i*3];
      _p0[i*3+1]  = _pos[i*3+1];
      _p0[i*3+2]  = _pos[i*3+2];
      _p1[i*3]    = _pos[i*3];
      _p1[i*3+1]  = _pos[i*3+1];
      _p1[i*3+2]  = _pos[i*3+2];

      _scatterFreq[i]    = 0.18 + _rnd(i*11)    * 0.25;
      _scatterPhase[i*3]   = _rnd(i*13+0) * Math.PI * 2;
      _scatterPhase[i*3+1] = _rnd(i*13+1) * Math.PI * 2;
      _scatterPhase[i*3+2] = _rnd(i*13+2) * Math.PI * 2;
    }

    // 구형 입자 InstancedMesh (#171839 고정색)
    var geo = new THREE.SphereGeometry(0.28, 6, 4);
    var mat = new THREE.MeshLambertMaterial({ color: COLORS.particle });
    _mesh = new THREE.InstancedMesh(geo, mat, _TOTAL);
    _mesh.frustumCulled = false;
    _scene.add(_mesh);

    _dummy = new THREE.Object3D();

    // 꼬리 Line 배열 (vertexColors: true)
    _trails = [];
    for (var i = 0; i < _TOTAL; i++) {
      var tGeo = new THREE.BufferGeometry();
      tGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(_TRAIL_LEN * 3), 3));
      tGeo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(_TRAIL_LEN * 3), 3));
      var tMat = new THREE.LineBasicMaterial({ vertexColors: true });
      var line = new THREE.Line(tGeo, tMat);
      line.frustumCulled = false;
      _scene.add(line);
      _trails.push(line);
    }
  }

  // 함수 이름: assignTargets
  // 함수 기능: 형상 점군을 각 입자의 목표 위치(_shapePts)로 복사
  // 입력 파라미터: shapePoints (Float32Array) TOTAL×3 형상 점군
  // 리턴 타입: void
  function assignTargets(shapePoints) {
    for (var i = 0; i < _TOTAL * 3; i++) {
      _shapePts[i] = shapePoints[i];
    }
  }

  // 함수 이름: _resetTrailAt
  // 함수 기능: 입자 i의 꼬리 링 버퍼를 지정 위치로 초기화, 커서 리셋
  // 입력 파라미터: i (Number), px/py/pz (Number) 초기화 기준 위치
  // 리턴 타입: void
  function _resetTrailAt(i, px, py, pz) {
    var base = i * _TRAIL_LEN * 3;
    for (var k = 0; k < _TRAIL_LEN; k++) {
      _trailBuf[base + k*3]   = px;
      _trailBuf[base + k*3+1] = py;
      _trailBuf[base + k*3+2] = pz;
    }
    _trailHead[i] = 0;
  }

  // 함수 이름: onEnterConverge
  // 함수 기능: converge 진입 시 호출. 시작=현재 위치, 목표=형상 위치 설정, 꼬리 리셋
  // 입력 파라미터: 없음
  // 리턴 타입: void
  function onEnterConverge() {
    for (var i = 0; i < _TOTAL; i++) {
      _p0[i*3]   = _pos[i*3];
      _p0[i*3+1] = _pos[i*3+1];
      _p0[i*3+2] = _pos[i*3+2];
      _p1[i*3]   = _shapePts[i*3];
      _p1[i*3+1] = _shapePts[i*3+1];
      _p1[i*3+2] = _shapePts[i*3+2];
      _resetTrailAt(i, _pos[i*3], _pos[i*3+1], _pos[i*3+2]);
    }
  }

  // 함수 이름: onEnterRelease
  // 함수 기능: release 진입 시 호출. 시작=현재 위치, 목표=새 가우시안 산란 위치, 꼬리 리셋
  // 입력 파라미터: 없음
  // 리턴 타입: void
  function onEnterRelease() {
    _releaseCount++;
    var sigma = PARAMS.particleSigma;
    for (var i = 0; i < _TOTAL; i++) {
      _p0[i*3]   = _pos[i*3];
      _p0[i*3+1] = _pos[i*3+1];
      _p0[i*3+2] = _pos[i*3+2];
      // 매 cycle마다 다른 seed로 새 산란 위치 생성
      var s = i * 31 + _releaseCount * 1000;
      _p1[i*3]   = _gauss(s + 1) * sigma;
      _p1[i*3+1] = _gauss(s + 3) * sigma;
      _p1[i*3+2] = _gauss(s + 5) * sigma;
      _resetTrailAt(i, _pos[i*3], _pos[i*3+1], _pos[i*3+2]);
    }
  }

  // 함수 이름: _writeTrail
  // 함수 기능: 입자 i의 현재 XYZ 위치를 링 버퍼에 기록, 커서 전진
  // 입력 파라미터: i (Number), px/py/pz (Number)
  // 리턴 타입: void
  function _writeTrail(i, px, py, pz) {
    var base = i * _TRAIL_LEN * 3;
    _trailBuf[base + _trailHead[i]*3]   = px;
    _trailBuf[base + _trailHead[i]*3+1] = py;
    _trailBuf[base + _trailHead[i]*3+2] = pz;
    _trailHead[i] = (_trailHead[i] + 1) % _TRAIL_LEN;
  }

  // 함수 이름: _updateTrailLine
  // 함수 기능: 입자 i의 꼬리 Line 위치·색상 갱신.
  //           k=0(가장 오래된 점, 배경색) → k=TRAIL_LEN-1(최신, 입자색) vertex color 페이드.
  //           trailFade=0이면 모든 점 배경색 (시각적으로 투명)
  // 입력 파라미터: i (Number), trailFade (Number) [0,1] 꼬리 밝기 계수
  // 리턴 타입: void
  function _updateTrailLine(i, trailFade) {
    var line   = _trails[i];
    var posArr = line.geometry.attributes.position.array;
    var colArr = line.geometry.attributes.color.array;
    var bgR = BG_R/255, bgG = BG_G/255, bgB = BG_B/255;
    // #171839 = r:23, g:24, b:57
    var pR = 23/255, pG = 24/255, pB = 57/255;
    var base = i * _TRAIL_LEN * 3;

    for (var k = 0; k < _TRAIL_LEN; k++) {
      var bufIdx = (_trailHead[i] + k) % _TRAIL_LEN;  // k=0: 가장 오래된 점
      var alpha  = (k / (_TRAIL_LEN - 1)) * trailFade;
      posArr[k*3]   = _trailBuf[base + bufIdx*3];
      posArr[k*3+1] = _trailBuf[base + bufIdx*3+1];
      posArr[k*3+2] = _trailBuf[base + bufIdx*3+2];
      colArr[k*3]   = bgR + (pR - bgR) * alpha;
      colArr[k*3+1] = bgG + (pG - bgG) * alpha;
      colArr[k*3+2] = bgB + (pB - bgB) * alpha;
    }

    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.attributes.color.needsUpdate    = true;
  }

  // 함수 이름: update
  // 함수 기능: phase/phaseT에 따라 입자 XYZ 위치 보간, 꼬리 갱신, InstancedMesh 갱신
  //   scatter  : _p1 기준 느린 진동 (산란 상태)
  //   converge : _p0 → _p1 직선 smoothstep 보간 (꼬리 활성)
  //   peak     : 형상 위치 미세 진동 (꼬리 페이드아웃)
  //   release  : _p0 → _p1 직선 보간 (꼬리 활성 후 점차 페이드)
  // 입력 파라미터: phase (string), phaseT (Number) [0,1], t (Number) 연속 경과초
  // 리턴 타입: void
  function update(phase, phaseT, t) {
    // 꼬리 페이드 계수 결정
    var trailFade;
    if (phase === 'converge') {
      trailFade = 1.0;
    } else if (phase === 'peak') {
      trailFade = Math.max(0, 1.0 - _smoothstep(phaseT * 3));
    } else if (phase === 'release') {
      trailFade = Math.max(0, 1.0 - _smoothstep(phaseT * 1.4));
    } else {
      trailFade = 0;
    }

    var doWriteTrail = (phase === 'converge' || phase === 'release');

    for (var i = 0; i < _TOTAL; i++) {
      var px, py, pz, st, f;

      if (phase === 'scatter') {
        f  = _scatterFreq[i];
        px = _p1[i*3]   + Math.sin(t * f + _scatterPhase[i*3])   * 0.75;
        py = _p1[i*3+1] + Math.sin(t * f + _scatterPhase[i*3+1]) * 0.75;
        pz = _p1[i*3+2] + Math.sin(t * f + _scatterPhase[i*3+2]) * 0.75;

      } else if (phase === 'converge') {
        st = _smoothstep(phaseT);
        px = _p0[i*3]   + st * (_p1[i*3]   - _p0[i*3]);
        py = _p0[i*3+1] + st * (_p1[i*3+1] - _p0[i*3+1]);
        pz = _p0[i*3+2] + st * (_p1[i*3+2] - _p0[i*3+2]);

      } else if (phase === 'peak') {
        f  = _scatterFreq[i] * 2;
        px = _shapePts[i*3]   + Math.sin(t * f + _scatterPhase[i*3])   * 0.18;
        py = _shapePts[i*3+1] + Math.sin(t * f + _scatterPhase[i*3+1]) * 0.18;
        pz = _shapePts[i*3+2] + Math.sin(t * f + _scatterPhase[i*3+2]) * 0.18;

      } else {  // release
        st = _smoothstep(phaseT);
        px = _p0[i*3]   + st * (_p1[i*3]   - _p0[i*3]);
        py = _p0[i*3+1] + st * (_p1[i*3+1] - _p0[i*3+1]);
        pz = _p0[i*3+2] + st * (_p1[i*3+2] - _p0[i*3+2]);
      }

      _pos[i*3] = px; _pos[i*3+1] = py; _pos[i*3+2] = pz;

      if (doWriteTrail) _writeTrail(i, px, py, pz);
      if (trailFade > 0.001) _updateTrailLine(i, trailFade);

      _dummy.position.set(px, py, pz);
      _dummy.scale.setScalar(1);
      _dummy.updateMatrix();
      _mesh.setMatrixAt(i, _dummy.matrix);
    }

    _mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    init            : init,
    assignTargets   : assignTargets,
    onEnterConverge : onEnterConverge,
    onEnterRelease  : onEnterRelease,
    update          : update
  };

})();
