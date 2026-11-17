# DEV QUICKSTART

## 목표

- Three.js 기반의 3D 행성 타격 프로토타입을 모듈 단위로 개발합니다.
- 다음 에이전트는 문서 재정리 없이 `npm run dev`부터 시작할 수 있습니다.
- 제품 목표는 기본 무료 IAP + IAA의 iOS 우선 출시입니다. 플랫폼·비용·Mac 인계 순서는 `RELEASE_PLAN.md`를 참고합니다.

## 실행

```bash
npm install
npm run dev
```

## 현재 구현

1. `src/main.js`에서 렌더링, 루프, 모드, 무기, 상태, UI를 조립합니다.
2. `BodyMode.js`가 Planet/Solar 공통 타격 흔적과 GPU 리소스 해제를 처리합니다.
3. 무기는 천체 로컬 좌표를 추적하며 공전 중인 타깃에도 명중합니다.
4. `TerrainSurface.js`가 절차적 지형·정점 함몰·테두리·그을음·발광 마그마를 구현합니다. 구의 연결부와 극점은 같은 방향의 정점 위치와 법선을 맞춥니다. 태양은 변형하지 않습니다.
5. 기존 로컬 세션 저장은 유지합니다. HubGame API 명세가 없어 외부 저장/리더보드 호출은 구현하지 않습니다.
6. 저장 스키마 v6은 v2~v5의 천체·무기·통계·`localPosition: { x, y, z }` 타격 이력과 진행도를 유지합니다. `progression`은 `{ coins, completedMissions, rewardedMissionIds, missionRecords, ownedSkins, equippedSkin }`이며 기본 소유/장착은 `earth`입니다. `missionRecords[id]`는 `{ bestActiveMs }`이고 별은 미션 기준에서 계산합니다. 과거 완료 시간은 추정하지 않습니다. 알 수 없는 외형과 잘못된 기록은 제거하고 소유하지 않은 장착은 기본 외형으로 복구합니다. 과거 2D 흔적은 로드에서 제외합니다.
7. 지형은 모든 모드를 합친 최근 120개 타격만 반영합니다. 상한을 넘으면 오래된 지형 효과를 제거하고 남은 이력으로 재계산합니다. 누적 통계는 유지하며 복원은 데미지와 파편을 다시 생성하지 않습니다.
8. `ImpactEffects.js`는 모드별 최대 384개 파편과 8개 섬광을 재사용합니다. 새 타격이 상한을 넘으면 슬롯을 재사용하며 모드 전환·Reset 시 모두 해제합니다.
9. `missions/definitions.js`의 미션 6개와 순수 `MissionSystem`으로 목표를 판정합니다. 실제 새 타격만 집계하며 첫 완료 보상과 완료 ID는 하나의 저장 payload로 기록합니다. 재도전 보상은 없습니다.
10. 미션 진입은 해당 모드·필요 무기와 깨끗한 전투에서 시작합니다. 미션 중 Reset은 런을 재시작하며, 목록 열기·모드 변경·샌드박스 복귀는 런을 종료하고 발사체를 제거합니다. 진행 중 런은 저장하지 않고 새로고침 시 샌드박스로 복귀합니다.
11. `runId`는 발사체→impact→미션 판정에만 쓰는 임시 실행 ID이며 저장하지 않습니다. 완료 처리는 이벤트 발행·발사체 갱신이 끝난 뒤 수행하여 순회 중 배열을 비우지 않습니다.
12. Reset으로 코인과 완료 기록은 삭제되지 않습니다. 저장 거부·용량 부족 시 현재 실행에서만 보상을 유지한다는 안내를 표시합니다. 미션 선택·결과 다이얼로그는 게임 입력을 차단하고 시뮬레이션을 일시 정지합니다.
13. `shop/ShopSystem.js`는 로컬 획득 코인으로 외형을 구매/장착합니다. 흑요석 250, 잿불 행성 450, 오로라 650 코인이며 실제 결제와 연결되지 않습니다. 구매는 코인 차감과 소유 추가를 하나의 payload로 저장하며 중복 구매는 거부합니다.
14. 장착은 활성 모드의 GPU 자원을 해제하고 기존 타격 이력으로 재구성합니다. 팔레트만 변경하며 지형·무기 데미지·통계·미션 보상은 바뀌지 않습니다. Solar의 태양도 변경하지 않습니다. Reset 후 소유/장착은 유지됩니다.
15. 상점을 열면 미션 런과 발사체를 종료합니다. 상점 다이얼로그는 입력/시뮬레이션을 차단하며 Escape 또는 복귀 버튼으로 닫습니다. 저장 실패 시 현재 실행에서만 구매/장착을 유지한다고 안내합니다.

