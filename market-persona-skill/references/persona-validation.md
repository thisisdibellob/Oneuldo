# 페르소나 충실도 검증 절차

기본 검증은 공통 행동 성향을 사용한다. 인물 이름에 고정된 정답 행동을 요구하지 않고, 같은 기본 맥락에서 성향 설정을 바꿨을 때 상황에 맞는 행동 차이가 나타나는지 살핀다. 각 인물은 성향·수행 기준·취향·경험의 조합이며, 유형과 `low / medium / high`는 합성 설계값이다. 심리검사 점수, 실제 성인의 평균, 지적장애 집단의 실측 행동이나 임상적 타당성을 뜻하지 않는다.

MCP 도구 6개를 사용한다. 권장 순서는 `prepare_persona_validation` → `check_persona_validation_readiness` → 부족 슬롯 생성 → readiness 재확인 → `measure_persona_validation` → 다중 `prepare_blind_review`/`submit_blind_review` → `persona_validation_report`다. 전체 trace 작성·제출은 준비와 측정 사이에서 별도로 한다. 검증 도구는 모델·provider·앱·백엔드를 호출하거나 trace를 수정·재생성하지 않으며, 일반 생성 경로에서 자동 실행되지 않는다. MCP 입력 객체는 interactive CLI에서 `{"tool":"도구명","arguments":입력객체}` 형식의 한 줄로 전달한다.

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
