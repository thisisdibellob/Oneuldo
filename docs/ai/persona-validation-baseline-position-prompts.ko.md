# 성향 검증 확장: 기준 프로필과 앞뒤 유지 — 단계별 구현 프롬프트

각 단계는 새 작업 문맥에 그대로 붙여 넣을 수 있도록 공통 전제를 포함한다. 순서는 1 → 2 → 3 → 4 → 5이며, 3은 1이 끝난 뒤 2와 병렬로 진행할 수 있다. 4는 2와 3이 모두 끝나야 한다.

---

## 공통 전제 (모든 단계 프롬프트 앞에 붙인다)

```text
저장소: /Users/mymacbookair/Desktop/Project/Oneuldo
작업 영역: market-simulator (Node CommonJS, 테스트는 `cd market-simulator && npm test` = node --test test/*.test.cjs)

배경:
- 페르소나 성향 검증은 contextHash가 같고 성향 하나만 다른 프로필 쌍을, 같은 조건(low/high)·seed끼리 짝지어 비교한다.
  주 판정은 Cliff's delta, |delta| ≥ 0.33, 짝 부트스트랩 95% CI의 0 제외, 유효 쌍 8 이상이다.
- 관련 파일:
  - src/validation/personaTraitProfiles.cjs — 프로필 해석(resolveProfiles), 프롬프트 생성(customPersona), 맥락 분리(buildSeparatedContext)
  - src/validation/personaTraitValidationRun.cjs — prepare / measure / blind / report, matchedContrasts, groups 집계
  - src/validation/personaValidationMetrics.cjs — trace별 지표(extract, extractUniversal의 put())
  - src/validation/personaValidationAnalysis.cjs — 설명용 보조 분석(analyze, supplementaryMarkdown)
  - src/validation/personaValidationSpec.cjs — assertSpec: manifest.specHash로 명세 후보를 고른다
  - src/validation/personaValidationBlind.cjs — buildTraits, assertAnonymous
  - validation/persona-trait-validation-spec-v2.json — 현재 명세
  - server.cjs — MCP 도구 inputSchema (prepare_persona_validation의 profiles 스키마가 인라인으로 있음)
  - market-persona-skill/references/persona-validation.md — 검증 절차 문서

반드시 지킬 것:
- 기존 명세 v2 run, 과거 manifest·trace·measurements·보고서의 결과를 바꾸지 않는다. 새 기능은 새 명세 v3에서만 켠다.
- 새 출력은 모두 descriptiveOnly: true, usedForPrimaryDecision: false다. findings의 status, 성향 판정(supported/contradicted 등), 블라인드 점수 로직을 바꾸지 않는다.
- 미발생은 null/unexercised로 남기고 0으로 채우지 않는다. 실수·확인 횟수·포기를 강제하는 규칙을 추가하지 않는다.
- 현재 작업 트리에는 whole-trace 관련 미커밋 변경(src/wholeTrace*.ts, cli.cjs, README.md, whole-trace-host.cjs 등)이 있다. 이 단계에 필요한 곳이 아니면 건드리지 않고, 되돌리거나 커밋하지 않는다.
- 주변 코드의 밀도·이름·스타일(짧은 함수, 한 줄 조건, 영어 식별자와 한국어 보고 문구)을 따른다.
- 끝나면 npm test 전체 결과를 그대로 보고한다. 실패가 있으면 이 단계 변경 때문인지 기존 실패인지 구분한다.
```

---

## 1단계 — 명세 v3와 기회별 기록(opportunityRows)

