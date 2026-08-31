# 장보기 개인화 시범 구현 검증 로그

- 실행일: 2026-08-29
- 검증 대상: 정상 장보기 평가 세션
- 장바구니: 우유 1개, 사과 2개, 카레 1개
- 총액: 7,400원
- 예산: 10,000원
- 백엔드 테스트 DB: H2 인메모리 DB

## 처리 순서

```text
[BehaviorPilotTest][1/7] GENERATED
codes=[SHOP.LIST_OPENED, SHOP.ITEM_SELECTED, SHOP.QUANTITY_CHANGED,
SHOP.ITEM_SELECTED, SHOP.QUANTITY_CHANGED, SHOP.ITEM_SELECTED,
SHOP.QUANTITY_CHANGED, SHOP.PRICE_CHECKED]

[BehaviorPilotTest][2/7] RAW_STORED accepted=8 rawCount=8

[BehaviorPilotTest][3/7] IDEMPOTENT duplicate=8 rawCount=8

[BehaviorPilotTest][4/7] NORMALIZED events=8 positive=7 neutral=1

[BehaviorPilotTest][5/7] PROFILE integrity=COMPLETE
language=100.0 numeracy=100.0 money=100.0 confidence=LOW

[BehaviorPilotTest][6/7] RECOMMENDATION
difficulty=2 mode=INSUFFICIENT_EVIDENCE

[BehaviorPilotTest][7/7] AI_AUDIT
source=AI model=qwen-test attempts=1 profile=<profile-id>
```

## 해석

1. 장보기 계산 시 목록 확인 1건, 상품 판정 3건, 수량 판정 3건, 예산 판정 1건이 순서대로 생성됐다.
2. 원본 행동 로그 8건이 모두 저장됐다.
3. 동일 이벤트를 다시 전송했을 때 8건 모두 `DUPLICATE`로 판정됐고 원본 건수는 8건으로 유지됐다.
4. 8건 모두 정규화됐으며 성공 근거 7건, 중립 근거 1건으로 분리됐다.
5. 세션 순번 누락이 없어 무결성 상태가 `COMPLETE`가 됐다.
6. 상품 이해, 수량 이해, 돈 관리 성공률이 각각 100%로 집계됐다.
7. 신뢰도 `LOW`는 정상 결과다. 한 개 과제와 한 개 세션만 사용했기 때문에 아직 동적 개인화에 사용할 충분한 근거가 아니다.
8. 근거가 부족한 상태에서 난이도를 임의로 올리지 않고 기본 난이도 2를 유지하는 추천이 생성됐다.

## 전체 테스트 결과

| 구분 | 결과 |
|---|---|
| 프론트 TypeScript 검사 | 통과 |
| 프론트 Jest | 17 suites, 105 tests 통과 |
| 백엔드 전체 Gradle 테스트 | 통과 |
| 장보기 파이프라인 통합 테스트 | 통과 |
| 이벤트 레지스트리 테스트 | 통과 |

## 실제 AI 장보기 생성 검증

2026-08-29 실제 Groq API를 호출해 다음 결과를 확인했다.

```text
source=AI
model=qwen/qwen3.6-27b
latencyMs=1588
personalizationMode=NO_PROFILE
difficulty=2
title=첫 장보기: 우유와 사과
objectives=우유 1개, 사과 1개
budget=5000
reasonCodes=[NO_EVIDENCE, BASELINE_ASSESSMENT]
```

테스트 계정에 행동 프로파일이 없어 AI는 사용자의 능력을 단정하지 않고 기초 관찰용 과제를 생성했다. 생성 JSON은 상품·수량·예산·문장 검증을 통과했으며 프론트가 사용하는 미션 형식으로 반환됐다.

## AI 생성 감사 저장 검증

Flyway V28 적용 후 실제 AI 생성 결과와 같은 생성 ID가 PostgreSQL에 저장되는 것을 확인했다.

```text
generationId=3f0218c7-cd3d-424d-bc4d-5b02e54ebd70
source=AI
model=qwen/qwen3.6-27b
attemptCount=1
questTitle=첫 번째 장보기 미션
profileLinked=false
```

`profileLinked=false`는 테스트 계정에 행동 프로파일이 없기 때문에 정상이다. 프로파일 생성 후에는 해당 생성 시점의 `profile_snapshot_id`가 함께 저장된다.

## 비차단 경고

- Jest 실행 중 기존 React 테스트의 `act(...)` 경고가 출력되지만 테스트 실패는 아니다.
- Watchman 재탐색 경고가 출력되지만 장보기 기능 및 테스트 결과에는 영향을 주지 않는다.
