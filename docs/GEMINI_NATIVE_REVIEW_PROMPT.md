# Gemini 검토 요청: 통합된 iOS 네이티브 수익화 소스

앞선 구현은 이미 통합했습니다. 이번에는 새 기능이나 전체 재작성이 아니라 **실제 결함 검토**를 해주세요. 사용자는 Windows에서 개발하며 Xcode 컴파일/서명/iPhone/Sandbox/TestFlight만 마지막에 Mac mini에서 진행합니다. 대규모 코드는 Gemini가 초안을 만들고 Codex가 통합합니다.

첨부한 현재 파일을 기준으로 다음을 우선 검토해주세요.

1. StoreKit 2 Swift 소스의 실제 API·actor reentrancy·Sendable/메인 스레드 문제, 전체 권한 조회와 Transaction.updates의 순서, restore/purchase/foreground 처리, 검증되지 않은 결과로 권한 취소 또는 부여 여부, 비소모성 transaction.finish 시점.
2. npm 로컬 플러그인 solar-smash-store-kit → Capacitor 이름 SolarSmashStoreKit의 SPM/CocoaPods 등록 구조. Capacitor 8.6.2 소스의 탐색은 Windows 테스트에서 확인했습니다. 실제 Xcode 컴파일/자동 등록 성공은 아직 주장하지 않습니다.
3. AdMob 8.3.0 원본 패키지는 show Promise가 너무 일찍 끝나고 이벤트에 requestId가 없습니다. 따라서 native/ios/AdMobOverrides 세 파일과 SHA-256 검사 스크립트로 실제 표시·요청 ID·보상·dismiss를 네이티브에서 묶도록 보완했습니다. 초안의 50ms 드레인은 제거했습니다. Swift API/객체 수명/중복·오래된 delegate·실패·종료 순서가 올바른지 검토해주세요.
4. 지원 범위는 iOS Google 직접 광고이며 미디에이션과 Android 광고는 미지원입니다. Google 공식 문서는 Google 광고의 reward가 dismiss보다 먼저 온다고 보장합니다. 이 전제를 무시하고 JS 타이머나 가짜 보상으로 바꾸지 마세요.
5. UMP의 canRequestAds와 개인정보 동의 여부를 혼동하지 않는지, 동의 갱신 실패/철회 중 준비 광고 무효화, 오래된 preload 결과, 초기화/리스너 등록 경쟁, 동의 화면 중 입력/Escape/오디오 잠금과 복귀를 확인해주세요. ATT는 기본 자동 요청하지 않습니다.
6. 기본 ID null, enabled:false 유지, 브라우저·미등록 플러그인·미패치 네이티브에서 무구매/무광고/무보상, 코인 상점과 저장 v5 보호. 테스트 가짜 어댑터는 tests 내부에만 있습니다.

확인한 결함만 심각도·파일/함수·재현 가능한 이벤트 순서·최소 수정안으로 설명하세요. 수정이 필요하면 해당 파일의 완성된 전체 코드와 의미 있는 Node 주입 테스트를 제공하세요. SDK·문서에 접근하지 못했다면 실제 확인했다고 쓰지 말고, 컴파일하지 못했다면 컴파일 성공을 주장하지 마세요. 새 서버·유료 SDK·Firebase·RevenueCat·의존성 업그레이드·전면 구조 변경은 추가하지 마세요. 검토 결과 결함이 없다면 그렇게 보고하고 Mac에서 검증할 정확한 항목만 정리하세요.
