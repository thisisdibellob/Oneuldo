# 페르소나 성향 카탈로그 v2 구현 기록

2026-11-02 구현·로컬 검증 기록이다. 첫 플레이 성향 네 축을 추가했으며 실제 모델 파일럿이나 실제 지적장애인 자료 비교를 수행하지 않았다. 커밋·푸시하지 않고 작업 트리에 남겼다.

## 변경·신규 파일 전체 목록

| 파일 | 구분 |
| --- | --- |
| [market-persona-skill/references/persona-traits-v2-implementation.ko.md](persona-traits-v2-implementation.ko.md) | 신규 |
| [market-persona-skill/references/persona-validation.md](../../../market-persona-skill/validation/procedure.md) | 수정 |
| [market-simulator/README.md](../../../market-simulator/README.md) | 수정 |
| [market-simulator/server.cjs](../../../market-simulator/server.cjs) | 수정 |
| [market-simulator/src/validation/personaTraitProfiles.cjs](../../../market-simulator/src/validation/personaTraitProfiles.cjs) | 수정 |
| [market-simulator/src/validation/personaTraitValidationRun.cjs](../../../market-simulator/src/validation/personaTraitValidationRun.cjs) | 수정 |
| [market-simulator/src/validation/personaValidationBlind.cjs](../../../market-simulator/src/validation/personaValidationBlind.cjs) | 수정 |
| [market-simulator/src/validation/personaValidationFirstPlay.cjs](../../../market-simulator/src/validation/personaValidationFirstPlay.cjs) | 신규 |
| [market-simulator/src/validation/personaValidationMetrics.cjs](../../../market-simulator/src/validation/personaValidationMetrics.cjs) | 수정 |
| [market-simulator/src/validation/personaValidationOpportunity.cjs](../../../market-simulator/src/validation/personaValidationOpportunity.cjs) | 수정 |
| [market-simulator/src/validation/personaValidationReadiness.cjs](../../../market-simulator/src/validation/personaValidationReadiness.cjs) | 수정 |
| [market-simulator/src/validation/personaValidationRun.cjs](../../../market-simulator/src/validation/personaValidationRun.cjs) | 수정 |
| [market-simulator/src/validation/personaValidationSpec.cjs](../../../market-simulator/src/validation/personaValidationSpec.cjs) | 수정 |
| [market-simulator/src/types.ts](../../../market-simulator/src/types.ts) | 수정 |
| [market-simulator/test/fixtures/persona-trait-v1-regression.json](../../../market-simulator/test/fixtures/persona-trait-v1-regression.json) | 신규 |
| [market-simulator/test/persona-trait-catalog-v2.test.cjs](../../../market-simulator/test/persona-trait-catalog-v2.test.cjs) | 신규 |
| [market-simulator/test/persona-trait-first-play-opportunity.test.cjs](../../../market-simulator/test/persona-trait-first-play-opportunity.test.cjs) | 신규 |
| [market-simulator/test/persona-trait-first-play.test.cjs](../../../market-simulator/test/persona-trait-first-play.test.cjs) | 신규 |
| [market-simulator/test/persona-trait-profiles.test.cjs](../../../market-simulator/test/persona-trait-profiles.test.cjs) | 수정 |
| [market-simulator/test/persona-trait-run.test.cjs](../../../market-simulator/test/persona-trait-run.test.cjs) | 수정 |
| [market-simulator/test/persona-trait-v1-regression.test.cjs](../../../market-simulator/test/persona-trait-v1-regression.test.cjs) | 신규 |
| [market-simulator/test/persona-trait-v2-run.test.cjs](../../../market-simulator/test/persona-trait-v2-run.test.cjs) | 신규 |
| [market-simulator/test/persona-validation-analysis-integration.test.cjs](../../../market-simulator/test/persona-validation-analysis-integration.test.cjs) | 수정 |
| [market-simulator/validation/persona-trait-validation-spec-v2.json](../../../market-simulator/validation/persona-trait-validation-spec-v2.json) | 신규 |
| [market-simulator/validation/persona-traits-v2.json](../../../market-simulator/validation/persona-traits-v2.json) | 신규 |

