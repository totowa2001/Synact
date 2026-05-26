// 최신화 260525
// 최신화내용: 2D 전환 + 박스 수 14개로 확대, LineLoop 2D 직사각형, 빠른 순환 간격
// 스크립트 이름: BBoxLayer.js
// 스크립트 기능: 딥러닝 BFS 탐색 느낌의 2D 와이어프레임 직사각형 레이어.
//               14개 박스가 tStart~tEnd 구간에 등장·소멸 (평균 3~4개 동시 표시).
//               각 박스는 시간에 따라 초기 위치에서 클러스터 중심으로 이동하며 크기 축소.
//               가시 박스들의 중심을 연결하는 폴리라인으로 탐색 경로를 표현.
//               globalT 6초 사이클 기준, 각 박스는 약 1.2초간 표시됨.
//
// [ 핵심 구조 ]
//   _rects[i]  — THREE.LineLoop (공유 단위 정사각형 지오메트리, scale로 종횡비 제어)
//   _connLine  — THREE.Line (가시 박스 중심 연결 폴리라인)
//   _defs[]    — 14개 박스별 타이밍·시작위치·클러스터 인덱스·크기 정의
//
// 입력 파라미터: tokens.js의 CLUSTERS (전역)

var BBoxLayer = (function () {

  var _scene;
  var _rects   = [];
  var _connLine;
  var _connGeo;

  // 박스 정의: tStart·tEnd(globalT 활성 구간) / p0[x,y](시작위치) / ci(클러스터인덱스)
  //           w0·h0(시작 너비·높이) / w1·h1(끝 너비·높이)
  var _defs = [
    { tStart: 0.00, tEnd: 0.22, p0: [ 18,  12], ci: 0, w0: 22, h0: 14, w1: 7, h1: 5 },
    { tStart: 0.06, tEnd: 0.28, p0: [-16,   8], ci: 1, w0: 18, h0: 12, w1: 5, h1: 4 },
    { tStart: 0.11, tEnd: 0.33, p0: [  5, -17], ci: 2, w0: 20, h0: 16, w1: 6, h1: 5 },
    { tStart: 0.16, tEnd: 0.38, p0: [-12, -13], ci: 1, w0: 24, h0: 10, w1: 8, h1: 4 },
    { tStart: 0.21, tEnd: 0.44, p0: [ 20,  -6], ci: 0, w0: 16, h0: 18, w1: 5, h1: 6 },
    { tStart: 0.27, tEnd: 0.50, p0: [ -8,  16], ci: 2, w0: 19, h0: 13, w1: 6, h1: 4 },
    { tStart: 0.33, tEnd: 0.56, p0: [ 14, -14], ci: 1, w0: 21, h0: 11, w1: 7, h1: 4 },
    { tStart: 0.39, tEnd: 0.62, p0: [-19,  -4], ci: 0, w0: 17, h0: 15, w1: 5, h1: 5 },
    { tStart: 0.45, tEnd: 0.68, p0: [  9,  18], ci: 2, w0: 23, h0: 12, w1: 7, h1: 4 },
    { tStart: 0.51, tEnd: 0.74, p0: [-14,  10], ci: 0, w0: 20, h0: 14, w1: 6, h1: 5 },
    { tStart: 0.57, tEnd: 0.80, p0: [ 17,   5], ci: 1, w0: 18, h0: 16, w1: 5, h1: 5 },
    { tStart: 0.63, tEnd: 0.86, p0: [ -6, -18], ci: 2, w0: 16, h0: 12, w1: 5, h1: 4 },
    { tStart: 0.69, tEnd: 0.92, p0: [ 12,  14], ci: 0, w0: 22, h0: 10, w1: 7, h1: 3 },
    { tStart: 0.76, tEnd: 0.99, p0: [-20,  -9], ci: 1, w0: 19, h0: 15, w1: 6, h1: 5 },
  ];

  var _BCOUNT;

  // 함수 이름: init
  // 함수 기능: 공유 LineLoop 지오메트리로 14개 2D 직사각형 생성, 연결 폴리라인 초기화
  // 입력 파라미터: scene (THREE.Scene)
  // 리턴 타입: void
  function init(scene) {
    _scene  = scene;
    _BCOUNT = _defs.length;

    // 공유 단위 정사각형 지오메트리 (4점 LineLoop, scale.set(w,h,1)으로 종횡비 제어)
    var corners = new Float32Array([
      -0.5, -0.5, 0,
       0.5, -0.5, 0,
       0.5,  0.5, 0,
      -0.5,  0.5, 0,
    ]);
    var rectGeo = new THREE.BufferGeometry();
    rectGeo.setAttribute('position', new THREE.BufferAttribute(corners, 3));

    for (var i = 0; i < _BCOUNT; i++) {
      var mat = new THREE.LineBasicMaterial({
        color: 0x181858,
        transparent: true,
        opacity: 0.6,
      });
      var rect = new THREE.LineLoop(rectGeo, mat);
      rect.visible = false;
      rect.frustumCulled = false;
      _rects.push(rect);
      _scene.add(rect);
    }

    // 연결 폴리라인 (최대 _BCOUNT개 점)
    var connPos = new Float32Array(_BCOUNT * 3);
    _connGeo    = new THREE.BufferGeometry();
    _connGeo.setAttribute('position', new THREE.BufferAttribute(connPos, 3));
    _connGeo.setDrawRange(0, 0);

    var connMat = new THREE.LineBasicMaterial({
      color: 0x0D0D3E,
      transparent: true,
      opacity: 0.40,
    });
    _connLine = new THREE.Line(_connGeo, connMat);
    _connLine.frustumCulled = false;
    _scene.add(_connLine);
  }

  // 함수 이름: update
  // 함수 기능: globalT에 따라 각 박스의 가시성·위치·크기(종횡비)·불투명도 갱신,
  //           가시 박스 중심을 잇는 폴리라인 갱신
  // 입력 파라미터: globalT (Number) 0→1 진행도
  // 리턴 타입: void
  function update(globalT) {
    var connArr    = _connGeo.attributes.position.array;
    var visibleCnt = 0;

    for (var i = 0; i < _BCOUNT; i++) {
      var d      = _defs[i];
      var active = globalT >= d.tStart && globalT <= d.tEnd;
      _rects[i].visible = active;
      if (!active) continue;

      // 이 박스의 로컬 진행도 [0,1]
      var lt = (globalT - d.tStart) / (d.tEnd - d.tStart);
      var cl = CLUSTERS[d.ci];

      // 중심 이동: p0 → 클러스터 중심 (2D)
      var cx = d.p0[0] + lt * (cl.x - d.p0[0]);
      var cy = d.p0[1] + lt * (cl.y - d.p0[1]);

      // 크기 축소: 시작→끝 (너비·높이 독립)
      var cw = d.w0 + lt * (d.w1 - d.w0);
      var ch = d.h0 + lt * (d.h1 - d.h0);

      _rects[i].position.set(cx, cy, 0.5);
      _rects[i].scale.set(cw, ch, 1);

      // 불투명도: 진입·퇴장 시 페이드
      var op = Math.min(lt * 5, 1) * Math.min((1 - lt) * 5, 1);
      _rects[i].material.opacity = 0.65 * op;

      connArr[visibleCnt*3]   = cx;
      connArr[visibleCnt*3+1] = cy;
      connArr[visibleCnt*3+2] = 0.5;
      visibleCnt++;
    }

    // 연결 폴리라인 갱신
    if (visibleCnt >= 2) {
      _connGeo.setDrawRange(0, visibleCnt);
      _connGeo.attributes.position.needsUpdate = true;
      _connLine.visible = true;
    } else {
      _connLine.visible = false;
    }
  }

  return { init: init, update: update };

})();
