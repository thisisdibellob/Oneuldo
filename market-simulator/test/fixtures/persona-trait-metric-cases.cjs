'use strict';
// Synthetic traces that exercise every per-trace metric with both hits and misses.
// Their pre-opportunityRows outputs are frozen in persona-trait-metrics-golden.json.
const actionFor = s => s.type === 'dragProduct' ? { type: 'add', productId: s.productId, quantity: s.quantity }
  : s.type === 'removeProduct' ? { type: 'remove', productId: s.productId, quantity: s.quantity }
    : s.type === 'openShelf' ? { type: 'interact', station: s.stationId }
      : s.type === 'walkToAnchor' ? { type: 'walkToAnchor', anchorId: s.target.anchorId }
        : s.type === 'submitForReview' ? { type: 'submit' }
          : { type: s.type, ...(s.type === 'browse' ? { scrollFraction: s.scrollFraction } : {}) };
const add = (productId, quantity = 1, extra = {}) => ({ type: 'dragProduct', productId, quantity, gesture: { outcome: 'drop' }, ...extra });
const goals = (...rows) => ({ config: { difficulty: 'exact', objectives: rows.map(([productId, quantity = 1]) => ({ productId, quantity })) } });
function build(rows, trace = {}) {
  const steps = rows.map(({ before, after, actorState, basis, choiceResolution, ...step }, i) => ({ id: `s${i}`, reactionDelayMs: 100 + i * 10, ...step }));
  const decisions = rows.map((row, i) => ({ decisionIndex: i, action: actionFor(steps[i]), delayMs: steps[i].reactionDelayMs,
    before: { sequence: i, ...row.before }, after: row.after ?? { result: { accepted: true } },
    actorState: row.actorState ?? { activity: 'goal' }, basis: row.basis, choiceResolution: row.choiceResolution }));
  return { trace: { experienceMode: 'first-play', ...trace, steps }, audit: { decisions } };
}
const interest = { actorState: { activity: 'interest' }, basis: { intent: 'interest' } };
const milkDisplay = [{ id: 'milk', name: '흰 우유', detail: '1 L' }, { id: 'milk-small', name: '흰 우유', detail: '200 mL' }];
const menus = { start: ['A', 'B'], WA: ['B', 'C'], WB: ['A', 'C'] };
const routeBundle = { worldReference: { waypoints: ['A', 'B', 'C'].map(id => ({ waypointId: `W${id}`, anchorId: id })) },
  choiceCatalog: { navigation: [{ navigationStateId: 'state', locations: Object.entries(menus)
    .map(([location, ids]) => ({ location, choiceIds: ids.map(id => `walk/W${id}`) })) }] } };
const walks = last => [['start', 'A'], ['WA', 'B'], ['WB', last]].map(([location, id]) => ({ type: 'walkToAnchor', target: { anchorId: id },
  before: { phase: 'shopping', view: 'world', activeStation: null, anchors: menus[location].map(anchor => ({ id: anchor })) },
  choiceResolution: { source: { location, navigationStateId: 'state' } } }));

