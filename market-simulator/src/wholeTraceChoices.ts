import { canonicalMarketReplayJson } from '../../frontend/src/game/marketReplayTrace';
import { actorChoices } from './actorChoices';
import { visibleAnchors } from '../../frontend/src/game/marketReplayPerception';
import type { ActorObservation, PolicyAction } from './types';
import type { WholeTraceAction, WholeTraceBundle, WholeTraceChoiceDecision, WholeTraceChoiceSource, WholeTraceDecision } from './wholeTraceContracts';
import { wholeTraceControlCueRefs, type WholeTraceKnowledgeSnapshot } from './wholeTraceKnowledge';

export type WholeTraceChoiceAction = Exclude<WholeTraceAction, { type: 'add' | 'remove' }> | { type: 'add' | 'remove'; productId: string };
export type WholeTraceChoiceEntry = {
  choiceId: string; label: string; action: WholeTraceChoiceAction; cueRefs: string[];
  quantityBounds?: { min: 1; max: number; instruction: string };
};
/** Shared entries and panel templates, never a location × panel × quantity Cartesian product. */
export type WholeTraceChoiceCatalog = {
  schemaVersion: 'state-choices-v1'; entries: WholeTraceChoiceEntry[];
  common: { world: string[]; shopping: string[]; cart: string[]; help: string[]; shelf: string[]; staff: string[]; checkout: string[] };
  navigation: { navigationStateId: string; locations: { location: string; choiceIds: string[]; visibleWalkChoices: { choiceId: string; label: string; direction: string; distanceBand: string }[] }[] }[];
  shelves: { stationId: string; pages: { pageIndex: number; choiceIds: string[] }[]; browseChoiceIds: string[] }[];
  staff: { stationId: string; choiceIds: string[] }[];
  checkout: { checkoutId: string; choiceIds: string[] }[];
  cartProductChoiceIds: string[];
  instruction: string;
};
export type WholeTraceAcceptedFrame = { location: string; navigationStateId: string };
export type WholeTraceChoiceFrame = { source: WholeTraceChoiceSource; availableChoices: WholeTraceChoiceEntry[] };
type ChoiceWorld = WholeTraceBundle['worldReference'];
const controls: Partial<Record<WholeTraceAction['type'], string>> = {
  readList: '화면의 장보기 목록 읽기', viewCart: '장바구니 보기', viewHelp: '이용 방법 보기', closeView: '열린 화면 닫기',
  closeStation: '진열대 또는 대화 닫기', pause: '현재 자리에서 잠시 멈추기', lookAround: '현재 자리에서 주변 보기',
  giveUp: '이번 장보기 그만하기', submit: 'AI 수행 검토 요청하기',
};
export function wholeTraceChoiceId(action: WholeTraceChoiceAction, stationId?: string): string {
  if (action.type === 'walk') return `walk/${action.waypointId}`;
  if (action.type === 'interact') return `open/${action.station}`;
  if (action.type === 'checkout' || action.type === 'requestCashier') return `${action.type}/${action.checkoutId}`;
  if (action.type === 'add' || action.type === 'remove') return `${action.type}/${action.productId}`;
  if (action.type === 'browse') {
    if (!stationId) throw new Error('Browse choices require an exact shelf station');
    return `browse/${stationId}/${action.pageIndex}`;
  }
  return `control/${action.type}`;
}
function cueRefsFor(action: WholeTraceChoiceAction, world: ChoiceWorld, stationId?: string): string[] {
  let target: string[] = [];
  let type: PolicyAction['type'] = action.type as PolicyAction['type'];
  if (action.type === 'walk') {
    const targetWaypoint = world.waypoints.find(w => w.waypointId === action.waypointId);
    if (!targetWaypoint) throw new Error(`Unknown waypoint ${action.waypointId}`);
    type = 'walkToAnchor'; target = [`anchor:${targetWaypoint.anchorId}`];
  } else if (action.type === 'interact') target = [`station:${action.station}`];
  else if (action.type === 'checkout') target = [`station:${action.checkoutId}`];
  else if (action.type === 'requestCashier') target = [`cashier:${action.checkoutId}`];
  else if (action.type === 'add') target = [`product:${action.productId}`];
  else if (action.type === 'remove') target = [`cart:product:${action.productId}`];
  else if (action.type === 'browse') target = [`shelf-page:${stationId}`];
  else if (action.type === 'readList') target = ['list'];
  return [...target, ...wholeTraceControlCueRefs({ type } as PolicyAction)];
}
/** Construct a stable unranked vocabulary. No goal, persona, price preference or shortest path enters IDs/order. */
export function buildWholeTraceChoiceCatalog(world: ChoiceWorld): WholeTraceChoiceCatalog {
  const entries = new Map<string, WholeTraceChoiceEntry>();
  const put = (action: WholeTraceChoiceAction, label?: string, stationId?: string, maxQuantity?: number) => {
    const choiceId = wholeTraceChoiceId(action, stationId);
    if (!entries.has(choiceId)) entries.set(choiceId, { choiceId, label: label ?? controls[action.type] ?? action.type,
      action: structuredClone(action), cueRefs: cueRefsFor(action, world, stationId),
      ...(['add', 'remove'].includes(action.type) ? { quantityBounds: { min: 1 as const, max: Math.min(99, Math.max(0, maxQuantity ?? 99)),
        instruction: 'Choose quantity explicitly; live displayed stock/cart controls constrain it again. No default quantity is supplied.' } } : {}) });
    return choiceId;
  };
  const common = {
    world: ['readList', 'viewCart', 'viewHelp'].map(type => put({ type } as WholeTraceChoiceAction)),
    shopping: ['pause', 'lookAround', 'giveUp'].map(type => put({ type } as WholeTraceChoiceAction)),
    cart: [put({ type: 'closeView' })], help: [put({ type: 'closeView' })],
    shelf: [put({ type: 'closeStation' }), put({ type: 'viewCart' })], staff: [put({ type: 'closeStation' })],
    checkout: [put({ type: 'closeStation' }), put({ type: 'giveUp' }), put({ type: 'submit' })],
  };
  const staffIds = new Set<string>();
  const navigation = world.navigation.states.map(state => ({ navigationStateId: state.stateId,
    locations: [{ location: 'start', ...state.start }, ...state.nodes.map(node => ({ location: node.waypointId, ...node }))]
      .map(node => ({ location: node.location,
        visibleWalkChoices: visibleAnchors(world.world, node.location === 'start' ? world.navigation.startPoint
          : world.waypoints.find(waypoint => waypoint.waypointId === node.location)!.point, world.presentation, state.cashierAvailability)
          .flatMap(anchor => {
            const waypoint = world.waypoints.find(candidate => candidate.anchorId === anchor.id);
            return waypoint && node.allowedWaypointIds.includes(waypoint.waypointId)
              ? [{ choiceId: `walk/${waypoint.waypointId}`, label: `${anchor.label}로 걷기`, direction: anchor.direction, distanceBand: anchor.distanceBand }] : [];
          }), choiceIds: [
        ...node.allowedWaypointIds.map(waypointId => {
          const waypoint = world.waypoints.find(w => w.waypointId === waypointId)!;
          return put({ type: 'walk', waypointId }, `화면 통로 ${waypoint.waypointId}로 걷기`);
        }),
        ...node.nearbyStations.flatMap(station => {
          if (station.kind === 'checkout') return [put({ type: 'checkout', checkoutId: station.id }, `${station.label} 이용하기`)];
          if (station.kind !== 'shelf' && station.kind !== 'employee') return [];
          if (station.kind === 'employee') staffIds.add(station.id);
          return [put({ type: 'interact', station: station.id }, `${station.label} ${station.kind === 'employee' ? '말 걸기' : '살펴보기'}`)];
        }),
      ] })) }));
  const cartProductChoiceIds: string[] = [];
  const shelves = world.shelves.map(shelf => {
    const productById = new Map(shelf.products.map(product => [product.id, product]));
    for (const product of shelf.products) cartProductChoiceIds.push(put({ type: 'remove', productId: product.id }, `${product.name} 내려놓기`));
    return { stationId: shelf.stationId,
      pages: shelf.pages.map(page => ({ pageIndex: page.pageIndex, choiceIds: page.visibleProductIds.map(productId => {
        const product = productById.get(productId)!;
        return put({ type: 'add', productId }, `${product.name} 담기 (수량 직접 선택)`, undefined, product.stock);
      }) })),
      browseChoiceIds: shelf.pages.map(page => put({ type: 'browse', pageIndex: page.pageIndex }, `진열대 ${page.pageIndex}번 페이지 보기`, shelf.stationId)),
    };
  });
  const cashierChoices = world.world.checkouts.map(checkout => put({ type: 'requestCashier', checkoutId: checkout.id }, `${checkout.id} 직원 호출하기`));
  return { schemaVersion: 'state-choices-v1', entries: [...entries.values()], common, navigation, shelves,
    staff: [...staffIds].map(stationId => ({ stationId, choiceIds: cashierChoices })),
    checkout: world.world.checkouts.map(checkout => ({ checkoutId: checkout.id, choiceIds: common.checkout })),
    cartProductChoiceIds: [...new Set(cartProductChoiceIds)],
    instruction: 'Entries are controls, not a route or ranked recommendation. Every selection must include its exact pre-action source. Use the current navigation location menu plus matching panel/common controls. Shelf product entries apply only to their displayed page. Cart returns apply only where the existing UI offers that return button. Quantity is explicit, never automatically selected. World references remain unavailable actor knowledge until actually displayed.' };
}
function acceptedFrame(bundle: WholeTraceBundle, frame: WholeTraceAcceptedFrame | string): WholeTraceAcceptedFrame {
  if (typeof frame !== 'string') return frame;
  if (bundle.worldReference.navigation.states.length !== 1) throw new Error('Exact tracked navigationStateId is required when cashier states vary');
  return { location: frame, navigationStateId: bundle.worldReference.navigation.states[0].stateId };
}
function sourceFor(o: ActorObservation, bundle: WholeTraceBundle, tracked: WholeTraceAcceptedFrame | string): WholeTraceChoiceSource {
  const frame = acceptedFrame(bundle, tracked), state = bundle.worldReference.navigation.states.find(s => s.stateId === frame.navigationStateId);
  if (!state) throw new Error(`Unknown accepted navigation state ${frame.navigationStateId}`);
  if (frame.location !== 'start' && !state.nodes.some(node => node.waypointId === frame.location)) throw new Error(`Unknown accepted location ${frame.location}`);
  if (o.phase !== 'shopping' && o.phase !== 'checkout') throw new Error('No whole-trace actor choices are available after termination');
  for (const [id, available] of Object.entries(o.cashiers))
    if (state.cashierAvailability[id as keyof typeof state.cashierAvailability] !== available) throw new Error(`Tracked navigation state disagrees with observed cashier ${id}`);
  return { ...frame, phase: o.phase, view: o.view, activeStation: o.activeStation, pageIndex: o.shelf?.page ?? null };
}
function canonicalAction(a: PolicyAction, o: ActorObservation, bundle: WholeTraceBundle): WholeTraceAction | undefined {
  if (a.type === 'walkToAnchor') {
    const waypoint = bundle.worldReference.waypoints.find(w => w.anchorId === a.anchorId);
    return waypoint ? { type: 'walk', waypointId: waypoint.waypointId } : undefined;
  }
  if (a.type === 'browse') {
    const pageIndex = o.shelf?.pageFractions?.findIndex(fraction => fraction === a.scrollFraction);
    return pageIndex !== undefined && pageIndex >= 0 ? { type: 'browse', pageIndex } : undefined;
  }
  if (a.type === 'readList' || a.type === 'pause' || a.type === 'lookAround') return { type: a.type };
  if (a.type === 'add' || a.type === 'remove') return { type: a.type, productId: a.productId, quantity: a.quantity ?? 1 };
  if (a.type === 'checkout' || a.type === 'requestCashier') return { type: a.type, checkoutId: a.checkoutId ?? 'checkout' };
  if (['interact', 'viewCart', 'viewHelp', 'closeView', 'closeStation', 'submit', 'giveUp'].includes(a.type)) return structuredClone(a) as WholeTraceAction;
  return undefined;
}
function availableSelection(o: ActorObservation, bundle: WholeTraceBundle, source: WholeTraceChoiceSource) {
  const map = new Map<string, { entry: WholeTraceChoiceEntry; quantities: number[]; policies: PolicyAction[] }>();
  for (const choice of actorChoices(o)) {
    const action = canonicalAction(choice.action, o, bundle); if (!action) continue;
    const choiceId = wholeTraceChoiceId(action, o.activeStation ?? undefined);
    const entry = bundle.choiceCatalog.entries.find(e => e.choiceId === choiceId); if (!entry) continue;
    if (action.type === 'walk' || action.type === 'interact' || action.type === 'checkout') {
      const menu = bundle.choiceCatalog.navigation.find(state => state.navigationStateId === source.navigationStateId)?.locations.find(location => location.location === source.location);
      if (!menu?.choiceIds.includes(choiceId)) continue;
    }
    if (action.type === 'add' && !bundle.choiceCatalog.shelves.find(shelf => shelf.stationId === source.activeStation)?.pages
      .find(page => page.pageIndex === source.pageIndex)?.choiceIds.includes(choiceId)) continue;
    const item = map.get(choiceId) ?? { entry: { ...entry, ...(!['add', 'remove'].includes(action.type) ? { label: choice.label } : {}) }, quantities: [], policies: [] };
    item.policies.push(choice.action);
    if (action.type === 'add' || action.type === 'remove') item.quantities.push(action.quantity);
    map.set(choiceId, item);
  }
  return map;
}
/** Current frame for technical suffix feedback; no global goal answer or preferred choice is added. */
export function wholeTraceChoiceFrame(o: ActorObservation, bundle: WholeTraceBundle, tracked: WholeTraceAcceptedFrame | string): WholeTraceChoiceFrame {
  const source = sourceFor(o, bundle, tracked);
  return { source, availableChoices: [...availableSelection(o, bundle, source).values()].map(({ entry, quantities }) => ({ ...structuredClone(entry),
    ...(quantities.length ? { quantityBounds: { ...entry.quantityBounds!, max: Math.max(...quantities) } } : {}) })) };
}
/** Exact translation of a chosen menu entry, never another route, product, quantity, or shopping goal. */
export function resolveWholeTraceChoice(d: WholeTraceChoiceDecision, o: ActorObservation, bundle: WholeTraceBundle,
  tracked: WholeTraceAcceptedFrame | string, knowledge?: WholeTraceKnowledgeSnapshot): {
    decision: WholeTraceDecision; policyAction: PolicyAction; derivedCueRefs: string[]; source: WholeTraceChoiceSource;
  } {
  const source = sourceFor(o, bundle, tracked);
  if (canonicalMarketReplayJson(d.choiceRef.source) !== canonicalMarketReplayJson(source))
    throw Object.assign(new Error('Choice source differs from the actual accepted location, navigation state or displayed panel/page'), { code: 'CHOICE_SOURCE_MISMATCH' });
  const selected = availableSelection(o, bundle, source).get(d.choiceRef.choiceId);
  if (!selected) throw Object.assign(new Error(`Choice ${d.choiceRef.choiceId} is not available in this exact source`), { code: 'CHOICE_NOT_AVAILABLE' });
  const parameterized = selected.entry.action.type === 'add' || selected.entry.action.type === 'remove';
  if (parameterized && (d.choiceRef.quantity === undefined || !selected.quantities.includes(d.choiceRef.quantity)))
    throw Object.assign(new Error('A quantity must be explicitly chosen from the current displayed stock/cart bounds'), { code: 'CHOICE_QUANTITY' });
  if (!parameterized && d.choiceRef.quantity !== undefined) throw Object.assign(new Error('This choice does not accept a quantity'), { code: 'CHOICE_QUANTITY' });
  const policyAction = selected.policies.find(action => !parameterized || (action.type === 'add' || action.type === 'remove') && action.quantity === d.choiceRef.quantity)!;
  const action = canonicalAction(policyAction, o, bundle)!;
  const actualReadGoals = new Set(knowledge ? knowledge.cues.filter(cue => cue.kind === 'read-objective'
    && ['current-observation', 'observed-this-visit'].includes(cue.source)).map(cue => cue.cueRef)
    : (o.readObjectives ?? []).map(goal => `objective:${goal.id}`));
  const actualDisplayedProducts = new Set(knowledge ? knowledge.cues.filter(cue =>
    ['current-observation', 'observed-this-visit'].includes(cue.source)
      && (cue.kind === 'displayed-product' || cue.kind === 'displayed-cart-item'))
    .map(cue => cue.cueRef)
    : [...(o.products ?? []).map(product => `product:${product.id}`),
      ...Object.keys(o.cart ?? {}).map(productId => `cart:product:${productId}`)]);
  const focusedGoalRef = d.actorState.focusedGoalId ? `objective:${d.actorState.focusedGoalId}` : undefined;
  const focusedProductRef = d.actorState.focusedProductId ? `product:${d.actorState.focusedProductId}` : undefined;
  const focusedProductProof = focusedProductRef && (actualDisplayedProducts.has(focusedProductRef) ? focusedProductRef
    : actualDisplayedProducts.has(`cart:${focusedProductRef}`) ? `cart:${focusedProductRef}` : undefined);
  const derivedCueRefs = [...new Set([...cueRefsFor(action, bundle.worldReference, o.activeStation ?? undefined),
    ...[...d.actorState.heldGoalIds, ...d.actorState.uncertainGoalIds].map(goalId => `objective:${goalId}`),
    ...(focusedGoalRef && actualReadGoals.has(focusedGoalRef) ? [focusedGoalRef] : []),
    ...(focusedProductProof ? [focusedProductProof] : [])]
    .filter(ref => !ref.startsWith('objective:') || actualReadGoals.has(ref)))];
  return { policyAction: structuredClone(policyAction), derivedCueRefs, source,
    decision: { action, delayMs: d.delayMs, reason: d.reason,
      basis: { intent: d.basis.intent, cueRefs: [...new Set([...derivedCueRefs, ...(d.basis.cueRefs ?? [])])],
        ...(Object.hasOwn(d.basis, 'goalId') ? { goalId: d.basis.goalId } : {}),
        ...(d.basis.memoryUses === undefined ? {} : { memoryUses: structuredClone(d.basis.memoryUses) }) },
      actorState: { ...structuredClone(d.actorState), triggerCueRefs: [...new Set([...derivedCueRefs, ...(d.actorState.triggerCueRefs ?? [])])] } } };
}
