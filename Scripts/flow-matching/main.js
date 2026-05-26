// 최신화 260525
// 최신화내용: PerspectiveCamera 전환 (2.5D), 방향광 3점 조명, 휠=카메라 Z 이동
// 스크립트 이름: main.js
// 스크립트 기능: Three.js 씬 초기화, PerspectiveCamera 2.5D 시점, globalT 3단계 사이클 애니메이션
// 입력 파라미터: tokens.js / ArrowField.js / StreamLines.js / ClusterMeshes.js / BBoxLayer.js (전역)

(function () {

  var _renderer, _scene, _camera, _clock;
  var _globalT = 0, _cycleT = 0, _resetT = 0, _inReset = false;

  // ================================================================
  // 씬 초기화
  // ================================================================

  // 함수 이름: _initScene
  // 함수 기능: 렌더러·씬·PerspectiveCamera(2.5D)·3점 조명 초기화
  //           PerspectiveCamera + BoxGeometry + Lambert → 2.5D 입체감 (측면 음영)
  // 입력 파라미터: 없음
  // 리턴 타입: void
  function _initScene() {
    // 렌더러
    _renderer = new THREE.WebGLRenderer({ antialias: true });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(_renderer.domElement);

    // 씬 + 배경색
    _scene = new THREE.Scene();
    _scene.background = COLORS.bgColor();

    // PerspectiveCamera — 상단에서 수직으로 내려다보는 2.5D 시점
    var aspect = window.innerWidth / window.innerHeight;
    _camera = new THREE.PerspectiveCamera(PARAMS.camFOV, aspect, 0.1, 300);
    _camera.position.set(0, 0, PARAMS.camZ);
    _camera.lookAt(0, 0, 0);

    // 클록
    _clock = new THREE.Clock();

    // 3점 조명 — BoxGeometry 측면에 음영을 만들어 2.5D 입체감 부여
    // 앰비언트: 그림자 영역도 완전히 검지 않게
    var ambient = new THREE.AmbientLight(0xffffff, 0.42);
    _scene.add(ambient);

    // 주 방향광: 우상단에서 비추어 상면·측면 명암 생성
    var dirMain = new THREE.DirectionalLight(0xffffff, 1.25);
    dirMain.position.set(3, 5, 4);
    _scene.add(dirMain);

    // 보조 방향광: 좌하단에서 파란 계열 필 라이트 (청회색 분위기)
    var dirFill = new THREE.DirectionalLight(0x9BB5D0, 0.38);
    dirFill.position.set(-3, -2, -2);
    _scene.add(dirFill);

    // 리사이즈
    window.addEventListener('resize', function () {
      _camera.aspect = window.innerWidth / window.innerHeight;
      _camera.updateProjectionMatrix();
      _renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // ================================================================
  // 카메라 조작 (휠 줌 전용)
  // ================================================================

  // 함수 이름: _initControls
  // 함수 기능: 마우스 휠로 카메라 Z 위치 조절 (줌 인/아웃)
  // 입력 파라미터: 없음
  // 리턴 타입: void
  function _initControls() {
    _renderer.domElement.addEventListener('wheel', function (e) {
      _camera.position.z = Math.max(28, Math.min(130, _camera.position.z + e.deltaY * 0.05));
    }, { passive: true });
  }

  // ================================================================
  // 애니메이션 루프
  // ================================================================

  // 함수 이름: _animate
  // 함수 기능: requestAnimationFrame 루프 — globalT 사이클 관리 → 전체 모듈 업데이트 → 렌더
  //           t(연속 경과초)는 ArrowField 노이즈 wobble에 사용
  //           globalT 사이클: Phase A(0→0.30) / Phase B(0.30→0.65) / Phase C(0.65→1.00) / Phase D 역행
  // 입력 파라미터: 없음
  // 리턴 타입: void
  function _animate() {
    requestAnimationFrame(_animate);

    var dt = _clock.getDelta();
    if (dt > 0.1) dt = 0.1;  // 백그라운드 복귀 시 dt 폭발 방지
    var t  = _clock.getElapsedTime(); // getDelta 이후 호출해야 정확한 누적 시간 반환됨

    // globalT 사이클 관리 — Phase A/B/C (0→1), Phase D (1→0 빠른 분산)
    if (!_inReset) {
      _cycleT += dt / PARAMS.cycleDuration;
      if (_cycleT >= 1.0) { _cycleT = 1.0; _inReset = true; _resetT = 0; }
      _globalT = _cycleT;
    } else {
      _resetT += dt / PARAMS.resetDuration;
      if (_resetT >= 1.0) { _resetT = 0; _inReset = false; _cycleT = 0; }
      _globalT = 1.0 - _resetT;
    }

    ArrowField.update(_globalT, t);
    StreamLines.update(_globalT);
    ClusterMeshes.update(_globalT);
    BBoxLayer.update(_globalT);
    _renderer.render(_scene, _camera);
  }

  // ================================================================
  // 진입점
  // ================================================================

  // 함수 이름: _start
  // 함수 기능: 씬·컨트롤·모든 레이어 초기화 후 애니메이션 시작
  // 입력 파라미터: 없음
  // 리턴 타입: void
  function _start() {
    _initScene();
    _initControls();
    ArrowField.init(_scene);
    StreamLines.init(_scene);
    ClusterMeshes.init(_scene);
    BBoxLayer.init(_scene);
    _animate();
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(_start);
  } else {
    window.addEventListener('load', _start);
  }

})();
