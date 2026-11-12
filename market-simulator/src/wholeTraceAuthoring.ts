import { WHOLE_TRACE_ACTIVITIES, WHOLE_TRACE_ORIENTATIONS } from './wholeTraceActorState';
import { WHOLE_TRACE_INTENTS } from './wholeTraceKnowledge';
import { buildWholeTraceMemoryAuthoringGuide } from './wholeTraceMemoryAuthoringGuide';
import { WHOLE_TRACE_SOURCE_AUTHORING_REVISION } from './wholeTraceAuthoringSource';
import type { WholeTraceBundle, WholeTraceTaskChoiceDecision } from './wholeTraceContracts';

export const WHOLE_TRACE_AUTHORING_INSTRUCTIONS = `이 생성 문맥에서는 이 requestId의 bundle 한 개만 작성한다. 다른 인물·저부하/고부하·seed·request의 bundle이나 후보를 같은 actor 문맥에 넣지 않는다. 다음 표본은 새 actor 문맥에서 작성하고, 호스트 MCP 프로세스는 요청들을 함께 관리해도 된다. 서버는 모델 문맥의 분리를 입증하지 못한다.
먼저 authoringGuide의 identity를 현재 requestId/inputHash/snapshotId/persona/seed와 대조한다. 출력 candidate의 최상위 키는 candidateVersion, requestId, decisions 세 개뿐이다. inputHash·snapshotId·personaId·seed는 입력 확인용이며 candidate에 복사하지 않는다. authoringGuide.syntax와 examples는 형식과 적용 시점을 설명하는 조건부 조각이며, 행동 순서·상품·수량·종료를 추천하는 완성 계획이 아니다. READ_GOAL_ID 같은 예시 표기는 실제 관찰한 이 bundle의 ID로만 바꾼다. worldReference에 ID가 있다는 사실만으로 인물이 목표를 읽거나 상품을 본 것이 되지는 않는다.
작성 인터페이스를 구분한다. 직접 제출하는 candidate에는 choiceRef.source가 필수다. source 작성 보조 cursor.append에 넘기는 초안에는 source 키 자체를 넣지 않는다(null도 금지). 보조기가 source만 붙인 finish() 결과를 제출한다. authoringGuide.sourceAuthoring의 완전한 초안 예시를 확인한다.
오프라인 고정 명령 author-whole에는 {contextFilePath,operationId,tool,arguments} JSON 파일 한 개 또는 stdin만 전달한다. 준비 담당자가 저장한 context.json에서 전송용 hostDirectory와 requestId를 읽으므로 요청 최상위나 arguments에 다시 적지 않는다. 파일 입력의 상대 contextFilePath는 그 요청 파일 디렉터리, stdin은 현재 작업 디렉터리 기준이다. context 안의 상대 hostDirectory는 context 파일 디렉터리 기준이다. 이 연결은 전송 식별자만 제공하며 candidate·repair 내부의 requestId나 행동·상태 선언을 채우거나 고치지 않는다.
actorState.taskUpdate는 반드시 actorState 안에 둔다. decision 최상위의 taskUpdate는 다른 필드로 옮겨 주지 않고 거절한다. basis.memoryUses의 모든 항목에는 각각 goalId, field, mode, value를 적는다. 상위 basis.goalId가 항목별 goalId를 대신하거나 자동 상속하지 않는다. 같은 결정의 select/complete/abandon을 먼저 적용한 뒤 heldGoalIds를 작성한다. task/recover 의도는 그때 열린 목표를 basis.goalId로 직접 참조하고, 목표에 연결되지 않은 check/help의 null과 혼용하지 않는다.
작성 보조의 선언 사전검사는 명시한 목표 ID의 선택·해제 이력과 현재 결정의 held/basis/focus 일치를 검사한다. 목록 표시는 작성한 readList 다음 한 결정에만 예상하며, 알려진 ID를 기억값으로 복원하지 않는다. 모순은 AUTHORING_TASK_DECLARATION으로 차단하고 목표·행동·수량·intent를 대신 채우지 않는다. executionAuthoring 경로는 결정 추가마다 같은 최종 실행 검증기를 접두 구간에 적용한다. 거절은 상태를 바꾸지 않으며 같은 요청·같은 결정에서 기본 3회까지 기술적으로 다시 작성할 수 있다. 최종 제출의 maxRepairs와 별도이며, 전체 제출 검증은 계속 필요하다.
매 결정 작성 전 가장 최근 메뉴의 interactionContext와 choiceIds를 확인한다. availableChoices는 그 ID와 같은 순서의 기존 행동 이름이며 추천 목록이 아니다. source.view가 world여도 activeStation이 있으면 매대나 직원 화면이 열려 있을 수 있다. 전역 catalog에 있는 readList도 현재 choiceIds에 없으면 선택할 수 없다. activeStation이 null이라는 조건만으로 목록 읽기를 허용하지 않으며 장바구니·도움말·계산대도 현재 메뉴 판정을 따른다.
실행 작성 메뉴의 currentObservation.observation은 수락된 접두 구간을 기존 검증기로 실행해 공용 observeActor에서 얻은 현재 화면 관찰이다. anchor 경로의 kind=validated-prefix-observation-v3과 acceptedDecisionCount로 출처·시점을 확인한다(명시적 directional-v2는 기존 관찰 v2 유지). visibleStations의 표지는 보이지만 near:false이면 아직 열 수 없다. 표시된 표지·상품·도움말과 현재 선택 가능 여부를 구분하며 실제 행동은 최신 choiceIds에서 고른다. 지도·추천 경로·미관찰 상품이나 목표는 관찰에 추가하지 않는다. currentObservation.readObjectives는 observation.readObjectives의 호환 별칭이며 readList 수락 다음 관찰에 제공하고 다음 비읽기 행동이 수락되면 사라진다. 다시 readList를 수락하면 새 목록 관찰을 제공한다. 필드가 없으면 현재 미표시이며 읽은 적이 없다는 뜻은 아니다. 필드가 있고 []이면 표시된 빈 목록이다. 메뉴 조회·활동/지연 미리보기·거절은 이 관찰을 소비하지 않는다. 표시 목록과 advisory를 구분한다. goalFields:[]는 계산할 활성 기억 필드가 없음, openGoalIds:[]는 현재 열린 과제가 없음, observedProductIds:[]는 관찰한 상품이 없음을 뜻하며 목록 부재나 작성 실패를 뜻하지 않는다. 목록이 표시되고 아직 목표를 선택하지 않았다면 목록 항목이 있어도 이 배열들은 비어 있을 수 있다. 현재 관찰과 기존 과제 계약에 따라 AI가 선택할 목표와 taskUpdate·heldGoalIds·uncertainGoalIds·focus·memoryUses를 직접 작성한다. 보조기는 과거 목록이나 worldReference로 현재 표시를 보충하거나 선언을 채우지 않는다.
accepted:false이고 canRetry:true이면 전체 실패가 아니라 같은 결정의 재작성 대기다. rewrite는 수락된 결정 수와 남은 재작성 횟수를 알려준다. AI가 원래 의도를 유지하며 그 결정의 기술 오류를 수정해 새 operationId로 다시 제출한다. 보조기가 행동을 자동 대체·삽입하지 않는다는 원칙은 이 허용된 재작성을 금지한다는 뜻이 아니다. 수락된 앞부분을 바꾸거나 구매 목표·수량·종료를 통과 목적으로 재계획하지 않는다. 같은 결정의 최초 선택이 비종료/submit/giveUp 중 무엇인지 고정한다. 이동이 거절됐다고 giveUp이나 submit으로 바꾸거나, 최초 종료 선택을 다른 종료 또는 비종료로 바꾸면 AUTHORING_REWRITE_CHANGED_ENDING으로 거절한다. basis.intent가 같아도 이 규칙은 적용된다. 최초 choiceId가 없거나 잘못되어 종료 선택을 확인할 수 없을 때도 재작성으로 종료를 새로 도입하지 않는다. 미해결 결정은 finish나 직접 submit으로 건너뛸 수 없다. 기술 수정이 수락된 다음 새 결정의 자발적인 종료는 가능하다. 보조기는 현재 메뉴와 거절 사유만 제공하고 수정할 행동·상태 값은 제안하거나 채우지 않는다.
walk/W 번호는 불투명한 ID이며 숫자가 가깝거나 과거에 반대로 걸었다고 이번 방향으로 갈 수 있는 것은 아니다. 각 이동 전에 현재 navigationStateId와 location의 방향별 allowedWaypointIds, 현재 패널의 선택지를 함께 확인한다. 하위 source 작성 보조기의 menu()는 그 예상 source에 대한 저장 선택지만 보여준다. 이동 후에는 목적지의 새 메뉴를 확인하며, 매대·도움말·장바구니가 열렸을 때 통로 메뉴를 사용하지 않는다. 없는 간선을 고르거나 자동으로 중간 이동을 넣지 않는다.
actorState.uncertainGoalIds는 직전 배열을 복사하지 않고 authoringGuide.workingMemory의 행동 전 계산 순서에 따른 상태를 선언한다. 열린 목표 유지와 세부 기억의 확실성은 다르며, 관심 뒤 닫기·이동에서도 경과 시간과 수량 부담이 반영된다. 실행 작성 메뉴의 목표별·필드별 압력과 상태, 관찰한 상품 ID, 열린 목표 ID는 참고용 계산값이다. 압력은 감쇠 후 소수 6자리로 반올림하며 기본은 직전 활동·추가 지연 0이다. 자신이 작성한 다음 activity와 delayMs로 미리 계산할 수도 있다. 보조기는 uncertainGoalIds 등 어떤 선언도 채우거나 고치지 않으며 계속 AI가 선언한다. 이번 행동으로 새로 보게 될 상품은 행동 전 관찰 목록에 없다.
개인의 성향은 현재 상황에서 어떤 정보를 더 살피고 언제 충분하다고 판단할지에 반영한다. 확인을 선택했다면 실제로 읽는 목록·보는 장바구니·살피는 표시 정보와 연결한다. 단순 매대 닫기나 목표 완료 선언, check 라벨 또는 긴 delayMs만으로 재확인·후보 비교를 했다고 대신하지 않는다. 이미 보이는 정보를 살피는 것과 새 확인 화면을 여는 것은 구별한다. 같은 페이지의 실제 후보를 살필 수도 있고 추가 정보가 불필요하면 비교를 멈출 수도 있다. 확인·비교·실수·도움 횟수를 맞추려는 행동은 만들지 않는다.
focusedGoalId와 focusedProductId의 null 예시를 모든 결정에 복사하지 않는다. 읽고 선택한 열린 목표를 지금 처리한다면 그 목표를, 실제 표시된 상품을 지금 살피거나 고른다면 그 상품을 집중 대상으로 기록한다. 다른 상품에 주목하면서 잘못 담는 경우에는 실제 불일치를 그대로 두며 정답에 맞춰 focus나 행동을 고치지 않는다. 목표 읽기 전·단순 방향 탐색·완료한 목표의 해제·관심 전환처럼 해당 집중 대상이 없는 경우에는 null이 맞다. 관심으로 goal focus가 null이 되어도 다른 열린 목표의 heldGoalIds는 유지한다.
전체 행동 배열을 먼저 작성하고 한 번 제출한다. 각 선택을 작성할 때 직전 행동 뒤의 예상 위치·열린 화면·페이지와 목표 전이를 함께 이어 적는다. 실행한 뒤의 결과를 현재 행동 전 상태에 미리 쓰지 않는다. actorState는 현재 행동 전 상태이며 같은 결정의 taskUpdate를 적용한 목표 집합과 일치해야 한다. 제출 후에는 허용된 기술 수정 횟수와 수락된 앞부분·원래 종료 의도를 지킨다. 형식 오류를 피하기 위해 행동을 줄이거나 포기로 바꾸지 않는다. 인물의 자발적 포기는 계속 가능하며 최소 행동·구매 횟수를 요구하지 않는다.
finish는 미완성 접두 구간을 시험하는 도구가 아니라 이미 작성한 전체 계획의 최종화다. 이미 선택한 종료 행동 또는 기존 100행동 관찰 상한에 도달한 계획에만 호출한다. 종료 없는 미완성 계획을 최종화하면 AUTHORING_INCOMPLETE_FINALIZATION으로 요청이 기술 실패 상태에 고정되며, 이후 행동·종료를 덧붙이거나 새 begin으로 이어 쓸 수 없다. 기술 최종화 오류를 포기로 메우지 않는다. 아직 재작성 중인 결정의 AUTHORING_REWRITE_PENDING은 이 최종화 실패와 구분하고 기존 한도에서 같은 결정을 고친다.`;

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
  & { persona: Pick<WholeTraceBundle['persona'], 'id' | 'version'> }, options: { maxRepairs?: number;
    observationVersion?: WholeTraceBundle['observationVersion'];
    authoringExampleVersion?: WholeTraceBundle['authoringExampleVersion'] } = {}) {
  const maxRepairs = options.maxRepairs ?? 0;
  if (maxRepairs !== 0 && maxRepairs !== 1) throw new Error('Authoring guide maxRepairs must be 0 or 1');
  const readList = declaration('check', 'check', '화면의 목록을 읽는다');
  const selectAfterRead = declaration('orient', 'explore', '목록을 읽은 뒤 현재 보이는 주변을 살핀다');
  selectAfterRead.actorState.heldGoalIds = ['READ_GOAL_ID'];
  selectAfterRead.actorState.taskUpdate = [{ type: 'select', goalId: 'READ_GOAL_ID' }];
  const completeAfterAdd = declaration('orient', 'explore', '직전 담기 선택을 마치고 매대를 닫아 주변으로 시선을 옮긴다');
  completeAfterAdd.actorState.taskUpdate = [{ type: 'complete', goalId: 'READ_GOAL_ID' }];
  const completeWithOtherTask = structuredClone(completeAfterAdd);
  completeWithOtherTask.actorState.heldGoalIds = ['OTHER_OPEN_GOAL_ID'];
  const selectObservedProduct = declaration('shop', 'task', '열린 목표를 위해 실제 표시된 상품을 고른다');
  selectObservedProduct.basis.goalId = 'READ_GOAL_ID';
  selectObservedProduct.basis.memoryUses = [
    { goalId: 'READ_GOAL_ID', field: 'name', mode: 'remembered', value: 'CURRENT_CLEAR_GOAL_NAME' },
    { goalId: 'READ_GOAL_ID', field: 'requiredQuantity', mode: 'remembered', value: 2 },
  ];
  selectObservedProduct.actorState.heldGoalIds = ['READ_GOAL_ID'];
  selectObservedProduct.actorState.focusedGoalId = 'READ_GOAL_ID';
  selectObservedProduct.actorState.focusedProductId = 'OBSERVED_CHOSEN_PRODUCT_ID';
  const interestWithPendingGoal = declaration('interest', 'interest', '눈에 들어온 관심 상품을 살핀다');
  interestWithPendingGoal.actorState.heldGoalIds = ['READ_GOAL_ID'];
  interestWithPendingGoal.actorState.focusedProductId = 'OBSERVED_INTEREST_PRODUCT_ID';
  const productDecision = (kind: 'add' | 'remove') => ({
    choiceRef: { source: { location: 'W000', navigationStateId: 'CURRENT_NAVIGATION_STATE_ID', phase: 'shopping' as const,
      view: kind === 'add' ? 'world' as const : 'cart' as const,
      activeStation: 'OPEN_SHELF_ID', pageIndex: kind === 'add' ? 0 : null },
    choiceId: `${kind}/OBSERVED_CHOSEN_PRODUCT_ID`, quantity: 1 },
    delayMs: 1000, reason: kind === 'add' ? '보이는 상품을 내가 정한 개수만큼 담는다.' : '장바구니에서 내가 정한 개수만큼 내려놓는다.',
    ...structuredClone(selectObservedProduct),
  });
  const sourceFreeControl = (choiceId: string, reason: string, state: Declaration) => ({
    choiceRef: { choiceId }, delayMs: 1000, reason, ...structuredClone(state),
  });
  const openTask = declaration('orient', 'task', '현재 열린 목표를 위해 보이는 주변을 살핀다');
  openTask.basis.goalId = 'READ_GOAL_ID';
  openTask.basis.memoryUses = [{ goalId: 'READ_GOAL_ID', field: 'name', mode: 'remembered', value: 'CURRENT_CLEAR_GOAL_NAME' }];
  openTask.actorState.heldGoalIds = ['READ_GOAL_ID'];
  openTask.actorState.focusedGoalId = 'READ_GOAL_ID';
  const recoverTask = structuredClone(openTask);
  recoverTask.basis.intent = 'recover';
  recoverTask.actorState.activity = 'recover';
  recoverTask.actorState.task = '열린 목표로 돌아가려고 도움말을 닫는다';
  const checkWithPending = declaration('check', 'check', '장바구니 화면을 확인한다');
  checkWithPending.actorState.heldGoalIds = ['READ_GOAL_ID'];
  const helpWithPending = declaration('recover', 'help', '이용 방법을 확인한다');
  helpWithPending.actorState.heldGoalIds = ['READ_GOAL_ID'];
  const walkWhileUnseen = structuredClone(openTask);
  walkWhileUnseen.actorState.task = '열린 목표의 매대를 찾으려고 다른 통로로 걸어간다';
  const giveUpWithPending = declaration('finish', 'finish', '지금 장보기를 그만두기로 한다');
  giveUpWithPending.actorState.heldGoalIds = ['READ_GOAL_ID'];

  return {
    authoringVersion: '2' as const,
    guidanceRevision: 'declaration-preflight-v3' as const,
    identity: { requestId: bundle.requestId, inputHash: bundle.inputHash, snapshotId: bundle.snapshotId,
      personaId: bundle.persona.id, personaVersion: bundle.persona.version, seed: bundle.seed,
      candidateVersion: bundle.candidateVersion },
    contextPolicy: 'One request/bundle per fresh actor context. Same-request technical repair stays in that context. Context isolation is procedural, not server-verified.',
    syntax: {
      candidate: {
        allowedTopLevelFields: ['candidateVersion', 'requestId', 'decisions'],
        envelope: { candidateVersion: bundle.candidateVersion, requestId: bundle.requestId, decisions: [] },
        instruction: 'The empty decisions array is an envelope placeholder, not a valid plan. Fill it with your complete chosen decisions. inputHash/snapshotId/personaId/seed belong to input identity only; never add them to candidate output.',
      },
      decision: {
        requiredFields: ['choiceRef', 'delayMs', 'reason', 'basis', 'actorState'],
        requiredBasisFields: ['intent', 'goalId', 'memoryUses'],
        instruction: 'A complete decision has all five fields. Use actual IDs from this request and the actual pre-action UI. A declaration fragment is not a complete decision. An array below 100 decisions must end in the actor-chosen submit/giveUp; never add an ending to make a partial draft pass.',
      },
      choiceRef: {
        requiredFields: ['source', 'choiceId'],
        interface: 'These fields describe a directly submitted candidate. cursor.append drafts instead require choiceId and forbid the source key entirely; see sourceAuthoring.draftExample. Only cursor.finish() produces a full candidate.',
        sourceFields: ['location', 'navigationStateId', 'phase', 'view', 'activeStation', 'pageIndex'],
        quantity: { requiredFor: ['add/<productId>', 'remove/<productId>'], type: 'integer', minimum: 1, maximum: 99,
          hasDefault: false,
          instruction: 'Explicitly choose choiceRef.quantity for each add/remove within the displayed stock/cart bounds. Do not put quantity into the choiceId, infer it from reason, or copy memoryUses.requiredQuantity. Other controls do not take quantity. Missing quantity is rejected, never filled.' },
      },
      // Use the same enumerations as the wire validators, not another personality policy.
      activity: [...WHOLE_TRACE_ACTIVITIES], intent: [...WHOLE_TRACE_INTENTS], orientation: [...WHOLE_TRACE_ORIENTATIONS],
      taskUpdate: {
        path: 'actorState.taskUpdate',
        format: 'Optional array, including when there is only one update; omit or use [] when unchanged.',
        entryFields: ['type', 'goalId'],
        instruction: 'Only actorState.taskUpdate is allowed; a decision-level taskUpdate is rejected, never relocated. taskUpdate contains select/complete/abandon only. Memory field/mode/value declarations belong in basis.memoryUses; selfRecall belongs in actorState.memoryUpdate. These arrays are not interchangeable. Apply the authored updates before declaring heldGoalIds in that same decision.',
        examples: [
          [{ type: 'select' as const, goalId: 'READ_GOAL_ID' }],
          [{ type: 'complete' as const, goalId: 'READ_GOAL_ID' }],
          [{ type: 'abandon' as const, goalId: 'READ_GOAL_ID' }],
        ],
      },
      memoryUses: {
        path: 'basis.memoryUses', requiredEntryFields: ['goalId', 'field', 'mode', 'value'],
        instruction: 'Every entry needs its own explicit goalId. basis.goalId is not inherited by memoryUses entries. All entries bind to the same non-null open basis.goalId; an unused array is []. Values remain actor-authored beliefs and are never supplied from worldReference or corrected by the drafting aid.',
      },
      repair: {
        maxRepairs, enabled: maxRepairs === 1,
        format: maxRepairs === 1
          ? 'At most one technical suffix repair is allowed, only when the rejection returns canRepair:true. Send repair:{decisions:[...]} or repairFilePath with that object. The prepared session fills repairVersion/requestId/baseAttempt/fromDecisionIndex/candidateVersion; explicit legacy fields are still checked.'
          : 'This request has maxRepairs:0. Submit the complete candidate once; a rejected candidate cannot be repaired, regenerated or rebound under this request. The repair API does not grant a repair budget.',
        scope: 'Author only the suffix beginning at repairContext.fromDecisionIndex. Preserve the accepted prefix and original terminal intent. This uses the existing repair submission, with no extra model calls or per-action feedback.',
      },
      checkout: {
        format: 'Use checkout/<checkoutId> to enter the chosen checkout, e.g. checkout/checkout. Once it is open and a cashier is staffed, use control/submit. Both choices require the exact current PRE-ACTION source and currently available control.',
        referenceAliases: 'Only an explicit choiceCatalog.referenceAliases entry {aliasChoiceId,canonicalChoiceId,kind:"checkout-open-v1"} permits open/<checkoutId> to resolve to checkout/<the same checkoutId>. The target must be an actual checkout and its canonical control must be available in the exact current source. A bundle without this entry keeps strict ID matching.',
        audit: 'The original candidate stays unchanged. choiceResolution.choiceRef records the authored reference; resolvedChoiceRef records the execution reference; normalization, when used, records kind/authoredChoiceId/canonicalChoiceId. Binding changes no target, route, quantity, delay, reason or ending and adds no model call.',
      },
      reminder: 'basis.intent and actorState.activity have different enums: explore is an intent, orient is an activity. goalId/focus require explicit null when absent; memoryUses requires [] when unused.',
      objectiveReferences: {
        rawBasis: 'In candidate 7, an actor-authored basis.cueRefs entry objective:<id> counts as goal detail use even if memoryUses is []. It requires a non-null basis.goalId for a currently open task, plus the existing intent/name-memory rules. A prior readList alone is not sufficient. goalId:null with any raw objective reference is rejected as TASK_MEMORY.',
        unbound: 'A genuinely non-goal-bound explore/check may keep selected pending heldGoalIds while using goalId:null and memoryUses:[] without a raw objective basis reference. The actor chooses the intended meaning; do not remove or move references automatically to pass validation.',
        trigger: 'actorState.triggerCueRefs describes an actual state-change cue already known to the actor. It is not the raw basis field checked above, does not declare a goal detail use, cannot replace required memoryUses, and cannot introduce an unread goal.',
        derived: 'Compiler-derived objective proof for already read held/uncertain goals is recorded separately. It does not convert a non-goal action into a goal-bound action or restore remembered values.',
      },
    },
    annotationGuidance: {
      reviewVersion: 'actor-annotation-v1',
      actualCheck: 'A check label describes an actual examination of available information. Simply closing a shelf/view does not establish a new list, cart or candidate check. Do not add a check solely to remove a warning.',
      focus: 'Declare the actually attended read/open goal and observed product. Null means no current focus, not a default to copy. Preserve genuine selection/focus mismatches and unfinished goals during interest.',
      limits: 'Same-page attention can be real without a new UI action but is only an authored declaration, not independently measured comparison. Existing display content and currently available choices bound all claims.',
    },
    workingMemory: buildWholeTraceMemoryAuthoringGuide(),
    decisionTiming: [
      '1. Start from the expected current observation, including the result of the PREVIOUS accepted action. A readList result exposes goals for the NEXT decision.',
      '2. Declare any select/complete/abandon in taskUpdate. Completion needs a previous goal-bound add and its observed result; it does not check the correct product or quantity.',
      '3. Declare heldGoalIds as the open goals AFTER these updates. basis.goalId, focusedGoalId and memoryUses must refer consistently to a still-open goal, or use null/null/[] when no goal is bound. Keep other open goals and their actual uncertainty.',
      'A list recheck after every displayed goal was explicitly completed does not require reopening those goals. Use a non-goal-bound check or movement when appropriate. Completion history never supplies remembered details or verifies the shopping answer; unresolved displayed goals still require selection under the task contract.',
      '4. Write choiceRef.source for the UI BEFORE the current action. A walk, shelf opening, browse or cashier call changes the source used by the NEXT decision.',
      '5. Execution authoring checks each explicit prefix with the same final compiler before accepting the draft. Its menu is reference-only offline calculation, never an app experience or an automatically filled declaration. Final whole-plan submission remains required.',
    ],
    sourceTransitions: [
      { action: 'accepted walk to an already chosen waypoint', nextSource: 'location = that waypoint; navigationStateId unchanged. Use its currently available choices, not the old location menu.' },
      { action: 'accepted shelf open', nextSource: 'location unchanged; view = world; activeStation = opened shelf; pageIndex = displayed page (normally 0), not null.' },
      { action: 'accepted checkout/<checkoutId>, e.g. checkout/checkout', nextSource: 'location and navigationStateId unchanged; phase = checkout; view = world; activeStation = the same checkoutId (checkout in the example); pageIndex = null. If the actor then chooses to submit and a cashier is staffed, use control/submit with this source.' },
      { action: 'accepted browse', nextSource: 'location and station unchanged; pageIndex = the chosen displayed page.' },
      { action: 'readList, pause or lookAround', nextSource: 'location unchanged. readList makes the displayed objectives available only on the next decision.' },
      { action: 'viewCart from world without an open station', nextSource: 'location/navigationStateId/phase unchanged; view=cart, activeStation=null, pageIndex=null. cart is a view, never a station ID.' },
      { action: 'viewCart from an open shelf', nextSource: 'location/navigationStateId/phase unchanged; view=cart, activeStation remains that shelf, pageIndex=null. Retain the last shelf page as hidden drafting state for closeView, not as currently displayed.' },
      { action: 'viewHelp from world without an open station', nextSource: 'location/navigationStateId/phase unchanged; view=help, activeStation=null, pageIndex=null.' },
      { action: 'closeView', nextSource: 'location/navigationStateId/phase unchanged; view=world. With a still-open shelf, activeStation remains that shelf and pageIndex returns to its prior displayed page; otherwise activeStation=null and pageIndex=null.' },
      { action: 'closeStation', nextSource: 'location/navigationStateId unchanged; phase=shopping, view=world, activeStation=null, pageIndex=null. A later shelf open starts at page 0.' },
      { action: 'accepted cashier call', nextSource: 'Use the navigationStateId in this bundle matching the new cashier availability; never invent a state ID or a navigation edge absent from that state.' },
    ],
    executionAuthoring: {
      revision: 'prefix-execution-authoring-v1',
      rewriteContract: 'terminal-intent-preserved-v1',
      finalizationContract: 'incomplete-finalization-fails-request-v1',
      transportRevision: 'prepared-context-v1',
      menuPresentationRevision: options.observationVersion ? 'current-choice-menu-v2' : 'current-choice-menu-v1',
      observationRevision: options.observationVersion ? 'validated-prefix-observation-v4' : 'validated-prefix-observation-v3',
      ...(options.observationVersion ? {
        visibleStructures: 'anchor-visible-structures-v1 adds only actually visible unlabelled shelf bodies to currentObservation.observation.visibleStructures. Each cue is {kind:"shelf",label:"진열대",direction,distanceBand}; it contains no station/category/product ID, coordinate, route, identity or inventory. Seeing a body never authorizes opening a shelf. A direction is relative to the current screen and is not a persistent shelf identity. Its structure:shelf:<direction>:<distanceBand> knowledge cue expires on the next observation; never infer hidden labels or products from it. Empty [] means no such visible body on the current world view, including when a panel covers the world.',
        movementChoicePresentation: 'current-choice-menu-v2 binds each available walk row to the same current source visibleWalkChoices label, direction and distanceBand. IDs, ordering, non-walk labels and availability stay unchanged. Direction/distance describe the current screen, not a recommended route, unseen destination, coordinate or prior visit.',
      } : {}),
      module: 'market-simulator/src/wholeTraceExecutionAuthoring.ts',
      factory: 'createWholeTraceExecutionAuthoringCursor',
      command: 'node market-simulator/cli.cjs author-whole request.json',
      stdinCommand: 'node market-simulator/cli.cjs author-whole -',
      input: 'One JSON file or stdin only: {contextFilePath,operationId,tool,arguments}. No script argument, duplicate path, extra positional argument or unknown flag is accepted. The prepared context.json supplies only transport hostDirectory/requestId; declaring either again at the top level or in arguments is rejected even when equal.',
      context: 'The supervisor saves context.json after preparing the same live host/request. Relative contextFilePath is resolved from the input JSON file directory, or cwd for stdin; relative hostDirectory is resolved from the context file directory. Candidate/repair contents, including their requestId fields, are passed unchanged to existing validation. Prepare/list/validate remain supervisor host operations.',
      inputExample: { contextFilePath: 'context.json', operationId: 'authoring-begin-1', tool: 'begin_whole_trace_authoring', arguments: { maxRewritesPerDecision: 3 } },
      tools: ['begin_whole_trace_authoring', 'whole_trace_authoring_menu', 'append_whole_trace_decision', 'finish_whole_trace_authoring'],
      menu: (options.observationVersion ? 'New current-choice-menu-v2: each walk row uses the same current visibleWalkChoices label/direction/distanceBand; non-walk catalog labels, exact IDs and order remain unchanged. ' : '') + 'Use the latest choiceIds as the authority for the next action. interactionContext describes the same menu branch; availableChoices pairs those exact IDs with labels in the same order, without ranking. view=world can still have an open shelf or staff station. Neither the global catalog nor activeStation=null alone establishes availability. Reference-only calculated state: goalFields has goalId/field/pressure/status after decay rounded to six decimals; observedProductIds excludes the result of the next action; openGoalIds contains the currently open tasks. No remembered values or declaration defaults are supplied. Default assumptions are previous activity and delayMs=0; optional nextDecision.actorState.activity and delayMs preview the actor-chosen context before memory/task updates.',
      currentObservation: 'The execution menu returns currentObservation:{kind:"' + (options.observationVersion ? 'validated-prefix-observation-v4' : 'validated-prefix-observation-v3') + '",acceptedDecisionCount,notice,observation,readObjectives?} for anchor authoring; explicit directional-v2 retains its v2 observation contract. observation is the exact current public ActorObservation from the validated accepted prefix. It preserves visible station signs with direction/distance/near, currently visible products, help text and other actually displayed cues without adding a map, route, hidden product or goal. A visible station with near:false is not yet an available interaction; choose actions only from the unchanged choiceIds. readObjectives is a compatibility alias of observation.readObjectives and is present for the existing single observation after an accepted readList, never before it. The next accepted non-readList action removes both copies; accepting readList again produces a new current list observation. An absent field means not currently displayed, not never read; a present [] is a displayed empty list. Menu queries, activity/delay previews and rejected drafts do not consume or create observations. Never reconstruct current-display from a prior menu, worldReference or archived knowledge. The symbolic source-only cursor supplies no execution observation.',
      emptyAdvisory: 'goalFields:[] means no active memory fields to calculate; openGoalIds:[] means no open tasks; observedProductIds:[] means no products observed. These are not the displayed shopping list. After the first readList, currentObservation.readObjectives can contain items while all three arrays are empty. Do not infer missing list information or a failed authoring request from empty advisory arrays. The AI explicitly authors any task selection, held/uncertain goals, focus and memory uses under the unchanged task/memory rules; the helper supplies none of those declarations.',
      retry: 'begin accepts maxRewritesPerDecision (default 3): one initial attempt plus at most that many resubmissions of a rejected decision. Rejection returns decisionIndex/decisionNumber, path/rule/message/evidence and the unchanged current menu. rewrite has status (awaiting-rewrite or exhausted), decisionIndex, decisionNumber, acceptedDecisionCount, remainingRewrites and message. canRetry=true means the same decision is pending, not a failed whole request: the actor may resubmit a technical correction under the existing intent-preservation policy. No replacement action or value is suggested. The accepted prefix is preserved and the entire authoring request fails when this budget is exhausted.',
      metrics: 'Results and authoring.jsonl record firstAttemptPassed, attempts, rewriteCount, rejectedRules and originalEnding (nonterminal, submit or giveUp) for each decision, plus firstAttemptAccuracy, rewriteContract and finalizationContract. A failed request also reports failureCode. This is separate from final planningSubmissions/maxRepairs and is not a measurement of native model calls.',
      finalization: 'Finish declares the already authored full plan, not a test of an unfinished prefix. Only finalize after an independently chosen terminal action or the existing 100-action horizon. An unfinished plan without a pending rejected decision fails the request as AUTHORING_INCOMPLETE_FINALIZATION, preserves the accepted candidate and cannot accept continuation, a new ending, begin, submit or repair. Do not append a giveUp to resolve a finalization error. Normal voluntary endings during authoring remain allowed with no minimum action or purchase count. AUTHORING_REWRITE_PENDING remains a separate recoverable pending-decision check under its unchanged budget.',
      repair: 'Within the same whole-plan context, correct only the reported technical issue without optimizing purchases or changing the original intent. Each decision retains its FIRST draft terminal intent (nonterminal, submit or giveUp), determined by its concrete catalog control, not basis.intent. Adding, switching or removing an ending during rewrite rejects as AUTHORING_REWRITE_CHANGED_ENDING and uses the same bounded rewrite budget. Unknown or malformed original choice references do not establish an ending. This structural guard does not infer natural-language intent or prove all semantic intent preservation. A valid reference correction or necessary nonterminal panel prerequisite may still be authored; no replacement is supplied. A pending rejected decision cannot be skipped with finish or submit. After acceptance, a new decision may voluntarily end. Finish returns the complete candidate; submit it unchanged. A final rejection still uses the existing repair_whole_trace accepted-prefix/original-ending contract and maxRepairs budget.',
      authorship: '참고용 계산값이며 보조기는 행동이나 상태를 자동 수정·보충하지 않는다. uncertainGoalIds를 포함한 모든 선언은 계속 AI가 작성한다.',
    },
    sourceAuthoring: {
      revision: WHOLE_TRACE_SOURCE_AUTHORING_REVISION,
      module: 'market-simulator/src/wholeTraceAuthoringSource.ts',
      factory: 'createWholeTraceSourceAuthoringCursor',
      draftExample: { choiceRef: { choiceId: 'control/readList' }, delayMs: 1800,
        reason: '화면에 보이는 목록을 읽는다.', ...structuredClone(readList) },
      taskDeclarationExamples: {
        scope: 'Independent conditional source-free syntax examples, not a recommended sequence or complete plan. Choose every action, goal, value, quantity and ending yourself. READ_GOAL_ID and CURRENT_CLEAR_GOAL_NAME are placeholders, not supplied answers; uncertainty and any other pending goals must match your own current declaration.',
        firstRead: { precondition: 'No read or selected goals yet; the actor independently chose currently available readList. Do not select the not-yet-read goal in this decision.',
          draft: sourceFreeControl('control/readList', '현재 화면의 목록을 읽는다.', readList) },
        selectAfterRead: { precondition: 'The previous chosen action is readList; no task was open; READ_GOAL_ID is one currently displayed unfinished goal independently chosen by the actor. heldGoalIds includes it in this same decision.',
          draft: sourceFreeControl('control/lookAround', '목록에서 고른 목표를 유지하며 주변을 살핀다.', selectAfterRead) },
        taskForOpenGoal: { precondition: 'READ_GOAL_ID is already open, its name is currently clear, and the actor chose the available lookAround action for that goal. No new selection is implied.',
          draft: sourceFreeControl('control/lookAround', '현재 목표를 위해 보이는 주변을 살핀다.', openTask) },
        recoverOpenGoal: { precondition: 'A help view is open, closeView is available, READ_GOAL_ID is already open and its name is clear. The actor chose goal-bound recovery; recover requires basis.goalId even for closing a view.',
          draft: sourceFreeControl('control/closeView', '열린 목표로 돌아가려고 도움말을 닫는다.', recoverTask) },
        checkWithPending: { precondition: 'READ_GOAL_ID remains open; viewCart is available and the actor chose a non-goal-bound check. Keeping an open goal does not force a goal-bound intent.',
          draft: sourceFreeControl('control/viewCart', '장바구니 화면을 확인한다.', checkWithPending) },
        helpWithPending: { precondition: 'READ_GOAL_ID remains open; viewHelp is available and the actor chose non-goal-bound help. help with goalId:null differs from recover, which needs an open goal reference.',
          draft: sourceFreeControl('control/viewHelp', '이용 방법을 확인한다.', helpWithPending) },
        giveUpAfterRead: { precondition: 'After a chosen readList with no task open, the actor independently chooses available giveUp. That actual action is exempt from selecting a displayed goal; a finish label on walking is not. This is not a suggestion to end a plan to avoid an error.',
          draft: sourceFreeControl('control/giveUp', '지금 장보기를 그만두기로 한다.', declaration('finish', 'finish', '장보기를 중단한다')) },
        giveUpWithPending: { precondition: 'The actor independently chooses available giveUp while READ_GOAL_ID is still pending. Ending need not abandon or complete pending goals, buy anything, or repair the cart.',
          draft: sourceFreeControl('control/giveUp', '진행 중인 목표가 있지만 지금 장보기를 그만두기로 한다.', giveUpWithPending) },
        ...(options.authoringExampleVersion === 'walk-while-unseen-v1' ? { walkWhileUnseen: {
          precondition: 'READ_GOAL_ID is open and its name is clear. No shelf, sign or product for it is visible on the current screen yet, and CURRENT_AVAILABLE_WAYPOINT_ID is one walk in the latest choiceIds. The actor independently chooses to keep looking by walking. This is a syntax example, not a required route, minimum walk count or ban on help, pause or giving up.',
          draft: sourceFreeControl('walk/CURRENT_AVAILABLE_WAYPOINT_ID', '아직 목표 매대가 보이지 않아 다른 통로로 더 걸어가 본다.', walkWhileUnseen) } } : {}),
      },
      taskPreflight: {
        errorCode: 'AUTHORING_TASK_DECLARATION',
        scope: 'Checks the symbolic lifecycle of actor-declared goal IDs and same-decision held/basis/focus consistency before appending. Only the next decision after an authored readList has expected displayed IDs. Known IDs never restore goal details or memory values.',
        limitations: 'No real observation, cognition pressure/status, remembered value, purchase success or completion evidence is computed. A declared complete is not proof of an accepted purchase. Final unchanged compiler/knowledge/task-memory/cognition guards remain authoritative.',
        rejection: 'Reject without changing the draft or cursor and without supplying a goal, intent, action, quantity or ending. This symbolic helper grants no repair or regeneration budget itself; executionAuthoring separately reports the already configured per-decision budget through canRetry/rewrite. Preserve the rejected input under the run policy.',
      },
      examplePrecondition: 'Source-free syntax only, not a recommended first action. This example assumes no goals have been read/selected and readList is currently available. All other decision fields remain actor-authored, including quantities when choosing add/remove. Never copy the empty goal arrays after selecting a task.',
      methods: {
        menu: (options.observationVersion ? 'New current-choice-menu-v2 binds each walk row to its saved current source visibleWalkChoices label/direction/distanceBand without changing IDs, order, non-walk labels or available controls. ' : '') + 'cursor.menu() returns expectedSource, decisionCount, terminal, choiceIds, allowedWaypointIds and saved visibleWalkChoices for this source. presentationRevision=current-choice-menu-v1 adds interactionContext (kind/stationId/label), availableChoices (choiceId/label) and notice. Context comes from the same availability branch; labels keep exactly the choiceIds order. These are unranked saved controls, not executed observations, remembered goals or approval of the next action. Other controls remain listed; no walking is required. Panel and cashier state affect the menu; world does not imply a closed station.',
        append: 'cursor.append(sourceFreeDecision) checks the exact selected control and adds only its pre-action source. On rejection error.context records the unchanged menu and decisionCount (zero-based rejected index). It never overwrites a supplied source. A rejection commits no decision or state change and grants no repair/regeneration budget itself; the executionAuthoring wrapper uses its existing configured budget and reports whether the actor may rewrite this same decision.',
        finish: 'cursor.finish() returns {candidateVersion,requestId,decisions} after the actor-authored full plan. Keep the source-free draft and returned candidate separately. Only submit this candidate once under the prepared request budget; finish does not certify knowledge, memory or physical execution.',
      },
      movement: 'Use the exact current navigationStateId and location; allowedWaypointIds are directed outgoing edges. W013→W012 may be absent even if IDs are consecutive or W012→W013 exists. A global catalog entry or a route reachable in several hops is not one available walk. Source changes only after an explicitly chosen valid walk. The helper never infers reversibility, inserts hops, ranks shortest paths or replaces an action. The actor may correct a rejected choice only within the existing executionAuthoring technical-rewrite policy, preserving the accepted prefix and original intent without optimizing purchases.',
      authorship: 'menu/append are local symbolic drafting calls within the same whole-plan actor context, not game steps or fresh AI calls. Full-array assembly after authorship can diagnose errors but cannot prevent choices already written. Record whether menu inspection occurred during authorship or only after the whole draft; these are different authoring conditions.',
      scope: 'Optional symbolic drafting aid for this saved bundle. Supply every actor-chosen field except source. It writes only the expected pre-action source and checks the saved directional menu plus explicit task-declaration consistency. It never executes the game, supplies runtime observations or remembered values, inserts missing actions, chooses goals/products/quantities/endings, or repairs an existing candidate. Full submission validation remains mandatory.',
    },
    examples: {
      instruction: 'Most entries are declaration fragments: supply the actor-chosen legal action, current source, delay and reason. completeProductDecisions contains complete syntax examples with placeholders, not an executable plan or required route. All example IDs are placeholders; prerequisites must actually hold.',
      readListThenSelect: {
        precondition: 'No goals have been read or selected yet. The actor chooses readList; on the following decision a goal is actually displayed. This example selects one goal then explores without binding the exploration to its name.',
        readList, nextDecision: selectAfterRead,
      },
      completeAfterAdd: {
        precondition: 'READ_GOAL_ID is the only open goal. A previous accepted add was bound to it and its result is now observed. The actor chooses to complete it, close the shelf and shift attention to surroundings. Closing is not a separate verification. This orient/explore activity is specific to this example, not mandatory for every close. If a goal-bound check is still intended, keep the task open until it is completed.',
        declaration: completeAfterAdd,
      },
      completeWithOtherTask: {
        precondition: 'As above, but OTHER_OPEN_GOAL_ID is also open and is currently clear. Complete only READ_GOAL_ID; retain every other open goal and its real uncertainty. This example does not select another goal automatically.',
        declaration: completeWithOtherTask,
      },
      selectObservedProduct: {
        precondition: 'READ_GOAL_ID has already been read and selected, remains open, and its name and required quantity are currently clear. The actual name replaces CURRENT_CLEAR_GOAL_NAME; 2 is an illustrative remembered required quantity, not the quantity to choose. OBSERVED_CHOSEN_PRODUCT_ID replaces the actually displayed product the actor is attending. Supply the independently chosen legal add/remove and quantity, even when mistaken; never copy a hidden answer or manufacture focus to match an accidental selection. Other open goals and uncertainty must also be retained.',
        declaration: selectObservedProduct,
      },
      completeProductDecisions: {
        precondition: 'Syntax examples, not a required purchase/return. The goal must already be read/open and its name/required quantity clear. Replace W000, CURRENT_NAVIGATION_STATE_ID, OPEN_SHELF_ID and all goal/product placeholders with the actual currently available source and actor-chosen IDs. remove uses the cart opened from that product’s shelf with an actual return control and sufficient cart quantity. Quantity 1 and remembered total 2 deliberately differ: choose both independently; neither is a default. Choose delay/reason independently too.',
        add: productDecision('add'), remove: productDecision('remove'),
      },
      interestWithPendingGoal: {
        precondition: 'The actor chooses to attend an already displayed interest product while READ_GOAL_ID is still open. No goal is the present focus, but it stays held with its real uncertainty. This example does not require any detour or purchase.',
        declaration: interestWithPendingGoal,
      },
    },
  };
}

export type WholeTraceAuthoringGuide = Omit<ReturnType<typeof buildWholeTraceAuthoringGuide>, 'authoringVersion'>
  & { authoringVersion: '1' | '2' };
