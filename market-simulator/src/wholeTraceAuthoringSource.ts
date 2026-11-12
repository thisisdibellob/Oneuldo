import { canonicalMarketReplayJson } from '../../frontend/src/game/marketReplayTrace';
import { validateWholeTraceCandidate, validateWholeTraceChoiceDecisionSyntax,
  type WholeTraceBundle, type WholeTraceChoiceSource, type WholeTraceTaskChoiceCandidate,
  type WholeTraceTaskChoiceDecision } from './wholeTraceContracts';
import type { WholeTraceChoiceEntry, WholeTraceChoiceFrame } from './wholeTraceChoices';
import { wholeTraceDirectionalLocation, wholeTraceIsContinuousFrame, type WholeTraceMovementPosition } from './wholeTraceMovement';
import type { ActorObservation } from './types';
import { visibleAnchors, visibleStations } from '../../frontend/src/game/marketReplayPerception';
import { createWholeTraceAuthoringTaskState, previewWholeTraceAuthoringTasks,
  type WholeTraceAuthoringTaskIssue } from './wholeTraceAuthoringTasks';

/** The actor still supplies every field other than the mechanically tracked source. */
export type WholeTraceSourceDecisionDraft = Omit<WholeTraceTaskChoiceDecision, 'choiceRef'> & {
  choiceRef: Omit<WholeTraceTaskChoiceDecision['choiceRef'], 'source'> & { source?: never };
};
export type WholeTraceExpectedSourceSnapshot = {
  kind: 'symbolic-expected-source-v1' | 'validated-execution-source-v2'; expectedSource: WholeTraceChoiceSource | null;
  decisionCount: number; terminal: boolean;
};
export const WHOLE_TRACE_SOURCE_AUTHORING_REVISION = 'source-task-preflight-v3';
export const WHOLE_TRACE_SOURCE_MENU_PRESENTATION_REVISION = 'current-choice-menu-v2';
const LEGACY_SOURCE_MENU_PRESENTATION_REVISION = 'current-choice-menu-v1';
export type WholeTraceInteractionContext = {
  kind: 'world' | 'shelf' | 'cart' | 'help' | 'staff' | 'checkout' | 'terminal';
  stationId: string | null; label: string;
};
/** Saved, unranked controls for the expected source, not a runtime observation. */
export type WholeTraceSourceAuthoringMenu = WholeTraceExpectedSourceSnapshot & {
  authoringRevision: typeof WHOLE_TRACE_SOURCE_AUTHORING_REVISION;
  presentationRevision: typeof WHOLE_TRACE_SOURCE_MENU_PRESENTATION_REVISION | typeof LEGACY_SOURCE_MENU_PRESENTATION_REVISION;
  interactionContext: WholeTraceInteractionContext;
  availableChoices: { choiceId: string; label: string; direction?: string; distanceBand?: string;
    durationBounds?: WholeTraceChoiceEntry['durationBounds']; recentVisit?: WholeTraceChoiceEntry['recentVisit'] }[];
  notice: string;
  choiceIds: string[];
  allowedWaypointIds: string[];
  visibleWalkChoices: WholeTraceBundle['choiceCatalog']['navigation'][number]['locations'][number]['visibleWalkChoices'];
};
export class WholeTraceSourceAuthoringError extends Error {
  context?: WholeTraceSourceAuthoringMenu;
  contextUnavailable?: string;
  constructor(readonly code: 'AUTHORING_SCHEMA' | 'AUTHORING_SOURCE_SUPPLIED' | 'AUTHORING_CHOICE_NOT_AVAILABLE'
    | 'AUTHORING_UNSUPPORTED_TRANSITION' | 'AUTHORING_TERMINAL' | 'AUTHORING_TASK_DECLARATION'
    | 'AUTHORING_REWRITE_CHANGED_ENDING', message: string,
    readonly issues?: WholeTraceAuthoringTaskIssue[]) { super(message); }
}
const fail = (code: WholeTraceSourceAuthoringError['code'], message: string,
  issues?: WholeTraceAuthoringTaskIssue[]): never => {
  throw new WholeTraceSourceAuthoringError(code, message, issues);
};
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/** Add precise authoring diagnostics without altering the shared wire validator. */
function draftSyntaxIssues(draft: Record<string, unknown>): WholeTraceAuthoringTaskIssue[] {
  const issues: WholeTraceAuthoringTaskIssue[] = [];
  if (Object.hasOwn(draft, 'taskUpdate')) issues.push({ path: 'decision.taskUpdate', rule: 'task-update-location',
    message: 'taskUpdate belongs only at actorState.taskUpdate as an actor-authored array; it is not moved automatically.' });
  if (plain(draft.basis) && Array.isArray(draft.basis.memoryUses)) {
    draft.basis.memoryUses.forEach((use, index) => {
      if (plain(use) && (!Object.hasOwn(use, 'goalId') || typeof use.goalId !== 'string' || !use.goalId.trim()))
        issues.push({ path: `basis.memoryUses[${index}].goalId`, rule: 'memory-use-goal-required',
          message: 'Each memoryUses entry requires its own goalId. basis.goalId is not inherited; no goal reference is inserted.' });
    });
  }
  return issues;
}

