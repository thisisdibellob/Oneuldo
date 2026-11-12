# 한 번에 작성해 제출하는 whole-trace (재현용)

작성 보조 모드 이전의 방식이다. 배우가 후보 배열 전체를 한 번에 작성해 직접 `submit_whole_trace`로 제출한다. 2026-10-31 이후 실행에서는 쓰이지 않았으며, 새 생성은 [작성 보조 모드](../generation/whole-trace.md)를 쓴다. 제출 뒤의 repair·컴파일·실패 처리는 두 방식이 같으므로 [제출·수정·실패 처리](../generation/submit-and-repair.md)를 따른다.

Luna가 전체 세계 참고 자료와 페르소나를 한 번 받아 종료까지의 행동 배열을 작성한다. 세계 참고 자료는 이동 후 화면과 행동 결과를 예상하는 데 쓰고, 인물의 선택 지식은 그 시점의 화면·관찰 사실·작업 기억·개인 특성으로 구분한다. Node는 제출된 배열을 실행하며 단서 출처와 선언한 기억 사용·변화를 검증하고 앱용 trace로 컴파일한다. 오프라인 작성 중에는 같은 실행 검증기로 각 접두 구간을 확인하고 다음 결정 메뉴에 참고용 계산값을 표시할 수 있다. 실제 앱 재생 중 다시 계획하거나 행동마다 새 모델을 호출하지 않으며, 코드가 행동을 대신 선택하지 않는다. 생성에는 학교 Qwen 서버나 SSH 터널이 필요하지 않다. 앱 재생과 퀘스트 분석은 기존 앱·백엔드 연결을 사용한다.

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

## 후보 7 전체 형식과 이동 연결표

[후보 7 계약](../generation/candidate-contract.md)에서 옮긴, `source`를 직접 쓰고 세계 참고 자료를 함께 받는 방식의 설명이다.

### 전체 후보 예시

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

### 세계 참고 자료의 이동 연결표

`bundle.worldReference.navigation`은 같은 공용 `visibleAnchors` 규칙으로 미리 계산한 **방향이 있는 한 번의 이동 가능 목록**이다. `worldReference.world`·`worldReference.waypoints`는 유지하며, Luna가 생성기 원문을 실행하거나 화면 가림·거리·충돌 규칙을 다시 계산할 필요를 줄인다. 연결표 전체는 세계 참고 자료이며 아직 도착하지 않은 위치의 이웃이나 매대 내용을 인물의 발견 기억으로 옮기지 않는다. 모델 안에서 참고 코드는 실행되지 않는다.

1. 처음에는 `navigation.initialStateId`의 상태와 `initialLocation:"start"`를 사용한다. 해당 `states` 항목의 `start.allowedWaypointIds`는 예상 이동 선택지를 이해하는 참고표다. 실제 행동에는 `initialChoiceFrame`의 source와 현재 제시된 choice ID를 쓴다.
2. 이동이 수락된 뒤에만 그 waypoint를 현재 예상 위치로 기억한다. 다음 결정은 새 source와 해당 상태/위치의 현재 choice frame에서 선택한다. 참고표에 있는 waypoint가 현재 choice frame에 없으면 선택하지 않는다. `readList`·`pause`·`lookAround`·화면 열기/닫기·`interact`는 위치를 바꾸지 않는다.
3. `requestCashier` 후에는 호출한 계산대를 직원 있음으로 예상하고, `cashierAvailability`가 그 상태와 일치하는 `states` 항목을 사용한다. `stateId`는 bundle에 있는 값을 그대로 읽으며 직접 조합하지 않는다. 직원 없음에서 있음으로 바뀔 수 있는 상태는 최대 4개이고, 모든 상태는 초기 `waypoints`의 같은 ID를 사용한다.
4. 선반·직원 창이나 계산 단계는 `closeStation`, 장바구니·도움 화면은 `closeView`로 닫은 뒤 shopping/world 화면에서 다음 이동을 계획한다.

현재 위치 항목의 `nearbyStations:[{id,kind,label}]`는 근처 매대·직원·계산대 조작을 이해하기 위한 참고다. 실제 선택은 현재 choice frame에 나온 항목으로 한정한다. 선반 페이지·상품 가시성·재고·열린 화면·게임 단계는 각 행동 계약을 함께 확인한다.

한쪽의 목록에 상대 waypoint가 있어도 반대 방향 이동은 보장되지 않는다. ID 순서는 직렬화용이며 목표 상품까지의 최단 경로·선호 순위가 아니다. 다음 선택은 페르소나의 현재 관심·목표·확인·배회 의도로 결정한다. 재방문을 지우거나 실수·방황 횟수를 강제하지 않는다. 전체 catalog와 navigation은 계획 참고이며 현재 source-bound choice frame만 유효 선택을 정한다. 부적합한 이동을 다른 경로로 자동 교체하지 않는다.

기본 bundle에서 생성기 원문 `generatorReference`는 제외하고 `sourceFiles`의 경로·SHA-256 출처 목록을 보존한다. 원문을 줄인 것은 입력 구성 변경이며 실제 시간 단축은 같은 조건의 실행으로 측정해야 한다.

### legacy 후보 버전

legacy `candidateVersion:"6"`은 `{intent,cueRefs?,memoryUses}`와 기존 memoryUpdate·focus 계약을 유지하며 v7의 goalId·taskUpdate·목표 유지 규칙을 소급 적용하지 않는다. candidate 5는 focus 두 필드를 요구하며 memoryUses·memoryUpdate 검증이 없다. candidate 4는 source-bound choice 형식으로 focus가 필수가 아니고, candidate 3은 직접 action과 필수 `basis.cueRefs`·`actorState.triggerCueRefs`를 사용하는 명시형 legacy다. 각 버전의 계약을 섞지 않는다. 새 기본 실행은 candidate 7이며 candidate 2는 지원하지 않는다.

### 행동별 source 전이

[결정 작성 규칙](../generation/decision-rules.md)에서 옮겼다. `choiceRef.source`를 직접 쓰는 방식에서 행동 뒤 다음 source를 적는 규칙이다. 계산대 이용의 수락 뒤 source는 위치·navigationStateId를 유지하고 `phase:"checkout"`, `view:"world"`, `activeStation:"해당 계산대 ID"`, `pageIndex:null`이다.

| 상황 | 작성 규칙 |
| --- | --- |
| 이동 | 이번 source는 출발 위치다. 다음 결정은 도착 위치와 그때의 navigation state·화면 source를 쓴다. 출발점 `start`를 계속 복사하지 않는다. |
| 매대 열기 | 다음 결정은 실제 열린 매대의 view·activeStation·표시 페이지를 쓴다. 상품 페이지가 열렸는데 pageIndex를 `null`로 쓰지 않는다. |
| 도움말 열기 | world에서 열면 다음 source는 view=help, activeStation=null, pageIndex=null이다. 위치는 그대로다. |
| 장바구니 열기 | 다음 view=cart, pageIndex=null이다. 매대에서 열었으면 activeStation은 그 매대를 유지하고, 매대 없이 열었으면 null이다. cart를 station ID로 쓰지 않는다. |
| 장바구니/도움말 닫기 | view=world로 돌아간다. 열린 매대가 남아 있으면 그 매대의 이전 페이지를 복원하고, 아니면 activeStation/pageIndex=null이다. |
| 매대 닫기 | phase=shopping, view=world, activeStation/pageIndex=null이다. 다음에 매대를 새로 열면 pageIndex=0이다. |
