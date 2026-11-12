# 작성 보조 모드 응답 해석

`begin_whole_trace_authoring`·`append_whole_trace_decision`·`whole_trace_authoring_menu`가 돌려주는 메뉴·관찰·참고 계산값·거절 응답과 재작성 기록을 해석하는 방법이다. 실행 순서는 [시작 문서](whole-trace.md)를 따른다.

메뉴의 `choiceIds`, `allowedWaypointIds`, `visibleWalkChoices`는 현재 source에서 허용되는 선택지다. W 번호의 순서·역방향 방문·전역 catalog만으로 현재 이동을 추정하지 않는다. 중간 경로를 자동 삽입하지 않으며 매대·도움말·장바구니가 열렸으면 해당 화면의 메뉴를 따른다.

`presentationRevision:"current-choice-menu-v1"` 메뉴는 `interactionContext:{kind,stationId,label}`로 현재 메뉴를 설명하고, `availableChoices:[{choiceId,label}]`로 기존 행동 이름을 표시한다. 허용 ID와 순서는 `choiceIds`와 정확히 같으며 선택을 추천하거나 정렬하지 않는다. `view:"world"`여도 `activeStation:"fresh"`이면 매대가 열린 상태다. 매 결정 작성 전에 **가장 최근 메뉴**의 화면 설명과 허용 목록을 확인한다. 전역 catalog에 `control/readList`가 있어도 현재 `choiceIds`에 없으면 작성하지 않는다. `activeStation:null`만으로 허용 여부를 추론하지 않으며 장바구니·도움말·직원·계산대에서도 기존 메뉴가 판단 기준이다. 화면 설명은 기존 메뉴 분기에서 함께 산출하며 별도 허용 규칙을 만들지 않는다.

이전 anchor 실행 작성 메뉴는 `currentObservation:{kind:"validated-prefix-observation-v3",acceptedDecisionCount,notice,observation,readObjectives?}`를 제공한다. `observation`은 `acceptedDecisionCount`개의 수락 결정을 기존 검증기로 실행한 뒤 공용 `observeActor()`가 반환한 **현재 화면 관찰 그대로**이며 실제 앱 재생 결과를 뜻하지 않는다. 보이는 매대 표지의 방향·거리·near, 현재 상품 페이지, 도움말 등 표시된 단서를 전달한다. `near:false`인 매대는 표지가 보여도 아직 열 수 없으며 실제 행동은 기존 `choiceIds`에서 고른다. 지도·추천 경로·미관찰 상품·목표를 보충하지 않고 선택지 집합과 순서도 바꾸지 않는다. 과거 v1은 목록만 전달했고 명시적 directional-v2는 기존 관찰 v2 계약을 유지한다. 관찰 전달 변경을 행동 성공률 개선의 증거로 해석하지 않는다.

새 독립 anchor 요청은 `observationVersion:"anchor-visible-structures-v1"`과 `validated-prefix-observation-v4`를 기록한다. 실제 그림 일부가 보이지만 이름표는 읽을 수 없는 진열대는 `visibleStructures`에 `kind:"shelf"`, 일반 라벨, 현재 방향·거리만 표시한다. 화면/HUD에 가린 몸체는 제외하며 카테고리·상품·station ID·좌표·추천 경로는 제공하지 않는다. 이 단서는 현재 관찰에서만 유효하고 다음 관찰에서 사라지면 기억 원장에도 남기지 않는다. 몸체가 보인다는 사실이 매대 열기 가능을 뜻하지 않으며 기존 near 조건·행동 집합을 유지한다. 계약은 inputHash·trace generation·knowledge audit에 연결된다. marker 없는 저장 bundle/trace와 기존 directional·학습 trial은 원래 관찰을 유지한다.

`current-choice-menu-v2`는 같은 메뉴의 `visibleWalkChoices`에 이미 있던 현재 통로 라벨·방향·거리를 `availableChoices`의 해당 이동 ID 옆에도 표시한다. 새로운 장소 정보·추천·좌표를 추가하지 않고 ID·순서·비이동 선택지·행동·시간·종료를 바꾸지 않는다. 저장된 v1 또는 marker 없는 bundle의 메뉴는 기존 표현을 유지한다. 두 표현 수정의 성능 효과는 새 독립 수집으로 확인하며 과거 trace를 재작성하거나 결과가 나올 때까지 반복하지 않는다.


