# 페르소나 성향 검증 상세

[README](../README.md)에서 분리한 성향 검증 요청 예시와 공통 절차다. 에이전트 절차는 [스킬 문서](../../market-persona-skill/references/persona-validation.md)를 따른다.

## 공통 성향 기반 충실도 검증

### 첫 플레이 성향 v2 프로필 요청 예시

새 traits run은 [카탈로그 v2](../validation/persona-traits-v2.json)의 아홉 축과 [명세 `analysisVersion:2`](../validation/persona-trait-validation-spec-v2.json)를 기본으로 사용한다. 아래 기존 다섯 축의 정의를 유지하고 `initialCaution`(초반 신중함), `operationLearning`(조작 익히기), `routeReliance`(익힌 동선 고수), `textCueLoad`(글자 단서 부담)를 더한다. 다섯 preset에서 새 축은 모두 `medium`이다. `catalogSchemaVersion:"persona-traits-v1"`을 명시하면 기존 다섯 축 경로를 사용하며, 저장된 v1 run은 원래 카탈로그·프로필 해시·명세·측정·보고서를 유지한다. v2 카탈로그와 legacy 검증 모드 v2는 다른 버전이다.

다음은 **요청 형식 예시이며 실행한 파일럿이 아니다**. 지민을 기본 맥락으로 하고 `initialCaution` 한 축만 다르게 설정한다. 나머지 여덟 성향은 지민의 v2 매핑에 맞춰 동일하게 명시했다. `basePersonaId`만 지정하면 성향이 자동으로 지민 매핑을 상속하는 것은 아니며, preset을 생략한 미지정 축은 `medium`이다.

```json
{
  "validationMode": "traits",
  "catalogSchemaVersion": "persona-traits-v2",
  "runId": "first-play-initial-caution-v2-new-01",
  "outputDirectory": "/absolute/output",
  "snapshotFilePaths": {
    "low": "/absolute/hud-fixed-snapshots/low.json",
    "high": "/absolute/hud-fixed-snapshots/high.json"
  },
  "seeds": ["s01","s02","s03","s04","s05","s06","s07","s08","s09","s10","s11","s12","s13","s14","s15","s16","s17","s18","s19","s20"],
  "profiles": [
    {
      "id": "jimin-caution-low",
      "basePersonaId": "mild-intellectual-disability-adult",
      "schemaVersion": "persona-traits-v2",
      "traits": {
        "deliberation": "medium", "checking": "high", "exploration": "high",
        "persistence": "high", "helpSeeking": "high",
        "initialCaution": "low", "operationLearning": "high",
        "routeReliance": "high", "textCueLoad": "high"
      }
    },
    {
      "id": "jimin-caution-high",
      "basePersonaId": "mild-intellectual-disability-adult",
      "schemaVersion": "persona-traits-v2",
      "traits": {
        "deliberation": "medium", "checking": "high", "exploration": "high",
        "persistence": "high", "helpSeeking": "high",
        "initialCaution": "high", "operationLearning": "high",
        "routeReliance": "high", "textCueLoad": "high"
      }
    }
  ]
}
```

이 객체를 `prepare_persona_validation`에 전달한다. 조작·동선·글자 성향의 개인차를 비교할 때도 같은 기본 인물에서 **비교할 한 축만** 다르게 만든다. 선언한 profile `schemaVersion`은 run 카탈로그와 일치해야 한다. 원본 인물 파일, `parameters`, `attention`, cognition과 비교용 `contextHash`는 바뀌지 않는다. `personaIds`를 쓰는 v2 traits run에도 인물별 매핑 지침을 검증 scope 안에서만 주입하고 일반 생성·legacy 경로는 유지한다.

초반 신중함은 첫 매대 열기·담기 전의 살핌 행동 수이고, 나머지는 기회당 반응 비율이다. 조작은 종류별 첫 사용만, 동선은 실제 방문한 곳과 미방문한 곳이 모두 이동 선택지에 있는 경우만, 글자 단서는 같은 계열의 다른 이름·규격 상품이 동시에 표시된 목표 담기만 센다. 관심 구매는 글자 지표에서 제외한다. 필요한 관측이 없거나 제외 후 기회가 없으면 `null`/`unexercised`와 이유를 남긴다. 기존 비교·확인·도움 발현에 쓰인 행동을 새 축에 중복 계산하지 않으며, 선언만으로 겹친 기회 역시 새 지표에서 제외한다. `reason`·활동 표기·작성 대기시간은 새 축의 긍정 근거가 아니다.

