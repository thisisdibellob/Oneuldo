import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalMarketReplayJson } from '../../frontend/src/game/marketReplayTrace';
import { DEFAULT_REPLAY_PRESENTATION, wholeReplayWaypointCatalog, wholeReplayWaypointGraph, replayPresentationKey, replayShelfPageFractions,
  visibleShelfProductIds } from '../../frontend/src/game/marketReplayPerception';
import type { MarketCashierAvailability } from '../../frontend/src/game/marketEnvironment';
import { getMarketProduct } from '../../frontend/src/game/scenarios';
import { getMarketHelpLines } from '../../frontend/src/game/marketHelp';
import { ActorLearningMemory } from './actorLearning';
import { ACTOR_PERSONA_INSTRUCTIONS } from './actorInstructions';
import { getPersona } from './personas';
import { TraceGuard } from './traceValidation';
import { WholeTraceKnowledgeLedger } from './wholeTraceKnowledge';
import { buildWholeTracePersonaInput } from './wholeTracePersona';
import { buildWholeTraceChoiceCatalog, wholeTraceChoiceFrame } from './wholeTraceChoices';
import { WholeTraceCognitionEngine, WHOLE_TRACE_COGNITION_INSTRUCTIONS } from './wholeTraceCognition';
import { WholeTraceTaskMemoryEngine, WHOLE_TRACE_TASK_MEMORY_INSTRUCTIONS } from './wholeTraceTaskMemory';
import { buildWholeTraceAuthoringGuide, WHOLE_TRACE_AUTHORING_INSTRUCTIONS } from './wholeTraceAuthoring';

const WHOLE_TRACE_FOCUS_INSTRUCTIONS = `매 단계 focusedGoalId와 focusedProductId를 별도로 기록한다. focusedGoalId는 지금 처리하는 실제 읽은 목표 한 개이고 heldGoalIds에 포함되어야 한다. focusedProductId는 이번 방문에서 실제 선반이나 장바구니에 표시된 상품 중 지금 살피거나 고르는 한 개다. 집중 대상이 없으면 null을 쓰며 heldGoalIds의 첫 항목을 집중 목표로 복사하지 않는다. 목록을 읽기 전에는 집중 목표가 null이고 상품을 보기 전에는 집중 상품도 null이다. 관심 상품을 살필 때 focusedGoalId는 null일 수 있지만 아직 끝내지 않은 구매 목표는 taskMemory.openGoalIds와 heldGoalIds에 계속 남는다. 상품을 실제로 살피기 시작하면 실제 표시된 focusedProductId와 그 관심에 따른 행동을 연결한다. 담거나 돌려놓는 상품과 현재 집중 상품이 다르면 그 불일치를 그대로 기록하며 정답 상품으로 바꾸지 않는다.
한 상품을 처리한 뒤 다음 항목으로 넘어갈 때는 선택한 개인의 실제 확인 습관을 이어간다. 선택한 프로필이 다음 항목에서 목록을 다시 확인하는 습관을 가진 경우(지민)는 이유에 목록 cue를 쓰는 것으로 대신하지 않고 실제 readList 행동으로 표현한다. 다른 개인에게 지민의 습관을 추가하지 않는다. 집중 목표를 바꾼 뒤 목록을 읽고 다음 상품을 담는 순서도 가능하다. 새 표지·처음 여는 선반·여러 목표와 수량 조건·실제로 눈에 들어온 관심 상품에 따라 현재 집중, 불확실성, 확인이나 스스로 회상하는 선택을 연결한다. 변화의 계기를 알려진 triggerCueRefs와 짧은 행동 설명으로 남긴다. 간편식품 표지를 본 것과 카레 종류를 실제로 본 것은 다르다. 낯섦이나 관심을 이유에만 쓰고 상태와 행동을 매번 동일하게 복사하지 않는다. 상황이 단순하거나 익숙하면 안정적으로 수행할 수 있으며 관심 전환·망각·망설임 횟수를 채우지 않는다.`;
import { WHOLE_TRACE_BUNDLE_VERSION, WHOLE_TRACE_MODEL, WHOLE_TRACE_POLICY_VERSION, type WholeTraceBundle, type WholeTraceNavigation, type WholeTraceSettings } from './wholeTraceContracts';

