# 페르소나 충실도 검증 절차

기본 검증은 공통 행동 성향을 사용한다. 인물 이름에 고정된 정답 행동을 요구하지 않고, 같은 기본 맥락에서 성향 설정을 바꿨을 때 상황에 맞는 행동 차이가 나타나는지 살핀다. 각 인물은 성향·수행 기준·취향·경험의 조합이며, 유형과 `low / medium / high`는 합성 설계값이다. 심리검사 점수, 실제 성인의 평균, 지적장애 집단의 실측 행동이나 임상적 타당성을 뜻하지 않는다.

MCP 도구 6개를 사용한다. 권장 순서는 `prepare_persona_validation` → `check_persona_validation_readiness` → 부족 슬롯 생성 → readiness 재확인 → `measure_persona_validation` → 다중 `prepare_blind_review`/`submit_blind_review` → `persona_validation_report`다. 전체 trace 작성·제출은 준비와 측정 사이에서 별도로 한다. 검증 도구는 모델·provider·앱·백엔드를 호출하거나 trace를 수정·재생성하지 않으며, 일반 생성 경로에서 자동 실행되지 않는다. MCP 입력 객체는 interactive CLI에서 `{"tool":"도구명","arguments":입력객체}` 형식의 한 줄로 전달한다.

## 판정 가능성 점검과 추가 분석

**판정 불가 표본 — `persona-pilot-20261028`**: HUD 고정 마스크 결함으로 64개 입력 모두 시작점에서 23/139 지점·매대 0곳에만 도달했으므로, 저장 trace 55개의 매대 열기·담기 0건과 포기 55건을 인물 특성 신호로 사용하지 않는다([결함 주석](../../output/persona-pilot-20261028/pilot-validity-note.ko.md)).
원본은 보존하며 판정 코드의 자동 제외는 아직 적용되지 않았다. 기존 판정·블라인드 진행 문구를 재사용하지 않고, 수정 후 새 입력의 검증 결과와 구분한다.

새 run은 legacy 명세 v3 또는 성향 명세 v2와 `analysisVersion:1`을 기록한다. 주 판정 기준은 유효 쌍 8 이상, 기대 방향, |delta| ≥ 0.33, 95% CI의 0 제외이며 플래그 허용률은 10%로 유지한다. **조건별 seed는 20개 이상을 권장한다.** 아래 8개 seed 예제는 입력 호환을 보여주는 축소 예제이며 충분한 검정력을 보장하지 않는다. `prepare_persona_validation`은 `recommendedSeedCount:20`, 20개 미만이면 `powerWarning`, snapshot의 `opportunityAudit`를 반환한다.

### readiness → 부족 슬롯 생성 → measure

`check_persona_validation_readiness({runDirectory})`는 읽기 전용이다. 인물×조건의 완료/필요 수(`byPersonaCondition`), 지정 대조군(`control`), 실제 비교 기준 프로필(`referenceControls`), 조건·seed가 어긋난 쌍(`unmatchedSlots`), 지표별 최대 유효 쌍 상한(`expectedValidPairs`), 생성할 슬롯(`missingSlots`)을 반환한다. 각 `missingSlots[i].prepareWholeTrace`를 그대로 사용한다. 기술 실패 근거가 있는 슬롯과 미시도를 구분하며, 이미 저장된 잘못된 자료를 덮어써 재생성하지 않는다.

다음은 **입출력 형식 예시이며 실행 결과가 아니다**. 배열은 일부만 표시했다.

```json
{"runDirectory":"/absolute/output/new-validation-run"}
```

```json
{
  "readiness":"blocked",
  "complete":0,
  "required":160,
  "byPersonaCondition":[{"personaId":"neutral-adult-control","condition":"low","complete":0,"required":20,"technicalFailures":0}],
  "control":{"personaId":"neutral-adult-control","required":true,"present":false,"completed":0},
  "missingSlots":[{
    "condition":"low","seed":"s01","personaId":"neutral-adult-control","status":"missing",
    "prepareWholeTrace":{"personaId":"neutral-adult-control","seed":"s01","snapshotFilePath":"/absolute/low.json","outputPath":"/absolute/output/new-validation-run/traces/low/opaque-seed-dir/neutral-adult-control.json","attentionExperience":{"visit":"first-play"}}
  }]
}
```

지표별 `maximumValidPairs`는 현재 완료된 쌍의 상한이고 `plannedMaximumValidPairs`는 모든 슬롯을 채웠을 때의 구조적 상한이다. 실제로 두 trace가 모두 기회를 경험한 유효 쌍 수는 측정 후에만 알 수 있다. v2는 지정 대조군 완료가 0이면 blocked다. v3는 기존 계약대로 같은 맥락·단일 성향 대비의 낮은 수준 프로필이 비교 기준이며, `neutral-adult-control` ID 자체가 필수는 아니다. 두 경로 모두 모든 비교의 예상 유효 쌍이 0이면 blocked다. 나머지 미완료 또는 최대 유효 쌍 8 미만은 incomplete, 슬롯과 쌍 상한이 충족되면 ready다. ready는 실제 기회 발현이나 성향 통과가 아니다.

blocked여도 측정 가능한 자료는 측정한다. 기존 응답 필드를 유지하고 `readiness`, `readinessReasons`를 덧붙인다. 저장 측정/보고서의 `readinessDetails`, `inabilityCauses`와 한국어 보고서 맨 위의 **판정 불가 원인** 표에서 표본 부족·대조군 없음·기회 미발생·기술 실패를 읽는다. 기회 미발생은 `count`(양쪽 trace가 모두 있는 쌍 기준)와 `perTraceCount`(짝과 무관한 개별 trace 기준)를 함께 표시한다. 쌍 기준 0은 개별 trace에 미발생 지표가 없다는 뜻이 아니다. 출처가 바뀌거나 변조된 trace는 기존 검증대로 거절한다.

### 검증 전용 snapshot과 기회 audit

`node market-simulator/scripts/build-validation-snapshots.cjs --output-directory /absolute/new-snapshots`로 별도 snapshot 세트를 만든다. 생성기 옵션은 스크립트 도움말을 따른다. 기존 파일을 덮어쓰지 않으며 새 snapshot ID와 hash를 기록한다. 목표 매대의 관련 후보, 비목표 관심 상품 접근, high의 수량 2 이상, first-play 첫 매대, 표시 불일치·피드백과 도움을 경험할 수 있는 구조를 고정한다.

`opportunityAudit`는 준비 시 manifest에 저장한다. 구조적으로 불가능한 지표는 준비 응답의 audit 경고로 드러난다. seed는 배우의 선택을 바꾸지만 저장된 snapshot은 고정이다. 따라서 기회가 **발생할 수 있는 구조**와 실제 노출·오류·도움·회복은 구분한다. 카레가 목표인 조건, 관심 상품을 보지 못한 경로, 중도 종료 등은 여전히 unexercised일 수 있다. 기회를 채우려고 오류나 관심·확인 행동을 강제하지 않는다.

### 다중 블라인드

