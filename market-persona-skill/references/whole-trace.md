# Luna 전체 행동 계획

Luna가 전체 세계 참고 자료와 페르소나를 한 번 받아 종료까지의 행동 배열을 작성한다. 세계 참고 자료는 이동 후 화면과 행동 결과를 예상하는 데 쓰고, 인물의 선택 지식은 그 시점의 화면·관찰 사실·작업 기억·개인 특성으로 구분한다. Node는 제출된 배열을 실행하며 단서 출처와 선언한 기억 사용·변화를 검증하고 앱용 trace로 컴파일한다. 오프라인 작성 중에는 같은 실행 검증기로 각 접두 구간을 확인하고 다음 결정 메뉴에 참고용 계산값을 표시할 수 있다. 실제 앱 재생 중 다시 계획하거나 행동마다 새 모델을 호출하지 않으며, 코드가 행동을 대신 선택하지 않는다. 생성에는 학교 Qwen 서버나 SSH 터널이 필요하지 않다. 앱 재생과 퀘스트 분석은 기존 앱·백엔드 연결을 사용한다.

## 실행 흐름

실제 Codex 실행 모델을 `gpt-6-luna`, reasoning `low`로 설정한다. MCP는 모델을 자동 전환하거나 새 Luna 세션을 생성하지 않는다. 다른 모델의 감독 세션은 사용자가 이양을 허용한 기존 Luna 세션에 bundle 전체 작성 작업을 맡긴다. 생성기가 남기는 모델 라벨은 요청된 행위자 설정이며 실제 호출 모델이나 내부 API 횟수의 증거는 아니다. 프로젝트 MCP를 지속 실행하거나 다음 interactive 프로세스를 사용한다.

```sh
node market-simulator/cli.cjs interactive
```

