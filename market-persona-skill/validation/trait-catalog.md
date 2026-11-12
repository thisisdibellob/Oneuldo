# 성향 카탈로그·명세·지표

[검증 절차](procedure.md)에서 쓰는 성향 축, 명세 v3 설명 지표, 공통 지표와 판정 기준이다.

## 명시적 이동 검증 옵션

이동을 비교하는 새 run에는 `prepare_persona_validation`에서 `movementValidationVersion:"1"`을 지정한다. 대조군은 이 marker만, 방향 이동군은 `movementVersion:"directional-v2"`도 지정한다. 최근 이동 단서가 필요한 별도 실험에만 `movementFeedbackVersion:"recent-movement-v1"`을 더한다. 서로 다른 옵션은 서로 다른 새 runId를 사용하며, 준비·readiness가 반환한 `prepareWholeTrace`를 그대로 전달한다. manifest·slot·요청·bundle·trace·audit에서 세 옵션의 누락과 혼합을 거절한다. `directional-v1`과 학습 trial은 이 계약의 대상이 아니다. 옵션 없는 과거 run과 저장 결과를 소급 변경하지 않는다.

원본 네 인물의 비교는 `validationMode:"legacy"`를 명시한다. 이 옵션은 검증 전용 `neutral-adult-control`을 포함한 네 인물 모두에 적용되며 원본 프로필에 traits v2 지침을 추가하지 않는다. traits 모드의 프로필·카탈로그 선택도 그대로 유지한다. [README의 준비 예시](../../market-simulator/docs/whole-trace.md#검증-run에-이동-옵션-고정하기)를 참고한다.

서버는 수락된 결정의 실제 합법 통로 메뉴, 이동 전후 위치 참조, 실제 이동 결과와 확인된 도착을 `navigationEvidence.version:"continuous-route-v1"`로 저장한다. 좌표는 기록하지 않고 v2의 정확한 연속 위치 ID를 사용한다. 도착은 이미 제공한 anchor에 앱의 도착 허용 거리(1px) 안으로 실제 도달한 경우다. 미래 방향별 도착을 예측하거나 위치를 격자에 맞춰 방문을 추정하지 않는다. 이 분석 증거는 배우 관찰·선택지에 정보를 더하지 않는다.

새 경로 기회의 분모는 방문·미방문 anchor가 함께 보이는 실제 메뉴에서 `walkToAnchor`를 선택한 건수다. `moveDirection`은 선택 시점에 확정 목적지가 없으므로 분자·분모에서 제외한다. 방향 이동의 확인된 도착은 이후 anchor 방문 근거로 이어지고, 방향 입력·혼합 메뉴·정확한 위치 재방문·차단·부분 차단·확인된 도착은 `directionalDiagnostics`에 따로 남긴다. 메뉴 전체, 연속 source 연결, 기록된 실행 결과가 불일치하면 경로 지표를 `null`/`unexercised`로 남기고 step ID와 원인을 제공한다. 근거 부족을 기회 0으로 해석하지 않는다.

legacy·traits v1에는 아홉 축 기회와 coverage를 `movementOpportunities`의 설명용 통계로 추가하고 기존 판정은 보존한다. traits v2의 새 옵션은 같은 연속 경로 근거를 주 경로 지표에 사용한다. 다른 축의 어려움·반복 선택 정의는 바꾸지 않으므로, 수락된 방향 입력의 막힘이 자동으로 지속·도움 요청 기회를 만들지는 않는다. 옵션이 없는 기준선은 기존 정적 메뉴 근거로 읽고 이 정의 차이를 비교 보고서에 표시한다.

## 성향 카탈로그 v2 — 첫 플레이의 네 성향

새 traits run의 기본은 [카탈로그 `persona-traits-v2`](../../market-simulator/validation/persona-traits-v2.json)의 아홉 축이다. 기존 다섯 축에 첫 플레이 성향 네 축을 더한다. [새 명세](../../market-simulator/validation/persona-trait-validation-spec-v2.json)는 명세 `version:3`, `analysisVersion:2`이며, run manifest의 `version:3`이나 legacy 검증의 v2와는 별개의 버전이다. 아래의 기존 다섯 축 설명과 답안 예시는 **카탈로그 v1 기록**으로 보존하며, 현재 기본값·새 축에는 이 절을 적용한다.

새 traits run은 [명세 v3](../../market-simulator/validation/persona-trait-validation-spec-v3.json)을 쓴다. 주 판정은 이 절의 v2 규칙과 같고, 추가된 기준 프로필 비교와 앞뒤 성향 유지는 아래 [명세 v3 절](#명세-v3--기준-프로필과-앞뒤-성향-유지-설명-지표)에서 설명한다.

`prepare_persona_validation`에 `validationMode:"traits"`, `catalogSchemaVersion:"persona-traits-v2"`를 명시할 수 있다. 사용자 정의 `profiles[]`의 `schemaVersion`도 같은 값을 사용한다. 혼합 버전은 거절한다. `catalogSchemaVersion:"persona-traits-v1"`을 명시하면 [기존 카탈로그](../../market-simulator/validation/persona-traits.json)와 기존 명세를 사용한다. 저장 프로필과 manifest의 schemaVersion으로 카탈로그·필수 축·블라인드 답안 수를 선택하며, 과거 v1의 프로필 `traits-2-…` 해시·명세 hash·manifest·측정·보고서를 새 버전으로 다시 쓰지 않는다.

v2의 `personaIds` 경로도 traits 검증 scope 안에서 아래 매핑의 지침을 실제 배우 입력에 넣는다. 원본 인물 JSON·prompt, 일반 생성과 `validationMode:"legacy"`, `WHOLE_*_INTERPRETATION`은 바꾸지 않는다. `parameters`, `attention`, cognition의 `labelConfusion`, 성향과 분리된 `contextHash`도 바꾸지 않는다. 사용자 정의 프로필은 같은 `basePersonaId`에서 한 축만 달리하여 개인차를 표현한다.

| 인물 | `initialCaution` | `operationLearning` | `routeReliance` | `textCueLoad` |
| --- | --- | --- | --- | --- |
| 지민 (`mild-intellectual-disability-adult`) | high | high | high | high |
| 서연 (`careful-checker`) | medium | medium | medium | low |
| 민수 (`quick-decider`) | low | low | high | low |
| `neutral-adult-control` | medium | medium | medium | medium |

기존 다섯 축의 인물별 값은 v1 그대로다. 다섯 preset은 기존 다섯 축을 유지하고 새 네 축을 모두 `medium`으로 채운다. preset 없는 사용자 정의 프로필도 아홉 축의 `medium`에서 시작한다. `basePersonaId`만 지정하는 것은 해당 인물의 모든 성향 매핑을 복사하는 요청이 아니다. 원하는 성향은 `traits`에 명시한다. 원본 지민과 같은 성향 묶음을 기준으로 한 축만 바꾸려면 아래 README 예시처럼 나머지 축도 동일하게 명시한다.

### 기회와 관찰 행동

| 축 / 지표 | 기회와 분모 | 분자와 판정 근거 |
| --- | --- | --- |
| 초반 신중함 / `initialCautionCount` | 배우 행동이 있는 first-play trace당 시작 구간 1건. 첫 `open` 또는 `add` 직전까지이며, 둘 다 없으면 기록된 초기 행동 구간을 사용한다. 빈 trace는 기회 없음이다. | 구간 안의 실제 `lookAround`, `pause`, `readList`, `viewHelp` 선택 수. 따라서 값은 비율이 아니라 행동 수다. |
| 조작 익히기 / `operationLearningRate` | `open`, `browse`, `add`, `viewCart`, `checkout` 각 조작 종류의 첫 사용. 두 번째 이후 사용은 제외한다. | 첫 사용 직전 한두 행동 중 도움말·관찰·잠시 살핌을 선택한 첫 사용 건수 / 첫 사용 기회 수. |
| 익힌 동선 고수 / `routeRelianceRate` | 현재 `walk` 선택지에 이미 방문한 waypoint와 아직 방문하지 않은 waypoint가 모두 있는 경우. | 그중 방문한 waypoint 선택 건수 / 혼합 선택지 기회 수. |
| 글자 단서 부담 / `textCueLoadRate` | 목표 상품을 담을 때 같은 계열의 서로 다른 이름·규격 상품이 같은 화면에 동시에 표시된 경우. 관심 구매는 제외한다. | 담기 직전의 관찰 가능한 탐색·정보 확인·비교 반응 건수 / 동시 표시 목표 담기 기회 수. |

`actorState.activity:"orient"`, `"compare"`, `"check"`라는 표기나 `reason` 설명만으로 행동을 추가하지 않는다. 판단에는 `behavioralEvidence`만 쓰며 작성된 대기시간은 사용하지 않는다. `pause`는 선택한 행동으로만 세고 오래 기다린 정도를 점수로 삼지 않는다. `lookAround`는 현 위치를 살피는 선택이며 카메라 회전·새 영역 노출·실제 이해를 증명하지 않는다. 글자 단서 축은 혼동에 대응해 정보를 살피는 경향이며, 혼동 오류율을 다시 평가하지 않는다.

whole-trace의 `add`는 항상 성공한 드래그로 펼쳐진다. 드래그 실패나 조작 성공률·숙달 향상을 만들지 않고, 조작 익히기는 처음 사용하기 **전에 살핌을 선택하는 행동**으로 한정한다. 실제 방문은 기록된 걷기와 결과로 확인하며 배우가 작성한 기억을 방문 기록으로 대체하지 않는다. 동선 선택지는 저장 bundle의 현재 위치·navigation state 메뉴와 해당 행동 직전 관측의 보이는 anchors를 함께 확인한다. 필요한 메뉴나 관측이 없으면 경로를 추측하지 않고 `unexercised`와 이유를 남긴다. 글자 단서 역시 관측된 상품 `name`·`detail`과 동시 표시 여부가 필요하며, 카탈로그에 상품이 존재한다는 사실만으로 노출을 인정하지 않는다.

같은 행동을 성향 발현에 중복 사용하지 않는다. **기존 지표 → 초반 신중함 → 글자 단서 부담 → 조작 익히기** 순서로 이미 사용한 행동을 새 지표에서 제외한다. 기존 도움 활용은 어려움 뒤 도움, 숙고는 관련 후보 비교, 탐색은 관심 단서 반응이라는 정의를 유지한다. 초기 도움말을 첫 조작 준비에도 다시 세지 않으며, 기존 숙고 비교로 센 `browse`를 글자 단서 확인으로 다시 세지 않는다. 배우 선언에만 기대는 기존 지표와 겹쳐 새 축의 관찰 여부를 독립적으로 구분할 수 없는 경우에는 새 축 쪽 기회를 제외한다. 제외 후 기회가 없으면 값은 0이 아닌 `null`이다. 제외 근거와 step ID를 함께 읽는다.

### 비교·진단·블라인드

같은 `contextHash`이고 나머지 **여덟 축**이 같은 프로필만 비교한다. 같은 조건·seed에서 양쪽 모두 관찰 기회가 있는 쌍을 사용한다. 유효 쌍 8개 이상, 기대 방향(high > low), |Cliff’s delta| ≥ 0.33, 쌍 부트스트랩 95% CI가 0을 제외해야 지지한다. 일부 기회만 관찰됐으면 `partial`, 기회가 없으면 `unexercised`, 표본이 부족하면 `insufficient`, 한 축 대비가 없으면 `unmatched`로 구분한다. 기대 방향을 지지하는 경우 `supported`, 반대 방향을 지지하는 경우 `contradicted`다. 효과가 불분명한 결과를 통과로 바꾸지 않는다. 기존 축과 과거 run의 판정 기준은 바꾸지 않는다.

같은 인물·조건에서 기회가 있는 trace가 둘 이상인데 축 지표 값이 모두 같으면 `diagnosticWarnings`에 trace·seed·근거 step ID를 남긴다. 이 진단은 주 판정에 사용하지 않는다. 성장과 과장 상한은 검사하지 않는다. 앞뒤 성향 유지는 v3에서 설명 지표로만 보고하며 주 판정에 쓰지 않는다. 지침의 모든 수준에는 “충분히 분명해지면 멈춘다”, “실수를 강제하지 않는다”를 포함하며, 정해진 행동 횟수·실수·지연·포기를 요구하지 않는다.

`opportunityAudit`·readiness·보고서의 성향 표현과 커버리지에는 새 네 축을 포함한다. 구조적으로 갈림길이나 유사 상품 동시 표시가 불가능하면 경고를 남긴다. 검토한 현행 검증 snapshot과 [생성기](../../market-simulator/scripts/build-validation-snapshots.cjs)의 구조에는 131개 reachable waypoint, 125개 reachable branch와 우유 계열의 동시 표시가 있었으므로 생성기 옵션은 추가하지 않았다. 정적 구조 점검은 배우가 그곳에 도달했거나 HUD가 올바르게 표시됐음을 보장하지 않는다. HUD 결함이 있었던 과거 파일럿은 아래 결함 주석을 유지한다.

블라인드는 run 카탈로그에 따라 v1은 정확히 다섯 축, v2는 정확히 아홉 축의 `low / medium / high / unknown` 답안을 받는다. 새 `traitRubric`에는 네 축의 관찰 기준이 포함된다. 기존 익명화는 원관측의 상품 목록·이동 선택지를 판에 내보내지 않으므로, 동선·글자 단서 축은 판별 자료가 부족해 `unknown`일 수 있다. B판의 설명이나 작성된 시간으로 이를 보충하지 않는다. `unknown`을 제거해 정확도를 부풀리지 않으며, 블라인드 결과로 조건부 행동 지표의 주 판정을 대체하지 않는다.

### 연구 근거와 해석 한계

각 지침의 `[근거: …]`는 v2 카탈로그 `references`에 연결한다. 연구에서 관찰한 집단 차이와 개인차를 참고해 합성 경향을 설계했으며, 수준값이나 효과 크기 기준을 실제 사람 자료에서 추정하지 않았다.

| 근거 | 적용과 범위 |
| --- | --- |
| [Palmqvist, Danielsson & Jönsson, *Behavioural Patterns in a Computerized Training Program for Individuals with ID*](https://www.ida.liu.se/~arnjo82/papers/ecidd-18.pdf) | 지적장애 집단의 초기 분당 클릭 수가 낮았다는 관찰을 초반 신중함 설계에 참고한다. 클릭 속도를 대기시간 의무나 개인의 고정 성질로 옮기지 않는다. |
| [PLOS ONE 2022, 10.1371/journal.pone.0269793](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0269793) | 스스로 시작하지 못한 사례가 첫 블록에 집중된 결과를 첫 사용 지원 필요성의 근거로 참고한다. |
| [JARID 2023, 10.1111/jar.13139](https://pubmed.ncbi.nlm.nih.gov/37417242/) | 세 참여자의 요리 과제에 video prompting을 적용한 연구다. 촉구·지원의 간접 근거이며, 확인한 초록으로는 PLOS와 같은 첫 블록 결과를 확인할 수 없다. |
| [Standen·Brown·Cromby 등의 가상환경 연구](https://www.icdvrat.com/2000/P/2000_19.pdf), [2001 연구](https://doi.org/10.1111/1467-8535.00199), [JMIR Serious Games 2026 엑서게임 연구](https://pmc.ncbi.nlm.nih.gov/articles/PMC13476731/) | 가상환경 조작의 부담·지원 필요와 개인차를 참고한다. 현재 whole-trace에서는 조작 전 살핌만 측정한다. |
| [Mengue-Topio·Courbois 외 2011](https://doi.org/10.1016/j.ridd.2010.10.014), [2019 경로 연구](https://doi.org/10.1352/1944-7558-124.2.116) | 2011의 경로 학습·지름길 사용을 익힌 경로 의존 설계에 참고한다. 2019는 경로 묘사·랜드마크 지식의 간접 근거이며 지름길 발견 실패의 직접 근거로 쓰지 않는다. |
| [Harrysson, Svensk & Johansson 2004](https://doi.org/10.1111/j.0952-3383.2004.00344.x) | 글자 중심 탐색의 어려움을 정보 확인 반응 설계에 참고한다. 오류율이나 읽기 능력 점수로 해석하지 않는다. |

연구 근거로 설계한 첫 플레이 성향이 수준대로 행동에 나타나는지를 본 것이며, 실제 지적장애인과의 유사성을 입증하지 않는다. 집단 연구를 모든 개인에게 적용하지 않으며, 지민·서연·민수와 사용자 정의 변형의 차이는 합성 설계값이다. 이번 구현에서는 모델·provider·앱·백엔드를 호출하거나 파일럿을 생성하지 않았고, 실제 사람 데이터와 비교하지 않았다. 남은 작업은 **HUD 결함을 고친 snapshot, 새 runId, 조건별 seed 20개 이상**으로 별도 파일럿을 실행하는 것이다. 요청 예시는 [README의 v2 프로필 예시](../../market-simulator/docs/persona-validation.md#첫-플레이-성향-v2-프로필-요청-예시)를 따른다.

## 명세 v3 — 기준 프로필과 앞뒤 성향 유지 (설명 지표)

[명세 v3](../../market-simulator/validation/persona-trait-validation-spec-v3.json)은 명세 `version:4`, `analysisVersion:2`다. 성향 검증 명세의 세 번째 파일이며, legacy 검증의 명세 v3(`persona-validation-spec.json`)이나 run manifest의 `version:3`과는 별개다. 지표 정의·임계값·주 판정(유효 쌍 8, |delta| ≥ 0.33, 95% CI의 0 제외)과 블라인드 점수는 v2와 같다. 새 출력 `baselineComparison`과 `positionStability`는 모두 `descriptiveOnly:true`, `usedForPrimaryDecision:false`이며 findings의 status, 성향 판정(`supported`·`contradicted` 등), 블라인드 점수를 바꾸지 않는다. 기대 방향이나 통과·실패도 만들지 않는다.

**기존 run은 그대로 재현된다.** 저장된 manifest는 `specHash`로 자기 명세를 고르므로, v2 명세로 준비한 run은 다시 measure·report해도 v2로 측정된다. measurements·report에 `opportunityRows`, `positionStability`, `baselineComparison` 키가 생기지 않는다. 새 `prepare_persona_validation`만 v3을 기록한다. v3 run의 trace별 지표에는 `opportunityRows: [{ decisionIndex, hit, stepIds }]`가 붙는다. 기회 하나당 한 행이고 `hit`은 그 기회가 분자에 들어갔는지다. 비율이 아닌 지표(시간 합계, 행동 수, 목표 단위의 최종 장바구니 불일치)는 `null`이고, 시스템 완료 구간은 기회에서 빠진다.

### 기준 프로필 — `traitMode:"omitted"`

기준 프로필은 기본 인물의 맥락은 같고 성향 지침 문장만 없는 프로필이다. 같은 run의 `profiles`에 다음처럼 추가한다.

```json
{ "id": "neutral-baseline", "basePersonaId": "neutral-adult-control", "traitMode": "omitted" }
```

- `traitMode`는 `"omitted"`만 허용한다. `presetId`·`traits`와 함께 줄 수 없고, v1 카탈로그(`persona-traits-v1`)에서는 거절한다.
- 같은 `basePersonaId`의 성향 프로필과 `contextHash`·맥락·공통 지침이 같다. 프롬프트의 "## 공통 성향" 절, 설명의 성향 문장, `character.selectedTraits`(빈 배열)만 없고 `traits`는 `null`이다. 프로필 버전 hash는 전달 내용이 달라 자동으로 다르다.
- **`neutral-adult-control`과 다르다.** 대조 인물은 다섯 성향을 `medium`으로 명시한 성향 프로필이다. 기준 프로필은 수준 문장이 아예 없어 모델의 기본 경향을 본다. 위 예시처럼 `neutral-adult-control`을 기본 인물로 써도 결과는 `medium` 지침이 아닌 지침 없음의 결과다.
- 프롬프트의 제목·카탈로그 해석문·"성향은 …에 반영한다" 같은 공통 문장은 성향 프로필과 같게 남긴다. 두 프로필의 차이를 성향 줄로만 한정하기 위해서다.
- readiness의 `required`와 `missingSlots`(생성 요청 `prepareWholeTrace` 포함)에 들어간다. 대조군·`referenceControls`·성향 대비(`matchedContrasts`)·성향 수준별 `groups`에는 들어가지 않는다.
- 성향 수준이 없으므로 블라인드 묶음과 정답 키에서 제외한다. `prepare_blind_review` 응답과 보고서는 `excludedBaselineTraces`를 표시한다.
- **비용:** 기본 인물 하나당 조건 2 × seed 수만큼 trace가 더 필요하다. 권장 seed 20이면 40개다. 비교할 기본 인물마다 따로 만든다.

### 기준 프로필 대비 — `baselineComparison`

`baselineContrasts`는 기준 프로필마다 같은 `contextHash`의 성향 프로필을 짝짓는다. 각 짝·지표·조건마다 같은 seed의 성향 프로필 대 기준 프로필 Cliff's delta, 짝 부트스트랩 95% 구간, 유효 쌍·미발생·누락 수를 낸다. 대상 지표는 그 프로필의 `medium`이 아닌 축과, 그 프로필이 속한 성향 대비의 축이다. 기준 프로필이 없으면 `reason:"no-baseline-profile"`이다.

같은 성향의 낮음·높음 대비가 모두 있으면 명세 `baselineComparison.positionRule`대로 위치를 분류한다. "기준≈수준"은 그 delta의 95% 구간이 0을 포함한다는 뜻이다.

| 분류 | 정의 | 읽는 법 |
| --- | --- | --- |
| `high-only-shift` | 낮음≈기준, 높음 구간은 0 제외 | 지침 없는 기본값이 낮음 쪽에 있다 |
| `low-only-shift` | 높음≈기준, 낮음 구간은 0 제외 | 기본값이 높음 쪽에 있다 |
| `both-shift` | 두 구간 모두 0 제외, 낮음 delta < 0 < 높음 delta | 기본값이 낮음과 높음 사이에 있다 |
| `baseline-beyond-range` | 두 구간 모두 0 제외, 두 delta가 같은 부호 | 기본값이 설정한 두 수준의 범위 밖에 있다 |
| `indistinguishable` | 두 구간이 모두 0 포함, 또는 한쪽 유효 쌍이 `minValidPairs` 미만이거나 구간이 없음 | 위치를 말할 근거가 부족하다 |

한쪽 수준만 있는 성향은 분류 없이 delta만 보고한다. **해석 한계:** 기준 프로필은 성향 문장만 뺀 같은 맥락이다. 모델의 기본 경향을 보여줄 뿐 실제 사람의 평균이나 정상 범위가 아니다. 기본 인물이 지적장애 성인 설정(`mild-intellectual-disability-adult`)이어도 기준 프로필 결과를 지적장애 특성이나 실제 지적장애인의 행동 근거로 쓰지 않는다. 같은 기본값이 모델·정책 버전에 따라 달라질 수 있으므로 다른 생성 조건의 run끼리 위치 분류를 비교하지 않는다.

### 앞뒤 성향 유지 — `positionStability`

새 trace를 만들지 않고 저장된 trace의 `opportunityRows`로 계산한다.

- **분할 규칙** (`split:"opportunity-order-halves"`): 한 trace·지표의 기회를 `decisionIndex` 순서로 반씩 나눈다. 홀수면 가운데 기회를 앞쪽에 둔다(`oddMiddle:"early"`). 기회가 `minOpportunitiesPerTrace`(2)보다 적으면 `insufficient-opportunities`, `decisionIndex`가 없으면 `missing-decision-index`로 제외한다. 제외한 trace는 0으로 채우지 않고 이유를 남긴다. 시간 길이나 전체 결정 수가 아니라 기회 순서로 나눈다.
- **적용 지표** (`positionSplit:true`): `comparisonRate`, `postSelectionListRate`, `interestDetourRate`, `persistenceResponseRate`, `helpSeekingRate`, `operationLearningRate`, `routeRelianceRate`, `textCueLoadRate`. 한 trace에서 기회가 여러 번 생길 수 있는 지표들이다.
- **제외 지표** (`positionSplit:false`): `preCheckoutCartRate`(계산 직전 1회), `initialCautionCount`(시작 구간 1회의 행동 수), `newShelfDelayMs`(작성 시간 합계). 구조상 trace 앞이나 끝에 고정되어 앞뒤로 나눌 수 없다.
- `profileShift`: 프로필·조건·지표별 (뒤 비율 − 앞 비율)의 trace 평균·중앙값과 trace 재표집 구간이다.
- **`contrastAttenuation`이 핵심 출력이다.** 같은 seed의 높음·낮음 trace가 모두 분할될 때 앞 구간끼리, 뒤 구간끼리 Cliff's delta를 구한다. 약화 = |앞 delta| − |뒤 delta|이고 같은 seed 쌍을 함께 재표집한 구간을 붙인다. 한 프로필의 앞뒤 변화(`profileShift`)에는 과제 진행의 공통 효과가 그대로 섞인다. 반면 같은 seed·같은 과제 단계의 높음과 낮음을 비교하면 그 공통 효과가 상당 부분 상쇄되고, 성향 **대비**가 뒷부분에서도 유지되는지를 볼 수 있다.
- `baselineAdjusted`: 성향 프로필의 (뒤 − 앞)에서 같은 seed 기준 프로필의 (뒤 − 앞)을 뺀 평균과 seed 재표집 구간이다. 기준 프로필이 없으면 `null`과 `no-baseline-profile`이다.

**해석 한계:** 뒷부분은 남은 목표·상황이 달라 과제 단계 효과가 섞인다. 대비 약화(attenuation)만으로 성향 감쇠를 확정하지 않는다. 앞뒤 기회의 종류가 다를 수 있다. 예를 들어 조작 익히기의 앞쪽은 매대 열기·담기, 뒤쪽은 장바구니·계산이다. 기회가 적은 지표는 분할 가능한 trace가 적어 구간이 넓거나 비어 있다. 성장과 과장 상한은 검사하지 않는다.

### 근거와 범위

- 페르소나 없는 기준 조건은 [*The Behavioral Fabric of LLM-Powered GUI Agents: Human Values and Interaction Outcomes* (arXiv 2601.16356)](https://arxiv.org/abs/2601.16356)를 참고했다. 이 연구는 선호·가치 지침 없이 실행한 GUI 에이전트를 페르소나 프롬프트를 준 조건과 비교했다. 페르소나를 조건으로 온라인 쇼핑 행동을 시뮬레이션·평가하는 설계는 [OPeRA (arXiv 2506.05606)](https://arxiv.org/abs/2506.05606)를 참고했다.
- 앞뒤 유지는 [*LLM-Based Educational Simulation: Evaluating Temporal Student Persona Stability Across ADHD Profiles* (arXiv 2605.06307)](https://arxiv.org/abs/2605.06307)를 참고했다. 이 연구는 대화가 이어질 때 LLM 학생 페르소나의 행동이 표류하는지 보았다.
- **이 연구들의 수치를 기준값으로 쓰지 않았다.** 위치 분류 규칙, 최소 기회 2, 분할 방식은 이 저장소의 설계값이며 연구에서 추정한 효과 크기나 임계값이 아니다. 연구 대상(GUI 에이전트, 온라인 쇼핑 사용자, ADHD 학생 페르소나)과 이 시뮬레이터의 인물은 다르므로 결과를 직접 옮겨 해석하지 않는다.

## 공통 지표와 네 평가 축

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

## 성향 비교와 충분성 판정

자동 비교 쌍은 **`contextHash`가 같고 다섯 성향 중 정확히 하나만 다른** 인물 사이에서만 만든다. 높은 설정 수준 대비 낮은 설정 수준을 비교하므로 `high-low`뿐 아니라 `high-medium`, `medium-low`도 포함한다. 같은 조건·seed의 두 표본 모두 해당 기회를 경험해야 유효한 한 쌍이다. 위 예제는 확인 성향만 비교하며 다른 네 성향은 `unmatched`로 남는다. 여러 유형이나 기본 인물이 다른 집단의 `groups`는 `descriptiveOnly:true`인 설명적 집계다. 유형별 평균 차이를 단일 성향의 효과라고 주장하지 않는다.

명세의 설계 기준은 유효 쌍 8개 이상, 기대 방향과 일치하는 Cliff’s delta, |delta| ≥ 0.33, 부트스트랩 95% 구간의 0 제외다. Cliff’s delta 자체는 두 집단 전체 분포의 효과 크기이고, 부트스트랩은 같은 seed의 쌍을 함께 재표집한다. delta를 쌍별 차이의 효과 크기로 해석하지 않는다. 현재 인접 수준 비교에도 같은 0.33 기준을 적용하며, 이 기준은 실험적으로 보정하지 않은 설계값이다. 심리검사·임상 기준이 아니며 결과를 보고 유리하게 바꾸지 않는다.

성향의 주 판정은 `behavioralEvidence`만 사용한다. `authoredTiming`의 판정은 따로 보고하며, 대기시간 차이로 부족한 행동 근거를 보충해 통과시키지 않는다. 두 영역 모두 `exercisedComparisons / expectedComparisons`를 제공한다. 행동 비교 중 표본 부족이 하나라도 있으면 `insufficient`, 모두 기회 미발생이면 `unexercised`, 일부만 미발생이면 `partial`로 남긴다. 일부 관찰된 비교가 모두 pass여도 나머지 비교가 미발생이면 전체 `supported`를 주지 않는다. 비교 자체가 없는 성향은 `unmatched`이고, 모든 적용 행동 비교가 pass이면 `supported`, 모두 fail이면 `contradicted`, 그 밖의 혼합 근거는 `inconclusive`다.

8개 seed를 준비해도 기회에 도달하지 못하면 유효 쌍 8개가 되지 않는다. 조건부 지표와 함께 전체 목표 달성·포기·누락·기회 도달 여부를 읽어야 한다. 원본 정의·카탈로그·명세·snapshot이 바뀌면 새 runId로 시작한다.