## 구현 결과

- 새 `persona-traits-v2.json`은 기존 다섯 축을 그대로 유지하며 `initialCaution`, `operationLearning`, `routeReliance`, `textCueLoad`를 더한다. 네 인물의 지정 매핑과 다섯 preset의 새 축 `medium`을 반영했다. 지침 12개에 근거 연구, 충분히 분명할 때 멈춤, 실수 강제 금지를 기록했다.
- 새 traits run은 v2 카탈로그와 별도 `persona-trait-validation-spec-v2.json`(spec version 3, `analysisVersion:2`)을 쓴다. 명시적 v1 요청·저장 manifest는 해당 카탈로그와 명세로 분기한다. v1의 원본 내용·프로필 version hash·기존 결과를 보존한다.
- v2 traits의 기본 인물도 검증 slot scope에서만 매핑 지침을 주입한다. 일반 생성·legacy v2·원본 인물 JSON/prompt·`wholeTrace*.ts`·`WHOLE_*_INTERPRETATION`은 변경하지 않았다. 수행 매개변수·attention·cognition·contextHash는 유지한다.
- 초반 신중함은 관찰된 초기 구간 행동 수이며, 열기/담기 없이 종료하면 관찰 종료까지 센다. 빈 trace는 null이다. 나머지 축은 첫 사용·실제 이동 선택지·유사 상품 동시 노출이라는 조건부 기회에서 발현 비율을 센다. reason·활동 표기·작성 시간만으로 발현을 인정하지 않는다.
- 기존 지표의 발현을 먼저 귀속하고 새 축 중 초반 신중함 → 글자 단서 → 조작 익히기 순서로 중복을 제외한다. 기존 선언-only 어려움과만 충돌하면 새 기회를 제외하며, 0점으로 바꾸지 않는다. 이동 도착이 불명확한 곳은 미방문으로 추정하지 않는다. 제외·누락·근거 step ID를 metrics와 coverage에 기록한다.
- 같은 맥락·다른 여덟 축·조건·seed를 고정한 단일 축 쌍 중 양쪽에 기회가 있는 쌍만 비교한다. 유효 쌍 8, |delta| 0.33, 95% CI의 0 제외 기준은 그대로다. 동일 인물·조건에서 관찰값이 같은 trace가 둘 이상이면 step ID를 포함한 진단 경고만 남긴다. 감쇠·과장 상한·성장 점수는 추가하지 않았다.
- 블라인드 답안은 run 카탈로그별로 5축/9축을 엄격히 구분한다. 원관측 상품·이동 메뉴를 익명 판에서 제거하는 기존 방식 때문에 새 일부 축은 unknown일 수 있다. 행동 측정의 주 판정과 분리한다.

## 관찰 불가와 snapshot 점검

구현 전체에서 영구적으로 `unexercised`로 남겨 둔 축은 없다. 실제 저장 audit/bundle에 필요한 필드가 있는 것을 소스에서 확인했다. 다만 파일럿을 실행하지 않았으므로 실제 각 인물의 기회 발생이나 성향 발현은 아직 측정하지 않았다.

| 축 | null/unexercised 또는 기회 제외 조건 |
| --- | --- |
| initialCaution | 빈 trace, revisit, 초기 구간이 선언-only 기존 발현과 겹쳐 관찰을 독립적으로 구분할 수 없음 |
| operationLearning | 첫 사용 조작 없음, revisit, 선언-only 기존 발현과만 겹치는 첫 사용 기회 |
| routeReliance | 저장 navigation 메뉴/choice source/관측 anchors·화면 상태 부족, 방문 도착 결과 부족, 방문·미방문 혼합 선택지 없음, 선언-only 중복 |
| textCueLoad | 관측된 상품명·규격/동시 표시 부족, 목표 구매 없음, 관심 구매, 유사 상품이 다른 페이지에만 있음, 선언-only 중복 |