최상위 `readObjectives`는 `observation.readObjectives`의 호환 별칭이다. ID·이름·수량·match는 그 관찰에 있는 값만 그대로 복사한다. 행동을 아직 실행하기 전인 `readList` 선언에는 그 결과를 미리 제공하지 않으며, 수락된 `readList` 다음 한 관찰에만 표시한다. 다음 행동이 수락되면 기존 관찰 수명대로 갱신한다. 다시 읽기를 수락한 경우에는 새 목록 관찰을 제공한다.

`readObjectives` 필드가 없으면 **현재 미표시**이며 한 번도 읽지 않았거나 잊었다고 판정한 것이 아니다. 필드가 있고 `[]`이면 **표시된 빈 목록**이다. 메뉴 재조회·`nextDecision` 활동/지연 미리보기·거절된 제출은 목록 관찰을 소비하거나 새로 만들지 않는다. 과거 메뉴에 목록이 있었다는 이유로 현재 `current-display`에 계속 쓰지 않는다. 보조기는 `worldReference`·과거 목록·지식 원장으로 현재 표시값을 보충하지 않는다. 실행하지 않는 하위 source 보조기에는 이 관찰을 붙이지 않는다.

함께 반환되는 `advisory`는 **참고용 계산값**이다. `goalFields`는 목표별·필드별 `pressure`(감쇠 후 소수 6자리 반올림)와 `clear/uncertain/unavailable`, `observedProductIds`는 지금까지 실제로 관찰한 상품, `openGoalIds`는 현재 열린 목표를 표시한다. 이번에 매대를 열거나 페이지를 넘긴 결과로 새로 보게 될 상품은 그 행동 전 목록에 없다. 기본 압력 계산은 현재 관찰까지의 경과 시간과 직전 활동, 추가 `delayMs:0`을 사용하며 `assumptions`에 표시한다. 다음 행동의 정확한 시간·활동 조건을 확인하려면 `whole_trace_authoring_menu`에 자신이 작성한 `nextDecision:{actorState:{activity:"..."},delayMs:...}`를 함께 전달한다. 이 참고 계산은 새 `taskUpdate`·`memoryUpdate` 이전의 유지된 목표 기준이다. 완전한 선언과 그 변경은 append에서 기존 순서대로 검사한다.

| 빈 배열 | 뜻 |
|---|---|
| `advisory.goalFields:[]` | 계산할 활성 작업기억 필드가 없음 |
| `advisory.openGoalIds:[]` | 현재 수행 중인 열린 목표가 없음 |
| `advisory.observedProductIds:[]` | 지금까지 실제 관찰한 상품이 없음 |

이 배열들은 표시된 장보기 목록이 아니다. 첫 목록 읽기 후 아직 목표를 선택하지 않았다면 **현재 목록 2개 / 열린 목표 0개 / 활성 기억 필드 0개** 같은 상태가 정상적으로 가능하다. 빈 `advisory`만으로 목록 정보 부재나 작성 실패를 판단하지 않는다. 최신 `currentObservation.readObjectives`와 기존 과제 계약에 따라 AI가 선택할 목표와 `taskUpdate`, `heldGoalIds`, `uncertainGoalIds`, focus, `memoryUses`를 직접 작성한다. 목록의 모든 항목을 자동으로 선택하거나 예제의 배열을 그대로 채우지 않는다. 목록 읽기 직후의 기존 선택 조건·완료 이력·종료 예외는 그대로 유지한다.

