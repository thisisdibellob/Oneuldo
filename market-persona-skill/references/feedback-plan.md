# 행동 결과를 받는 증분 생성 — feedback-choice-v1

일반적인 새 페르소나 행동 생성은 이 경로를 기본으로 사용한다. 전체 trace를 완성해 저장한 다음 검토·대기하고, 실행 요청을 받으면 동일 파일을 실제 앱에서 재생한다. 생성 중 결과는 앱과 공유하는 오프라인 게임 로직의 결과이며 실제 웹 실행 결과가 아니다. 과거 whole-trace/v10 trace와 개인·trial은 그대로 보존한다.

## 정보와 기억

모델에 주는 단위는 현재 `frame` 하나다. 현재 보이는 통로·상품·버튼·설명·행동 결과, 원본 JSON에서 추출한 개인 특성, 배우가 직전에 남긴 짧은 `memory`만 포함한다. 전체 snapshot/지도, 미래 선택지, 정답 장바구니, 전체 관측 원장, 이전 모델 응답·대화 전문, `lastReadList`, 사실 기반의 미완료 목표 목록을 붙이지 않는다. snapshot과 `.generation/` 진단은 제어자 감사용이다.

`readList` 뒤의 관측에는 화면에 표시된 정확한 목록이 나타난다. 다음 행동 뒤에는 자동으로 다시 제공하지 않는다. 모델이 매 결정의 응답으로 남긴 기억만 다음 결정에 전달한다. 형식은 다음과 같다.

```json
{
  "rememberedItems": [
    {"name":"우유","quantity":1,"certainty":"uncertain","status":"pending"}
  ],
  "currentTask":"진열대를 살펴본다",
  "notes":[]
}
```

전체 객체를 교체한다. `rememberedItems`는 최대 12개, 각 `name`/`currentTask`/note는 최대 300자, `notes`는 최대 8개다. `name`, `quantity`, `currentTask`는 null일 수 있고 수량은 0~99 정수다. certainty는 clear/uncertain, status는 pending/done/abandoned다. 이 수치는 통신 형식 한도이며 인지능력 측정값이 아니다. 이름·수량의 오기억, 확신하는 오류, 구매 없이 done으로 믿음, 기억에서 항목 누락·삭제를 허용한다. 코드가 정답과 대조하거나 삭제한 목표를 복구하지 않는다. 짧은 공개 행동·기억 요약만 적고 내면 추론 전문을 요구하지 않는다.

지원·재확인·독립 수행·관심 이탈·실수·중단은 현재 개인과 상황에 따른 선택이다. 오류나 도움 횟수를 채우지 않는다. 현재 드래그 재생이 지원하는 정상 담기·바깥에 놓아 담기 실패·제자리에 놓기 취소를 선택할 수 있다. 실패/취소는 장바구니를 바꾸지 않고 `result.accepted:false, quantity:0`으로 다음 판단에 전달한다. 이는 관찰 가능한 담기 결과이며 앱의 별도 오류 알림이 나타났다는 주장이 아니다. 보이지 않는 구매 확정 버튼이나 알려지지 않은 ID를 허용하지 않는다.

## 연결

가장 강한 문맥 분리는 HTTP provider 경로다. `generate_trace`에 `actorPolicyVersion:"feedback-choice-v1"`와 기존 `llm` 연결을 지정하면 요청마다 system+현재 frame 두 메시지만 새로 구성한다. 이전 messages나 conversation ID를 전달하지 않는다. 모델에 gpt-6-luna를 지정한 OpenAI 형식 요청에는 low reasoning을 사용한다. 실제 provider의 모델 제공 여부와 연결은 별도로 확인해야 한다. 키는 기존 `llm.apiKeyEnv`로 전달하며 코드·출력에 저장하지 않는다.

```json
{
  "tool":"generate_trace",
  "arguments":{
    "personaId":"mild-intellectual-disability-adult",
    "seed":"feedback-independent-001",
    "snapshotFilePath":"/absolute/path/snapshot.json",
    "outputPath":"/absolute/path/trace.json",
    "actorPolicyVersion":"feedback-choice-v1",
    "llm":{"model":"gpt-6-luna","baseUrl":"http://127.0.0.1:8000/v1","maxCalls":300}
  }
}
```

위 URL은 예시다. 설정된 실제 연결을 사용한다. 다른 모델로 조용히 바꾸거나 확률 정책으로 대체하지 않는다. 기본 `generate_trace`의 기존 v4 의미는 호환성을 위해 유지하므로 새 정책을 반드시 명시한다.

Codex 직접 배우의 경우 지속형 MCP 또는 `node market-simulator/cli.cjs interactive`에서 다음 도구를 사용한다. 배우는 실제 gpt-6-luna/low로 실행하고 **매 결정에 새 모델 문맥으로 현재 frame만** 전달한다. 동일 배우 채팅에 이전 관측을 계속 쌓는 방식은 이 기억 조건을 충족하지 않는다. MCP는 모델 설정이나 배우 문맥 격리를 강제하지 않으며 `external-frame`으로 출처를 기록한다. 분리를 지원하는 호출 수단이 없으면 그 제한을 명시하고, 격리가 확인됐다고 보고하지 않는다. 제어자가 전체 snapshot이나 이전 bundle을 이미 읽었더라도 배우에게 전달하지 않는다.

