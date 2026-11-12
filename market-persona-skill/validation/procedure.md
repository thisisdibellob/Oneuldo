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

앞뒤 분할을 위한 새 실험에는 생성기의 `--low-goal-count 3` 옵션을 사용할 수 있다. low는 우유·사과·생수 각 1개, high는 기존 5개 목표로 생성하며 환경·재고·명세는 유지한다. 목표를 한 번씩 순서대로 선택할 때 low의 다음 목표 전환은 2회가 된다. 기본 2개 목표에서는 마지막 선택을 제외하면 1회뿐이므로 단순한 기회 가능 판정과 앞뒤 분할 가능성을 구분한다. 이는 구조적 가능성이지 실제 행동의 보장이 아니며, 배우에게 구매·확인·전환을 강제하지 않는다. 변경한 과제는 새 snapshot과 run으로 기록하고 이전 자료와 섞지 않는다.

이 snapshot을 쓰는 traits v2 `prepare_persona_validation`에는 `lowGoalCount:3`도 명시한다. manifest는 `taskDesign:{version:"goal-count-v1",goalCounts:{low:3,high:5}}`와 `taskDesignHash`를 기록하고 실제 snapshot 목표 수·재준비 입력을 검증한다. 준비·readiness·측정·보고서에도 이 출처를 표시한다. 미지정은 기존 low 2/high 5이며 과거 manifest에는 필드를 소급 추가하지 않는다. legacy와 traits v1은 이 옵션을 받지 않는다. 이 과제 구성은 판정 명세와 별개이며 v3 specHash·지표·임계값은 바뀌지 않는다.

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

**실수 강제 금지** 원칙은 유지한다. 오류가 많을수록 지적장애인과 비슷하다고 해석하지 않는다. 이 검증은 실제 지적장애인과의 유사성을 입증하지 않는다. 보고서의 `referenceComparison:null`은 아직 실제 데이터 비교가 없음을 뜻한다. [출처 확장 설계 메모](../../docs/ai/persona-validation/persona-validation-extension-design.md)에 순수 지표 함수와 미래 어댑터 경계를 남겼다. 과거 run·trace·bundle·manifest·보고서는 변환하거나 덮어쓰지 않으며, 새 명세는 새 runId에만 적용한다. 보관 명세 hash의 run은 준비·점검에서 manifest를 다시 쓰지 않는다. 기존 측정과 같은 재측정은 저장 파일을 보존하고 결과가 달라지면 새 runId를 요구한다. 이미 저장된 과거 보고서는 `historicalArtifactPreserved:true`와 기존 경로를 반환하며 새 분석으로 다시 쓰지 않는다.

## 공통 성향 모드와 기존 실행의 구분

- `validationMode:"traits"`는 공통 성향 모드이며 manifest `version:3`을 만든다. `profiles` 또는 `personaIds` 중 하나로 1~32개 인물을 선택한다.
- 둘 다 생략한 새 요청은 기존 세 인물의 원본 설정과 설계 성향 매핑을 사용한다. 원본 세 인물의 JSON·프롬프트·버전을 바꾸지 않는다.
- 기존 네 ID(`mild-intellectual-disability-adult`, `careful-checker`, `quick-decider`, `neutral-adult-control`)만 지정한 과거 요청 형식은 `validationMode`를 생략하면 legacy로 해석한다. 같은 네 ID에도 공통 성향 검증을 적용하려면 `validationMode:"traits"`를 명시한다.
- `validationMode:"legacy"` 또는 기존 manifest `version:2`는 아래 **legacy v2 절차**를 유지한다. `profiles`를 legacy에 전달할 수 없다. 저장된 v2·v3 run을 서로 변환하거나 같은 runId에 섞지 않는다.

기존 세 인물은 취향·수행 기준과 여러 성향이 함께 다르다. 공통 축으로 기술할 수 있지만, 이 세 인물만 선택했다고 각 성향의 효과가 분리되는 것은 아니다.

## 성향과 유형으로 인물 구성

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

## run 준비와 전체 계획 작성

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