같은 조건·seed에서 양쪽 모두 기회가 있었던 쌍만 비교하며 유효 쌍 8개, |delta| ≥ 0.33, 95% CI의 0 제외 기준을 유지한다. 같은 인물·조건의 값이 모두 같은 경우는 근거 step ID를 포함한 진단 경고이며 판정 실패가 아니다. 성장과 과장 상한은 검사하지 않는다. 앞뒤 성향 유지는 명세 v3에서 설명 지표로만 보고하며 주 판정에 쓰지 않는다. 블라인드 답안은 v1이 다섯 축, v2가 아홉 축 전부를 요구한다. 아래 다섯 축 답안 예시는 v1용이며, v2에서는 준비 응답의 아홉 축 `answerFormat`을 사용한다. 익명 판에서 상품·이동 선택지 관측이 빠진 경우 해당 축은 `unknown`으로 남길 수 있다.

현행 검증 snapshot과 생성기에는 이동 갈림길·유사 상품 동시 표시 구조가 있어 생성기 변경은 하지 않았다. 정적 기회는 실제 노출이나 HUD 정상 동작을 보장하지 않는다. 이번 구현은 파일럿이나 실제 사람 데이터 비교를 수행하지 않았다. 남은 파일럿은 **HUD 결함을 고친 snapshot, 새 runId, 조건별 seed 20개 이상**으로 실행한다. 연구 근거로 설계한 첫 플레이 성향이 수준대로 행동에 나타나는지를 본 것이며, 실제 지적장애인과의 유사성을 입증하지 않는다. 인물별 매핑·관측 필드·출처와 한계는 [v2 검증 절차](../../market-persona-skill/references/persona-validation.md#성향-카탈로그-v2--첫-플레이의-네-성향)를 따른다.

### 명세 v3 기준 프로필 요청 예시

새 traits run은 [명세 v3](../validation/persona-trait-validation-spec-v3.json)을 기록한다. 주 판정과 블라인드 점수는 v2와 같고, 저장된 v2 run은 `specHash`로 v2 그대로 다시 측정된다. v3은 설명 지표 `baselineComparison`(기준 프로필 대비 위치)과 `positionStability`(기회 순서 앞뒤의 성향 유지, 핵심 출력 `contrastAttenuation`)를 더한다. 둘 다 `descriptiveOnly:true`, `usedForPrimaryDecision:false`다.

다음은 **요청 형식 예시이며 실행한 파일럿이 아니다**. 같은 기본 인물에서 `checking` 한 축만 다른 두 프로필에 `traitMode:"omitted"` 기준 프로필 하나를 더한다.

```json
{
  "validationMode": "traits",
  "catalogSchemaVersion": "persona-traits-v2",
  "runId": "checking-baseline-v3-new-01",
  "outputDirectory": "/absolute/output",
  "snapshotFilePaths": {
    "low": "/absolute/hud-fixed-snapshots/low.json",
    "high": "/absolute/hud-fixed-snapshots/high.json"
  },
  "seeds": ["seed-01", "seed-02", "seed-03", "seed-04", "seed-05", "seed-06", "seed-07", "seed-08", "seed-09", "seed-10",
    "seed-11", "seed-12", "seed-13", "seed-14", "seed-15", "seed-16", "seed-17", "seed-18", "seed-19", "seed-20"],
  "profiles": [
    { "id": "checking-low", "basePersonaId": "neutral-adult-control", "schemaVersion": "persona-traits-v2", "traits": { "checking": "low" } },
    { "id": "checking-high", "basePersonaId": "neutral-adult-control", "schemaVersion": "persona-traits-v2", "traits": { "checking": "high" } },
    { "id": "neutral-baseline", "basePersonaId": "neutral-adult-control", "schemaVersion": "persona-traits-v2", "traitMode": "omitted" }
  ]
}
```

기준 프로필은 같은 `contextHash`·공통 지침을 갖고 성향 지침 문장만 없다(`traits:null`). 다섯 성향이 `medium`인 `neutral-adult-control` 자체와는 다른 조건이다. `traitMode`는 `presetId`·`traits`와 함께 줄 수 없고 v1 카탈로그에서는 거절한다. 기준 프로필 슬롯은 readiness의 `missingSlots`에 생성 요청과 함께 포함되며, 기본 인물당 조건 2 × seed 수(이 예시는 40개) trace가 더 든다. 성향 대비·`groups`·블라인드 묶음에서는 빠지고 보고서에 `excludedBaselineTraces`가 표시된다. 위치 분류(`high-only-shift`·`low-only-shift`·`both-shift`·`baseline-beyond-range`·`indistinguishable`)는 모델의 기본 경향일 뿐 실제 사람의 평균이나 정상 범위가 아니다. 뒷부분에는 과제 단계 효과가 섞이므로 `contrastAttenuation`만으로 성향 감쇠를 확정하지 않는다. 정의와 한계는 [명세 v3 절차](../../market-persona-skill/references/persona-validation.md#명세-v3--기준-프로필과-앞뒤-성향-유지-설명-지표)를 따른다.

### 기존 다섯 축과 공통 절차

다음 다섯 축 설명은 v1과 v2에서 공통으로 유지한다. v1의 다섯 축 예시는 버전을 생략해 새 v2 run에 사용하면 추가 네 축이 `medium`으로 채워진다. 새 v2 비교에서는 나머지 여덟 축이 같아야 하며, 아래의 “나머지 네 성향”과 다섯 축 답안은 v1 설명이다.

새 run은 `validationMode:"traits"`로 명시할 수 있다. `profiles`는 `{id, basePersonaId, schemaVersion?, presetId?, traits?, label?}` 형식의 1~32개 인물이고 `personaIds`와 함께 쓰지 않는다. `basePersonaId`는 기존 세 인물 또는 `neutral-adult-control`이며, 유형 기본값에 `traits`의 일부 축을 덮어쓴다. 유형을 생략하면 모든 축은 `medium`에서 시작한다. 사용자 정의 ID는 경로에 안전한 소문자 영문·숫자·`_`·`-` 1~64자이고 첫 글자는 영문 또는 숫자여야 하며 기존 ID와 겹치지 않아야 한다.

| 성향 키 | 의미 | 수준 |
| --- | --- | --- |
| `deliberation` | 선택 전 후보·조건 숙고 | `low / medium / high` |
| `checking` | 목록·수량·장바구니 확인 | `low / medium / high` |
| `exploration` | 새로운 단서·관심 상품 탐색 | `low / medium / high` |
| `persistence` | 어려움 뒤 지속·전략 변경 | `low / medium / high` |
| `helpSeeking` | 불확실할 때 도움 활용 | `low / medium / high` |

유형 ID는 `deliberate-checker`(숙고·확인형), `quick-satisficer`(신속 결정형), `curious-explorer`(탐색·호기심형), `familiar-routine`(익숙함 선호형), `help-seeker`(도움 활용형)다. [카탈로그](../validation/persona-traits.json)에 수준별 지침과 기존 인물의 설계 매핑을 저장한다. 이 유형·수준은 심리검사 점수가 아니다. 성향을 바꿔도 기본 인물의 숫자 인지·반응·보행 기준, 상품 취향과 친숙함은 유지한다. 새 배우 지시문은 기존의 상충하는 성격 서술을 공통 성향 지침으로 대체하며 원본 인물 파일은 바꾸지 않는다.

숙고는 실제 관찰한 관련 후보·복수 조건을 살필지, 확인은 다음 목표 전환·불확실한 수량·결제 시 어떤 정보를 대조할지에 반영한다. 낮은 수준도 필요하면 확인할 수 있고 모든 수준은 충분히 명확해지면 멈춘다. 고정된 행동·실수·도움 횟수를 요구하지 않는다. 닫기·이동·대기나 `check` 표기만으로 실제 확인을 대신하지 않는다. 같은 페이지의 후보를 살필 수 있지만 별도 UI 행동 없는 설명은 배우 선언이며 독립적으로 측정한 비교 행동이 아니다.

새 사용자 정의 프로필 버전 `traits-2-<hash>`는 실제 프롬프트를 포함한 작성 내용을 반영한다. 수행 기준·취향·경험이 같으면 비교용 `contextHash`는 유지된다. 카탈로그·작성 지침 변경 후에는 새 runId와 bundle을 사용한다. 과거 저장 자료는 다시 쓰지 않으며, hash가 달라진 과거 run을 현재 코드로 그대로 재측정할 수 있다는 뜻은 아니다.

새 run은 **조건별 seed 20개 이상**을 권장한다. 20개 미만도 허용하며 준비 응답의 `powerWarning`에 표시한다. 절차는 준비 → `check_persona_validation_readiness({runDirectory})` → 부족 슬롯의 `prepareWholeTrace`로 생성 → readiness 재확인 → measure → 다중 블라인드 → report다. readiness는 인물×조건 완료 수, 대조군·짝 불일치, 지표별 최대 유효 쌍 상한과 부족 슬롯을 읽기 전용으로 반환한다. 대조군 또는 비교 가능한 쌍이 없으면 측정 응답과 보고서 상단에 `readiness:"blocked"`와 이유를 기록한다. v3의 비교 기준은 같은 맥락·단일 성향 대비 프로필이다.

검증 전용 snapshot은 `scripts/build-validation-snapshots.cjs`로 새 디렉터리에 만들며 기존 snapshot을 덮어쓰지 않는다. 준비 manifest의 `opportunityAudit`는 구조적 기회와 불가능 경고를 기록한다. 구조적 가능성이 실제 노출·오류·회복을 보장하지는 않는다.

앞뒤 기회를 비교하는 별도 설계에는 `--low-goal-count 3`으로 low 목표를 우유·사과·생수 각 1개로 고정할 수 있다. high는 기존 5개 목표와 수량을 유지하며 배치·재고·화면 조건은 바꾸지 않는다. 옵션을 생략한 과거 기본은 2개다. `snapshot-set.json`의 `design`에 실제 목표 수와 목표를 한 번씩 순차 선택했을 때 가능한 전환 수를 기록한다. 목표 2개를 정상적으로 한 번씩 구매하면 `postSelectionListRate`의 기회는 1개뿐이므로 앞뒤 분할에 충분하지 않다. 목표 3개도 실제 도달·구매·전환을 보장하지 않는다. 이 변경은 새 snapshot·새 run에만 적용하고 과거 결과와 같은 조건으로 합치지 않는다.

해당 traits v2 run의 `prepare_persona_validation`에도 `lowGoalCount:3`을 명시한다. manifest의 `taskDesign`/`taskDesignHash`가 low 3/high 5 구성과 snapshot 목표 수를 고정하며 준비·readiness·측정·보고서에 이어진다. 미지정 기본은 low 2/high 5이고, 기존 run에 옵션을 나중에 바꿔 붙이지 못한다. legacy·traits v1은 이 옵션을 거절한다. v3 판정 명세와 specHash는 그대로 유지한다.

새 `sequenceMetrics`는 대기시간 분포·전이·오류 근거·회복·반복을 설명하며 `descriptiveOnly:true`다. `pooledAnalysis`는 low/high 층화 쌍 부트스트랩, `powerAnalysis`는 고정 seed의 가정 기반 검정력이며 둘 다 주 판정에 사용하지 않는다. 유효 쌍 8·|delta| ≥ 0.33·95% CI의 0 제외·플래그 10%는 유지한다. **실수 강제 금지**: 오류가 많다고 장애 특성에 충실하다고 해석하지 않는다.

다중 판별은 준비·제출의 `reviewerId`, 제출의 `reviewerKind:"llm"|"expert"`로 구분하고 판별자마다 A 채점 뒤 B, 채점 답안 동결을 지킨다. `blindReviews`에 판별자별 점수, `interReviewerAgreement`에 Cohen’s κ(2명)/Fleiss’ κ(3명 이상)를 보고한다. 기존 단일 `blind-review.json`도 읽는다. [전문가 안내](../../market-persona-skill/references/blind-review-guide.ko.md)와 [상세 입출력·한계](../../market-persona-skill/references/persona-validation.md)를 따른다. 실제 사람 자료는 수집·비교하지 않으며 `referenceComparison:null`과 [확장 메모](../../docs/ai/persona-validation/persona-validation-extension-design.md)만 남긴다. 기존 spec 원문은 validation/archive에 보존하고 새 명세(legacy v3/traits v2)는 새 run에만 적용한다.

다음 `prepare_persona_validation` 예시는 같은 기본 맥락에서 확인 성향만 다른 두 인물을 준비한다. 8개 seed × 2조건 × 2인물 = 32칸을 만들며 모델 생성은 자동 실행하지 않는다.

```json
{
  "validationMode": "traits",
  "runId": "checking-contrast-01",
  "outputDirectory": "/absolute/output",
  "snapshotFilePaths": {"low":"/absolute/low.json","high":"/absolute/high.json"},
  "seeds": ["s01","s02","s03","s04","s05","s06","s07","s08"],
  "profiles": [
    {"id":"checking-low","basePersonaId":"neutral-adult-control","presetId":"deliberate-checker","traits":{"checking":"low"}},
    {"id":"checking-high","basePersonaId":"neutral-adult-control","presetId":"deliberate-checker","traits":{"checking":"high"}}
  ]
}
```

반환된 각 `slot.prepareWholeTrace`를 그대로 사용한다. **슬롯마다 새 `gpt-6-luna / low` 문맥**에서 bundle 하나의 전체 계획을 작성·제출하며, 다른 인물·조건·검증 점수를 함께 주지 않는다. 사용자 정의 인물은 검증 manifest에 바인딩된 전체 계획 scope에서만 사용할 수 있고 일반 인물 목록·확률/증분 생성·learner 등록으로 확대되지 않는다. first-play만 사용하며 앱 재생은 별도 요청과 절차다.

새 `authoringGuide` v2는 읽고 선택한 열린 목표와 실제 관찰한 상품의 focus 예시를 제공한다. `null` 예시를 모든 결정에 복사하거나 실제 선택 오류를 정답에 맞춰 수정하지 않는다. 닫기 예시는 그 자체로 확인이 아니다. candidate의 최상위 키는 `candidateVersion`, `requestId`, `decisions` 세 개뿐이다. 입력 식별용 `inputHash`·`snapshotId`·`personaId`·`seed`는 candidate에 추가하지 않는다.

저장 후 `measure_persona_validation({runDirectory})`를 호출한다. 비교 쌍은 `contextHash`가 같고 나머지 네 성향이 같을 때만 만들어지며 동일 조건·seed에서 실제 평가 기회가 있었던 표본을 사용한다. 높은 설정 수준 대비 낮은 수준을 비교하므로 `high-low`뿐 아니라 `high-medium`, `medium-low`도 포함한다. 여러 유형이 함께 다른 집단의 집계는 설명적이다. 위 예제에서 효과 비교 대상은 확인 성향뿐이다. 같은 seed는 비교 식별자이며 native 모델 난수·동일 출력을 보장하지 않는다. 유효 쌍 8개 기준은 생성 슬롯 8개와 다르다. Cliff’s delta는 두 집단 전체 분포를 비교하고 부트스트랩은 seed 쌍을 함께 재표집한다. 인접 수준에도 같은 |delta| ≥ 0.33 기준을 적용하며, 이는 아직 실험적으로 보정하지 않은 설계값이다.

보고서는 네 축을 나눈다: 기술적으로 저장된 trace·누락 슬롯, **전체 목표**의 시도·충족·미시도·종료 결과, 성향 표현, 실제 평가 기회와 근거 충분성. 어려움의 관찰 근거 없이 미완료 목표를 남기고 포기하면 검토 신호를 남기며 자동 성격 실패로 처리하지 않는다. 시도한 목표의 불일치율을 전체 목표 달성률과 혼동하지 않는다. 도움 사용·낮은 정확도·오류/관심 횟수의 분산 0은 검토·정보 신호이며 자동 실패가 아니다. 금지 패턴 실패는 명시된 위반에만 적용한다. 관찰된 행동·작성된 시간·배우 선언도 구분한다. 누락 슬롯에는 미시도와 기술 실패가 함께 포함되므로 별도 요청 기록 없이 생성 실패율을 추정하지 않는다.

작성 가이드 v2 자료의 제출 결과와 `.persona-review.json`에는 선택적 `annotationReview`(`reviewVersion:"actor-annotation-v1"`)가 있다. 닫기와 `check` 표기·focus 불일치에 대해 자체 `status`, `findings`, 결정별 근거, `improvementTarget`, `recommendation`을 제공한다. 상위 review가 `clear`여도 별도 주석 검토는 `review`일 수 있으므로 각각 읽는다. 과거 가이드에 항목이 없다는 사실을 통과로 해석하지 않는다. 검토 신호는 주석 보완용이며 행동 변경·추가 확인·성향 실패를 요구하지 않는다.

측정의 `measurements.perTrace[i].annotationReview`와 JSON 보고서 `annotationReviews[{personaId,condition,seed,tracePath,review}]`에 이 결과를 전달하고, 항목이 없으면 검토 값을 `null`로 둔다. 한국어 보고서 **행동·focus 주석 정합성**에는 발견 근거와 권장 조치가 표시된다.

성향 주 판정은 `behavioralEvidence`만 사용하고 `authoredTiming`은 별도로 보고한다. 작성 시간 차이가 행동 근거의 부족을 보충하지 않는다. 관찰된/예상 비교 수(`exercisedComparisons / expectedComparisons`)를 표시하며, 일부 행동 비교가 미발생이면 나머지가 모두 pass여도 `partial`이다. 모두 미발생이면 `unexercised`, 표본 부족이 하나라도 있으면 `insufficient`로 남긴다.

`prepare_blind_review({runDirectory,panel:"A"})`는 공통 `traitRubric`, `publicStyles`와 익명 판을 제공한다. 새 판별 문맥은 이것만 읽고 개인별 프로필·manifest·정답 키·측정 결과는 읽지 않는다. A는 행동·시간, B는 여기에 이유를 더하며 A 채점 후 B를 준비한다. B 판단 전에 A 점수·정답을 알려주지 않는다. 새 모드의 `submit_blind_review` 답안은 인물 ID 대신 다음 형식이며 실제 판의 모든 opaque ID를 포함해야 한다.

```json
{
  "runDirectory": "/absolute/output/checking-contrast-01",
  "panel": "A",
  "answers": {
    "opaque-id-from-panel": {
      "traits": {"deliberation":"medium","checking":"high","exploration":"unknown","persistence":"unknown","helpSeeking":"unknown"},
      "confidence": 0.6
    }
  },
  "reviewerModel": "self-reported-model",
  "reviewerSession": "self-reported-new-session"
}
```

다섯 축마다 `low / medium / high / unknown`을 답한다. `confidence`는 선택적 0~1이다. `unknown`은 정확도의 분모에 남으며, 축별 정확도와 판별 비율을 함께 보고한다. 고정된 25% 우연 정확도나 장애 분류를 적용하지 않는다. A/B는 같은 표본이고 독립적인 두 반복이 아니며 판별 세션의 독립성·정답 미열람은 자기 신고다. 마지막 `persona_validation_report({runDirectory})`가 JSON·한국어 보고서를 저장한다.

새 공통 성향 run은 manifest `version:3`이다. `profiles`와 `personaIds`를 모두 생략하면 기존 세 인물을 설계 성향에 매핑한다. 기존 네 ID를 모두 전달하는 과거 `personaIds` 형식은 모드를 생략하면 legacy로 유지한다. 같은 네 ID에 공통 성향을 적용하려면 `validationMode:"traits"`를 명시한다. `validationMode:"legacy"`와 저장된 v2 run은 [기존 네 인물 고정 검증](../../market-persona-skill/references/persona-validation.md#legacy-v2--기존-네-인물-고정-검증-절차와-구현-기록)을 유지하며 v2/v3 자료를 섞지 않는다.

공통 성향 구현 테스트와 `allowFixture:true` 자료는 파이프라인 확인용이다. 이번 지침 보완으로 새 LLM 실험의 행동 개선 효과를 입증한 것은 아니며, 계획 검증은 실제 앱 수행·DB 수신·사람 행동의 타당성을 증명하지 않는다.
