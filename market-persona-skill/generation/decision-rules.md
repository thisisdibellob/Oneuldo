# 결정 작성 규칙

작성 보조 모드에서 배우가 결정 하나를 쓸 때 지키는 형식 규칙이다. 필드별 의미와 지식·기억·목표 계약은 [후보 7 계약](candidate-contract.md)을 따른다.

`actorState`는 **이번 행동을 실행하기 직전**을 적는다. 직전 행동의 실제 결과(가장 최근 메뉴의 `currentObservation`)를 반영하고, 같은 결정의 `taskUpdate`로 바뀐 열린 목표 집합도 반영한다. 이번 행동으로 앞으로 보게 될 목록·상품·이동 결과를 앞당겨 쓰지 않는다. 작성 보조 모드에서는 `choiceRef.source`를 쓰지 않는다. 우체통·보조기가 실제 실행으로 추적한 source를 붙이며, 행동별 source 전이 표는 [레거시 문서](../legacy/whole-trace-one-shot.md#행동별-source-전이)에 있다.

목표 세부 사용(`memoryUses`)·목표 연결(`basis.goalId`)·첫 목록 읽기·`intent`와 `activity`의 허용값은 [후보 7 계약](candidate-contract.md)이 단일 기준이다. 아래 표는 자주 틀리는 형식만 모았다.

새 작성 안내의 `guidanceRevision:"declaration-preflight-v3"`은 `authoringVersion:"2"`의 검토 의미와 bundle 8/candidate 7을 유지하면서 작성 단계의 형식·목표 선언 사전검사를 안내한다. `syntax.decision`·`syntax.choiceRef`는 필수 필드를, `examples.completeProductDecisions`는 완전한 add/remove 한 결정의 형태를 제공한다. 예제의 수량 1과 기억 총수량 2는 일부러 다르며 기본값이 아니다. 배우가 실제로 선택한 수량·행동·종료를 기록한다. `taskUpdate`는 반드시 **actorState 안**에 두고 type/goalId만 넣는다. decision 최상위에 두거나 기억 field/mode/value를 섞으면 거절한다. **각 `basis.memoryUses` 항목에도 goalId가 필요**하며 상위 `basis.goalId`에서 상속하지 않는다. `syntax.repair.maxRepairs`는 실제 요청 예산과 같으며 0이면 수정 재제출이 허용되지 않는다.

| 상황 | 작성 규칙 |
| --- | --- |
| 목표 상태 변경 | `actorState.taskUpdate:[{type:"select",goalId:"실제 목표 ID"}]`처럼 actorState 안에 한 건도 배열로 쓴다. 같은 결정의 heldGoalIds는 이 변경을 적용한 열린 목표 집합이다. 변경이 없으면 생략하거나 `[]`를 쓴다. |
| 계산대 이용·제출 | `checkout/<계산대 ID>`(예: `checkout/checkout`)를 쓴다. 수락 뒤 계산대 화면의 메뉴에서, 그 계산대에 직원이 있고 제출을 선택했다면 `control/submit`을 쓴다. |
| 목표 완료·포기 | 이전 add 결과를 관찰한 뒤 complete를 선언하거나 목표를 abandon하면, 같은 결정의 heldGoalIds에서 그 목표를 뺀다. 완료·포기한 목표를 basis.goalId·focusedGoalId·memoryUses로 계속 참조하지 않는다. 다른 열린 목표는 유지하며 새 행동의 basis와 focus에 맞게 기록한다. |

완료한 목표 하나를 해제한다는 이유로 다른 pending 목표까지 비우지 않는다. 새 행동이 목표에 연결되지 않으면 허용된 intent와 `basis.goalId:null`, `memoryUses:[]`, null goal focus를 쓰고, 다른 열린 목표를 수행한다면 그 목표의 실제 상태를 선언한다. 기술 예제는 상태·형식의 예시이며 구매·확인·실수·관심·포기의 횟수나 행동 순서를 강제하지 않는다.

가이드 v2의 `selectObservedProduct` 예시는 실제 관찰한 상품을 열린 목표와 연결해 선택하는 경우의 focus·기억 선언이다. 실제로 다른 상품을 골랐다면 그 선택을 보존하고, 관심이나 목표 없는 탐색의 null goal focus도 유지한다. `interestWithPendingGoal`은 관심 상품에 주의가 옮겨가도 진행 중인 목표를 잃어버리지 않는 예시다. `completeAfterAdd`의 닫기는 `orient`/`explore`로 표현하며 모든 닫기에 같은 활동을 강제하는 규칙은 아니다. 닫기 자체를 확인으로 세거나 지연만으로 숙고를 나타내지 않는다. 같은 페이지에서 본 정보를 비교했는지는 별도의 행동 근거가 제한될 수 있으므로 선언과 독립 관찰을 구분한다.
