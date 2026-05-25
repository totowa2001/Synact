// 최신화 260525
// 최신화내용: 최초 작성 — Flow Matching 분포 수렴 시각화 (InstancedMesh 구 메시)
// 스크립트 이름: ClusterMeshes.js
// 스크립트 기능: Flow Matching의 데이터 분포 p₀→p₁ 수렴을 구 메시로 시각화.
//               globalT=0: 가우시안 분포(중심 밀집), globalT=1: CLUSTERS 좌표로 수렴.
//               smoothstep 이징 적용, 수렴할수록 구 크기 성장.
//               색상은 CLUSTER_COLORS_HEX 팔레트 순환 (#0D0D3E 계열 다크 인디고).
//
// [ 핵심 구조 ]
//   _mesh — THREE.InstancedMesh (SphereGeometry(0.35, 7, 5), particleCount개)
//   _p0   — Float32Array (TOTAL*3) 가우시안 시작 위치
//   _p1   — Float32Array (TOTAL*3) 클러스터 수렴 위치
//   update(globalT)마다 smoothstep(globalT)으로 _p0→_p1 보간하여 위치·스케일 갱신
//
// 입력 파라미터: tokens.js의 PARAMS, CLUSTERS, CLUSTER_COLORS_HEX (전역)

var ClusterMeshes = (function () {

  var _scene;
  var _mesh;
  var _TOTAL;
  var _p0;
  var _p1;
  var _dummy;

  // 함수 이름: _rnd
  // 함수 기능: seed → [0,1) 결정론적 의사난수
  // 입력 파라미터: seed (Number)
  // 리턴 타입: Number [0,1)
  function _rnd(seed) {
    return ((Math.sin(seed * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
  }

  // 함수 이름: _gauss
  // 함수 기능: Box-Muller 변환으로 표준 가우시안 난수 생성 (결정론적)
  // 입력 파라미터: seed (Number)
  // 리턴 타입: Number (표준 정규 분포)
  function _gauss(seed) {
    var u = _rnd(seed)     * 0.9998 + 0.0001;
    var v = _rnd(seed + 1) * 0.9998 + 0.0001;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // 함수 이름: _smoothstep
  // 함수 기능: 3차 smoothstep 이징 — t²(3-2t)
  // 입력 파라미터: t (Number) [0,1]
  // 리턴 타입: Number [0,1]
  function _smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  // 함수 이름: init
  // 함수 기능: 가우시안/클러스터 위치 사전 계산, SphereGeometry InstancedMesh 초기화,
  //           색상을 CLUSTER_COLORS_HEX 팔레트로 init에서 1회 설정
  // 입력 파라미터: scene (THREE.Scene)
  // 리턴 타입: void
  function init(scene) {
    _scene = scene;
    _TOTAL = PARAMS.particleCount;
    _p0 = new Float32Array(_TOTAL * 3);
    _p1 = new Float32Array(_TOTAL * 3);

    var sigma = PARAMS.gridHalf * 0.45;

    for (var i = 0; i < _TOTAL; i++) {
      // 가우시안 분포 시작 위치
      _p0[i*3]   = _gauss(i * 13 +  0) * sigma;
      _p0[i*3+1] = _gauss(i * 13 +  2) * sigma;
      _p0[i*3+2] = _gauss(i * 13 +  4) * sigma;

      // 클러스터 수렴 위치 (클러스터 구 내부 랜덤)
      var ci = i % CLUSTERS.length;
      var cl = CLUSTERS[ci];
      _p1[i*3]   = cl.x + (_rnd(i * 17 + 1) * 2 - 1) * cl.r * 0.8;
      _p1[i*3+1] = cl.y + (_rnd(i * 17 + 3) * 2 - 1) * cl.r * 0.8;
      _p1[i*3+2] = cl.z + (_rnd(i * 17 + 5) * 2 - 1) * cl.r * 0.8;
    }

    var geo = new THREE.SphereGeometry(0.35, 7, 5);
    var mat = new THREE.MeshLambertMaterial({ color: 0xffffff });

    _mesh = new THREE.InstancedMesh(geo, mat, _TOTAL);
    _mesh.frustumCulled = false;
    _scene.add(_mesh);

    // 색상은 불변이므로 init에서 1회 설정
    var color = new THREE.Color();
    for (var j = 0; j < _TOTAL; j++) {
      color.setHex(CLUSTER_COLORS_HEX[j % CLUSTER_COLORS_HEX.length]);
      _mesh.setColorAt(j, color);
    }
    if (_mesh.instanceColor) _mesh.instanceColor.needsUpdate = true;

    _dummy = new THREE.Object3D();
  }

  // 함수 이름: update
  // 함수 기능: globalT의 smoothstep으로 _p0→_p1 위치 보간, 수렴할수록 구 크기 성장
  // 입력 파라미터: globalT (Number) 0→1 진행도
  // 리턴 타입: void
  function update(globalT) {
    var st = _smoothstep(Math.max(0, Math.min(1, globalT)));
    var sz = 0.5 + 0.5 * st;

    for (var i = 0; i < _TOTAL; i++) {
      var x = _p0[i*3]   + st * (_p1[i*3]   - _p0[i*3]);
      var y = _p0[i*3+1] + st * (_p1[i*3+1] - _p0[i*3+1]);
      var z = _p0[i*3+2] + st * (_p1[i*3+2] - _p0[i*3+2]);

      _dummy.position.set(x, y, z);
      _dummy.scale.setScalar(sz);
      _dummy.updateMatrix();
      _mesh.setMatrixAt(i, _dummy.matrix);
    }

    _mesh.instanceMatrix.needsUpdate = true;
  }

  return { init: init, update: update };

})();