```text
[공통 전제]

목표: 이후 단계가 쓸 토대를 만든다. 기존 측정값은 하나도 바뀌면 안 된다.

1. validation/persona-trait-validation-spec-v3.json을 v2의 복사본으로 만든다.
   - version을 올리고 note에 v3의 추가 범위(기준 프로필 비교, 앞뒤 유지 설명 지표)를 쓴다.
   - metrics 각 항목에 positionSplit(boolean)을 추가한다.
     true: comparisonRate, postSelectionListRate, interestDetourRate, persistenceResponseRate, helpSeekingRate,
           operationLearningRate, routeRelianceRate, textCueLoadRate
     false: preCheckoutCartRate, initialCautionCount, newShelfDelayMs (구조상 trace 앞이나 끝에 고정된 지표)
     목록에 없는 지표가 있으면 기회가 한 trace에서 여러 번 생기는지 코드로 확인해 정하고, 판단 근거를 보고한다.
   - 최상위에 baselineComparison, positionStability 설정 블록을 추가한다(값은 3·2단계에서 쓰지만 키는 지금 고정한다).
     baselineComparison: { enabled: true, traitMode: "omitted", descriptiveOnly: true }
     positionStability: { enabled: true, split: "opportunity-order-halves", oddMiddle: "early", minOpportunitiesPerTrace: 2, descriptiveOnly: true }
2. src/personaValidationSpec.cjs의 assertSpec 후보에 v3 파일을 추가한다. src/personaTraitValidationRun.cjs의 currentSpec을 v3로 바꾸되,
   기존 v2 manifest는 specHash로 계속 v2가 선택되는지 확인한다. 새 prepare는 v3를 쓴다.
   writableManifest 등 analysisVersion에 묶인 조건이 v3에서도 맞는지 확인한다.
3. src/personaValidationMetrics.cjs의 두 put()(extract, extractUniversal)에 기회별 기록을 추가한다.
   - 형식: opportunityRows: [{ decisionIndex, hit, stepIds }] — 기회 하나당 한 행, hit는 그 기회가 numerator에 들어갔는지.
   - 지금 put()은 기회와 성공 행동을 한 배열(evidenceEvents/rows)로 받는다. 지표마다 기회 목록과 성공 목록을 분리해 넘기도록 호출부를 고친다.
     예: postSelectionListRate는 선택 이벤트(event)가 기회이고, 그 뒤 next 전까지 readList가 있으면 hit다.
   - 기존 필드(status, numerator, denominator, value, evidence, decisionIndexes, reviewFindings 등)의 값과 순서는 그대로 둔다.
   - 불변식: opportunityRows.length === denominator, hit 개수 === numerator. 비율이 아닌 지표(시간 합계 등)는 opportunityRows를 null로 둔다.
     numerator가 정수가 아닌 지표(예: recoveries.length / 2)가 있으면 억지로 맞추지 말고 null로 두고 보고한다.
   - 시스템 완료 구간은 actorEvents가 이미 잘라낸다. 그 동작에 의존하되 테스트로 확인한다.

테스트:
- test/persona-trait-metrics.test.cjs에 지표별 불변식 테스트(opportunityRows 길이·hit 합계)를 추가한다.
- 기존 픽스처 trace로 opportunityRows를 제외한 지표 객체가 변경 전과 완전히 같은지 비교하는 회귀 테스트를 추가한다.
- v2 specHash manifest가 여전히 v2로 측정되고 measurements.json의 기존 필드가 바뀌지 않는지 확인한다(persona-trait-v1-regression / persona-trait-v2-run 테스트를 참고).
- systemCompletion.firstStepId가 있는 trace에서 그 이후 결정이 opportunityRows에 들어가지 않는지 확인한다.

완료 기준: npm test 통과, 기존 측정 회귀 없음, 지표별 positionSplit 결정과 null 처리한 지표 목록 보고.
```

---

## 2단계 — 앞뒤 유지(positionStability) 계산

