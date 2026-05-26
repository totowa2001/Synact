// 최신화 260526
// 최신화내용: 신규 — 4가지 3D 수렴 형태 정의 (조밀 변화가 있는 3차원 형상)
// 스크립트 이름: Shapes.js
// 스크립트 기능: Flow Matching의 수렴 목표 형상 4종 생성.
//   Shape 0: 구면 6극 성단 — 구 표면 6방향에 가우시안 클러스터
//   Shape 1: 토러스 (도넛) — 변동 튜브 반경으로 밀도 변화
//   Shape 2: 이중 나선 (DNA) — 두 나선이 교차하며 높이 방향 펼침
//   Shape 3: 정사면체 성단 — 4개 꼭짓점에 가우시안 클러스터
//   각 형상은 PARAMS.particleCount 개의 XYZ 좌표를 Float32Array로 반환.
//
// 입력 파라미터: tokens.js의 PARAMS (전역)

var SHAPES = (function () {

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

  // 함수 이름: _makeShape0
  // 함수 기능: 구 6극 성단 — 구 표면 6방향(±X,±Y,±Z)에 가우시안 클러스터 배치.
  //           클러스터 크기를 달리하여 조/밀 변화를 부여.
  // 입력 파라미터: n (Number) 생성할 점 수
  // 리턴 타입: Float32Array (n×3)
  function _makeShape0(n) {
    var pts = new Float32Array(n * 3);
    var R   = 11;
    // 6 극 방향 (±X ±Y ±Z) 성단 중심
    var cx  = [R,0,0,  -R,0,0,  0,R,0,  0,-R,0,  0,0,R,  0,0,-R];
    for (var i = 0; i < n; i++) {
      var ci    = (i % 6) * 3;
      var sigma = 2.8 + _rnd(i * 31 + 5) * 2.0;  // 클러스터마다 크기 다양
      pts[i*3]   = cx[ci]   + _gauss(i*11 + 1) * sigma;
      pts[i*3+1] = cx[ci+1] + _gauss(i*11 + 3) * sigma;
      pts[i*3+2] = cx[ci+2] + _gauss(i*11 + 5) * sigma;
    }
    return pts;
  }

  // 함수 이름: _makeShape1
  // 함수 기능: 토러스 (도넛) — 토러스 표면에 무작위 분포. 튜브 반경에 노이즈를 추가해 밀도 변화.
  // 입력 파라미터: n (Number)
  // 리턴 타입: Float32Array (n×3)
  function _makeShape1(n) {
    var pts = new Float32Array(n * 3);
    var R = 10, r = 3.8;
    for (var i = 0; i < n; i++) {
      var theta = _rnd(i*3)   * 2 * Math.PI;
      var phi   = _rnd(i*3+1) * 2 * Math.PI;
      // 튜브 반경 노이즈 → 조/밀 변화
      var rr = r + _gauss(i*3+2) * 1.2;
      pts[i*3]   = (R + rr * Math.cos(phi)) * Math.cos(theta);
      pts[i*3+1] = rr * Math.sin(phi);
      pts[i*3+2] = (R + rr * Math.cos(phi)) * Math.sin(theta);
    }
    return pts;
  }

  // 함수 이름: _makeShape2
  // 함수 기능: 이중 나선 (DNA) — 두 나선이 Y축 방향으로 펼쳐짐.
  //           나선 반경과 노이즈로 밀도 변화 부여.
  // 입력 파라미터: n (Number)
  // 리턴 타입: Float32Array (n×3)
  function _makeShape2(n) {
    var pts    = new Float32Array(n * 3);
    var height = 22, radius = 7, turns = 3.5;
    var half   = Math.ceil(n / 2);
    for (var i = 0; i < n; i++) {
      var strand = i % 2;
      var j      = Math.floor(i / 2);
      var frac   = j / half;
      var angle  = frac * turns * 2 * Math.PI + strand * Math.PI;
      var y      = -height / 2 + frac * height;
      // 나선 반경 변조 → 위치별 밀도 변화
      var r = radius * (0.85 + 0.3 * Math.sin(frac * Math.PI * 4));
      pts[i*3]   = r * Math.cos(angle) + _gauss(i*7+1) * 0.9;
      pts[i*3+1] = y                   + _gauss(i*7+3) * 0.6;
      pts[i*3+2] = r * Math.sin(angle) + _gauss(i*7+5) * 0.9;
    }
    return pts;
  }

  // 함수 이름: _makeShape3
  // 함수 기능: 정사면체 성단 — 정사면체 4개 꼭짓점에 각각 가우시안 클러스터 배치.
  //           꼭짓점 간 연결부에 희박한 점들을 추가해 3D 형태 강조.
  // 입력 파라미터: n (Number)
  // 리턴 타입: Float32Array (n×3)
  function _makeShape3(n) {
    var pts = new Float32Array(n * 3);
    var R   = 11;
    var s   = 1 / Math.sqrt(2);
    // 정사면체 꼭짓점
    var verts = [
      [ R,  0, -R*s],
      [-R,  0, -R*s],
      [ 0,  R,  R*s],
      [ 0, -R,  R*s]
    ];
    // 80%: 꼭짓점 클러스터, 20%: 꼭짓점 간 연결부 (희박)
    var clusterN = Math.floor(n * 0.80);
    var sigma    = 3.0;
    for (var i = 0; i < n; i++) {
      if (i < clusterN) {
        var vi = i % 4;
        pts[i*3]   = verts[vi][0] + _gauss(i*13+1) * sigma;
        pts[i*3+1] = verts[vi][1] + _gauss(i*13+3) * sigma;
        pts[i*3+2] = verts[vi][2] + _gauss(i*13+5) * sigma;
      } else {
        // 두 꼭짓점 사이를 잇는 희박한 점
        var ei = i - clusterN;
        var t  = _rnd(ei * 7 + 11);
        var v0 = verts[ei % 4];
        var v1 = verts[(ei + 1) % 4];
        pts[i*3]   = v0[0] + t * (v1[0] - v0[0]) + _gauss(ei*7+2) * 1.5;
        pts[i*3+1] = v0[1] + t * (v1[1] - v0[1]) + _gauss(ei*7+4) * 1.5;
        pts[i*3+2] = v0[2] + t * (v1[2] - v0[2]) + _gauss(ei*7+6) * 1.5;
      }
    }
    return pts;
  }

  var _cache = null;

  // 함수 이름: get
  // 함수 기능: 4종 형상 Float32Array를 지연 생성하여 캐시 후 반환
  // 입력 파라미터: 없음
  // 리턴 타입: Array of Float32Array (length 4)
  function get() {
    if (!_cache) {
      var n = PARAMS.particleCount;
      _cache = [
        _makeShape0(n),
        _makeShape1(n),
        _makeShape2(n),
        _makeShape3(n)
      ];
    }
    return _cache;
  }

  return { get: get };

})();
