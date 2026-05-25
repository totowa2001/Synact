// 최신화 260525
// 최신화내용: Rectified Flow 스타일 직선 스트림라인 전면 재설계 — Gaussian 시작점 → 클러스터 끝점
// 스크립트 이름: StreamLines.js
// 스크립트 기능: Flow Matching의 직선 궤적(Rectified Flow)을 시각화.
//               각 스트림라인은 가우시안 분포 시작점에서 클러스터 끝점으로의 직선.
//               globalT에 따라 헤드가 전진, streamTailDt 간격의 꼬리가 배경색으로 페이드아웃.
//               Phase D(globalT 역행)에서 자동으로 후진하여 분산 표현.
//
// [ 핵심 구조 ]
//   _starts[i] — [sx,sy,sz] 가우시안 분포 시작점 (결정론적 난수)
//   _ends[i]   — [ex,ey,ez] 클러스터 근방 끝점 (결정론적 난수)
//   _geos[i]   — THREE.BufferGeometry (position·color, L×3 float)
//   update(globalT)마다 헤드/꼬리 위치를 직접 계산하여 버퍼 갱신
//
// 입력 파라미터: tokens.js의 PARAMS, CLUSTERS, BG_R/G/B (전역)

var StreamLines = (function () {

  var _scene;
  var _geos   = [];
  var _lines  = [];
  var _starts = [];
  var _ends   = [];

  var _N, _L;

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

  // 함수 이름: init
  // 함수 기능: 스트림라인 시작/끝 좌표 결정론적 생성, BufferGeometry·Line 초기화
  // 입력 파라미터: scene (THREE.Scene)
  // 리턴 타입: void
  function init(scene) {
    _scene = scene;
    _N = PARAMS.streamCount;
    _L = PARAMS.streamLen;

    var sigma = PARAMS.gridHalf * 0.45;
    var bgR = BG_R / 255, bgG = BG_G / 255, bgB = BG_B / 255;

    for (var i = 0; i < _N; i++) {
      // 가우시안 분포 시작점
      var sx = _gauss(i * 11 +  0) * sigma;
      var sy = _gauss(i * 11 +  2) * sigma;
      var sz = _gauss(i * 11 +  4) * sigma;

      // 클러스터 근방 끝점
      var ci = i % CLUSTERS.length;
      var cl = CLUSTERS[ci];
      var ex = cl.x + (_rnd(i * 13 + 1) * 2 - 1) * cl.r;
      var ey = cl.y + (_rnd(i * 13 + 3) * 2 - 1) * cl.r;
      var ez = cl.z + (_rnd(i * 13 + 5) * 2 - 1) * cl.r;

      _starts[i] = [sx, sy, sz];
      _ends[i]   = [ex, ey, ez];

      var posArr = new Float32Array(_L * 3);
      var colArr = new Float32Array(_L * 3);
      for (var j = 0; j < _L; j++) {
        posArr[j*3]   = sx; posArr[j*3+1] = sy; posArr[j*3+2] = sz;
        colArr[j*3]   = bgR; colArr[j*3+1] = bgG; colArr[j*3+2] = bgB;
      }

      var geo  = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      geo.setAttribute('color',    new THREE.BufferAttribute(colArr, 3));

      var mat  = new THREE.LineBasicMaterial({ vertexColors: true });
      var line = new THREE.Line(geo, mat);

      _geos[i]  = geo;
      _lines[i] = line;
      _scene.add(line);
    }
  }

  // 함수 이름: update
  // 함수 기능: globalT 기반으로 각 스트림라인의 헤드/꼬리 위치를 직접 계산하여 갱신.
  //           헤드=globalT, 꼬리=max(0, globalT-streamTailDt) 보간 위치.
  //           Phase D(globalT 감소)에서 자동으로 후진.
  // 입력 파라미터: globalT (Number) 0→1 진행도
  // 리턴 타입: void
  function update(globalT) {
    var bgR    = BG_R / 255, bgG = BG_G / 255, bgB = BG_B / 255;
    var tailDt = PARAMS.streamTailDt;
    // 헤드 색상: primary navy #181858
    var hcr = 24/255, hcg = 24/255, hcb = 88/255;

    for (var i = 0; i < _N; i++) {
      var s = _starts[i], e = _ends[i];
      var sx = s[0], sy = s[1], sz = s[2];
      var ex = e[0], ey = e[1], ez = e[2];

      var headT = globalT;
      var tailT = Math.max(0, globalT - tailDt);

      var hx = sx + headT * (ex - sx);
      var hy = sy + headT * (ey - sy);
      var hz = sz + headT * (ez - sz);
      var tx = sx + tailT * (ex - sx);
      var ty = sy + tailT * (ey - sy);
      var tz = sz + tailT * (ez - sz);

      var posArr = _geos[i].attributes.position.array;
      var colArr = _geos[i].attributes.color.array;

      for (var j = 0; j < _L; j++) {
        var tj = _L > 1 ? j / (_L - 1) : 1;
        posArr[j*3]   = tx + tj * (hx - tx);
        posArr[j*3+1] = ty + tj * (hy - ty);
        posArr[j*3+2] = tz + tj * (hz - tz);
        colArr[j*3]   = bgR + tj * (hcr - bgR);
        colArr[j*3+1] = bgG + tj * (hcg - bgG);
        colArr[j*3+2] = bgB + tj * (hcb - bgB);
      }

      _geos[i].attributes.position.needsUpdate = true;
      _geos[i].attributes.color.needsUpdate    = true;
    }
  }

  return { init: init, update: update };

})();
