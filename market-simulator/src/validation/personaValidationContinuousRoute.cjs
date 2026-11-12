'use strict';
// Versioned, observational route evidence. No geometry, future endpoint, cell
// snapping, declared memory or inferred destination is used to score a choice.
const VERSION = 'continuous-route-v1';
const MOVEMENT_TYPES = new Set(['walkToAnchor', 'moveDirection']);
const OUTCOMES = new Set(['moved', 'partially-blocked', 'blocked']);
const ids = rows => [...new Set(rows.flatMap(event => event.stepIds ?? []))];
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const shape = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
const text = value => typeof value === 'string' && value.length > 0;
const frame = value => shape(value, ['location', 'navigationStateId']) && text(value.location) && text(value.navigationStateId);
const sameFrame = (a, b) => a?.location === b?.location && a?.navigationStateId === b?.navigationStateId;
const positionId = value => typeof value === 'string' && /^P[a-f0-9]{64}$/.test(value);

/** A missing link could hide an earlier visit. Reject the route history as a
 * whole rather than treating that unknown visit as a new passage or a zero. */
function validateHistory(events, bundle) {
  const failures = [], offered = new Set();
  const catalog = new Map((bundle?.worldReference?.waypoints ?? []).map(row => [row.anchorId, `walk/${row.waypointId}`]));
  const entries = bundle?.choiceCatalog?.entries;
  if (!Array.isArray(entries)) return [{ code: 'missing-anchor-choice-catalog' }];
  const catalogChoices = new Set(entries.filter(entry => entry.action?.type === 'walk'
    && entry.choiceId === `walk/${entry.action.waypointId}`).map(entry => entry.choiceId));
  const continuous = bundle?.movementVersion === 'directional-v2';
  let previous;
  for (const event of events) {
    const value = event.navigationEvidence;
    const reject = code => failures.push({ stepId: event.id, decisionIndex: event.decisionIndex, code });
    if (!value) { reject('missing-navigation-evidence'); previous = null; continue; }
    if (!shape(value, ['version', 'decisionIndex', 'from', 'to', 'fromPositionId', 'toPositionId', 'allowedAnchors', 'movement'])
      || value.version !== VERSION || !Number.isInteger(value.decisionIndex) || value.decisionIndex !== event.decisionIndex
      || !frame(value.from) || !frame(value.to) || !positionId(value.fromPositionId) || !positionId(value.toPositionId)
      || !Array.isArray(value.allowedAnchors)) { reject('invalid-navigation-evidence-shape'); previous = null; continue; }
    const source = event.choiceResolution?.source;
    if (!sameFrame(value.from, source) || source.phase !== event.before?.phase
      || source.view !== event.before?.view || source.activeStation !== event.before?.activeStation)
      reject('navigation-source-mismatch');
    if (continuous && (value.fromPositionId !== value.from.location || value.toPositionId !== value.to.location))
      reject('continuous-position-identity-mismatch');
    if (previous && (!sameFrame(previous.to, value.from) || previous.toPositionId !== value.fromPositionId))
      reject('discontinuous-navigation-history');
    previous = value;
    const legal = new Map(), choices = new Set();
    const visible = new Set((event.before?.anchors ?? []).map(anchor => anchor.id));
    const world = event.before?.phase === 'shopping' && event.before?.view === 'world' && event.before?.activeStation === null;
    let expected = [];
    if (!Array.isArray(event.before?.anchors)) reject('missing-observed-anchor-menu');
    if (world) {
      const menu = continuous ? null : bundle?.choiceCatalog?.navigation
        ?.find(state => state.navigationStateId === value.from.navigationStateId)?.locations
        ?.find(location => location.location === value.from.location);
      if (!continuous && !Array.isArray(menu?.choiceIds)) reject('missing-static-navigation-menu');
      expected = [...catalog].filter(([id, choiceId]) => visible.has(id) && catalogChoices.has(choiceId)
        && (continuous || menu?.choiceIds.includes(choiceId))).map(([id]) => id);
    }
    for (const anchor of value.allowedAnchors) {
      if (!shape(anchor, ['choiceId', 'anchorId']) || !text(anchor.choiceId) || !text(anchor.anchorId)
        || !anchor.choiceId.startsWith('walk/') || legal.has(anchor.anchorId) || choices.has(anchor.choiceId)
        || !visible.has(anchor.anchorId) || catalog.get(anchor.anchorId) !== anchor.choiceId || !catalogChoices.has(anchor.choiceId)) {
        reject('invalid-current-anchor-menu'); continue;
      }
      legal.set(anchor.anchorId, anchor.choiceId); choices.add(anchor.choiceId); offered.add(anchor.anchorId);
    }
    if (legal.size !== expected.length || expected.some(id => !legal.has(id))) reject('incomplete-or-expanded-current-anchor-menu');
    if (!MOVEMENT_TYPES.has(event.type)) {
      if (value.movement !== null) reject('movement-action-mismatch');
      continue;
    }
    const result = value.movement;
    if (!shape(result, ['actionType', 'accepted', 'outcome', 'targetAnchorId', 'arrivedAnchorIds'])
      || result.actionType !== event.type || result.accepted !== true || !OUTCOMES.has(result.outcome)
      || !Array.isArray(result.arrivedAnchorIds) || result.arrivedAnchorIds.some(id => !text(id) || !offered.has(id))
      || new Set(result.arrivedAnchorIds).size !== result.arrivedAnchorIds.length) {
      reject('invalid-recorded-movement'); continue;
    }
    if (event.before?.phase !== 'shopping' || event.before?.view !== 'world' || event.before?.activeStation !== null)
      reject('movement-outside-world-view');
    const observed = event.after?.result;
    if (observed && (Object.hasOwn(observed, 'accepted') && observed.accepted !== result.accepted
      || Object.hasOwn(observed, 'actionType') && observed.actionType !== result.actionType
      || observed.movement && Object.hasOwn(observed.movement, 'outcome') && observed.movement.outcome !== result.outcome
      || Object.hasOwn(observed, 'anchorId') && observed.anchorId !== result.targetAnchorId))
      reject('recorded-movement-result-mismatch');
    if (event.type === 'walkToAnchor') {
      const target = event.action?.anchorId ?? event.target?.anchorId;
      const chosen = event.choiceResolution?.resolvedChoiceRef?.choiceId ?? event.choiceResolution?.choiceRef?.choiceId;
      if (!target || result.targetAnchorId !== target || !legal.has(target) || chosen !== legal.get(target))
        reject('selected-anchor-mismatch');
    } else if (Object.hasOwn(result, 'targetAnchorId')) reject('directional-destination-must-not-be-inferred');
  }
  return failures;
}

