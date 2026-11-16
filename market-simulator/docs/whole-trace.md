# Luna 전체 계획 상세

[README](../README.md)에서 분리한 whole-trace 작성·후보 계약·이동 옵션·이동 그래프 진단의 상세다. 에이전트 절차는 [스킬 문서](../../market-persona-skill/generation/whole-trace.md)를 따른다.

## Luna 전체 계획 생성

실제 Codex 세션을 `gpt-6-luna` / `low`로 설정하고 지속형 MCP 또는 `node market-simulator/cli.cjs interactive`에서 실행한다. 배우와 분리한 오프라인 요청 호스트는 아래 `host-start`로 시작할 수 있다. MCP는 모델을 전환하거나 Luna 세션을 자동 생성하지 않는다. 다른 모델의 감독 세션은 사용자가 이양을 허용한 기존 Luna 세션에 전체 계획 작성을 맡긴다. 서버의 모델 라벨은 실제 세션 설정·내부 API 호출 횟수의 증거가 아니다. 전체 계획 생성에는 학교 Qwen 서버·API 키·SSH 터널이 필요하지 않으며 앱 재생·분석은 기존 서비스 연결을 사용한다.

한 인물·한 조건·한 seed·한 request/bundle마다 새 actor 작성 문맥을 사용하고 저부하·고부하 bundle을 같은 문맥에 함께 주지 않는다. `requestId`·`bundle.inputHash`를 후보 출처로 기록하고 새 `bundle.authoringGuide`(`authoringVersion:"2"`)의 식별 정보·문법·상태 전이 예제를 확인한다. 저장된 가이드 v1은 그대로 보존한다. 호스트 MCP는 여러 요청을 관리할 수 있지만 서버가 actor 문맥 분리를 강제하거나 입증하지는 않는다. `taskUpdate`는 한 건도 배열이며 `basis.intent`와 `actorState.activity`의 허용값은 서로 다르다. 직전 행동 결과와 같은 결정의 taskUpdate를 반영한 행동 직전 상태를 작성한다. 세부 규칙은 [작성 시점과 문법 확인](../../market-persona-skill/generation/decision-rules.md)을 따른다.

1. `prepare_whole_trace({personaId,seed,tabId})` 또는 시작 전 `snapshot`/`snapshotFilePath`로 불변 입력 패키지를 준비한다. 출력은 `{requestId,bundle}`이다. `outputPath`, `learnerFile`, `maxRepairs`도 지정할 수 있다.
2. Luna는 전체 맵·상품·재고·목표를 다음 화면과 행동 결과를 예상하는 세계 참고 자료로 사용한다. 인물의 선택에는 그 시점에 보이는 단서·발견 기억·같은 프로필 JSON의 상세 개인 지침을 사용해 **전체 행동 배열과 단계별 상태·근거를 직접** 작성한다. 아직 읽지 않은 목록·열지 않은 상품 페이지·화면 밖의 미발견 위치는 인물이 알고 있는 사실이 아니다. 코드가 행동마다 정답이나 확률 선택을 대신 넣지 않는다.
3. `submit_whole_trace({requestId,candidate})` 또는 `{requestId,candidateFilePath}`로 전체 배열을 제출한다. Node가 기존 attention loop·`projectDecision`·`TraceGuard`·게임 어댑터로 컴파일하고 최종 구조/의미 검증 후 파일을 저장한다. 정상 흐름에서는 별도 finalize가 필요 없다. `whole_trace_status({requestId})`로 상태와 저장 결과를 다시 확인할 수 있다.
4. 요청이 생성·검증뿐이면 파일 저장에서 끝낸다. 앱 실행까지 요청받았다면 `validate_trace` → `play_trace` → `replay_status`로 전체 trace를 전달하고 실제 실행을 확인한다.

#### 결정별 오프라인 작성

작성 JSON은 `node market-simulator/cli.cjs author-whole request.json` 또는 `node market-simulator/cli.cjs author-whole - < request.json`으로만 전달한다. JSON은 `{contextFilePath,operationId,tool,arguments}`이며 스크립트 경로나 추가 위치 인자는 받지 않는다. 준비 담당자가 저장한 `context.json`에서 전송용 `hostDirectory`·`requestId`를 읽고, 요청 최상위나 arguments에 두 값을 다시 적으면 값이 같아도 `AUTHORING_CONTEXT_OVERRIDE`로 연결 전에 거절한다. 파일 입력의 상대 contextFilePath는 그 요청 파일 디렉터리, stdin은 현재 작업 디렉터리 기준이며 context 내부 상대 hostDirectory는 context 파일 디렉터리 기준이다.

예를 들어 작성 시작 입력은 `{"contextFilePath":"context.json","operationId":"authoring-begin-1","tool":"begin_whole_trace_authoring","arguments":{"maxRewritesPerDecision":3}}`이다. 같은 준비 요청에서 `begin_whole_trace_authoring` → `whole_trace_authoring_menu` / `append_whole_trace_decision` → `finish_whole_trace_authoring` → `submit_whole_trace`를 사용한다. append의 arguments는 `{decision}`, finish·상태 조회는 `{}`, 제출은 `{candidate}` 또는 `{candidateFilePath}`다. candidate·repair 내부의 requestId와 모든 행동·상태 값은 그대로 기존 검증기에 전달하며 누락·불일치를 자동 수정하지 않는다. 전송 안내는 `transportRevision:"prepared-context-v1"`로 구분한다.