현재 `output/persona-validation-20261031-current-160/snapshots/low.snapshot.json`과 `high.snapshot.json`, 생성기 `buildSnapshots()` 결과를 읽기 전용으로 점검했다. 두 조건 모두 도달 가능한 waypoint 131개·갈림길 125개였다. 예를 들어 W072 → W063 이후 방문한 W072와 미방문 W049가 함께 선택 가능한 구조다. low에는 milk/milk-small/chocolate-milk 및 apple/apple-green, high에는 water/eggs/banana 계열도 같은 페이지에 노출 가능한 구조였다. 네 축의 정적 기회 구조가 이미 있으므로 **snapshot 생성기를 변경하지 않았고 기존 snapshot을 덮어쓰지 않았다.** 이는 HUD 정상 표시나 실제 배우의 기회 도달을 입증하지 않는다.

## 테스트 결과

실행 위치는 `market-simulator/`다.

| 명령 | 결과 |
| --- | --- |
| `npm test` | **944 통과, 0 실패, 0 건너뜀** |
| `npm run typecheck` | 통과, 종료 코드 0 |
| `git diff --check` (저장소 루트) | 통과 |

최초 제한 환경의 전체 테스트는 922 통과·21 실패였다. 기존 브리지의 `listen EPERM: operation not permitted 127.0.0.1`와 로컬 host 시작 실패 때문이었다. 테스트용 루프백 통신을 허용하여 전체 `npm test`를 재실행했고 위의 944개가 모두 통과했다. 모델·실제 앱·백엔드 호출은 하지 않았다. 원시 로그는 [제한 환경 실행](/tmp/oneuldo-persona-v2-npm-test.log), [최종 전체 실행](/tmp/oneuldo-persona-v2-npm-test-unrestricted.log), [타입 검사](/tmp/oneuldo-persona-v2-typecheck.log)에 있다.

각 축의 손 high/low trace 8쌍에서 supported, 뒤집은 방향에서 contradicted를 확인했다. 기회 없음, 조작 두 번째 사용 제외, 관심 구매 제외, 방문 waypoint가 선택지에 없는 경계, C2 중복 제외, 선언-only 충돌·누락 도착의 null 처리를 검사했다. 별도 저장 run 통합 fixture 128개에서 네 축의 8쌍×2조건 판정·9축 보고서·coverage·분산0 진단을 함께 확인했다. 이 128개는 손으로 만든 테스트 데이터이며 모델 파일럿이 아니다.

v1 회귀 fixture는 변경 전 소스 revision `4d5c1beef82a2d4eddba0491ab0242baa446f091`에서 기준 결과를 동결했다. 임시 경로와 경로 의존 `dataFingerprint`만 정규화한 전체 measurements/report hash가 현재 구현과 같다. archive spec 1 및 기존 spec 2(`analysisVersion:1`) 둘 다 검사하며, 기존 manifest·측정·보고서 bytes와 v1 profile version hash도 보존한다. 지침 12개의 실제 `nextGoalRecheckTrait` 정규식 비충돌, 5축/9축 답안 검증, 원본 인물·인지설정·일반 생성의 격리도 검사했다.

## 하지 않은 것과 남은 작업

모델/provider/실제 앱/backend 호출, 파일럿 생성, 실제 데이터 수집·비교, 과거 output/run/report 수정, 커밋·푸시는 하지 않았다. 원본 인물 파일과 v1 카탈로그·기존 명세의 판정 기준도 수정하지 않았다. 연구 출처와 직접/간접 근거의 구분은 [검증 절차](../../../market-persona-skill/validation/trait-catalog.md#연구-근거와-해석-한계)에 정리했다.

연구 근거로 설계한 첫 플레이 성향이 수준대로 행동에 나타나는지를 본 것이며, 실제 지적장애인과의 유사성을 입증하지 않는다.

남은 작업은 **HUD 결함이 고쳐진 snapshot, 새 runId, 조건별 seed 20개 이상**으로 파일럿을 실행하는 것이다. 별도 요청에서 readiness로 기회를 먼저 확인하고 생성·측정·블라인드·보고를 수행한다.