```text
[공통 전제]
전제: 1단계 완료(명세 v3, metrics의 opportunityRows 존재).

목표: 한 trace 안에서 성향 표현이 앞부분과 뒷부분에서 달라지는지 설명 지표로 보고한다. 새 trace 생성 없이 저장된 trace로 계산한다.

1. 새 모듈 src/personaValidationPosition.cjs를 만든다.
   - splitOpportunities(rows, {minOpportunitiesPerTrace}): decisionIndex 오름차순 정렬 후 앞 절반·뒤 절반으로 나눈다.
     홀수면 가운데 기회를 앞쪽에 넣는다. 기회가 minOpportunitiesPerTrace 미만이면 {status:'insufficient-opportunities'}.
     decisionIndex가 정수가 아닌 행이 있으면 {status:'missing-decision-index'}로 남긴다.
   - 각 절반의 rate = hit 수 / 기회 수.
2. 출력 positionStability를 만든다(positionSplit:true 지표만).
   a. profileShift: 프로필×조건×지표마다 trace별 (late − early)를 모아 평균, 중앙값, trace 단위 부트스트랩 95% 구간, 사용 trace 수, 제외 trace 수와 이유.
   b. contrastAttenuation: matchedContrasts의 각 쌍(높음/낮음)과 조건·지표마다, 같은 seed의 두 trace가 모두 분할 가능할 때
      early 구간끼리의 Cliff's delta와 late 구간끼리의 Cliff's delta를 계산하고, attenuation = |delta_early| − |delta_late|와
      같은 seed 쌍을 재표집하는 부트스트랩 구간을 붙인다. 이것이 핵심 출력이다.
   c. baselineAdjusted: 이 단계에서는 키만 두고 null, reason:'no-baseline-profile'. 4단계에서 채운다.
   - 부트스트랩은 personaValidationStatistics.cjs / personaValidationSupplementary.cjs의 기존 함수를 재사용하고 seed 문자열 규칙도 같은 방식으로 정한다.
   - 모든 항목에 descriptiveOnly:true, usedForPrimaryDecision:false.
3. personaValidationAnalysis.cjs의 analyze()가 v3 명세일 때만 positionStability를 반환하게 하고, reportFields에 키를 추가한다.
   v2 명세 run에서는 키 자체를 넣지 않거나 null로 둔다(기존 measurements.json 바이트 회귀 테스트를 깨지 않는 쪽을 택하고 보고).
4. 한국어 보고서(supplementaryMarkdown 또는 새 함수)에 "## 앞뒤 성향 유지 (설명 지표)" 표를 추가한다.
   해석 문구: "뒷부분은 남은 목표·상황이 달라 과제 단계 효과가 섞인다. 대비 약화(attenuation)만으로 성향 감쇠를 확정하지 않는다."

테스트(새 파일 test/persona-trait-position-stability.test.cjs):
- 짝수·홀수 분할, 기회 1개(insufficient), decisionIndex 누락.
- 앞부분 hit만 있는 합성 rows에서 profileShift가 음수, 균일하면 0 근처.
- contrastAttenuation: early에서 대비가 크고 late에서 0인 합성 쌍에서 attenuation 양수, 한쪽 trace만 분할 가능한 seed는 제외 이유와 함께 빠짐.
- v2 명세 run에는 positionStability가 나타나지 않거나 null임.

완료 기준: npm test 통과, 기존 findings·판정 불변, 보고서 표 출력 확인(픽스처 run으로 measure → report 실행 결과 일부 첨부).
```

---

## 3단계 — 성향 문장을 뺀 기준 프로필(traitMode: "omitted")

