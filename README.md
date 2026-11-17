# Solar Smash 3D

`Solar Smash 3D`는 iOS 우선 출시를 목표로 개발 중인 기본 무료 IAP + IAA 하이브리드 캐주얼 게임입니다. 현재 Three.js 브라우저 프로토타입으로 파괴 체험을 검증하고 있으며, 서버 없는 코어와 이후 Google Play 확장을 목표로 합니다. Three.js + Capacitor 패키징을 Mac 실기기에서 검증할 계획이며, 실제 결제·광고·Game Center는 아직 연동하지 않았습니다.

## 포함 내용

- `web-prototype/index.html`: Three.js 3D 샌드박스 진입점
- `src/`: 렌더링, 무기, 모드, 상태, UI 모듈
- `docs/GAME_DESIGN_SPEC.md`: Solar Smash 스타일 파괴 샌드박스 구조 요약
- `docs/PROGRESSION_PLAN.md`: HTML5 → 상용화 버전 확장 로드맵
- `docs/SAVE_SCHEMA.json`: 무기, 모드, 세이브 데이터 구조
- `godot-project/README.md`: Godot 전환 시 씬/스크립트 분리 가이드

## 이번 패키지의 핵심 반영 사항

- 절차적 행성 표면, 자전/공전, 실제 크레이터 함몰과 발광 마그마
- 무기별 파편·섬광 효과와 최근 120개 타격 지형 복원
- 미션 6개, 진행 HUD·완료 결과·재도전·다음 미션
- 첫 완료 코인 보상과 로컬 진행도 저장
- 획득 코인 외형 상점: 푸른 지구(기본), 흑요석(250), 잿불 행성(450), 오로라(650)
- 구매/장착 분리, 중복 차감 방지, 외형 변경 시 파괴 흔적 보존 및 v6 저장 이전
- 미션 1~3성·활성 시간·로컬 최고기록, 설정/안내/백그라운드 중 타이머 정지, 기록 개선에 대한 재도전 안내
- 구매·복원·광고 공통 흐름과 보상 중복 방지, 45개 Node 테스트. StoreKit 2·AdMob iOS 소스 통합, 실제 Xcode/iPhone 검증은 Mac에서 진행
- 플랫폼 서비스 경계, 브라우저/Preferences 순차 저장과 읽기 실패 시 원본 보호 (네이티브 실기기 검증은 후속)
- 자동공격 켜기/끄기·탭 공격·드래그 회전·핀치/휠 줌, 독립 설정 저장·첫 안내·합성 효과음·네이티브 햅틱 경계
- 상점/미션 결과에서 다음 외형 수집 목표와 부족 코인 안내
- `Meteor`, `Laser`, `Missile` 3종 무기
- 외부 이미지 없이 조명과 별 배경 렌더링
- `Planet Mode` / `Solar Mode` 이중 모드
- `localStorage` 기반 최근 세션 저장
- 상용화 확장을 고려한 무기/진행도 데이터 구조
## 빠른 시작

```bash
npm install
npm run dev
```

- 개발 서버는 `web-prototype/index.html`을 바로 확인할 수 있게 루트에서 서빙합니다.
- Node 22 이상을 사용합니다. Capacitor core/CLI/iOS 8.6.2를 고정했습니다.
- 정적 빌드는 아래 명령으로 생성합니다.

```bash
npm run build
```

- 저장소 구조 점검은 아래 명령으로 실행합니다.

```bash
npm run check
```

## 개발 인계 문서

- `docs/DEV_QUICKSTART.md`: 다음 개발자/에이전트가 바로 이어서 작업하기 위한 실행 가이드
- `BACKLOG.md`: 우선순위 기준 후속 구현 작업 목록
- `docs/RELEASE_PLAN.md`: iOS 우선 출시·수익화·서버 비용·Mac 인계 계획
- `docs/NATIVE_HANDOFF.md`: Windows 패키징 검증과 이후 Mac 작업 순서
- `docs/PLATFORM_SERVICES.md`: 저장 API·이전·실패 보호와 미지원 플랫폼 서비스
- `docs/MOBILE_CONTROLS.md`: 조작·설정·사운드·햅틱과 iPhone 검증 항목
- `npm run native:prepare`: 웹 빌드와 로컬 자산·Capacitor 설정 검증 (Xcode 불필요)
- `docs/MONETIZATION_PLAN.md`: 광고 제거 상품·선택형 보상·전면 광고의 1차 정책과 구현 단계
- `npm test`: 저장 이전·구매 검증·광고 보상·빈도·코인 상점 회귀 테스트
- `docs/MISSION_REPLAY_PLAN.md`: 통합한 미션 별점·로컬 최고기록 기준과 검증 결과
- `docs/BALANCE_PLAN.md`: 보류한 챌린지·무기 간격·보상 경제 구현 후보 (아직 게임 미적용)
- `npm run balance:audit`: 후보의 발사 수·시간 하한·외형 구매 경로 재계산 (플레이테스트 아님)
- `npm run gemini:handoff`: 자동공격 연출·120타격 이후 성능·모바일 조준 개선 요청과 최신 소스를 `handoff/GEMINI_MOBILE_EXPERIENCE_TASK.txt`로 생성
- `npm run gemini:handoff -- --task balance`: 보류한 밸런스 구현 요청을 별도로 생성 (자동공격 UX 작업 후 재검토)
- `npm run gemini:handoff -- --task mission-replay`: 완료한 미션 기록 작업과 최신 관련 소스 재생성
- `npm run gemini:handoff -- --task native-review`: 이전 네이티브 검토 요청과 최신 소스 재생성

