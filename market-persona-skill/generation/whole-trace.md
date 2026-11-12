# whole-trace 생성: 작성 보조 모드

배우(Luna)가 bundle을 한 번 받고, **결정을 하나씩 작성해 시뮬레이터 검증을 받으며** trace를 완성한다. 시뮬레이터는 결정마다 최종 제출과 같은 실행 검증기로 지금까지의 결정을 오프라인 실행해, 통과하면 그 시점의 화면·선택지를 돌려주고 거절하면 이유를 돌려준다. 행동·수량·종료와 기억·상태 선언은 계속 배우가 하며, 코드가 대신 고르거나 채우지 않는다. 생성에는 학교 Qwen 서버나 SSH 터널이 필요하지 않고, 앱 재생은 요청받았을 때만 별도로 한다.

## 이 폴더의 문서

| 문서 | 읽는 때 |
| --- | --- |
| 이 문서 | 생성을 시작할 때: 실행 흐름, 우체통, 작성 명령 |
| [결정 작성 규칙](decision-rules.md) | 결정 하나의 형식·상태 전이를 확인할 때 |
| [후보 7 계약](candidate-contract.md) | 지식·기억·목표·화면별 선택의 의미를 확인할 때 |
| [방향 이동 옵션](movement-options.md) | 방향 이동 옵션을 켠 요청일 때만 |
| [응답 해석](authoring-responses.md) | 메뉴·참고 계산값·거절 응답을 해석할 때 |
| [제출·수정·실패 처리](submit-and-repair.md) | 제출이 실패했거나 repair가 필요할 때 |
| [결과 파일·감사·비교 조건](results-and-audit.md) | 생성이 끝난 뒤 결과를 분석·비교할 때 |

## 실행 흐름

