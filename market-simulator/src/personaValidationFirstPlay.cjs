'use strict';
// Versioned observational measures. No authored reason, activity, memory or timing is evidence.
const { getMarketProduct } = require('../../frontend/src/game/scenarios.ts');
const KINDS = Object.freeze({ initialCaution: 'initialCautionCount', operationLearning: 'operationLearningRate',
  routeReliance: 'routeRelianceRate', textCueLoad: 'textCueLoadRate' });
const inspecting = event => ['lookAround', 'pause', 'readList', 'viewHelp'].includes(event.type);
const open = event => event.type === 'openShelf' || event.type === 'talkToStaff' && event.choice === 'open';
const add = event => event.type === 'dragProduct' && event.gesture?.outcome === 'drop';
const operation = event => open(event) ? 'open' : add(event) ? 'add'
  : ['browse', 'viewCart', 'checkout'].includes(event.type) ? event.type : null;
const unique = rows => [...new Set(rows.filter(Boolean))];
const ids = rows => [...new Set(unique(rows).flatMap(event => event.stepIds ?? []))];
const family = id => getMarketProduct(id)?.familyId ?? id;
const productText = product => typeof product?.name === 'string' && product.name.trim()
  ? JSON.stringify([product.name, product.detail ?? '']) : null;

/** Actual display must contain the selected goal product and another differently labelled family member. */
function textAlternatives(event, goal) {
  const products = event.before?.products;
  if (!Array.isArray(products)) return null;
  const selected = products.find(product => product.id === event.productId), text = productText(selected);
  if (!text) return null;
  return products.filter(product => product.id !== selected.id && family(product.id) === goal.familyId
    && productText(product) !== null && productText(product) !== text);
}

/** Read the saved legal menu, intersected with the passages actually visible before the walk.
 * An observation's anchors alone are not the whole-trace legal menu. Never infer alternatives
 * from coordinate proximity, the actor's reason or an unbound global navigation graph. */
function observedWalkChoices(event, bundle) {
  const source = event.choiceResolution?.source;
  const navigation = bundle?.choiceCatalog?.navigation;
  const waypoints = bundle?.worldReference?.waypoints;
  if (!source || !Array.isArray(navigation) || !Array.isArray(waypoints) || !Array.isArray(event.before?.anchors)) return null;
  if (typeof event.before.phase !== 'string' || typeof event.before.view !== 'string'
    || !Object.hasOwn(event.before, 'activeStation')) return null;
  if (event.before.phase !== 'shopping' || event.before.view !== 'world' || event.before.activeStation !== null) return [];
  const menu = navigation.find(state => state.navigationStateId === source.navigationStateId)?.locations
    ?.find(location => location.location === source.location);
  if (!Array.isArray(menu?.choiceIds)) return null;
  const visible = new Set(event.before.anchors.map(anchor => anchor.id));
  return waypoints.filter(waypoint => visible.has(waypoint.anchorId)
    && menu.choiceIds.includes(`walk/${waypoint.waypointId}`)).map(waypoint => waypoint.anchorId);
}