결정마다 기존 실행 검증기를 접두 구간에 재사용한다. 거절 시 같은 결정을 기본 최대 3회 다시 쓰며 `maxRewritesPerDecision`으로 설정한다. 이 예산은 최종 제출 뒤 `maxRepairs`와 별도다. 메뉴의 압력/상태·관찰 상품·열린 목표는 참고용 계산값으로, 보조기는 `uncertainGoalIds` 등 행동·상태 선언을 채우거나 수정하지 않는다. 기본 압력은 직전 활동·추가 지연 0 기준이며 AI가 작성한 다음 활동/지연으로 별도 조회할 수 있다. 결과와 `authoring.jsonl`, 호스트 저널에 첫 시도 통과·재작성 횟수·거절 규칙을 기록한다. [입력 형식과 같은 결정 재작성](../../market-persona-skill/generation/whole-trace.md#작성-보조-모드와-author-whole-진입점)을 따른다.

메뉴의 `presentationRevision:"current-choice-menu-v1"`은 `interactionContext`로 매대·장바구니·도움말·직원·계산대 등 현재 메뉴를 설명하고, `availableChoices`에 기존 `choiceIds`와 같은 순서의 행동 이름을 표시한다. `view:"world"`에서도 매대가 열려 있을 수 있다. 전역 catalog나 activeStation만으로 선택 가능 여부를 추론하지 않고 매 결정의 최신 `choiceIds`를 따른다. 거절 응답의 `rewrite`는 같은 결정의 재작성 대기(`awaiting-rewrite`) 또는 소진(`exhausted`), 수락된 결정 수, 남은 횟수를 명시한다. `canRetry:true`는 전체 실패가 아니다. AI가 기존 의도를 유지하며 그 결정의 기술 오류를 다시 작성할 수 있고, 보조기는 대체 행동을 추천·삽입하거나 상태를 채우지 않는다. 수락된 앞부분과 기존 판정·최종 수정 예산은 유지한다.

이전 anchor 실행 메뉴의 `currentObservation`은 `kind:"validated-prefix-observation-v3"`, `acceptedDecisionCount`, `notice`, `observation`과 선택적 `readObjectives`를 제공한다. `observation`은 접두 검증의 공용 `observeActor()`가 반환한 현재 화면 그대로다. 보이는 먼 매대 표지(`near:false`)와 열 수 있는 매대를 구분하고 현재 상품·도움말·화면 단서를 누락 없이 전달한다. 미관찰 상품·목표·지도·추천 경로를 추가하지 않고 기존 선택지 집합·순서를 보존한다. 과거 목록 전용 v1과 구분하며 명시적 directional-v2는 기존 관찰 v2를 유지한다. `readObjectives`는 현재 관찰의 호환 별칭이다. 수락된 `readList` 다음 한 관찰에만 목록이 표시되고, 다음 행동 수락 후 기존 수명대로 갱신된다. 필드 생략은 현재 미표시, `[]`는 표시된 빈 목록이며 과거 목록이나 worldReference로 채우지 않는다. 메뉴 조회·활동/지연 미리보기·거절은 관찰을 소비하지 않는다. `advisory.goalFields:[]`는 활성 기억 필드 없음, `openGoalIds:[]`는 열린 목표 없음, `observedProductIds:[]`는 관찰 상품 없음을 뜻한다. 목록이 표시됐지만 아직 목표를 선택하지 않았다면 이 배열들이 비어 있어도 정상이다. AI가 기존 계약에 따라 목표 선택과 상태를 직접 선언하며 보조기는 자동으로 채우지 않는다.

새 독립 anchor 요청은 `observationVersion:"anchor-visible-structures-v1"`과 `validated-prefix-observation-v4`를 기록한다. 실제 그림 일부가 보이지만 이름표는 읽을 수 없는 진열대는 `visibleStructures`에 `kind:"shelf"`, 일반 라벨, 현재 방향·거리만 표시한다. 화면/HUD에 가린 몸체는 제외하며 카테고리·상품·station ID·좌표·추천 경로는 제공하지 않는다. 이 단서는 현재 관찰에서만 유효하고 다음 관찰에서 사라지면 기억 원장에도 남기지 않는다. 몸체가 보인다는 사실이 매대 열기 가능을 뜻하지 않으며 기존 near 조건·행동 집합을 유지한다. 계약은 inputHash·trace generation·knowledge audit에 연결된다. marker 없는 저장 bundle/trace와 기존 directional·학습 trial은 원래 관찰을 유지한다.

`current-choice-menu-v2`는 같은 메뉴의 `visibleWalkChoices`에 이미 있던 현재 통로 라벨·방향·거리를 `availableChoices`의 해당 이동 ID 옆에도 표시한다. 새로운 장소 정보·추천·좌표를 추가하지 않고 ID·순서·비이동 선택지·행동·시간·종료를 바꾸지 않는다. 저장된 v1 또는 marker 없는 bundle의 메뉴는 기존 표현을 유지한다. 두 표현 수정의 성능 효과는 새 독립 수집으로 확인하며 과거 trace를 재작성하거나 결과가 나올 때까지 반복하지 않는다.


`finish`는 이미 작성한 전체 계획의 최종화다. 종료 없는 100행동 미만 계획을 최종화하면 `AUTHORING_INCOMPLETE_FINALIZATION`으로 원본 수락 prefix를 보존하고 요청을 기술 실패로 닫는다. 그 뒤 새 `giveUp`을 추가하거나 begin·submit·repair로 재개할 수 없다. 작성 중 선택한 자발적 종료는 그대로 허용하며, 아직 거절된 결정의 기술 재작성 대기(`AUTHORING_REWRITE_PENDING`)는 기존 한도에서 유지한다. 이 구분은 `finalizationContract:"incomplete-finalization-fails-request-v1"`로 기록한다.

### 방향 이동 v2 작성 예시

기본 whole-trace는 기존 waypoint 메뉴를 유지한다. `movementVersion:"directional-v1"`은 8방향 조작을 추가하고, `movementVersion:"directional-v2"`는 결정별 prefix 실행 뒤 정확한 연속 위치로 다음 관찰·메뉴까지 갱신한다. v1의 `D<결정 번호>` 계약과 저장 입력은 바꾸지 않는다. v2에서도 8방향은 world 조작이 가능하면 모두 제공하며 HUD·화면 가장자리 가림은 기존 인지 정보에만 적용한다. 실제 충돌과 이동은 기존 motor를 사용하고 `walk` 지름길도 유지한다. 별도 `movementFeedbackVersion:"recent-movement-v1"`을 함께 지정하면 최근 적용 이동의 문장과 현재 보이는 통로의 방문 표시만 추가한다. 이 메모는 방향을 추천하거나 선택지를 제거하지 않는다.

`movementFeedbackVersion:"recent-movement-anchor-v1"`은 `movementVersion`을 생략한 anchor 이동과 `observationVersion:"anchor-visible-structures-v1"` 계약에서만 켠다. 관찰 계약은 새 독립 anchor 요청에서 자동으로 정해지며 기본값은 꺼짐이다. 최근 24행동 안의 자기 accepted 도착 기록을 현재 보이는 걷기 선택지에 ` · 최근에 N번 간 통로`와 `recentVisit:{timesArrived:N}`으로 표시하고, 같은 창의 이동 경험을 `movementNotes`로 전달한다. 선택지 ID·순서·가용성은 유지하며 표시와 메모는 권고가 아니다. `prepare_persona_validation`에서는 별도 실행 설정에 `movementValidationVersion:"1"`과 이 옵션을 지정하며 명세 JSON은 바꾸지 않는다.

`movementFeedbackVersion:"recent-movement-anchor-capacity-v1"`은 같은 anchor 조건에서만 켜는 별도 옵션이다. 기존 24행동 보존 창에 더해 선택된 페르소나의 `spatialMemoryCapacity`를 최근 도착한 서로 다른 통로 수의 상한으로 쓴다. 용량을 넘으면 마지막 accepted 도착이 가장 오래된 통로의 횟수 기록을 모두 지우며, 다시 도착하면 1회부터 센다. 보기만 하거나 메뉴를 조회한 것은 최근성을 갱신하지 않는다. 방향별 `movementNotes`의 24행동 창은 그대로이며 이동 권고·선택지 변경은 없다. 기본 페르소나 값은 모두 96곳이므로 현재 창에서 용량 제한은 걸리지 않는다. 이 값은 합성 구현 설정이며 실측 기억 능력이 아니다. 기본값과 기존 두 피드백 버전은 바꾸지 않는다.

다음은 독립 호스트에서 준비하는 예시다. 부모 디렉터리가 존재하는 새 호스트 경로와 실제 시작 전 snapshot을 사용한다.

```sh
node market-simulator/cli.cjs host-start /absolute/new-host-directory
node market-simulator/cli.cjs host-status /absolute/new-host-directory
node market-simulator/cli.cjs host-call /absolute/new-host-directory --options-file /absolute/prepare-call.json
```

`prepare-call.json`:

```json
{"operationId":"prepare-directional-01","tool":"prepare_whole_trace","arguments":{"personaId":"mild-intellectual-disability-adult","seed":"directional-v2-01","snapshotFilePath":"/absolute/mission.snapshot.json","outputPath":"/absolute/directional-v2-01.trace.json","movementVersion":"directional-v2","movementFeedbackVersion":"recent-movement-v1","maxRepairs":0}}
```

반환된 실제 requestId와 같은 hostDirectory를 `/absolute/context.json`에 저장한다. 이미 있는 hostId·inputHash 등 출처 필드는 보존한다.

```json
{"hostDirectory":"/absolute/new-host-directory","requestId":"RETURNED_REQUEST_ID"}
```

작성 시작 요청 파일은 `{"contextFilePath":"/absolute/context.json","operationId":"begin-01","tool":"begin_whole_trace_authoring","arguments":{"maxRewritesPerDecision":3}}`이다. 모든 작성 호출은 `node market-simulator/cli.cjs author-whole /absolute/request.json`으로 전달한다. 다음은 시작 world 메뉴에서 북쪽 방향을 직접 선택한 append 파일의 완전한 형태다. 시간과 상태는 예시이며 실제 배우가 현재 상황에 맞게 작성한다.

```json
{"contextFilePath":"/absolute/context.json","operationId":"move-01","tool":"append_whole_trace_decision","arguments":{"decision":{"choiceRef":{"choiceId":"moveDirection/north","durationMs":700},"delayMs":900,"reason":"위쪽으로 잠시 걷는다.","basis":{"intent":"explore","goalId":null,"memoryUses":[]},"actorState":{"activity":"orient","task":"통로를 살피며 걷기","heldGoalIds":[],"uncertainGoalIds":[],"focusedGoalId":null,"focusedProductId":null,"orientation":"unfamiliar"}}}}
```

source는 작성자가 공급하지 않는다. 서버가 채운 source.location은 `P`로 시작하는 위치 참조, navigationStateId는 `nav-v2-`로 시작하는 상태 참조다. 내부 연속 좌표·고정 입력·직원 상태·표시 조건에 묶인 불투명한 값이며 좌표나 경로로 해석하지 않는다. 다음 응답 발췌는 형태만 설명하며 실제 이동·선택지는 snapshot과 충돌 결과에 따라 달라진다.

```json
{"accepted":true,"menu":{"expectedSource":{"location":"P<opaque hash>","navigationStateId":"nav-v2-<opaque hash>","phase":"shopping","view":"world","activeStation":null,"pageIndex":null},"currentObservation":{"kind":"validated-prefix-observation-v2","acceptedDecisionCount":1,"notice":"현재 prefix 실행의 표시 정보","observation":{"schemaVersion":"attention-observation-v1","phase":"shopping","view":"world","activeStation":null,"visibleStations":[],"anchors":[],"products":[],"shelf":null,"listAvailable":true,"cart":null,"cashiers":{}}},"movementResult":{"actualDirection":"north","progress":"full","blocked":false},"movementNotes":[]}}
```

공개 메뉴에는 내부 좌표·픽셀 이동량·전역 지도·숨은 목적지를 넣지 않는다. `movementResult`는 실제 이동 방향 또는 `null`, 진행 결과 `full|partial|blocked`, 막힘 여부를 전달한다. 새 관찰에서 실제 표시된 표지·매대·직원·상품만 후속 판단에 사용하며, 최신 `choiceIds`에서 다음 조작을 고른다. 방향 이동의 `choiceRef.durationMs`는 100~2000 정수이고, 판단 지연인 `delayMs`와 별개다. v2는 위치를 waypoint로 스냅하거나 충돌을 우회하는 경로를 추가하지 않는다.

`full`은 입력이 충돌 제약 없이 적용됐다는 뜻이고 목적지 도착을 뜻하지 않는다. `partial`은 충돌로 일부 이동이 제한된 경우, `blocked`는 실제 이동량이 없는 경우다. 막힘 여부 `blocked:true`는 부분 제약에도 표시한다. 이동량이 0이면 `actualDirection:null`이며, 벽을 따라 미끄러진 경우에는 입력 방향 대신 실제 변위 방향을 반환한다.

배우가 원래 종료 의도까지 작성한 뒤 같은 context로 `finish_whole_trace_authoring`(`arguments:{}`), 반환된 candidate의 `submit_whole_trace`를 호출한다. 제출 전에는 `host-status`로 같은 호스트를 확인하고, 최종 제출은 수락된 prefix를 다시 실행해 source와 선택지를 검증한다. 완료 후 `node market-simulator/cli.cjs host-close /absolute/new-host-directory`로 종료한다. 재전송은 아래 호스트 수명 규칙을 따르며, v2를 기존 trial·persona validation slot에 덧붙여 조건을 바꿀 수 없다.

### 검증 run에 이동 옵션 고정하기

새 검증 run에서만 `movementValidationVersion:"1"`을 명시해 이동 계약을 고정할 수 있다. `prepare_persona_validation`에 다음 옵션을 공통 인물·snapshot·seed 설정과 함께 전달한다. 서로 다른 실험군은 서로 다른 새 `runId`를 사용한다.

| 실험군 | 추가 입력 |
| --- | --- |
| 기존 통로 이동 대조군 | `{"movementValidationVersion":"1"}` |
| 연속 위치 방향 이동군 | `{"movementValidationVersion":"1","movementVersion":"directional-v2"}` |
| 최근 이동 단서까지 제공하는 별도 실험 | 위 방향 이동 입력에 `"movementFeedbackVersion":"recent-movement-v1"` 추가 |

예를 들어 원본 네 인물을 유지하는 16칸 방향 이동 run의 interactive CLI 입력은 다음과 같다. 이는 준비 예시이며 모델 생성은 실행하지 않는다. 같은 16칸 대조군은 새 `runId`에서 `movementVersion`만 생략한다. `validationMode:"legacy"`를 명시하므로 traits v2 지침을 원본 인물에 추가하지 않는다.

```json
{"tool":"prepare_persona_validation","arguments":{"validationMode":"legacy","runId":"directional-16-new","outputDirectory":"/absolute/output/new-pilot","snapshotFilePaths":{"low":"/absolute/low.snapshot.json","high":"/absolute/high.snapshot.json"},"personaIds":["mild-intellectual-disability-adult","careful-checker","quick-decider","neutral-adult-control"],"seeds":["idblind-20261031-current-001","idblind-20261031-current-002"],"movementValidationVersion":"1","movementVersion":"directional-v2"}}
```

준비 또는 readiness가 반환한 각 슬롯의 `prepareWholeTrace`를 그대로 사용한다. marker·이동·단서 옵션은 manifest와 모든 슬롯, 준비 요청, bundle, trace generation, knowledge audit에서 같아야 한다. 누락·혼합·기존 run에 사후 추가는 거절한다. 원본 네 인물과 traits 프로필 경로 모두 같은 계약을 사용하며, `directional-v1`·학습 trial에는 이 검증 옵션을 붙일 수 없다. 새 검증 계약의 candidate는 7만 지원한다. 옵션이 없는 기존 버전의 지원 목록과 manifest·trace·측정·보고서에는 필드를 추가하지 않는다.

옵션을 켜면 서버가 수락된 각 결정의 실제 메뉴와 이동 전후 불투명 위치 ID를 `knowledge-audit`의 `navigationEvidence`(`continuous-route-v1`)에 기록한다. 연속 좌표를 격자에 맞추거나 가까운 통로로 추정하지 않는다. 도착은 이미 실제 메뉴에 제공된 anchor와 실행 후 위치가 앱의 도착 허용 거리(1px) 안에 있을 때만 확인하며, 이 분석 증거로 배우 관찰에 숨은 정보를 추가하지 않는다.

`routeRelianceRate`는 방문·미방문 anchor가 함께 제공된 메뉴에서 실제 `walkToAnchor`를 선택한 경우만 분모로 센다. 목적지가 정해지지 않은 `moveDirection`은 해당 비율에서 제외하고 입력 수, 혼합 메뉴에서의 입력 수, 정확히 같은 위치로 돌아온 수, 차단·부분 차단 수, 확인된 anchor 도착 수와 step ID를 별도 진단에 남긴다. 방향 이동의 확인된 도착은 이후 통로 선택의 방문 근거가 된다. 위치·메뉴·실행 결과의 연결이 없거나 모순되면 `null`/`unexercised`와 이유를 남긴다. 같은 위치로 돌아왔다는 사실만으로 익힌 동선을 고수했다고 판정하지 않는다.

legacy와 traits v1의 기존 판정은 유지하고, 새 `movementOpportunities`에 아홉 축의 관찰 기회(11개 지표)와 coverage를 설명용으로 추가한다. traits v2는 명시적 옵션 안에서 새 경로 근거를 사용한다. 보고서 JSON/Markdown에 계약과 기회 표가 포함된다. 기존 어려움·지속·도움 요청 판정과 반복 선택 정의는 그대로여서, 수락됐지만 벽에 막힌 방향 입력을 자동으로 어려움 기회로 세지는 않는다. 이 한계는 파일럿 해석에 함께 기록한다. 두 seed의 소규모 실험으로 성향 차이의 통계적 지지를 주장하지 않는다.

### 포기 표현 실험 옵션 (선택, 기본 꺼짐)

`prepare_whole_trace`에 아래 두 옵션을 따로 또는 함께 줄 수 있다. 생략하면 기존 bundle·inputHash·메뉴가 그대로다. 두 옵션 모두 inputHash에 포함되고 bundle과 trace 메타데이터에 기록되며, 검증 run 슬롯과 learning trial에서는 거절한다.

- `choiceOrderVersion:"give-up-last-v1"`: 작성 메뉴의 `choiceIds`·`availableChoices`와 `initialChoiceFrame`에서 `control/giveUp`을 맨 뒤로 옮긴다. 선택 가능 여부는 바뀌지 않으며 포기는 계속 고를 수 있다.
- `authoringExampleVersion:"walk-while-unseen-v1"`: `authoringGuide.sourceAuthoring.taskDeclarationExamples.walkWhileUnseen`에 열린 목표를 유지한 채 아직 매대가 보이지 않을 때 걷기를 고르는 문법 예시 하나를 더한다. 기존 포기 예시는 그대로 둔다.

목적은 Luna 배우의 조기 포기가 입력 표현(선택지 순서·예시 구성)에 영향을 받는지 가려내는 것이다. 포기를 줄이는 것 자체를 목표로 삼거나 결과를 성능 향상으로 해석하지 않는다.

### 길 찾기 인지 옵션 `wayfindingVersion:"wayfinding-v1"` (선택, 기본 꺼짐)

2026-11-15 실행에서 장애·일반 성인 페르소나 모두 시작 구역에서 매대를 한 번도 보지 못한 채 1분 안팎에 포기했다. 매장 배치를 바꾸지 않고, 배우가 실제로 본 정보로 매장 구조를 추정하고 스스로 판단하게 하는 옵션이다. 행동·경로·상품은 계속 배우가 고른다.

1. **지각**: `observation.boundaries`가 화면의 8방향에 실제로 그려진 것을 알려 준다. `wall`(벽·매장 끝), `fixture`(진열대·계산대 같은 집기), `covered`(화면의 장보기 목록이 바닥을 가림, 벽이 아님), `open`(바닥이 화면 끝까지 이어짐) 중 하나와 거리대를 준다. 좌표·카테고리·경로는 넣지 않는다.
2. **기억**: 메뉴의 `spatialMemory`는 배우가 수락된 관찰과 걷기만으로 만든 대략적인 기억이다. 출발점 기준 어림 걸음(near=1, medium=2, far=3), 훑은 범위, 본 랜드마크·벽, 써 본 회복 전략, 포기 가능 여부를 담는다. 걷기 선택지에는 `visitedTimes`와 "내가 N번 와 본 곳/아직 안 가 본 곳" 표시가 붙는다.
3. **판단**: `actorState.thought`(`noticed`·`hypothesis`·`plan`·`next` 중 하나 이상, 각 200자 이하)에 배우가 자유롭게 판단을 쓴다. 다음 메뉴의 `ownNotes`가 이를 그대로 돌려준다(현재 계획과 최근 4개). thought는 믿음일 뿐 단서 원장이나 상품 위치의 근거가 아니다. `reason`은 지금처럼 관찰 가능한 설명만 쓴다.
4. **포기 조건**: 장보기 화면의 `control/giveUp`은 아래 중 하나를 만족할 때만 메뉴에 나타나고, 컴파일러도 같은 조건으로 검사한다(`WAYFINDING_GIVE_UP_LOCKED`). 포기 결정에는 `thought.plan`이 필요하다. 조건을 못 채운 포기 제출은 기술 오류가 아니라 재작성 대상이며, 다음 초안은 종료 의도와 관계없이 다른 행동을 고를 수 있다. 계산 단계에서는 언제든 포기할 수 있다.
   - 계획 시간이 페르소나 `wayfinding.explorationBudgetMs` 이상이다.
   - 서로 다른 곳을 `minDistinctPlacesBeforeGiveUp` 이상 걸었고, 이용 안내를 봤고, 본 직원이 있으면 말을 걸었다.
   - 3곳 이상 걸었고 본 통로를 모두 가 봤다.
5. **페르소나별 판단 방식**: 각 페르소나 JSON의 `wayfinding` 프로필(`cueLevel`, `planHorizon`, `maxHypotheses`, `memoryForm`, `recoveryOrder`, `thoughtForm`, `basedOn`)이 지시문 절 "길을 찾고 판단하는 방식"으로 렌더링된다. 차이는 탐색 방식에만 두고, 포기 기준은 모든 페르소나가 같다.

`prepare_whole_trace`에서는 `movementVersion` 없이 줄 수 있다. 검증 run에서는 `prepare_persona_validation`에 `{"movementValidationVersion":"1","wayfindingVersion":"wayfinding-v1"}`로 묶어야 하며, 일반 성인 대조군도 이 경로로 실행한다. inputHash, bundle, trace generation(`wholeTraceWayfindingVersion`), knowledge audit에 모두 기록된다.

### `wayfindingVersion:"wayfinding-v2"`

2026-11-15 v1 20회(`output/persona-wayfinding20-20261115-225536`)에서 일반 성인 7건 중 5건이 상품을 다 담고도 계산대를 찾지 못했다. v1 공간 기억은 랜드마크를 최근 본 순서로 12개만 남겼고, 이름이 안 보이는 진열대를 본 위치마다 따로 저장해 앞서 본 계산대가 밀려났다. 포기 조건은 "20곳 걷기 + 안내"로 22~27번째 행동 만에 열렸다. v1은 보관 기록 재현을 위해 그대로 두고, 아래 변경은 v2에만 적용한다.

- **이름 있는 장소는 밀려나지 않는다.** 계산대·출구·입구·직원·매대는 station별로 하나씩 남는다. 계산대 표지는 "· 계산 가능" 같은 상태 표시를 뗀 이름으로 저장한다. 이름이 안 보이는 진열대는 걸음 2칸 단위로 묶은 위치 중 가까운 4곳만 `unlabelledShelves`에 보인다.
- **"대략 저쪽" 감각.** 장소마다 걸어온 기록으로 어림한 위치를 저장하고, 메뉴에 `fromHere`(예: "지금 위치에서 남동쪽 약 9걸음(추정)")를 준다. 벽·집기를 고려한 경로가 아니다.
- **배우가 정하는 목적지.** `thought.destination`에 기억한 장소 이름을 쓰면 다른 목적지를 쓸 때까지 유지되고, `spatialMemory.destination`에 남은 방향과 도착 여부가, 그 방향 45도 안의 걷기 선택지에 "기억한 ○○ 쪽"이 표시된다. 기억에 없는(잊었거나 본 적 없는) 장소는 목적지로 거절된다.
- **페르소나별 기억 흐려짐** (`wayfinding.landmarkMemory`). `stable`은 잊지 않는다(일반 성인). `decaying`은 마지막으로 본 뒤 `protectedDecisions` 동안 보호하고, 이후 결정마다 `fadeProbabilityPerDecision` 확률로 흐려지고(대략 방향만 남음), 흐려진 뒤 `forgetProbabilityPerDecision` 확률로 사라진다. 다시 보면 즉시 선명해진다. 확률은 trace seed·장소·결정 번호로 정하는 결정적 난수라 재검증에서도 같다. 지적장애 페르소나 3명은 10 / 0.05 / 0.03으로 둔 합성 설계값이며 실측 기억 능력이 아니다. 흐려짐·잊음·재인식 기록은 knowledge audit의 `wayfindingMemoryEvents`에 남는다.
- **포기 조건.** 이용 안내를 봤고 본 직원이 있으면 말을 걸었다는 조건에 더해, (a) 계획 시간이 `explorationBudgetMs` 이상이거나 (b) 관찰 기록상 남은 단서가 없어야 열린다. 단서는 본 매대를 아직 열지 않음, 상품을 담은 뒤 본 계산대에 아직 가지 않음, 이름이 안 보이던 진열대에 아직 다가가지 않음이다. 단서는 실제 관찰 기록으로 판단하므로 잊어도 포기가 쉬워지지 않는다. 잊은 단서는 안내문에서 이름을 밝히지 않는다. 열렸을 때 안내문은 "그만두기를 고를 수 있다."뿐이다.
- **thought는 한국어만 허용한다**(한자·가나 거절).

### `wayfindingVersion:"wayfinding-v3"`

2026-11-16 v2로 일반 성인 10회(`output/persona-control10-wayfinding-v2-20261116-022400`)를 돌렸을 때 4회가 매장 안에 들어가지 못한 채 포기했다. 출발점은 매장 앞 벽 바깥 로비이고, 매대는 입구 게이트 안에 있다. 원인은 세 가지였다. 첫째, 포기 조건이 이미 본 매대·계산대만 단서로 세서, 아무것도 못 본 상태가 "남은 단서 없음"이 됐다. 그래서 이용 안내를 보자마자(20~66초) 포기를 고를 수 있었다. 둘째, v1/v2 경계 분류가 모든 충돌 사각형(벽, 로비 의자·화분·ATM)을 "진열대·계산대 같은 집기"라고 불러 배우가 로비 의자를 매대로 알고 쫓아갔다. 셋째, 로비라는 사실과 입구를 지나는 통로라는 표시가 없어, 입구 바로 앞까지 가고도 돌아섰다. v1/v2는 보관 기록 재현을 위해 그대로 두고, 아래 변경은 v3에만 적용한다. 매장 맵은 바꾸지 않는다.

- **경계는 실제로 그려진 것의 이름을 쓴다** (`visibleBoundariesV3`): 벽, 진열대, 계산대, 비품(의자와 탁자·화분·ATM·기둥 등), 사람, 공사 구역, 그 밖의 집기, 목록에 가림, 화면 끝까지 이어진 바닥.
- **지금 서 있는 구역의 종류** (`observation.area`, `spatialMemory.currentArea`·`areasVisited`): 매장 안 판매 구역 / 매장 밖 로비 / 복도 / 엘리베이터 앞 / 건물 출입문 앞. 구역 ID·좌표·인접 정보는 넣지 않는다. 메뉴의 "매장 통로 화면"은 화면 종류이며 위치가 아니라고 안내한다.
- **출입 게이트를 지나는 걷기 선택지 표시** (`observation.gatePassages`, 걷기 라벨 "· 입구를 지나 매장 안으로"): 화면에 보이는 걷기 선택지의 직선 구간이 화면 안에서 입구·출구·옆문 게이트를 지날 때만 붙는다. 어느 쪽으로 갈지 추천하지 않는다. 지나간 게이트는 `spatialMemory.gatesPassed`에 남는다.
- **포기 조건(v3)**: 이용 안내를 봤고 본 직원이 있으면 말을 걸어 봤다는 조건은 그대로다. 그 위에 다음을 둔다. (1) 본 입구로 매장 안에 들어가 보기 전에는 시간이 지나도 잠긴다. (2) 본 통로 중 아직 안 가 본 곳도 단서로 센다. 이런 곳이 남아 있으면 `explorationBudgetMs`가 지나야 열린다. (3) v2 단서(본 매대 미개봉, 담은 뒤 계산대 미방문, 이름 없는 진열대 미접근)는 그대로 유지한다. 그래서 화면에 상호작용할 것이 안 보인다는 이유만으로는 그만두기가 열리지 않는다.
- 페르소나 프로필 형태(`landmarkMemory` 포함)와 thought 규칙(목적지, 한국어)은 v2와 같다.

### `wayfindingVersion:"wayfinding-v4"`

2026-11-16 v3 일반 성인 10회(`output/persona-control10-wayfinding-v3-20261116-103248`) 중 7번은 우유 위치를 물으려 직원 대화를 열었지만 '잠시 멈추기·주변 보기·닫기'만 받았다. 실제 게임(`MarketSimulationScreen`)과 공용 세션(`marketSession`의 `askLocation`), TraceGuard 관찰(`staffLocationHelp`·`locationChoices`)과 trace 재생(`talkToStaff` `openLocationHelp`/`askLocation`/`backToStaff`)에는 모두 있었고, whole-trace 선택지 변환(`wholeTraceChoices.ts`의 `canonicalAction`)만 이 세 버튼을 버리고 있었다. 동시에 포기 조건은 직원 창을 연 것만으로 "직원에게 물어봄"으로 셌다. 게임 코드는 바꾸지 않는다. v1~v3는 보관 기록 재현을 위해 그대로 둔다.

- **직원 대화 선택지 연결**(v4 bundle에만 catalog `staffDialogue`): 직원 대화에서 `staff/openLocationHelp`("이 물건은 어디에 있나요?") → 장보기 목록 항목마다 `staff/askLocation/<목표 ID>`("○○ 위치 물어보기") → 답변. `staff/backToStaff`("뒤로가기")는 첫 대화 화면으로 돌아간다. 위치 메뉴가 열린 동안 계산원 호출 버튼은 앱과 같이 보이지 않는다. 저장 trace는 기존 `talkToStaff` 단계 그대로다.
- **답변**: 게임의 `marketLocationResponse` 문장이 `currentObservation.observation.result.message`에 나오고, `spatialMemory.staffAnswers`(최근 4개)에 남는다. `spatialMemory.recovery.askedStaff`는 실제로 답을 받았는지 나타낸다.
- **포기 조건(v4)**: v3과 같되 "본 직원에게 물어봄"은 직원 창 열기가 아니라 답을 받은 위치 질문으로만 센다.
- 위치 질문은 앱과 같이 장보기 목록 상품만 대상이다. 계산대 위치 질문, 반품 부탁 같은 기능은 게임에 먼저 추가한 뒤 연결해야 한다.

### 관찰 상한 옵션 `actionHorizon:200` (선택, 기본 100)

품목이 많은 과제처럼 100행동 안에 끝나기 어려운 실험에서 수락 결정 관찰 상한을 200으로 늘린다. 기본값은 100이며 값을 주지 않은 bundle·inputHash·trace는 이전과 같다.

- `prepare_whole_trace({actionHorizon:200})`이면 `generationLimits.acceptedActionHorizon`과 기본 `technicalActionBudget`이 200이 된다. 배우에게 보이는 상한 문구(`actionContract.ending`, 작성 안내의 최종화 조건, 지시문)는 정해진 문장만 200으로 바꾸며, 문장이 바뀌어 대응을 못 찾으면 bundle 생성이 실패한다.
- 종료 없이 200번째 결정까지 진행했을 때만 그때의 장바구니로 시스템 계산을 붙인다. trace에는 `generation.wholeTraceActionHorizon:200`과 `systemCompletion.afterDecisions/actionLimit:200`이 남고, 검증기는 이 표시가 있는 whole-trace-v3만 200 경계를 받는다. 200 상한에서 100번째에 `finish`하면 미완성 최종화로 기술 실패다.
- 배우 지시문은 `authoring-v3-h200` 템플릿(authoring-v3와 상한 숫자만 다름)을 쓴다. `whole-trace-actor-input.cjs`는 bundle의 상한에 맞는 템플릿을 고르고, 맞지 않는 템플릿 지정은 거절한다.
- 검증 run에서는 `prepare_persona_validation`에 `{"movementValidationVersion":"1","actionHorizon":200}`으로 묶는다. 슬롯 요청·bundle·trace의 상한이 run 바인딩과 다르면 거절한다.
- legacy 검증 run도 `lowGoalCount`(2~4)를 명시하면 low snapshot의 목표 수를 그 값으로 검사하고 manifest에 남긴다. 생략하면 기존처럼 2개다. 일반 성인 대조군으로 품목 수를 늘린 과제를 돌릴 때 함께 쓴다.

저장 trace의 JSON 스키마에서도 `generation.wholeTraceWayfindingVersion`을 선택 항목으로 허용한다. 허용값은 `wayfinding-v1`·`wayfinding-v2`·`wayfinding-v3`·`wayfinding-v4`이며, 알 수 없는 필드·버전은 계속 거절한다. `whole-trace-wayfinding-finalization.test.cjs`는 옵션을 켠 candidate 7의 허용된 포기·계산 제출·100행동 시스템 계산과 세션 저장까지 검사한다. 중간 관찰·메뉴 검사만으로 최종 생성 성공을 대신하지 않는다.

### 후보 작성과 제출 계약

기술 수정이 허용된 실패에는 `repair_whole_trace({requestId,repair:{decisions:[...]}})`로 수정할 suffix만 보낸다. `repairFilePath`도 같은 `{ "decisions": [...] }` 객체를 받는다. 서버가 요청·버전·수정 시작 위치를 채우고 이미 수락한 prefix와 원래 종료 의도, 수정 1회 제한을 유지한다. 기존 명시형 wrapper도 지원하며 잘못 명시한 값은 거절한다. 별도 사전 검사 왕복이나 행동별 AI 호출을 추가하지 않는다.

계산대 참조는 `checkout/<계산대 ID>`(예: `checkout/checkout`)이며, 수락 뒤 source의 `phase:"checkout"`, `view:"world"`, `activeStation:<해당 계산대 ID>`, `pageIndex:null`과 기존 위치·navigationStateId를 이어 쓴다. 직원이 있고 제출을 선택할 때 `control/submit`을 사용한다. 새 catalog의 `referenceAliases` 배열은 `{aliasChoiceId,canonicalChoiceId,kind:"checkout-open-v1"}`로 같은 계산대의 `open/<ID>` → `checkout/<ID>` 별칭만 명시한다. 정확한 현재 source·실제 계산대 대상·현재 사용 가능한 정식 버튼을 모두 확인해 로컬에서 연결하며, 별칭 없는 저장 bundle은 기존 엄격한 해석을 유지한다. 원본 후보는 보존하고 `choiceResolution.choiceRef`에 작성 참조, `resolvedChoiceRef`에 실행 참조, 별칭 사용 시 `normalization:{kind,authoredChoiceId,canonicalChoiceId}`를 기록한다. 다른 대상·경로·수량·이유·지연·종료를 자동 수정하지 않으며 추가 AI 호출 없이 전체 계획 1회·최대 1회 기술 수정 구조를 유지한다.

기본 후보 형식은 bundle 8 / candidate 7이다. 각 결정은 `{choiceRef:{source:{location,navigationStateId,phase,view,activeStation,pageIndex},choiceId,quantity?},delayMs,reason,basis:{intent,goalId,cueRefs?,memoryUses},actorState}`를 사용한다. `goalId`는 필수이며 task/recover는 열린 목표 ID, check/help는 열린 목표 ID 또는 null, explore/interest/rest/finish는 null을 쓴다. 과제를 위한 이동과 행동은 focus와 별개로 goalId에 연결한다. `memoryUses`는 필수 배열이며 목표 세부를 쓰지 않으면 `[]`다. 항목은 `{goalId,field:"name"|"specification"|"requiredQuantity",mode:"remembered"|"guess"|"current-display",value}`다. value는 필수이고 name/specification에는 문자열, requiredQuantity에는 숫자를 쓴다. 기억·추정·현재 표시값의 검사는 아래 기억 계약을 따른다.

`actorState.taskUpdate`는 선택적 `[{type:"select"|"complete"|"abandon",goalId}]` 배열이다. 선택된 `openGoalIds`는 관심·탐색·focus null에서도 유지되며 `heldGoalIds`는 열린 목표와 같은 집합으로 프로필 기억 용량 안에 둔다. 목록을 실제 읽은 다음 관찰에 열린 목표가 없고 보이는 목표 중 명시적 완료 이력이 없는 목표가 있으면 보이는 목표를 하나 이상 선택한다. 예외는 실제 checkout/submit/requestCashier/giveUp 행동이며 finish label만으로는 선택을 건너뛰지 않는다. select는 현재 실제 목록 또는 같은 결정의 명시적 selfRecall 이름 belief를 사용한다. complete는 그 목표에 연결한 이전 add의 실제 수락 결과를 관찰한 뒤 선언하며 올바른 상품·수량을 담았는지 검사하지 않는다. 포기는 abandon으로 명시할 수 있지만 pending 목표를 held 배열이나 memoryUpdate.deactivate만으로 조용히 지울 수 없다. 첫 readList 전 goal focus는 null이고 상품 focus는 실제 선반/cart에서 본 상품만 가리킨다. Goal focus는 이 방문에서 읽고 heldGoalIds에도 든 목표만 허용하며 uncertain과 겹칠 수 있다. source는 실제 행동 직전 상태와 일치해야 하고 choiceId는 그 source의 선택지에서 고른다. quantity는 add/remove에 필수이고 보이는 재고·반환 범위의 정수를 명시한다. 기본값·정답 수량을 대신 넣지 않으며 합법적인 오구매와 관심 구매도 그대로 기록한다. legacy 6은 기존 기억 계약, 5는 focus 계약, 4는 source-bound 선택, 3은 직접 action과 필수 cue 배열의 의미를 유지한다. 형식을 섞거나 기존 파일을 바꾸지 않는다. 1~100개의 행동을 받으며 100회 전에는 submit 또는 자발적 giveUp으로 끝나야 한다. 100회 후에도 진행 중일 때만 당시 장바구니 그대로 시스템 계산을 붙인다.

`taskMemory.completedGoalIds`는 수락된 명시적 완료 선언만 기록한다. 표시된 목표가 모두 완료된 뒤의 목록 재확인은 재선택 없이 장바구니 확인·이동으로 이어갈 수 있다. 재선택하면 완료 이력을 해제하고 abandon은 완료로 세지 않는다. 완료 이력으로 구매 정답을 판정하거나 기억 세부를 복원하지 않는다.

`bundleVersion:"8"`에는 전체 세계 참고 자료, choiceCatalog·initialChoiceFrame과 초기 `actorState.workingMemory`, 과제 계약이 있다. 전체 catalog는 전개 참고이며 현재 source의 frame만 가능한 선택을 정한다. `persona.behavior`는 같은 JSON에서 추출한 개인 지침, 목표 기억 용량, timingBaseline, 상황별 인지 설정 `cognition`과 `cognitionSourceHash`를 제공한다. 관심 전환 뒤 세부 기억·유사 상품 구분·수량 추적 설정은 합성 부담을 연결하며 강제 오답 확률이나 임상 척도가 아니다. source parameters와 페르소나 성격을 다시 정의하지 않는다. 표시된 사실의 원장인 actorState.knowledge와 현재 작업 기억, 계속 수행 중인 과제 목표를 구분한다. readList 다음 관찰의 목록값만 명확한 목록 기억의 출처가 되고 cart는 실제 담긴 수량만 알려준다. 목표 규격은 표시된 label 범위를 넘어 숨은 정답에서 추출하지 않으며 별도 규격이 없으면 unavailable일 수 있다. 상세 계약과 예시는 [전체 계획 절차](../../market-persona-skill/generation/candidate-contract.md#관찰-원장과-작업-기억)를 따른다.

각 판단의 필수 actorState는 candidate 7에서 `{activity,task,heldGoalIds,uncertainGoalIds,focusedGoalId,focusedProductId,orientation,triggerCueRefs?,memoryUpdate?,taskUpdate?}`이며 행동 직전의 허구 상태를 요약한다. 작업 기억과 과제 snapshot은 코드가 계산하고 모델이 덮어쓰지 않는다. optional memoryUpdate는 `{type:"selfRecall",goalId,values:{name?,specification?,requiredQuantity?}}`, `{type:"deactivate",goalId}`, `{type:"uncertain",goalId,fields:[...]}` patch 배열이다. deactivate는 열린 과제의 complete/abandon을 대신하지 않는다. selfRecall은 선언값을 uncertain belief로 기록하며 원장의 정답을 복사해 clear로 바꾸지 않는다. remembered 값은 계산상 clear 기억값과 일치해야 하고 guess는 uncertain belief, current-display는 현재 readObjectives 값과 일치해야 한다. unavailable인 필드는 실제 목록 재확인이나 selfRecall 없이 사용할 수 없다. 활성 목표의 필수 세부가 불확실하거나 unavailable이면 uncertainGoalIds에 그 목표를 포함한다. non-null basis.goalId는 focus와 무관하게 name 사용이 필요하되 실제 readList/viewCart/viewHelp는 기억 없이 외부 확인을 먼저 할 수 있다. 관심 이외의 add/remove는 goalId가 필요하며 목표에 연결된 add/remove에는 name·requiredQuantity 사용을 선언한다. non-null goal focus는 basis.goalId와 같아야 한다. 선택한 상품·수량의 정답 검사는 하지 않는다. 실행 대상/control과 objective proof는 기억 사용·정확 회상 근거를 대신하지 않는다. task는 최대 160자의 관찰 가능한 활동이고 trace currentTask로 연결한다. 상태·지연·근거는 내면 사고나 측정된 심리 상태가 아니다. 역할 검토는 별도 soft warning이며 행동을 정답으로 교정하지 않는다.

`worldReference.navigation.states`는 방향이 있는 이동을 예상하기 위한 참고다. 각 결정에서 실제 허용 선택은 current source와 일치하는 choice frame의 available choice IDs로 정한다. 지도상 이웃이나 future choice가 현재 선택 frame에 없으면 바로 고를 수 없다. 다음 선택은 개인의 관심·목표·확인·배회 의도로 고르고 재방문·휴식·도움을 허용한다. 최단 경로/목표 상품 정답 선택기는 없다.

새 작성 안내는 `authoringVersion:"2"`, `guidanceRevision:"declaration-preflight-v3"`를 기록한다. add/remove의 명시적 quantity, 완전한 결정 예제, 서로 다른 intent/activity enum, **actorState 안의 taskUpdate 배열**, 준비된 실제 수정 예산을 설명한다. `basis.memoryUses`의 **모든 항목에는 goalId·field·mode·value가 필요**하고 상위 basis.goalId가 항목의 goalId를 대신하지 않는다. candidate 7에서 직접 쓴 `basis.cueRefs`의 `objective:<id>`는 이미 읽은 목표여도 non-null `basis.goalId`가 필요하다. `goalId:null`, `memoryUses:[]`만으로는 허용되지 않는다. 이 필드는 상태 변화의 알려진 계기를 적는 `actorState.triggerCueRefs`, 컴파일러가 파생하는 관찰 증명과 구분한다. 어느 증명도 필요한 memoryUses를 대신하지 않는다. 53·56번 유형의 기존 거절 의미를 유지한다.

선택적 `createWholeTraceSourceAuthoringCursor(bundle)`는 배우가 선택한 결정에서 source만 제외해 `append`로 받고, 저장된 메뉴와 전이로 예상 source를 작성한다. `finish()`는 동일한 후보 형식 검사를 수행한다. 게임 실행·관찰 피드백·행동 선택·경로 삽입·수량 보정은 하지 않는다. 이미 source를 가진 후보를 덮어쓰지 않으며 전체 제출 검증은 계속 필요하다. 매대에서 장바구니를 열면 station은 유지하고 pageIndex는 null, 닫으면 직전 페이지로 돌아간다. 키오스크와 앱/컴파일러 전이가 모호한 직원 호출은 보조기가 지원하지 않고 오류로 남긴다. 자세한 사용 계약은 [source 작성 보조](../../market-persona-skill/generation/whole-trace.md#선택한-행동의-source-작성-보조)를 따른다. 향후 표본에는 안내 revision과 보조기 사용 여부를 후보 밖에 기록하고, 이전 표본과 작성 조건이 같다고 취급하지 않는다.

`source-task-preflight-v3`의 `cursor.menu()`는 현재 예상 source의 순위 없는 choiceIds·방향별 allowedWaypointIds·저장된 통로 표시를 반환한다. W 번호의 연속성·역방향 이동 이력으로 현재 간선을 추정하지 않으며 열린 패널에서는 통로 메뉴를 사용하지 않는다. `append` 오류의 `error.context`에도 변경되지 않은 source·메뉴·실패 인덱스를 남긴다. `append` 초안에는 source 키 자체를 생략하고, 직접 제출에는 source가 필수다. source 없는 완전한 예제와 인터페이스 설명은 새 authoringGuide에 포함된다. 작성 중 조회와 전체 초안 후 조립은 다른 작성 조건으로 기록한다.

`append`는 명시한 목표 ID의 select/complete/abandon 이력과 같은 결정의 held/basis/focus 정합성을 검사하고, 모순은 `AUTHORING_TASK_DECLARATION`으로 작성 단계에서 거절한다. readList 다음 한 결정에만 예상 표시 ID를 사용하며 알려진 ID에서 기억값을 되살리지 않는다. select를 쓴 같은 결정의 heldGoalIds가 비어 있거나, 열린 목표 참조 없이 recover를 쓰거나, 예외 행동이 아닌데 목록 직후 필요한 목표 선택을 빠뜨린 경우가 해당한다. task/recover의 목표 참조와 non-goal check/help의 null을 구분하는 완전한 조건부 예제는 `sourceAuthoring.taskDeclarationExamples`에 있다. 목표·행동·intent·수량·종료를 대신 선택하지 않고, 오류는 입력과 cursor를 그대로 둔다. snapshot/menu에 목표 상태·기억 정답은 노출하지 않는다.

이 검사는 선언의 상징적 일관성만 다룬다. 작성한 add/complete는 실제 구매 수락·관측 증거가 아니며 기억 압력·확실성·정답은 계산하지 않는다. 기존 최종 compiler·지식·목표·작업 기억 검증은 계속 적용한다. 현재 안내·보조기 revision과 sourceFiles 해시를 새 준비 결과에 기록하며 기존 `directed-source-memory-v2` / `source-menu-v2` 결과는 바꾸지 않는다. 사전검사 오류가 수정·재생성 권한을 추가하지 않는다.

새 `authoringGuide.workingMemory`는 행동 전 기억 계산 순서, 열린 목표와 focus의 차이, 불확실성 필수 선언, 세 가지 memoryUses 모드를 설명한다. source 보조기는 기억 상태를 계산하거나 수정하지 않는다. 지연·직전 행동 시간·관심·수량 부담으로 기존 임계치를 넘으면 닫기나 이동에서도 해당 목표의 uncertainty를 선언해야 한다. 지연을 줄이거나 확인·포기를 삽입해 통과시키지 않는다. bundle/candidate 8/7, 기존 임계값·기억 계약·검증기는 유지하며 안내 revision과 sourceFiles 해시만 새 준비 결과에 반영된다. 저장된 후보·trace·bundle은 변환하지 않는다.

전체 세계와 waypoint 자료는 `worldReference`에 유지하고 기본 bundle의 생성기 원문 `generatorReference`는 연결 정보로 교체한다. `sourceFiles` 경로·SHA-256 출처 목록은 보존한다. 참고 코드는 모델 안에서 실행되지 않으며, 입력 구성 변경의 실제 시간 효과는 별도 측정한다.

기본 `maxRepairs:0`은 일괄 제출 1회다. `maxRepairs:1`이면 실패한 첫 후보의 `repairContext`를 받아 `repair_whole_trace({requestId,repair})` 또는 `repairFilePath`로 단 한 번 뒤쪽 suffix를 제출할 수 있다. 권장 repair payload는 `{decisions:[...]}`이며 서버가 요청·버전·수정 시작 위치를 채운다. 기존 전체 wrapper를 제공하면 명시한 값의 일치를 검사한다. 행동 suffix는 `repairContext`의 최신 before/source/choiceFrame/known facts를 기준으로 고친다. 서버는 수락된 정확한 prefix와 원래 종료 의도를 보존한다. 같은 persistent MCP/CLI interactive 프로세스에서 `repair-whole` 별칭도 쓸 수 있다. 상품 정답률·최단 경로를 최적화하지 않는다. 원본·수정본과 제출/수정 횟수를 보존한다. 미완성 계획을 완성 trace나 실제 경험으로 저장하지 않는다.

actor policy는 whole-trace-v3, trace schema 2 / policy 6을 유지한다. 새 기본 bundle/candidate는 8/7이고 actorStateVersion:"1"도 유지한다. candidate 7은 knowledge audit auditVersion:"6", taskContract:"persistent-task-memory-v1"·taskStateVersion:"persistent-task-v1"와 기존 memoryContract:"working-memory-v1", cognitionVersion:"context-cognition-v1"를 기록한다. actionBinding:"state-bound-choice-v1"·focusContract:"explicit-focus-v1"도 유지한다. legacy 6/5/4/3은 각자 기존 audit 5/4/3/2와 검증 의미를 유지하며 저장된 trace 재생을 바꾸지 않는다. 관찰 사실, 계산한 열린 목표·작업 기억, 과제 전이와 기억 사용·갱신 선언을 sidecar audit에 기록한다. 전체 세계를 받는 observationScope:whole-world와 선언된 actorKnowledgeScope:observed-and-remembered의 한계는 유지된다. 정책 이름이 같아도 과제·기억 계약이 다른 표본을 같은 생성 조건으로 비교하지 않는다. 사후 감사 통과는 실제 Luna의 인지 과정·앱 실행·DB 수신·임상적 재현을 검증하지 않는다. 새 모델 호출의 seed 동일 출력과 시간 개선도 별도 측정 없이 주장하지 않는다. Codex 내부 추론/API 횟수는 미확인이면 그대로 두고 실제 계획 제출 수·도구 호출 수를 보고한다.

전체 계획용 개인은 `create_whole_trace_learner`로 새 파일을 만든다. 이전 `whole-trace-v1`/`whole-trace-v2`·provider·Codex 증분 정책의 learner·trial과 섞거나 정책 값을 수동 변경하지 않는다. 실제 앱 실행·DB 수신을 검증한 경험만 `learnerFile`로 넘기고, 시스템 계산 구간은 개인 기억·독립 완수 비교에서 제외한다. `whole-trace-v3`로 만든 새 A/B/C trial은 `prepare_whole_trace({trialFile,arm,tabId,...})`가 기존 회차 준비·기억·분석 연결 조건을 적용한다. 후보 제출 후 실제 앱/DB 증거는 기존 `record_learning_round`로 기록한다. 구체적인 후보·interactive·반복 실험 예시와 페르소나 지침은 [전체 계획 스킬 절차](../../market-persona-skill/generation/whole-trace.md)에 있다.

역할 표현의 자동 검토는 `actor-fidelity-v2`이며 `<trace 경로>.persona-review.json`과 결과의 `personaReviewPath`·`personaReviewHash`·`personaReview`에 별도 저장한다. `status:"review"`의 경고는 코드·판단 인덱스·설명과 함께 보고하고, `status:"clear"`는 자동 경고가 없다는 뜻으로만 해석한다. 실제 accepted add의 상품→목표 matcher 전이와 focus 변화, 지민의 다음 목표 목록 재확인, 제품/goal focus mismatch, 선언된 관심 복귀·불확실성 해소의 단서 연결을 soft warning으로 검토한다. 경고 코드는 `UNIFORM_REACTION_DELAYS`, `NEXT_GOAL_WITHOUT_LIST_RECHECK`, `INTEREST_RETURN_WITHOUT_RECORDED_RECOVERY`, `FOCUS_ACTION_MISMATCH`, `FOCUS_GOAL_SELECTION_MISMATCH`, `UNCERTAINTY_CLEARED_WITHOUT_RECORDED_CUE`다. `summary`는 `decisions`, `distinctReactionDelays`, `activityCounts`, `maximumHeldGoals`, 실제 선택 목표 기반 `goalSwitches`, `focusGoalSwitches`, `productSwitches`, `interestReturns`를 기록한다. `focusCoverage`는 기록된 판단과 focus 미기록 인덱스를 나누고, `transitions`는 purchase-goal/focus-goal/interest-return/uncertainty-cleared 인덱스와 cue·check/listRechecked 정보를 보존한다. purchase-goal에는 `selectionFocus:"consistent"|"unrecorded"|"different-goal"|"no-goal"`을 기록한다. `situations.unfamiliar`는 초기 orientation·국소 cue·새 매대, `situations.memoryLoad`는 실제 읽은 목표 수와 설계 용량·선언 uncertainty·check 인덱스, `situations.interestExposure`는 `categorySignDecisionIndexes`·`productDecisionIndexes`·`interestDecisionIndexes`를 구분해 기록한다. 이들은 coverage/상황 정보이고, 목표 수가 용량을 넘었다는 것 자체는 임상적 기억 부담 측정이 아니다. 관심 동안 유지한 작업 기억이 없으면 해당 부담의 표현 기회는 `unexercised`로 보고하고 개선 증거로 삼지 않는다. 열린 목표가 있어도 실제 압력·불확실성·회상·확인 행동을 함께 살핀다. 매대를 단순히 열고 닫은 것, 상품을 실제로 focus한 것, 종류·맛·규격을 비교한 행동을 구분하며 reason만으로 비교를 인정하지 않는다. 낯섦·기억 부담·관심 노출은 상황/coverage 정보이지 명확성 보증이 아니다. 경고는 기술 오류나 임상적 판정이 아니다. 경고를 없애려고 행동을 교체하거나 고정된 실수·배회·도움 횟수를 넣지 않는다. 기술 검증 결과와 역할 검토 결과를 함께 보고한다.

candidate 7의 `personaReview.taskExpression`은 `task-expression-v1`로 표현 coverage를 기록한다. `coverage.status:"unexercised"`는 기억 부담과 이후 회복을 관찰하지 못했다는 뜻이다. 관심 동안 목표를 유지한 사실만으로 어려움이 발현됐다고 보지 않는다. 추가 soft warning은 `INTEREST_PRODUCTS_WITHOUT_FOCUS`·`UNIFORM_ORIENT_WALK_DELAYS`이며 실제 관심 상품 focus와 비교 행동, 이동 상황에 따른 지연을 검토한다. 경로 재방문은 왕복 이동일 수 있어 방황으로 단정하지 않는다.

## Whole-trace 이동 그래프 진단

목록 HUD 가림은 `frontend/src/game/marketHudLayout.ts`의 공통 계산을 사용한다. 렌더 카드 폭은 `min(viewport.width - 24, 420)`, embedded top은 `max(112, safeArea.top + 64)`다. 기본 배율에서 이름 두 줄을 포함한 높이 상한은 115px이므로 390×600 화면의 가림 사각형은 x=12..378, y=112..227이다. 화면 높이는 카메라 투영과 clipping에 영향을 주며 상단 카드 위치를 바꾸지 않는다. bottom safe area도 상단 카드에 영향을 주지 않는다. 큰 fontScale에서는 이름·수량·장바구니 글자의 줄 높이와 줄바꿈 상한을 반영한다. 실제 텍스트 측정값이 없는 replay presentation이므로 한 줄 목록에도 두 줄 공간을 보수적으로 가린다.

다음 명령은 저장된 actor별 bundle의 초기 그래프와 현재 코드의 그래프에 각각 BFS를 실행한다. source snapshot SHA, 시작점, 환경, presentation, 계산대 상태, 전체 waypoint/anchor 카탈로그의 동일성을 확인한다. 시작 가상 노드는 지점 수에서 제외하고, 매대는 도달 노드의 `nearbyStations` 중 `kind === 'shelf'`인 고유 ID로 센다. 초기 계산대 상태만 진단하며 모델 호출·후보 컴파일·앱 재생은 하지 않는다.

```sh
node market-simulator/scripts/diagnose-whole-trace-reachability.cjs \
  --pilot-directory output/persona-pilot-20261028 \
  --output-directory output/persona-waypoint-reachability-new
```

출력 디렉터리는 원래 파일럿 밖의 새 경로여야 한다. `reachability.md`에는 입력별 전후 표, `reachability.json`에는 소스 hash·BFS 경로·도달 지점 목록이 저장된다. 2026-10-28 파일럿 64개 입력(공유 snapshot 2개)은 모두 23/139→131/139 지점, 매대 0→5곳, 계산대 도달 불가→가능으로 바뀌었다. 구조적 도달성 결과이며 실제 페르소나의 구매 성공률은 재측정하지 않았다.

snapshot과 anchor ID 생성 규칙, bundle/candidate 버전은 유지한다. 기존 bundle의 그래프와 choice 메뉴는 자동 갱신되지 않으므로 이후 생성에는 새 bundle을 준비해야 한다. `inputHash`는 설정과 bundle 버전을 묶으며 코드/그래프 변경은 포함하지 않는다. `sourceFiles`에 공통 HUD 모듈 hash도 기록하지만 compiler는 이 hash를 호환성 차단 조건으로 검사하지 않는다. 따라서 같은 snapshotId/inputHash가 같은 이동 선택지를 보장하지 않는다. 과거 trace의 재검증도 현재 가림 판정을 사용하므로 당시 환경의 재현에는 당시 소스가 필요하다. 기존 파일럿·후보·trace를 다시 쓰거나 새 계약으로 변환하지 않는다.

### 이동 모델별 회귀 검사

두 이동 모델의 도달성을 같은 화면·환경 조합에서 검사한다. `walkToAnchor`는 공용 waypoint 그래프의 방향 있는 BFS를 사용한다. 방향 이동은 `directionalInputSlices`와 `resolveMarketEnvironmentMovement`로 실제 입력을 적용한 끝점을 이어 간다. HUD나 화면 가장자리로 방향 이동 자체를 걸러내지 않으며, 목표 도달은 기존 `visibleStations`에서 **모든 매대와 최소 한 계산대가 실제로 가깝고 인지 가능한지**로 검사한다. 도달한 매대가 일부뿐이거나 탐색 노드 예산을 소진하면 실패다.

```sh
npm --prefix market-simulator run test:reachability
npm --prefix market-simulator run test:reachability:full
npm --prefix market-simulator run test:reachability:full -- --output-directory /absolute/new-reachability-directory
```

대표 명령은 화면 조건 5개 × 환경 3개인 15조합을 검사한다. 360×640 대표 조건은 가장 큰 검사 글꼴 `fontScale:2`와 `safeArea.top:59`다. 전체 명령은 다음 135조합에서 각각 두 이동 모델을 검사한다.

| 축 | 값 |
| --- | --- |
| 화면 크기 | 360×640, 390×600, 390×844, 430×932, 768×1024 |
| 글꼴 배율 | 1, 1.3, 2 |
| 상단 safe area | 0, 47, 59 |
| 환경 | 실행할 때 현재 `createMarketSession()`으로 생성한 default, 역사적 low, 역사적 high |

low/high는 [고정 도달성 fixture](../test/fixtures/whole-trace-reachability-snapshots.json)에 저장된 2026-10-28 환경·presentation·초기 계산대 상태를 사용한다. 원본 snapshotId·경로·파일 SHA-256을 기록하고 추출한 내용도 고정 해시로 검증한다. 상품 목표·과거 배우 계획을 새로 생성하거나 원본을 수정하지 않는다. default는 현재 환경 생성기의 변경을 잡기 위해 고정 복사본을 쓰지 않는다. 화면 조건은 위 행렬로 바꾸고 배율 `zoom:1.3`과 하단 safe area 0을 사용한다.

결과 표는 anchor 도달/전체 waypoint 수, 방향 이동 도달/전체 cell 수, 매대 수와 계산대 도달을 구분한다. anchor 수는 가상 시작 노드를 제외한다. 방향 이동의 전체 cell 수는 막힌 cell도 포함하므로 두 모델의 분모를 같은 것으로 비교하지 않는다. 실패에는 환경·viewport·fontScale·safe area, 도달 수, 누락 매대, 계산대 상태와 HUD/화면 가장자리/충돌 경계 예시를 남긴다. 도달성 실패가 하나라도 있으면 종료 코드 **2**, 잘못된 인자나 파일 오류면 **1**이다. 실패 조합을 허용 목록으로 통과시키지 않는다.

`--output-directory`는 부모가 존재하는 **새 디렉터리**만 받는다. 지정하면 `reachability.json`과 `reachability.md`를 저장하고 이미 존재하는 경로는 거절한다. 옵션을 생략하면 터미널에 표와 진단을 출력한다. 기존 파일럿·검증 결과를 덮어쓰지 않는다.

기본 `npm test`에는 대표 15조합과 default 360×640의 글꼴·safe area 9조합, 역사적 HUD 사각형 주입 대조, 방향 이동의 정확한 끝점·재생 가능한 도달 경로 검사를 넣는다. 전체 135조합은 개발 중 단일 추가 회귀 검사의 10초 예산과 분리해 위 `test:reachability:full` 명령으로 실행한다. 실행 시간은 결과의 `elapsedMs`에 기록하며 장비·병렬 실행 상황에 따라 달라진다.

2026-11-08 최종 측정에서 전체 135조합은 **두 이동 모델 모두 135/135 통과**, 실패 0건이며 25,199ms가 걸렸다. 대표 행렬·compact 화면 9조건·역사적 HUD 대조 등을 묶은 행렬 테스트 5개는 모두 통과했고 전체 실행 시간은 8,135ms였다. 전체 행렬은 위 10초 예산을 넘기므로 별도 명령으로 유지한다. 조합별 도달 수·분모·매대·계산대 결과는 [최종 결과 표](../../output/whole-trace-reachability-20261108-final/reachability.md)와 [JSON 진단](../../output/whole-trace-reachability-20261108-final/reachability.json)을 따른다.

좁고 짧은 화면(`width < 390`, `height <= 640`)에서는 실제 market 카메라가 HUD 아래 가시영역의 중앙에 플레이어가 보이도록 구도를 조정한다. 렌더러와 인지 투영은 같은 `getMarketWorldCameraFrame`을 사용한다. HUD의 실제 카드·글꼴 확대·가림 사각형, 80px waypoint 간격과 충돌 규칙은 유지한다. 390px 이상 화면은 기존 카메라를 사용하므로 390×600의 역사적 사각형 `{left:0,top:100,right:390,bottom:246}`을 주입하면 anchor 이동의 단절을 계속 검출하고, 방향 이동은 같은 물리 공간에서 매대·계산대에 도달하는 대조가 남는다.

이 카메라 변경은 앱 재생에 쓰는 `GamePrototypeScreen`의 embedded market 경로에 적용한다. standalone `MarketMap`은 변경하지 않는다. bundle의 `sourceFiles`에 카메라 구현 해시를 추가한다. 저장된 bundle·trace·검증 파일은 수정하지 않으며, 작은 화면에서 새로 컴파일하거나 재검증할 때는 현재 카메라 투영을 사용한다.

방향 BFS는 24px cell을 방문 중복 판정에만 쓰고 실제 끝점을 cell 중심이나 waypoint로 옮기지 않는다. 입력은 8방향, 400ms, `speedMultiplier:0.7`, `accelerationMs:200`의 고정된 합법 motor profile이다. cell마다 한 도착점만 보존하는 유한 탐색이므로 실패는 이 설정에서 경로를 찾지 못했다는 뜻이며 연속 공간에서의 물리적 불가능 증명은 아니다. 이 검사는 기계적 도달성 회귀이며 페르소나의 행동 선택·구매 성공률·실제 앱 실행을 측정하지 않는다.

### 선택 불가 재작성 기록과 자동 호출 영수증

명시적으로 선택하는 새 `authoring-v4` / `authoring-v4-h200` 템플릿은 첫 초안의 choiceId가 해당 결정 직전 메뉴에 없었던 경우, 원래 초안·의도를 보존하고 그 의도에 맞는 메뉴 선택으로 기술 재작성할 수 있다. 기존 종료 의도 가드와 재작성 예산은 그대로이며, 메뉴에 있던 선택이나 구매 수량을 바꾸는 것은 계속 절차 위반이다. 기본 템플릿은 v3로 유지한다.

작성 metrics는 첫 선택·가용성·수량·intent·reason과 후속 변경을 기록한다. `choiceUnavailableRewrite`는 첫 선택이 불가능했던 변경의 출처 표시이며 의미 보존을 자동 입증하지 않는다. `rewriteChangedAvailableChoice`는 가용 선택/수량 변경을 남긴다. 변경이 있을 때만 trace의 `generation.authoringRewriteAudit`에 같은 증거를 추가한다. 후보·bundle·inputHash의 계약은 변하지 않는다. 감사 스크립트는 새 템플릿이 기록된 슬롯에서만 선택 불가 예외를 인정하며, 기존 실행의 판정을 소급 변경하지 않는다.

mailbox CLI `call`은 배우의 출력 리다이렉션과 별도로 `owner/calls/<고유 ID>/`에 원본 입력, stdout, stderr, exit-code 및 시작·종료 영수증을 저장한다. 동일 operationId의 재전송도 별도 호출 영수증이며 엔진 결정은 중복 실행하지 않는다. 강제 종료로 종료 영수증이 없으면 누락으로 남고, 완료를 추정하지 않는다. 스키마 enum 거절은 activity·orientation·intent의 허용값을 표시한다.


### 슬롯 내부 operation 경로 (선택 옵션)

`serve DIR --prepare-file FILE --operation-root SLOT`은 CLI `call` 입력 파일의 실제 경로를 SLOT 내부로 제한한다. 외부 경로와 외부 파일을 가리키는 심볼릭 링크는 읽거나 복사하기 전에 `MAILBOX_OPERATION_OUTSIDE_SLOT`로 거절한다. 시도한 경로·stderr·exit·종료 영수증은 남고, 전달하지 않은 외부 입력 본문은 보관하지 않는다. 옵션 없는 기존 owner와 라이브러리 `callMailbox`는 기존 계약을 유지하며 bundle·inputHash·trace에는 영향을 주지 않는다. 이는 CLI 파일 전달 검사이며 배우 프로세스의 전체 파일시스템 접근을 격리하는 보안 경계는 아니다.

새 `authoring-v5` / `authoring-v5-h200`는 v4의 선택 불가 재작성 예외를 유지하고, 슬롯 내부의 고유 operation 파일 경로·슬롯 밖 임시 파일 금지·choiceRef 구조·허용된 기술 재작성 지속·코드로 선택하지 않는 원칙을 명시한다. v1~v4와 기본 v3는 수정하지 않는다. 실행 담당자는 슬롯의 operations/와 tmp/를 만들고 TMPDIR도 해당 tmp/로 지정할 수 있다. 배우별 감사는 경로 검사 통과 여부와 별개로 실제 파일 접근 및 행동 자동화를 계속 확인한다.
