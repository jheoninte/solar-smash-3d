# DEV QUICKSTART

## 목표

- 현재 단일 HTML 프로토타입을 유지하면서도 바로 분업 가능한 개발 베이스를 제공합니다.
- 다음 에이전트는 문서 재정리 없이 `npm run dev`부터 시작할 수 있습니다.

## 실행

```bash
npm install
npm run dev
```

## 추천 첫 작업 순서

1. `web-prototype/index.html`에서 무기/이펙트/세이브 코드를 모듈 단위로 분리합니다.
2. `docs/SAVE_SCHEMA.json`을 기준으로 런타임 상태 타입 정의를 분리합니다.
3. `Planet Mode`와 `Solar Mode`를 같은 파괴 이벤트 큐를 쓰도록 구조화합니다.
4. 이후 Godot 또는 Unity 포팅용 데이터 어댑터를 추가합니다.

## 첫 스프린트 산출물

- 무기 데이터 테이블 분리
- 파괴 이벤트/크레이터 계산 함수 분리
- 저장 로직을 별도 서비스로 이동
- 간단한 QA 체크리스트 문서화
