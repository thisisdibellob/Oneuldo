'use strict';
// Structural opportunities are possibilities, never observations or required actor mistakes.
const fs = require('node:fs');
const path = require('node:path');
const { getMarketProduct } = require('../../frontend/src/game/scenarios.ts');
const { getMarketNavigationPath } = require('../../frontend/src/game/marketNavigation.ts');
const { visibleStations, visibleShelfProductIds, replayShelfPageFractions, DEFAULT_REPLAY_PRESENTATION } = require('../../frontend/src/game/marketReplayPerception.ts');
const { validationGoals, isGoalProduct } = require('./personaValidationMetrics.cjs');

function routeStations(snapshot, categories) {
  const environment = snapshot.environment, presentation = snapshot.presentation ?? DEFAULT_REPLAY_PRESENTATION;
  if (!environment?.spawn || !environment?.stations || !environment.stationDetails) return null;
  const visible = new Set(), reachable = [];
  let from = environment.spawn;
  for (const id of categories) {
    const to = environment.stations[id];
    if (!to) continue;
    const route = getMarketNavigationPath(environment, from, to, snapshot.cashierAvailability);
    if (!route) continue;
    reachable.push(id);
    const points = [from, ...route];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 24));
      for (let j = 0; j <= count; j++) {
        const point = { x: a.x + (b.x - a.x) * j / count, y: a.y + (b.y - a.y) * j / count };
        for (const station of visibleStations(environment, point, presentation, snapshot.cashierAvailability)) visible.add(station.id);
      }
    }
    from = to;
  }
  return { reachableGoalCategories: reachable, visibleStationIds: [...visible].sort(), route: 'objective-order-reference-route' };
}
function auditSnapshot(snapshot, { condition, persona = {} } = {}) {
  const goals = validationGoals(snapshot), inventory = snapshot.config?.inventoryProductIds;
  const presentation = snapshot.presentation ?? DEFAULT_REPLAY_PRESENTATION;
  const ids = inventory ? [...new Set(Object.values(inventory).flat())] : null;
  const stock = id => snapshot.initialStock?.[id] ?? snapshot.config?.stockOverrides?.[id] ?? snapshot.config?.stockPerProduct ?? 0;
  const available = ids?.filter(id => stock(id) > 0) ?? [];
  const goalCategories = [...new Set(goals.map(goal => getMarketProduct(goal.productId)?.categoryId).filter(Boolean))];
  const route = routeStations(snapshot, goalCategories);
  const comparisonGoals = goals.map(goal => {
    const categoryId = getMarketProduct(goal.productId)?.categoryId, shelf = inventory?.[categoryId] ?? [];
    const family = getMarketProduct(goal.productId)?.familyId ?? goal.productId;
    const candidates = shelf.filter(id => stock(id) > 0 && (getMarketProduct(id)?.familyId ?? id) === family);
    const initialCandidates = visibleShelfProductIds(shelf, presentation, 0).filter(id => candidates.includes(id));
    return { goalId: goal.id, categoryId, candidateProductIds: candidates, initiallyVisibleCandidateIds: initialCandidates,
      pageCount: replayShelfPageFractions(shelf, presentation).length };
  });
  const curryIds = available.filter(id => getMarketProduct(id)?.familyId === 'curry' || /curry/.test(id));
  const productSelectors = Object.entries(persona.attention?.interestProductWeights ?? {}).filter(([, w]) => w > 0).map(([id]) => id);
  const categorySelectors = Object.entries(persona.attention?.interestCategoryWeights ?? {}).filter(([, w]) => w > 0).map(([id]) => id);
  const interestIds = available.filter(id => {
    const product = getMarketProduct(id);
    return !goals.some(goal => isGoalProduct(id, goal)) && (productSelectors.includes(id)
      || productSelectors.includes(product?.familyId) || categorySelectors.includes(product?.categoryId));
  });
  const interestCategories = [...new Set([...categorySelectors, ...productSelectors.map(id => getMarketProduct(id)?.categoryId)].filter(Boolean))];
  const nonGoalInterestCategories = interestCategories.filter(id => !goalCategories.includes(id) && (inventory?.[id]?.length ?? 0) > 0);
  const exactAlternatives = goals.flatMap(goal => goal.match !== 'exact' ? [] : available.filter(id => id !== goal.productId
    && (getMarketProduct(id)?.familyId ?? id) === goal.familyId).map(id => ({ goalId: goal.id, productId: id })));
  const quantityGoals = goals.filter(goal => goal.quantity > 1).map(goal => goal.id);
  const mismatchPossible = inventory ? exactAlternatives.length > 0 || quantityGoals.length > 0 || goals.some(goal => stock(goal.productId) > goal.quantity) : null;
  const hasShelf = inventory ? goalCategories.some(id => inventory[id]?.length > 0) : null;
  const measurable = inventory ? goals.some(goal => available.some(id => isGoalProduct(id, goal))) : null;
  const metrics = {};
  function put(kind, possible, reason, evidence = {}, requires = []) {
    metrics[kind] = { status: possible === null ? 'unknown' : possible ? 'possible' : 'impossible', possible,
      reason, evidence, requiresObservedExposure: true, requires };
  }
  put('postSelectionListRate', goals.length > 1 && measurable, '목표 선택 뒤 다른 목표로 전환할 수 있어야 한다.', { goalCount: goals.length }, ['goal-selection', 'next-goal-transition']);
  put('firstShelfOrientationCount', hasShelf, 'first-play에서 첫 목표 매대에 진입할 수 있다.', { goalCategories, experience: 'first-play' }, ['first-shelf-entry']);
  put('newShelfDelayMs', hasShelf, '처음 여는 매대와 배우가 작성한 행동 전 대기시간이 필요하다.', { goalCategories }, ['first-shelf-entry', 'authored-delay']);
  put('comparisonRate', inventory ? comparisonGoals.some(row => row.candidateProductIds.length >= 2 || row.pageCount > 1) : null,
    '관련 후보 둘 이상 또는 추가 페이지가 제공되는 목표 선택이 가능하다.', { goals: comparisonGoals }, ['candidate-observation', 'goal-selection']);
  put('curryDetourRate', inventory ? curryIds.length > 0 && !goalCategories.includes('meal') : null,
    'meal 비목표 조건에서 실제 카레 단서 노출 뒤의 관심 진입만 인정한다. 간편식 표지만으로 카레 노출을 인정하지 않는다.',
    { curryProductIds: curryIds, mealIsGoal: goalCategories.includes('meal'), mealSignOnReferenceRoute: route ? route.visibleStationIds.includes('meal') : null,
      initiallyVisibleCurryProductIds: visibleShelfProductIds(inventory?.meal ?? [], presentation, 0).filter(id => curryIds.includes(id)) },
    ['curry-product-observation-before-interest-entry', 'later-interest-entry']);
  put('interestDetourRate', !productSelectors.length && !categorySelectors.length ? false : inventory ? interestIds.length > 0 || nonGoalInterestCategories.length > 0 : null,
    '프로필의 비목표 관심 단서가 실제로 먼저 노출되어야 한다.', { productOrFamilySelectors: productSelectors, categorySelectors,
      interestProductIds: interestIds, nonGoalInterestCategories, interestSignsOnReferenceRoute: route ? route.visibleStationIds.filter(id => nonGoalInterestCategories.includes(id)) : null },
    ['non-goal-interest-cue', 'later-interest-action']);
  put('interestRecoveryRate', goals.length > 0 && (inventory ? interestIds.length > 0 || curryIds.length > 0 : null),
    '관심 구간과 남은 목표가 함께 있어야 한다.', { goalCount: goals.length }, ['interest-episode', 'unfinished-goal']);
  put('interestRunLength', inventory ? ids.length > 0 : null, '배우가 실제 관심 구간을 선택해야 한다.', {}, ['interest-episode']);
  put('correctionRate', measurable, '수량·규격 불일치나 조작 피드백을 확인하고 수정할 수 있다. 실수를 요구하지 않는다.', { quantityGoals, exactAlternatives, mismatchPossible, interactionFeedbackPossible: measurable }, ['observed-feedback-or-mismatch']);
  put('persistenceResponseRate', measurable, '오류·불일치 또는 선언된 불확실성 뒤 대응이 가능하다. 어려움 발생은 보장하지 않는다.', { quantityGoals, exactAlternatives, mismatchPossible, declaredUncertaintyPossible: measurable }, ['observed-difficulty-or-declared-uncertainty']);
  put('helpSeekingRate', measurable, '어려움 뒤 공통 도움 화면을 열 수 있다. 일반 계산 요청은 제외한다.', { helpScreenAvailable: true,
    staffCount: snapshot.environment?.employees?.length ?? null }, ['observed-difficulty-or-declared-uncertainty', 'help-action']);
  put('independentSelectionRate', measurable, '상품 선택에 도달해야 한다.', {}, ['product-selection']);
  put('familiarSelectionDelayMs', inventory ? (persona.character?.familiarProductIds ?? []).some(id => available.includes(id)) : null,
    '익숙한 상품을 실제 선택하고 대기시간을 작성해야 한다.', { familiarProductIds: (persona.character?.familiarProductIds ?? []).filter(id => available.includes(id)) }, ['familiar-product-selection', 'authored-delay']);
  put('highLoadMismatchRate', measurable, '시도한 목표의 실제 수량·규격 일치 여부를 관찰한다. 불일치는 강제하지 않는다.', { quantityGoals, exactAlternatives }, ['goal-attempt']);
  put('preCheckoutCartRate', measurable, '계산 단계에 도달해야 한다.', { checkoutCount: snapshot.environment?.checkouts?.length ?? null }, ['actor-checkout']);
  return { version: 1, scope: 'static-structural-possibility', snapshotId: snapshot.snapshotId ?? null, condition: condition ?? null,
    seedInvariant: !!inventory && !!snapshot.environment, route, metrics,
    limitations: ['Snapshot 구조의 가능성만 점검한다. 실제 단서 노출·기회 도달·오류·행동을 보장하지 않는다.',
      '기회가 없으면 측정값은 null/unexercised이며 실수를 강제하지 않는다.', '기준 동선은 정적 점검용이며 배우에게 따라야 할 동선으로 제공하지 않는다.'] };
}
function auditManifestSnapshots({ snapshots, profiles, personaIds = Object.keys(profiles ?? {}), validationMode }) {
  const byPersonaCondition = [];
  for (const [condition, record] of Object.entries(snapshots)) {
    const snapshot = record.filePath ? JSON.parse(fs.readFileSync(record.filePath, 'utf8')) : record;
    for (const personaId of personaIds) {
      const entry = profiles?.[personaId];
      const persona = entry?.persona ?? (entry?.character ? entry : JSON.parse(fs.readFileSync(path.join(__dirname, '../personas', `${personaId}.json`), 'utf8')));
      byPersonaCondition.push({ personaId, condition, ...auditSnapshot(snapshot, { condition, persona }) });
    }
  }
  const spec = require(validationMode === 'traits' ? '../validation/persona-trait-validation-spec.json' : '../validation/persona-validation-spec.json');
  const warnings = byPersonaCondition.flatMap(row => spec.metrics.filter(metric => (metric.applies === 'both' || metric.applies === row.condition)
    && (!metric.personaId || metric.personaId === row.personaId) && row.metrics[metric.kind]?.possible === false)
    .map(metric => ({ personaId: row.personaId, condition: row.condition, metricId: metric.id, kind: metric.kind,
      code: 'structurally-impossible', message: row.metrics[metric.kind].reason })));
  return { version: 1, scope: 'static-structural-possibility', byPersonaCondition, warnings,
    note: '모든 seed는 고정 snapshot을 사용한다. 가능 판정은 실제 기회 발생이나 행동의 보장이 아니다.' };
}
module.exports = { auditSnapshot, auditManifestSnapshots };
