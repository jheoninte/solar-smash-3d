# 플랫폼 서비스와 저장 규칙

## 구현 상태

`createPlatform()`이 Capacitor로 플랫폼을 감지하고 저장·결제·광고·랭킹 경계를 조립한다. `GameStateStore`는 저장 어댑터를 주입받으며 SDK를 직접 가져오지 않는다. Preferences 8.0.1은 core 8.6.2와 호환되는 실제 배포 버전이다.

| 서비스 | 브라우저 | iOS 코드 | 검증 범위 |
| --- | --- | --- | --- |
| 진행도 저장 | 기존 localStorage 키 유지 | 공식 Preferences JSON | 브라우저 실행·주입한 지연/실패 어댑터 검증. iPhone 미검증 |
| 결제 | unavailable | StoreKit 2 소스 통합, 기본 설정 unavailable | 검증된 브리지 결과만 처리하는 주입 테스트. Xcode/iPhone 미검증 |
| 광고 | unavailable | AdMob iOS 소스 통합, 기본 설정 unavailable | 종료 프로토콜·동의·보상 주입 테스트. 실제 SDK 미검증 |
| 랭킹 | unavailable | unavailable | 점수 전송·로그인을 수행하지 않음 |

플랫폼 이름이 iOS여도 미구현 서비스를 지원한다고 표시하지 않는다. HubGame은 로컬 저장·코인 상점·미션의 선행 조건이 아니다. 별도 서버나 과금 서비스는 도입하지 않았다.

## 저장 API와 게임 동작

- `StorageAdapter.load(key)` → `{ data, writable, persisted, error?, migrated? }`.
- `StorageAdapter.save(key, payload)` → `Promise<boolean>`. 호출 즉시 JSON 스냅샷을 만들고 순서대로 쓴다. 실패해도 다음 요청은 실행한다.
- `GameStateStore.persist(state)` → `Promise<boolean>`. `isSaving`, `storage`, `storageBlocked`, `hasSaved`를 갱신한다.
- 상태 변경·코인 차감·미션 완료 표시는 저장 대기 전에 동기적으로 끝낸다. `buyItem`, `equipItem`, `claimMissionReward`는 즉시 결과를 반환하며, 저장을 시작한 결과의 `whenSaved`로 실제 저장 완료를 기다릴 수 있다. Promise를 저장 성공 boolean으로 사용하지 않는다.
- 모드/미션/Reset/장착은 저장 응답을 기다리며 화면을 멈추지 않는다. 완료 처리는 기존과 같이 발사체 순회가 끝난 뒤 수행한다. 늦게 끝난 저장 콜백이 모달이나 모드를 바꾸지 않는다.
- HUD·상점·미션 결과에 저장 중/완료/실패/보호 상태를 표시한다. 실패해도 현재 실행의 게임 진행은 유지한다. 아직 끝나지 않은 비동기 쓰기는 강제 종료 시 유실될 수 있으며 종료 이벤트로 완료를 보장하지 않는다.

## 이전과 데이터 보호

1. 네이티브 Preferences에 값이 있으면 이를 우선한다. 빈 문자열·JSON null·배열·알 수 없는 버전 등은 없는 값으로 취급하지 않는다.
2. 네이티브 값이 정확히 null일 때만 같은 WebView의 기존 localStorage를 확인한다. 인식 가능한 v2/v3/v4/v5/v6 데이터면 Preferences에 복사한다. 원본은 삭제하지 않는다.
3. 이전 쓰기에 실패해도 원본에서 읽은 진행도를 메모리에 유지하고 이후 저장에서 재시도할 수 있다.
4. 읽기 거부·파싱 오류·알 수 없는 형식/버전은 기본 상태로 임시 플레이하되 해당 실행의 덮어쓰기를 차단한다. 원본 데이터를 보존하고 재실행 후 다시 읽는다. 자동 초기화·소스 삭제는 하지 않는다.
5. 유효한 저장 안의 개별 손상 필드는 기존 상태 정규화로 복구한다. 스키마 v6은 이전 세이브의 타격·완료 미션·코인·외형·v5 보상 원장을 유지하고 `missionRecords`를 추가한다. v2~v5에서 과거 시간을 추정하지 않는다. v6의 유효한 완료 미션에 한해 양의 안전한 정수 `bestActiveMs`를 복원한다. 코인·원장·최고기록은 같은 payload로 저장한다.

Windows 브라우저와 iPhone 사이의 세이브 동기화는 없다. 브라우저의 포트/호스트가 바뀌면 별도 origin이므로 서로 다른 localStorage를 사용한다. Preferences는 가벼운 진행도용이며 대규모 리플레이·파일 저장이나 안전한 IAP 권한 검증 용도가 아니다. 재설치 복원·플랫폼 간 클라우드 동기화도 구현하지 않았다.

## 배포와 Mac 검증

개발 서버와 정적 빌드가 같은 로컬 ESM·라이선스를 제공하도록 `scripts/vendor-assets.mjs`에서 관리한다. Preferences의 extensionless import는 배포용 `.js` 경로로 보정한다. 런타임은 CDN이나 node_modules 경로를 요청하지 않는다.

`native/ios/PrivacyInfo.xcprivacy`는 Preferences의 UserDefaults 사용 사유 CA92.1 템플릿이다. 설치한 플러그인 README의 요구사항을 반영했다. Mac에서 생성된 앱 타깃에 병합·포함하고, 이후 광고·분석 SDK 추가 시 실제 사용에 맞춰 다시 검토한다. 이는 앱 전체 개인정보 공개나 App Privacy 작성 완료를 의미하지 않는다.

Mac에서 Preferences 실제 읽기/쓰기·재시작·업데이트 이전·저장 실패·오프라인·앱 복귀·강제 종료, privacy manifest 포함을 확인해야 한다. Windows의 주입 테스트를 iPhone 검증으로 대신하지 않는다.
