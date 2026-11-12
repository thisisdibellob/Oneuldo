# 후보 7 계약: 지식·기억·목표·화면별 선택

[전체 계획 절차](whole-trace.md)의 배우 결정 형식과 검증 규칙이다. 절차와 우체통·작성 보조 모드는 그 문서를 따른다.
배우는 이 문서를 읽지 않는다. 배우 입력에서는 `worldReference`·`choiceCatalog`가 제외되므로([배우 시작](whole-trace.md#실행-흐름) 2단계), 아래에서 두 키를 언급하는 문장은 감독이 bundle 원본과 검증 결과를 해석할 때의 의미다. 작성 보조 모드의 결정 형식은 [결정 작성 규칙](decision-rules.md)을, 한 번에 제출하는 방식의 `source` 포함 예시·이동 연결표·legacy 후보 6/5/4/3은 [레거시 문서](../legacy/whole-trace-one-shot.md#후보-7-전체-형식과-이동-연결표)를 본다.

## 세계 참고 자료와 인물의 지식

`bundleVersion:"8"`은 같은 Luna 문맥에 세계 참고와 인물 상태를 구분하고 현재 위치·화면별 `choiceCatalog`와 `initialChoiceFrame`을 제공한다. `worldReference`의 전체 지도·상품·재고·목표 및 미래 source/선택지는 향후 화면을 예상하는 참고이며 방문 전 인물이 발견한 사실이 아니다. 실제 행동은 현재 source의 선택지만 사용한다. `actorState.initialObservation`, `knowledge`, `experience`, `initialState`, `workingMemory`, `taskMemory`는 시작 화면·관찰 사실 원장·확인 경험·활동·초기 작업 기억·과제 상태를 제공한다. 화면에서 갈 수 있는 통로를 발견했다고 그 끝의 상품을 안다고 처리하지 않는다.

`persona.behavior`는 같은 프로필 JSON에서 만든다. `source:{personaId,version,promptHash}`는 개인 지침의 출처이고 `individualInstructions`는 상세 지침을 보존한다. `behavioralContext.goalMemoryCapacity`와 `timingBaseline:{reactionMedianMs,reactionSigma,walkSpeed}`는 목표 기억과 반응·보행의 합성 설계 기준이다. `cognition`은 관심 전환 뒤 세부 기억, 유사 상품 구분과 수량 추적에 연결하는 상황별 설정이며 `cognitionSourceHash`가 그 출처를 연결한다. 이 설정은 강제 오답 확률·집단 통계·임상 척도가 아니다. 원본 수치와 성격을 다시 정의하지 않고, 어려움의 횟수나 정답 장바구니를 요구하지 않는다. 원자료 전문은 JSON prompt에 보존하고 bundle에는 개인 지침을 추출해 전달한다.

- 목록의 구조화된 항목은 실제 `readList`가 수락된 다음 관찰에서 들어간다. 목록을 읽는 결정 직전에 그 행동으로 얻을 목표를 쓰지 않는다. 시작 안내문에 표시된 설명은 instruction 단서로 사용할 수 있지만 숨은 전체 목표의 구조화된 기억을 대신하지 않는다.
- 선반 이름·표지는 실제 보이는 범위에서, 상품명·가격·규격·재고는 표시된 선반 페이지에서만 획득한다. 다른 페이지·미개봉 매대의 내용은 모른다.
- 이동 후에는 새 화면에 표시되는 장소·상품·통로만 발견 기억에 더한다. 목록·장바구니·도움·직원 안내는 해당 화면에서 확인한 내용을 기록한다. 새 시각 단서가 없는 제자리 대기로 새로운 배치를 발견한 것으로 꾸미지 않는다.
- 익숙한 상품이나 확인 습관은 프로필의 시작 경험이다. 카레를 좋아한다는 설정만으로 현재 카레 매대의 위치·종류·재고를 알 수는 없다. 다른 배치의 과거 공간 기억을 새 배치 정답으로 옮기지 않는다.

인물의 지식을 실제로 이해·활용하는지와 입력에 기록돼 있는지는 구분한다. 기억·단서를 잘못 해석하거나 목표에서 관심을 돌리고 다시 확인하는 행동도 가능하다. 세계 참고 자료로 장바구니를 자동 교정하거나 방황·오답 횟수를 채우지 않는다. 지민·서연·민수의 몇 가지 인지·적응 특성과 일반적인 성인 취향·강점을 세션 전체에서 일관되게 유지한다.

이 구분은 역할 지시와 선언된 근거 검증이다. 작성 보조 모드의 배우 입력에서는 세계 참고 자료와 전체 선택지 목록을 빼지만([배우 시작](whole-trace.md#실행-흐름) 2단계), 이는 입력 범위를 줄인 것이지 모델이 숨은 정보를 전혀 참고하지 않았다는 강한 정보 차단 보장은 아니다. `reason`과 `actorState`는 허구의 행동과 상태를 공개용으로 짧게 요약하고 단계별 근거는 감사 데이터다. 사적인 사고 과정을 출력하거나 실제 사람의 생각·장애 특성·임상적 타당성을 측정한 것으로 설명하지 않는다.

## 관찰 원장과 작업 기억

`actorState.knowledge`는 무엇이 표시됐는지 증명하는 관찰 사실 원장이고 `actorState.workingMemory`는 인물이 현재 활용하는 이름·규격·필요 수량의 합성 상태다. 원장에 정확한 목표가 남아 있어도 현재 작업 기억이 정확하다는 뜻은 아니다. 후보가 작업 기억 snapshot을 직접 덮어쓰지 않는다. Node가 실제 전개된 관찰, 프로필 설정과 아래 선언으로 상태를 계산해 감사 자료에 남긴다.

매 결정의 `basis.memoryUses` 항목은 `{goalId,field,mode,value}`다. `field`는 `name`, `specification`, `requiredQuantity` 중 하나이고 `mode`는 `remembered`, `guess`, `current-display` 중 하나다. `value`는 필수이며 이름·규격에는 문자열, 필요 수량에는 1~99 정수를 쓴다. `remembered`는 코드가 계산한 clear 기억값과 일치해야 하고, `guess`는 uncertain 상태에서 사용한 믿는 값으로 정답과 비교해 교정하지 않는다. `current-display`는 현재 `readObjectives`의 표시값과 일치해야 한다. unavailable 필드는 실제 목록 읽기나 `selfRecall` 없이 사용할 수 없다. 목표 세부를 사용하지 않는 결정에도 배열 `[]`를 적는다.

첫 `readList` 결정은 `basis.goalId:null`, goal focus `null`, `memoryUses:[]`다. 다음 관찰에서 실제 읽은 목표를 `taskUpdate:[{type:"select",goalId:"ACTUAL_GOAL_ID"}]`로 선택하고 열린 목표와 같은 `heldGoalIds`를 유지한다. 예를 들어 실제 읽은 `objective-1`의 label이 `흰 우유`이고 이름 기억이 clear이면 목표를 위한 이동에 `basis.goalId:"objective-1"`와 `{"goalId":"objective-1","field":"name","mode":"remembered","value":"흰 우유"}`를 쓴다. 다른 label이나 불확실한 상태에 이 값을 복사하지 않는다. 목표에 연결된 판단은 focus가 null이어도 이름 사용을 선언한다. 실제 readList/viewCart/viewHelp는 unavailable 기억을 회복하기 위한 외부 확인이므로 이름 사용 없이 먼저 수행할 수 있다. 목표에 연결된 add/remove에는 `name`과 `requiredQuantity` 사용이 필요하며 선택 수량이 기억 수량과 같아야 하는 정답 검사는 하지 않는다. 재확인하는 목록 읽기에서 기존 pending 목표까지 비우지는 않는다.

선택적 `actorState.memoryUpdate`는 다음 patch들의 배열이다.

| type | 선언 필드 | 의미 |
| --- | --- | --- |
| `selfRecall` | `goalId`, `values:{name?,specification?,requiredQuantity?}` | 스스로 떠올린 값을 불확실한 belief로 기록 |
| `deactivate` | `goalId` | 작업 기억에서 내려놓음; v7의 열린 과제 종료를 대신하지 않음 |
| `uncertain` | `goalId`, `fields:[...]` | 지정한 목표 세부가 불확실함을 선언 |

`selfRecall`은 이전에 실제 읽은 현재 활성 목표에만 선언한다. v7에서 이전 목표를 다시 선택하려면 같은 결정의 select와 명시적 selfRecall을 함께 선언할 수 있으며 믿는 값은 uncertain이다. `deactivate`한 목표는 같은 결정의 `heldGoalIds`에서도 제외하지만 열린 목표를 삭제하려면 아래의 complete/abandon 전이가 먼저 필요하다. 내려놓은 목표 ID를 다시 활성화해도 보관된 목록값을 자동으로 복사하지 않는다.

자기회상으로 선언한 값은 관찰 원장과 일치하더라도 자동으로 clear 기억이 되지 않는다. 기존 `objective:<id>` 참조나 컴파일러가 붙인 read-goal proof도 잊힌 세부를 정확하게 복원하지 못한다. 실제 `readList` 다음 관찰에서 표시된 목록의 내용만 명확한 목록 기억의 출처가 된다. 장바구니 관찰은 담긴 상품·수량을 보여주며 필요한 목표 수량을 알려주지 않는다. 목표 규격은 표시된 목록 label이 주는 정보 범위로 한정하고 숨은 정답 상품의 규격을 추출하지 않는다. 별도 규격이 표시되지 않으면 `specification`은 unavailable일 수 있다.

코드가 계산한 활성 목표의 이름·필요 수량 또는 실제 표시된 규격이 uncertain/unavailable이면 그 목표를 `uncertainGoalIds`에 포함해야 한다. 추가로 느끼는 불확실성은 더 선언할 수 있지만 이 배열을 비워 계산된 부담을 지울 수는 없다.

새 `authoringGuide.workingMemory`는 이 계산의 행동 전 순서와 `remembered`/`guess`/`current-display` 차이를 정리한다. 열린 목표를 계속 들고 있는 것과 그 목표의 이름·수량을 또렷하게 기억하는 것은 다르다. 현재 focus가 null이거나 닫기·이동처럼 목표 세부를 쓰지 않는 행동이어도 열린 목표의 불확실성 선언은 필요하다. 직전 행동의 경과 시간과 이번 `delayMs`, 현재 관심·수량 맥락 등을 반영한 제안 상태를 기준으로 선언하며 직전 `uncertainGoalIds:[]`를 복사하지 않는다. 현재 선택한 readList의 결과는 다음 결정에만 반영된다. 이번 재검증의 수량 압력 0.607059 → 0.706822 사례는 기존 0.7 경계 통과를 설명하는 예이며, 기본 압력이나 특정 행동·지연·불확실성 횟수를 요구하는 규칙이 아니다. 보조기가 기억 배열을 채우거나 통과하도록 지연·행동·수량을 바꾸지 않는다.

프로필의 관심 전환·구분·수량 추적 설정은 현재 상황의 합성 부담을 연결한다. 오류·망각 횟수를 채우거나 확률만으로 오답을 강제하지 않는다. 틀린 수량을 기억하거나 선택했어도 실제 조작의 재고·수량 범위 안이면 그 오구매를 정답으로 교정하지 않는다. 기술적인 기억 사용/출처 위반과 구매 결과의 불일치를 구분한다.

오류 진단의 `workingMemory`·`taskMemory`는 수락한 prefix까지 commit된 상태다. 거절된 상태 제안은 `proposedWorkingMemory`·`proposedTaskMemory` 또는 repairContext의 `rejectedWorkingMemoryProposal`·`rejectedTaskMemoryProposal`로 따로 기록하며, 수락된 상태나 이어갈 초기 상태로 사용하지 않는다.

작성 보조 모드에서 엔진은 결정이 들어올 때마다 수락된 앞부분을 로컬에서 다시 실행해 기억의 출처와 일관성을 검사하고, 그 결과로 계산한 현재 화면(`currentObservation`)·선택지 메뉴와 참고용 계산값(`advisory`)을 배우에게 돌려준다. 참고값은 배우의 선언을 채우거나 고치지 않으며 기억·과제 상태 선언은 계속 배우가 한다. 마지막 제출 때 전체를 한 번 더 검증한다. 배우 입력에서 세계 참고 자료를 빼도 모델 내부 판단까지 입증하지는 않으므로, 감사 통과만으로 숨은 정보 영향이 없었다고 주장하지 않는다. 한 번에 제출하는 방식의 사후 검증 설명은 [레거시 문서](../legacy/whole-trace-one-shot.md)에 있다.

## 계속 수행 중인 목표

candidate 7의 `taskContract:"persistent-task-memory-v1"`는 순간 focus와 열린 과제 목표를 분리한다. `taskMemory.openGoalIds`는 선택·완료·포기 전이로 계산하며 `taskStateVersion:"persistent-task-v1"`로 기록한다. `heldGoalIds`는 열린 목표와 같은 집합이어야 하고 프로필 용량 안에 둔다. 관심·탐색·휴식으로 focus가 null이 되어도 열린 목표의 기억은 유지·감쇠한다. 모델이 held 배열을 비우거나 memoryUpdate.deactivate만 써서 pending 목표를 조용히 삭제할 수 없다.

선택적 `actorState.taskUpdate`는 `[{type:"select"|"complete"|"abandon",goalId}]`다. select는 현재 실제 `readObjectives`의 항목 또는 같은 결정에서 명시적으로 자기회상한 이전 목표에만 적용한다. 목록을 읽은 다음 관찰에 열린 목표가 없고 표시된 목표 중 명시적 완료 이력이 없는 목표가 있으면 실제 표시된 목표를 하나 이상 선택한다. 예외는 실제 checkout/submit/requestCashier/giveUp 행동이며 finish label만으로 선택을 건너뛰지 않는다. complete는 해당 목표에 연결된 이전 add가 실제로 수락되고 그 결과가 관찰된 뒤에 선언한다. 이는 인물이 선택을 마쳤다는 표시이지 상품·수량 정답 검증이 아니다. abandon은 구매 없이 목표를 명시적으로 포기하는 선택이며 그 사실을 남긴다. 미완료 목표를 가진 채 계산·제출·포기하는 것도 허용하며 정답 장바구니를 요구하지 않는다.

`taskMemory.completedGoalIds`는 수락된 `complete` 선언의 목표 ID만 보존한다. 표시된 모든 목표를 명시적으로 완료한 뒤 목록을 재확인하면, 목표를 다시 선택하지 않고 장바구니 확인이나 이동을 이어갈 수 있다. 완료 이력은 구매 정답 판정이나 작업 기억의 이름·수량 복원에 쓰지 않는다. 완료한 목표를 다시 select하면 이전 완료 이력을 해제하며, abandon은 완료로 간주하지 않는다. 아직 완료하지 않은 표시 목표가 있으면 기존 선택 규칙을 적용한다.

매 판단의 `basis.goalId`는 필수다. task/recover는 열린 목표 ID, check/help는 열린 목표 ID 또는 null, explore/interest/rest/finish는 null을 쓴다. 목표가 연결된 판단은 이름 memoryUse를 선언하되 실제 readList/viewCart/viewHelp는 외부 확인을 먼저 할 수 있다. 관심 이외의 add/remove는 goalId가 필요하고, 목표에 연결된 add/remove는 name·requiredQuantity 사용을 선언한다. goal focus가 있으면 basis.goalId와 같아야 한다. 도움말 닫기라도 recover로 선언했다면 목표 참조를 생략하지 않는다. 이 계약은 모델의 목표 선택과 잘못된 구매를 그대로 유지하며 행동 목적을 reason 문자열에서 추론하지 않는다. 과제·기억 상태는 행동이 수락된 뒤에만 commit한다.

선택적 방향 이동 옵션 v1/v2는 [방향 이동 옵션](movement-options.md)에 있다.

## 기본 후보 7과 화면별 선택

새 bundle은 `bundleVersion:"8"`, 기본 `candidateVersion:"7"`을 제공하며 `policyVersion:"whole-trace-v3"`는 유지한다. v7은 v6의 source-bound choice·focus·작업 기억에 계속 수행 중인 과제 계약을 더한다. `initialChoiceFrame`의 source와 available choices에서 시작하고 다음 결정에는 새 위치·화면에 맞는 frame을 사용한다. 전체 catalog와 미래 source는 참고이며 방문 전 지식이 아니다. 현재 source와 일치하는 선택만 실행할 수 있다.


`choiceRef.quantity`는 `add`와 `remove`에만 사용하며 현재 frame의 `quantityBounds` 안에서 1~99 정수를 명시한다. 수량 기본값은 없다. 구매/반환 수량은 필수다. 목표 수량과 다른 합법 수량도 그대로 실행·기록하며 자동으로 정답에 맞추지 않는다. 수량 누락은 실행 전 후보 전체에서 검사해 모든 누락 인덱스를 한 번에 반환한다. 생성기가 수량 기본값을 대신 넣지 않는다. 나머지 선택에는 `quantity`를 넣지 않는다. 조작 종류별 entry ID와 선택 참조는 `bundle.choiceCatalog` 및 `bundle.actionContract`에 있다. 위치별 이동은 그 위치의 현재 메뉴에서만 고르고, 매대 상품은 열린 페이지의 선택지에서만 고른다. `browse`는 현재 열린 매대의 0-based 페이지 선택이다. 도움·장바구니·선반 화면은 화면 상태가 맞는 source의 선택지를 사용하고, 이동 전에 기존 화면을 닫는다.

candidate 7과 legacy 6/5의 목표 참조는 상품 ID와 구분한다. 상품 `milk`를 요구하는 목표가 `objective-1`이면 `focusedGoalId`·`heldGoalIds`·`uncertainGoalIds`와 기억 선언의 `goalId`는 `objective-1`을 사용하고, 상품 집중은 `focusedProductId:"milk"`를 사용한다. 준비된 목표 ID에 없는 참조는 스키마 오류이며 실제 `readList` 전에 목표 ID를 활용할 수 없다. 검사기가 잘못된 ID를 대신 바꾸지 않는다.

`basis`는 candidate 7에서 `{intent,goalId,cueRefs?,memoryUses}`다. `intent`는 `explore`, `interest`, `task`, `check`, `recover`, `help`, `finish`, `rest` 중 하나이며, 아래 `actorState.activity`와 허용값이 다르므로 서로 복사하지 않는다. `intent`와 nullable goalId의 연결은 위 과제 계약을 따른다. `memoryUses`는 필수 배열이고 목표 세부를 사용하지 않으면 `[]`로 둔다. `cueRefs`는 선택 사항이며 실제 알려진 추가 참조를 최대 24개 적고 빈 배열도 허용한다. 선택 대상·control·실제 읽은 목표의 proof는 컴파일러가 파생하지만 이는 기억 사용 선언이나 정확한 회상으로 승격되지 않는다. 명시한 참조는 알려져 있어야 한다. `control:viewCart`와 `list`는 조작 표시이며 cart 내용이나 목표 세부를 알려주지 않는다. 도움 본문도 도움 화면을 실제 연 뒤에만 알려진다.

candidate 7의 **배우가 직접 작성한 `basis.cueRefs`에 `objective:<id>`가 있으면**, 현재 검증기는 이 ID 참조 자체를 목표 세부 사용으로 취급한다. 이미 읽은 목표라도 `basis.goalId:null`이면 `memoryUses:[]`와 함께 썼는지와 무관하게 `TASK_MEMORY`로 거절한다. 이 참조를 쓰는 목표 행동은 현재 열린 non-null goalId와 기존 intent·이름 기억 규칙을 충족해야 한다. 이는 53·56번 실패 당시와 같은 검사이며 허용 기준을 바꾸지 않았다.

비목표 탐색·확인을 의도했다면 열린 목표를 held에 유지하면서 `goalId:null`, `memoryUses:[]`, raw objective basis 참조가 없는 선언을 사용할 수 있다. 어떤 의도를 선택할지는 배우가 정한다. 검사 통과를 위해 근거를 자동 삭제하거나 다른 필드로 이동하지 않는다. `actorState.triggerCueRefs`는 실제 알려진 상태 변화 계기이고, 컴파일러가 파생한 objective proof는 관찰 출처 증명이다. 둘은 위 raw basis와 구분되지만 필수 memoryUses를 대신하거나 미관찰 목표·잊은 세부를 복원하지 못한다.

`actorState`는 행동 직전의 공개용 요약이다. candidate 7은 `{activity,task,heldGoalIds,uncertainGoalIds,focusedGoalId,focusedProductId,orientation,triggerCueRefs?,memoryUpdate?,taskUpdate?}`를 받는다. focus는 기억의 정확성이나 구매 결과와 별개다. `focusedGoalId`는 이번 방문에서 읽고 `heldGoalIds`에 포함된 목표이거나 `null`이며 uncertain과 겹칠 수 있지만 uncertain에만 있는 목표는 허용되지 않는다. v7에서 non-null goal focus는 basis.goalId와 일치해야 한다. 첫 `readList` 전 goal focus는 `null`이다. `focusedProductId`는 실제 선반/cart에서 본 상품이거나 `null`이다. 목록을 읽기 전에 상품을 봤다면 product focus를 기록할 수 있다. `activity`는 `orient`, `shop`, `interest`, `recover`, `check`, `finish`, `rest`, `orientation`은 `unfamiliar`, `recognizing`, `familiar` 중 하나다. 비어 있지 않은 160자 이하의 `task`는 trace의 `currentTask`가 된다. 목표 배열은 실제 읽은 목표 ID만 사용하고 held는 열린 목표와 같은 집합으로 프로필 용량 이하를 유지한다. `triggerCueRefs`는 선택 사항이며 명시하면 실제 알려진 참조를 최대 12개 적는다. 생략 시 파생되는 실행 proof는 기억 갱신이나 회상 출처를 대신하지 않는다. `memoryUpdate`와 `taskUpdate`는 위 기억·과제 계약을 따른다. 이 상태는 허구의 행동 요약이며 내면 사고·임상 측정이 아니다.


상품·목표 focus는 실제 기억과 구분한다. 상품을 좋아하거나 관심을 보인다고 해서 목표가 바뀌지 않으며, 목표 focus와 구매가 다르다는 사실은 그대로 기록한다. 지식에 목표가 있어도 현재 주의가 다른 곳일 수 있다. 관심 구매를 정답으로 고치거나 mismatch를 제거하지 않는다. source와 실제 상품-목표 matcher는 행동 실행 뒤 audit에만 사용하며, 후보 작성이나 행동 선택을 교정하지 않는다. 실제 간편식품 표지 노출은 실제 카레 상품 페이지 노출과 별도 사건이다. 낯섦, 기억 부담, 관심 노출은 해당 행동과 상황의 coverage 단서이며 그 자체로 표현이 명확하거나 이해됐음을 보증하지 않는다.

개인 지침에 맞는 관심·휴식·도움·재방문·목표 재확인을 상황에 따라 선택한다. 횟수 quota를 채우지 않고, 최단 경로·최적 행동·완벽한 구매 목록을 자동으로 목표로 만들지 않는다. `reason`은 화면에 보인 단서와 관찰 가능한 짧은 행동 설명이다. 장애·연기 사실이나 사적인 사고 과정을 설명하지 않는다.


처음 알려진 참조와 내용은 `actorState.knowledge.cues`에서 확인한다. 이후 세계를 전개할 때 새로 표시된 단서만 지식에 더한다. 참조는 다음 namespace를 사용한다.

| 참조 | 획득 조건 |
| --- | --- |
| `anchor:<anchorId>`, `station:<stationId>` | 표시된 통로·장소; `walk` 근거는 W 번호가 아니라 해당 waypoint의 `anchorId` |
| `product:<productId>` | 실제로 표시된 선반 페이지의 상품 |
| `list`, `objective:<objectiveId>` | 목록 조작이 표시됨 / 목록을 실제 계획에서 읽음 |
| `shelf`, `shelf-page:<stationId>` | 열린 선반과 표시된 현재 페이지 |
| `cart`, `cart:product:<productId>` | 장바구니 화면·상품을 확인함 |
| `cashier:<checkoutId>` | 표시된 계산대 직원 상태 |
| `phase:<phase>`, `view:<view>`, `instruction:<phase>:<index>`, `support:<index>`, `result`, `error` | 그 시점에 표시된 단계·화면·안내·도움·결과·오류 |
| `persona:goal`, `persona:preference:<index>`, `persona:strategy:<index>`, `persona:trait:<index>`, `persona:strength:<index>`, `persona:familiar-category:<index>`, `persona:familiar-product:<index>` | 프로필에 실제로 존재하는 개인 경험·특성 |
| `prior:episode:<index>` | 검증된 이전 실행 경험; 현재 배치·목표·재고 지식으로 승격하지 않음 |

관찰한 참조를 기억해 쓰는 것은 가능하지만 현재 화면에 맞는 조작 가드는 별도로 통과해야 한다. 선택한 이동·매대·상품·목록·페이지·계산대 조작에는 그 대상 단서도 근거에 포함한다. 알려진 개인 취향 하나를 근거로 붙여서 미발견 상품이나 먼 매대의 조작을 허용받을 수는 없다. 그 시점에 없는 참조나 행동 대상과 맞지 않는 참조는 거절된다.


`reason`은 눈에 띈 표시, 익숙한 상품, 이미 한 확인, 목표를 다시 확인하는 계기처럼 짧은 행동 설명이다. 장애·연기 사실, 유아적 말투, 실제 내면의 사고를 측정했다는 표현을 넣지 않는다. 이유 문구만으로 상황을 실제로 이해하거나 기억·학습했다고 판정하지 않는다.
