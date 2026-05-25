# FlowMatching.md
> Synact 그래픽 디자인 서브프로젝트 — Flow Matching 시각화
> 최초 작성: 260519

---

## 1. 프로젝트 개요

**목표:** Physical AI 파인튜닝 과정 중 'Flow Matching' 알고리즘을 나타내는 아티스틱한 실시간 3D 그래픽 애니메이션 제작.

**핵심 명제:**
> "형태를 알 수 없는 파편들이 3D 허공을 떠돌다가, 보고 있다 보면 어느 순간 전체적으로 수렴하는 방향이 느껴지는. 하지만 개별 요소는 여전히 혼돈 상태."

**씬 별칭:** *Inference Storm* (추론 폭풍)

---

## 2. Flow Matching 핵심 개념 — 시각화 대응

| Flow Matching 개념 | 수학적 의미 | 시각 언어 |
|-------------------|------------|-----------|
| 벡터장 v(x,t) | 공간의 모든 점에서 흐름 방향을 정의하는 함수 | 필라멘트·획·불규칙 선분 군집 |
| ODE 궤적 | 노이즈(t=0)→데이터(t=1)의 결정론적 경로 | 파편들의 궤도 잔상 |
| 확률 질량 수송 | 분포 전체가 이동하는 과정 | 파편 군집의 집단적 방향성 |
| Rectified Flow | 경로를 최적 수송으로 직선화 | 혼돈→수렴 방향이 서서히 드러남 |
| t=0→t=1 시간축 | 노이즈에서 데이터로의 보간 | 씬 깊이(z축) = 시간 |
| 랜덤성 속 방향성 | fBm 교란 + 전역 수렴의 공존 | 개별 혼돈 + 전체 질서 |

---

## 3. 디자인 원칙

- **맥시멀리즘** — 절제 금지. 화면의 모든 영역에 무언가 존재해야 함
- **글리치·노이즈는 결함이 아닌 재료** — 제거 대상이 아님
- **정체불명의 형태** — 특정 형상 없음. 점인지 면인지 선인지 구분 안 되는 파편들
- **수렴의 암시** — 방향이 명시적으로 표시되지 않고, 시간을 두고 보면 느껴지는 것
- **`#C0FF00` accent는 절제 없이** — 수렴 지점에서 폭발적으로 사용
- **밝은 배경** — 로봇 디자인과 대비되게 그래픽 자체는 강력하고 밀도 높게

---

## 4. 색상 토큰 (브랜딩 기준)

```js
// tokens.js
const BG_R = 242;   // 배경 RGB 개별 조정 가능
const BG_G = 243;
const BG_B = 248;
// → 기본값: #F2F3F8 (Synact Primary Background)
// → 조합: `rgb(${BG_R}, ${BG_G}, ${BG_B})`

const COLORS = {
  bg:       `rgb(${BG_R}, ${BG_G}, ${BG_B})`,  // 자유 조정 가능
  primary:  "#181858",   // Dark navy — 주 요소
  interp:   "#080946",   // Mid blue — 중간 강도 요소
  deep1:    "#181969",   // 그라디언트 3번째
  deep2:    "#120C46",   // 그라디언트 끝
  black:    "#010101",
  white:    "#F9F9F9",
  accent:   "#050A3A",   // Lime — 수렴 hot spot, 폭발적 사용
};

// 벡터 강도 스펙트럼 (낮음 → 높음)
const GRADIENT = ["#F2F3F8", "#37537F", "#181969", "#080946"];
```

---

## 5. 시각 레이어 구조

세 레이어가 **동시에 중첩**, 같은 fBm 노이즈 필드를 공유.

### Layer 1 — 점 (Point / 파편)
- 크기·밝기·투명도만 다른 정체불명의 파편들
- 일부에 딥러닝 수치 레이블 부착 (score, confidence, loss 등의 숫자)
- 숫자는 프레임마다 일부 랜덤 갱신 → 실시간 추론 느낌
- 색: `#181858` 기본, 고강도는 `#C0FF00`

### Layer 2 — 선 (Line / 필라멘트)
- 명확한 화살표 아님 — 불규칙한 획, 끊어진 선분, 필라멘트
- 길이·굵기·투명도가 노이즈 강도에 따라 변이
- 방향은 fBm 벡터장을 따르되, 개별 교란(drift) 추가
- 색: `#37537F` 기본, 수렴 지점 근방은 `#C0FF00`

### Layer 3 — 면 (Surface / 파편 막)
- 찢어진 막, 반투명 파편 면들
- 형태를 알 수 없게 변형된 메시 조각
- 실시간으로 버텍스 변위 → 바람에 흔들리는 필름
- 색: `rgba(24, 24, 88, 0.15~0.4)` 반투명 레이어링

---

## 6. 랜덤성 설계

```
fBm (fractional Brownian motion)
  옥타브: 4–6
  Hurst exponent H ≈ 0.65–0.7
  → 프랙탈 차원 D ≈ 1.3 (인간이 가장 매력을 느끼는 구간)

파티클 drift: 개별 파티클마다 추가 노이즈 → 완벽한 흐름 추종 X
글리치: 주기적으로 일부 요소의 위치·색상이 순간적으로 교란
```

---

## 7. 기술 스택

| 항목 | 결정 |
|------|------|
| 렌더 엔진 | **Three.js** (CDN, 서버 불필요) |
| 셰이더 | 커스텀 **GLSL** 필수 (additive blending, per-instance color) |
| 화살표 군집 | `InstancedMesh` — 50,000+개 @ 60fps 가능 |
| 파티클 | `BufferGeometry + Points` + trail 셰이더 |
| 리본/파편 면 | 커스텀 ribbon geometry + `ShaderMaterial` |
| 텍스트 레이블 | `Sprite + CanvasTexture` |
| 카메라 | `OrbitControls` — 자유 회전, 초기 시점 약간 기울어짐 |
| 실행 방법 | `index.html` 더블클릭 (순수 로컬, 서버 불필요) |
| 폰트 | **Sora Regular** (기술적·중립적, 레이블용) |

---

## 8. 파일 구조

```
flow-matching/
├── index.html          ← Three.js CDN 로드, 캔버스 컨테이너
├── tokens.js           ← 색상·파라미터 고정값 (BG_R/G/B 분리)
├── FlowField.js        ← fBm 기반 3D 벡터장 생성
├── ParticleLayer.js    ← 점: 파편 파티클 + trail + 숫자 레이블
├── FilamentLayer.js    ← 선: 불규칙 획·필라멘트 (구 ArrowLayer)
├── FragmentLayer.js    ← 면: 찢어진 막·파편 메시 (구 RibbonLayer)
└── main.js             ← 씬 초기화, 레이어 조합, 애니메이션 루프
```

---

## 9. 하드웨어 스펙 (개발 환경)

- CPU: Intel Core i7 14세대
- GPU: NVIDIA RTX 4050 Ti, VRAM 8GB
- OS: Windows 11
- 목표 프레임: 60fps

---

## 10. 미결 사항 / 향후 추가 예정

- [ ] PNG/WebM export 기능 (현재 우선순위 아님 — 스크린캡처로 대체)
- [ ] 파라미터 GUI (lil-gui 연동) — seed, 밀도, fBm 옥타브 실시간 조정
- [ ] 다른 딥러닝 개념 시각화 연계 (Latent Space, Action Chunking 등)
- [ ] 배경색 RGB 슬라이더 UI 연동