```text
[공통 전제]
전제: 1단계 완료(명세 v3). 2단계와 독립적으로 진행 가능.

목표: 기본 맥락은 같고 성향 지침 문장만 없는 프로필을 만들 수 있게 한다. 이것은 다섯 성향을 medium으로 둔 neutral-adult-control과 다른 조건이다.

1. src/validation/personaTraitProfiles.cjs
   - resolveProfiles의 사용자 정의 프로필 입력에 traitMode를 허용한다. 값은 "omitted"만 허용한다.
     traitMode와 presetId 또는 traits를 같이 주면 거절한다(fail 메시지로 이유 명시). v1 카탈로그에서는 거절한다.
   - customPersona에서 traitMode가 omitted이면:
     - persona.prompt에서 "## 공통 성향" 섹션과 traitInstructions 줄을 뺀다.
       "성향을 행동으로 선택하는 기준", "성향과 분리된 기본 맥락", "공통 전제와 관찰·실행 범위" 섹션은 그대로 둔다.
       단 첫 섹션의 문장 중 "성향은 …"처럼 성향 지침의 존재를 전제하는 표현이 있으면, 의미를 바꾸지 않는 최소 수정안을 제안하고
       실제로 바꿀지는 보고에서 판단 근거와 함께 밝힌다(성향 프로필과 기준 프로필의 차이가 성향 줄뿐이어야 한다는 원칙 우선).
     - persona.description의 성향 문장, character.selectedTraits를 제거한다.
     - traitProfile에 traitMode:'omitted', traits:null을 기록한다. contextHash는 buildSeparatedContext(base) 그대로라 성향 프로필과 같아야 한다.
     - 버전은 기존과 같이 전달 내용 hash로 만든다(자동으로 달라진다).
   - resolveProfiles 반환값의 traits는 null로 둔다. 이 null을 받는 모든 호출부를 찾아 처리한다.
2. src/validation/personaTraitValidationRun.cjs
   - matchedContrasts: traits가 null인 프로필을 건너뛴다.
   - 새 함수 baselineContrasts(profiles): 기준 프로필마다 같은 contextHash의 성향 프로필 목록을 짝으로 만든다
     ({id, baselineProfileId, profileId, contextHash, traits}).
   - measure의 groups 집계, summarizeFlags, perTrace 출력, refresh/profiles 목록에서 traits:null이 오류 없이 처리되게 한다.
     groups(성향 수준별 집계)에는 기준 프로필을 넣지 않는다.
   - readiness(src/validation/personaValidationReadiness.cjs): 기준 프로필 슬롯도 required에 포함하고 missingSlots로 생성 요청을 반환한다.
     기준 프로필을 대조군(control)이나 referenceControls로 취급하지 않는다.
3. 블라인드: personaValidationBlind.cjs의 buildTraits에서 기준 프로필 trace를 묶음과 정답 키에서 제외하고,
   prepareBlind 응답과 보고서에 excludedBaselineTraces 수를 표시한다. assertAnonymous가 계속 통과해야 한다.
4. server.cjs의 prepare_persona_validation inputSchema의 profiles 항목에 traitMode:{enum:['omitted']}를 추가한다.
   cli.cjs에 같은 스키마나 검증이 따로 있으면 맞춘다(없으면 없다고 보고).

테스트:
- test/persona-trait-profiles.test.cjs: 기준 프로필의 contextHash가 같은 basePersonaId의 성향 프로필과 같음, prompt에 성향 줄 없음,
  나머지 섹션은 성향 프로필과 문자열 단위로 동일(성향 섹션 제외), version 다름, traitMode+traits/presetId 거절, v1 거절.
- test/persona-trait-v2-run.test.cjs 또는 새 v3 run 테스트: prepare에 기준 프로필 포함 → readiness의 missingSlots에 포함,
  matchedContrasts에 기준 프로필 없음, baselineContrasts 생성, 픽스처 measure가 오류 없이 끝남, 블라인드 묶음에서 제외.
- server 스키마 테스트(test/server.test.cjs)에 traitMode 허용·잘못된 값 거절.

완료 기준: npm test 통과, v2 run 회귀 없음, 첫 섹션 문구 처리 결정과 근거 보고.
```

---

## 4단계 — 기준 프로필 비교(baselineComparison)와 기준 대비 앞뒤 변화

```text
[공통 전제]
전제: 2단계(positionStability)와 3단계(traitMode omitted, baselineContrasts) 완료.

목표: 각 성향 지표에서 모델 기본값(기준 프로필)이 낮음·높음 사이 어디에 있는지 설명 지표로 보고한다.

1. personaValidationAnalysis.cjs(또는 새 모듈 src/validation/personaValidationBaseline.cjs)에 baselineComparison을 만든다.
   - baselineContrasts의 각 기준 프로필 × 같은 맥락의 성향 프로필 × 성향 지표 × 조건마다, 같은 seed로 짝지은
     성향 프로필 대 기준 프로필의 Cliff's delta, 짝 부트스트랩 95% 구간, 유효 쌍 수, 미발생·누락 수.
   - 한 성향에 낮음·높음 프로필이 모두 있으면 지표별 위치 분류를 단다:
     high-only-shift(기준≈낮음), low-only-shift(기준≈높음), both-shift(기준이 사이), indistinguishable(구간 겹침 또는 유효 쌍 < spec.minValidPairs).
     "≈"는 해당 delta의 95% 구간이 0을 포함한다는 뜻으로 정의하고 명세 v3의 baselineComparison 블록에 규칙을 문자로 남긴다.
     기대 방향이나 통과·실패 판정은 만들지 않는다.
2. positionStability.baselineAdjusted를 채운다: contrastAttenuation과 같은 방식으로, 성향 프로필의 (late − early)에서
   같은 seed 기준 프로필의 (late − early)를 뺀 값의 평균과 부트스트랩 구간. 기준 프로필이 없으면 기존처럼 null과 이유.
3. 보고서에 "## 기준 프로필 대비 (설명 지표)" 표를 추가한다(지표, 조건, 낮음/기준/높음 평균, 두 delta, 위치 분류, 유효 쌍).
   해석 문구: "기준 프로필은 성향 문장만 뺀 같은 맥락이다. 모델의 기본 경향을 보여줄 뿐 실제 사람의 평균이나 정상 범위가 아니다."
   지적장애 기본 인물에서 나온 결과를 장애 특성의 근거로 쓰지 말라는 문구도 넣는다.
4. measure 결과와 report.json의 reportFields에 baselineComparison을 추가한다. v2 run에는 나타나지 않게 한다.

테스트:
- 합성 trace/metrics로 세 위치 분류와 indistinguishable이 각각 나오는 경우.
- 낮음 또는 높음 프로필만 있는 성향은 분류 없이 delta만 보고.
- baselineAdjusted: 기준과 같은 앞뒤 변화를 가진 성향 프로필은 0 근처.
- 주 판정 findings와 blind 점수가 기준 프로필 추가 전후로 같음(같은 성향 프로필 집합에 기준 프로필만 더한 run 비교).

완료 기준: npm test 통과, 주 판정 불변 확인, 보고서 예시 출력 첨부.
```