같은 판에 여러 독립 판별자의 답안을 받는다. `prepare_blind_review`에 `reviewerId`를 전달하고 제출에 `reviewerId`, `reviewerKind:"llm"|"expert"`를 쓴다. 판별자별 A 채점 후 B 준비·제출, 채점한 답안의 변경 금지, 자기 신고 라벨 고정을 적용한다. 전문가는 `reviewerModel`을 생략할 수 있고 `reviewerSession`은 별도 판별 회차 라벨로 기록한다. llm은 모델 라벨도 필요하다.

```json
{"runDirectory":"/absolute/output/new-validation-run","panel":"A","reviewerId":"expert-01","reviewerKind":"expert"}
```

위 객체는 준비 요청 형식 예시이며 실행 결과가 아니다. 제출은 기존 `answers`에 같은 ID/kind와 `reviewerSession`을 추가한다. 여러 판별자 답안은 `blind-reviews.json`에 저장하고 기존 `blind-review.json`은 단일 판별자 형식으로 계속 읽는다. 보고서의 `blindReviews`는 판별자별 점수, `interReviewerAgreement`는 판별자가 공통으로 채점한 각 판의 일치도다. 2명은 Cohen’s κ, 3명 이상은 Fleiss’ κ를 사용하며 legacy 인물 판별과 v3 각 성향 수준 모두에 적용한다. unknown도 범주로 남고 표본 부족·분모 퇴화는 null이다. 일치도는 정확도나 독립성의 증명이 아니다. 전문가에게는 [한국어 사용 안내](blind-review-guide.ko.md)와 공개 판만 전달한다.

### 설명 지표와 통계 보조 분석

- `sequenceMetrics.descriptiveOnly:true`: 행동 전 대기 중앙값·IQR·변동계수·상위 10% 꼬리, 행동 전이 행렬·bigram·인물/조건별 전이 엔트로피, 유사 상품 혼동·규격·수량 누락/초과·비목표 구매의 관측 step ID, 피드백·표시 불일치 뒤 회복 행동 수, 같은 오선택 반복을 기록한다. 관심 구매는 오류에서 제외한다. 자동 시작·시스템 행동도 제외한다. 기회가 없으면 null/unexercised다.
- `pooledAnalysis`: low/high 조건을 층화하고 같은 조건·seed의 쌍을 함께 재표집한다. 같은 seed가 두 조건에 있으면 그 의존성도 보존한다. 조건 간 차이를 무시한 단순 합산이 아니며 주 판정에는 사용하지 않는다.
- `powerAnalysis`: 현재 지표별 유효 쌍 수에서 |delta| 0.33을 검출할 확률을 고정 seed로 모의 계산한다. 가정한 분포·반복 수·Monte Carlo 오차, CI 검출률과 기존 통과 기준 충족률을 함께 읽는다. 실제 표본의 분포를 보장하지 않는다.

**실수 강제 금지** 원칙은 유지한다. 오류가 많을수록 지적장애인과 비슷하다고 해석하지 않는다. 이 검증은 실제 지적장애인과의 유사성을 입증하지 않는다. 보고서의 `referenceComparison:null`은 아직 실제 데이터 비교가 없음을 뜻한다. [출처 확장 설계 메모](persona-validation-extension-design.md)에 순수 지표 함수와 미래 어댑터 경계를 남겼다. 과거 run·trace·bundle·manifest·보고서는 변환하거나 덮어쓰지 않으며, 새 명세는 새 runId에만 적용한다. 보관 명세 hash의 run은 준비·점검에서 manifest를 다시 쓰지 않는다. 기존 측정과 같은 재측정은 저장 파일을 보존하고 결과가 달라지면 새 runId를 요구한다. 이미 저장된 과거 보고서는 `historicalArtifactPreserved:true`와 기존 경로를 반환하며 새 분석으로 다시 쓰지 않는다.

## 공통 성향 모드와 기존 실행의 구분

- `validationMode:"traits"`는 공통 성향 모드이며 manifest `version:3`을 만든다. `profiles` 또는 `personaIds` 중 하나로 1~32개 인물을 선택한다.
- 둘 다 생략한 새 요청은 기존 세 인물의 원본 설정과 설계 성향 매핑을 사용한다. 원본 세 인물의 JSON·프롬프트·버전을 바꾸지 않는다.
- 기존 네 ID(`mild-intellectual-disability-adult`, `careful-checker`, `quick-decider`, `neutral-adult-control`)만 지정한 과거 요청 형식은 `validationMode`를 생략하면 legacy로 해석한다. 같은 네 ID에도 공통 성향 검증을 적용하려면 `validationMode:"traits"`를 명시한다.
- `validationMode:"legacy"` 또는 기존 manifest `version:2`는 아래 **legacy v2 절차**를 유지한다. `profiles`를 legacy에 전달할 수 없다. 저장된 v2·v3 run을 서로 변환하거나 같은 runId에 섞지 않는다.

기존 세 인물은 취향·수행 기준과 여러 성향이 함께 다르다. 공통 축으로 기술할 수 있지만, 이 세 인물만 선택했다고 각 성향의 효과가 분리되는 것은 아니다.

## 1. 성향과 유형으로 인물 구성

[성향 카탈로그](../../market-simulator/validation/persona-traits.json)는 다섯 공통 축과 세 수준의 행동 지침을 정의한다.

| `traitKey` | 성향 | 관찰 대상 |
| --- | --- | --- |
| `deliberation` | 숙고 | 선택 전 후보·조건 검토 |
| `checking` | 확인 | 목록·수량·장바구니 재확인 |
| `exploration` | 탐색 | 실제 노출된 새로운 단서·관심 상품 살피기 |
| `persistence` | 지속 | 어려움 뒤 확인·재시도·전략 변경·중단 |
| `helpSeeking` | 도움 활용 | 불확실할 때 제공된 도움과 설명 사용 |

유형은 고정된 사람 분류가 아니라 성향의 기본 묶음이다. 어느 축이든 `traits`에서 덮어써 혼합할 수 있다.

| `presetId` | 유형 |
| --- | --- |
| `deliberate-checker` | 숙고·확인형 |
| `quick-satisficer` | 신속 결정형 |
| `curious-explorer` | 탐색·호기심형 |
| `familiar-routine` | 익숙함 선호형 |
| `help-seeker` | 도움 활용형 |

`profiles` 항목은 `{id, basePersonaId, presetId?, traits?, label?}`다. `basePersonaId`는 기존 세 인물 또는 `neutral-adult-control`이다. `presetId`를 생략하면 다섯 성향은 모두 `medium`에서 시작하며 `traits`의 부분 설정을 적용한다. 사용자 정의 `id`는 중복되거나 기존 인물 ID와 같을 수 없고, 경로에 안전한 소문자 영문·숫자·`_`·`-` 1~64자만 허용하며 첫 글자는 영문 또는 숫자여야 한다. 알 수 없는 성향·수준·유형·필드는 거절한다.

