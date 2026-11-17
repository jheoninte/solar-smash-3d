# Gemini 후속 작업: iOS 구매·광고 네이티브 어댑터

첨부한 최신 소스를 기준으로 완성된 변경 파일 전체를 작성해주세요. 사용자는 Windows에서 Gemini 초안을 받고 Codex가 검토·통합·검증합니다. 최종 Xcode 컴파일/서명/iPhone/Sandbox/TestFlight만 Mac mini에서 진행합니다. 지금 Mac 작업을 선행 조건으로 요구하지 마세요. 이미 구현한 공통 수익화 흐름을 다시 작성하지 마세요.

## 현재 기준

- Vanilla Three.js ES modules, Capacitor 8.6.2. Vite 없음. 로컬 import map/vendor 방식과 정적 빌드를 유지합니다.
- 미션·코인 외형·오프라인 저장 v5·설정·입력·오디오, MonetizationController/AdPolicy/UI 연결 완료. Node 의존성 주입 테스트 15개. 실제 결제/광고 기본 unavailable, 상품 ID/광고 ID null 및 enabled:false 유지.
- 서버·Firebase·RevenueCat·구독형/유료 플러그인을 도입하지 않습니다. iOS 비소모성 remove_ads 하나만. 권한 근거는 StoreKit 검증 결과이며 localStorage 플래그가 아닙니다.
- 정책·계약은 docs/MONETIZATION_PLAN.md와 src/platform/monetization.js를 반드시 따릅니다.

## 구현 범위

1. 직접 StoreKit 2 Capacitor iOS 로컬 플러그인의 Swift 소스 및 JS 어댑터: 상품 조회(현지 가격), 구매 성공/취소/pending/미검증/오프라인/실패 구분, AppStore.sync 복원, verified currentEntitlements, Transaction.updates 환불/취소/외부 승인 반영. 검증되지 않은 거래로 권한을 부여하거나 기존 권한을 취소하지 마세요. 스토어가 권한을 검증해 반영한 후 transaction.finish, 중복·observer 수명·앱 재개·동시 요청을 처리하세요. 부분 실패를 검증된 빈 목록으로 반환하지 마세요.
2. AdMob 어댑터: @capacitor-community/admob 8.4.1은 후보일 뿐입니다. 실제 공개 README/타입/패키지와 Capacitor 8/iOS SDK 요구사항을 확인하고, 조회한 출처·버전·확인하지 못한 부분을 구분하세요. 실재 API만 사용하고 핀 고정 및 vendor/dev/build 경로 변경이 필요하면 전체 코드를 제공하세요. UMP 광고 요청 가능 상태·필요한 개인정보 선택 진입점·ATT의 실제 추적 여부를 처리하세요. 가짜 동의창이나 iOS이기 때문에 허용하는 기본값을 쓰지 마세요.
3. 광고 preload와 cached ready/consent, 실제 onShown 및 시도 ID. 보상 콜백이 raw close보다 먼저/나중에 오는 경우를 정규화하세요. 현재 show* Promise는 화면 종료+보상 이벤트 정리 이후에만 종료해야 하며, 종료 후 콜백은 controller에서 거부합니다. 임의 지연으로 보상을 추정하거나 실제 표시 중 타임아웃으로 UI 잠금을 풀지 마세요. SDK가 이벤트 순서를 보장하지 않는다면 확인한 제약과 필요한 네이티브 중재 방식을 구체적으로 제안하세요. 어댑터에서 지킬 수 없는 계약은 숨기지 마세요.
4. createPlatform 연결은 실제 native/plugin 등록/유효한 설정을 확인한 경우만. 플러그인 없는 브라우저와 Capacitor에서도 기존 코인 상점·게임이 동작해야 합니다. 테스트 성공 구현은 Node 테스트 내부에서만 주입하고 배포용 성공/보상 토글을 만들지 마세요.
5. 실제 운영 ID/가격을 발명하지 말고 기본 null/off 유지. 공식 테스트 광고 ID를 쓸 경우 test 전용 설정과 실서비스 설정을 명확히 분리하고 기본 실행으로 광고가 켜지지 않게 합니다.
6. 아직 ios/ Xcode 프로젝트가 없습니다. native/ios/ 아래 재현 가능한 로컬 플러그인 패키지·등록·SPM/CocoaPods 경로와 필요한 파일 배치 절차를 준비하세요. 프로젝트 생성/최종 bundle ID/서명은 Mac 인계 때 합니다. 설치/등록 API는 Capacitor 8 기준으로 검증하고 소스가 있다는 이유로 동작 완료라고 쓰지 마세요.
7. Windows에서 실행할 Node 주입 테스트 추가: 검증 권한/환불/재개/오류, consent false, no-fill/표시 실패/보상 없는 닫힘, 이벤트 역순·중복·지난 시도·dispose. npm test/check/native:prepare가 계속 통과해야 합니다.
8. docs/NATIVE_HANDOFF.md와 개인정보 공개/ATT/UMP/광고·구매 설정 문서 업데이트. Mac에서 검증할 항목과 Windows에서 가능한 항목을 구분하세요. Game Center는 이번 범위가 아닙니다.

## 출력 형식

먼저 선택한 SDK·무료 경로·버전과 근거를 짧게 설명하고, 변경/추가 파일 목록 뒤에 각 파일의 완성된 전체 코드를 파일 경로와 함께 제공하세요. 기존 CSS/HTML/UI를 불필요하게 교체하지 마세요. 마지막에 의존성/설치·Windows 검증 명령·Mac 등록/실기기 검증 절차·확인하지 못한 SDK 제약을 명시하세요. 사용하지 못한 가이드 문서를 읽었다고 주장하지 마세요.
