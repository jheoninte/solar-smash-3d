# Solar Smash 3D

`Solar Smash 3D`는 Vertex AI 기획 세션의 결과를 바탕으로 정리한 continuation-ready 저장소입니다. HTML5에서 즉시 검증 가능한 파괴 샌드박스를 제공하고, 이후 Godot 또는 Unity로 옮기기 쉬운 형태로 기획/데이터/프로토타입을 묶었습니다.

## 포함 내용

- `web-prototype/index.html`: 단일 파일 파괴 샌드박스 프로토타입
- `docs/GAME_DESIGN_SPEC.md`: Solar Smash 스타일 파괴 샌드박스 구조 요약
- `docs/PROGRESSION_PLAN.md`: HTML5 → 상용화 버전 확장 로드맵
- `docs/SAVE_SCHEMA.json`: 무기, 모드, 세이브 데이터 구조
- `godot-project/README.md`: Godot 전환 시 씬/스크립트 분리 가이드

## 이번 패키지의 핵심 반영 사항

- 행성 파괴와 크레이터/마그마 코어 표현
- `Meteor`, `Laser`, `Missile` 3종 무기
- Web Audio 기반 피드백
- `Planet Mode` / `Solar Mode` 이중 모드
- `localStorage` 기반 최근 세션 저장
- 상용화 확장을 고려한 무기/진행도 데이터 구조
## 빠른 시작

```bash
npm install
npm run dev
```

- 개발 서버는 `web-prototype/index.html`을 바로 확인할 수 있게 루트에서 서빙합니다.
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