---

## 5단계 — 문서와 사용 예시

```text
[공통 전제]
전제: 1~4단계 완료.

목표: 사용자가 새 기능을 쓰고 결과를 잘못 해석하지 않도록 문서를 맞춘다. 코드는 바꾸지 않는다(문서와 예시 JSON만).

1. market-persona-skill/references/persona-validation.md
   - 명세 v3 소개, 기존 v2 run은 그대로 재현된다는 점.
   - 기준 프로필: 요청 예시 {"id":"neutral-baseline","basePersonaId":"neutral-adult-control","traitMode":"omitted"},
     neutral-adult-control(medium 다섯 개)과의 차이, 블라인드 제외, readiness 포함, 비용(기본 인물당 조건 2 × seed 수 trace).
   - baselineComparison의 위치 분류 정의와 해석 한계.
   - positionStability: 분할 규칙, 적용·제외 지표와 이유, contrastAttenuation이 핵심 출력인 이유, 과제 단계 효과가 섞인다는 한계.
   - "성장, 시간에 따른 성향 감쇠, 과장 상한은 검사하지 않는다" 문장을
     "성장과 과장 상한은 검사하지 않는다. 앞뒤 성향 유지는 v3에서 설명 지표로만 보고하며 주 판정에 쓰지 않는다"로 고친다.
   - 근거: 페르소나 없는 대조군은 The Behavioral Fabric of LLM-Powered GUI Agents(arXiv 2601.16356)와
     OPeRA(arXiv 2506.05606)의 persona ablation, 앞뒤 유지는 LLM ADHD 학생 페르소나 안정성 연구(arXiv 2605.06307)를 참고했다고 쓰되,
     이 연구들의 수치를 기준값으로 쓰지 않았다는 점을 명시한다.
2. market-simulator/README.md의 성향 v2 프로필 요청 예시 근처에 v3 기준 프로필 예시를 추가한다.
   README에는 whole-trace 관련 미커밋 변경이 있으니 그 부분은 건드리지 않고 해당 절만 수정한다.
3. 필요하면 market-persona-skill/SKILL.md의 검증 절차 요약에 한 줄을 추가한다(기존 문장 구조 유지).

완료 기준: 문서 간 용어 일치(traitMode, baselineComparison, positionStability, contrastAttenuation), 링크 유효,
수정 파일 목록과 diff 요약 보고.
```

---

## 단계 간 의존과 확인

| 단계 | 의존 | 새 trace 생성 필요 | 확인 방법 |
|---|---|---|---|
| 1 | 없음 | 아니오 | 회귀 테스트(기존 지표 불변) |
| 2 | 1 | 아니오 | 저장된 픽스처 run으로 measure/report |
| 3 | 1 | 아니오(구현) / 예(실사용) | 픽스처 prepare·readiness·measure |
| 4 | 2, 3 | 예(실사용) | 합성 데이터 테스트, 이후 파일럿 run |
| 5 | 1~4 | 아니오 | 문서 검토 |

실제 효과는 HUD 결함을 고친 snapshot, 새 runId, 조건별 seed 20개 이상의 파일럿에서만 확인할 수 있다.
