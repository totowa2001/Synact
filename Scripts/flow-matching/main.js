// 최신화 260526
// 최신화내용: 전면 재설계 — scatter/converge/peak/release 4단계 상태머신,
//            구면 궤도 카메라, ArrowField + ParticleSystem 통합
// 스크립트 이름: main.js
// 스크립트 기능: Three.js 씬 초기화, PerspectiveCamera 구면 궤도, 4단계 상태머신 애니메이션.
//              scatter→converge→peak→release→scatter... 무한 반복 (4가지 형상 순환)
// 입력 파라미터: tokens.js / Shapes.js / ArrowField.js / ParticleSystem.js (전역)

(function () {

  var _renderer, _scene, _camera, _clock;
  var _theta = 0.5, _phi = Math.PI * 0.32, _radius;
  var _isDragging = false, _prevMX = 0, _prevMY = 0;

  // ================================================================
  // 상태 머신
  // ================================================================

  var _phase     = 'scatter';
  var _phaseT    = 0;
  var _prevPhase = '';
  var _shapeIdx  = 0;
  var _SHAPE_COUNT = 4;

  // 페이즈별 지속 시간 (seconds)
  var _DUR = {
    scatter : PARAMS.scatterDur,
    converge: PARAMS.convergeDur,
    peak    : PARAMS.peakDur,
    release : PARAMS.releaseDur
  };

  // 페이즈 전환 순서
  var _NEXT = {
    scatter : 'converge',
    converge: 'peak',
    peak    : 'release',
    release : 'scatter'
  };

  // 함수 이름: _onPhaseEnter
  // 함수 기능: 새 페이즈 진입 시 콜백 — 형상 할당, 입자/화살표 초기화, 형상 인덱스 순환
  // 입력 파라미터: phase (string) 진입 페이즈
  // 리턴 타입: void
  function _onPhaseEnter(phase) {
    if (phase === 'converge') {
      var shapes = SHAPES.get();
      ArrowField.setShape(shapes[_shapeIdx]);
      ParticleSystem.assignTargets(shapes[_shapeIdx]);
      ParticleSystem.onEnterConverge();
    }
    if (phase === 'release') {
      ParticleSystem.onEnterRelease();
    }
    if (phase === 'scatter' && _prevPhase === 'release') {
      _shapeIdx = (_shapeIdx + 1) % _SHAPE_COUNT;
    }
  }

  // ================================================================
  // 씬 초기화
  // ================================================================

  // 함수 이름: _initScene
  // 함수 기능: 렌더러·씬·카메라·안개·3점 조명 초기화
  // 입력 파라미터: 없음
  // 리턴 타입: void
  function _initScene() {
    _radius = PARAMS.camRadius;

    _renderer = new THREE.WebGLRenderer({ antialias: true });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(_renderer.domElement);

    _scene = new THREE.Scene();
    _scene.background = COLORS.bgColor();
    _scene.fog = new THREE.FogExp2(COLORS.bgColor(), PARAMS.fogDensity);

    _camera = new THREE.PerspectiveCamera(
      PARAMS.camFOV, window.innerWidth / window.innerHeight, 0.1, 400
    );
    _updateCamera();

    _clock = new THREE.Clock();

    // 3점 조명
    var ambient = new THREE.AmbientLight(0xffffff, 0.45);
    _scene.add(ambient);

    var dirMain = new THREE.DirectionalLight(0xffffff, 1.20);
    dirMain.position.set(3, 5, 2);
    _scene.add(dirMain);

    var dirFill = new THREE.DirectionalLight(0x9BB5D0, 0.35);
    dirFill.position.set(-3, -2, -4);
    _scene.add(dirFill);

    window.addEventListener('resize', function () {
      _camera.aspect = window.innerWidth / window.innerHeight;
      _camera.updateProjectionMatrix();
      _renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // 함수 이름: _updateCamera
  // 함수 기능: 구면 좌표(_theta, _phi, _radius) → 카메라 위치 갱신
  // 입력 파라미터: 없음
  // 리턴 타입: void
  function _updateCamera() {
    _camera.position.set(
      _radius * Math.sin(_phi) * Math.sin(_theta),
      _radius * Math.cos(_phi),
      _radius * Math.sin(_phi) * Math.cos(_theta)
    );
    _camera.lookAt(0, 0, 0);
  }

  // ================================================================
  // 카메라 조작
  // ================================================================

  // 함수 이름: _initControls
  // 함수 기능: 마우스 드래그·휠·터치 이벤트 등록
  // 입력 파라미터: 없음
  // 리턴 타입: void
  function _initControls() {
    var el = _renderer.domElement;

    el.addEventListener('mousedown', function (e) {
      _isDragging = true; _prevMX = e.clientX; _prevMY = e.clientY;
    });
    window.addEventListener('mouseup', function () { _isDragging = false; });
    window.addEventListener('mousemove', function (e) {
      if (!_isDragging) return;
      _theta -= (e.clientX - _prevMX) * 0.007;
      _phi    = Math.max(0.06, Math.min(Math.PI - 0.06, _phi - (e.clientY - _prevMY) * 0.007));
      _prevMX = e.clientX; _prevMY = e.clientY;
      _updateCamera();
    });
    el.addEventListener('wheel', function (e) {
      _radius = Math.max(20, Math.min(120, _radius + e.deltaY * 0.04));
      _updateCamera();
    }, { passive: true });

    el.addEventListener('touchstart', function (e) {
      _isDragging = true;
      _prevMX = e.touches[0].clientX; _prevMY = e.touches[0].clientY;
    });
    el.addEventListener('touchend',  function () { _isDragging = false; });
    el.addEventListener('touchmove', function (e) {
      if (!_isDragging) return;
      _theta -= (e.touches[0].clientX - _prevMX) * 0.007;
      _phi    = Math.max(0.06, Math.min(Math.PI - 0.06, _phi - (e.touches[0].clientY - _prevMY) * 0.007));
      _prevMX = e.touches[0].clientX; _prevMY = e.touches[0].clientY;
      _updateCamera();
    });
  }

  // ================================================================
  // 애니메이션 루프
  // ================================================================

  // 함수 이름: _animate
  // 함수 기능: requestAnimationFrame 루프 — 상태머신 진행 → 자동 카메라 공전 → 모듈 업데이트 → 렌더
  //           getDelta() 먼저 호출 후 getElapsedTime() (Three.js r128 클록 순서 주의)
  // 입력 파라미터: 없음
  // 리턴 타입: void
  function _animate() {
    requestAnimationFrame(_animate);

    var dt = _clock.getDelta();
    if (dt > 0.1) dt = 0.1;
    var t  = _clock.getElapsedTime();

    // 상태 머신 진행
    _phaseT += dt / _DUR[_phase];
    if (_phaseT >= 1.0) {
      _phaseT    = 0;
      _prevPhase = _phase;
      _phase     = _NEXT[_phase];
      _onPhaseEnter(_phase);
    }

    // 드래그 중이 아닐 때 자동 공전
    if (!_isDragging) {
      _theta += PARAMS.camAutoRot * 60 * dt;
      _updateCamera();
    }

    ArrowField.update(_phase, _phaseT, t);
    ParticleSystem.update(_phase, _phaseT, t);
    _renderer.render(_scene, _camera);
  }

  // ================================================================
  // 진입점
  // ================================================================

  // 함수 이름: _start
  // 함수 기능: 씬·컨트롤·레이어 초기화, 형상 사전 생성, 애니메이션 시작
  // 입력 파라미터: 없음
  // 리턴 타입: void
  function _start() {
    _initScene();
    _initControls();
    ArrowField.init(_scene);
    ParticleSystem.init(_scene);
    SHAPES.get();  // 형상 사전 생성 (converge 진입 시 stutter 방지)
    _animate();
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(_start);
  } else {
    window.addEventListener('load', _start);
  }

})();
