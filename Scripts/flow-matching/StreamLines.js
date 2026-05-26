// 최신화 260520
// 최신화내용: 최초 작성 — 흐름장 적분 기반 스트림라인 실시간 렌더링
// 스크립트 이름: StreamLines.js
// 스크립트 기능: FlowField 벡터장을 따라 이동하는 스트림라인 생성·렌더링.
//               각 스트림라인은 현재 흐름 방향으로 고정 step만큼 전진하며 궤적을 남김.
//               꼬리(tail)는 배경색으로 선형 페이드아웃 → 이동 방향과 속도감을 직관적으로 전달.
//               헤드(head) 색상은 수렴 강도에 따라 navy → lime으로 전환.
//               픽셀 박스(ArrowField)와 독립 레이어로 씬에 추가됨.
//
// [ 핵심 구조 ]
//   _geos[i]  — THREE.BufferGeometry, position·color 두 attribute (L×3 float)
//   _lines[i] — THREE.Line (LineBasicMaterial, vertexColors:true)
//   _heads[i] — 현재 헤드 위치 [x,y,z]
//   update() 마다 position/color 버퍼를 shift하여 새 헤드 삽입
//
// 입력 파라미터: tokens.js의 PARAMS, BG_R/G/B / FlowField.js의 FlowField (전역)

var StreamLines = (function () {

  var _scene;
  var _geos  = [];   // THREE.BufferGeometry 배열
  var _lines = [];   // THREE.Line 배열
  var _heads = [];   // [[x,y,z], ...] 헤드 현재 위치

  var _N;   // 스트림라인 수 (PARAMS.streamCount)
  var _L;   // 궤적 길이 / 점 수 (PARAMS.streamLen)

  // ----------------------------------------------------------------

  // 함수 이름: _seed
  // 함수 기능: 구 내부 균일 분포 임의 시드 위치 반환
  //           (Math.random 사용 — 리셋마다 다른 위치로 재시작)
  // 입력 파라미터: 없음
  // 리턴 타입: [x, y, z]
  function _seed() {
    var R     = PARAMS.gridHalf * 0.90;
    var u     = Math.random(), v = Math.random(), w = Math.random();
    var r     = R * Math.pow(w, 0.3333);
    var theta = 2 * Math.PI * u;
    var phi   = Math.acos(1 - 2 * v);
    return [
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    ];
  }

  // ----------------------------------------------------------------

  // 함수 이름: init
  // 함수 기능: PARAMS.streamCount 개의 스트림라인을 임의 시드 위치에 초기화.
  //           각 라인은 L개 점이 모두 시드 위치로 겹쳐진 상태로 시작 → 이후 update에서 성장.
  // 입력 파라미터: scene (THREE.Scene)
  // 리턴 타입: void
  function init(scene) {
    _scene = scene;
    _N = PARAMS.streamCount;
    _L = PARAMS.streamLen;

    var bgR = BG_R/255, bgG = BG_G/255, bgB = BG_B/255;

    for (var i = 0; i < _N; i++) {
      var s  = _seed();
      var sx = s[0], sy = s[1], sz = s[2];

      var posArr = new Float32Array(_L * 3);
      var colArr = new Float32Array(_L * 3);

      for (var j = 0; j < _L; j++) {
        posArr[j*3] = sx; posArr[j*3+1] = sy; posArr[j*3+2] = sz;
        colArr[j*3] = bgR; colArr[j*3+1] = bgG; colArr[j*3+2] = bgB;
      }

      var geo  = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      geo.setAttribute('color',    new THREE.BufferAttribute(colArr, 3));

      var mat  = new THREE.LineBasicMaterial({ vertexColors: true });
      var line = new THREE.Line(geo, mat);

      _geos[i]  = geo;
      _lines[i] = line;
      _heads[i] = [sx, sy, sz];
      _scene.add(line);
    }
  }

  // 함수 이름: update
  // 함수 기능: 매 프레임 모든 스트림라인 헤드를 현재 흐름장 방향으로 전진.
  //           position 버퍼를 shift하여 헤드 새 위치 삽입.
  //           color 버퍼를 꼬리→배경색, 헤드→브랜드 컬러로 갱신.
  //           헤드가 gridHalf 범위 이탈 시 새 시드 위치로 전체 궤적 리셋.
  // 입력 파라미터: t (Number) 경과 시간(초, animSpeed 적용됨) / dt (Number) 프레임 델타
  // 리턴 타입: void
  function update(t, dt) {
    var step = PARAMS.streamStep;
    var R    = PARAMS.gridHalf;
    var bgR  = BG_R/255, bgG = BG_G/255, bgB = BG_B/255;

    for (var i = 0; i < _N; i++) {
      var hd = _heads[i];
      var hx = hd[0], hy = hd[1], hz = hd[2];

      // 현재 헤드 위치에서 흐름 방향 샘플링
      var v    = FlowField.getVector(hx, hy, hz, t);
      var vlen = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
      if (vlen < 0.0001) vlen = 0.0001;

      // 헤드 전진 (정규화 방향 × step)
      var nx = hx + (v.x/vlen) * step;
      var ny = hy + (v.y/vlen) * step;
      var nz = hz + (v.z/vlen) * step;

      // 범위 이탈 시 새 시드로 전체 궤적 리셋
      var dist = Math.sqrt(nx*nx + ny*ny + nz*nz);
      if (dist > R * 0.97) {
        var s = _seed();
        nx = s[0]; ny = s[1]; nz = s[2];
        var pa = _geos[i].attributes.position.array;
        for (var j = 0; j < _L; j++) {
          pa[j*3] = nx; pa[j*3+1] = ny; pa[j*3+2] = nz;
        }
      }

      hd[0] = nx; hd[1] = ny; hd[2] = nz;

      // position 버퍼 shift — 인덱스 0(꼬리) 방향으로 한 칸씩 밀고 L-1(헤드)에 새 위치
      var posArr = _geos[i].attributes.position.array;
      for (var j = 0; j < _L - 1; j++) {
        posArr[j*3]   = posArr[(j+1)*3];
        posArr[j*3+1] = posArr[(j+1)*3+1];
        posArr[j*3+2] = posArr[(j+1)*3+2];
      }
      posArr[(_L-1)*3]   = nx;
      posArr[(_L-1)*3+1] = ny;
      posArr[(_L-1)*3+2] = nz;

      // 헤드 색상 결정 (수렴 강도에 따라 navy → lime)
      var conv = FlowField.getConvergenceScore(nx, ny, nz, t);
      var tc   = (conv - 0.50) / 0.35;
      if (tc < 0) tc = 0;
      if (tc > 1) tc = 1;
      var hcr = 24/255 + (192/255 - 24/255) * tc;
      var hcg = 24/255 + (255/255 - 24/255) * tc;
      var hcb = 88/255 + (  0/255 - 88/255) * tc;

      // color 버퍼 갱신 — 꼬리(j=0)=배경색, 헤드(j=L-1)=헤드 컬러 선형 보간
      var colArr = _geos[i].attributes.color.array;
      for (var j = 0; j < _L; j++) {
        var tj = j / (_L - 1);
        colArr[j*3]   = bgR * (1 - tj) + hcr * tj;
        colArr[j*3+1] = bgG * (1 - tj) + hcg * tj;
        colArr[j*3+2] = bgB * (1 - tj) + hcb * tj;
      }

      _geos[i].attributes.position.needsUpdate = true;
      _geos[i].attributes.color.needsUpdate    = true;
    }
  }

  return { init: init, update: update };

})();
