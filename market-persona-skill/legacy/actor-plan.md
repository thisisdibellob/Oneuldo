# 기존 Codex 증분 계획 (재현용)

학교 서버 모델을 행동마다 부르는 대신 현재 Codex 세션 모델이 actor가 되어야 할 때 `begin_actor_plan({personaId,seed,tabId})`을 호출한다. 응답의 `sessionId`로 `observe_actor_plan`을 읽고, 현재 관측과 페르소나, 실제 관찰 기억, `availableChoices`만 사용해 `append_actor_plan({sessionId,revision,choiceIds,delayMs,reasons})`을 제출한다. provenance는 `gpt-6-luna`, reasoning `low`, 정책 `episodic-choice-v10`/trace policy `6`이다. API 키를 설정하지 않는다.

묶음은 1~3개이며 3개를 채울 필요가 없다. 각 항목은 현재 choice ID, 자체 지연, 짧은 행동 이유를 갖는다. 실행기는 동일한 attention loop와 TraceGuard를 사용하고 각 행동 직전 choice 목록을 다시 계산한다. 관측이나 선택 집합이 달라지면 잔여 계획은 폐기되고 새 revision이 발행된다. 단계가 바뀌거나 화면·장바구니·목록·상품·단서가 바뀐 경우 이전 ID를 재사용하지 말고 새 관측을 읽는다. 잘못된 revision/ID, 중복 제출, 빈 계획, 네 개 이상인 묶음은 거절된다.

계획은 오프라인 trace만 구성한다. 마지막에 `finalize_actor_plan`으로 저장 결과를 받은 다음 일반 `validate_trace`를 통과시켜 전체 trace를 한 번에 `play_trace`한다. 계획 중 앱 입력 RPC를 보내지 않는다. 현재 MCP가 없다면 `node market-simulator/cli.cjs interactive`를 켜고 같은 네 도구를 한 줄 JSON 프로토콜로 호출한다.