function cases() {
  return [
    { name: 'checking-sequence', snapshot: goals(['milk', 2], ['apple'], ['water']), ...build([
      { type: 'readList' }, add('milk', 2, { basis: { goalId: 'objective-1' } }), { type: 'readList' },
      add('apple', 1, { basis: { goalId: 'objective-2' } }), add('water', 1, { basis: { goalId: 'objective-3' } }),
      { type: 'viewCart' }, { type: 'checkout' }, { type: 'submitForReview' }]) },
    { name: 'comparison-and-text', snapshot: goals(['milk'], ['apple']), ...build([
      { type: 'lookAround' }, { type: 'openShelf', stationId: 'fresh' },
      { type: 'browse', scrollFraction: 1, before: { products: milkDisplay, shelf: { pageCount: 2 } } },
      add('milk', 1, { before: { products: milkDisplay, shelf: { pageCount: 2 } } }),
      { type: 'closeStation' }, { type: 'openShelf', stationId: 'produce' },
      add('apple', 1, { before: { products: [{ id: 'apple', name: '사과' }, { id: 'apple-green', name: '풋사과' }], shelf: { pageCount: 2 } } }),
      { type: 'checkout' }, { type: 'submitForReview' }]) },
    { name: 'text-cue-lookaround', snapshot: goals(['milk']), ...build([
      { type: 'openShelf', stationId: 'fresh' }, { type: 'lookAround', before: { products: milkDisplay } },
      add('milk', 1, { before: { products: milkDisplay } }), { type: 'submitForReview' }]) },
    { name: 'interest-detour-recovery', snapshot: goals(['milk']), persona: { attention: { interestProductWeights: { curry: 2 } } }, ...build([
      { type: 'lookAround', before: { products: [{ id: 'curry' }], visibleStations: [{ id: 'meal', label: '카레' }] } },
      { type: 'openShelf', stationId: 'meal', ...interest }, add('curry', 1, { ...interest, before: { products: [{ id: 'curry' }] } }),
      { type: 'closeStation' }, { type: 'readList' }, { type: 'openShelf', stationId: 'fresh' }, add('milk'),
      { type: 'lookAround', before: { products: [{ id: 'curry' }] } }, { type: 'pause' }, { type: 'submitForReview' }]) },
    { name: 'interest-no-recovery', snapshot: goals(['milk'], ['apple']), persona: { attention: { interestCategoryWeights: { meal: 1 } } }, ...build([
      { type: 'lookAround', before: { visibleStations: [{ id: 'meal' }] } }, { type: 'openShelf', stationId: 'meal', ...interest },
      { type: 'pause', ...interest }, { type: 'closeStation' }, { type: 'giveUp' }]) },
    { name: 'correction-and-difficulty', snapshot: goals(['milk', 2], ['apple']), ...build([
      { type: 'readList' }, add('milk', 3), { type: 'viewCart', before: { cart: { milk: 3 } } },
      { type: 'removeProduct', productId: 'milk', quantity: 1 }, add('apple-green', 1, { after: { result: { accepted: false } } }),
      { type: 'viewHelp', before: { lastActionError: 'wrong-product' } }, add('apple'),
      { type: 'pause', actorState: { activity: 'goal', uncertainGoalIds: ['objective-2'] } }, { type: 'readList' },
      { type: 'checkout' }, { type: 'submitForReview' }]) },
    { name: 'operation-learning', snapshot: goals(['milk'], ['apple']), ...build([
      { type: 'openShelf', stationId: 'fresh' }, { type: 'lookAround' }, add('milk'), { type: 'pause' },
      { type: 'browse', scrollFraction: 0.5 }, { type: 'viewCart' }, { type: 'checkout' }, { type: 'submitForReview' }]) },
    { name: 'route-relies', snapshot: goals(['milk']), bundle: routeBundle, ...build(walks('A')) },
    { name: 'route-explores', snapshot: goals(['milk']), bundle: routeBundle, ...build(walks('C')) },
    { name: 'continuous-route-missing-evidence', snapshot: goals(['milk']), bundle: routeBundle,
      routeOpportunityVersion: 'continuous-route-v1', ...build(walks('A')) },
    { name: 'fallback-steps', snapshot: goals(['milk'], ['apple']), audit: null, trace: { experienceMode: 'first-play', steps: [
      { id: 'a', type: 'readList', reactionDelayMs: 100 }, { id: 'b', type: 'openShelf', stationId: 'meal', attentionTag: 'interest', reactionDelayMs: 200 },
      { ...add('milk'), id: 'c', reactionDelayMs: 300 }, { id: 'd', type: 'readList', reactionDelayMs: 100 },
      { ...add('apple'), id: 'e', reactionDelayMs: 300 }, { id: 'f', type: 'viewCart', reactionDelayMs: 100 },
      { id: 'g', type: 'submitForReview', reactionDelayMs: 100 }] } },
    { name: 'system-completion', snapshot: goals(['milk'], ['apple'], ['water']), ...(() => {
      const built = build([add('milk', 1, { basis: { goalId: 'objective-1' } }), { type: 'readList' }]);
      const system = [{ ...add('apple'), id: 'sys1' }, { id: 'sys2', type: 'readList' }, { ...add('water'), id: 'sys3' },
        { id: 'sys4', type: 'viewCart' }, { id: 'sys5', type: 'checkout' }, { id: 'sys6', type: 'submitForReview' }];
      return { trace: { ...built.trace, generation: { systemCompletion: { firstStepId: 'sys1' } }, steps: [...built.trace.steps, ...system] },
        audit: built.audit };
    })() },
    { name: 'revisit', snapshot: goals(['milk']), ...build([
      { type: 'lookAround' }, { type: 'openShelf', stationId: 'fresh' }, add('milk'), { type: 'submitForReview' }], { experienceMode: 'revisit' }) },
  ];
}
// Invariant-only traces added after the golden was frozen.
function extraCases() {
  const rejected = { result: { accepted: false, message: 'blocked' }, lastActionError: 'blocked' };
  return [
    { name: 'difficulty-without-response', snapshot: goals(['milk']), ...build([
      { type: 'openShelf', stationId: 'fresh' }, add('milk-small', 1, { after: rejected }),
      { type: 'pause', before: rejected }, add('milk-small', 1, { before: rejected, after: rejected }), { type: 'giveUp', before: rejected }]) },
  ];
}
module.exports = { cases, extraCases, build, add, goals };