각 빈 슬롯에서 `prepare_whole_trace(slot.prepareWholeTrace)`를 호출한다. **한 인물·한 조건·한 seed·한 request/bundle마다 새 `gpt-6-luna / low` 배우 문맥**을 사용한다. 다른 인물·조건의 bundle이나 검증 점수를 배우에게 함께 주지 않는다. 배우는 [작성 보조 모드](../generation/whole-trace.md#실행-흐름)로 결정을 하나씩 작성·검증받고, 슬롯별 우체통의 `finish_and_submit_whole_trace`(또는 같은 persistent MCP/interactive 프로세스에서 `finish_whole_trace_authoring` 뒤 `submit_whole_trace`)로 제출한다. 원본 requestId·bundle.inputHash를 기록하고 [전체 계획 절차](../generation/whole-trace.md)의 관찰·작성·기술 수정 제한을 따른다. `attentionExperience`는 `{ "visit": "first-play" }`이며 learner/trial을 사용하지 않는다.

새 bundle의 `authoringGuide.authoringVersion:"2"`는 상황별 실제 focus 예시를 제공한다. 열린 목표를 처리한다면 그 목표를, 관찰한 상품을 살피거나 고른다면 그 상품을 기록한다. 아직 읽지 않은 목표나 관찰하지 않은 상품으로 focus를 채우지 않고, 실제 관심 구매나 잘못된 선택을 정답에 맞춰 고치지 않는다. `null`은 현재 해당 집중 대상이 없다는 뜻이며 모든 행동의 기본값으로 복사하지 않는다. 매대를 닫는 예시도 자동으로 `check`가 되지 않는다. candidate 최상위 키는 `candidateVersion`, `requestId`, `decisions` 세 개뿐이며 입력 확인용 `inputHash`·`snapshotId`·`personaId`·`seed`를 추가하지 않는다. 저장된 과거 가이드와 후보는 새 형식으로 덮어쓰지 않는다.

사용자 정의 프로필과 대조군은 바인딩된 검증 슬롯의 전체 계획 전용 scope에서만 조회한다. 일반 `list_personas`·`getPersona`·`generate_trace`·learner 등록으로 인물 목록을 확대하지 않는다. 슬롯의 인물·seed·snapshot·출력 경로와 버전이 일치해야 하며, 비동기 요청 간 프로필도 분리한다. 실패나 수정 요청은 별도 생성 기록에 보존하고 성공 표본만 골라 숨기지 않는다. 보고서의 `missingSlots`에는 미시도와 기술 실패가 함께 포함되므로 이것만으로 실패율을 계산할 수 없다.

같은 조건·seed는 비교를 묶는 실험 식별자다. 새 Luna 호출의 native 난수를 고정하거나 동일 출력을 보장하지 않는다. 부트스트랩 계산의 seed 재현성과 모델 생성의 재현성을 구분한다. 테스트·fixture는 계약을 확인하며 모델 파일럿을 대신하지 않는다. 실제 생성 표본 수·성공·실패와 행동 결과는 별도 실행 기록으로 확인한다.

## 보고서와 검증 자료

`persona_validation_report({"runDirectory":"/absolute/output/checking-contrast-01"})`는 `report.json`과 `report.ko.md`를 만든다. 저장된 최신 측정과 블라인드 표본이 일치해야 하며, 미채점은 그대로 표시한다. 이 보고서는 전체 계획의 설계 성향 표현을 평가하며 앱 재생·DB 수신·실제 사람의 행동을 검증하지 않는다.

`allowFixture:true`는 측정·블라인드 준비의 테스트 전용 옵션이다. 확률 fixture와 Luna 전체 계획을 섞지 않으며, `fixtureOnly:true` 자료를 독립 모델 표본이나 실제 파일럿 결과로 해석하지 않는다. 공통 성향 구현은 프로필 검증·비동기 scope 격리·지표 분모·익명화·채점·호환 경로의 테스트를 포함하지만 모델 파일럿 실행을 대신하지 않는다. 이번 성향·작성 지침 보완 역시 새 LLM 실험으로 행동 개선 효과를 입증했다는 의미가 아니다.

주요 구현은 [공통 프로필](../../market-simulator/src/validation/personaTraitProfiles.cjs), [v3 run](../../market-simulator/src/validation/personaTraitValidationRun.cjs), [모드 분기](../../market-simulator/src/validation/personaValidationRun.cjs), [지표](../../market-simulator/src/validation/personaValidationMetrics.cjs), [블라인드](../../market-simulator/src/validation/personaValidationBlind.cjs)에 있다. 기존 v2 run은 [legacy 구현](../../market-simulator/src/validation/personaValidationLegacyRun.cjs)에 보존한다.