1. `begin_feedback_plan({requestId,personaId,seed,snapshotFilePath,outputPath})` 또는 snapshot 대신 tabId를 제공한다. 응답에 sessionId와 첫 frame이 함께 온다. 같은 requestId와 인자로 재요청하면 같은 세션을 돌려준다.
2. 배우가 현재 `availableChoices`에서 **하나**를 선택하고 `choiceId,durationMs,reason,memory`를 작성한다. 제어자가 경로·수량·종료·기억을 대신 작성하거나 수정하지 않는다.
3. `step_feedback_plan({sessionId,requestId,revision,choiceId,durationMs,reason,memory})`으로 제출한다. 적용 후 결과와 `nextFrame` 또는 `complete:true`가 같은 응답에 온다. 별도의 observe 왕복은 필요 없다.
4. 통신이 끊기면 **같은 step requestId와 동일 인자**로 재시도한다. 새 requestId로 같은 행동을 다시 보내지 않는다. 현재 frame 복구는 `observe_feedback_plan({sessionId})`을 사용한다. 서버 프로세스가 살아 있는 동안만 요청 기록이 유지된다. 프로세스 재시작은 자동 복구를 지원하지 않는다.
5. 완료 후 `finalize_feedback_plan({sessionId})`으로 파일과 수락/실행 수·시간을 받는다. `acceptedActions`는 유효한 결정 접수 수이며 과업 성공 수가 아니다. `executedActions`는 실패·취소를 포함한 적용 시도 수다. actorWaitingMs에는 모델·전송·제어자 대기가 섞여 있으며 순수 모델 추론 시간으로 해석하지 않는다. plannedElapsedMs는 별도의 시뮬레이션 시간이다.
6. 실제 시작 전 현재 탭으로 `validate_trace`를 수행하고 실행 승인을 받은 범위에서만 `play_trace`한다. 생성·준비 후 대기 요청이 있으면 여기서 멈춘다.

## 행동 시간

새로 생성하는 trace는 `generation.timingProfile:"activity-duration-v1"`을 기록한다. 시작·종료를 포함한 모든 `reactionDelayMs`는 0이다. 배우의 응답은 `delayMs` 대신 `durationMs`를 사용하며, 구형 요청은 자동 변환하지 않고 거절한다.

- 이동·담기·빼기·매대 열기/닫기·직원 요청·계산·제출·중단은 `durationMs:0`이다.
- 머뭇거림(`pause`), 주위 살피기(`lookAround`), 목록 읽기(`readList`), 상품 탐색(`browse`)는 배우가 활동 시간 100~120000ms를 정한다.
- 장바구니·도움말(`viewCart`, `viewHelp`)은 화면을 연 뒤 확인하는 시간 0~120000ms를 정한다. 열기만 하면 0이다.

예를 들어 이동 선택은 `durationMs:0`, 목록 확인은 `durationMs:1800`, 별도 머뭇거림은 `durationMs:1200`으로 보낸다. 예시 시간은 고정값이나 권장 기준이 아니다. 선택지의 `timing`은 허용 범위와 적용 시점을 알리고 `action.durationMs:0`은 아직 시간을 선택하지 않은 템플릿이다. 실제 동작에는 배우가 응답한 시간을 넣는다. 일반 행동에 양수 시간을 넣거나 시간 행동에 0을 넣으면 형식 오류다. 머뭇거림을 이동·드래그 이유에 적어도 자동 대기를 만들지 않으며 명시적 `pause`를 선택해야 한다.

실제 보행·드래그 동작, 화면 전환과 서버 접수 대기는 실행에 필요한 시간으로 유지한다. 이 시간을 배우의 확인 시간에 중복해서 더하지 않는다. HTTP 및 직접 Codex 배우 모두 같은 시간 계약을 사용한다. 기존 `actor-preserved-v1` 저장 trace의 시간은 보존하며 새 계약을 소급 적용하지 않는다. 기존 output 폴더의 배우 스크립트를 재사용하려면 응답 스키마를 이 계약으로 갱신해야 한다. 코드 변경 후 새 생성/웹 재생 전에는 MCP 프로세스와 앱 번들을 새로 로드한다.

## 종료·호환성과 검증

배우가 지정한 활동 시간을 유지하며 compact는 거절한다. 자발적 제출·중단은 그대로 저장한다. 최대 100회나 더 작은 maxActions/시간/모델 호출 한도에 걸리면 기술 실패로 진단을 보존하고 완성 파일을 만들지 않는다. 자동 장보기·정답 보충·계산대 이동·제출을 덧붙이지 않는다. 코드가 모르는 ID, stale revision, 잘못된 JSON은 기술 오류이며 페르소나 실수로 세지 않는다.

이번 v1은 첫 방문 생성에 적용한다. 기존 learner 원장의 정확한 목록·에피소드를 새 믿음 기억으로 자동 이식하지 않으며, learnerFile/revisit 연결은 지원하지 않는다. 기존 반복 학습 경로는 해당 정책 버전으로 유지한다. 계산기·현금 입력·거스름돈 등 현재 재생 계약에 없는 조작은 추가하지 않았다.

수용 검증은 현재 관측이 같은 숨은 배치·목표 변경 시 입력 불변, 행동 결과의 다음 요청 전달, 영구 목록 제거, 오기억·누락·잘못 담기 보존, 실제 드래그 실패 후 복귀, 중복 제출 무실행, 기술 한도에서 자동 완수 없음, 기존 trace의 공통 검증을 포함한다. HTTP 테스트 응답이나 수동 전송 fixture를 실제 모델 표본으로 보고하지 않는다.

완수 편향 변화는 구현 테스트만으로 판정하지 않는다. 같은 개인·모델·조건으로 whole-trace-v3 / v10 관측 증분 / feedback-choice-v1을 단순·여러 품목·관심 전환 조건별 세 번씩 비교하는 27개 탐색 표본을 별도로 수집한다. 정답률뿐 아니라 오품목·수량·누락·재확인·도움·자기수정·기술 실패와 실제 호출 비용을 함께 기록하며 목표 오류율을 맞추지 않는다.