새 인물은 기본 인물의 숫자 인지·반응·보행 기준, 상품 취향 가중치와 친숙한 상품·카테고리 경험을 유지한다. 기존 프롬프트의 빠른 결정·적은 확인 같은 성격 서술은 새 배우 입력에서 공통 성향 지침으로 대체한다. 원본 프로필은 그대로 둔다. `contextHash`는 성향과 분리한 `capability / preferences / experience`를 식별한다. 같은 기본 인물의 성향만 바꾸면 이 hash와 인지 기준은 변하지 않는다.

숙고·확인 지침은 실제 상황에서 선택할 정보를 구체화한다. 높은 숙고는 관련 후보를 둘 이상 관찰했거나 여러 조건을 고려해야 할 때 후보와 조건을 살핀 뒤 선택하려는 경향이다. 높은 확인은 다음 목표로 넘어갈 때, 수량이 불확실할 때, 결제를 결정할 때 필요한 정보가 보이는 목록·장바구니 등을 다시 대조하려는 경향이다. 낮은 수준도 불확실하면 확인·비교할 수 있고, 모든 수준은 충분히 명확해지면 멈출 수 있다. 정해진 확인·비교 횟수나 느린 반응, 실수, 도움, 포기, 완료를 요구하지 않는다. 매대 닫기·이동·대기나 `check` 표기만으로 정보를 확인한 것으로 쓰지 않는다.

새 사용자 정의 인물의 버전은 `traits-2-<hash>`이며 실제 생성된 프롬프트·성격 서술·구조화된 맥락을 포함한 내용을 hash에 반영한다. 문구가 바뀌면 버전도 바뀌지만, 수행 기준·취향·경험이 같다면 `contextHash`는 유지된다. 카탈로그나 작성 지침을 바꾼 뒤에는 새 runId와 새 bundle로 시작한다. 과거 trace·bundle·manifest·보고서는 다시 쓰지 않는다. 현재 정의와 hash가 달라진 과거 run을 현재 코드로 그대로 재측정할 수 있다는 뜻도 아니다.

## 2. run 준비와 전체 계획 작성

먼저 확인 성향만 다른 두 인물로 비교를 준비할 수 있다. 다음은 요청 형식 예시이며 실제 생성 결과가 아니다.

`prepare_persona_validation`:

```json
{
  "validationMode": "traits",
  "runId": "checking-contrast-01",
  "outputDirectory": "/absolute/output",
  "snapshotFilePaths": {
    "low": "/absolute/low.json",
    "high": "/absolute/high.json"
  },
  "seeds": ["s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08"],
  "profiles": [
    {
      "id": "checking-low",
      "basePersonaId": "neutral-adult-control",
      "presetId": "deliberate-checker",
      "traits": {"checking": "low"}
    },
    {
      "id": "checking-high",
      "basePersonaId": "neutral-adult-control",
      "presetId": "deliberate-checker",
      "traits": {"checking": "high"}
    }
  ]
}
```

위 요청은 2인물 × 2조건 × 8seed = 32칸을 **준비**한다. 자동으로 32개 모델 요청을 실행하지 않는다. 저부하는 목표 2개, 고부하는 목표 5개이며 고부하에는 수량 2 이상 목표가 있어야 한다. 저장된 시작 전 snapshot의 내용·ID를 고정한다. 응답은 `validationMode`, `catalog`, 해석된 `profiles`, `manifestPath`, `slots`, `complete`, `required`를 포함한다. 각 슬롯의 `prepareWholeTrace` 객체와 `tracePath`를 그대로 사용하고 경로를 직접 조립하지 않는다.

각 빈 슬롯에서 `prepare_whole_trace(slot.prepareWholeTrace)`를 호출한다. **한 인물·한 조건·한 seed·한 request/bundle마다 새 `gpt-6-luna / low` 배우 문맥**을 사용한다. 다른 인물·조건의 bundle이나 검증 점수를 배우에게 함께 주지 않는다. candidate 7 전체 배열을 작성한 뒤 같은 persistent MCP/interactive 프로세스의 `submit_whole_trace`에 제출한다. 원본 requestId·bundle.inputHash를 기록하고 [전체 계획 절차](whole-trace.md)의 관찰·작성·기술 수정 제한을 따른다. `attentionExperience`는 `{ "visit": "first-play" }`이며 learner/trial을 사용하지 않는다.

새 bundle의 `authoringGuide.authoringVersion:"2"`는 상황별 실제 focus 예시를 제공한다. 열린 목표를 처리한다면 그 목표를, 관찰한 상품을 살피거나 고른다면 그 상품을 기록한다. 아직 읽지 않은 목표나 관찰하지 않은 상품으로 focus를 채우지 않고, 실제 관심 구매나 잘못된 선택을 정답에 맞춰 고치지 않는다. `null`은 현재 해당 집중 대상이 없다는 뜻이며 모든 행동의 기본값으로 복사하지 않는다. 매대를 닫는 예시도 자동으로 `check`가 되지 않는다. candidate 최상위 키는 `candidateVersion`, `requestId`, `decisions` 세 개뿐이며 입력 확인용 `inputHash`·`snapshotId`·`personaId`·`seed`를 추가하지 않는다. 저장된 과거 가이드와 후보는 새 형식으로 덮어쓰지 않는다.

사용자 정의 프로필과 대조군은 바인딩된 검증 슬롯의 전체 계획 전용 scope에서만 조회한다. 일반 `list_personas`·`getPersona`·`generate_trace`·learner 등록으로 인물 목록을 확대하지 않는다. 슬롯의 인물·seed·snapshot·출력 경로와 버전이 일치해야 하며, 비동기 요청 간 프로필도 분리한다. 실패나 수정 요청은 별도 생성 기록에 보존하고 성공 표본만 골라 숨기지 않는다. 보고서의 `missingSlots`에는 미시도와 기술 실패가 함께 포함되므로 이것만으로 실패율을 계산할 수 없다.

같은 조건·seed는 비교를 묶는 실험 식별자다. 새 Luna 호출의 native 난수를 고정하거나 동일 출력을 보장하지 않는다. 부트스트랩 계산의 seed 재현성과 모델 생성의 재현성을 구분한다. 테스트·fixture는 계약을 확인하며 모델 파일럿을 대신하지 않는다. 실제 생성 표본 수·성공·실패와 행동 결과는 별도 실행 기록으로 확인한다.

## 3. 공통 지표와 네 평가 축

`measure_persona_validation({"runDirectory":"/absolute/output/checking-contrast-01"})`으로 저장된 trace를 측정한다. 원본·sidecar·bundle·snapshot·인물 버전과 출처를 검증하며, 바뀐 원본을 이전 기록과 섞지 않는다. 미발생 기회는 `unexercised`·null로 남긴다. 중도 포기로 계산 단계에 도달하지 못한 표본을 장바구니 미확인 0점으로 대체하지 않는다.

[공통 지표 명세](../../market-simulator/validation/persona-trait-validation-spec.json)는 인물 이름 대신 `traitKey`, 적용 조건, 근거 유형에 연결한다.