보조기가 선언을 채우지 않는다는 원칙은 [후보 7 계약](candidate-contract.md#관찰-원장과-작업-기억)이 기준이며, 활동·지연·기억 업데이트를 바꾸어 거절을 회피하라는 권고도 하지 않는다. `sourceAuthoring.taskDeclarationExamples`와 `workingMemory` 안내의 조건을 확인하고, 예제의 빈 배열이나 값으로 다른 열린 목표와 실제 불확실성을 덮어쓰지 않는다.

거절 응답은 `accepted:false`, `decisionIndex`(0부터), `decisionNumber`(1부터), `issues`의 `path/rule/message/evidence`, `canRetry`, 거절 전 메뉴를 포함한다. 입력·수락된 접두 구간·실행 상태는 바뀌지 않는다. AI는 사유를 보고 **같은 결정만** 다시 제출한다. 같은 요청 안의 기술 수정이며 구매 결과 최적화·자동 대체·새 표본 재생성이 아니다. 기본은 첫 시도 + 최대 3회 재작성이고 `begin_whole_trace_authoring.maxRewritesPerDecision`으로 설정한다. 마지막 허용 시도도 거절되면 요청이 실패로 끝나며 상한을 다시 초기화하지 않는다. 최종 제출 뒤의 `maxRepairs:0|1` 및 `repair_whole_trace`의 정확한 prefix·원래 종료 의도 보존 규칙은 별도로 그대로 유지한다.

거절 응답의 `rewrite`는 `status`, `decisionIndex`, `decisionNumber`, `acceptedDecisionCount`, `remainingRewrites`, `message`를 제공한다. `status:"awaiting-rewrite"`와 `canRetry:true`는 **같은 결정의 재작성 대기**이며 전체 요청 실패가 아니다. 예를 들어 20개 결정이 수락된 뒤 21번의 첫 시도가 거절되면 기본 상한에서는 앞의 20개를 유지한 채 남은 재작성 3회를 표시한다. 작성자는 원래 의도와 수락된 앞부분을 보존하면서 기술 오류를 수정하고 같은 요청·결정에 새 operationId로 제출한다. `status:"exhausted"`, `canRetry:false`, `remainingRewrites:0`이면 기존 규칙대로 요청이 실패로 끝난다.

`rewriteContract:"terminal-intent-preserved-v1"`은 결정별 **최초 초안**의 구체적인 선택을 `nonterminal`·`submit`·`giveUp`으로 기록한다. 재작성으로 종료를 도입·교체·제거하면 `AUTHORING_REWRITE_CHANGED_ENDING`으로 거절하고 같은 재작성 예산을 사용한다. 예를 들어 `basis.intent:"finish"`가 같아도 거절된 이동을 `control/giveUp`으로 바꿀 수 없다. 최초 `choiceId`가 없거나 알 수 없는 값이면 종료 의도가 확인되지 않은 것이므로 재작성으로 종료를 새로 도입할 수 없다. 미해결 결정은 `finish`나 직접 `submit`으로 건너뛰지 못한다. 올바른 이동 참조나 필요한 비종료 패널 닫기를 배우가 기술 수정으로 작성할 수 있고, 수락된 뒤 **다음 새 결정**의 자발적인 종료는 계속 허용한다. 이 검사는 종료 성격을 보존하는 구조적 보호이며 자연어 의도 전체를 판정하거나 의미 보존을 입증하지 않는다. 행동·상품·수량을 원래 의도대로 유지하는 작성 규칙은 별도로 계속 적용한다.

“보조기가 행동을 자동으로 대체·삽입하지 않는다”는 원칙과 “AI가 허용된 기술적 재작성을 할 수 있다”는 절차를 구분한다. 보조기는 현재 메뉴와 거절 사유를 보여주며 닫기·읽기 같은 후속 행동이나 그 상태를 대신 작성하지 않는다. 잘못된 선택을 고친다는 이유로 구매 목표·수량·종료를 통과 목적으로 재계획하지 않는다. 목록 읽기를 계속하려고 AI가 닫기 행동을 직접 작성한 경우에도, 그 행동이 수락된 **다음 메뉴**에서 목록 읽기 가능 여부를 다시 확인하고 새 결정을 직접 작성한다. 재작성 예산이 남은 상태에서 작성자가 중단했다면 그 중단 사유를 기록하고, 검증기의 강제 종료나 상한 소진과 구분한다.

각 결정의 `firstAttemptPassed`, `attempts`, `rewriteCount`, `rejectedRules`와 전체 `firstAttemptAccuracy`는 응답의 `authoring`, 최종 결과/metrics, 요청 진단 디렉터리의 `authoring.jsonl`에 남는다. 독립 호스트 저널에도 요약을 기록한다. 통신 응답을 잃은 재전송에는 같은 `operationId`·같은 입력을 사용하며, AI가 고쳐 쓴 결정에는 새 operationId를 사용한다. 첫 시도 정확도와 재작성 후 수락률을 구분하고, 이 횟수를 실제 모델 호출 수로 설명하지 않는다.

기존 동기식 `createWholeTraceSourceAuthoringCursor(bundle)`는 저장된 source·선택지·목표 선언만 확인하는 하위 보조기로 유지한다. 이 하위 보조기 자체가 재작성 예산을 부여하지 않는다는 안내는 실행 작성 경로의 이미 설정된 재작성 예산을 취소한다는 뜻이 아니다. 새 비동기 `createWholeTraceExecutionAuthoringCursor(settings,bundle,options)`가 이를 사용하고 접두 실행 검증·참고 메뉴·재작성 기록을 더한다. 기존 후보·bundle·파일럿 측정은 수정하지 않고 작성 revision/보조기 사용 여부를 별도 출처로 기록한다. 모든 최종 검증 규칙·임계값·계약 의미와 전체 후보 제출 검증은 유지한다.
