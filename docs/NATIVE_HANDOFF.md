# Windows 패키징 준비 / Mac 인계

## 현재 상태

- Capacitor core/CLI/iOS 8.6.2를 동일 버전으로 고정했다. Node 22 이상이 필요하다.
- `capacitor.config.json`의 `webDir`는 `dist`이며 외부 서버 주소를 사용하지 않는다.
- 빌드 루트 HTML은 게임을 직접 실행한다. 리다이렉트 때문에 Capacitor의 네이티브 브리지 주입을 잃지 않도록 한다.
- `dev.solarsmash.prototype`은 개발용 임시 ID다. Apple 등록이나 최종 번들 ID 확정을 의미하지 않는다.
- iOS 프로젝트 생성, 서명, Xcode 빌드, 실기기 검증은 아직 수행하지 않았다.
- 브라우저 localStorage와 네이티브 Preferences 8.0.1 저장 어댑터를 구현했다. 순차 JSON 저장·같은 WebView의 기존 데이터 이전·읽기 실패 시 덮어쓰기 방지는 Windows에서 주입 테스트했다. 실제 iPhone 동작은 미검증이며 `PLATFORM_SERVICES.md`에 규칙을 정리했다.
- 모바일 입력·별도 설정 키·합성 효과음·Haptics 8.0.2 경계도 구현했다. `MOBILE_CONTROLS.md`의 실기기 검증 목록을 함께 확인한다.
- StoreKit 2 로컬 패키지와 AdMob 8.3.0 iOS 어댑터 소스를 통합했다. 아래의 설치·보완 계약을 따른다. 기본 ID null/off 상태에서는 실결제·실광고가 발생하지 않는다.

## Windows

```sh
npm ci
npm run native:prepare
npm run gemini:handoff -- --task native-review
```

`native:prepare`는 웹 빌드와 로컬 자산·설정 검증만 한다. Xcode가 필요하지 않다. 결과가 통과해도 네이티브 SDK 동작이나 출시 준비 완료를 뜻하지 않는다. 게임 실행은 기존 `npm run dev`를 사용한다.

`gemini:handoff -- --task native-monetization`은 기존 네이티브 구현 지시와 현재 관련 소스를 모으는 작업 기록용 기능이다. 네이티브 소스는 통합했으며 기본 설정은 unavailable이다. 이전 공통 수익화·모바일·플랫폼 지시는 각각 `--task monetization`, `--task mobile`, `--task platform`으로 생성할 수 있다. 의존성·비밀 키·사용자 세이브는 포함하지 않는다.

`npm run gemini:handoff -- --task native-review`는 네이티브 코드 검토용 `handoff/GEMINI_NATIVE_REVIEW_TASK.txt`를 만든다. 해당 검토와 확인된 결함 수정은 완료했으며, 필요할 때만 재생성한다. 실제 Xcode 검증을 대체하지 않는다. 기본 `npm run gemini:handoff`는 다음 챌린지 밸런스 구현 요청을 생성한다.

## 이후 Mac에서

아래는 이후 인계 시 실행할 순서이며 지금 Windows 개발을 중단할 필요는 없다.

1. 지원되는 Node 22 이상과 Capacitor 8에서 요구하는 Xcode 환경을 준비하고 `npm ci`를 실행한다. 설치 버전의 공식 요구사항을 확인한다: https://capacitorjs.com/docs/getting-started/environment-setup
2. 최종 번들 ID와 Apple 팀을 결정하고 `capacitor.config.json`을 수정한다. 현재 임시 ID로 스토어 앱을 등록하지 않는다.
3. `npm run native:prepare` 후 `npx cap add ios`를 한 번 실행한다. 이후 업데이트는 `npx cap sync ios`를 사용한다.
4. `npx cap open ios`로 열고 서명과 배포 타깃을 설정한다. `native/ios/PrivacyInfo.xcprivacy`의 Preferences 사용 사유를 앱 타깃의 manifest에 병합하고 빌드 포함을 확인한다. 현재 코드의 import map을 위해 iOS 16.4 이상을 지원하거나, 더 오래된 iOS 지원이 필요하면 번들러 도입을 별도 검증한다.
5. WKWebView WebGL·메모리·백그라운드 복귀·safe area·터치, 오프라인 실행, 앱 종료/재시작 후 저장을 iPhone에서 확인한다.
6. 아래 네이티브 구매·광고 소스를 빌드하고 StoreKit Sandbox의 취소/보류/복원과 광고 테스트 ID를 확인한다. 실제 상품·광고 ID는 별도 설정한다.
7. App Privacy·동의 흐름·메타데이터를 검토하고 Archive·TestFlight로 진행한다.

생성한 `ios/`의 네이티브 소스와 프로젝트 설정은 버전 관리하되, 서명 자격 증명·빌드 결과·Pods·DerivedData는 포함하지 않는다. iOS 프로젝트 자체는 아직 생성하지 않았다.

## 네이티브 구매·광고 인계 상세