| 성향 | 공통 지표 | 해석할 때 확인할 조건 |
| --- | --- | --- |
| 숙고 | `comparisonRate`; 별도 시간 지표 `newShelfDelayMs` | 실제 비교 기회; 작성 시간은 주 성향 판정에 사용하지 않음 |
| 확인 | `postSelectionListRate`, `preCheckoutCartRate` | 다음 목표 전환·계산 단계에 실제 도달했는지 |
| 탐색 | `interestDetourRate` | 프로필의 관심 상품·상품군·카테고리 단서가 먼저 노출됐는지 |
| 지속 | `persistenceResponseRate` | 오류·표시 불일치·선언된 불확실성 이후의 대응인지 |
| 도움 활용 | `helpSeekingRate` | 실제 어려움 뒤 도움인지; 일반 계산·반품 요청은 제외 |

`interestRecoveryRate`는 미완료 목표가 남은 관심 구간 이후의 복귀를 설명적으로 기록한다. 자기 결정·수정·목표 달성 같은 능력을 다른 인물보다 낮게 보여야 성격에 충실하다고 판정하지 않는다. 실제 행동 근거, 작성 시간(`authored-timing`), 배우 선언(`actor-declaration`)을 구분하고 조건·step 근거를 함께 남긴다.

같은 페이지에 이미 보이는 후보를 살피는 것도 가능한 선택이다. 다만 별도 UI 행동 없이 작성한 주의·비교 설명은 배우 선언이며 독립적으로 관측된 비교 행동이 아니다. `comparisonRate`가 이를 모두 측정하는 것으로 해석하지 않고, 점수를 채우기 위해 불필요한 페이지 이동을 요구하지 않는다.

보고서는 다음 네 축을 분리한다.

| 축 | 보고 내용 |
| --- | --- |
| `axes.technical` | 저장된 유효 trace 수와 누락 슬롯 수; 과업 성공·앱 실행과 구분 |
| `axes.taskOutcomes` | **전체 목표** 수·시도·충족·미시도, 목표별 수량, 비목표 구매, 종료 방식·시스템 완료 여부 |
| `axes.traitExpression` | 성향 하나만 다른 조건별 비교; 주 판정은 `behavioralEvidence`, 작성 시간은 별도 `authoredTiming` |
| `axes.coverage` | 지표별 실제 평가 기회 수, 미발생 이유, 관측·선언 근거 구분 |

남은 목표가 있는데 기록된 오류나 표시 불일치 없이 포기하면 `terminationReview`에 검토 신호를 남긴다. 선언된 불확실성은 따로 보여준다. 이것은 상황을 더 살펴보라는 신호이며 포기 자체를 기술 실패·성격 실패로 확정하지 않는다. 기록만으로 모든 중단 이유를 알 수 없다는 한계도 남긴다.

오류나 관심 횟수의 분산 0, 도움 사용, 익숙한 선택에서의 낮은 정확도만으로 자동 실패하지 않는다. 도움·정확도 관련 신호는 `reviewSignals`, 집합 분포 진단은 `diagnosticWarnings`에 검토·정보로 남긴다. 금지 패턴의 실패 판정에는 명확한 피드백 뒤 같은 오선택 반복과 역할·장애를 직접 언급하는 등 코드에 명시된 위반만 사용하며, 해당 trace 수는 `violationTraces`로 별도 보고한다. 익숙한 목표를 모두 채우지 못한 trace는 목표 상품을 한 번이라도 담으려 했으면 `all-familiar-goals-failed`, 시도 없이 끝났으면 `familiar-goals-unattempted`로 구분한다. 두 플래그 모두 `review`이며 플래그율 집계에 기존과 같이 포함한다. 오류 없이 완료한 표본에 실수를 강제하지 않으며, 금지 패턴 검사 통과를 전체 충실도 통과로 읽지 않는다.

새 작성 가이드 v2로 생성한 자료에는 제출 결과와 `.persona-review.json`의 선택적 `annotationReview`가 추가된다. `reviewVersion:"actor-annotation-v1"`이며 자체 `status:"clear"|"review"`와 `findings`를 읽는다. 닫기만 수행한 `check` 표기나 focus 불일치에 대해 결정 번호·실제 행동·선언 근거와 함께 `improvementTarget`(`activity-annotation` 또는 `focus-annotation`), `recommendation`을 제공한다. 이는 주석 작성의 개선 지점을 찾는 사후 검토이며 행동을 변경하거나 성향 실패를 확정하지 않는다. 이미 보이는 화면을 암묵적으로 살폈을 가능성은 남고, 경고를 없애려고 확인 행동을 추가하지 않는다. 상위 persona review의 `status:"clear"`만 보고 이 별도 검토도 clear라고 판단하지 않는다. 과거 가이드 자료에는 이 항목이 없을 수 있으며 부재를 통과로 해석하지 않는다.

측정 결과에서는 `measurements.perTrace[i].annotationReview`로 전달하며 자료에 없으면 `null`이다. JSON 보고서의 `annotationReviews`는 `{personaId, condition, seed, tracePath, review}` 목록이며 `review`는 해당 주석 검토 또는 `null`이다. 한국어 보고서의 **행동·focus 주석 정합성**에서 결정별 신호와 권장 조치를 확인한다. 성향 표현 지표와 별도로 읽어 생성 지침 문제인지 상태 주석 문제인지 구분한다.

## 4. 성향 비교와 충분성 판정

자동 비교 쌍은 **`contextHash`가 같고 다섯 성향 중 정확히 하나만 다른** 인물 사이에서만 만든다. 높은 설정 수준 대비 낮은 설정 수준을 비교하므로 `high-low`뿐 아니라 `high-medium`, `medium-low`도 포함한다. 같은 조건·seed의 두 표본 모두 해당 기회를 경험해야 유효한 한 쌍이다. 위 예제는 확인 성향만 비교하며 다른 네 성향은 `unmatched`로 남는다. 여러 유형이나 기본 인물이 다른 집단의 `groups`는 `descriptiveOnly:true`인 설명적 집계다. 유형별 평균 차이를 단일 성향의 효과라고 주장하지 않는다.

명세의 설계 기준은 유효 쌍 8개 이상, 기대 방향과 일치하는 Cliff’s delta, |delta| ≥ 0.33, 부트스트랩 95% 구간의 0 제외다. Cliff’s delta 자체는 두 집단 전체 분포의 효과 크기이고, 부트스트랩은 같은 seed의 쌍을 함께 재표집한다. delta를 쌍별 차이의 효과 크기로 해석하지 않는다. 현재 인접 수준 비교에도 같은 0.33 기준을 적용하며, 이 기준은 실험적으로 보정하지 않은 설계값이다. 심리검사·임상 기준이 아니며 결과를 보고 유리하게 바꾸지 않는다.

성향의 주 판정은 `behavioralEvidence`만 사용한다. `authoredTiming`의 판정은 따로 보고하며, 대기시간 차이로 부족한 행동 근거를 보충해 통과시키지 않는다. 두 영역 모두 `exercisedComparisons / expectedComparisons`를 제공한다. 행동 비교 중 표본 부족이 하나라도 있으면 `insufficient`, 모두 기회 미발생이면 `unexercised`, 일부만 미발생이면 `partial`로 남긴다. 일부 관찰된 비교가 모두 pass여도 나머지 비교가 미발생이면 전체 `supported`를 주지 않는다. 비교 자체가 없는 성향은 `unmatched`이고, 모든 적용 행동 비교가 pass이면 `supported`, 모두 fail이면 `contradicted`, 그 밖의 혼합 근거는 `inconclusive`다.

