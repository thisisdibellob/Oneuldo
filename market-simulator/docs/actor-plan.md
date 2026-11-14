# Luna 증분 actor plan (episodic-choice-v10/v11)

도구 등록은 `tools/actorPlan.cjs`, 세션은 `src/actorPlanSession.ts`다. v10은 기존 재현 계약을 유지하고, v11은 작업기억·과제 기억·검증된 이동 경험을 연결한다.

현재 Codex 모델이 직접 actor 행동을 고르는 증분 경로는 MCP의 `begin_actor_plan` → `observe_actor_plan` → `append_actor_plan` → `finalize_actor_plan`이다. `append_actor_plan`은 현재 revision의 choice ID 1~3개와 행동마다 `delayMs`/`reasons`를 받는다. 수락된 첫 행동 뒤 현재 actor 관측과 choice ID 집합이 달라지면 나머지 계획을 버리고 새 관측을 요청한다. 항상 3개를 채우지 않는다. 이 모드는 `gpt-6-luna` / `low`, actor policy `episodic-choice-v10`, trace policy `6`으로 표시되고 외부 LLM API 키가 필요 없다. 전체 계획은 아래 별도 도구를 사용한다. 두 경로 모두 생성된 전체 trace를 일반 `validate_trace` 후 `play_trace`로 앱에 전달한다.

## 기존 작업기억을 연결한 증분 실행 v11 (2026-10-28)

작업기억·진행 중인 목표·검증된 이동 경험을 사용하는 새 직접 증분 실행은 `episodic-choice-v11`을 명시합니다. 기존 v10 재현 자료와 호출 계약은 그대로 유지합니다. 기억 연결 실험에서 v10을 선택하고 v11의 기억 기능이 적용됐다고 보고하면 안 됩니다.

```js
const learner = await mcp('create_luna_learner', {
  directory, learnerId, memberId, personaId, experimentId, arm: 'A',
  actorPolicyVersion: 'episodic-choice-v11',
});
const plan = await mcp('begin_actor_plan', {
  personaId, seed, tabId, learnerFile: learner.learnerFile, outputPath,
  actorPolicyVersion: 'episodic-choice-v11', timingProfile: 'original', maxActions: 200,
});
```

v11은 매 관찰에서 행동 하나와 `cognition:{actorState,basis}`를 받습니다. `frame.cognition`에 기존 `WholeTraceCognitionEngine`·`WholeTraceTaskMemoryEngine`의 현재 상태, 계수 출처와 해시가 전달됩니다. 엔진은 실제 관찰과 배우의 기억 선언만 검사하며, 행동·상품·수량·성공을 대신 선택하거나 보정하지 않습니다. 이름·수량의 기억 사용, 용량, 불확실성, 자기 회상, 목록 재확인과 열린 목표의 유지·완료를 기존 규칙으로 검증합니다. 엔진 적용 콜백이 빠지거나 세션 상태와 다르면 실행을 거부합니다.

보이는 매대·직원으로 접근하는 선택은 현재 화면에서 관찰되고 막히지 않은 접근 구간에만 제공됩니다. 일반 이동 입력으로 걸어가며 매대 열기·직원 대화는 별도 행동입니다. 실행 완료와 DB receipt 검증 후 배우가 실제 걸은 구간만 `learning.spatial`에 저장합니다. 물리적 통행 조건이 같으면 관찰한 통로 경험을 이월하고, 매대 종류만 바뀐 경우 과거 상품 위치는 현재 위치로 복원하지 않습니다. 실제 장애물·점유·시작점이 바뀌면 경로를 무효화합니다. 시스템 종료 이동은 학습에서 제외합니다.

사용자가 승인한 이 실행의 행동 관찰 한도는 시작부터 200회로 고정합니다. 그 전에 또는 200번째에 배우가 종료를 선택하면 그 결과를 따릅니다. 계속 진행 중일 때만 당시 장바구니를 변경하지 않는 시스템 제출을 추가하며, `systemCompletion.actionLimit/afterDecisions`도 200으로 기록합니다. 기존 v9/v10/whole-trace의 100회 계약은 소급 변경하지 않습니다.

실제 적용 확인에는 v11 라벨만 사용하지 않습니다. `finalize_actor_plan.cognitionProof`와 결정 체크포인트를 보존하고, source plan·인지 proof·실행 trace SHA·replay·DB receipt·learner 원본을 서로 대조합니다. 다음 회차의 `experience.previousSpatialExperience`에서 경로의 출처와 배치 유효성도 확인합니다. 연구 민재는 원래 수치 인지 설정이 없으므로 기존 엔진 계수만 재사용하는 공학적 어댑터를 명시하며 다른 인물의 성격·상품 친숙도를 가져오지 않습니다. 과거 관찰 원문이 문맥에 남는 이 합성 모델의 검증을 사람의 망각이나 임상적 기억 능력의 재현으로 해석하지 않습니다.

### v11 선언 오류 복구 실행기 (2026-10-29)

`action-locked-repair.cjs`의 `runLockedAppend`는 호출 실행기에서 쓰는 복구 어댑터예용. 최초 합법 선택의 `choiceIds`, `delayMs`, `currentTasks`, `reasons`와 원래 frame을 고정하고, 선언 검증이 거절됐을 때 배우 모델이 `cognition`만 다시 작성하게 해용. `requestProposal(packet)`에는 고정 스키마·원래 제안·검증 오류가 전달되며, 실행기는 새 독립 모델 문맥의 원문을 저장한 뒤 반환해야 해용. `append`는 MCP 오류를 그대로 던지고 `onEvent`로 최초 선택·거절·복구·채택 해시를 기록해용.

최초 ID가 제공된 선택지에 없으면 별도의 invalid-choice 복구로 구분해용. 복구 한도·연결·revision 오류는 기술적 중단이며 자발적 포기나 새 실제 플레이로 세지 않아용. 재개할 때에는 같은 revision의 최초 합법 제안과 누적 복구 횟수를 보존해용. 이 어댑터는 MCP 서버가 모든 외부 호출자에게 자동 적용하는 정책이 아니므로, 새 실행기도 이 계약을 연결해야 해용. 담기·빼기는 현재 수량의 변화량이며, 계산창 열기·현재 장바구니 제출·미구매 중단의 효과는 직접 v11 선택지에 표시돼용.
