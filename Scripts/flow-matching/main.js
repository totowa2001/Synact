// 최신화 260520
// 최신화내용: StreamLines 레이어 추가 — init·update 통합
// 스크립트 이름: main.js
// 스크립트 기능: Three.js 씬 초기화, 조명 설정, ArrowField 통합, 애니메이션 루프
// 입력 파라미터: tokens.js / FlowField.js / ArrowField.js (전역)

(function () {

  var _renderer, _scene, _camera, _clock;
  var _theta = 0.5, _phi = Math.PI * 0.32, _radius;
  var _isDragging = false, _prevMX = 0, _prevMY = 0;

  // ================================================================
  // 씬 초기화
  // ================================================================

  // 함수 이름: _initScene
  // 함수 기능: 렌더러·씬·카메라·안개·조명 초기화
  // 입력 파라미터: 없음
  // 리턴 타입: void
  function _initScene() {
    _radius = PARAMS.camRadius;

    // 렌더러
    _renderer = new THREE.WebGLRenderer({ antialias: true });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(_renderer.domElement);

    // 씬 + 배경색
    _scene = new THREE.Scene();
    _scene.background = COLORS.bgColor();

    // 원근 안개 — 멀리 있는 화살표를 배경색으로 자연스럽게 페이드
    _scene.fog = new THREE.FogExp2(COLORS.bgColor(), PARAMS.fogDensity);

    // 카메라
    _camera = new THREE.PerspectiveCamera(
      56, window.innerWidth / window.innerHeight, 0.1, 400
    );
    _updateCamera();

    // 클록
    _clock = new THREE.Clock();

    // --- 조명 ---
    // 앰비언트: 전체 균일 조명 (그림자 영역도 완전히 검지 않게)
    var ambient = new THREE.AmbientLight(0xffffff, 0.42);
    _scene.add(ambient);

    // 주 방향광: 우상단에서 비추어 실린더 입체감 생성
    var dirMain = new THREE.DirectionalLight(0xffffff, 1.25);
    dirMain.position.set(3, 5, 2);
    _scene.add(dirMain);

    // 보조 방향광: 좌하단에서 파란 계열 필 라이트 (레퍼런스의 청회색 분위기)
    var dirFill = new THREE.DirectionalLight(0x9BB5D0, 0.38);
    dirFill.position.set(-3, -2, -4);
    _scene.add(dirFill);

    // 리사이즈
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

    el.addEventListener('mousedown',  function (e) {
      _isDragging = true; _prevMX = e.clientX; _prevMY = e.clientY;
    });
    window.addEventListener('mouseup', function () { _isDragging = false; });
    window.addEventListener('mousemove', function (e) {
      if (!_isDragging) return;
      _theta -= (e.clientX - _prevMX) * 0.007;
      _phi    = Math.max(0.06, Math.min(Math.PI-0.06, _phi + (e.clientY - _prevMY) * 0.007));
      _prevMX = e.clientX; _prevMY = e.clientY;
      _updateCamera();
    });
    el.addEventListener('wheel', function (e) {
      _radius = Math.max(15, Math.min(120, _radius + e.deltaY * 0.04));
      _updateCamera();
    }, { passive: true });

    el.addEventListener('touchstart', function (e) {
      _isDragging = true;
      _prevMX = e.touches[0].clientX; _prevMY = e.touches[0].clientY;
    });
    el.addEventListener('touchend',   function () { _isDragging = false; });
    el.addEventListener('touchmove',  function (e) {
      if (!_isDragging) return;
      _theta -= (e.touches[0].clientX - _prevMX) * 0.007;
      _phi    = Math.max(0.06, Math.min(Math.PI-0.06, _phi + (e.touches[0].clientY - _prevMY) * 0.007));
      _prevMX = e.touches[0].clientX; _prevMY = e.touches[0].clientY;
      _updateCamera();
    });
  }

  // ================================================================
  // 애니메이션 루프
  // ================================================================

  // 함수 이름: _animate
  // 함수 기능: requestAnimationFrame 루프 — ArrowField 업데이트 → 렌더
  // 입력 파라미터: 없음
  // 리턴 타입: void
  function _animate() {
    requestAnimationFrame(_animate);

    var dt = _clock.getDelta();
    var t  = _clock.getElapsedTime();
    if (dt > 0.1) dt = 0.1;  // 백그라운드 복귀 시 dt 폭발 방지

    // 드래그 중이 아닐 때 자동 공전
    if (!_isDragging) {
      _theta += PARAMS.camAutoRot * 60 * dt;
      _updateCamera();
    }

    ArrowField.update(t * PARAMS.animSpeed, dt);
    StreamLines.update(t * PARAMS.animSpeed, dt);
    _renderer.render(_scene, _camera);
  }

  // ================================================================
  // 진입점
  // ================================================================

  // 함수 이름: _start
  // 함수 기능: 씬·컨트롤·ArrowField 초기화 후 애니메이션 시작
  // 입력 파라미터: 없음
  // 리턴 타입: void
  function _start() {
    _initScene();
    _initControls();
    ArrowField.init(_scene);
    StreamLines.init(_scene);
    _animate();
  }

  // 폰트 로드 완료 후 시작 (지연 없이 실행되도록 폴백 포함)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(_start);
  } else {
    window.addEventListener('load', _start);
  }

})();