8개 seed를 준비해도 기회에 도달하지 못하면 유효 쌍 8개가 되지 않는다. 조건부 지표와 함께 전체 목표 달성·포기·누락·기회 도달 여부를 읽어야 한다. 원본 정의·카탈로그·명세·snapshot이 바뀌면 새 runId로 시작한다.

## 5. 공통 성향 블라인드 — A 먼저, B 나중

trace 생성에 참여하지 않은 새 판별 문맥을 사용한다. 판별자는 반환된 `traitRubric`, `publicStyles`와 요청한 panel 파일만 읽는다. 공통 축의 수준을 추정하며 인물 이름·개별 프로필 ID·장애 여부를 맞히지 않는다. 개별 인물의 설정, manifest, 원본 trace, 측정값, `blind-key.json`을 제공하지 않는다. `publicStyles`는 다섯 유형의 공통 설명이며 이번 표본의 정답 유형표가 아니다.

`prepare_blind_review`:

```json
{"runDirectory":"/absolute/output/checking-contrast-01","panel":"A"}
```

A는 행동·대상·순서·작성된 행동 전 대기시간을 제공하고, B는 여기에 `reason`을 더한다. A/B의 opaque ID와 순서는 각각 독립적으로 섞는다. 배우 의도·이름·seed·원본 경로 등 개인 식별 metadata는 제거한다. 블라인드 준비 뒤에는 표본 집합을 고정하며, 다른 표본을 추가하려면 별도 run을 만든다.

`submit_blind_review` 답안은 각 opaque ID 아래 다섯 축을 모두 포함한다. 근거가 없으면 `unknown`을 사용하고, 선택적 `confidence`는 0~1이다. 다음은 형식 예시이며 실제 판별 결과가 아니다.

```json
{
  "runDirectory": "/absolute/output/checking-contrast-01",
  "panel": "A",
  "answers": {
    "opaque-id-from-panel": {
      "traits": {
        "deliberation": "medium",
        "checking": "high",
        "exploration": "unknown",
        "persistence": "unknown",
        "helpSeeking": "unknown"
      },
      "confidence": 0.6
    }
  },
  "reviewerModel": "self-reported-model",
  "reviewerSession": "self-reported-new-session"
}
```

실제 답안은 해당 판의 모든 opaque ID를 포함해야 한다. 누락·추가 ID, 잘못된 축·수준·확신도는 거절한다. A 채점 후에만 B를 준비할 수 있고, B 판별 전에는 A 점수·정답을 판별자에게 알려주지 않는다. 같은 판별자의 자기 신고 라벨을 유지한다. 채점한 답안은 동일 재제출만 허용하며 점수를 보고 바꿀 수 없다.

채점은 `perTrait`별 정확도·판별 비율(`coverage`)·보류 수·판별했을 때 정확도·혼동 행렬과 `macroAccuracy`, `macroCoverage`를 보고한다. `unknown`은 전체 정확도의 분모에 남으며 정답으로 세지 않는다. 유형 분포에 고정된 25% 우연 정확도나 장애 판별을 적용하지 않는다. A/B는 같은 표본이므로 독립 반복 실험 두 번이 아니다. 판별자 독립성과 정답 키 미열람은 서버가 강제·입증하지 못하므로 `independenceVerified:false`, `keyIsolationVerified:false`로 표시한다.

## 6. 보고서와 검증 자료

`persona_validation_report({"runDirectory":"/absolute/output/checking-contrast-01"})`는 `report.json`과 `report.ko.md`를 만든다. 저장된 최신 측정과 블라인드 표본이 일치해야 하며, 미채점은 그대로 표시한다. 이 보고서는 전체 계획의 설계 성향 표현을 평가하며 앱 재생·DB 수신·실제 사람의 행동을 검증하지 않는다.

`allowFixture:true`는 측정·블라인드 준비의 테스트 전용 옵션이다. 확률 fixture와 Luna 전체 계획을 섞지 않으며, `fixtureOnly:true` 자료를 독립 모델 표본이나 실제 파일럿 결과로 해석하지 않는다. 공통 성향 구현은 프로필 검증·비동기 scope 격리·지표 분모·익명화·채점·호환 경로의 테스트를 포함하지만 모델 파일럿 실행을 대신하지 않는다. 이번 성향·작성 지침 보완 역시 새 LLM 실험으로 행동 개선 효과를 입증했다는 의미가 아니다.

주요 구현은 [공통 프로필](../../market-simulator/src/personaTraitProfiles.cjs), [v3 run](../../market-simulator/src/personaTraitValidationRun.cjs), [모드 분기](../../market-simulator/src/personaValidationRun.cjs), [지표](../../market-simulator/src/personaValidationMetrics.cjs), [블라인드](../../market-simulator/src/personaValidationBlind.cjs)에 있다. 기존 v2 run은 [legacy 구현](../../market-simulator/src/personaValidationLegacyRun.cjs)에 보존한다.

## Legacy v2 — 기존 네 인물 고정 검증 절차와 구현 기록

이하의 네 인물·대조군 대비 방향·인물 이름 판별·64칸 예시는 **기존 v2 모드 전용**이다. 위 공통 성향 v3의 기본값이나 성향별 정답표로 사용하지 않는다. 저장된 과거 run의 재검사와 명시적인 legacy 요청에 적용한다.

검증의 범위는 설계한 허구 인물이 대조군과 구별되게 행동하는지까지다. 실제 지적장애인의 행동 유사성이나 임상적 타당성을 검증하지 않는다. 대조군은 지민의 개인 설정을 공유하므로 서연·민수와의 비교에는 취향 차이가 섞인다. 표본은 Luna `whole-trace-v3` 전체 계획이고, 실제 앱 수행·학습·임상 관찰 결과가 아니다.

검증은 아래 도구를 직접 호출할 때만 실행된다. 기존 생성·제출·최종화 경로는 지표 측정이나 블라인드 채점을 호출하지 않는다. 서버가 모델·provider·앱·백엔드에 요청하거나 trace를 수정·재생성하지 않는다. MCP와 `node market-simulator/cli.cjs interactive`에서 같은 도구를 호출한다. 아래 객체는 MCP 입력이며 interactive에서는 `{"tool":"도구명","arguments":입력객체}`로 한 줄씩 보낸다.

### 1. run 준비

저부하는 목표 2개, 고부하는 목표 5개이며 적어도 한 목표의 수량은 2 이상이어야 한다. 저장된 시작 전 snapshot을 사용하고 파일 내용·snapshot ID를 고정한다. `seeds` 개수가 인물·조건별 표본 수다. 파일럿 8개는 4인물 × 2조건 × 8 = 64칸이며 본 실행은 조건별 20개 이상을 사용한다. 이번 구현·테스트는 이 파일럿을 실행하지 않았다.