배우 세션은 실제로 `gpt-6-luna` / reasoning `low`로 설정한다. MCP는 모델을 전환하거나 배우 세션을 자동으로 만들지 않으며, 생성기가 남기는 모델 라벨은 요청된 설정일 뿐 실제 호출 모델의 증거가 아니다. 감독은 요청 하나를 [우체통](#소켓-없는-단일-요청-전달)으로 소유하는 방식을 기본으로 쓴다. 우체통 대신 지속 실행 MCP·`cli.cjs interactive`·독립 호스트(`host-start`)와 [author-whole 진입점](#작성-보조-모드와-author-whole-진입점)을 써도 도구와 순서는 같다.

1. **준비(감독):** `list_personas`로 현재 버전을 확인하고 시작 전 `snapshotFilePath`를 준비한다(앱 재생까지 요청받았다면 [앱 연결](../replay/app-replay.md)으로 탭을 준비한다). `prepare_whole_trace`에 `personaId`, 새 `seed`, `tabId`·`snapshot`·`snapshotFilePath` 중 정확히 하나를 전달한다. 우체통에서는 이 인자를 `prepare.json`으로 감싸 `serve --prepare-file`로 시작한다. `maxRepairs`는 기본 0이며, 기술 수정 재제출을 허용할 때만 1로 둔다. 결과의 `requestId`와 `bundle.inputHash`는 후보 밖의 출처 기록에 남긴다.
2. **배우 시작(감독):** 먼저 `node market-simulator/whole-trace-actor-input.cjs <slot>/owner/prepare-response.json <slot>/actor-input.json`으로 배우 입력과 배우 지시문(`<slot>/actor-instructions.txt`)을 만든다. 준비 응답 전체를 배우에게 주지 않는다. 지시문은 `market-simulator/actor-instructions/`의 고정 템플릿(기본 `authoring-v1`: generation-isolation r2·procedure-loop A군·trait-v3 r6의 지시문 S와 같은 문장)에 슬롯 경로만 채운 것이며, 감독이 새로 쓰거나 고치지 않고 첫 메시지로 그대로 준다. 다른 문장의 지시문이 필요한 실험은 새 버전 템플릿을 추가해 `--template`으로 고르고 ID·SHA를 기록한다. 도구는 우체통이 `<slot>/owner`에 있어야 지시문을 쓰고, 기존 파일은 덮어쓰지 않는다. 도구는 `worldReference`·`choiceCatalog`·`sourceFiles`·`diagnosticDirectory`를 빼고, 이 키를 쓰라고 하던 안내 문장(걷기·계산대 별칭·한 번에 제출 등)을 작성 보조 모드용으로 바꾸며, 맨 앞 `actorInputProjection`에 제외 키와 바꾼 문장을 기록한다. 식별 정보(`requestId`·`inputHash`·`authoringGuide.identity`)는 바꾸지 않는다. 출력 요약은 슬롯 기록에 남긴다. 그다음 한 인물·한 조건·한 seed·한 request만 받는 새 배우 문맥에 이 지시문만 첫 메시지로 준다(지시문이 같은 슬롯의 `actor-input.json`을 읽게 한다). 다른 요청의 bundle·목표 ID·선택지를 같은 문맥에 주지 않는다. 서버는 이 분리를 강제하거나 입증하지 않는다. 이 사본은 작성 보조 모드 전용이며, 후보 전체를 한 번에 쓰는 [레거시 방식](../legacy/README.md)에는 쓰지 않는다.
3. **작성 시작(배우):** `bundle.authoringGuide`의 식별 정보·문법·예제를 먼저 확인하고 `begin_whole_trace_authoring({maxRewritesPerDecision:3})`을 호출한다. 응답의 첫 메뉴에서 첫 결정을 고른다.
4. **결정마다 반복(배우):** `append_whole_trace_decision({decision})`으로 결정 하나를 보낸다. `decision.choiceRef`에는 `{choiceId,quantity?}`만 쓰고 `source`는 생략한다. 각 결정에는 행동 직전의 `actorState`, `basis.goalId`·`memoryUses`와 필요한 `actorState.taskUpdate`·`memoryUpdate`를 선언한다([결정 작성 규칙](decision-rules.md)).
   - **통과:** 응답 메뉴의 현재 관찰(`currentObservation`)과 허용 선택지(`choiceIds`)로 다음 결정을 쓴다. 가장 최근 메뉴에 없는 선택지는 쓰지 않는다.
   - **거절:** `issues`와 `rewrite`를 보고 같은 결정을 재작성 상한 안에서 고쳐 쓴다. 응답의 의미는 [응답 해석](authoring-responses.md)을 따른다.
   - 메뉴를 다시 읽어야 하면 `whole_trace_authoring_menu({})`를 호출한다.
5. **종료와 제출(배우):** 종료 행동(`submit`·`giveUp`)이 수락되거나 100행동 상한에 이르면 `finish_and_submit_whole_trace({})`를 호출한다. 우체통이 내부에서 `finish_whole_trace_authoring`으로 후보를 받아 `candidate.json`에 저장하고, `submit_whole_trace`로 제출·검증한 뒤 trace 파일과 `completion.json`을 남긴다. 우체통 없이 작성했다면 `finish_whole_trace_authoring` 결과의 candidate를 그대로 `submit_whole_trace`에 제출한다. 종료 전 `finish`는 [요청 실패](submit-and-repair.md#최종화와-계산대-참조-별칭)가 된다.
6. **실패 시(감독):** 제출 결과가 `canRepair:true`이고 준비할 때 `maxRepairs:1`이었다면 [repair 절차](submit-and-repair.md)로 실패 지점 뒤쪽만 한 번 고친다. 실패를 자발적 포기나 다른 표본으로 바꾸지 않는다.
7. **끝:** 생성·검증만 요청받았으면 여기서 끝낸다. 앱 재생까지 요청받았으면 `validate_trace` → `play_trace` → `replay_status`를 [앱 연결과 재생](../replay/app-replay.md)에 따라 실행한다. 미션 snapshot이 달라졌으면 새 요청을 준비한다.

`begin_actor_plan`·`begin_feedback_plan` 등 다른 생성 경로의 도구를 이 흐름에 섞지 않는다. 생성 결과의 audit·persona review는 [결과 파일·감사·비교 조건](results-and-audit.md)에서 해석한다.

## 소켓 없는 단일 요청 전달

배우 클라이언트의 종료와 요청 프로세스의 수명을 분리할 때 감독자는 다음 파일 mailbox를 사용할 수 있다. `prepare.json`은 readiness가 준 `prepareWholeTrace`를 변경 없이 `{tool:"prepare_whole_trace",arguments:...}`로 감싼 파일이다. owner 디렉터리는 새 경로여야 하며 이전 세션을 복원하지 않는다. 이 경로는 소켓을 열지 않는다.

```sh
node market-simulator/whole-trace-mailbox.cjs serve /absolute/new-owner --prepare-file /absolute/prepare.json
```

감독자가 이 프로세스를 유지하고, 슬롯별 새 배우 문맥에는 그 owner의 `prepare-response.json`에서 `whole-trace-actor-input.cjs`로 만든 `actor-input.json`만 실험 입력으로 준다. 배우가 작성한 도구 요청은 `{operationId:"append-001",tool:"append_whole_trace_decision",arguments:{decision:...}}`처럼 별도 JSON 파일 하나에 저장하고 다음 명령으로 전달한다. requestId는 owner가 고정한 값만 붙인다. 후보·행동·기억 필드는 채우지 않는다.

```sh
node market-simulator/whole-trace-mailbox.cjs call /absolute/new-owner --operation-file /absolute/operation.json
```

begin/menu/append/finish/status와 inline repair는 기존 도구 이름을 쓴다. 최종 제출은 `{operationId:"finish-submit-001",tool:"finish_and_submit_whole_trace",arguments:{}}`다. 이 전달 도구가 finish 응답의 **candidate 객체 하나만** owner의 `candidate.json`에 원자적으로 저장하고, 재파싱·동일성을 검사한 뒤 기존 submit과 status를 호출한다. `jq '.candidate' responses.jsonl`처럼 여러 응답에서 후보를 추출하거나 배우가 후보 파일을 다시 작성하지 않는다. 행동·종료·수량·기억·repair 예산은 바뀌지 않는다.

완료 상태, 제출 검증 성공, 실제 저장 파일과 별도 validate 성공을 확인해야 `completion.json`을 남기고 owner가 정상 종료한다. prepared나 수정 가능한 invalid, 전달 예외에서는 owner를 유지한다. 배우 클라이언트의 EOF나 종료는 owner 종료를 뜻하지 않는다. 응답이 유실되면 같은 operationId·동일 입력으로 재전송하며 이미 처리된 행동을 다시 실행하지 않는다. 명시적 오류를 받은 뒤 기술 내용을 고친 요청에는 새 operationId를 쓴다. 확정된 전달 오류 뒤에도 후보 내용은 그대로 두고 새 전달 operationId로 재전송할 수 있으며, 엔진의 동일 후보 캐시가 제출 횟수를 보존한다. 전달 재시도는 새 actor 표본 생성이나 의미 변경을 허용하지 않는다.

배우 도구는 새 prepare, requestId 교체, close/abort를 제공하지 않는다. 감독자의 중단은 `node market-simulator/whole-trace-mailbox.cjs abort /absolute/new-owner --reason "중단 사유"`로 따로 기록한다. SIGTERM과 강제 종료도 완료로 간주하지 않는다. 상태 확인은 `status /absolute/new-owner`를 사용하며, 죽은 프로세스의 파일을 새 요청으로 자동 복원하지 않는다. 기존 interactive·socket host 경로와 저장 결과는 그대로 유지한다.

## 작성 보조 모드와 author-whole 진입점

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