배우 작업과 stdin 수명을 분리해야 하는 오프라인 생성에는 `node market-simulator/cli.cjs host-start <새 호스트 디렉터리>`를 사용한다. 감독자가 호스트를 소유하고 배우 전달 전·제출 전에 `host-status`로 같은 hostId/requestId가 살아 있는지 확인한다. `host-call`은 operationId와 도구/인자를 받고, 연결 실패의 재전송은 같은 살아 있는 호스트·같은 operationId·같은 입력에 한정한다. 종료 후에는 `host-close`를 호출한다. 독립 호스트는 whole-trace와 trace 검증에 한정하고 persona-validation 디렉터리 작업은 기존 CLI/MCP에서 실행한다. 호스트 종료 기록은 체크포인트가 아니며, 사라진 요청을 새 호스트에 복구하거나 기존 후보를 다른 requestId로 옮기지 않는다. 명령·지원 입력·종료 진단은 [오프라인 요청 호스트의 수명](../../market-simulator/README.md#오프라인-요청-호스트의-수명)을 따른다.

1. `list_personas`로 현재 버전을 확인한다. 오프라인에서는 시작 전 `snapshotFilePath`를 준비한다. 앱 재생까지 요청받았다면 스킬의 pairing 절차로 시작 전 탭을 준비한다.
2. `prepare_whole_trace`에 `personaId`, 새 `seed`, `tabId` 또는 `snapshot` 또는 `snapshotFilePath` 중 정확히 하나를 전달한다. 결과의 `requestId`와 `bundle`을 보관하고 `bundle.inputHash`를 후보 외부의 출처 기록에 남긴다. candidate 최상위 필드는 `candidateVersion`, `requestId`, `decisions` 세 개이며 `inputHash`를 추가하지 않는다. 출력 경로와 검증된 개인 기억 파일은 `outputPath`·`learnerFile`로 지정할 수 있다. 기본 `maxRepairs:0`을 유지하며 요청이 기술 수정 재제출을 허용하면 `1`을 지정한다.
3. 한 인물·한 조건·한 seed·한 request/bundle만 받는 새 actor 문맥에서 후보 배열 전체를 작성한다. 저부하·고부하를 같은 작성 문맥에 함께 주지 않으며 다른 요청의 목표 ID나 선택지를 복사하지 않는다. 해당 `bundle.authoringGuide`(새 기본 `authoringVersion:"2"`)의 식별 정보·문법·예제를 먼저 확인한 뒤 세계 참고 자료·행동 계약·상세 페르소나·초기 지식·작업 기억·과제 상태를 읽는다. 각 행동 직전의 `actorState`, 필수 `basis.goalId`·`memoryUses`와 필요한 배열 `actorState.taskUpdate`·`memoryUpdate`를 선언하며 현재 예상 화면·위치·계산대 상태를 갱신한다. 코드가 계산하는 기억·과제 snapshot을 임의로 덮어쓰지 않는다. 실제 게임을 실행하지 않고 중간 결과를 예상하는 계획이므로 예측이나 로컬 검증을 앱에서 확인한 경험으로 설명하지 않는다.
4. 기본 candidate 7의 각 결정은 `choiceRef`로 현재 위치·계산대 상태·화면에 묶인 선택지를 지정한다. 반환된 `initialChoiceFrame`에서 첫 선택을 시작한다. 전체 배열을 작성한 뒤 `submit_whole_trace({requestId,candidate})` 또는 `submit_whole_trace({requestId,candidateFilePath})`를 한 번 호출한다. 전달 방식은 하나만 쓴다.
5. 오류 결과에 `canRepair:true`이고 처음 준비할 때 `maxRepairs:1`을 지정했다면 아래의 suffix-only `repair_whole_trace` 절차를 최대 한 번 사용한다. 성공하면 반환된 최종 trace 파일을 사용한다. 생성·검증만 요청받은 경우 여기서 끝낸다. 앱 재생까지 요청받았으면 `validate_trace` → `play_trace` → `replay_status`로 실제 실행을 확인한다. 미션 snapshot이 달라졌으면 새 요청을 준비한다.

interactive에서는 표준입력 한 줄에 같은 도구를 전달한다.

```json
{"tool":"prepare_whole_trace","arguments":{"personaId":"mild-intellectual-disability-adult","seed":"whole-jimin-01","snapshotFilePath":"/absolute/mission.snapshot.json","outputPath":"/absolute/whole-jimin-01.trace.json","maxRepairs":0}}
```

반환된 실제 요청 ID와 작성한 후보 파일 경로로 제출한다. candidate 7의 짧은 예시는 아래와 같다. source의 위치·상태·화면 필드는 해당 bundle/현재 예상 상태의 실제 값을 복사한다.

```json
{"candidateVersion":"7","requestId":"RETURNED_REQUEST_ID","decisions":[{"choiceRef":{"source":{"location":"start","navigationStateId":"INITIAL_STATE_ID","phase":"shopping","view":"world","activeStation":null,"pageIndex":null},"choiceId":"control/readList"},"delayMs":1800,"reason":"화면에 보이는 장보기 목록을 읽는다.","basis":{"intent":"check","goalId":null,"memoryUses":[]},"actorState":{"activity":"check","task":"구매 목록 읽기","heldGoalIds":[],"uncertainGoalIds":[],"focusedGoalId":null,"focusedProductId":null,"orientation":"unfamiliar"}}]}
```

파일 제출은 `submit_whole_trace({requestId,candidateFilePath})`로 한다. `maxRepairs:1`을 요청한 실행에서 실패 결과에 포함된 `repairContext`를 받았으면, 서버가 수락한 prefix 뒤의 결정만 담아 한 번 수정할 수 있다.

```json
{"tool":"repair_whole_trace","arguments":{"requestId":"RETURNED_REQUEST_ID","repair":{"decisions":[{"choiceRef":{"source":{"location":"CURRENT_LOCATION","navigationStateId":"CURRENT_NAVIGATION_STATE","phase":"shopping","view":"world","activeStation":null,"pageIndex":null},"choiceId":"CURRENT_AVAILABLE_CHOICE_ID"},"delayMs":2100,"reason":"기존 목표를 위한 다음 이동 참조를 고친다.","basis":{"intent":"task","goalId":"CURRENT_OPEN_GOAL_ID","memoryUses":[{"goalId":"CURRENT_OPEN_GOAL_ID","field":"name","mode":"remembered","value":"CURRENT_CLEAR_GOAL_NAME"}]},"actorState":{"activity":"orient","task":"현재 목표를 위한 통로 이동","heldGoalIds":["CURRENT_OPEN_GOAL_ID"],"uncertainGoalIds":[],"focusedGoalId":null,"focusedProductId":null,"orientation":"recognizing"}}]}}}
```

위 수정 예시는 필드 형태만 설명하며 열린 목표 하나와 clear 이름 기억을 전제로 한다. 실제 repair는 수락된 열린 목표·기억 상태와 원래 행동·종료 의도를 유지하고 진단에 맞는 기술 문제만 고친다. 여러 열린 목표나 uncertain/unavailable 상태를 이 예시의 값으로 덮어쓰지 않는다. `repair`에는 `decisions` 배열만 쓰고, 실패한 위치 이후의 suffix와 각 결정의 source를 실제 `repairContext`·원본 후보에 맞춘다. 서버가 준비된 요청에서 `repairVersion`, `requestId`, `baseAttempt`, `fromDecisionIndex`, `candidateVersion`을 채운다. `repairFilePath`에는 같은 `{ "decisions": [...] }` 객체를 저장한다. 기존 전체 wrapper나 일부 필드를 적은 요청도 지원하지만, 명시한 값이 현재 요청과 다르면 거절한다. 동일한 수정안을 재전송하면 저장된 결과를 반환하며 수정 예산은 늘어나지 않는다. 전달 형식 오류로 도구가 예외를 반환하면 호스트는 요청 상태를 확인해 실제 후보 거부와 구분한다. 이 처리는 기존 수정 제출 안에서 끝나며 행동마다 모델을 호출하지 않는다. `repair-whole` CLI 별칭은 같은 요청을 보유한 persistent MCP/`interactive` 프로세스 또는 독립 호스트의 `host-call`에서 동작한다.

진행이나 저장 결과를 다시 확인할 때 `whole_trace_status({requestId})`를 사용한다. 동기 제출이 완료된 뒤 행동마다 이 도구를 호출할 필요는 없다. `begin_actor_plan`/`observe_actor_plan`/`append_actor_plan`을 이 경로에 섞지 않는다.

호스트 MCP/interactive 또는 독립 호스트 프로세스는 여러 요청을 관리할 수 있다. 새 문맥 규칙은 후보를 작성하는 actor에 적용하며 서버가 세션 분리나 다른 bundle의 미열람을 강제·입증하지는 않는다. `requestId`·`inputHash`는 출처 연결용이고 후보에 스키마 밖의 필드를 추가하지 않는다. 가이드 v2는 조건부 성향 표현과 실제 활동·focus 선언을 안내하지만 행동 선택을 대신하거나 구매 결과·통과 기준을 교정하지 않는다. 지침 변경 자체는 충실도 개선의 증거가 아니며, 저장된 v1 가이드와 기존 검토 의미를 유지한다.

## 소켓 없는 단일 요청 전달

배우 클라이언트의 종료와 요청 프로세스의 수명을 분리할 때 감독자는 다음 파일 mailbox를 사용할 수 있다. `prepare.json`은 readiness가 준 `prepareWholeTrace`를 변경 없이 `{tool:"prepare_whole_trace",arguments:...}`로 감싼 파일이다. owner 디렉터리는 새 경로여야 하며 이전 세션을 복원하지 않는다. 이 경로는 소켓을 열지 않는다.

```sh
node market-simulator/whole-trace-mailbox.cjs serve /absolute/new-owner --prepare-file /absolute/prepare.json
```

감독자가 이 프로세스를 유지하고, 슬롯별 새 배우 문맥에는 그 owner의 `prepare-response.json`에 있는 준비 응답만 실험 입력으로 준다. 배우가 작성한 도구 요청은 `{operationId:"append-001",tool:"append_whole_trace_decision",arguments:{decision:...}}`처럼 별도 JSON 파일 하나에 저장하고 다음 명령으로 전달한다. requestId는 owner가 고정한 값만 붙인다. 후보·행동·기억 필드는 채우지 않는다.

```sh
node market-simulator/whole-trace-mailbox.cjs call /absolute/new-owner --operation-file /absolute/operation.json
```

begin/menu/append/finish/status와 inline repair는 기존 도구 이름을 쓴다. 최종 제출은 `{operationId:"finish-submit-001",tool:"finish_and_submit_whole_trace",arguments:{}}`다. 이 전달 도구가 finish 응답의 **candidate 객체 하나만** owner의 `candidate.json`에 원자적으로 저장하고, 재파싱·동일성을 검사한 뒤 기존 submit과 status를 호출한다. `jq '.candidate' responses.jsonl`처럼 여러 응답에서 후보를 추출하거나 배우가 후보 파일을 다시 작성하지 않는다. 행동·종료·수량·기억·repair 예산은 바뀌지 않는다.

완료 상태, 제출 검증 성공, 실제 저장 파일과 별도 validate 성공을 확인해야 `completion.json`을 남기고 owner가 정상 종료한다. prepared나 수정 가능한 invalid, 전달 예외에서는 owner를 유지한다. 배우 클라이언트의 EOF나 종료는 owner 종료를 뜻하지 않는다. 응답이 유실되면 같은 operationId·동일 입력으로 재전송하며 이미 처리된 행동을 다시 실행하지 않는다. 명시적 오류를 받은 뒤 기술 내용을 고친 요청에는 새 operationId를 쓴다. 확정된 전달 오류 뒤에도 후보 내용은 그대로 두고 새 전달 operationId로 재전송할 수 있으며, 엔진의 동일 후보 캐시가 제출 횟수를 보존한다. 전달 재시도는 새 actor 표본 생성이나 의미 변경을 허용하지 않는다.

배우 도구는 새 prepare, requestId 교체, close/abort를 제공하지 않는다. 감독자의 중단은 `node market-simulator/whole-trace-mailbox.cjs abort /absolute/new-owner --reason "중단 사유"`로 따로 기록한다. SIGTERM과 강제 종료도 완료로 간주하지 않는다. 상태 확인은 `status /absolute/new-owner`를 사용하며, 죽은 프로세스의 파일을 새 요청으로 자동 복원하지 않는다. 기존 interactive·socket host 경로와 저장 결과는 그대로 유지한다.

## 작성 시점과 문법 확인

`actorState`와 `choiceRef.source`는 **이번 행동을 실행하기 직전**을 적는다. 직전 행동이 만든 결과를 반영하고, 같은 결정의 `taskUpdate`로 바뀐 열린 목표 집합도 반영한다. 이번 행동으로 앞으로 보게 될 목록·상품·이동 결과를 앞당겨 쓰지 않는다. 이 예상 상태 기록은 전체 계획 작성의 일부이며 중간 실행 결과를 받아 행동마다 다시 계획하는 절차가 아니다.

새 작성 안내의 `guidanceRevision:"declaration-preflight-v3"`은 `authoringVersion:"2"`의 검토 의미와 bundle 8/candidate 7을 유지하면서 작성 단계의 형식·목표 선언 사전검사를 안내한다. `syntax.decision`·`syntax.choiceRef`는 필수 필드를, `examples.completeProductDecisions`는 완전한 add/remove 한 결정의 형태를 제공한다. 예제의 수량 1과 기억 총수량 2는 일부러 다르며 기본값이 아니다. 배우가 실제로 선택한 수량·행동·종료를 기록한다. `taskUpdate`는 반드시 **actorState 안**에 두고 type/goalId만 넣는다. decision 최상위에 두거나 기억 field/mode/value를 섞으면 거절한다. **각 `basis.memoryUses` 항목에도 goalId가 필요**하며 상위 `basis.goalId`에서 상속하지 않는다. `syntax.repair.maxRepairs`는 실제 요청 예산과 같으며 0이면 수정 재제출이 허용되지 않는다.

| 상황 | 작성 규칙 |
| --- | --- |
| 목표 상태 변경 | `actorState.taskUpdate:[{type:"select",goalId:"실제 목표 ID"}]`처럼 actorState 안에 한 건도 배열로 쓴다. 같은 결정의 heldGoalIds는 이 변경을 적용한 열린 목표 집합이다. 변경이 없으면 생략하거나 `[]`를 쓴다. |
| 목표 세부 사용 | `basis.memoryUses`의 각 항목은 `{goalId,field,mode,value}` 네 필드를 명시한다. 상위 basis.goalId만 적어 항목의 goalId를 생략할 수 없다. |
| 목표 복귀와 도움 | task/recover는 열린 목표의 basis.goalId가 필수다. 목표에 연결되지 않은 check/help는 null일 수 있지만 기존 pending heldGoalIds는 유지한다. 도움말 닫기라도 recover로 선언했다면 목표 참조를 생략하지 않는다. |
| 목적과 활동 | `basis.intent`: `explore`, `interest`, `task`, `check`, `recover`, `help`, `finish`, `rest`. `actorState.activity`: `orient`, `shop`, `interest`, `recover`, `check`, `finish`, `rest`. 두 열의 값을 서로 복사하지 않는다. |
| 초기 목표가 없는 첫 목록 읽기 | 아직 읽지 않은 목표를 같은 결정에서 select하지 않는다. `basis.goalId:null`, `memoryUses:[]`, 빈 목표 배열과 null goal focus로 읽고 다음 결정에서 표시된 목표를 선택한다. 재확인하는 목록 읽기에서 기존 pending 목표까지 비우지는 않는다. |
| 이동 | 이번 source는 출발 위치다. 다음 결정은 도착 위치와 그때의 navigation state·화면 source를 쓴다. 출발점 `start`를 계속 복사하지 않는다. |
| 매대 열기 | 다음 결정은 실제 열린 매대의 view·activeStation·표시 페이지를 쓴다. 상품 페이지가 열렸는데 pageIndex를 `null`로 쓰지 않는다. |
| 도움말 열기 | world에서 열면 다음 source는 view=help, activeStation=null, pageIndex=null이다. 위치는 그대로다. |
| 장바구니 열기 | 다음 view=cart, pageIndex=null이다. 매대에서 열었으면 activeStation은 그 매대를 유지하고, 매대 없이 열었으면 null이다. cart를 station ID로 쓰지 않는다. |
| 장바구니/도움말 닫기 | view=world로 돌아간다. 열린 매대가 남아 있으면 그 매대의 이전 페이지를 복원하고, 아니면 activeStation/pageIndex=null이다. |
| 매대 닫기 | phase=shopping, view=world, activeStation/pageIndex=null이다. 다음에 매대를 새로 열면 pageIndex=0이다. |
| 계산대 이용·제출 | `checkout/<계산대 ID>`(예: `checkout/checkout`)를 쓴다. 수락 뒤 다음 source는 위치·navigationStateId를 유지하고 `phase:"checkout"`, `view:"world"`, `activeStation:"해당 계산대 ID"`, `pageIndex:null`이다. 그 계산대에 직원이 있고 제출을 선택했다면 이 source로 `control/submit`을 쓴다. |
| 목표 완료·포기 | 이전 add 결과를 관찰한 뒤 complete를 선언하거나 목표를 abandon하면, 같은 결정의 heldGoalIds에서 그 목표를 뺀다. 완료·포기한 목표를 basis.goalId·focusedGoalId·memoryUses로 계속 참조하지 않는다. 다른 열린 목표는 유지하며 새 행동의 basis와 focus에 맞게 기록한다. |

완료한 목표 하나를 해제한다는 이유로 다른 pending 목표까지 비우지 않는다. 새 행동이 목표에 연결되지 않으면 허용된 intent와 `basis.goalId:null`, `memoryUses:[]`, null goal focus를 쓰고, 다른 열린 목표를 수행한다면 그 목표의 실제 상태를 선언한다. 기술 예제는 상태·형식의 예시이며 구매·확인·실수·관심·포기의 횟수나 행동 순서를 강제하지 않는다.

가이드 v2의 `selectObservedProduct` 예시는 실제 관찰한 상품을 열린 목표와 연결해 선택하는 경우의 focus·기억 선언이다. 실제로 다른 상품을 골랐다면 그 선택을 보존하고, 관심이나 목표 없는 탐색의 null goal focus도 유지한다. `interestWithPendingGoal`은 관심 상품에 주의가 옮겨가도 진행 중인 목표를 잃어버리지 않는 예시다. `completeAfterAdd`의 닫기는 `orient`/`explore`로 표현하며 모든 닫기에 같은 활동을 강제하는 규칙은 아니다. 닫기 자체를 확인으로 세거나 지연만으로 숙고를 나타내지 않는다. 같은 페이지에서 본 정보를 비교했는지는 별도의 행동 근거가 제한될 수 있으므로 선언과 독립 관찰을 구분한다.

### 결정별 실행 검증과 재작성

새 작성 경로는 `executionAuthoring.revision:"prefix-execution-authoring-v1"`이다. 같은 준비 요청에서 `begin_whole_trace_authoring` → `whole_trace_authoring_menu` / `append_whole_trace_decision` → `finish_whole_trace_authoring`을 사용하고, 반환된 완성 candidate를 그대로 `submit_whole_trace`에 제출한다. 각 append는 저장 선택지·목표 선언 검사 후 **최종 제출과 같은 실행 검증기**로 해당 결정까지 실행한다. 미관찰 상품 focus와 감쇠 후 불확실성 누락도 해당 결정에서 거절하며, 미완성 접두 구간을 검사하기 위해 행동이나 종료를 추가하지 않는다. 앱 재생이나 새 모델 호출은 없다.

작성 명령은 아래 고정 진입점 하나를 사용한다. 스크립트 경로나 여러 위치 인자를 조립하지 않는다. JSON 파일 한 개 또는 `-`로 표준입력만 받으며, 알 수 없는 옵션·중복 경로·남는 인자는 파일 읽기와 후보 검증 전에 `AUTHORING_UNEXPECTED_ARGUMENT`로 거절한다.

```sh
node market-simulator/cli.cjs author-whole request.json
node market-simulator/cli.cjs author-whole - < request.json
```

`request.json`은 `{contextFilePath,operationId,tool,arguments}`이다. 전송 형식은 `executionAuthoring.transportRevision:"prepared-context-v1"`로 표시한다. 준비 담당자가 같은 호스트에서 요청을 준비한 뒤 저장한 `context.json`의 최상위 `hostDirectory`와 `requestId`를 읽는다. 배우가 이 두 값을 다시 조합하지 않는다. 기존 context의 `hostId`, `inputHash`, 인물·조건·seed 등 출처 메타데이터는 그대로 보존하며 전송 인자나 행동·상태로 복사하지 않는다. 호스트 시작과 `prepare_whole_trace`는 준비 담당자의 `host-call` 단계이며, 준비 완료 뒤 작성·메뉴·제출·수정·상태 조회에 고정 진입점을 사용한다.

파일 입력의 상대 `contextFilePath`는 **그 요청 JSON 파일의 디렉터리** 기준이고, stdin은 **현재 작업 디렉터리** 기준이다. context 내부의 상대 `hostDirectory`는 **context 파일의 디렉터리** 기준이다. 절대 context 경로는 두 입력 방식에서 동일하게 사용할 수 있다. `candidateFilePath`·`repairFilePath`는 기존 호스트의 경로 해석을 유지하므로 절대 경로를 사용한다.

예를 들어 다음은 요청 파일과 같은 디렉터리에 준비된 `context.json`을 사용하는 작성 시작 요청이며 기본 재작성 상한은 3이다.

```json
{"contextFilePath":"context.json","operationId":"authoring-begin-1","tool":"begin_whole_trace_authoring","arguments":{"maxRewritesPerDecision":3}}
```

다음 요청도 같은 명령과 context를 사용한다. 이 진입점에서 `append_whole_trace_decision`의 arguments는 `{decision}`이며 `decision.choiceRef`에는 `{choiceId,quantity?}`만 적는다. `source` 키는 null/undefined를 포함해 완전히 생략한다. 보조기는 기계적으로 추적한 source만 붙이며, AI가 쓴 나머지 행동·상태·수량·지연·이유·종료는 수정하거나 채우지 않는다. `finish_whole_trace_authoring`과 `whole_trace_status`의 arguments는 `{}`다. 반환된 candidate 최상위 키는 기존 `candidateVersion,requestId,decisions` 세 개이며, 제출은 `tool:"submit_whole_trace"`와 `{candidate}` 또는 `{candidateFilePath}`를 쓴다. 기술 수정은 `tool:"repair_whole_trace"`와 `{repair}` 또는 `{repairFilePath}`를 쓴다. CLI가 전송 인자의 requestId만 context에서 연결하고, 기존 MCP·호스트 도구의 requestId 인자 계약은 유지한다.

요청 최상위나 arguments에 `hostDirectory`·`requestId`를 중복 선언하면 값이 같아도 호스트 연결 전에 `AUTHORING_CONTEXT_OVERRIDE`로 거절한다. context 파일의 읽기 실패·잘못된 JSON·필수 전송 필드 오류도 후보 실행 전에 `AUTHORING_INVALID_CONTEXT`로 거절한다. candidate·repair 내부의 명시된 requestId는 덮어쓰지 않으며 기존 검증 규칙을 그대로 적용한다. 직접 작성한 candidate에서 requestId나 행동·상태 필드를 빠뜨려도 이 진입점이 채우지 않는다. 기존 전송 envelope는 contextFilePath 형식으로 바꾸되 과거 실험의 저장 입력·결과는 수정하지 않는다.

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

보조기는 기억 정답을 공급하거나 `uncertainGoalIds`를 자동으로 채우지 않는다. 모든 선언은 계속 AI가 한다. 활동·지연·기억 업데이트를 바꾸어 거절을 회피하라는 권고도 하지 않는다. `sourceAuthoring.taskDeclarationExamples`와 `workingMemory` 안내의 조건을 확인하고, 예제의 빈 배열이나 값으로 다른 열린 목표와 실제 불확실성을 덮어쓰지 않는다.

거절 응답은 `accepted:false`, `decisionIndex`(0부터), `decisionNumber`(1부터), `issues`의 `path/rule/message/evidence`, `canRetry`, 거절 전 메뉴를 포함한다. 입력·수락된 접두 구간·실행 상태는 바뀌지 않는다. AI는 사유를 보고 **같은 결정만** 다시 제출한다. 같은 요청 안의 기술 수정이며 구매 결과 최적화·자동 대체·새 표본 재생성이 아니다. 기본은 첫 시도 + 최대 3회 재작성이고 `begin_whole_trace_authoring.maxRewritesPerDecision`으로 설정한다. 마지막 허용 시도도 거절되면 요청이 실패로 끝나며 상한을 다시 초기화하지 않는다. 최종 제출 뒤의 `maxRepairs:0|1` 및 `repair_whole_trace`의 정확한 prefix·원래 종료 의도 보존 규칙은 별도로 그대로 유지한다.

거절 응답의 `rewrite`는 `status`, `decisionIndex`, `decisionNumber`, `acceptedDecisionCount`, `remainingRewrites`, `message`를 제공한다. `status:"awaiting-rewrite"`와 `canRetry:true`는 **같은 결정의 재작성 대기**이며 전체 요청 실패가 아니다. 예를 들어 20개 결정이 수락된 뒤 21번의 첫 시도가 거절되면 기본 상한에서는 앞의 20개를 유지한 채 남은 재작성 3회를 표시한다. 작성자는 원래 의도와 수락된 앞부분을 보존하면서 기술 오류를 수정하고 같은 요청·결정에 새 operationId로 제출한다. `status:"exhausted"`, `canRetry:false`, `remainingRewrites:0`이면 기존 규칙대로 요청이 실패로 끝난다.

`rewriteContract:"terminal-intent-preserved-v1"`은 결정별 **최초 초안**의 구체적인 선택을 `nonterminal`·`submit`·`giveUp`으로 기록한다. 재작성으로 종료를 도입·교체·제거하면 `AUTHORING_REWRITE_CHANGED_ENDING`으로 거절하고 같은 재작성 예산을 사용한다. 예를 들어 `basis.intent:"finish"`가 같아도 거절된 이동을 `control/giveUp`으로 바꿀 수 없다. 최초 `choiceId`가 없거나 알 수 없는 값이면 종료 의도가 확인되지 않은 것이므로 재작성으로 종료를 새로 도입할 수 없다. 미해결 결정은 `finish`나 직접 `submit`으로 건너뛰지 못한다. 올바른 이동 참조나 필요한 비종료 패널 닫기를 배우가 기술 수정으로 작성할 수 있고, 수락된 뒤 **다음 새 결정**의 자발적인 종료는 계속 허용한다. 이 검사는 종료 성격을 보존하는 구조적 보호이며 자연어 의도 전체를 판정하거나 의미 보존을 입증하지 않는다. 행동·상품·수량을 원래 의도대로 유지하는 작성 규칙은 별도로 계속 적용한다.

“보조기가 행동을 자동으로 대체·삽입하지 않는다”는 원칙과 “AI가 허용된 기술적 재작성을 할 수 있다”는 절차를 구분한다. 보조기는 현재 메뉴와 거절 사유를 보여주며 닫기·읽기 같은 후속 행동이나 그 상태를 대신 작성하지 않는다. 잘못된 선택을 고친다는 이유로 구매 목표·수량·종료를 통과 목적으로 재계획하지 않는다. 목록 읽기를 계속하려고 AI가 닫기 행동을 직접 작성한 경우에도, 그 행동이 수락된 **다음 메뉴**에서 목록 읽기 가능 여부를 다시 확인하고 새 결정을 직접 작성한다. 재작성 예산이 남은 상태에서 작성자가 중단했다면 그 중단 사유를 기록하고, 검증기의 강제 종료나 상한 소진과 구분한다.

각 결정의 `firstAttemptPassed`, `attempts`, `rewriteCount`, `rejectedRules`와 전체 `firstAttemptAccuracy`는 응답의 `authoring`, 최종 결과/metrics, 요청 진단 디렉터리의 `authoring.jsonl`에 남는다. 독립 호스트 저널에도 요약을 기록한다. 통신 응답을 잃은 재전송에는 같은 `operationId`·같은 입력을 사용하며, AI가 고쳐 쓴 결정에는 새 operationId를 사용한다. 첫 시도 정확도와 재작성 후 수락률을 구분하고, 이 횟수를 실제 모델 호출 수로 설명하지 않는다.

기존 동기식 `createWholeTraceSourceAuthoringCursor(bundle)`는 저장된 source·선택지·목표 선언만 확인하는 하위 보조기로 유지한다. 이 하위 보조기 자체가 재작성 예산을 부여하지 않는다는 안내는 실행 작성 경로의 이미 설정된 재작성 예산을 취소한다는 뜻이 아니다. 새 비동기 `createWholeTraceExecutionAuthoringCursor(settings,bundle,options)`가 이를 사용하고 접두 실행 검증·참고 메뉴·재작성 기록을 더한다. 기존 후보·bundle·파일럿 측정은 수정하지 않고 작성 revision/보조기 사용 여부를 별도 출처로 기록한다. 모든 최종 검증 규칙·임계값·계약 의미와 전체 후보 제출 검증은 유지한다.

### 계산대 참조 별칭

최종화는 작성 중인 접두 구간의 유효성을 시험하는 호출이 아니다. `finalizationContract:"incomplete-finalization-fails-request-v1"`에서 이미 작성된 종료 행동 또는 기존 100행동 상한 없이 `finish`를 호출하면 `AUTHORING_INCOMPLETE_FINALIZATION`으로 요청이 실패 상태에 고정된다. 수락된 원본은 `authoring-finalization.failure.json`에 보존하며 이후 append·begin·submit·repair로 새 종료를 붙이지 못한다. 독립 owner는 실패 응답과 상태를 저장한 뒤 닫고 readiness는 기술 실패로 센다. pending 결정의 `AUTHORING_REWRITE_PENDING`은 별도 상태로서 기존 한도 안의 같은 결정 기술 수정이 가능하다. 작성 중 자연스럽게 선택한 종료에는 최소 행동·구매 수를 요구하지 않는다.

새로 준비한 `choiceCatalog.referenceAliases`는 `{aliasChoiceId,canonicalChoiceId,kind:"checkout-open-v1"}` 배열로 허용 별칭을 명시한다. 계산대 ID가 `checkout`이면 `open/checkout`을 `checkout/checkout`에 연결하는 항목이다. 작성할 때는 정식 `checkout/<계산대 ID>`를 사용한다. 컴파일러는 명시된 별칭에 한해 source가 현재 상태와 정확히 같고, 대상이 실제로 같은 계산대이며, 정식 버튼이 현재 사용 가능할 때 로컬에서 참조를 해석한다. 다른 계산대나 경로를 고르거나 구매·수량·종료를 자동 수정하지 않는다. 멀리 있는 계산대, 잘못된 source, 사용할 수 없는 버튼은 계속 거절한다. 별칭 항목이 없는 저장된 bundle은 기존의 엄격한 ID 일치를 유지한다.

원본 후보는 그대로 보존한다. 감사 기록의 `choiceResolution.choiceRef`는 작성된 참조, `resolvedChoiceRef`는 실행한 참조이며, 별칭을 썼을 때만 `normalization:{kind,authoredChoiceId,canonicalChoiceId}`를 함께 기록한다. 행동 이유·대기 시간도 유지한다. 참조 해석은 제출 후 로컬 컴파일 단계에서 끝나므로 추가 AI 왕복이 없고, 전체 계획 1회와 허용된 최대 1회 기술 수정 절차를 유지한다.

## 세계 참고 자료와 인물의 지식

`bundleVersion:"8"`은 같은 Luna 문맥에 세계 참고와 인물 상태를 구분하고 현재 위치·화면별 `choiceCatalog`와 `initialChoiceFrame`을 제공한다. `worldReference`의 전체 지도·상품·재고·목표 및 미래 source/선택지는 향후 화면을 예상하는 참고이며 방문 전 인물이 발견한 사실이 아니다. 실제 행동은 현재 source의 선택지만 사용한다. `actorState.initialObservation`, `knowledge`, `experience`, `initialState`, `workingMemory`, `taskMemory`는 시작 화면·관찰 사실 원장·확인 경험·활동·초기 작업 기억·과제 상태를 제공한다. 화면에서 갈 수 있는 통로를 발견했다고 그 끝의 상품을 안다고 처리하지 않는다.

`persona.behavior`는 같은 프로필 JSON에서 만든다. `source:{personaId,version,promptHash}`는 개인 지침의 출처이고 `individualInstructions`는 상세 지침을 보존한다. `behavioralContext.goalMemoryCapacity`와 `timingBaseline:{reactionMedianMs,reactionSigma,walkSpeed}`는 목표 기억과 반응·보행의 합성 설계 기준이다. `cognition`은 관심 전환 뒤 세부 기억, 유사 상품 구분과 수량 추적에 연결하는 상황별 설정이며 `cognitionSourceHash`가 그 출처를 연결한다. 이 설정은 강제 오답 확률·집단 통계·임상 척도가 아니다. 원본 수치와 성격을 다시 정의하지 않고, 어려움의 횟수나 정답 장바구니를 요구하지 않는다. 원자료 전문은 JSON prompt에 보존하고 bundle에는 개인 지침을 추출해 전달한다.

- 목록의 구조화된 항목은 실제 `readList`가 수락된 다음 관찰에서 들어간다. 목록을 읽는 결정 직전에 그 행동으로 얻을 목표를 쓰지 않는다. 시작 안내문에 표시된 설명은 instruction 단서로 사용할 수 있지만 숨은 전체 목표의 구조화된 기억을 대신하지 않는다.
- 선반 이름·표지는 실제 보이는 범위에서, 상품명·가격·규격·재고는 표시된 선반 페이지에서만 획득한다. 다른 페이지·미개봉 매대의 내용은 모른다.
- 이동 후에는 새 화면에 표시되는 장소·상품·통로만 발견 기억에 더한다. 목록·장바구니·도움·직원 안내는 해당 화면에서 확인한 내용을 기록한다. 새 시각 단서가 없는 제자리 대기로 새로운 배치를 발견한 것으로 꾸미지 않는다.
- 익숙한 상품이나 확인 습관은 프로필의 시작 경험이다. 카레를 좋아한다는 설정만으로 현재 카레 매대의 위치·종류·재고를 알 수는 없다. 다른 배치의 과거 공간 기억을 새 배치 정답으로 옮기지 않는다.

인물의 지식을 실제로 이해·활용하는지와 입력에 기록돼 있는지는 구분한다. 기억·단서를 잘못 해석하거나 목표에서 관심을 돌리고 다시 확인하는 행동도 가능하다. 세계 참고 자료로 장바구니를 자동 교정하거나 방황·오답 횟수를 채우지 않는다. 지민·서연·민수의 몇 가지 인지·적응 특성과 일반적인 성인 취향·강점을 세션 전체에서 일관되게 유지한다.

이 구분은 역할 지시와 선언된 근거 검증이다. Luna 자체에는 전체 세계가 있으므로 모델이 숨은 정보를 전혀 참고하지 않았다는 강한 정보 차단 보장은 아니다. `reason`과 `actorState`는 허구의 행동과 상태를 공개용으로 짧게 요약하고 단계별 근거는 감사 데이터다. 사적인 사고 과정을 출력하거나 실제 사람의 생각·장애 특성·임상적 타당성을 측정한 것으로 설명하지 않는다.

## 관찰 원장과 작업 기억

`actorState.knowledge`는 무엇이 표시됐는지 증명하는 관찰 사실 원장이고 `actorState.workingMemory`는 인물이 현재 활용하는 이름·규격·필요 수량의 합성 상태다. 원장에 정확한 목표가 남아 있어도 현재 작업 기억이 정확하다는 뜻은 아니다. 후보가 작업 기억 snapshot을 직접 덮어쓰지 않는다. Node가 실제 전개된 관찰, 프로필 설정과 아래 선언으로 상태를 계산해 감사 자료에 남긴다.

매 결정의 `basis.memoryUses` 항목은 `{goalId,field,mode,value}`다. `field`는 `name`, `specification`, `requiredQuantity` 중 하나이고 `mode`는 `remembered`, `guess`, `current-display` 중 하나다. `value`는 필수이며 이름·규격에는 문자열, 필요 수량에는 1~99 정수를 쓴다. `remembered`는 코드가 계산한 clear 기억값과 일치해야 하고, `guess`는 uncertain 상태에서 사용한 믿는 값으로 정답과 비교해 교정하지 않는다. `current-display`는 현재 `readObjectives`의 표시값과 일치해야 한다. unavailable 필드는 실제 목록 읽기나 `selfRecall` 없이 사용할 수 없다. 목표 세부를 사용하지 않는 결정에도 배열 `[]`를 적는다.

첫 `readList` 결정은 `basis.goalId:null`, goal focus `null`, `memoryUses:[]`다. 다음 관찰에서 실제 읽은 목표를 `taskUpdate:[{type:"select",goalId:"ACTUAL_GOAL_ID"}]`로 선택하고 열린 목표와 같은 `heldGoalIds`를 유지한다. 예를 들어 실제 읽은 `objective-1`의 label이 `흰 우유`이고 이름 기억이 clear이면 목표를 위한 이동에 `basis.goalId:"objective-1"`와 `{"goalId":"objective-1","field":"name","mode":"remembered","value":"흰 우유"}`를 쓴다. 다른 label이나 불확실한 상태에 이 값을 복사하지 않는다. 목표에 연결된 판단은 focus가 null이어도 이름 사용을 선언한다. 실제 readList/viewCart/viewHelp는 unavailable 기억을 회복하기 위한 외부 확인이므로 이름 사용 없이 먼저 수행할 수 있다. 목표에 연결된 add/remove에는 `name`과 `requiredQuantity` 사용이 필요하며 선택 수량이 기억 수량과 같아야 하는 정답 검사는 하지 않는다.

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

이 엔진은 이미 제출된 전체 계획을 로컬에서 전개하며 기억의 출처와 일관성을 사후 검증한다. 실행 중 계산한 상태를 모델에 재전달하거나 그 상태를 보고 Luna가 새 선택을 했다고 설명하지 않는다. 전체 세계가 같은 모델 문맥에 있다는 정보 노출 조건은 그대로이며 사후 감사 통과만으로 숨은 정보 영향을 차단했다고 주장하지 않는다.

## 계속 수행 중인 목표

candidate 7의 `taskContract:"persistent-task-memory-v1"`는 순간 focus와 열린 과제 목표를 분리한다. `taskMemory.openGoalIds`는 선택·완료·포기 전이로 계산하며 `taskStateVersion:"persistent-task-v1"`로 기록한다. `heldGoalIds`는 열린 목표와 같은 집합이어야 하고 프로필 용량 안에 둔다. 관심·탐색·휴식으로 focus가 null이 되어도 열린 목표의 기억은 유지·감쇠한다. 모델이 held 배열을 비우거나 memoryUpdate.deactivate만 써서 pending 목표를 조용히 삭제할 수 없다.

선택적 `actorState.taskUpdate`는 `[{type:"select"|"complete"|"abandon",goalId}]`다. select는 현재 실제 `readObjectives`의 항목 또는 같은 결정에서 명시적으로 자기회상한 이전 목표에만 적용한다. 목록을 읽은 다음 관찰에 열린 목표가 없고 표시된 목표 중 명시적 완료 이력이 없는 목표가 있으면 실제 표시된 목표를 하나 이상 선택한다. 예외는 실제 checkout/submit/requestCashier/giveUp 행동이며 finish label만으로 선택을 건너뛰지 않는다. complete는 해당 목표에 연결된 이전 add가 실제로 수락되고 그 결과가 관찰된 뒤에 선언한다. 이는 인물이 선택을 마쳤다는 표시이지 상품·수량 정답 검증이 아니다. abandon은 구매 없이 목표를 명시적으로 포기하는 선택이며 그 사실을 남긴다. 미완료 목표를 가진 채 계산·제출·포기하는 것도 허용하며 정답 장바구니를 요구하지 않는다.

`taskMemory.completedGoalIds`는 수락된 `complete` 선언의 목표 ID만 보존한다. 표시된 모든 목표를 명시적으로 완료한 뒤 목록을 재확인하면, 목표를 다시 선택하지 않고 장바구니 확인이나 이동을 이어갈 수 있다. 완료 이력은 구매 정답 판정이나 작업 기억의 이름·수량 복원에 쓰지 않는다. 완료한 목표를 다시 select하면 이전 완료 이력을 해제하며, abandon은 완료로 간주하지 않는다. 아직 완료하지 않은 표시 목표가 있으면 기존 선택 규칙을 적용한다.

매 판단의 `basis.goalId`는 필수다. task/recover는 열린 목표 ID, check/help는 열린 목표 ID 또는 null, explore/interest/rest/finish는 null을 쓴다. 목표가 연결된 판단은 이름 memoryUse를 선언하되 실제 readList/viewCart/viewHelp는 외부 확인을 먼저 할 수 있다. 관심 이외의 add/remove는 goalId가 필요하고, 목표에 연결된 add/remove는 name·requiredQuantity 사용을 선언한다. goal focus가 있으면 basis.goalId와 같아야 한다. 이 계약은 모델의 목표 선택과 잘못된 구매를 그대로 유지하며 행동 목적을 reason 문자열에서 추론하지 않는다. 과제·기억 상태는 행동이 수락된 뒤에만 commit한다.

## 이동과 근처 조작 참조

`bundle.worldReference.navigation`은 같은 공용 `visibleAnchors` 규칙으로 미리 계산한 **방향이 있는 한 번의 이동 가능 목록**이다. `worldReference.world`·`worldReference.waypoints`는 유지하며, Luna가 생성기 원문을 실행하거나 화면 가림·거리·충돌 규칙을 다시 계산할 필요를 줄인다. 연결표 전체는 세계 참고 자료이며 아직 도착하지 않은 위치의 이웃이나 매대 내용을 인물의 발견 기억으로 옮기지 않는다. 모델 안에서 참고 코드는 실행되지 않는다.

1. 처음에는 `navigation.initialStateId`의 상태와 `initialLocation:"start"`를 사용한다. 해당 `states` 항목의 `start.allowedWaypointIds`는 예상 이동 선택지를 이해하는 참고표다. 실제 행동에는 `initialChoiceFrame`의 source와 현재 제시된 choice ID를 쓴다.
2. 이동이 수락된 뒤에만 그 waypoint를 현재 예상 위치로 기억한다. 다음 결정은 새 source와 해당 상태/위치의 현재 choice frame에서 선택한다. 참고표에 있는 waypoint가 현재 choice frame에 없으면 선택하지 않는다. `readList`·`pause`·`lookAround`·화면 열기/닫기·`interact`는 위치를 바꾸지 않는다.
3. `requestCashier` 후에는 호출한 계산대를 직원 있음으로 예상하고, `cashierAvailability`가 그 상태와 일치하는 `states` 항목을 사용한다. `stateId`는 bundle에 있는 값을 그대로 읽으며 직접 조합하지 않는다. 직원 없음에서 있음으로 바뀔 수 있는 상태는 최대 4개이고, 모든 상태는 초기 `waypoints`의 같은 ID를 사용한다.
4. 선반·직원 창이나 계산 단계는 `closeStation`, 장바구니·도움 화면은 `closeView`로 닫은 뒤 shopping/world 화면에서 다음 이동을 계획한다.

현재 위치 항목의 `nearbyStations:[{id,kind,label}]`는 근처 매대·직원·계산대 조작을 이해하기 위한 참고다. 실제 선택은 현재 choice frame에 나온 항목으로 한정한다. 선반 페이지·상품 가시성·재고·열린 화면·게임 단계는 각 행동 계약을 함께 확인한다.

한쪽의 목록에 상대 waypoint가 있어도 반대 방향 이동은 보장되지 않는다. ID 순서는 직렬화용이며 목표 상품까지의 최단 경로·선호 순위가 아니다. 다음 선택은 페르소나의 현재 관심·목표·확인·배회 의도로 결정한다. 재방문을 지우거나 실수·방황 횟수를 강제하지 않는다. 전체 catalog와 navigation은 계획 참고이며 현재 source-bound choice frame만 유효 선택을 정한다. 부적합한 이동을 다른 경로로 자동 교체하지 않는다.

기본 bundle에서 생성기 원문 `generatorReference`는 제외하고 `sourceFiles`의 경로·SHA-256 출처 목록을 보존한다. 원문을 줄인 것은 입력 구성 변경이며 실제 시간 단축은 같은 조건의 실행으로 측정해야 한다.

### 선택적 방향 이동 v1

새 일반 요청을 준비할 때 `prepare_whole_trace`에 `movementVersion:"directional-v1"`을 명시하면 8방향 조작을 추가한다. 생략하면 기존 메뉴·후보 검증·이동 계약을 유지한다. 기본 bundle 8/candidate 7과 `state-choices-v1`은 바뀌지 않으며, 켠 요청은 bundle의 `movementVersion`과 고정 입력 해시에 이 선택을 기록한다. 기존 trial과 persona validation slot은 이동 조건이 고정돼 있으므로 이 옵션을 덧붙일 수 없다. 방향 이동 표본은 별도의 일반 요청으로 준비하고 기존 표본과 같은 조건으로 묶지 않는다.

```json
{"tool":"prepare_whole_trace","arguments":{"personaId":"mild-intellectual-disability-adult","seed":"directional-01","snapshotFilePath":"/absolute/mission.snapshot.json","outputPath":"/absolute/directional-01.trace.json","movementVersion":"directional-v1","maxRepairs":0}}
```

선택 ID는 `moveDirection/north`, `moveDirection/northeast`, `moveDirection/east`, `moveDirection/southeast`, `moveDirection/south`, `moveDirection/southwest`, `moveDirection/west`, `moveDirection/northwest`다. 방향은 ID에 고정되며 `choiceRef.durationMs`에 **100~2000의 정수**를 직접 적는다. 생략된 시간을 채우지 않으며 `quantity`는 사용하지 않는다. 이 시간은 판단 지연인 `delayMs`와 별개다. 예를 들어 첫 결정의 선택 참조는 다음 형태다.

```json
{"source":{"location":"start","navigationStateId":"INITIAL_STATE_ID","phase":"shopping","view":"world","activeStation":null,"pageIndex":null},"choiceId":"moveDirection/north","durationMs":700}
```

`shopping`/`world`이고 열린 station이 없는 조작 가능 상태에는 8방향이 항상 표시된다. HUD·화면 가장자리 가림, 보이는 waypoint의 유무, 그 방향의 충돌 가능성으로 방향 조작을 제거하지 않는다. 실제 장애물 충돌과 이동량은 기존 motor와 게임 루프가 처리하므로 조작이 허용됐다고 이동 거리나 도착점을 보장하지 않는다. `walk/<waypointId>`는 기존의 보이는 한 번의 이동 지름길로 함께 유지한다.

HUD 가림은 표지·매대·직원·상품 등 기존 인지 정보에 그대로 적용한다. 방향 조작에는 보이지 않는 목적지·매대·상품 단서가 붙지 않으며, 이동 후에도 실제 관찰에 표시된 정보만 새 지식이 된다. 방향 버튼을 선택했다는 사실로 가려진 영역의 정보를 발견했다고 선언할 수 없다.

방향 이동 뒤 `choiceRef.source.location`은 해당 이동 결정의 1부터 세는 번호를 붙인 `D<번호>`다. 첫 결정이 방향 이동이면 다음 source는 `D1`이고, 네 번째 결정이 방향 이동이면 그 뒤는 `D4`다. 이는 실제 좌표나 waypoint를 추측한 값이 아니라 그 이동 뒤 상태를 구분하는 참조다. 이후 `walk`가 수락되면 기존대로 해당 waypoint ID가 된다. `navigationStateId`는 방향 이동으로 바뀌지 않고 기존 직원 호출 전이를 따른다. 컴파일러는 실제 실행 후 관찰로 그 source의 후속 선택을 검사하며 이전 위치의 정적 메뉴를 재사용하지 않는다.

이 단계는 작성 중 물리 이동 결과를 예측하지 않는다. source 작성 보조기는 방향 이동 후 결과 위치가 없는 동안 방향·공통 조작만 제공하고, 이전 waypoint의 이동·근처 매대 메뉴를 새 위치의 정보로 사용하지 않는다. 2단계 연결 지점인 `acceptMovementPosition({decisionCount,position:{x,y}})`는 외부에서 받은 해당 이동 후 위치를 적용하는 인터페이스다. 보조기가 좌표·속도·충돌 결과를 자체 계산하거나 자동으로 채우지는 않는다. 전체 후보의 실행 검증과 실패 시 실제 `choiceFrame` 제공은 기존 제출 흐름을 따른다.

컴파일된 trace는 기존 앱의 `moveDirection` motor 입력을 사용하며 `generation.movementContract:"joystick-direction-v1"`와 `generation.wholeTraceMovementVersion:"directional-v1"`를 함께 기록한다. 기존 feedback 버전이나 옵션이 없는 whole-trace의 계약과 저장된 trace·검증 결과를 소급 변경하지 않는다.

### 실행 후 메뉴를 갱신하는 방향 이동 v2

`movementVersion:"directional-v2"`는 같은 8방향·시간 계약에 결정별 실행 결과를 반영한 작성 메뉴를 더하는 별도 옵션이다. 기본값과 명시적 `directional-v1`의 위 계약은 그대로 유지한다. v2는 `begin_whole_trace_authoring` → `append_whole_trace_decision` → 최신 메뉴 확인을 사용한다. 각 append는 기존 prefix 검증기로 실제 이동 입력을 적용한 뒤 연속 좌표를 내부에 보존하고, 그 위치에서 관찰·허용 선택지를 다시 만든다. 격자점으로 반올림하거나 가장 가까운 waypoint로 바꾸지 않는다. 충돌로 일부만 이동하거나 제자리에 남은 결과도 그대로 따른다.

배우의 draft에는 여전히 `choiceRef.source`를 넣지 않는다. 보조기가 수락된 접두 구간으로 source를 채운다. v2의 source.location은 처음부터 `P`로 시작하는 불투명한 위치 참조이고 navigationStateId는 `nav-v2-`로 시작하는 불투명한 상태 참조다. 내부의 정확한 연속 좌표·고정 입력·직원 상태·표시 조건에 묶이며 좌표나 방향으로 해석하지 않는다. 위치가 바뀌면 새 상태 참조를 사용하고, 실제로 막혀 위치와 상태가 같다면 같은 참조가 유지될 수 있다. `D<결정 번호>`나 `W<번호>`를 source 위치에 직접 쓰는 v1 전이를 v2에 섞지 않는다. 최종 제출은 같은 prefix를 다시 실행해 source·선택의 일치를 검증한다.

v2 메뉴의 `currentObservation`은 `{kind:"validated-prefix-observation-v2",acceptedDecisionCount,notice,observation}` 형태로 현재 `ActorObservation`의 표시 정보만 전달한다. 기존 최상위 `readObjectives`도 그 시점의 목록 표시 수명을 따른다. 관찰·메뉴에는 내부 좌표나 계산에 쓴 전역 지도·숨은 목적지를 추가하지 않는다. 이동의 절대·상대 좌표와 픽셀 거리는 공개 관찰에서 제거하고, 별도 `movementResult:{actualDirection,progress,blocked}`로 실제 이동 방향 또는 `null`, `full|partial|blocked`, 막힘 여부를 표시한다. 요청한 방향과 실제 이동 방향은 충돌 때문에 다를 수 있다. 메뉴 조회·거절된 draft·같은 요청 재전송은 실제 적용된 이동이나 지식으로 세지 않는다.

선택적인 `movementFeedbackVersion:"recent-movement-v1"`은 v2와 함께만 지정한다. feedback v11의 동일한 `movementNotes` 문장과 v12의 `recentVisit:{timesArrived}` 통로 방문 표시를 재사용한다. 최근 적용된 걷기 4회 전에는 이동 메모가 비어 있다. 방향별 횟수·아직 걷지 않은 방향·막혔던 방향은 관찰된 최근 경험만 서술하며 새 방향을 추천하거나 기존 선택을 금지하지 않는다. 통로 마커는 최근 실제로 그 통로까지 걸어간 기록과 현재 보이는 `walk` 선택지가 만나는 경우에만 붙고, 방향 이동으로 지나간 곳이나 본 적만 있는 통로를 도착으로 세지 않는다. 이 옵션은 선택 ID·순서·실행 가드를 바꾸지 않으며 내부 도착 ID 원장·좌표·지도를 공개하지 않는다. 생략하면 메모·마커를 추가하지 않는다.

`movementFeedbackVersion:"recent-movement-anchor-v1"`은 `movementVersion`을 생략한 anchor 이동과 `observationVersion:"anchor-visible-structures-v1"` 계약에서만 켠다. 관찰 계약은 새 독립 anchor 요청에서 자동으로 정해지며 기본값은 꺼짐이다. 최근 24행동 안의 자기 accepted 도착 기록을 현재 보이는 걷기 선택지에 ` · 최근에 N번 간 통로`와 `recentVisit:{timesArrived:N}`으로 표시하고, 같은 창의 이동 경험을 `movementNotes`로 전달한다. 선택지 ID·순서·가용성은 유지하며 표시와 메모는 권고가 아니다. `prepare_persona_validation`에서는 별도 실행 설정에 `movementValidationVersion:"1"`과 이 옵션을 지정하며 명세 JSON은 바꾸지 않는다.

`movementFeedbackVersion:"recent-movement-anchor-capacity-v1"`은 같은 anchor 조건에서만 켜는 별도 옵션이다. 기존 24행동 보존 창에 더해 선택된 페르소나의 `spatialMemoryCapacity`를 최근 도착한 서로 다른 통로 수의 상한으로 쓴다. 용량을 넘으면 마지막 accepted 도착이 가장 오래된 통로의 횟수 기록을 모두 지우며, 다시 도착하면 1회부터 센다. 보기만 하거나 메뉴를 조회한 것은 최근성을 갱신하지 않는다. 방향별 `movementNotes`의 24행동 창은 그대로이며 이동 권고·선택지 변경은 없다. 기본 페르소나 값은 모두 96곳이므로 현재 창에서 용량 제한은 걸리지 않는다. 이 값은 합성 구현 설정이며 실측 기억 능력이 아니다. 기본값과 기존 두 피드백 버전은 바꾸지 않는다.

독립 호스트에서 준비하려면 호출의 arguments에 두 옵션을 명시한다. 호스트 시작부터 context 저장·작성·최종 제출까지의 예시는 [방향 이동 v2 작성 예시](../../market-simulator/docs/whole-trace.md#방향-이동-v2-작성-예시)를 따른다. 앱 재생을 하기 전의 prefix 결과는 로컬 실행 검증 결과이며 실제 앱에서 확인한 개인 경험으로 저장하지 않는다.

검증 전용 인물과 비교 실험은 새 `prepare_persona_validation` run의 `movementValidationVersion:"1"` 뒤에서 v2를 사용한다. 반환된 슬롯의 `prepareWholeTrace`에 있는 marker·이동·단서 옵션을 그대로 유지한다. 기존 검증 run에 옵션을 덧붙이지 않는다. 검증용 실제 메뉴·도착 증거와 경로 기회의 해석은 [명시적 이동 검증 옵션](persona-validation.md#명시적-이동-검증-옵션)을 따른다. 이 분석 증거는 배우에게 미래 경로나 숨은 도착 정보를 제공하지 않는다.

## 기본 후보 7과 화면별 선택

새 bundle은 `bundleVersion:"8"`, 기본 `candidateVersion:"7"`을 제공하며 `policyVersion:"whole-trace-v3"`는 유지한다. v7은 v6의 source-bound choice·focus·작업 기억에 계속 수행 중인 과제 계약을 더한다. `initialChoiceFrame`의 source와 available choices에서 시작하고 다음 결정에는 새 위치·화면에 맞는 frame을 사용한다. 전체 catalog와 미래 source는 참고이며 방문 전 지식이 아니다. 현재 source와 일치하는 선택만 실행할 수 있다.

기본 candidate 7는 1~100개의 결정으로 이루어진다. 각 결정은 다음 형태다.

```json
{
  "candidateVersion": "7",
  "requestId": "RETURNED_REQUEST_ID",
  "decisions": [
    {
      "choiceRef": {
        "source": {
          "location": "start",
          "navigationStateId": "INITIAL_STATE_ID",
          "phase": "shopping",
          "view": "world",
          "activeStation": null,
          "pageIndex": null
        },
        "choiceId": "control/readList"
      },
      "delayMs": 1800,
      "reason": "화면에 보이는 장보기 목록을 읽는다.",
      "basis": { "intent": "check", "goalId": null, "memoryUses": [] },
      "actorState": {
        "activity": "check",
        "task": "구매 목록 읽기",
        "heldGoalIds": [],
        "uncertainGoalIds": [],
        "focusedGoalId": null,
        "focusedProductId": null,
        "orientation": "unfamiliar"
      }
    }
  ]
}
```

예시는 필드 모양만 설명하며 한 개의 readList로 끝나는 배열은 완성된 실행 후보가 아니다. `source`는 각 단계 직전의 실제 `location`, `navigationStateId`, `phase`, `view`, `activeStation`, `pageIndex`를 모두 정확히 담는다. 이동이 수락된 뒤에만 `location`이 바뀌고, 직원 호출이 수락된 뒤에만 navigation state가 바뀐다. 같은 버튼의 `choiceId`가 여러 상태에 있어도 이전 `source`와 묶인 선택 참조를 다른 상태에 재사용할 수 없다. `choiceId`는 그 단계의 source에 해당하는 카탈로그 메뉴에서 선택한다. 초기·수정 시점에는 실제 `choiceFrame.availableChoices`의 값을 그대로 사용한다. 선택 ID 또는 `quantity`만으로 다른 화면에서 같은 조작을 호출할 수 없다.

`choiceRef.quantity`는 `add`와 `remove`에만 사용하며 현재 frame의 `quantityBounds` 안에서 1~99 정수를 명시한다. 수량 기본값은 없다. 구매/반환 수량은 필수다. 목표 수량과 다른 합법 수량도 그대로 실행·기록하며 자동으로 정답에 맞추지 않는다. 수량 누락은 실행 전 후보 전체에서 검사해 모든 누락 인덱스를 한 번에 반환한다. 생성기가 수량 기본값을 대신 넣지 않는다. 나머지 선택에는 `quantity`를 넣지 않는다. 조작 종류별 entry ID와 선택 참조는 `bundle.choiceCatalog` 및 `bundle.actionContract`에 있다. 위치별 이동은 그 위치의 현재 메뉴에서만 고르고, 매대 상품은 열린 페이지의 선택지에서만 고른다. `browse`는 현재 열린 매대의 0-based 페이지 선택이다. 도움·장바구니·선반 화면은 화면 상태가 맞는 source의 선택지를 사용하고, 이동 전에 기존 화면을 닫는다.

candidate 7과 legacy 6/5의 목표 참조는 상품 ID와 구분한다. 상품 `milk`를 요구하는 목표가 `objective-1`이면 `focusedGoalId`·`heldGoalIds`·`uncertainGoalIds`와 기억 선언의 `goalId`는 `objective-1`을 사용하고, 상품 집중은 `focusedProductId:"milk"`를 사용한다. 준비된 목표 ID에 없는 참조는 스키마 오류이며 실제 `readList` 전에 목표 ID를 활용할 수 없다. 검사기가 잘못된 ID를 대신 바꾸지 않는다.

`basis`는 candidate 7에서 `{intent,goalId,cueRefs?,memoryUses}`다. `intent`와 nullable goalId의 연결은 위 과제 계약을 따른다. `memoryUses`는 필수 배열이고 목표 세부를 사용하지 않으면 `[]`로 둔다. `cueRefs`는 선택 사항이며 실제 알려진 추가 참조를 최대 24개 적고 빈 배열도 허용한다. 선택 대상·control·실제 읽은 목표의 proof는 컴파일러가 파생하지만 이는 기억 사용 선언이나 정확한 회상으로 승격되지 않는다. 명시한 참조는 알려져 있어야 한다. `control:viewCart`와 `list`는 조작 표시이며 cart 내용이나 목표 세부를 알려주지 않는다. 도움 본문도 도움 화면을 실제 연 뒤에만 알려진다.

candidate 7의 **배우가 직접 작성한 `basis.cueRefs`에 `objective:<id>`가 있으면**, 현재 검증기는 이 ID 참조 자체를 목표 세부 사용으로 취급한다. 이미 읽은 목표라도 `basis.goalId:null`이면 `memoryUses:[]`와 함께 썼는지와 무관하게 `TASK_MEMORY`로 거절한다. 이 참조를 쓰는 목표 행동은 현재 열린 non-null goalId와 기존 intent·이름 기억 규칙을 충족해야 한다. 이는 53·56번 실패 당시와 같은 검사이며 허용 기준을 바꾸지 않았다.

비목표 탐색·확인을 의도했다면 열린 목표를 held에 유지하면서 `goalId:null`, `memoryUses:[]`, raw objective basis 참조가 없는 선언을 사용할 수 있다. 어떤 의도를 선택할지는 배우가 정한다. 검사 통과를 위해 근거를 자동 삭제하거나 다른 필드로 이동하지 않는다. `actorState.triggerCueRefs`는 실제 알려진 상태 변화 계기이고, 컴파일러가 파생한 objective proof는 관찰 출처 증명이다. 둘은 위 raw basis와 구분되지만 필수 memoryUses를 대신하거나 미관찰 목표·잊은 세부를 복원하지 못한다.

`actorState`는 행동 직전의 공개용 요약이다. candidate 7은 `{activity,task,heldGoalIds,uncertainGoalIds,focusedGoalId,focusedProductId,orientation,triggerCueRefs?,memoryUpdate?,taskUpdate?}`를 받는다. focus는 기억의 정확성이나 구매 결과와 별개다. `focusedGoalId`는 이번 방문에서 읽고 `heldGoalIds`에 포함된 목표이거나 `null`이며 uncertain과 겹칠 수 있지만 uncertain에만 있는 목표는 허용되지 않는다. v7에서 non-null goal focus는 basis.goalId와 일치해야 한다. 첫 `readList` 전 goal focus는 `null`이다. `focusedProductId`는 실제 선반/cart에서 본 상품이거나 `null`이다. 목록을 읽기 전에 상품을 봤다면 product focus를 기록할 수 있다. `activity`는 `orient`, `shop`, `interest`, `recover`, `check`, `finish`, `rest`, `orientation`은 `unfamiliar`, `recognizing`, `familiar` 중 하나다. 비어 있지 않은 160자 이하의 `task`는 trace의 `currentTask`가 된다. 목표 배열은 실제 읽은 목표 ID만 사용하고 held는 열린 목표와 같은 집합으로 프로필 용량 이하를 유지한다. `triggerCueRefs`는 선택 사항이며 명시하면 실제 알려진 참조를 최대 12개 적는다. 생략 시 파생되는 실행 proof는 기억 갱신이나 회상 출처를 대신하지 않는다. `memoryUpdate`와 `taskUpdate`는 위 기억·과제 계약을 따른다. 이 상태는 허구의 행동 요약이며 내면 사고·임상 측정이 아니다.

legacy `candidateVersion:"6"`은 `{intent,cueRefs?,memoryUses}`와 기존 memoryUpdate·focus 계약을 유지하며 v7의 goalId·taskUpdate·목표 유지 규칙을 소급 적용하지 않는다. candidate 5는 focus 두 필드를 요구하며 memoryUses·memoryUpdate 검증이 없다. candidate 4는 source-bound choice 형식으로 focus가 필수가 아니고, candidate 3은 직접 action과 필수 `basis.cueRefs`·`actorState.triggerCueRefs`를 사용하는 명시형 legacy다. 각 버전의 계약을 섞지 않는다. 새 기본 실행은 candidate 7이며 candidate 2는 지원하지 않는다.

상품·목표 focus는 실제 기억과 구분한다. 상품을 좋아하거나 관심을 보인다고 해서 목표가 바뀌지 않으며, 목표 focus와 구매가 다르다는 사실은 그대로 기록한다. 지식에 목표가 있어도 현재 주의가 다른 곳일 수 있다. 관심 구매를 정답으로 고치거나 mismatch를 제거하지 않는다. source와 실제 상품-목표 matcher는 행동 실행 뒤 audit에만 사용하며, 후보 작성이나 행동 선택을 교정하지 않는다. 실제 간편식품 표지 노출은 실제 카레 상품 페이지 노출과 별도 사건이다. 낯섦, 기억 부담, 관심 노출은 해당 행동과 상황의 coverage 단서이며 그 자체로 표현이 명확하거나 이해됐음을 보증하지 않는다.

개인 지침에 맞는 관심·휴식·도움·재방문·목표 재확인을 상황에 따라 선택한다. 횟수 quota를 채우지 않고, 최단 경로·최적 행동·완벽한 구매 목록을 자동으로 목표로 만들지 않는다. `reason`은 화면에 보인 단서와 관찰 가능한 짧은 행동 설명이다. 장애·연기 사실이나 사적인 사고 과정을 설명하지 않는다.

전체 계획의 `timingProfile` 기본값과 허용값은 `original`이다. 명시적 `compact` 요청은 거절한다. Luna가 제출한 `delayMs`를 보존하고, 개인 보행 기준은 기존 이동 의도로 변환하며 임의 지터나 compact 시간 압축을 추가하지 않는다. 결과는 `generation.timingProfile:"actor-preserved-v1"`·`generation.actorStateVersion:"1"`을 기록한다. 상세 반응 기준을 참고해 상황에 맞는 지연을 선택하되 매번 중앙값을 따르거나 시간이 부족하다는 이유로 모든 판단을 짧게 맞추지 않는다. 이동 시간은 별도의 물리적 보행이며 기존 충돌·이동 입력 상한과 정상 게임 루프를 유지한다.

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

페르소나의 성격 정의는 기존 JSON 하나다. 지민의 관심 전환과 목록을 통한 복귀, 서연의 비교·확인과 신중함, 민수의 익숙한 상품 선택과 여러 조건의 부담을 가능한 상황에서 표현한다. 낯선 통로에서 망설이거나 되돌아가기, 관심 상품을 살피기, 목표를 잠시 놓쳤다가 목록·단서를 보고 복귀하기를 허용한다. 행동마다 구매 진전·최단 경로를 요구하지 않는다. 실수·방황 횟수를 채우거나 모든 선택을 정답으로 교정하지 않는다. 상황에 따라 안정적으로 수행하는 강점과 일반적인 성인의 취향·목표도 유지한다.

`reason`은 눈에 띈 표시, 익숙한 상품, 이미 한 확인, 목표를 다시 확인하는 계기처럼 짧은 행동 설명이다. 장애·연기 사실, 유아적 말투, 실제 내면의 사고를 측정했다는 표현을 넣지 않는다. 이유 문구만으로 상황을 실제로 이해하거나 기억·학습했다고 판정하지 않는다.

## 컴파일·실패·종료

Node는 고정된 snapshot에서 후보를 처음부터 실행한다. 행동 직전 공용 `observeActor()`가 실제로 보여주는 단서만 지식 원장에 넣고 `basis`의 알려진 참조·대상 단서와 `actorState`의 알려진 목표·계기 단서를 검사한다. 인물의 지식에는 전체 지도·매대 목록·목표 정답이나 모델이 자체 작성한 발견 사실을 넣지 않는다. 가시성·패널·선반 페이지·재고도 확인하고 기존 `projectDecision`, `TraceGuard`, 게임 어댑터를 사용한다. 최종 trace도 기존 공용 구조/의미 검증을 통과해야 한다. 이동은 기존 보행 입력으로 변환하고 어댑터의 한 번에 32 이하인 이동 입력 상한을 유지하며 순간이동을 추가하지 않는다. 잘못된 이동 참조·미발견 근거·시점에 불가능한 행동을 대신 실행 가능한 정답 행동으로 바꾸지 않는다.

첫 의미 오류가 나면 실패 위치·직전 상태·적용된 앞부분을 진단으로 반환한다. 실패한 앞부분은 완성 trace나 실제 플레이 기억이 아니다. `maxRepairs:0`이면 추가 후보를 제출하지 않는다. `maxRepairs:1`이면 오류의 `repairContext`가 제공하는 `baseAttempt`, `fromDecisionIndex`, 최신 `before`·`choiceFrame`·지식에 맞춘 suffix를 `repair_whole_trace`로 한 번만 보낼 수 있다. 권장 repair payload는 `{ "decisions": [...] }`이며 서버가 요청·버전·수정 시작 위치를 채운다. 기존 전체 wrapper에 명시한 값도 같은 요청과 정확히 일치해야 한다. 서버는 수락한 정확한 prefix를 보존하고 suffix의 끝도 원래 후보의 종료 의도와 일치시킨다. 문제가 된 필드·단서·조작 참조만 기술적으로 바로잡고, 미관찰 근거·스키마·조작 오류를 자발적 포기로 대신 끝내지 않는다. 원래 후보가 `giveUp`으로 끝나지 않았는데 수정 후보에 새 `giveUp`을 넣으면 `REPAIR_CHANGED_ENDING`으로 거절한다. 성공/실패 목표를 바꾸거나 정답률·경로·구매 성공을 높이기 위한 최적화도 수정 대상이 아니다. 원본·수정본과 실제 제출 횟수를 보존한다. 최대 수정 횟수에 도달하면 실패로 보고하고 새 조건을 같은 표본인 것처럼 이어 붙이지 않는다. 실행 전 형식 검사에서 수량 등의 누락이 발견되면 모든 해당 인덱스를 함께 반환하며 아직 수락한 prefix는 없다. 이때 before·choiceFrame이 null이면 원래 bundle의 initialChoiceFrame을 출발 상태로 사용해 전체 suffix를 수정한다.

100회 전에 배열이 끝나면 `submit`이나 `giveUp`으로 자연스럽게 종료돼야 한다. 이 두 행동 이후 단계는 기존 생성기가 붙이므로 후보에 `awaitReviewAccepted`, `skipRating`, `leave`를 직접 넣지 않는다. `submit`은 분석 요청 **접수 대기 후 나가기**, `giveUp`은 기존 포기 흐름이다. 포기를 오류 복구나 강제 종료 대신 삽입하지 않는다.

100번째까지 종료하지 않은 경우에만 기존 시스템 계산을 붙인다. 당시 장바구니를 유지하고 계산대 이동·필요한 직원 호출·제출·접수 대기·나가기를 수행한다. 구매 목록에 맞춰 상품을 넣거나 빼지 않는다. 시스템 구간은 `generation.systemCompletion`으로 구분하고 개인의 독립 완수/성장으로 집계하지 않는다. 앱 실행·DB 수신을 확인한 뒤에도 개인 기억에는 시스템 구간 이전의 경험만 저장한다.

## 출처·개인 기억·비교

새 trace는 actor 정책 `whole-trace-v3`, trace schema `2`/policy `6`, `planningMode:whole-trace`를 유지한다. `observationScope:whole-world`는 모델이 받는 실제 세계 참고 범위이며 `actorKnowledgeScope:observed-and-remembered`는 선언 지식의 범위다. 새 기본 bundle/candidate는 8/7이고 `actorStateVersion:"1"`은 유지한다. candidate 7 knowledge audit는 `auditVersion:"6"`, `taskContract:"persistent-task-memory-v1"`·`taskStateVersion:"persistent-task-v1"`와 기존 `memoryContract:"working-memory-v1"`·`cognitionVersion:"context-cognition-v1"`를 기록한다. source-bound 선택과 focus는 `actionBinding:"state-bound-choice-v1"`·`focusContract:"explicit-focus-v1"`로 기록한다. legacy 6은 audit 5와 기억 계약, 5는 audit 4와 focus 계약, 4는 audit 3, 3은 audit 2와 `actionBinding:"explicit-legacy-v3"`를 유지한다. goal/product matcher 전이는 행동 뒤 sidecar에서만 계산한다. 기존 후보·trace와 v1/v2 trace 재생을 유지하고 새 계약으로 소급 수정하지 않는다. 요청의 snapshot·프로필·seed·기억은 준비 시 고정한다. 새 모델 출력의 seed 재현은 보장하지 않으며 검증된 후보·trace로 재현한다.

성공 결과의 `knowledgeAuditPath`·`knowledgeAuditHash`는 `<trace 경로>.knowledge-audit.json`을 가리킨다. candidate 7 audit 6에는 관찰 사실 원장, 계산한 열린 목표·작업 기억, goalId·taskUpdate·memoryUses·memoryUpdate와 출처, 단계별 actorState·선언 및 파생 근거·실제 선택을 기록한다. candidate 6/5/4/3은 각각 기존 audit 5/4/3/2를 유지한다. 모든 버전은 전체 세계가 모델 문맥에 들어 있다는 한계를 남긴다. 원장·기억·단서 검증은 실제 Luna의 인지 과정·앱 재생·DB 수신·임상적 재현을 검증하지 않는다. 감사 자료를 앱 행동 로그에 임의로 넣거나 실제 사람의 발화로 표시하지 않는다.

역할 표현의 검토는 별도 `<trace 경로>.persona-review.json`과 결과의 `personaReviewPath`·`personaReviewHash`·`personaReview`에 남긴다. `status:"review"`이면 경고의 코드·해당 판단 인덱스·설명을 보고한다. `status:"clear"`는 자동 검사에서 경고가 발견되지 않았다는 뜻이며 페르소나의 임상적 타당성이나 완전한 재현 판정이 아니다. 경고는 구조·지식·가시성·재고·보행 오류와 분리하고, 경고를 없애려고 행동을 교체하거나 실수·방황·도움·포기를 강제하지 않는다. 기술적으로 유효한 trace에도 표현을 검토할 이유가 있을 수 있으므로 파일 저장/검증 성공과 역할 검토 결과를 함께 보고한다.

역할 검토의 `auditVersion`은 `actor-fidelity-v2`다. 실제 accepted `add`/`remove`에 대한 상품→목표 연결과 focus 전이를 행동 실행 뒤 비교한다. 해당 인물의 프로필에 목록 재확인 습관이 있는 경우에만 그 습관을 검토한다. 지민은 실제 다음 목표 상품을 구매하기 전에 이전 구매 뒤 실제 `readList`가 없으면 `NEXT_GOAL_WITHOUT_LIST_RECHECK`를 검토한다. 단, 실제 구매와 선언 focus goal이 불일치하면 possible mistake로 보고 이 습관 위반 판정은 보류하되 실제 상품 transition facts는 보존한다. 관심 후 실제 goal-product 구매가 있으면 `activity:"shop"` label 여부와 무관하게 복귀를 살핀다. `recover`라는 활동 label만으로 관심 복귀 근거를 대신할 수 없다.

경고 코드는 `UNIFORM_REACTION_DELAYS`(반응 지연이 한 값으로만 반복), `NEXT_GOAL_WITHOUT_LIST_RECHECK`(실제 다음 목표 구매 전, 이전 구매 후 `readList` 재확인 없음), `INTEREST_RETURN_WITHOUT_RECORDED_RECOVERY`(관심 복귀에 기록된 근거 없음; recover label만으로는 부족), `FOCUS_ACTION_MISMATCH`(현재 상품 focus와 add/remove 대상 불일치), `FOCUS_GOAL_SELECTION_MISMATCH`(실제 add 목표와 goal focus 불일치), `UNCERTAINTY_CLEARED_WITHOUT_RECORDED_CUE`(실제 확인/관찰과 관련된 cue 없이 uncertainty 해소 선언)다. `FOCUS_GOAL_SELECTION_MISMATCH`는 실제 구매가 possible mistake일 수 있음을 나타내는 soft warning이다. goal mismatch가 있으면 `NEXT_GOAL_WITHOUT_LIST_RECHECK` 판정은 보류하고 실제 상품 transition fact는 남긴다. 관심 복귀 확인은 관심 뒤의 실제 goal-product 구매를 기준으로 하며 `activity:"shop"`에 한정하지 않는다. `recover` label 단독은 근거가 아니다. 모든 warning은 행동이나 구매를 교정하지 않는다.

`summary`는 `decisions`, `distinctReactionDelays`, `activityCounts`, `maximumHeldGoals`, 실제 선택 목표 기준 `goalSwitches`, `focusGoalSwitches`, `productSwitches`, `interestReturns`를 담는다. `focusCoverage`는 `recordedDecisions`와 `unrecordedDecisionIndexes`를 구분한다. `transitions`의 purchase-goal, focus-goal, interest-return, uncertainty-cleared 항목은 `decisionIndexes`·`cueRefs`와 적용 가능한 `checkDecisionIndexes`, `listRechecked` 등을 보존한다. purchase-goal 항목에는 `selectionFocus:"consistent"|"unrecorded"|"different-goal"|"no-goal"`을 기록한다. `situations.unfamiliar`는 시작 orientation·국소 cue·새 매대를, `memoryLoad`는 실제로 읽은 목표가 용량을 넘었는지·선언된 uncertainty·check 인덱스를, `interestExposure`는 `categorySignDecisionIndexes`, `productDecisionIndexes`, `interestDecisionIndexes`를 각각 기록해 실제 category sign과 상품 노출을 구분한다. 이는 행동 해석에 필요한 coverage와 상황 정보다. 목표 수가 설계 용량을 넘었다는 기록은 임상적 기억 부담 측정이 아니며, 낯섦·관심 노출도 표현이 명확하거나 이해됐다는 보증이 아니다. 경고가 없다는 `clear` 역시 표현의 완전성·임상적 타당성을 보증하지 않는다.

candidate 7의 `personaReview.taskExpression`은 `task-expression-v1`로 이동 중 목표 기억, 관심 동안의 pending 목표, 불확실성과 이후 회복, 실제 관심 상품 focus를 별도로 기록한다. coverage가 `unexercised`이면 기억 부담·회복을 관찰하지 못한 표본이며 개선 증거로 삼지 않는다. 열린 목표가 유지됐다는 사실만으로 어려움이 발현됐다고 판정하지 않는다. 불확실성 뒤 회상·guess·실제 확인이 있었는지 단계의 관찰 시점에 맞춰 살핀다. `INTEREST_PRODUCTS_WITHOUT_FOCUS`와 `UNIFORM_ORIENT_WALK_DELAYS`는 추가 soft warning이다. 관심 매대를 열고 닫은 것, 실제 상품 focus, 종류·맛·규격 비교 행동은 구분하고 reason만으로 비교를 인정하지 않는다. 경로 재방문은 왕복 이동일 수 있어 방황으로 단정하지 않는다. 확인·실수·관심·헤맴 횟수를 강제로 넣어 coverage나 경고를 바꾸지 않는다.

가이드 v2로 준비한 요청에는 별도 `personaReview.annotationReview`(`reviewVersion:"actor-annotation-v1"`)를 기록한다. 자체 `status`, `findings`, 관찰 한계를 가지며 기존 `actor-fidelity-v2`의 최상위 상태·경고 의미를 바꾸지 않는다. `CHECK_LABEL_WITHOUT_OBSERVABLE_CHECK`는 `closeStation`/`closeView`만 수행하면서 `activity:"check"`로 적은 경우를 검토한다. 같은 페이지의 `pause`·`lookAround`·`browse`는 실제 정보를 살펴볼 수 있으므로 이 경고로 단정하지 않는다. 기존 두 focus mismatch도 근거와 함께 옮겨 담고, 각 항목에 `improvementTarget`, `recommendation`, 결정 인덱스·행동·선언·단서의 `evidence`를 제공한다. 이 검토는 기술 실패로 처리하거나 행동·구매를 고치지 않는다. 최상위 `clear`와 주석 검토 `clear`를 구분하며, 과거 가이드에서 항목이 없으면 미실시로 보고한다.

새 개인은 `create_whole_trace_learner`로 만든다. `create_learner`의 기존 provider 정책과 파일을 공유하거나 기존 trial의 정책 값을 수동 변경하지 않는다. 생성된 계획 기억을 실제 경험으로 승격하지 않는다. 실제 앱 replay와 DB receipt를 검증한 개인 경험 파일만 다음 요청의 `learnerFile`로 사용한다.

전체 계획으로 A/B/C 반복 실험을 하려면 [학습 실험 절차](../legacy/learning-trials.md)의 계정·고정 과제·증거 조건을 유지하면서 생성 경로만 다음과 같이 바꾼다.

1. A/B/C 각각 `create_whole_trace_learner({directory,learnerId,memberId,personaId,experimentId,arm})`를 호출한다. 모델·reasoning·정책은 도구가 `gpt-6-luna`/`low`/`whole-trace-v3`로 채운다.
2. `create_learning_trial` 설정에서 같은 세 learner 파일, `model:"gpt-6-luna"`, `policyVersion:"whole-trace-v3"`, 현재 `personaVersion`, 기준·평가·일반 연습 snapshot을 사용한다. 행동 예산은 `generationLimits.maxActions:100`을 사용한다. 이전 전체 계획 정책의 개인 archive·trial 파일을 바꾸지 말고 새 개인·trial을 만든다.
3. 매 회차 `prepare_whole_trace({trialFile,arm,tabId,outputPath,maxRepairs:0})`를 호출한다. B/C 맞춤 연습에는 직전 분석 `READY`와 연결된 실제 `jobFilePath`·`generationFilePath`도 제공한다. trial이 seed·페르소나·경험·생성 조건을 고정하므로 수동 `learnerFile`·`attentionExperience`를 함께 전달하지 않는다.
4. 반환된 bundle로 Luna가 전체 후보를 작성하고 `submit_whole_trace`에 제출한다. 기존 provider용 `generate_learning_round`를 여기서 다시 호출하지 않는다. 생성 결과의 `trialFile`, `arm`, `roundId`를 후속 증거 연결에 사용한다.
5. 앱 재생·DB 수신 확인 뒤 기존 `record_learning_round`로 검증된 경험을 기록한다. 실행·저장·분석 실패는 기존 `record_learning_failure`로 남긴다. 다음 맞춤 회차에는 실제 분석과 퀘스트 로딩을 완료하고 새 시작 전 탭을 전달한다. 마지막은 `compare_learning_trial`로 비교한다.

회차 준비와 후보 생성만으로 앱 로그인·재생·DB 저장·AI 분석이 실행되지는 않는다. 시스템 계산 회차의 개인 기억은 actor 앞부분에 한정하고 독립 완수 점수에서는 제외한다.

actor 정책 이름이 같아도 bundle/candidate·taskContract·memoryContract·cognitionVersion이 다른 표본은 같은 생성 조건으로 묶지 않는다. 모델 문맥에는 세계 참고 자료로 전체 맵·목표·상품·재고가 들어 있다. 인물 지식과 행동 근거는 단계별로 감사하지만 이 사실만으로 모델 내부의 숨은 정보 영향을 증명할 수는 없다. 기존 제한 관찰 모드와 정보 노출 조건을 같다고 보고하거나 이전 전체 계획 정책의 결과와 같은 조건으로 수행 향상을 비교하지 않는다. 분석 서버의 결과나 숨은 성공 판정을 플레이 기억에 주입하지 않는다.

숨은 배치 검사는 현재 화면·개인·기억이 같은 상태에서 화면 밖 상품 배치만 바꿔 실시한다. 발견 전에는 미발견 상품·장소를 행동 근거로 사용할 수 없어야 하고, 배치 차이가 실제 화면에 나타난 뒤에는 다른 선택이 가능하다. 가시성과 알려진 단서의 변화는 컴파일러 검사로 확인하고, Luna가 발견 전에 숨은 목표를 향하는 편향은 별도 반복 표본으로 조사한다. native Luna 새 호출의 출력은 같은 seed로도 동일성이 보장되지 않으므로 두 새 호출의 행동 배열이 다르다는 사실만으로 정보 누출이라고 판정하지 않는다. 하나의 근거 감사 통과나 표본 차이만으로 페르소나의 인지·적응 특성 재현 또는 임상적 타당성을 입증했다고 보고하지 않는다.

속도는 입력 준비부터 최종 검증·파일 저장까지 측정한다. 후보 작성·제출·컴파일·수정 소요를 포함하고 실패도 보고한다. `planningAndDeliveryWallMs`는 요청 생성부터 최종 후보 컴파일 시작까지의 누적 간격으로, 작업 대기·모델 판단·도구 전달을 포함한다. 수정 제출이 있으면 이전 시도의 컴파일·진단 저장 시간도 이 간격에 포함되므로 순수 모델 추론이나 통신 시간으로 해석하지 않는다. `compileAndValidationMs`·`persistenceMs`는 최종 성공 시도의 처리 시간이고 `wholeRequestWallMs`는 요청 생성부터 trace 저장까지다. 직접 확인한 계획 제출 횟수와 도구 호출 수를 기록한다. Codex 내부 추론/API 횟수는 제공되지 않으면 미확인으로 남긴다. 모델 전체 출력 1회가 항상 더 빠르다고 보고하지 않으며 긴 입력·출력과 수정 비용을 기존 모드와 같은 게임·페르소나 조건에서 비교한다. 로컬 검증 성공은 화면 재생·DB 저장·분석 `READY`의 증거가 아니다.
