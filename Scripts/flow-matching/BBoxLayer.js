// 최신화 260525
// 최신화내용: 최초 작성 — BFS 스타일 3D 와이어프레임 바운딩박스 레이어
// 스크립트 이름: BBoxLayer.js
// 스크립트 기능: 딥러닝 BFS 탐색 느낌의 3D 와이어프레임 박스 시각화.
//               각 박스는 tStart~tEnd 구간에만 표시되며, 시간에 따라
//               랜덤 초기 위치에서 클러스터 중심으로 이동하고 크기가 축소됨.
//               가시 박스들의 중심을 연결하는 폴리라인으로 탐색 경로를 표현.
//
// [ 핵심 구조 ]
//   _segs[i]  — THREE.LineSegments (EdgesGeometry 공유, 박스별 위치·크기·불투명도 독립)
//   _connLine — THREE.Line (가시 박스 중심 연결 폴리라인)
//   _defs[]   — 박스별 타이밍·시작위치·클러스터 인덱스·크기 정의
//
// 입력 파라미터: tokens.js의 CLUSTERS (전역)

var BBoxLayer = (function () {

  var _scene;
  var _segs    = [];
  var _connLine;
  var _connGeo;

  // 박스 정의: tStart·tEnd(활성 구간) / p0(시작 위치) / clusterIdx / szS(시작크기) / szE(끝크기)
  var _defs = [
    { tStart: 0.03, tEnd: 0.42, p0: [ 14,   9, -13], clusterIdx: 0, szS: 22, szE: 6 },
    { tStart: 0.10, tEnd: 0.52, p0: [-14,  11,   6], clusterIdx: 1, szS: 19, szE: 5 },
    { tStart: 0.18, tEnd: 0.62, p0: [  6, -14,  12], clusterIdx: 0, szS: 24, szE: 7 },
    { tStart: 0.28, tEnd: 0.72, p0: [ -7,   7, -14], clusterIdx: 2, szS: 17, szE: 5 },
    { tStart: 0.40, tEnd: 0.82, p0: [ 16,  -7,   9], clusterIdx: 1, szS: 21, szE: 6 },
    { tStart: 0.55, tEnd: 0.96, p0: [ -5, -13,  -9], clusterIdx: 2, szS: 15, szE: 4 },
  ];

  var _BCOUNT;

  // 함수 이름: init
  // 함수 기능: 공유 EdgesGeometry로 6개 LineSegments 생성, 연결 폴리라인 BufferGeometry 초기화
  // 입력 파라미터: scene (THREE.Scene)
  // 리턴 타입: void
  function init(scene) {
    _scene  = scene;
    _BCOUNT = _defs.length;

    // 공유 단위 박스 와이어프레임 지오메트리 (스케일로 크기 제어)
    var boxGeo   = new THREE.BoxGeometry(1, 1, 1);
    var edgesGeo = new THREE.EdgesGeometry(boxGeo);

    for (var i = 0; i < _BCOUNT; i++) {
      var mat = new THREE.LineBasicMaterial({
        color: 0x181858,
        transparent: true,
        opacity: 0.5,
      });
      var seg = new THREE.LineSegments(edgesGeo, mat);
      seg.visible = false;
      seg.frustumCulled = false;
      _segs.push(seg);
      _scene.add(seg);
    }

    // 연결 폴리라인 (최대 _BCOUNT개 점)
    var connPos = new Float32Array(_BCOUNT * 3);
    _connGeo    = new THREE.BufferGeometry();
    _connGeo.setAttribute('position', new THREE.BufferAttribute(connPos, 3));
    _connGeo.setDrawRange(0, 0);

    var connMat = new THREE.LineBasicMaterial({
      color: 0x0D0D3E,
      transparent: true,
      opacity: 0.35,
    });
    _connLine = new THREE.Line(_connGeo, connMat);
    _connLine.frustumCulled = false;
    _scene.add(_connLine);
  }

  // 함수 이름: update
  // 함수 기능: globalT에 따라 각 박스의 가시성·위치·크기·불투명도 갱신,
  //           가시 박스 중심을 잇는 폴리라인 갱신
  // 입력 파라미터: globalT (Number) 0→1 진행도
  // 리턴 타입: void
  function update(globalT) {
    var connArr    = _connGeo.attributes.position.array;
    var visibleCnt = 0;

    for (var i = 0; i < _BCOUNT; i++) {
      var d      = _defs[i];
      var active = globalT >= d.tStart && globalT <= d.tEnd;
      _segs[i].visible = active;
      if (!active) continue;

      // 이 박스의 로컬 진행도 [0,1]
      var lt = (globalT - d.tStart) / (d.tEnd - d.tStart);
      var cl = CLUSTERS[d.clusterIdx];

      // 중심 이동: p0 → 클러스터 중심
      var cx = d.p0[0] + lt * (cl.x - d.p0[0]);
      var cy = d.p0[1] + lt * (cl.y - d.p0[1]);
      var cz = d.p0[2] + lt * (cl.z - d.p0[2]);

      // 크기 축소: szS → szE
      var sz = d.szS + lt * (d.szE - d.szS);

      _segs[i].position.set(cx, cy, cz);
      _segs[i].scale.setScalar(sz);

      // 불투명도: 진입·퇴장 시 페이드
      var op = Math.min(lt * 6, 1) * Math.min((1 - lt) * 6, 1);
      _segs[i].material.opacity = 0.55 * op;

      connArr[visibleCnt*3]   = cx;
      connArr[visibleCnt*3+1] = cy;
      connArr[visibleCnt*3+2] = cz;
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