`prepare_persona_validation` 입력:

```json
{
  "runId": "pilot-01",
  "outputDirectory": "/absolute/output",
  "snapshotFilePaths": {"low":"/absolute/low.json","high":"/absolute/high.json"},
  "seeds": ["s01","s02","s03","s04","s05","s06","s07","s08"],
  "personaIds": ["mild-intellectual-disability-adult","careful-checker","quick-decider","neutral-adult-control"]
}
```

응답 주요 필드:

```json
{
  "runDirectory": "/absolute/output/pilot-01",
  "manifestPath": "/absolute/output/pilot-01/manifest.json",
  "complete": 0,
  "required": 64,
  "slots": [{"condition":"low","seed":"s01","personaId":"neutral-adult-control","exists":false,"traceId":null}]
}
```

실제 응답의 각 `slot`에는 `tracePath`, 고정 인물·정책·bundle·candidate 버전, snapshot ID와 **그대로 사용할 `prepareWholeTrace` 객체**도 포함된다. seed 디렉터리는 안전한 인덱스·해시로 만들므로 경로를 직접 조립하지 않는다. 같은 입력으로 재호출하면 진행 상태만 갱신한다. 다른 설정은 새 runId로 만든다. 원본 snapshot·인물 정의·명세가 바뀌면 기존 run은 거절된다. v1 manifest는 새 형식과 섞지 않고 별도 runId로 다시 준비한다.

### 2. 전체 계획 생성 — 슬롯마다 작성 문맥 분리

반환된 64칸 중 비어 있는 칸마다 `prepare_whole_trace(slot.prepareWholeTrace)`를 호출한다. `attentionExperience`는 `{ "visit": "first-play" }`이고 learner/trial 파일을 쓰지 않는다. 각 슬롯의 outputPath를 유지한다.

**슬롯 하나마다 새 Luna low 작성 문맥**에서 해당 request/bundle 하나만 읽고 candidate 7 전체 계획을 작성한다. 저부하·고부하나 다른 인물의 bundle을 같은 작성 문맥에 함께 주지 않는다. 후보의 requestId와 bundle.inputHash를 출처로 기록한다. 제출은 요청을 준비한 같은 persistent MCP/interactive 프로세스의 `submit_whole_trace`에 한다. [전체 계획 절차](whole-trace.md)의 문법·관찰 범위·허용된 기술 수정 절차를 따른다. 충실도 결과를 보고 오류·이탈 횟수를 맞추거나 재생성을 자동 요청하지 않는다.

대조군은 별도 registry에서만 제공한다. 일반 `list_personas`, `generate_trace`, 배우 계획, learner·학습 trial 생성/읽기는 대조군을 거절한다. `prepare_whole_trace`가 출력 경로에 연결된 실제 manifest 셀, 인물·seed·snapshot 내용·미저장 상태·first-play만 있는 경험을 확인한 뒤에만 전체 계획 전용 인물 조회 scope를 연다. 일반 `getPersona`는 그 scope 안에서도 대조군을 거절한다. 대조군의 개인 지침·수치와 공통 엔진의 잔여 제약은 [audit](../../market-simulator/personas/audit.md)에 기록했다.

### 3. 조건부 측정

`measure_persona_validation` 입력과 응답 예:

```json
{"runDirectory":"/absolute/output/pilot-01"}
```

```json
{"measurementsPath":"/absolute/output/pilot-01/measurements.json","completed":64,"missing":0,"unexercised":12,"pairedUnexercised":12,"perTraceUnexercised":30,"fixtureOnly":false}
```

위 숫자는 응답 형식 예시이며 실행 결과가 아니다. 빈 칸은 건너뛰고 보고한다. trace ID·인물·정책·모델·bundle·candidate·snapshot·감사 자료 연결이 어긋나면 오류로 거절한다. 처음 기록한 trace·sidecar를 덮어쓴 경우 진행 상태 새로고침으로 받아들이지 않는다. 보고서는 새 표본 추가나 원본 변경 뒤의 오래된 측정값도 거절한다.

지표 조건이 실제로 발생하지 않으면 `unexercised`이며 값은 null이다. 관찰 증거가 없는 비교 기회나 불일치를 0으로 대체하지 않는다. 목록/장바구니를 읽는 행동 자체는 수정이 아니며 실제 불일치를 줄인 구매·반품이 있어야 수정으로 센다. 모델이 고른 행동은 knowledge audit·actor-decisions와 실제 replay step을 연결한다. 자동 시작·화면 닫기·시스템 종료 동작을 인물의 판단 시간으로 세지 않는다. persona-review는 출처/조건 보조 근거이며 기존 리뷰의 pass 여부를 충실도 점수로 복사하지 않는다.

같은 조건·seed의 인물과 대조군이 모두 해당 조건을 경험했을 때만 한 쌍으로 비교한다. Cliff’s delta는 두 분포의 효과 크기이고 부트스트랩은 seed 쌍을 함께 재표집한다. 95% 구간은 `src/random.ts`의 seed 난수로 재현 가능하다. 방향 일치, |delta| ≥ 0.33, 구간의 0 제외가 모두 성립하면 pass, 반대 방향이면 fail이다. 나머지는 inconclusive, 유효 쌍 8 미만은 insufficient다. 이 값과 플래그 허용률 10%는 명세의 설계값이며 임상 기준이 아니다. 결과에 맞춰 조정하지 않는다.

특성별로 지표 하나가 한 표를 갖는다. 양 조건 지표는 실제로 경험한 모든 적용 조건이 pass여야 그 지표가 pass다. 표본이 빠진 조건은 insufficient로 남고, 실제 조건 미발생만 제외한다. 특성의 경험된 지표 중 과반이 pass이면 expressed다. 모두 미발생이면 특성도 unexercised다. 인물 간 기대 순서는 부하별 공통 seed로 따로 비교하며 표본 수가 부족하면 통과를 주장하지 않는다.

과장 검사는 trace 단위 플래그와 조건별 표본 집합 위반을 나눈다. 목표 시도에서 드러난 수량·규격 불일치와 실제 거절을 오류로 측정하며, 명시적 관심 구매는 같은 상품이어도 목표 오류로 세지 않는다. 오류/관심 횟수 분산 0은 횟수 강제의 신호이며 인과적 증명이 아니다. 미관찰 오류·관심 상태를 pass로 바꾸지 않는다. 근거는 trace 경로·step ID·조건과 함께 저장하고 대조군도 같은 검사를 받는다.

### 4. 새 판별 세션 — A 먼저, B 나중

**trace를 생성하지 않은 새 Codex 세션**에서 판별한다. 판별자는 `publicProfiles`와 반환된 panel 파일만 읽고 `blind-key.json`, 원본 trace·manifest·측정값을 열지 않는다. 서버는 실제 세션 독립성·정답 키 미열람을 강제하거나 입증할 수 없다. 자기 신고 모델·세션 라벨만 저장하고 보고서에 ‘입증되지 않음’을 명시한다.

`prepare_blind_review` 입력:

```json
{"runDirectory":"/absolute/output/pilot-01","panel":"A"}
```

응답 주요 필드:

```json
{"panel":"A","bundlePath":"/absolute/output/pilot-01/blind-A.json","bundle":{"panels":{"A":[{"opaqueId":"random-uuid","version":"A","trace":{"steps":[{"type":"readList","reactionDelayMs":1200}]}}]}},"publicProfiles":[{"id":"careful-checker","description":"공개된 인물 설명"}],"fixtureOnly":false}
```

공개 설명은 익명 trace 묶음 바깥에 별도로 둔다. 익명 묶음 전체에서 인물 ID·이름·파일 경로가 발견되면 중단한다. 중첩 target도 허용 필드만 남긴다. A는 행동 종류·대상·순서·행동 전 대기시간, B는 여기에 reason만 더한다. 두 판의 opaque ID와 순서는 독립적이다. movement·gesture·seed·trace ID·step ID·generation·experience·인물 metadata는 제거한다. 블라인드 표본 집합은 최초 준비 뒤 고정된다.

`submit_blind_review` 입력:

```json
{"runDirectory":"/absolute/output/pilot-01","panel":"A","answers":{"random-uuid":{"personaId":"careful-checker","confidence":0.8}},"reviewerModel":"self-reported-model","reviewerSession":"self-reported-new-session"}
```

답안은 실제 해당 판의 모든 opaque ID를 포함해야 한다. 문자열 personaId도 허용하며 confidence는 선택적 0..1이다. 누락·추가 ID·잘못된 확신도는 거절한다. 응답 `score`에는 n, correct, accuracy, chanceAccuracy(0.25), alternative(`greater`), pValue, binaryCorrect, binaryAccuracy, confusionMatrix가 있다. p값은 우연 정확도 25%보다 높다는 단측 정확 이항검정이다. 혼동 행렬의 행은 실제 인물, 열은 예측 인물이다. 채점한 답안의 동일 재제출은 허용하지만 점수를 본 뒤 답을 바꿀 수 없다.

다음은 1건으로 구성된 판의 `submit_blind_review` 응답 구조 예시다. 실제 파일럿 실행 결과가 아니다.

```json
{
  "reviewPath": "/absolute/output/pilot-01/blind-review.json",
  "panel": "A",
  "score": {
    "n": 1,
    "correct": 1,
    "accuracy": 1,
    "chanceAccuracy": 0.25,
    "alternative": "greater",
    "pValue": 0.25,
    "binaryCorrect": 1,
    "binaryAccuracy": 1,
    "confusionMatrix": {
      "mild-intellectual-disability-adult": {"mild-intellectual-disability-adult": 0, "careful-checker": 0, "quick-decider": 0, "neutral-adult-control": 0},
      "careful-checker": {"mild-intellectual-disability-adult": 0, "careful-checker": 1, "quick-decider": 0, "neutral-adult-control": 0},
      "quick-decider": {"mild-intellectual-disability-adult": 0, "careful-checker": 0, "quick-decider": 0, "neutral-adult-control": 0},
      "neutral-adult-control": {"mild-intellectual-disability-adult": 0, "careful-checker": 0, "quick-decider": 0, "neutral-adult-control": 0}
    }
  },
  "independenceVerified": false,
  "keyIsolationVerified": false
}
```

A를 채점한 후 `prepare_blind_review({... ,"panel":"B"})` → 같은 자기 신고 라벨로 `submit_blind_review({... ,"panel":"B"})`를 호출한다. B는 A를 채점하기 전에는 반환하지 않는다. A/B 결과는 따로 보고한다.

### 5. 보고서

`persona_validation_report` 입력과 응답:

```json
{"runDirectory":"/absolute/output/pilot-01"}
```

```json
{"reportPath":"/absolute/output/pilot-01/report.json","markdownPath":"/absolute/output/pilot-01/report.ko.md","completed":64,"required":64,"fixtureOnly":false}
```

조건별 지표·효과·95% 구간·특성 판정·과장 근거·A/B 판별·한계를 합친다. 답안이 아직 없으면 그 사실을 기록한다. 블라인드 표본과 측정 표본이 달라지면 기존 판별 결과를 합치지 않는다.

교차 확인용 Node 최근접 중심 분류기는 부하별 leave-one-out이며 각 class에 최소 2개 표본이 필요하다. 훈련 fold만으로 척도를 맞추고 네 class 공통 관측 특성만 사용한다. 미발생은 0으로 채우지 않으며 동점은 보류한다. 판별 가능 비율 coverage, 보류를 분모에 포함한 정확도를 함께 보고한다. LOO 예측은 학습 자료를 공유하므로 이 p값은 독립 표본의 유의성 증거가 아닌 기술적 교차 확인이다.

`allowFixture:true`는 측정·블라인드 준비의 테스트 전용 옵션이다. stochastic와 whole-trace를 섞지 않는다. fixture 기반 보고서는 `fixtureOnly:true`와 ‘파이프라인 확인용이며 검증 결과가 아님’을 표시한다. 테스트의 복제 fixture를 64개 독립 생성 표본으로 해석하지 않는다.

### 최종 지표

아래 ↑/↓는 모두 `neutral-adult-control` 대비 기대 방향이다. 실제 JSON은 지민 특성 4개, 서연·민수 특성 각 5개이므로 전부 연결했다. 문장 원문·상세 조건·통과 기준은 [명세](../../market-simulator/validation/persona-validation-spec.json)에 고정한다.

| 인물 / 특성 | 분모에 포함되는 상황 | 측정값 | 방향 | 부하 |
| --- | --- | --- | --- | --- |
| 지민 1: 한 항목·목록 재확인 | 선택 뒤 다음 다른 목표가 있음 | 다음 목표 전 목록 읽기 비율 | ↑ | 고 |
| 지민 2: 낯선 배치·도움 | first-play 첫 매대 진입 | 진입 전 탐색·도움 행동 수 | ↑ | 둘 다 |
| 지민 3: 카레 관심 전환 | 카레 비목표, 카레 단서 노출 구간 | 이후 비목표 관심 진입 비율·구간 길이 | ↑ | 둘 다 |
| 지민 4: 확인 후 목표 복귀 | 미완료 목표가 남은 관심 구간 | 목록·장바구니 확인 뒤 목표 복귀 비율 | ↑ | 둘 다 |
| 서연 1: 배운 확인 순서 | 선택 뒤 다음 다른 목표가 있음 | 다음 목표 전 목록 읽기 비율 | ↑ | 둘 다 |
| 서연 2: 새 조건 처리 | 낯선 매대 첫 열기 | 행동 전 평균 대기 ms | ↑ | 둘 다 |
| 서연 3: 비교·절약 | 관련 후보 2개 이상 또는 추가 페이지 기회 | 관련 후보를 탐색해 비교한 비율 | ↑ | 둘 다 |
| 서연 3: 결제 전 확인 | 인물이 계산 단계에 도달 | 마지막 선택 뒤 장바구니 확인 비율 | ↑ | 둘 다 |
| 서연 4: 피드백으로 수정 | 실제 피드백 또는 확인 가능한 불일치 | 실제 불일치를 줄인 선택·반품 비율 | ↑ | 둘 다 |
| 서연 5: 자기 선택 | 상품 선택 | 화면 닫기를 뺀 직전 행동이 도움이 아닌 비율 | ↑ | 둘 다 |
| 민수 1: 익숙한 빠른 선택 | 익숙한 상품 선택 | 행동 전 평균 대기 ms | ↓ | 둘 다 |
| 민수 2: 복합 조건 부담 | 시도한 수량·규격 목표 | 최종 목표 불일치 비율 | ↑ | 고 |
| 민수 3: 짧은 비교 | 비교 기회가 있음 | 선택 전 비교 탐색 비율 | ↓ | 둘 다 |
| 민수 4: 짧은 관심 | 관심 구간 | 구간당 평균 행동 수 | ↓ | 둘 다 |
| 민수 5: 불일치 수정 | 실제 피드백 또는 확인 가능한 불일치 | 실제 불일치를 줄인 선택·반품 비율 | ↑ | 둘 다 |

