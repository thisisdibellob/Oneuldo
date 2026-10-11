import { WHOLE_TRACE_ACTIVITIES, WHOLE_TRACE_ORIENTATIONS } from './wholeTraceActorState';
import { WHOLE_TRACE_INTENTS } from './wholeTraceKnowledge';
import type { WholeTraceBundle, WholeTraceTaskChoiceDecision } from './wholeTraceContracts';

export const WHOLE_TRACE_AUTHORING_INSTRUCTIONS = `이 생성 문맥에서는 이 requestId의 bundle 한 개만 작성한다. 다른 인물·저부하/고부하·seed·request의 bundle이나 후보를 같은 actor 문맥에 넣지 않는다. 다음 표본은 새 actor 문맥에서 작성하고, 호스트 MCP 프로세스는 요청들을 함께 관리해도 된다. 서버는 모델 문맥의 분리를 입증하지 못한다.
먼저 authoringGuide의 identity를 현재 requestId/inputHash/snapshotId/persona/seed와 대조한다. authoringGuide.syntax와 examples는 형식과 적용 시점을 설명하는 조건부 조각이며, 행동 순서·상품·수량·종료를 추천하는 완성 계획이 아니다. READ_GOAL_ID 같은 예시 표기는 실제 관찰한 이 bundle의 ID로만 바꾼다. worldReference에 ID가 있다는 사실만으로 인물이 목표를 읽거나 상품을 본 것이 되지는 않는다.
전체 행동 배열을 먼저 작성하고 한 번 제출한다. 각 선택을 작성할 때 직전 행동 뒤의 예상 위치·열린 화면·페이지와 목표 전이를 함께 이어 적는다. 실행한 뒤의 결과를 현재 행동 전 상태에 미리 쓰지 않는다. actorState는 현재 행동 전 상태이며 같은 결정의 taskUpdate를 적용한 목표 집합과 일치해야 한다. 제출 후에는 허용된 기술 수정 횟수와 수락된 앞부분·원래 종료 의도를 지킨다. 형식 오류를 피하기 위해 행동을 줄이거나 포기로 바꾸지 않는다. 인물의 자발적 포기는 계속 가능하며 최소 행동·구매 횟수를 요구하지 않는다.`;

type Declaration = Pick<WholeTraceTaskChoiceDecision, 'basis' | 'actorState'>;

function declaration(activity: Declaration['actorState']['activity'], intent: Declaration['basis']['intent'], task: string): Declaration {
  return {
    basis: { intent, goalId: null, memoryUses: [] },
    actorState: { activity, task, heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null,
      focusedProductId: null, orientation: 'unfamiliar' },
  };
}

