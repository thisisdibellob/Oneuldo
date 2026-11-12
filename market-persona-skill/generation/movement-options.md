# 선택적 방향 이동 옵션

`movementVersion` 등 방향 이동 옵션을 켠 요청에만 적용한다. 기본 이동과 근처 조작 참조는 [후보 7 계약](candidate-contract.md)을 따른다.

## 선택적 방향 이동 v1

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

## 실행 후 메뉴를 갱신하는 방향 이동 v2

`movementVersion:"directional-v2"`는 같은 8방향·시간 계약에 결정별 실행 결과를 반영한 작성 메뉴를 더하는 별도 옵션이다. 기본값과 명시적 `directional-v1`의 위 계약은 그대로 유지한다. v2는 `begin_whole_trace_authoring` → `append_whole_trace_decision` → 최신 메뉴 확인을 사용한다. 각 append는 기존 prefix 검증기로 실제 이동 입력을 적용한 뒤 연속 좌표를 내부에 보존하고, 그 위치에서 관찰·허용 선택지를 다시 만든다. 격자점으로 반올림하거나 가장 가까운 waypoint로 바꾸지 않는다. 충돌로 일부만 이동하거나 제자리에 남은 결과도 그대로 따른다.

배우의 draft에는 여전히 `choiceRef.source`를 넣지 않는다. 보조기가 수락된 접두 구간으로 source를 채운다. v2의 source.location은 처음부터 `P`로 시작하는 불투명한 위치 참조이고 navigationStateId는 `nav-v2-`로 시작하는 불투명한 상태 참조다. 내부의 정확한 연속 좌표·고정 입력·직원 상태·표시 조건에 묶이며 좌표나 방향으로 해석하지 않는다. 위치가 바뀌면 새 상태 참조를 사용하고, 실제로 막혀 위치와 상태가 같다면 같은 참조가 유지될 수 있다. `D<결정 번호>`나 `W<번호>`를 source 위치에 직접 쓰는 v1 전이를 v2에 섞지 않는다. 최종 제출은 같은 prefix를 다시 실행해 source·선택의 일치를 검증한다.

v2 메뉴의 `currentObservation`은 `{kind:"validated-prefix-observation-v2",acceptedDecisionCount,notice,observation}` 형태로 현재 `ActorObservation`의 표시 정보만 전달한다. 기존 최상위 `readObjectives`도 그 시점의 목록 표시 수명을 따른다. 관찰·메뉴에는 내부 좌표나 계산에 쓴 전역 지도·숨은 목적지를 추가하지 않는다. 이동의 절대·상대 좌표와 픽셀 거리는 공개 관찰에서 제거하고, 별도 `movementResult:{actualDirection,progress,blocked}`로 실제 이동 방향 또는 `null`, `full|partial|blocked`, 막힘 여부를 표시한다. 요청한 방향과 실제 이동 방향은 충돌 때문에 다를 수 있다. 메뉴 조회·거절된 draft·같은 요청 재전송은 실제 적용된 이동이나 지식으로 세지 않는다.

선택적인 `movementFeedbackVersion:"recent-movement-v1"`은 v2와 함께만 지정한다. feedback v11의 동일한 `movementNotes` 문장과 v12의 `recentVisit:{timesArrived}` 통로 방문 표시를 재사용한다. 최근 적용된 걷기 4회 전에는 이동 메모가 비어 있다. 방향별 횟수·아직 걷지 않은 방향·막혔던 방향은 관찰된 최근 경험만 서술하며 새 방향을 추천하거나 기존 선택을 금지하지 않는다. 통로 마커는 최근 실제로 그 통로까지 걸어간 기록과 현재 보이는 `walk` 선택지가 만나는 경우에만 붙고, 방향 이동으로 지나간 곳이나 본 적만 있는 통로를 도착으로 세지 않는다. 이 옵션은 선택 ID·순서·실행 가드를 바꾸지 않으며 내부 도착 ID 원장·좌표·지도를 공개하지 않는다. 생략하면 메모·마커를 추가하지 않는다.

`movementFeedbackVersion:"recent-movement-anchor-v1"`은 `movementVersion`을 생략한 anchor 이동과 `observationVersion:"anchor-visible-structures-v1"` 계약에서만 켠다. 관찰 계약은 새 독립 anchor 요청에서 자동으로 정해지며 기본값은 꺼짐이다. 최근 24행동 안의 자기 accepted 도착 기록을 현재 보이는 걷기 선택지에 ` · 최근에 N번 간 통로`와 `recentVisit:{timesArrived:N}`으로 표시하고, 같은 창의 이동 경험을 `movementNotes`로 전달한다. 선택지 ID·순서·가용성은 유지하며 표시와 메모는 권고가 아니다. `prepare_persona_validation`에서는 별도 실행 설정에 `movementValidationVersion:"1"`과 이 옵션을 지정하며 명세 JSON은 바꾸지 않는다.

`movementFeedbackVersion:"recent-movement-anchor-capacity-v1"`은 같은 anchor 조건에서만 켜는 별도 옵션이다. 기존 24행동 보존 창에 더해 선택된 페르소나의 `spatialMemoryCapacity`를 최근 도착한 서로 다른 통로 수의 상한으로 쓴다. 용량을 넘으면 마지막 accepted 도착이 가장 오래된 통로의 횟수 기록을 모두 지우며, 다시 도착하면 1회부터 센다. 보기만 하거나 메뉴를 조회한 것은 최근성을 갱신하지 않는다. 방향별 `movementNotes`의 24행동 창은 그대로이며 이동 권고·선택지 변경은 없다. 기본 페르소나 값은 모두 96곳이므로 현재 창에서 용량 제한은 걸리지 않는다. 이 값은 합성 구현 설정이며 실측 기억 능력이 아니다. 기본값과 기존 두 피드백 버전은 바꾸지 않는다.

독립 호스트에서 준비하려면 호출의 arguments에 두 옵션을 명시한다. 호스트 시작부터 context 저장·작성·최종 제출까지의 예시는 [방향 이동 v2 작성 예시](../../market-simulator/docs/whole-trace.md#방향-이동-v2-작성-예시)를 따른다. 앱 재생을 하기 전의 prefix 결과는 로컬 실행 검증 결과이며 실제 앱에서 확인한 개인 경험으로 저장하지 않는다.

검증 전용 인물과 비교 실험은 새 `prepare_persona_validation` run의 `movementValidationVersion:"1"` 뒤에서 v2를 사용한다. 반환된 슬롯의 `prepareWholeTrace`에 있는 marker·이동·단서 옵션을 그대로 유지한다. 기존 검증 run에 옵션을 덧붙이지 않는다. 검증용 실제 메뉴·도착 증거와 경로 기회의 해석은 [명시적 이동 검증 옵션](../validation/trait-catalog.md#명시적-이동-검증-옵션)을 따른다. 이 분석 증거는 배우에게 미래 경로나 숨은 도착 정보를 제공하지 않는다.
