# CLAUDE.md

이 파일은 이 저장소에서 작업할 때 Claude Code(claude.ai/code)에게 제공되는 안내 문서입니다.

## 프로젝트

**Synact** /sɪˈnækt/ — *Synchronized + Action*
**Fine-tuning System for Customized Physical AI with Personal Action Data.**
Physical AI가 일상화될 2030년을 가정하고, 개인의 고유 행동 데이터로 범용 Action Model을 Fine-Tuning 하는 시스템의 UX와 시나리오를 제안하는 컨셉 프로젝트.

모든 소스 스크립트는 `FITA Scripts/` 하위 (C# .cs 파일). Unity 6.1 프로젝트이며 별도 빌드 스크립트 없음.

## 빌드 및 배포

- **빌드:** Unity Editor → File → Build Settings → Android → Build (Meta Quest APK 생성)
- **기기 배포:** `adb install <apk-경로>`
- **에디터 테스트:** Unity Editor Play Mode (패스스루/XR 기능은 Quest 연결 또는 Link 케이블 필요)
- **유닛 테스트:** 현재 테스트 스위트 미구성

## 씬 구조

| 씬 | 핵심 스크립트 | 역할 |
|----|-------------|------|
| Scene 1 | `LaunchFlowController.cs` | 층/ID 입력, 카메라 권한 요청, 씬 전환 |
| Scene 2 | `LaunchFlowController_Scene2.cs` | 진입 연출, 분위기 형성 |
| Scene 3 | `FireManager.cs` + `InteractableManager.cs` | 메인 훈련: YOLO 감지, AR 오버레이, 인터랙션 |

`AppStateManager` — 씬 간 싱글톤 (`DontDestroyOnLoad`). 서버 URL · 플레이어 ID · 층 정보 보관.

## 핵심 서브시스템

**앵커 시스템** (`Anchor/`)
- `AnchorManager` — 관리자 모드 전용. 앵커 생성·UUID·좌표 저장 (`anchors.json` 관리).
- `AnchorUtilizer` — 런타임 전용. 현재 층 앵커 우선 복원, 인접 층 preload/unload.
- `AnchorSharing` — Meta Platform SDK로 Shared Spatial Anchor 업로드/다운로드 (연동 진행 중).

**YOLO 감지** (`Yolo/`)
- `YoloDetector` — Barracuda로 ONNX 모델 추론. 감지 클래스: `faucet(0)` · `hydrant(1)` · `extinguisher(2)`.
- `YoloPassthroughInput` — Quest Passthrough API에서 프레임 공급.
- `YoloOnServer` — 서버 추론 변형 (미완성).

**화재 시뮬레이션** (`Scene3/`)
- `FireManager` — 화재 상태·확산 로직, `anchors.json`의 `FireDt` 기반 발화 위치 결정.
- `InteractableManager` — YOLO 결과 수신 → FBX 프리팹 생성 (소화기 등). CV-3D씬 브리지 역할.

**네트워킹** (`Server/`)
- `WebSocketManager` — 이벤트 계약 및 메시지 타입 정의. **실제 송수신은 TODO 스텁 상태, 백엔드 미연동.**

## 디자인 패턴 (신규 코드 작성 시 준수)

- **싱글톤** — 모든 매니저는 `static Instance` 또는 `I`로 접근. `FindObjectOfType` 사용 금지.
- **C# 이벤트** — 매니저가 이벤트 발행, 게임플레이 스크립트가 구독. 크로스 시스템 통신은 이 패턴 사용.
- **직렬화** — 영속·네트워크 데이터는 `[Serializable]` + `JsonUtility`. 중첩 클래스 구조는 `JsonUtility` 미지원이므로 주의.
- **비동기** — 앵커 복원·권한 흐름은 `async Task`. 신규 비동기 작업에 코루틴 사용 금지.
- **프리팹 기반 생성** — 인터랙티브 오브젝트는 씬에 정적 배치 금지. 항상 런타임 `Instantiate`.

## 코드 컨벤션

- 주석은 **한국어**. 날짜 태그는 `YYMMDD` 형식 (예: `260408` = 2026-04-08).
- OVR* API 사용 전 Meta XR SDK 문서 확인 필수.
- 코드 수정 시, 스크립트 최상단에 최신화 날짜를 YYMMDD 형태로 작성할 것. (예: // 최신화 260412)
- 스크립트의 최상단에는 
// 최신화 YYMMDD
// 최신화내용:
// 스크립트 이름 : 
// 스크립트 기능 : 
// 입력 파라미터 :
의 형태로 해당 스크립트에 대한 설명을 주석으로 작성할 것.
- 모든 함수의 상단에는
// 함수 이름 : 
// 함수 기능 : 
// 입력 파라미터 : 
// 리턴 타입 : 
의 형태로 해당 함수에 대한 주석을 작성할 것.

## 미완성 영역 (작업 시 주의)

- `WebSocketManager` 송수신 로직 — 스텁 상태, 백엔드 미연동.
- `AnchorSharing` + `AnchorUtilizer` Shared Anchor 통합 — **최우선 과제**.
- 다중 층 환경에서의 공간 정합 안정성.
- `YoloOnServer` 서버 추론 흐름.