## 실행 및 배포 검증

- `npm ci`로 고정된 Three.js 의존성을 설치합니다. Vite는 사용하지 않습니다.
- `npm run dev` 후 `/`와 `/web-prototype/index.html`에서 실행합니다.
- `npm run check`와 `npm run build`로 구조 및 배포 파일 생성을 확인합니다.
- 빌드는 Three.js와 라이선스를 `dist/vendor`에 포함합니다. `dist`를 정적 HTTP 서버로 제공하며 CDN이나 외부 이미지가 필요하지 않습니다.
- 천체/빈 공간 클릭, 무기 3종, 모드 반복 전환, 발사 직후 Reset, 새로고침 후 복원, 세로 화면을 확인합니다.
- 브라우저가 숨겨지면 시뮬레이션을 멈추며 복귀 시 경과 시간을 건너뛰지 않습니다.

## iOS 준비와 Gemini 협업

- Node 22 이상에서 `npm run native:prepare`로 오프라인 웹 번들과 Capacitor 8.6.2 설정을 확인합니다. 이 명령은 iOS 프로젝트를 만들지 않습니다.
- `dist/index.html`은 리다이렉트 없이 게임을 직접 실행합니다. 개발 서버 루트와 하위 프로토타입 진입도 유지합니다.
- 플랫폼 서비스 분리와 비동기 영구 저장을 구현했습니다. API·이전·저장 실패 보호는 `PLATFORM_SERVICES.md`를 참고합니다. 기존 `persisted` 동기 결과 대신 `whenSaved` Promise와 런타임 저장 상태를 사용합니다.
- 모바일 조작·설정·효과음·햅틱·첫 안내는 통합했습니다. 동작과 미검증 항목은 `MOBILE_CONTROLS.md`에 있습니다. 과거 모바일 작업 명세와 최신 소스는 `node scripts/create-gemini-handoff.mjs --task mobile`로 `handoff/GEMINI_MOBILE_TASK.txt`에 묶습니다. 완료된 플랫폼 작업 기록은 `node scripts/create-gemini-handoff.mjs --task platform`으로 별도 생성할 수 있습니다.
- Mac 인계 절차와 아직 검증하지 않은 항목은 `NATIVE_HANDOFF.md`에 있습니다. 번들 ID는 개발용 임시 값입니다.

## Gemini 작업 기록과 현재 상태

- `npm run gemini:handoff`의 기본 출력은 `handoff/GEMINI_MOBILE_EXPERIENCE_TASK.txt`입니다. 자동 레이저 연출·120타격 이후 성능·Solar 조준 개선 지시와 최신 소스를 묶습니다. 챌린지 확장 후보는 보류했으며 `--task balance`로 별도 생성합니다. `npm run balance:audit`는 후보 수치를 계산하며 게임 적용을 의미하지 않습니다. 완료한 미션 기록 작업은 `--task mission-replay`로 재생성합니다.
- 수익화 공통 흐름·StoreKit 2/AdMob iOS 소스·검토 수정을 통합했습니다. 기본 ID null/off를 유지하며 실기기 SDK 검증은 Mac에서 진행합니다. 세이브는 v6이며 자동공격·수집 목표 테스트 포함 전체 Node 테스트는 45개입니다.
- 과거 모바일 소스 묶음은 `node scripts/create-gemini-handoff.mjs --task mobile`로 재생성합니다.
