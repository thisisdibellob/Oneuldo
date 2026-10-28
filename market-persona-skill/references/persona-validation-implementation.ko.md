# 페르소나 검증기 개선 완료 기록

2026-10-28 구현·테스트 기록이다. 실제 모델 파일럿, 실제 사람의 플레이 수집·비교는 수행하지 않았다. 변경은 커밋하지 않고 작업 트리에 남겼다.

readiness, 기회 audit와 검증 snapshot 생성기, 다중 판별자와 κ, 순서·변동성 설명 지표, 층화 쌍 부트스트랩과 검정력 근사를 legacy v2/traits v3 양쪽에 연결했다. 주 판정의 유효 쌍 8·|delta| ≥ 0.33·95% CI 0 제외·플래그 허용률 10%는 그대로다. 인물 JSON·prompt·버전·성향 카탈로그와 과거 출력 자료는 수정하지 않았다.

## 변경 파일 전체 목록

| 파일 | 구분 |
| --- | --- |
| [market-persona-skill/SKILL.md](../SKILL.md) | 수정 |
| [market-persona-skill/references/blind-review-guide.ko.md](blind-review-guide.ko.md) | 신규 |
| [market-persona-skill/references/persona-validation-extension-design.md](persona-validation-extension-design.md) | 신규 |
| [market-persona-skill/references/persona-validation-implementation.ko.md](persona-validation-implementation.ko.md) | 신규 |
| [market-persona-skill/references/persona-validation.md](persona-validation.md) | 수정 |
| [market-simulator/README.md](../../market-simulator/README.md) | 수정 |
| [market-simulator/cli.cjs](../../market-simulator/cli.cjs) | 수정 |
| [market-simulator/scripts/build-validation-snapshots.cjs](../../market-simulator/scripts/build-validation-snapshots.cjs) | 신규 |
| [market-simulator/server.cjs](../../market-simulator/server.cjs) | 수정 |
| [market-simulator/src/personaTraitValidationRun.cjs](../../market-simulator/src/personaTraitValidationRun.cjs) | 수정 |
| [market-simulator/src/personaValidationAnalysis.cjs](../../market-simulator/src/personaValidationAnalysis.cjs) | 신규 |
| [market-simulator/src/personaValidationBlind.cjs](../../market-simulator/src/personaValidationBlind.cjs) | 수정 |
| [market-simulator/src/personaValidationLegacyRun.cjs](../../market-simulator/src/personaValidationLegacyRun.cjs) | 수정 |
| [market-simulator/src/personaValidationOpportunity.cjs](../../market-simulator/src/personaValidationOpportunity.cjs) | 신규 |
| [market-simulator/src/personaValidationReadiness.cjs](../../market-simulator/src/personaValidationReadiness.cjs) | 신규 |
| [market-simulator/src/personaValidationReviewers.cjs](../../market-simulator/src/personaValidationReviewers.cjs) | 신규 |
| [market-simulator/src/personaValidationRun.cjs](../../market-simulator/src/personaValidationRun.cjs) | 수정 |
| [market-simulator/src/personaValidationSequence.cjs](../../market-simulator/src/personaValidationSequence.cjs) | 신규 |
| [market-simulator/src/personaValidationSpec.cjs](../../market-simulator/src/personaValidationSpec.cjs) | 신규 |
| [market-simulator/src/personaValidationSupplementary.cjs](../../market-simulator/src/personaValidationSupplementary.cjs) | 신규 |
| [market-simulator/test/persona-validation-analysis-integration.test.cjs](../../market-simulator/test/persona-validation-analysis-integration.test.cjs) | 신규 |
| [market-simulator/test/persona-validation-opportunity.test.cjs](../../market-simulator/test/persona-validation-opportunity.test.cjs) | 신규 |
| [market-simulator/test/persona-validation-readiness.test.cjs](../../market-simulator/test/persona-validation-readiness.test.cjs) | 신규 |
| [market-simulator/test/persona-validation-reviewers-integration.test.cjs](../../market-simulator/test/persona-validation-reviewers-integration.test.cjs) | 신규 |
| [market-simulator/test/persona-validation-reviewers.test.cjs](../../market-simulator/test/persona-validation-reviewers.test.cjs) | 신규 |
| [market-simulator/test/persona-validation-sequence.test.cjs](../../market-simulator/test/persona-validation-sequence.test.cjs) | 신규 |
| [market-simulator/test/persona-validation-supplementary.test.cjs](../../market-simulator/test/persona-validation-supplementary.test.cjs) | 신규 |
| [market-simulator/test/server.test.cjs](../../market-simulator/test/server.test.cjs) | 수정 |
| [market-simulator/validation/archive/persona-trait-validation-spec.v1.json](../../market-simulator/validation/archive/persona-trait-validation-spec.v1.json) | 신규 |
| [market-simulator/validation/archive/persona-validation-spec.v2.json](../../market-simulator/validation/archive/persona-validation-spec.v2.json) | 신규 |
| [market-simulator/validation/persona-trait-validation-spec.json](../../market-simulator/validation/persona-trait-validation-spec.json) | 수정 |
| [market-simulator/validation/persona-validation-spec.json](../../market-simulator/validation/persona-validation-spec.json) | 수정 |