/**
 * Drafting aid, not execution or an acceptance oracle. It follows the actor's exact
 * selections against the saved, unranked catalog and predicts their source changes
 * on the assumption that execution accepts them. It never runs the engine, observes
 * a result, reads goal values, selects a route/product/quantity, or inserts an ending.
 * It also rejects contradictions among explicitly authored task ID declarations;
 * that symbolic lifecycle never supplies goal values or actual purchase evidence.
 * Knowledge, working memory, physical execution and all compiler guards still run
 * unchanged after submission. An unexpected/unsupported transition fails closed.
 */
export function createWholeTraceSourceAuthoringCursor(bundle: WholeTraceBundle) {
  if (bundle.bundleVersion !== '8' || bundle.candidateVersion !== '7')
    fail('AUTHORING_UNSUPPORTED_TRANSITION', 'This drafting cursor requires bundle 8 / candidate 7; it never converts a legacy bundle');
  const catalog = structuredClone(bundle.choiceCatalog);
  // Saved bundles retain their original presentation. New v2 menus place the
  // already exposed local direction beside its ID; they add no route knowledge.
  const contextualWalkLabels = bundle.authoringGuide?.executionAuthoring?.menuPresentationRevision
    === WHOLE_TRACE_SOURCE_MENU_PRESENTATION_REVISION;
  const continuous = bundle.movementVersion === 'directional-v2';
  let executionFrame = continuous ? structuredClone(bundle.initialChoiceFrame) : undefined;
  let executionObservation = continuous ? structuredClone(bundle.actorState.initialObservation) : undefined;
  let awaitingExecution = false;
  const navigation = structuredClone(bundle.worldReference.navigation);
  const checkouts = structuredClone(bundle.worldReference.world.checkouts);
  const stationLabels = new Map<string, string>(navigation.states.flatMap(state => [state.start, ...state.nodes]
    .flatMap(node => (node.nearbyStations ?? []).map(station => [station.id, station.label ?? station.id] as const))));
  // ID spelling/exposure metadata only; task preflight never reads goal answers.
  const objectiveIds = bundle.worldReference.objectives.map(objective => objective.id);
  let taskDeclarations = createWholeTraceAuthoringTaskState(bundle.actorState?.taskMemory);
  const goalMemoryCapacity = bundle.persona?.behavior?.behavioralContext.goalMemoryCapacity;
  const requestId = bundle.requestId, actionBudget = Math.min(100, bundle.generationLimits.technicalActionBudget);
  const entries = new Map<string, WholeTraceChoiceEntry>();
  for (const entry of catalog.entries) {
    if (entries.has(entry.choiceId)) fail('AUTHORING_UNSUPPORTED_TRANSITION', `Duplicate catalog choice ${entry.choiceId}`);
    entries.set(entry.choiceId, entry);
  }
  let source = structuredClone(bundle.initialChoiceFrame.source);
  if ((!continuous && (source.location !== 'start' || source.navigationStateId !== navigation.initialStateId))
    || continuous && !wholeTraceIsContinuousFrame(source)
    || source.phase !== 'shopping' || source.view !== 'world' || source.activeStation !== null || source.pageIndex !== null)
    fail('AUTHORING_UNSUPPORTED_TRANSITION', 'This drafting cursor requires the prepared initial shopping/world source');
  // Counts are predictions from explicitly chosen add/remove operations, not observed
  // cart facts or actor memory. They are never injected into a decision or snapshot.
  let expectedCart: Record<string, number> = {}, expectedStock: Record<string, number> = {};
  for (const shelf of bundle.worldReference.shelves) for (const product of shelf.products) {
    if (Object.hasOwn(expectedStock, product.id) && expectedStock[product.id] !== product.stock)
      fail('AUTHORING_UNSUPPORTED_TRANSITION', `Conflicting advertised stock for ${product.id}`);
    expectedStock[product.id] = product.stock;
  }
  let hiddenShelfPage: number | null = null, terminal = false;
  let movementPosition: WholeTraceMovementPosition | undefined;
  const decisions: WholeTraceTaskChoiceDecision[] = [];
  const stateFor = (current: WholeTraceChoiceSource) => {
    const matches = navigation.states.filter(state => state.stateId === current.navigationStateId);
    if (matches.length !== 1) fail('AUTHORING_UNSUPPORTED_TRANSITION', `Unknown or ambiguous navigation state ${current.navigationStateId}`);
    return matches[0];
  };
  const nodeFor = (current: WholeTraceChoiceSource) => {
    if (continuous) return { allowedWaypointIds: (executionFrame?.availableChoices ?? []).flatMap(entry => entry.action.type === 'walk' ? [entry.action.waypointId] : []),
      nearbyStations: [] };
    const state = stateFor(current);
    if (current.location === 'start') return state.start;
    if (bundle.movementVersion === 'directional-v1' && wholeTraceDirectionalLocation(current.location)) {
      // No motor, time integration, guessed waypoint or copied pre-move menu.
      if (!movementPosition || current.location !== `D${movementPosition.decisionCount}`)
        return { allowedWaypointIds: [], nearbyStations: [] };
      const { world, presentation, waypoints } = bundle.worldReference;
      return {
        allowedWaypointIds: visibleAnchors(world, movementPosition.position, presentation, state.cashierAvailability)
          .flatMap(anchor => waypoints.filter(waypoint => waypoint.anchorId === anchor.id).map(waypoint => waypoint.waypointId)),
        nearbyStations: visibleStations(world, movementPosition.position, presentation, state.cashierAvailability)
          .filter(station => station.near),
      };
    }
    const matches = state.nodes.filter(node => node.waypointId === current.location);
    if (matches.length !== 1) fail('AUTHORING_UNSUPPORTED_TRANSITION', `Unknown or ambiguous location ${current.location}`);
    return matches[0];
  };
  const shelfFor = (stationId: string | null) => catalog.shelves.find(shelf => shelf.stationId === stationId);
  const productOnShelf = (productId: string, stationId: string | null) => shelfFor(stationId)?.pages
    .some(page => page.choiceIds.includes(`add/${productId}`)) ?? false;
  const resolveEntry = (choiceId: string) => {
    const direct = entries.get(choiceId);
    if (direct) return direct;
    // Preserve a declared alias verbatim. Only its already-contractual canonical
    // entry is used to check the menu/transition; no new alias or fuzzy repair exists.
    const aliases = catalog.referenceAliases?.filter(alias => alias.aliasChoiceId === choiceId) ?? [];
    if (aliases.length !== 1 || aliases[0].kind !== 'checkout-open-v1')
      return fail('AUTHORING_CHOICE_NOT_AVAILABLE', `Unknown saved catalog choice ${choiceId}`);
    const entry = entries.get(aliases[0].canonicalChoiceId);
    const checkoutId = entry?.action.type === 'checkout' ? entry.action.checkoutId : undefined;
    if (!entry || checkoutId === undefined || choiceId !== `open/${checkoutId}`
      || entry.choiceId !== `checkout/${checkoutId}`
      || checkouts.filter(checkout => checkout.id === checkoutId).length !== 1)
      return fail('AUTHORING_UNSUPPORTED_TRANSITION', `Ambiguous checkout alias ${choiceId}`);
    return entry;
  };
  const menuAt = (current: WholeTraceChoiceSource) => {
    if (continuous) {
      if (!executionFrame || awaitingExecution) return fail('AUTHORING_UNSUPPORTED_TRANSITION', 'Apply the validated prefix frame before requesting another menu');
      const kind: WholeTraceInteractionContext['kind'] = current.phase === 'checkout' ? 'checkout'
        : current.view !== 'world' ? current.view : current.activeStation ? shelfFor(current.activeStation) ? 'shelf' : 'staff' : 'world';
      return { choiceIds: executionFrame.availableChoices.map(entry => entry.choiceId), interactionContext: {
        kind, stationId: current.activeStation, label: kind === 'world' ? '매장 통로 화면'
          : `${stationLabels.get(current.activeStation ?? '') ?? current.activeStation ?? ''} ${kind} 화면`.trim() } };
    }
    const state = stateFor(current);
    const stationLabel = stationLabels.get(current.activeStation ?? '') ?? current.activeStation;
    const describe = (kind: WholeTraceInteractionContext['kind'], choiceIds: string[], label: string) => ({
      choiceIds, interactionContext: { kind, stationId: current.activeStation, label },
    });
    if (current.phase === 'checkout') {
      const panel = catalog.checkout.find(checkout => checkout.checkoutId === current.activeStation);
      if (!panel || current.view !== 'world' || current.pageIndex !== null)
        return fail('AUTHORING_UNSUPPORTED_TRANSITION', 'Unsupported checkout source');
      return describe('checkout', panel.choiceIds.filter(id => id !== 'control/submit'
        || state.cashierAvailability[current.activeStation as keyof typeof state.cashierAvailability]), `${stationLabel} 계산 화면`);
    }
    const common = catalog.common.shopping;
    if (current.view === 'help') return describe('help', [...common, ...catalog.common.help], '이용 방법 화면');
    if (current.view === 'cart') return describe('cart', [...common, ...catalog.common.cart,
      ...catalog.cartProductChoiceIds.filter(id => {
        const entry = entries.get(id);
        return entry?.action.type === 'remove' && expectedCart[entry.action.productId] > 0
          && productOnShelf(entry.action.productId, current.activeStation);
      })], `장바구니 화면${current.activeStation ? ` (매대 가려짐: ${stationLabel})` : ''}`);
    if (current.activeStation) {
      const shelf = shelfFor(current.activeStation);
      if (shelf) {
        const page = shelf.pages.find(page => page.pageIndex === current.pageIndex);
        if (!page) return fail('AUTHORING_UNSUPPORTED_TRANSITION', `Unknown shelf page ${current.activeStation}/${current.pageIndex}`);
        return describe('shelf', [...common, ...catalog.common.shelf, ...shelf.browseChoiceIds,
          ...page.choiceIds.filter(id => {
            const entry = entries.get(id);
            return entry?.action.type === 'add' && expectedStock[entry.action.productId] > 0;
          })], `매대 열림: ${stationLabel}`);
      }
      const staff = catalog.staff.find(staff => staff.stationId === current.activeStation);
      if (!staff) return fail('AUTHORING_UNSUPPORTED_TRANSITION', `Unknown active station ${current.activeStation}`);
      return describe('staff', [...common, ...catalog.common.staff, ...staff.choiceIds.filter(id => {
        const entry = entries.get(id);
        return entry?.action.type === 'requestCashier' && state.cashierAvailability[entry.action.checkoutId as keyof typeof state.cashierAvailability] === false;
      })], `${stationLabel} 직원 대화 열림`);
    }
    const states = catalog.navigation.filter(state => state.navigationStateId === current.navigationStateId);
    const locations = states.length === 1 ? states[0].locations.filter(location => location.location === current.location) : [];
    if (bundle.movementVersion === 'directional-v1' && wholeTraceDirectionalLocation(current.location)) {
      const node = nodeFor(current);
      return describe('world', [...common, ...catalog.common.world, ...(catalog.movementChoiceIds ?? []),
        ...node.allowedWaypointIds.map(id => `walk/${id}`),
        ...node.nearbyStations.flatMap(station => station.kind === 'checkout' ? [`checkout/${station.id}`]
          : station.kind === 'shelf' || station.kind === 'employee' ? [`open/${station.id}`] : [])], '매장 통로 화면');
    }
    if (locations.length !== 1) return fail('AUTHORING_UNSUPPORTED_TRANSITION', `Missing exact location menu ${current.navigationStateId}/${current.location}`);
    return describe('world', [...common, ...catalog.common.world, ...(catalog.movementChoiceIds ?? []), ...locations[0].choiceIds], '매장 통로 화면');
  };
  // Fail before accepting any draft when its initial navigation state is unusable.
  nodeFor(source); menuAt(source);

  const snapshot = (): WholeTraceExpectedSourceSnapshot => ({ kind: continuous ? 'validated-execution-source-v2' : 'symbolic-expected-source-v1',
    expectedSource: terminal ? null : structuredClone(source), decisionCount: decisions.length, terminal });
  const menu = (): WholeTraceSourceAuthoringMenu => {
    // Retain the existing menu order. No routes, goal matching or ranking enter this view.
    const { choiceIds, interactionContext } = terminal ? { choiceIds: [],
      interactionContext: { kind: 'terminal' as const, stationId: null, label: '작성 종료: 현재 선택지 없음' } } : menuAt(source);
    const allowed = terminal ? [] : nodeFor(source).allowedWaypointIds;
    const allowedWaypointIds = choiceIds.flatMap(id => {
      const action = entries.get(id)?.action;
      return action?.type === 'walk' && allowed.includes(action.waypointId) ? [action.waypointId] : [];
    });
    const visible = continuous ? (executionFrame?.availableChoices ?? []).flatMap(entry => {
      if (entry.action.type !== 'walk') return [];
      const anchor = executionObservation?.anchors.find(anchor => entry.cueRefs.includes(`anchor:${anchor.id}`));
      return anchor ? [{ choiceId: entry.choiceId, label: entry.label, direction: anchor.direction, distanceBand: anchor.distanceBand }] : [];
    }) : movementPosition && source.location === `D${movementPosition.decisionCount}`
      ? visibleAnchors(bundle.worldReference.world, movementPosition.position, bundle.worldReference.presentation, stateFor(source).cashierAvailability)
        .flatMap(anchor => bundle.worldReference.waypoints.filter(waypoint => waypoint.anchorId === anchor.id)
          .map(waypoint => ({ choiceId: `walk/${waypoint.waypointId}`, label: `${anchor.label}로 걷기`, direction: anchor.direction, distanceBand: anchor.distanceBand })))
      : catalog.navigation.find(state => state.navigationStateId === source.navigationStateId)
      ?.locations.find(location => location.location === source.location)?.visibleWalkChoices ?? [];
    const visibleWalkChoices = visible.filter(choice => choiceIds.includes(choice.choiceId)
      && allowedWaypointIds.includes(choice.choiceId.replace(/^walk\//, '')));
    return { ...snapshot(), authoringRevision: WHOLE_TRACE_SOURCE_AUTHORING_REVISION,
      presentationRevision: contextualWalkLabels ? WHOLE_TRACE_SOURCE_MENU_PRESENTATION_REVISION
        : LEGACY_SOURCE_MENU_PRESENTATION_REVISION, interactionContext,
      availableChoices: choiceIds.map(choiceId => {
        const entry = continuous ? executionFrame?.availableChoices.find(entry => entry.choiceId === choiceId) : entries.get(choiceId);
        const walk = contextualWalkLabels && entry?.action.type === 'walk'
          ? visibleWalkChoices.find(choice => choice.choiceId === choiceId) : undefined;
        return { choiceId, label: walk?.label ?? entry?.label ?? choiceId,
          ...(walk ? { direction: walk.direction, distanceBand: walk.distanceBand } : {}),
          ...(entry?.durationBounds ? { durationBounds: structuredClone(entry.durationBounds) } : {}),
          ...(entry?.recentVisit ? { recentVisit: structuredClone(entry.recentVisit) } : {}) };
      }),
      notice: '현재 선택 가능 여부는 이 메뉴의 choiceIds를 기준으로 확인한다. availableChoices는 같은 순서의 라벨이다.',
      choiceIds: [...choiceIds], allowedWaypointIds,
      visibleWalkChoices: structuredClone(visibleWalkChoices) };
  };
  const append = (draft: WholeTraceSourceDecisionDraft): WholeTraceTaskChoiceDecision => {
      if (terminal) return fail('AUTHORING_TERMINAL', 'The actor already selected a terminal action; no suffix is inserted or accepted');
      if (decisions.length >= actionBudget) return fail('AUTHORING_SCHEMA', 'The prepared technical action budget is exhausted; choose no extra action');
      if (!plain(draft) || !plain(draft.choiceRef)) return fail('AUTHORING_SCHEMA', 'A complete actor decision with choiceRef is required');
      if (Object.hasOwn(draft.choiceRef, 'source'))
        return fail('AUTHORING_SOURCE_SUPPLIED', 'cursor.append takes a source-free draft: choiceRef:{choiceId,quantity?}. Omit the source key entirely (not null or undefined). Direct candidates require source, but cursor drafts forbid it; an actor-supplied source is never overwritten');
      const decision = { ...draft, choiceRef: { ...draft.choiceRef, source: structuredClone(source) } };
      const syntax = validateWholeTraceChoiceDecisionSyntax(decision, '7', { movementVersion: bundle.movementVersion });
      if (!syntax.valid) {
        const issues = draftSyntaxIssues(draft);
        return fail('AUTHORING_SCHEMA', [...syntax.errors,
          ...issues.map(issue => `${issue.path}: ${issue.message}`)].join('; '), issues);
      }
      const stored = structuredClone(decision) as WholeTraceTaskChoiceDecision;
      const entry = resolveEntry(stored.choiceRef.choiceId), action = entry.action;
      if (!menuAt(source).choiceIds.includes(entry.choiceId))
        return fail('AUTHORING_CHOICE_NOT_AVAILABLE', `${stored.choiceRef.choiceId} is absent from the saved menu at ${source.location}/${source.view}/${source.activeStation ?? 'none'}/${source.pageIndex ?? 'none'}; no hop or control is inserted`);
      const parameterized = action.type === 'add' || action.type === 'remove';
      if (!parameterized && stored.choiceRef.quantity !== undefined)
        return fail('AUTHORING_SCHEMA', 'This choice does not accept quantity; the supplied value is not removed');
      const taskPreview = previewWholeTraceAuthoringTasks({ state: taskDeclarations, objectiveIds,
        decision: stored, actionType: action.type, phase: source.phase, goalMemoryCapacity });
      if (taskPreview.issues.length) return fail('AUTHORING_TASK_DECLARATION',
        taskPreview.issues.map(issue => `${issue.path}: ${issue.message}`).join('; '), taskPreview.issues);
      if (continuous) {
        const live = executionFrame!.availableChoices.find(choice => choice.choiceId === entry.choiceId)!;
        if (parameterized && (!live.quantityBounds || stored.choiceRef.quantity! > live.quantityBounds.max))
          return fail('AUTHORING_CHOICE_NOT_AVAILABLE', 'Chosen quantity exceeds the actual displayed bound');
        // No symbolic movement/panel prediction in v2. The execution cursor
        // installs the exact accepted result before any following selection.
        taskDeclarations = taskPreview.nextState;
        decisions.push(stored);
        terminal = action.type === 'submit' || action.type === 'giveUp';
        awaitingExecution = !terminal;
        return structuredClone(stored);
      }
      const next = structuredClone(source), nextCart = { ...expectedCart }, nextStock = { ...expectedStock };
      let nextHiddenShelfPage = hiddenShelfPage, nextTerminal = false;
      switch (action.type) {
        case 'moveDirection':
          if (bundle.movementVersion !== 'directional-v1') return fail('AUTHORING_UNSUPPORTED_TRANSITION', 'Direction movement requires its explicit bundle version');
          next.location = `D${decisions.length + 1}`;
          break;
        case 'walk':
          if (!nodeFor(source).allowedWaypointIds.includes(action.waypointId))
            return fail('AUTHORING_CHOICE_NOT_AVAILABLE', `No directed edge from ${source.location} to ${action.waypointId}; no route is inferred`);
          next.location = action.waypointId;
          nodeFor(next);
          break;
        case 'interact': {
          const nearby = nodeFor(source).nearbyStations.filter(station => station.id === action.station);
          const shelf = shelfFor(action.station), staff = catalog.staff.find(staff => staff.stationId === action.station);
          if (nearby.length !== 1 || !(nearby[0].kind === 'shelf' && shelf || nearby[0].kind === 'employee' && staff))
            return fail('AUTHORING_UNSUPPORTED_TRANSITION', `No unambiguous nearby shelf/staff station ${action.station}`);
          if (shelf && !shelf.pages.some(page => page.pageIndex === 0))
            return fail('AUTHORING_UNSUPPORTED_TRANSITION', `Shelf ${action.station} has no explicit first page`);
          next.activeStation = action.station; next.pageIndex = shelf ? 0 : null; nextHiddenShelfPage = null;
          break;
        }
        case 'browse': {
          const shelf = shelfFor(source.activeStation);
          if (!shelf?.browseChoiceIds.includes(entry.choiceId) || !shelf.pages.some(page => page.pageIndex === action.pageIndex))
            return fail('AUTHORING_UNSUPPORTED_TRANSITION', `No explicit page ${source.activeStation}/${action.pageIndex}`);
          next.pageIndex = action.pageIndex;
          break;
        }
        case 'viewCart':
          nextHiddenShelfPage = source.pageIndex; next.view = 'cart'; next.pageIndex = null;
          break;
        case 'viewHelp':
          nextHiddenShelfPage = null; next.view = 'help'; next.pageIndex = null;
          break;
        case 'closeView':
          next.view = 'world'; next.pageIndex = shelfFor(source.activeStation) ? hiddenShelfPage : null;
          if (shelfFor(source.activeStation) && next.pageIndex === null)
            return fail('AUTHORING_UNSUPPORTED_TRANSITION', 'The obscured shelf page is unknown; no page is guessed');
          nextHiddenShelfPage = null;
          break;
        case 'closeStation':
          next.phase = 'shopping'; next.view = 'world'; next.activeStation = null; next.pageIndex = null; nextHiddenShelfPage = null;
          break;
        case 'checkout': {
          const nearby = nodeFor(source).nearbyStations.filter(station => station.id === action.checkoutId && station.kind === 'checkout');
          const counters = checkouts.filter(checkout => checkout.id === action.checkoutId);
          if (nearby.length !== 1 || counters.length !== 1 || counters[0].kind === 'kiosk')
            return fail('AUTHORING_UNSUPPORTED_TRANSITION', `No supported nearby staffed-kind checkout ${action.checkoutId}`);
          next.phase = 'checkout'; next.view = 'world'; next.activeStation = action.checkoutId; next.pageIndex = null;
          break;
        }
        case 'requestCashier': {
          const state = stateFor(source), staffedCounters = checkouts.filter(checkout => checkout.kind !== 'kiosk');
          // The app recruits its first staffed-kind counter, while the existing
          // compiler tracks the requested id. Other cases cannot be predicted
          // consistently by this aid and must not be silently rewritten.
          if (staffedCounters[0]?.id !== action.checkoutId
            || staffedCounters.some(checkout => state.cashierAvailability[checkout.id]))
            return fail('AUTHORING_UNSUPPORTED_TRANSITION', 'Cashier request has differing app/compiler transitions; only an all-empty first staffed-kind checkout is supported by this drafting aid');
          const cashiers = { ...state.cashierAvailability, [action.checkoutId]: true };
          const matches = navigation.states.filter(state => canonicalMarketReplayJson(state.cashierAvailability) === canonicalMarketReplayJson(cashiers));
          if (matches.length !== 1) return fail('AUTHORING_UNSUPPORTED_TRANSITION', 'No unique saved navigation state for the chosen cashier request');
          next.navigationStateId = matches[0].stateId;
          break;
        }
        case 'add':
        case 'remove': {
          const quantity = stored.choiceRef.quantity;
          if (quantity === undefined) return fail('AUTHORING_SCHEMA', 'Choose quantity explicitly; no default quantity exists');
          const available = action.type === 'add' ? nextStock[action.productId] : nextCart[action.productId];
          if (!Number.isInteger(available) || quantity > available)
            return fail('AUTHORING_CHOICE_NOT_AVAILABLE', `Chosen quantity exceeds the symbolic ${action.type === 'add' ? 'advertised stock' : 'basket'}; quantity is not corrected`);
          const delta = action.type === 'add' ? quantity : -quantity;
          nextCart[action.productId] = (nextCart[action.productId] ?? 0) + delta;
          nextStock[action.productId] += -delta;
          break;
        }
        case 'submit':
        case 'giveUp': nextTerminal = true; break;
        case 'readList':
        case 'pause':
        case 'lookAround': break;
        default: return fail('AUTHORING_UNSUPPORTED_TRANSITION', 'The saved choice has an unsupported source transition');
      }
      // All checks precede commitment: an error leaves the cursor and caller data intact.
      source = next; expectedCart = nextCart; expectedStock = nextStock;
      hiddenShelfPage = nextHiddenShelfPage; terminal = nextTerminal;
      if (action.type === 'moveDirection' || action.type === 'walk') movementPosition = undefined;
      taskDeclarations = taskPreview.nextState;
      decisions.push(stored);
      return structuredClone(stored);
  };
  return {
    snapshot,
    menu,
    /** Trusted execution boundary, not a model-writable source or prediction. */
    acceptExecutionFrame(frame: WholeTraceChoiceFrame, observation: ActorObservation, acceptedActions: number): void {
      if (!continuous || terminal || acceptedActions !== decisions.length || !wholeTraceIsContinuousFrame(frame.source))
        return fail('AUTHORING_UNSUPPORTED_TRANSITION', 'Execution frame must match the accepted continuous prefix');
      executionFrame = structuredClone(frame); executionObservation = structuredClone(observation);
      source = structuredClone(frame.source); awaitingExecution = false;
    },
    acceptExecutionTerminal(acceptedActions: number): void {
      if (!continuous || acceptedActions !== decisions.length
        || !terminal && decisions.length !== 100)
        return fail('AUTHORING_UNSUPPORTED_TRANSITION', 'Execution termination requires the accepted actor ending or full horizon');
      terminal = true; awaitingExecution = false;
    },
    /** A future execution/prediction producer may supply a result here. Nothing
     * calls this automatically in phase one, and it never bypasses final guards. */
    acceptMovementPosition(result: WholeTraceMovementPosition): WholeTraceSourceAuthoringMenu {
      if (bundle.movementVersion !== 'directional-v1' || terminal || !result
        || !Number.isInteger(result.decisionCount) || result.decisionCount !== decisions.length
        || source.location !== `D${result.decisionCount}`
        || !Number.isFinite(result.position?.x) || !Number.isFinite(result.position?.y)
        || result.position.x < 0 || result.position.y < 0
        || result.position.x > bundle.worldReference.world.world.width || result.position.y > bundle.worldReference.world.world.height)
        return fail('AUTHORING_UNSUPPORTED_TRANSITION', 'A movement position must belong to the latest directional decision and lie within the world');
      movementPosition = structuredClone(result);
      return menu();
    },
    append(draft: WholeTraceSourceDecisionDraft): WholeTraceTaskChoiceDecision {
      try { return append(draft); }
      catch (error) {
        if (error instanceof WholeTraceSourceAuthoringError) {
          // Rejection remains rejection. The context exposes the unchanged source/menu
          // for diagnosis, never a replacement choice or a corrected decision.
          try {
            error.context = menu();
            if (error.code === 'AUTHORING_CHOICE_NOT_AVAILABLE')
              error.message += `; current interaction: ${error.context.interactionContext.label}`;
          }
          catch (contextError) {
            // A damaged saved menu must not replace the original rejection, nor
            // masquerade as a valid empty menu. snapshot() remains available.
            error.contextUnavailable = contextError instanceof Error ? contextError.message : 'Saved menu unavailable';
          }
        }
        throw error;
      }
    },
    finish(): WholeTraceTaskChoiceCandidate {
      const candidate: WholeTraceTaskChoiceCandidate = { candidateVersion: '7', requestId, decisions: structuredClone(decisions) };
      const syntax = validateWholeTraceCandidate(candidate, requestId, { objectiveIds, movementVersion: bundle.movementVersion });
      if (!syntax.valid) return fail('AUTHORING_SCHEMA', syntax.errors.join('; '));
      return candidate;
    },
  };
}