export function wholeTraceInputHash(settings: WholeTraceSettings) {
  const { outputPath: _path, ...input } = settings;
  return createHash('sha256').update(canonicalMarketReplayJson({ bundleVersion: WHOLE_TRACE_BUNDLE_VERSION, input })).digest('hex');
}
const actionContract = {
  format: 'DEFAULT candidateVersion:"7": each decision is {choiceRef:{source:{location,navigationStateId,phase,view,activeStation,pageIndex},choiceId,quantity?},delayMs,reason,basis:{intent,goalId,cueRefs?,memoryUses:[]},actorState:{activity,task,heldGoalIds,uncertainGoalIds,focusedGoalId,focusedProductId,orientation,triggerCueRefs?,memoryUpdate?,taskUpdate?}}. goalId is required, a selected goal ID or null. memoryUses is required even when empty. Optional taskUpdate is an ARRAY, e.g. taskUpdate:[{type:"select",goalId:"READ_GOAL_ID"}], never a single object; omit or use [] when unchanged. Select exactly one allowed type per entry: select, complete or abandon. authoringGuide gives exact enums and conditional declaration examples; its placeholder IDs are not actual goals. Momentary focus never deletes pending goals. Do not include action or separately copy a target ID. Candidate 6 retains working memory without persistent tasks, 5 focus without cognition, 4 choices without required focus, 3 legacy direct actions; never mix their fields.',
  choiceSource: 'Copy the exact PRE-ACTION source: location starts as start and changes only after an accepted walk; navigationStateId starts at navigation.initialStateId and changes only after a cashier call. phase/view/activeStation/pageIndex describe the actual displayed UI. An open shelf has view:"world", activeStation:<shelf ID>, pageIndex:<page>, never view:"shelf"; checkout uses phase:"checkout", view:"world", activeStation:<checkout ID>, pageIndex:null. pageIndex is null when no shelf page is displayed, including cart/help. Source + choiceId binds a selection; an old source-bound reference cannot be reused in another state even when the control ID exists there too. The catalogue has shared common controls, current-location navigation menus, matching shelf pages and panel templates, not ranked routes. Select only controls available in that source; close overlays/stations before movement.',

  walk: 'Choose walk/<waypointId> from choiceCatalog.navigation at your current location in the matching navigation state. Start at state.start; after a walk use that waypoint node. An edge permits one visible clear hop; it is directed, unranked and not a route or recommendation. Coordinate proximity or adjacent IDs alone never implies a connection. Close an open view/station before walking.',
  interact: 'Choose open/<stationId> only for a shelf/employee in the current location nearbyStations. Opening/closing a station does not move you. Close the station before walking.',
  add: 'Choose add/<productId> with an explicit choiceRef.quantity (1..99); no default quantity exists. The shelf must be open at a page displaying that product and stock must suffice. Adding expands to the existing drag gesture.',
  browse: 'Choose browse/<stationId>/<zero-based pageIndex> from the currently open shelf browseChoiceIds. The compiler maps it to the shared scroll fraction.',
  readList: 'Read the displayed list, duration 2000ms. Reading is a real planned action; it does not change position.',
  pause: 'Wait in place for 1500ms; no new area is revealed. lookAround also waits in place for 1500ms.',
  views: 'viewCart/viewHelp, closeView and closeStation use existing visible controls. Removing requires a displayed return control.',
  staff: 'requestCashier requires an open employee dialogue and an empty cashier. Afterwards that checkout becomes staffed: use the navigation state matching updated cashierAvailability; waypoint IDs stay fixed. Other actions retain the current state. Product return uses only displayed remove controls; employee return is not offered by this candidate contract.',
  checkout: 'Choose checkout/<checkoutId>, e.g. checkout/checkout, for a checkout in current location nearbyStations. On acceptance the next source keeps location/navigationStateId and uses phase:"checkout", view:"world", activeStation:<same checkoutId>, pageIndex:null. Choose control/submit only when the checkout is open and its cashier is staffed. An explicit choiceCatalog.referenceAliases entry {aliasChoiceId,canonicalChoiceId,kind:"checkout-open-v1"} permits only open/<checkoutId> -> checkout/<same checkoutId>, with an exact current source, an actual checkout target and a currently available canonical button. Bundles without that entry keep strict ID matching. The compiler records authored/resolved references and any normalization without changing the original candidate, target, route, quantity, delay, reason or ending, and without another model call. giveUp is a voluntary terminal action; never insert it to bypass a technical error. A repair cannot introduce giveUp if the original candidate did not end that way.',
  ending: 'Provide 1..100 decisions within generationLimits.technicalActionBudget. End with submit/giveUp, or provide exactly 100 nonterminal decisions. A technical budget below 100 requires natural termination within that budget; it does not trigger early system checkout. At the 100-action horizon the system checks out the unchanged basket. Short unfinished arrays fail.',
  timing: 'Each decision has delayMs 1..120000 and a short observable reason. Read/browse/pause/view/interact/checkout do not change your location. The source manifest identifies shared code; Node executes and validates it after submission, not inside the model.',
  basis: 'Each decision requires basis:{intent:"explore|interest|task|check|recover|help|finish|rest",cueRefs?:[...]}. The compiler derives exact selected action/control references from the chosen entry and actual read objectives held/uncertain now, never hidden objectives or another target. Explicit references are retained and every unknown reference still rejects. Choose one intent, not the pipe-separated literal. Only current-screen cues, facts previously displayed this visit, profile cues and confirmed historical episodes are known. The canonical selected references, supplied automatically in v4, are: walk anchor:<catalog anchorId>; interact/checkout station:<id>; add product:<id>; remove product:<id> or cart:product:<id>; browse shelf or shelf-page:<stationId>; readList list; requestCashier cashier:<id>. Additional refs: objective:<id> after readList, phase:<phase>, view:<view>, instruction:<phase>:<index>, support:<index> after viewHelp, cart after viewCart/checkout, result/error after feedback. Initial profile/prior refs are listed in actorState.knowledge. IDs are opaque; do not infer a target/product from an ID or a global catalogue before discovery.',
  actorState: 'Every decision requires actorState BEFORE that action, reflecting the previous observed result and the goal set AFTER the taskUpdate in this decision (see authoringGuide.decisionTiming): {activity:"orient|shop|interest|recover|check|finish|rest",task:"short observable activity",heldGoalIds:[],uncertainGoalIds:[],focusedGoalId:null,focusedProductId:null,orientation:"unfamiliar|recognizing|familiar",triggerCueRefs?:[...]}. Pick one enum value, not the pipe literal. Start from actorState.initialState; change state using currently known cues. V5 and V4 can omit triggerCueRefs to avoid duplicating selected control/read-goal references; explicit trigger references remain bounded to 0..12 and are validated. Compiler-derived proof links are recorded separately and may extend the merged canonical set without expanding the declared-reference budget. Candidate 5 requires focusedGoalId and focusedProductId as an ID or null; focusedGoalId must be actually read and held now, and focusedProductId must have appeared on a shelf or in the cart this visit. Focus is separate from archive order. Personal interest can have a focused product with no shopping goal. The real ledger archives displayed facts; heldGoalIds separately describes the small active task set, bounded by persona.behavior.behavioralContext.goalMemoryCapacity. Only actually read objective IDs may enter either goal array, and readList supplies them for the NEXT decision. uncertainGoalIds may overlap heldGoalIds; a goal can remain known yet unclear. No mandatory forgetting or probability rolls. After an interest switch, explicitly maintain or recover the chosen activity using remembered goal/instruction cues or real list/cart checking. State summaries are fictional public behavior annotations, not private reasoning or measured cognition. No separate currentTask field: actorState.task supplies it.',
  personaReview: 'A separate persona review compares explicit focus with actual accepted selections, flags missing individual list checks and unsupported recovery/uncertainty transitions. It separately records unfamiliar local cues, read-goal load, category signs and actual preferred-product exposure. It does not rank routes, add wandering, correct the cart, require errors, or prove clinical validity. A clear review means no automated warning; missing exposure or missing legacy focus is not proof of character expression.',
  workingMemory: WHOLE_TRACE_COGNITION_INSTRUCTIONS,
  taskMemory: WHOLE_TRACE_TASK_MEMORY_INSTRUCTIONS,
  reactionTiming: 'Use the persona timingBaseline as synthetic context and choose each delayMs from the CURRENT activity, unfamiliarity, uncertainty, comparison and support. Judgment waits and explicit pause/lookAround are retained; no compact speed-up or random timing noise is added. Wait, reaction, movement and drag durations are separate. Do not fill every action with the same default delay; stable routine can be quicker than unfamiliar multi-condition choice without requiring a pause in every episode.',
};