/** Authoring examples only. No chosen actions, runtime state, memory values or repairs are computed here. */
export function buildWholeTraceAuthoringGuide(bundle: Pick<WholeTraceBundle,
  'requestId' | 'inputHash' | 'snapshotId' | 'seed' | 'candidateVersion'>
  & { persona: Pick<WholeTraceBundle['persona'], 'id' | 'version'> }) {
  const readList = declaration('check', 'check', '화면의 목록을 읽는다');
  const selectAfterRead = declaration('orient', 'explore', '목록을 읽은 뒤 현재 보이는 주변을 살핀다');
  selectAfterRead.actorState.heldGoalIds = ['READ_GOAL_ID'];
  selectAfterRead.actorState.taskUpdate = [{ type: 'select', goalId: 'READ_GOAL_ID' }];
  const completeAfterAdd = declaration('check', 'check', '직전 담기 결과를 확인하고 현재 화면을 살핀다');
  completeAfterAdd.actorState.taskUpdate = [{ type: 'complete', goalId: 'READ_GOAL_ID' }];
  const completeWithOtherTask = structuredClone(completeAfterAdd);
  completeWithOtherTask.actorState.heldGoalIds = ['OTHER_OPEN_GOAL_ID'];

  return {
    authoringVersion: '1' as const,
    identity: { requestId: bundle.requestId, inputHash: bundle.inputHash, snapshotId: bundle.snapshotId,
      personaId: bundle.persona.id, personaVersion: bundle.persona.version, seed: bundle.seed,
      candidateVersion: bundle.candidateVersion },
    contextPolicy: 'One request/bundle per fresh actor context. Same-request technical repair stays in that context. Context isolation is procedural, not server-verified.',
    syntax: {
      // Use the same enumerations as the wire validators, not another personality policy.
      activity: [...WHOLE_TRACE_ACTIVITIES], intent: [...WHOLE_TRACE_INTENTS], orientation: [...WHOLE_TRACE_ORIENTATIONS],
      taskUpdate: {
        format: 'Optional array, including when there is only one update; omit or use [] when unchanged.',
        examples: [
          [{ type: 'select' as const, goalId: 'READ_GOAL_ID' }],
          [{ type: 'complete' as const, goalId: 'READ_GOAL_ID' }],
          [{ type: 'abandon' as const, goalId: 'READ_GOAL_ID' }],
        ],
      },
      repair: {
        format: 'For the one allowed technical suffix repair, send repair:{decisions:[...]} or repairFilePath with that object. The prepared session fills repairVersion/requestId/baseAttempt/fromDecisionIndex/candidateVersion; do not copy them manually. Explicit legacy fields are still checked.',
        scope: 'Author only the suffix beginning at repairContext.fromDecisionIndex. Preserve the accepted prefix and original terminal intent. This uses the existing repair submission, with no extra model calls or per-action feedback.',
      },
      checkout: {
        format: 'Use checkout/<checkoutId> to enter the chosen checkout, e.g. checkout/checkout. Once it is open and a cashier is staffed, use control/submit. Both choices require the exact current PRE-ACTION source and currently available control.',
        referenceAliases: 'Only an explicit choiceCatalog.referenceAliases entry {aliasChoiceId,canonicalChoiceId,kind:"checkout-open-v1"} permits open/<checkoutId> to resolve to checkout/<the same checkoutId>. The target must be an actual checkout and its canonical control must be available in the exact current source. A bundle without this entry keeps strict ID matching.',
        audit: 'The original candidate stays unchanged. choiceResolution.choiceRef records the authored reference; resolvedChoiceRef records the execution reference; normalization, when used, records kind/authoredChoiceId/canonicalChoiceId. Binding changes no target, route, quantity, delay, reason or ending and adds no model call.',
      },
      reminder: 'basis.intent and actorState.activity have different enums: explore is an intent, orient is an activity. goalId/focus require explicit null when absent; memoryUses requires [] when unused.',
    },
    decisionTiming: [
      '1. Start from the expected current observation, including the result of the PREVIOUS accepted action. A readList result exposes goals for the NEXT decision.',
      '2. Declare any select/complete/abandon in taskUpdate. Completion needs a previous goal-bound add and its observed result; it does not check the correct product or quantity.',
      '3. Declare heldGoalIds as the open goals AFTER these updates. basis.goalId, focusedGoalId and memoryUses must refer consistently to a still-open goal, or use null/null/[] when no goal is bound. Keep other open goals and their actual uncertainty.',
      'A list recheck after every displayed goal was explicitly completed does not require reopening those goals. Use a non-goal-bound check or movement when appropriate. Completion history never supplies remembered details or verifies the shopping answer; unresolved displayed goals still require selection under the task contract.',
      '4. Write choiceRef.source for the UI BEFORE the current action. A walk, shelf opening, browse or cashier call changes the source used by the NEXT decision.',
      '5. Node checks and commits the action only after the whole plan is submitted. These examples do not provide runtime feedback during authorship.',
    ],
    sourceTransitions: [
      { action: 'accepted walk to an already chosen waypoint', nextSource: 'location = that waypoint; navigationStateId unchanged. Use its currently available choices, not the old location menu.' },
      { action: 'accepted shelf open', nextSource: 'location unchanged; view = world; activeStation = opened shelf; pageIndex = displayed page (normally 0), not null.' },
      { action: 'accepted checkout/<checkoutId>, e.g. checkout/checkout', nextSource: 'location and navigationStateId unchanged; phase = checkout; view = world; activeStation = the same checkoutId (checkout in the example); pageIndex = null. If the actor then chooses to submit and a cashier is staffed, use control/submit with this source.' },
      { action: 'accepted browse', nextSource: 'location and station unchanged; pageIndex = the chosen displayed page.' },
      { action: 'readList, pause or lookAround', nextSource: 'location unchanged. readList makes the displayed objectives available only on the next decision.' },
      { action: 'viewCart/viewHelp or closeView/closeStation', nextSource: 'location unchanged; use the panel template matching the actual open UI. Cart/help have pageIndex = null; closing the station clears activeStation and pageIndex.' },
      { action: 'accepted cashier call', nextSource: 'Use the navigationStateId in this bundle matching the new cashier availability; never invent a state ID or a navigation edge absent from that state.' },
    ],
    examples: {
      instruction: 'These are declaration fragments, NOT complete decisions or a required route. Supply a chosen legal action, current source, delay and reason. All example IDs are placeholders; prerequisites must actually hold.',
      readListThenSelect: {
        precondition: 'No goals have been read or selected yet. The actor chooses readList; on the following decision a goal is actually displayed. This example selects one goal then explores without binding the exploration to its name.',
        readList, nextDecision: selectAfterRead,
      },
      completeAfterAdd: {
        precondition: 'READ_GOAL_ID is the only open goal. A previous accepted add was bound to it and its result is now observed. The actor chooses to complete it and perform a non-goal-bound check. If a goal-bound check is still intended, keep the task open until it is completed.',
        declaration: completeAfterAdd,
      },
      completeWithOtherTask: {
        precondition: 'As above, but OTHER_OPEN_GOAL_ID is also open and is currently clear. Complete only READ_GOAL_ID; retain every other open goal and its real uncertainty. This example does not select another goal automatically.',
        declaration: completeWithOtherTask,
      },
    },
  };
}

export type WholeTraceAuthoringGuide = ReturnType<typeof buildWholeTraceAuthoringGuide>;