## 새 도구와 필드 예시

이 절의 값·경로는 **입출력 형식 예시이며 실행 결과가 아니다**. 응답 배열은 일부 항목만 표시했다.

MCP의 `check_persona_validation_readiness`에 `{runDirectory}`를 전달한다. interactive CLI에서는 다음 한 줄 객체를 보낸다.

```json
{"tool":"check_persona_validation_readiness","arguments":{"runDirectory":"/absolute/output/new-validation-run"}}
```

```json
{
  "readiness":"blocked",
  "reasons":[{"code":"no-control-traces","message":"대조군의 완료 trace가 0개다."}],
  "complete":0,"required":160,
  "byPersonaCondition":[{"personaId":"neutral-adult-control","condition":"low","complete":0,"required":20,"technicalFailures":0}],
  "control":{"personaId":"neutral-adult-control","required":true,"present":false,"completed":0},
  "expectedValidPairs":[{"metricId":"careful-checker:comparisonRate","condition":"low","pairedSlots":0,"maximumValidPairs":0,"plannedMaximumValidPairs":20,"structurallyPossible":true}],
  "missingSlots":[{
    "condition":"low","seed":"s01","personaId":"neutral-adult-control","status":"missing",
    "prepareWholeTrace":{"personaId":"neutral-adult-control","seed":"s01","snapshotFilePath":"/absolute/low.json","outputPath":"/absolute/output/new-validation-run/traces/low/opaque-seed-dir/neutral-adult-control.json","attentionExperience":{"visit":"first-play"}}
  }]
}
```

`missingSlots[].prepareWholeTrace`는 반환 객체를 그대로 사용한다. 위 경로를 실제 경로처럼 조립하지 않는다. `unmatchedSlots`는 조건·seed 불일치, `technicalFailures`는 확인된 실패를 보존한다. `containsFixture`/`fixtureOnly`는 테스트 자료 여부다. traits에서는 지정 neutral ID 대신 같은 맥락에서 한 성향만 다른 비교 프로필을 기준으로 삼는다.

새 snapshot 생성 요청 형식:

```sh
node market-simulator/scripts/build-validation-snapshots.cjs --output-directory /absolute/new-snapshots --set-id validation-opportunities-v1
```

기존 디렉터리를 덮어쓰지 않는다. 반환하는 `snapshotFilePaths`, `snapshots.*.snapshotId`, `snapshots.*.sha256`와 `metadataPath`를 사용한다. 준비 응답의 추가 필드 예시는 다음과 같다.

```json
{
  "recommendedSeedCount":20,
  "powerWarning":{"code":"fewer-than-recommended-seeds","provided":8,"recommended":20,"message":"조건별 seed 20개 이상을 권장한다."},
  "opportunityAudit":{"version":1,"scope":"static-structural-possibility","warnings":[],"byPersonaCondition":[]}
}
```

`measure_persona_validation`의 기존 응답 필드는 유지하고 `readiness`, `readinessReasons`를 추가했다. 대조군이나 기대 유효 쌍이 없더라도 저장된 유효 자료는 측정한다. 출처·버전이 어긋난 파일은 기존처럼 거절한다. 새 측정·보고서에는 다음 항목이 연결된다.

| 필드 | 내용 |
| --- | --- |
| `readinessDetails`, `inabilityCauses` | 완료 격자·비교 상한·표본 부족/대조군 없음/기회 미발생/기술 실패 |
| `sequenceMetrics` | `descriptiveOnly:true`, 인물·조건 집계와 `perTrace`; `delayDistribution`, `actionTransitions`, `errorTaxonomy`, `recovery`, `perseveration` |
| `pooledAnalysis` | 같은 seed의 low/high 의존성을 보존하는 층화 쌍 부트스트랩; 조건별 같은 가중치, 주 판정 제외 |
| `powerAnalysis` | 현재 유효 쌍 수·고정 seed·가정·CI 검출률·pass 확률·Monte Carlo 표준오차 |
| `blindReviews` | 판별자별 자기 신고 종류·모델·세션과 A/B 점수 |
| `interReviewerAgreement` | 각 판의 legacy 인물/traits 성향별 Cohen κ(2명), Fleiss κ(3명 이상) |
| `referenceComparison` | `null`: 참조 자료 비교 미수행 |