export function buildWholeTraceBundle(settings: WholeTraceSettings, requestId: string): WholeTraceBundle {
  if (settings.timingProfile !== undefined && settings.timingProfile !== 'original')
    throw new Error('Whole-trace-v3 preserves actor judgment timing; use original');
  const snapshot = settings.snapshot, persona = getPersona(settings.personaId);
  const guard = new TraceGuard(snapshot, persona.id, persona.version, WHOLE_TRACE_MODEL, true);
  const raw = guard.observe(), initialObservation = guard.observeActor();
  const presentation = structuredClone(snapshot.presentation ?? DEFAULT_REPLAY_PRESENTATION);
  const waypoints = wholeReplayWaypointCatalog(raw.environment, raw.cashierAvailability);
  const checkoutIds = raw.environment.checkouts.map(c => c.id).sort();
  const stateId = (cashiers: Partial<MarketCashierAvailability>) => `cashiers-${checkoutIds.map(id => cashiers[id] ? '1' : '0').join('') || 'none'}`;
  let availabilities: Partial<MarketCashierAvailability>[] = [Object.fromEntries(checkoutIds.map(id => [id, raw.cashierAvailability[id]]))];
  // Staff can only be called to an empty counter. Enumerate its possible occupancy,
  // not paths, rewards, shopping targets or preferred choices.
  for (const id of checkoutIds.filter(id => !raw.cashierAvailability[id]))
    availabilities = availabilities.flatMap(cashiers => [cashiers, { ...cashiers, [id]: true }]);
  const navigation: WholeTraceNavigation = {
    schemaVersion: '1', view: 'world', presentationKey: replayPresentationKey(presentation),
    initialStateId: stateId(raw.cashierAvailability), initialLocation: 'start', startPoint: { ...raw.playerPosition },
    states: availabilities.map(cashiers => {
      const graph = wholeReplayWaypointGraph(raw.environment, raw.playerPosition, presentation, cashiers, waypoints);
      return { stateId: stateId(cashiers), cashierAvailability: graph.cashierAvailability,
        start: { allowedWaypointIds: graph.startAllowedWaypointIds, nearbyStations: graph.startNearbyStations }, nodes: graph.nodes };
    }),
  };
  const memory = new ActorLearningMemory(settings.attentionExperience?.learning);
  memory.observe(initialObservation);
  const knowledge = new WholeTraceKnowledgeLedger(persona, settings.attentionExperience?.learning).observe(initialObservation).knowledge;
  const paths = ['src/actorInstructions.ts', 'src/actorChoices.ts', '../frontend/src/game/marketReplayPerception.ts', '../frontend/src/game/marketSession.ts',
    'src/simulator.ts', 'src/traceValidation.ts', 'src/wholeTraceBundle.ts', 'src/wholeTraceContracts.ts', 'src/wholeTraceKnowledge.ts', 'src/wholeTraceCompiler.ts', 'src/wholeTracePersona.ts', 'src/wholeTraceActorState.ts', 'src/wholeTraceChoices.ts', 'src/wholeTraceCognition.ts', 'src/wholeTraceTaskMemory.ts', 'src/wholeTraceTaskExpression.ts', 'src/wholeTraceAuthoring.ts'];
  const sourceFiles = paths.map(p => ({ path: p, sha256: createHash('sha256').update(readFileSync(resolve(__dirname, '..', p))).digest('hex') }));
  const inputHash = wholeTraceInputHash(settings);
  const bundle: WholeTraceBundle = {
    candidateVersion: '7', supportedCandidateVersions: ['7', '6', '5', '4', '3'],
    choiceCatalog: undefined as unknown as WholeTraceBundle['choiceCatalog'],
    initialChoiceFrame: undefined as unknown as WholeTraceBundle['initialChoiceFrame'],
    bundleVersion: WHOLE_TRACE_BUNDLE_VERSION, requestId, inputHash, policyVersion: WHOLE_TRACE_POLICY_VERSION,
    model: WHOLE_TRACE_MODEL, reasoningEffort: 'low', observationScope: 'whole-world', actorKnowledgeScope: 'observed-and-remembered', snapshotId: snapshot.snapshotId,
    seed: settings.seed, persona: { id: persona.id, version: persona.version, name: persona.name,
      description: persona.description, character: structuredClone(persona.character), behavior: buildWholeTracePersonaInput(persona) },
    authoringGuide: buildWholeTraceAuthoringGuide({ requestId, inputHash, snapshotId: snapshot.snapshotId,
      persona, seed: settings.seed, candidateVersion: '7' }),
    generationLimits: { acceptedActionHorizon: 100, technicalActionBudget: settings.maxActions ?? 100,
      maxRepairs: settings.maxRepairs ?? 0, ...(settings.timeBudgetMs === undefined ? {} : { plannedTimeBudgetMs: settings.timeBudgetMs }) },
    worldReference: { world: structuredClone(raw.environment), presentation,
    waypoints, navigation,
    shelves: Object.entries(snapshot.config.inventoryProductIds ?? {}).map(([stationId, ids]) => {
      const products = (ids ?? []).map(id => {
        const p = getMarketProduct(id)!;
        return { id, name: p.name, detail: p.detail, price: p.price, stock: snapshot.initialStock[id] };
      });
      return { stationId, products, pages: replayShelfPageFractions(ids ?? [], presentation).map((fraction, pageIndex) =>
        ({ pageIndex, visibleProductIds: visibleShelfProductIds(ids ?? [], presentation, fraction) })) };
    }),
    objectives: structuredClone(raw.objectives), helpText: getMarketHelpLines(snapshot.config.alarmPenaltyPoints) },
    actorState: { initialObservation, knowledge, experience: memory.getState(), workingMemory: new WholeTraceCognitionEngine(buildWholeTracePersonaInput(persona).cognition).snapshot(),
      taskMemory: new WholeTraceTaskMemoryEngine(persona.attention?.goalMemoryCapacity ?? 2).snapshot(), initialState: {
      activity: 'orient', task: '현재 시작 안내와 매장 입구를 살피기', heldGoalIds: [], uncertainGoalIds: [], focusedGoalId: null, focusedProductId: null,
      orientation: settings.attentionExperience?.visit === 'revisit' ? 'recognizing' : 'unfamiliar', triggerCueRefs: ['phase:shopping'],
    } },
    instructions: `${WHOLE_TRACE_AUTHORING_INSTRUCTIONS}\n${ACTOR_PERSONA_INSTRUCTIONS}\n${WHOLE_TRACE_FOCUS_INSTRUCTIONS}\n${WHOLE_TRACE_COGNITION_INSTRUCTIONS}\n${WHOLE_TRACE_TASK_MEMORY_INSTRUCTIONS}\n전체 행동을 한 번 제출하되, worldReference는 세계가 어떻게 반응하고 무엇을 화면에 표시하는지 재현하기 위한 참고 자료다. 그 안의 숨은 배치·재고·목표·정답은 인물이 이미 아는 사실이 아니다. 인물의 출발 지식은 actorState.initialObservation, knowledge, 확인된 experience와 persona뿐이다. 매 행동 전에 현재 화면과 기존 발견 기억을 갱신하고 그 범위에서 이 인물이 판단한다. 걷기로 드러난 매대 표지, 실제 연 선반 페이지의 상품·재고, 실제 읽은 목록, 실제 본 장바구니와 도움만 발견 지식에 추가한다. entry/checkout instructions에 실제 표시된 설명도 단서다. 취향은 관심 동기이며 상품의 숨은 위치를 알려주지 않는다. 이전 회차 경험은 과거 사실이며 새 목표나 배치를 자동으로 알려주지 않는다.\npersona.behavior.individualInstructions의 구체적인 선택·확인 습관을 적용하고, 각 단계 actorState에 현재 활동·활성 목표·불확실성과 변화 계기를 기록한다. 읽은 목록을 아카이브에 보관하는 것과 모든 목표를 언제나 정확히 떠올리는 것은 다르다. 관심 전환 후에 목표를 유지했는지, 불확실해졌는지, 어떤 실제 단서로 다시 잡았는지 다음 단계에 이어 간다. 상태를 매번 초기화하거나 recover 표지만 붙이지 않는다. 인물의 몇 가지 일관된 특성, 목표·취향·현재 관심 활동을 유지한다. 처음 보는 통로에서 둘러보기, 눈에 들어온 다른 관심사로 이동, 불확실하여 되돌아가기, 익숙한 방법부터 시도하기, 피드백을 보고 바꾸기와 도움 사용도 상황에 따라 직접 선택한다. 이미 모르는 목표의 위치를 향해 전역 최단 경로를 짜지 않는다. 반대로 실수·방황·망설임 횟수를 의무적으로 채우거나 이유 없이 반복하지 않는다. 가장 짧은 경로나 완벽한 장바구니를 강제하지 않는다.\nnavigation은 현재 화면의 합법 이동 관계를 확인하는 참고 표다. 초기상태 start에서 시작하고 걷기마다 현재 waypoint를 갱신한다. 현재 allowedWaypointIds에서 화면에 들어온 통로를 선택하며 숫자 순서·거리·상품 전역 목록을 정답 단서로 삼지 않는다. 직원 호출 후에는 계산대 상태에 맞는 navigation 상태를 사용한다. 매 단계 choiceRef에는 현재 위치·상태·화면에 묶인 source와 실제 선택한 choiceId를 쓴다. 초기 선택지는 initialChoiceFrame에서 시작한다. 선택 ID만으로 다른 source에서 같은 행동을 실행할 수 없다. basis에는 활동 intent를 쓰고, 필요할 때만 이미 알고 있는 추가 cueRefs를 쓴다. 버튼 단서와 버튼을 눌러 확인한 내용을 구분하며 장바구니 버튼을 봤다고 cart 내용을 알지는 않는다. 액션·대상 단서의 정확한 실행 표기는 생성기가 선택지에서 옮기므로 직접 복사하지 않는다. reason에는 관찰 가능한 짧은 설명만 쓴다. 사적인 사고 과정이나 장애를 연기한다는 설명을 쓰지 않는다. 실제 상태 전개와 공용 가드·단서 원장 검증은 전체 제출 후 Node가 수행한다. 모델에는 전체 참고 자료가 제공되므로 이는 역할 지식 분리와 선언한 단서 검증이며 강한 정보 차단 보장은 아니다. 앱 수행·학습 완료의 증거도 아니다. candidateVersion:"7",requestId,decisions만 있는 JSON 객체로 전체 계획을 제출한다.`,
    actionContract, sourceFiles,
  };
  bundle.choiceCatalog = buildWholeTraceChoiceCatalog(bundle.worldReference);
  bundle.initialChoiceFrame = wholeTraceChoiceFrame(initialObservation, bundle,
    { location: 'start', navigationStateId: navigation.initialStateId });
  return bundle;
}