function extractFirstPlay({ trace, events, goals, reservedEvents = [], declaredOnlyOverlapEvents = [], evidence = {}, isGoalProduct }) {
  const metrics = {}, reserved = new Set(reservedEvents), unresolved = new Set(declaredOnlyOverlapEvents), claimed = new Set();
  const isFirstPlay = trace.experienceMode !== 'revisit';
  const accepted = event => (event.after ?? events[event.index + 1]?.before)?.result?.accepted !== false;
  const available = event => !reserved.has(event) && !claimed.has(event) && accepted(event);
  function put(kind, numerator, denominator, opportunities, manifestations, reason, extras = {}) {
    const rows = unique([...opportunities, ...manifestations]);
    metrics[kind] = { status: denominator > 0 ? 'measured' : 'unexercised', numerator, denominator,
      value: denominator > 0 ? numerator / denominator : null, evidence: ids(rows),
      decisionIndexes: rows.map(event => event.decisionIndex).filter(Number.isInteger),
      evidenceType: 'observed-action', ...(denominator ? {} : { reason }),
      opportunityEvidence: ids(opportunities), manifestationEvidence: ids(manifestations), ...extras };
    manifestations.forEach(event => claimed.add(event));
  }
  if (!isFirstPlay) {
    for (const kind of Object.values(KINDS)) put(kind, 0, 0, [], [], 'not-first-play');
    return metrics;
  }

  // Initial observation owns the opening segment; it cannot simultaneously demonstrate learning a control.
  const first = events.findIndex(event => open(event) || add(event));
  const beginning = first < 0 ? events : events.slice(0, first);
  const initialCandidates = beginning.filter(inspecting), initialConflicts = initialCandidates.filter(event => unresolved.has(event));
  const initial = initialConflicts.length ? [] : initialCandidates.filter(available);
  put(KINDS.initialCaution, initial.length, events.length && !initialConflicts.length ? 1 : 0,
    events.length ? [events[first < 0 ? events.length - 1 : first]] : [], initial,
    initialConflicts.length ? 'declared-only-overlap-unresolvable' : 'no-observed-actor-actions', {
      excludedOverlapEvidence: ids(initialCandidates.filter(event => reserved.has(event))),
      excludedOpportunityEvidence: initialConflicts.length ? ids(beginning) : [],
      ...(initialConflicts.length ? { exclusionReason: 'declared-only-overlap-unresolvable' } : {}),
      windowEvidence: ids(beginning), interpretation: 'Number of selected inspection actions before the first open/add; authored duration is ignored.' });

  // A display check can express text-cue response without assigning an error or inferring confusion.
  // Legacy comparison owns its browses. A remaining concrete lookAround/readList/viewCart is a check;
  // an actorState compare/check label or a pause alone is never proof of reading text.
  const textOpportunities = [], textResponses = [], textExcluded = [], textExcludedOpportunities = [], textDetails = [];
  let missingText = 0;
  for (const selection of events.filter(add)) {
    if (selection.interest) continue;
    const goal = goals.find(goal => isGoalProduct(selection.productId, goal));
    if (!goal) continue;
    const alternatives = textAlternatives(selection, goal);
    if (alternatives === null) { missingText++; continue; }
    if (!alternatives.length) continue;
    const previous = events[selection.index - 1];
    const check = previous && ['browse', 'lookAround', 'readList', 'viewCart'].includes(previous.type)
      // Confirmation must itself concern an observed simultaneous display, not another location or page.
      && Array.isArray(previous.before?.products)
      && previous.before.products.some(product => product.id === selection.productId)
      && previous.before.products.some(product => alternatives.some(alternative => alternative.id === product.id)) ? previous : null;
    if (check && unresolved.has(check)) { textExcludedOpportunities.push(selection); textExcluded.push(check); continue; }
    textOpportunities.push(selection);
    if (check && available(check)) textResponses.push(check);
    else if (check && (reserved.has(check) || claimed.has(check))) textExcluded.push(check);
    textDetails.push({ stepId: selection.id, productIds: [selection.productId, ...alternatives.map(product => product.id)] });
  }
  put(KINDS.textCueLoad, textResponses.length, textOpportunities.length, textOpportunities, textResponses,
    textExcludedOpportunities.length ? 'declared-only-overlap-unresolvable'
      : missingText ? 'missing-observed-product-labels-or-display' : 'no-simultaneous-similar-goal-products', {
      missingObservationCount: missingText, missingEvidenceReasons: missingText ? ['missing-observed-product-labels-or-display'] : [],
      excludedOverlapEvidence: ids(textExcluded), displays: textDetails,
      excludedOpportunityEvidence: ids(textExcludedOpportunities),
      ...(textExcludedOpportunities.length ? { exclusionReason: 'declared-only-overlap-unresolvable' } : {}),
      interpretation: 'Observed response to simultaneously displayed similar text; no label-confusion error or authored activity is counted.' });

  const used = new Set(), firstUses = [], preparations = [], operationExcluded = [], operationDetails = [], operationExcludedOpportunities = [];
  for (const event of events) {
    const kind = operation(event);
    if (!kind || used.has(kind)) continue;
    used.add(kind);
    const candidates = events.slice(Math.max(0, event.index - 2), event.index).filter(inspecting);
    if (candidates.some(candidate => unresolved.has(candidate))) {
      operationExcludedOpportunities.push(event);
      operationExcluded.push(...candidates.filter(candidate => unresolved.has(candidate)));
      operationDetails.push({ operation: kind, firstUseStepId: event.id, preparationStepId: null, excluded: 'declared-only-overlap-unresolvable' });
      continue;
    }
    firstUses.push(event);
    const preparation = candidates.findLast(available);
    if (preparation) { preparations.push(preparation); claimed.add(preparation); }
    operationExcluded.push(...candidates.filter(candidate => reserved.has(candidate) || claimed.has(candidate) && candidate !== preparation));
    operationDetails.push({ operation: kind, firstUseStepId: event.id, preparationStepId: preparation?.id ?? null });
  }
  put(KINDS.operationLearning, preparations.length, firstUses.length, firstUses, preparations,
    operationExcludedOpportunities.length ? 'declared-only-overlap-unresolvable' : 'no-first-use-operation', {
      excludedOverlapEvidence: ids(operationExcluded), firstUses: operationDetails,
      excludedOpportunityEvidence: ids(operationExcludedOpportunities),
      ...(operationExcludedOpportunities.length ? { exclusionReason: 'declared-only-overlap-unresolvable' } : {}),
      interpretation: 'Inspection in the preceding one or two actor choices of each first-used control; does not measure failed dragging or later improvement.' });

  const visited = new Map(), unknownVisits = new Set(), routeOpportunities = [], routeResponses = [], routeExcluded = [], routeVisits = [], choices = [];
  const routeDeclaredExclusions = [], routeUnknownExclusions = [];
  let missingChoices = 0, missingArrivals = 0;
  for (const event of events) {
    if (event.type !== 'walkToAnchor') continue;
    const target = event.action?.anchorId ?? event.target?.anchorId;
    if (!target) { missingChoices++; continue; }
    const menu = observedWalkChoices(event, evidence.bundle);
    if (menu === null) missingChoices++;
    else if (menu.includes(target)) {
      const knownOld = menu.filter(id => visited.has(id)), knownNew = menu.filter(id => !visited.has(id) && !unknownVisits.has(id));
      const unknown = menu.filter(id => unknownVisits.has(id));
      if (unknownVisits.has(target) || knownOld.length && !knownNew.length && unknown.length) {
        routeUnknownExclusions.push(event);
      } else if (knownOld.length && knownNew.length) {
        if (unresolved.has(event)) {
          routeDeclaredExclusions.push(event); routeExcluded.push(event);
        } else {
          routeOpportunities.push(event);
          if (visited.has(target)) {
            if (available(event)) routeResponses.push(event); else routeExcluded.push(event);
          }
          routeVisits.push(...knownOld.map(id => visited.get(id)));
          choices.push({ stepId: event.id, selectedAnchorId: target, availableAnchorIds: menu,
            visitedAvailableAnchorIds: knownOld, unvisitedAvailableAnchorIds: knownNew, unknownVisitAnchorIds: unknown,
            priorVisitEvidence: ids(knownOld.map(id => visited.get(id))) });
        }
      }
    }
    // The matched replay action and its recorded outcome, never a claimed memory, establish a visit.
    const result = (event.after ?? events[event.index + 1]?.before)?.result;
    if (result?.accepted === true && (!result.actionType || result.actionType === 'walkToAnchor')
      && (!result.anchorId || result.anchorId === target)) { visited.set(target, event); unknownVisits.delete(target); }
    else if (result?.accepted !== false) {
      missingArrivals++;
      if (!visited.has(target)) unknownVisits.add(target);
    }
  }
  put(KINDS.routeReliance, routeResponses.length, routeOpportunities.length, [...routeOpportunities, ...routeVisits], routeResponses,
    routeDeclaredExclusions.length ? 'declared-only-overlap-unresolvable'
      : missingChoices ? 'missing-saved-navigation-menu-or-choice-source' : missingArrivals ? 'missing-recorded-walk-arrival' : 'no-visited-and-unvisited-walk-options', {
      missingObservationCount: missingChoices, missingArrivalCount: missingArrivals, choices, excludedOverlapEvidence: ids(routeExcluded),
      missingEvidenceReasons: [...(missingChoices ? ['missing-saved-navigation-menu-or-choice-source'] : []),
        ...(missingArrivals ? ['missing-recorded-walk-arrival'] : [])],
      excludedOpportunityEvidence: ids([...routeDeclaredExclusions, ...routeUnknownExclusions]),
      ...(routeDeclaredExclusions.length ? { exclusionReason: 'declared-only-overlap-unresolvable' } : {}),
      unknownVisitExclusionEvidence: ids(routeUnknownExclusions), unknownVisitAnchorIds: [...unknownVisits],
      interpretation: 'A previously reached passage chosen when a legal visible unvisited alternative also exists; no shortest-path inference.' });
  // Stable catalog order makes JSON diffs and coverage tables easy to compare.
  return Object.fromEntries(Object.values(KINDS).map(kind => [kind, metrics[kind]]));
}
module.exports = { KINDS, extractFirstPlay, observedWalkChoices, textAlternatives };
