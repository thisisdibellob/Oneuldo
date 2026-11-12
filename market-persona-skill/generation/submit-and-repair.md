# 제출·수정·실패 처리

작성 보조 모드의 마지막 단계(`finish_and_submit_whole_trace` → 내부 `finish_whole_trace_authoring` → `submit_whole_trace`) 이후의 제출·repair·컴파일·종료 규칙이다. 배열 전체를 한 번에 작성해 제출하던 예전 방식은 [레거시 문서](../legacy/whole-trace-one-shot.md)에 있으며, 아래 규칙은 그 방식의 제출에도 같다.

## repair (기술 수정 재제출)

파일 제출은 `submit_whole_trace({requestId,candidateFilePath})`로 한다. `maxRepairs:1`을 요청한 실행에서 실패 결과에 포함된 `repairContext`를 받았으면, 서버가 수락한 prefix 뒤의 결정만 담아 한 번 수정할 수 있다.

```json
{"tool":"repair_whole_trace","arguments":{"requestId":"RETURNED_REQUEST_ID","repair":{"decisions":[{"choiceRef":{"source":{"location":"CURRENT_LOCATION","navigationStateId":"CURRENT_NAVIGATION_STATE","phase":"shopping","view":"world","activeStation":null,"pageIndex":null},"choiceId":"CURRENT_AVAILABLE_CHOICE_ID"},"delayMs":2100,"reason":"기존 목표를 위한 다음 이동 참조를 고친다.","basis":{"intent":"task","goalId":"CURRENT_OPEN_GOAL_ID","memoryUses":[{"goalId":"CURRENT_OPEN_GOAL_ID","field":"name","mode":"remembered","value":"CURRENT_CLEAR_GOAL_NAME"}]},"actorState":{"activity":"orient","task":"현재 목표를 위한 통로 이동","heldGoalIds":["CURRENT_OPEN_GOAL_ID"],"uncertainGoalIds":[],"focusedGoalId":null,"focusedProductId":null,"orientation":"recognizing"}}]}}}
```

위 수정 예시는 필드 형태만 설명하며 열린 목표 하나와 clear 이름 기억을 전제로 한다. 실제 repair는 수락된 열린 목표·기억 상태와 원래 행동·종료 의도를 유지하고 진단에 맞는 기술 문제만 고친다. 여러 열린 목표나 uncertain/unavailable 상태를 이 예시의 값으로 덮어쓰지 않는다. `repair`에는 `decisions` 배열만 쓰고, 실패한 위치 이후의 suffix와 각 결정의 source를 실제 `repairContext`·원본 후보에 맞춘다. 서버가 준비된 요청에서 `repairVersion`, `requestId`, `baseAttempt`, `fromDecisionIndex`, `candidateVersion`을 채운다. `repairFilePath`에는 같은 `{ "decisions": [...] }` 객체를 저장한다. 기존 전체 wrapper나 일부 필드를 적은 요청도 지원하지만, 명시한 값이 현재 요청과 다르면 거절한다. 동일한 수정안을 재전송하면 저장된 결과를 반환하며 수정 예산은 늘어나지 않는다. 전달 형식 오류로 도구가 예외를 반환하면 호스트는 요청 상태를 확인해 실제 후보 거부와 구분한다. 이 처리는 기존 수정 제출 안에서 끝나며 행동마다 모델을 호출하지 않는다. `repair-whole` CLI 별칭은 같은 요청을 보유한 persistent MCP/`interactive` 프로세스 또는 독립 호스트의 `host-call`에서 동작한다.

## 상태 확인과 여러 요청

진행이나 저장 결과를 다시 확인할 때 `whole_trace_status({requestId})`를 사용한다. 동기 제출이 완료된 뒤 행동마다 이 도구를 호출할 필요는 없다. `begin_actor_plan`/`observe_actor_plan`/`append_actor_plan`을 이 경로에 섞지 않는다.

호스트 MCP/interactive 또는 독립 호스트 프로세스는 여러 요청을 관리할 수 있다. 새 문맥 규칙은 후보를 작성하는 actor에 적용하며 서버가 세션 분리나 다른 bundle의 미열람을 강제·입증하지는 않는다. `requestId`·`inputHash`는 출처 연결용이고 후보에 스키마 밖의 필드를 추가하지 않는다. 가이드 v2는 조건부 성향 표현과 실제 활동·focus 선언을 안내하지만 행동 선택을 대신하거나 구매 결과·통과 기준을 교정하지 않는다. 지침 변경 자체는 충실도 개선의 증거가 아니며, 저장된 v1 가이드와 기존 검토 의미를 유지한다.

## 최종화와 계산대 참조 별칭

최종화는 작성 중인 접두 구간의 유효성을 시험하는 호출이 아니다. `finalizationContract:"incomplete-finalization-fails-request-v1"`에서 이미 작성된 종료 행동 또는 기존 100행동 상한 없이 `finish`를 호출하면 `AUTHORING_INCOMPLETE_FINALIZATION`으로 요청이 실패 상태에 고정된다. 수락된 원본은 `authoring-finalization.failure.json`에 보존하며 이후 append·begin·submit·repair로 새 종료를 붙이지 못한다. 독립 owner는 실패 응답과 상태를 저장한 뒤 닫고 readiness는 기술 실패로 센다. pending 결정의 `AUTHORING_REWRITE_PENDING`은 별도 상태로서 기존 한도 안의 같은 결정 기술 수정이 가능하다. 작성 중 자연스럽게 선택한 종료에는 최소 행동·구매 수를 요구하지 않는다.