1. Mac에 저장소 전체를 복사/체크아웃한다. `native/ios/SolarSmashStoreKit`와 `native/ios/AdMobOverrides`를 반드시 포함한다. `npm ci`는 로컬 StoreKit 플러그인을 연결하고 AdMob 8.3.0의 iOS 보완 소스 3개를 SHA-256 검증 후 적용한다. `--ignore-scripts`로 설치했다면 `npm run native:patch`를 실행한다. 별도 npm 유료 플러그인이나 백엔드는 없다.
2. `npm test`, `npm run check`, `npm run native:prepare`로 Windows와 동일한 검사를 실행한다. 미션 기록을 포함한 Node 테스트 총 40개는 주입 테스트이며 Swift 실행 테스트가 아니다. `native:check`가 보완 누락을 보고하면 `npm run native:patch`를 실행한다. 다른 SDK 버전/변형 소스면 멈추므로 임의로 해시 검사를 제거하지 않는다.
3. `npx cap add ios`와 `npx cap sync ios`는 **Mac에서만** 실행한다. `solar-smash-store-kit` 로컬 npm 패키지의 Capacitor 메타데이터와 SPM/CocoaPods 소스를 통해 연동한다. 동일 패키지를 다시 Xcode에 수동 추가하지 않는다. sync 후 생성된 packageClassList에 `StoreKit2Plugin`이 포함되는지 확인한다. Windows에서는 패키지 발견까지만 검증했다. AppDelegate에 `capacitorDidLoad()`를 넣지 않는다. 필요시 진단 후 CAPBridgeViewController 서브클래스에서만 명시 등록한다.
4. StoreKit 2 Swift 패키지는 Capacitor 8.6.2로 고정했다. 앱의 iOS 배포 타깃은 import map을 고려해 **16.4 이상**으로 설정하고, Google Mobile Ads 13.11.0의 실제 Xcode/배포 요구사항을 확인해 더 높은 조건이 있으면 맞춘다. Swift concurrency/SDK API 진단을 실제 Xcode에서 수정·검증한다.
5. 앱 타깃에 In-App Purchase capability를 추가한다. 초기 테스트는 `TEST_ONLY_MONETIZATION_CONFIG`와 Xcode StoreKit Configuration의 일치하는 테스트 상품으로 한다. 테스트 설정을 사용하려면 플랫폼과 controller 양쪽에 동일한 구성 객체를 명시 주입한다. URL·localStorage·자동 배포 토글로 성공/보상을 활성화하지 않는다. 기본 설정은 계속 null/off다.
6. 광고 사용 전에 Info.plist에 **AdMob 앱 ID** `GADApplicationIdentifier`를 설정한다. 광고 유닛 ID와 앱 ID는 다르다. Google의 [iOS 시작 가이드](https://developers.google.com/admob/ios/quick-start)를 확인하고 현재 SKAdNetworkItems와 개인정보 요건을 반영한다. 현재는 Google 직접 광고만 사용하며 미디에이션 어댑터를 설치하지 않는다. ATT를 실제 사용한다면 `NSUserTrackingUsageDescription`과 추적 목적·동의 흐름도 확정한다. 자동 ATT 호출은 꺼져 있다.
7. `native/ios/PrivacyInfo.xcprivacy`의 Preferences UserDefaults 사유 `CA92.1`을 앱 manifest에 병합하고 앱 타깃 포함을 확인한다. Google SDK 자체 manifest·서명과 App Store Connect의 광고 데이터/식별자/진단 수집 공개도 검토한다. 자체 서버가 없다는 이유로 광고 SDK 데이터 수집을 누락하지 않는다.
8. 실기기에서 UMP 최초 양식·필요 지역의 개인정보 옵션·동의 변경/오류·백그라운드 복귀를 검사한다. canRequestAds는 개인화 동의가 아니라 요청 허용 상태다. 동의 거절이 반드시 canRequestAds=false라는 가정을 하지 않는다. 동의창·광고·구매 동안 입력과 오디오가 잠기고 실제 종료 후 복귀하는지 확인한다.
9. Sandbox에서 구매 성공/취소/pending·구매 복원·앱 재설치/재시작·환불/철회·외부 승인·오프라인을 확인한다. 조회 오류·미검증 결과가 기존 권한을 없애지 않는지, 광고 제거 보유/미확인 상태에서 전면 광고가 나오지 않는지 확인한다.
10. 공식 테스트 광고로 reward→dismiss, 취소, no-fill, 표시 실패, 중복 입력, 앱 복귀, 광고 후 WebAudio 재개를 확인한다. 네이티브 응답이 dismiss 때만 끝나고 요청 ID/보상/실제 표시 상태를 포함하는지 검증한다. 네이티브 소스 존재와 Node 통과만으로 출시 가능하다고 판단하지 않는다.

## 검토 수정 후 Mac에서 재현할 항목

- 앱 시작부터 광고 제거를 보유한 계정에서 백그라운드 중 환불/공유 해제 후 복귀한다. Transaction.updates 없이 전체 조회에서 권한이 사라지는 경우와 JS 조회·네이티브 foreground 스캔이 겹치는 경우에도 철회 이벤트와 UI가 반영되는지 확인한다.
- 복원 중 거래 업데이트가 응답보다 먼저 도착해도 정상 완료되는지 확인한다. 더 최신인 철회 이벤트와 오래된 보유 응답이 겹치면 철회 상태가 유지되어야 한다. 부분·미검증 조회와 조회 실패는 기존 권한을 바꾸면 안 된다.
- Swift strict concurrency 검사로 Sendable 결과·메인 큐 브리지 변환·CAPPlugin/CAPPluginCall 캡처를 확인한다. 관찰 종료 직후 예약된 시작 작업이 남지 않는지 확인한다.
- 테스트 광고를 표시하는 동안 같은 광고 유닛을 새로 준비하고 기존 광고를 닫는다. 새 광고가 삭제되지 않고 다음 표시에서 쓰이는지 확인한다. 동의 갱신과 preload가 겹칠 때 이전 준비 결과만으로 ready가 되면 안 된다.
- UMP/브리지 초기 오류 후 정상 재시도, 부분 리스너 실패 후 정리, 반복 동의 갱신 후 Showed 알림 중복 여부를 확인한다. 표시 프로토콜 위반 후에는 같은 어댑터에서 광고가 다시 활성화되면 안 된다.