인물 간 기대 순서는 결제 전 장바구니 확인·비교 탐색에서 각각 서연 > 지민 > 민수이며 low/high를 따로 보고한다.

### 이번 구현의 기반 통합

현재 v2 작업 브랜치에는 요청의 `whole-trace-v3` 전체 계획과 학습 실험 기반이 없었다. 검증 도구가 기존 전체 계획·저장 계약을 사용할 수 있도록 저장소의 `54c7a22`에서 필요한 전체 계획·학습 기반을 가져왔다. 통합 과정에서 원래 세 인물의 JSON·prompt·버전(지민 5, 서연 3, 민수 3), 페르소나 스키마 `personas/persona.schema.json`·출처와 인지 설정 수치는 유지했다. 가져온 기반의 문서에 있던 인물 6/4/4 표기를 활성 프로필 5/3/3에 맞췄다.

다만 **trace 스키마 불변 요구에서는 벗어났다.** 현재 브랜치에 전체 계획 기반이 없어 `54c7a22`의 계획 metadata·trace 스키마 확장과 시스템 완료 지원을 필요한 기반으로 가져왔다. 변경 대상에는 `frontend/src/game/marketReplayTrace.ts`와 `marketReplayTrace.schema.json`이 포함된다. 이는 새 검증 지표를 trace에 삽입하기 위한 변경이 아니라, 검증 대상인 기존 전체 계획 형식과 그 출처를 이 브랜치에서 읽고 저장하기 위한 통합이다. 따라서 유지한 페르소나 스키마와 변경된 trace 스키마를 구분한다. 정책 옵션·learner 신원 없이 호출한 기존 `generate_trace`의 v4 프롬프트·정책은 유지한다. 가져온 v9 동작은 `actorPolicyVersion:"episodic-choice-v9"` 또는 v9 learner 신원을 명시한 경우에만 선택한다. v10 직접 증분 계획과 `whole-trace-v3`도 각각 별도 도구로 시작하며, 100회 이후 시스템 완료는 이 세 신규 경로에만 적용한다.

다음은 legacy v2 구현 당시의 작업 기록이다. 당시 작업은 검증기 구현과 테스트까지였고 파일럿 64건은 생성하지 않았으며, 변경은 커밋·푸시 없이 작업 트리에 남겼다.

### 추가·수정한 핵심 파일

경로는 저장소 루트 기준이다. 기존 기반을 가져온 파일과 충실도 검증을 구현한 파일을 함께 기록한다.

| 구분 | 파일 | 역할 |
| --- | --- | --- |
| 지표 추출 | [`market-simulator/src/personaValidationMetrics.cjs`](../../market-simulator/src/personaValidationMetrics.cjs) | 관찰·배우 결정·trace 연결, 조건별 분모와 값, 공유 행동 집계 |
| 통계 | [`market-simulator/src/personaValidationStatistics.cjs`](../../market-simulator/src/personaValidationStatistics.cjs) | Cliff's delta, 재현 가능한 부트스트랩, 판정, 이항 채점·혼동 행렬, 최근접 중심 교차 확인 |
| 과장 검사 | [`market-simulator/src/personaValidationFlags.cjs`](../../market-simulator/src/personaValidationFlags.cjs) | trace 플래그, 조건별 집합 위반과 경로·step 근거 |
| 블라인드 묶음 | [`market-simulator/src/personaValidationBlind.cjs`](../../market-simulator/src/personaValidationBlind.cjs) | A/B 익명화, 잔여 식별자 검사, 공개 설명 분리와 순서 섞기 |
| run 저장·보고 | [`market-simulator/src/personaValidationRun.cjs`](../../market-simulator/src/personaValidationRun.cjs) | 매니페스트·출처·버전 검사, 측정·판별 저장, JSON·한국어 보고서 |
| 명세 | [`market-simulator/validation/persona-validation-spec.json`](../../market-simulator/validation/persona-validation-spec.json) | 15개 지표와 특성 연결, 조건·방향·효과 기준·과장 기준·인물 간 순서 |
| 대조군 | [`market-simulator/personas/neutral-adult-control.json`](../../market-simulator/personas/neutral-adult-control.json), [prompt 사본](../../market-simulator/personas/neutral-adult-control.md), [`src/personas.ts`](../../market-simulator/src/personas.ts), [`personas/audit.md`](../../market-simulator/personas/audit.md) | 검증 전용 인물, 일반 목록·학습 실험 격리, 설계값과 한계 |
| MCP·CLI | [`market-simulator/server.cjs`](../../market-simulator/server.cjs), [`cli.cjs`](../../market-simulator/cli.cjs) | 기존 서버의 검증 도구 5개와 동일 interactive 호출 경로 |
| 기존 집계 재사용 | [`market-simulator/scripts/verify-personalities.cjs`](../../market-simulator/scripts/verify-personalities.cjs) | 중복 집계를 제거하고 지표 모듈의 공유 집계 사용 |
| 테스트 | `market-simulator/test/persona-validation-*.test.cjs` | 지표·통계·과장·익명화·출처·대조군 격리·기존 경로 호환·fixture 통합 검사 |
| 전체 계획 필수 기반 | `market-simulator/src/wholeTrace*.ts`, [`generation-journal.cjs`](../../market-simulator/generation-journal.cjs), [`learning-trial.cjs`](../../market-simulator/learning-trial.cjs), [`learner-store.cjs`](../../market-simulator/learner-store.cjs), [`frontend/src/game/marketReplayTrace.ts`](../../frontend/src/game/marketReplayTrace.ts), [trace 스키마](../../frontend/src/game/marketReplayTrace.schema.json) 및 관련 관찰·실행 모듈 | `54c7a22`의 전체 계획 준비·제출·관찰 감사·저장·학습 연결·시스템 완료 계약 통합 |
| 실행 문서 | [`market-persona-skill/SKILL.md`](../SKILL.md), [`market-simulator/README.md`](../../market-simulator/README.md), 이 절차 문서 | 도구 호출 예시, 인물별 지표, 세션 분리, 한계와 통합 범위 |