새로 준비한 `choiceCatalog.referenceAliases`는 `{aliasChoiceId,canonicalChoiceId,kind:"checkout-open-v1"}` 배열로 허용 별칭을 명시한다. 계산대 ID가 `checkout`이면 `open/checkout`을 `checkout/checkout`에 연결하는 항목이다. 작성할 때는 정식 `checkout/<계산대 ID>`를 사용한다. 컴파일러는 명시된 별칭에 한해 source가 현재 상태와 정확히 같고, 대상이 실제로 같은 계산대이며, 정식 버튼이 현재 사용 가능할 때 로컬에서 참조를 해석한다. 다른 계산대나 경로를 고르거나 구매·수량·종료를 자동 수정하지 않는다. 멀리 있는 계산대, 잘못된 source, 사용할 수 없는 버튼은 계속 거절한다. 별칭 항목이 없는 저장된 bundle은 기존의 엄격한 ID 일치를 유지한다.

원본 후보는 그대로 보존한다. 감사 기록의 `choiceResolution.choiceRef`는 작성된 참조, `resolvedChoiceRef`는 실행한 참조이며, 별칭을 썼을 때만 `normalization:{kind,authoredChoiceId,canonicalChoiceId}`를 함께 기록한다. 행동 이유·대기 시간도 유지한다. 참조 해석은 제출 후 로컬 컴파일 단계에서 끝나므로 추가 AI 왕복이 없고, 전체 계획 1회와 허용된 최대 1회 기술 수정 절차를 유지한다.

## 컴파일·실패·종료

Node는 고정된 snapshot에서 후보를 처음부터 실행한다. 행동 직전 공용 `observeActor()`가 실제로 보여주는 단서만 지식 원장에 넣고 `basis`의 알려진 참조·대상 단서와 `actorState`의 알려진 목표·계기 단서를 검사한다. 인물의 지식에는 전체 지도·매대 목록·목표 정답이나 모델이 자체 작성한 발견 사실을 넣지 않는다. 가시성·패널·선반 페이지·재고도 확인하고 기존 `projectDecision`, `TraceGuard`, 게임 어댑터를 사용한다. 최종 trace도 기존 공용 구조/의미 검증을 통과해야 한다. 이동은 기존 보행 입력으로 변환하고 어댑터의 한 번에 32 이하인 이동 입력 상한을 유지하며 순간이동을 추가하지 않는다. 잘못된 이동 참조·미발견 근거·시점에 불가능한 행동을 대신 실행 가능한 정답 행동으로 바꾸지 않는다.

첫 의미 오류가 나면 실패 위치·직전 상태·적용된 앞부분을 진단으로 반환한다. 실패한 앞부분은 완성 trace나 실제 플레이 기억이 아니다. `maxRepairs:0`이면 추가 후보를 제출하지 않는다. `maxRepairs:1`이면 오류의 `repairContext`가 제공하는 `baseAttempt`, `fromDecisionIndex`, 최신 `before`·`choiceFrame`·지식에 맞춘 suffix를 `repair_whole_trace`로 한 번만 보낼 수 있다. 권장 repair payload는 `{ "decisions": [...] }`이며 서버가 요청·버전·수정 시작 위치를 채운다. 기존 전체 wrapper에 명시한 값도 같은 요청과 정확히 일치해야 한다. 서버는 수락한 정확한 prefix를 보존하고 suffix의 끝도 원래 후보의 종료 의도와 일치시킨다. 문제가 된 필드·단서·조작 참조만 기술적으로 바로잡고, 미관찰 근거·스키마·조작 오류를 자발적 포기로 대신 끝내지 않는다. 원래 후보가 `giveUp`으로 끝나지 않았는데 수정 후보에 새 `giveUp`을 넣으면 `REPAIR_CHANGED_ENDING`으로 거절한다. 성공/실패 목표를 바꾸거나 정답률·경로·구매 성공을 높이기 위한 최적화도 수정 대상이 아니다. 원본·수정본과 실제 제출 횟수를 보존한다. 최대 수정 횟수에 도달하면 실패로 보고하고 새 조건을 같은 표본인 것처럼 이어 붙이지 않는다. 실행 전 형식 검사에서 수량 등의 누락이 발견되면 모든 해당 인덱스를 함께 반환하며 아직 수락한 prefix는 없다. 이때 before·choiceFrame이 null이면 원래 bundle의 initialChoiceFrame을 출발 상태로 사용해 전체 suffix를 수정한다.

100회 전에 배열이 끝나면 `submit`이나 `giveUp`으로 자연스럽게 종료돼야 한다. 이 두 행동 이후 단계는 기존 생성기가 붙이므로 후보에 `awaitReviewAccepted`, `skipRating`, `leave`를 직접 넣지 않는다. `submit`은 분석 요청 **접수 대기 후 나가기**, `giveUp`은 기존 포기 흐름이다. 포기를 오류 복구나 강제 종료 대신 삽입하지 않는다.

100번째까지 종료하지 않은 경우에만 기존 시스템 계산을 붙인다. 당시 장바구니를 유지하고 계산대 이동·필요한 직원 호출·제출·접수 대기·나가기를 수행한다. 구매 목록에 맞춰 상품을 넣거나 빼지 않는다. 시스템 구간은 `generation.systemCompletion`으로 구분하고 개인의 독립 완수/성장으로 집계하지 않는다. 앱 실행·DB 수신을 확인한 뒤에도 개인 기억에는 시스템 구간 이전의 경험만 저장한다.