다중 블라인드 준비 요청 형식:

```json
{"runDirectory":"/absolute/output/new-validation-run","panel":"A","reviewerId":"expert-01","reviewerKind":"expert"}
```

traits 제출 요청 형식(실제 판의 모든 opaque ID가 필요함):

```json
{
  "runDirectory":"/absolute/output/new-validation-run","panel":"A",
  "reviewerId":"expert-01","reviewerKind":"expert","reviewerSession":"independent-round-01",
  "answers":{"opaque-id-from-panel":{"traits":{"deliberation":"medium","checking":"high","exploration":"unknown","persistence":"unknown","helpSeeking":"unknown"},"confidence":0.6}}
}
```

응답은 기존 `reviewPath`, `panel`, `score`, 독립성 미입증 필드에 `reviewerId`, `reviewerKind`를 추가한다. LLM은 `reviewerModel`도 필요하다. A→B와 채점 답안 동결을 판별자별로 유지한다. ID를 생략하는 기존 호출과 `blind-review.json`은 호환되며 명시 ID 답안은 `blind-reviews.json`에 저장한다. 전문가에게는 [판별 안내](blind-review-guide.ko.md)를 제공한다.

## 검증 결과

- `market-simulator`에서 `npm test`: **753개 통과, 실패 0, 건너뜀 0**. 신규 7개 테스트 파일과 기존 전체 테스트를 함께 실행했다.
- `npm run typecheck`: 통과.
- `git diff --check`: 통과.
- 최초 전체 실행의 로컬 포트 제한(`EPERM`)은 로컬 브리지 테스트 실행 환경을 허용해 해결했다. 새 도구 목록을 반영한 뒤 전체 테스트를 다시 실행했다.
- readiness의 read-only와 누락/짝/대조군, snapshot 기회와 덮어쓰기 방지, 알려진 κ 값과 다중 저장, 순서 지표·null, 층화/검정력 재현성, 과거 명세 hash·측정·보고서 보존을 검사했다. fixture 결과는 실제 파일럿 결과가 아니다.

## 보존과 남은 한계

새 명세는 legacy v3/traits v2이고 새 manifest는 `analysisVersion:1`을 갖는다. 기존 명세 원문은 archive에 보존했다. 보관 hash의 manifest는 진행 조회로 다시 쓰지 않는다. 동일 재측정은 기존 파일을 보존하고 달라지는 결과는 새 runId를 요구한다. 이미 저장된 과거 보고서는 `historicalArtifactPreserved:true`로 기존 경로를 반환한다.

snapshot은 모든 seed에 같은 구조를 제공하지만 배우가 실제 기회에 도달함을 보장하지 않는다. 검증용 표시는 390×600이며 실제 앱 수행 검증을 대신하지 않는다. 특히 목표 동선에서 보이는 간편식 표지는 카레를 봤다는 근거가 아니다. legacy 카레 지표에는 카레 상품을 실제로 본 뒤 관심 재진입이 필요하다. 오류·도움·회복을 강제하지 않는다.

대기시간은 작성된 계획값이다. 오류 유형은 관측된 선택 분류이며 실제 인지 원인을 확정하지 않는다. 미발생과 미해결 회복은 null로 남기며 과업 실패를 장애 유사성 점수로 해석하지 않는다. 판별자 종류·독립성·키 미열람은 자기 신고이고 κ는 정확도나 임상 타당성 점수가 아니다.

검정력은 동일 분산 정규 위치 이동과 쌍 내 상관 0의 모의 가정에 따른 근사다. 실제 이산·동률·0 집중 분포에서는 달라질 수 있다. low 또는 high만 관찰된 보조 분석은 partial이며 주 판정을 대체하지 않는다.

이 검증은 실제 지적장애인과의 유사성을 입증하지 않는다. 실제 로그 수집·분포 비교·C2ST·실제 trace를 섞은 블라인드는 수행하지 않았다. 순수 지표 함수, `referenceComparison:null`, [출처 확장 메모](persona-validation-extension-design.md)만 남겼다.