function extractContinuousRoute({ events, bundle, available, unresolved }) {
  const opportunities = [], manifestations = [], visits = [], choices = [], overlaps = [], declaredExclusions = [];
  const directional = events.filter(event => event.type === 'moveDirection');
  const directionalDiagnostics = { decisionCount: directional.length, atMixedAnchorMenuCount: 0, returnEndpointCount: 0,
    blockedCount: 0, partiallyBlockedCount: 0, confirmedAnchorArrivalCount: 0, excludedEvidence: ids(directional) };
  const failures = validateHistory(events, bundle);
  const extras = { routeOpportunityVersion: VERSION, choices, directionalDiagnostics,
    excludedOverlapEvidence: [], excludedOpportunityEvidence: [], unknownVisitExclusionEvidence: [], unknownVisitAnchorIds: [],
    missingObservationCount: failures.length, missingArrivalCount: 0, missingEvidenceReasons: [],
    interpretation: 'Only an offered anchor has a destination at choice time. Directional actions are excluded from the scored ratio; their verified arrivals can establish later anchor visits. Exact endpoint returns are descriptive, not route familiarity.' };
  if (failures.length) {
    for (const key of ['atMixedAnchorMenuCount', 'returnEndpointCount', 'blockedCount',
      'partiallyBlockedCount', 'confirmedAnchorArrivalCount']) directionalDiagnostics[key] = null;
    extras.navigationEvidenceFailures = failures;
    extras.missingEvidenceReasons = [...new Set(failures.map(row => row.code))];
    return { numerator: 0, denominator: 0, opportunities, manifestations,
      reason: failures.some(row => row.code === 'missing-navigation-evidence')
        ? 'missing-continuous-navigation-evidence' : 'invalid-continuous-navigation-evidence', extras };
  }
  const visited = new Map(), endpoints = new Set();
  for (const event of events) {
    const evidence = event.navigationEvidence;
    endpoints.add(evidence.fromPositionId);
    const result = evidence.movement;
    if (result) {
      const menu = evidence.allowedAnchors.map(anchor => anchor.anchorId);
      const old = menu.filter(id => visited.has(id)), fresh = menu.filter(id => !visited.has(id));
      const mixed = old.length > 0 && fresh.length > 0;
      if (event.type === 'moveDirection') {
        if (mixed) directionalDiagnostics.atMixedAnchorMenuCount++;
        if (result.outcome === 'blocked') directionalDiagnostics.blockedCount++;
        if (result.outcome === 'partially-blocked') directionalDiagnostics.partiallyBlockedCount++;
        if (result.outcome !== 'blocked' && evidence.toPositionId !== evidence.fromPositionId
          && endpoints.has(evidence.toPositionId)) directionalDiagnostics.returnEndpointCount++;
        directionalDiagnostics.confirmedAnchorArrivalCount += result.arrivedAnchorIds.length;
      } else if (mixed) {
        if (unresolved.has(event)) { declaredExclusions.push(event); overlaps.push(event); }
        else {
          opportunities.push(event);
          const target = result.targetAnchorId;
          if (visited.has(target)) {
            if (available(event)) manifestations.push(event); else overlaps.push(event);
          }
          const prior = old.map(id => visited.get(id));
          visits.push(...prior);
          choices.push({ stepId: event.id, selectedAnchorId: target, availableAnchorIds: menu,
            visitedAvailableAnchorIds: old, unvisitedAvailableAnchorIds: fresh, unknownVisitAnchorIds: [],
            priorVisitEvidence: ids(prior) });
        }
      }
      for (const anchorId of result.arrivedAnchorIds) visited.set(anchorId, event);
    }
    endpoints.add(evidence.toPositionId);
  }
  extras.excludedOverlapEvidence = ids(overlaps);
  extras.excludedOpportunityEvidence = ids(declaredExclusions);
  if (declaredExclusions.length) extras.exclusionReason = 'declared-only-overlap-unresolvable';
  return { numerator: manifestations.length, denominator: opportunities.length,
    opportunities: [...opportunities, ...visits], manifestations,
    reason: declaredExclusions.length ? 'declared-only-overlap-unresolvable'
      : directional.length ? 'directional-destination-not-offered' : 'no-visited-and-unvisited-walk-options', extras };
}

module.exports = { VERSION, validateHistory, extractContinuousRoute };
