const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { WholeTraceKnowledgeLedger, validateWholeTraceBasis, wholeTraceControlCueRefs } = require('../src/wholeTraceKnowledge.ts');
const { TraceGuard } = require('../src/traceValidation.ts');
const { getPersona } = require('../src/personas.ts');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const { createMarketEnvironment, getMarketStationApproachPoint, DEFAULT_MARKET_ENVIRONMENT_CONFIG } = require('../../frontend/src/game/marketEnvironment.ts');
const { DEFAULT_REPLAY_PRESENTATION } = require('../../frontend/src/game/marketReplayPerception.ts');

const persona = getPersona('mild-intellectual-disability-adult');
function fixture(near, presentation) {
  const config = { seed: 'whole-knowledge-fixture', stockPerProduct: 5, environment: { cashierCount: 2 } };
  const environment = structuredClone(createMarketSession(config).environment);
  if (near) environment.spawn = getMarketStationApproachPoint(environment, near, environment.spawn);
  const snapshot = createMarketReplaySnapshot(createMarketSession(config, environment), undefined, presentation);
  return { snapshot, guard: new TraceGuard(snapshot, persona.id, persona.version, 'offline-fixture', true) };
}
function execute(guard, action) {
  guard.execute({ id: `knowledge-${guard.observeActor().sequence}`, reactionDelayMs: 100,
    timeoutMs: 10000, reason: '실제 화면 관찰만 지식 원장에 남긴다', ...action });
  return guard.observeActor();
}
const basis = (cueRefs, intent = 'check') => ({ intent, cueRefs });
const refs = snapshot => snapshot.cues.map(c => c.cueRef);

test('initial actor knowledge includes only displayed cues and stable persona history, never hidden catalogue facts', () => {
  const { snapshot, guard } = fixture();
  const ledger = new WholeTraceKnowledgeLedger(persona);
  const o = guard.observeActor(), knowledge = ledger.observe(o).knowledge;
  assert.deepEqual(knowledge.visibleCueRefs.filter(c => c.startsWith('anchor:')).sort(), o.anchors.map(a => `anchor:${a.id}`).sort());
  assert.deepEqual(knowledge.visibleCueRefs.filter(c => c.startsWith('station:')).sort(), o.visibleStations.map(s => `station:${s.id}`).sort());
  assert.deepEqual(knowledge.visibleCueRefs.filter(c => c.startsWith('product:')), []);
  assert.deepEqual(knowledge.visibleCueRefs.filter(c => c.startsWith('objective:')), []);
  assert.ok(knowledge.profileCueRefs.includes('persona:preference:0'));
  assert.ok(knowledge.profileCueRefs.includes('persona:strategy:0'));
  ledger.assertBasis(basis(['persona:strategy:0', 'list']));
  const hidden = Object.values(snapshot.config.inventoryProductIds).flat()[0];
  assert.throws(() => ledger.assertBasis(basis([`product:${hidden}`])), /Unobserved actor basis/);
  assert.throws(() => ledger.assertBasis(basis([`objective:${guard.observe().objectives[0].id}`])), /Unobserved actor basis/);
  const hiddenStation = snapshot.environment.stationDetails.find(s => !o.visibleStations.some(v => v.id === s.id));
  assert.ok(hiddenStation);
  assert.throws(() => ledger.assertBasis(basis([`station:${hiddenStation.id}`])), /Unobserved actor basis/);
  assert.equal(JSON.stringify(knowledge).includes('playerPosition'), false);
  assert.equal(JSON.stringify(knowledge).includes('acceptedProductIds'), false);
  // A familiar product name is personal history, not current stock or a location.
  assert.equal(refs(knowledge).includes('product:curry'), false);
});

test('available control cues describe UI affordances without exposing cart, help, or hidden shelf contents', () => {
  const { snapshot, guard } = fixture();
  const ledger = new WholeTraceKnowledgeLedger(persona);
  const initial = guard.observeActor(), initialKnowledge = ledger.observe(initial).knowledge;
  assert.deepEqual(wholeTraceControlCueRefs({ type: 'viewCart' }), ['control:viewCart']);
  assert.ok(initialKnowledge.visibleCueRefs.includes('control:viewCart'));
  assert.ok(initialKnowledge.visibleCueRefs.includes('control:viewHelp'));
  assert.ok(initialKnowledge.visibleCueRefs.includes('control:readList'));
  assert.equal(initial.cart, null);
  assert.equal(initialKnowledge.visibleCueRefs.includes('cart'), false);
  assert.equal(initialKnowledge.visibleCueRefs.some(ref => ref.startsWith('product:')), false);
  assert.equal(initialKnowledge.visibleCueRefs.some(ref => ref.startsWith('shelf-page:')), false);
  assert.equal(initialKnowledge.visibleCueRefs.some(ref => ref.startsWith('support:')), false);
  const controlCues = initialKnowledge.cues.filter(cue => cue.cueRef.startsWith('control:'));
  assert.ok(controlCues.length);
  assert.ok(controlCues.every(cue => cue.kind === 'available-ui-control'
    && Object.keys(cue.value).length === 1 && cue.value.type === cue.cueRef.slice('control:'.length)));
  assert.equal(JSON.stringify(controlCues).includes(snapshot.config.inventoryProductIds.fresh[0]), false);

  const help = execute(guard, { type: 'viewHelp' });
  const helpKnowledge = ledger.observe(help).knowledge;
  assert.ok(help.supportText.length);
  assert.ok(helpKnowledge.visibleCueRefs.includes('support:0'));
  assert.ok(helpKnowledge.visibleCueRefs.includes('control:closeView'));
  assert.equal(helpKnowledge.cues.find(cue => cue.cueRef === 'support:0').kind, 'displayed-help');

  execute(guard, { type: 'closeView' });
  const cart = execute(guard, { type: 'viewCart' });
  const cartKnowledge = ledger.observe(cart).knowledge;
  assert.ok(cartKnowledge.visibleCueRefs.includes('control:closeView'));
  assert.ok(cartKnowledge.visibleCueRefs.includes('cart'));
  assert.equal(cartKnowledge.cues.find(cue => cue.cueRef === 'cart').kind, 'displayed-cart');
});

test('an actual list read enables current objective references and later observations retain that discovery', () => {
  const { guard } = fixture();
  const ledger = new WholeTraceKnowledgeLedger(persona);
  ledger.observe(guard.observeActor());
  ledger.assertBasis(basis(['list']), { type: 'readList', durationMs: 2000 });
  const read = execute(guard, { type: 'readList', durationMs: 2000 });
  const update = ledger.observe(read);
  const objectiveRef = `objective:${read.readObjectives[0].id}`;
  assert.ok(update.newCueRefs.includes(objectiveRef));
  ledger.assertBasis(basis([objectiveRef], 'task'));
  const later = execute(guard, { type: 'pause', durationMs: 1500 });
  assert.equal(later.readObjectives, undefined);
  const remembered = ledger.observe(later).knowledge;
  assert.ok(remembered.rememberedCueRefs.includes(objectiveRef));
  assert.equal(remembered.cues.find(c => c.cueRef === objectiveRef).source, 'observed-this-visit');
  ledger.assertBasis(basis([objectiveRef, 'persona:strategy:0'], 'recover'));
});

test('real shelf pages discover only displayed products; discoveries remain available after closing the shelf', () => {
  const { snapshot, guard } = fixture('fresh', { ...DEFAULT_REPLAY_PRESENTATION, fontScale: 3 });
  const ledger = new WholeTraceKnowledgeLedger(persona);
  ledger.observe(guard.observeActor());
  ledger.assertBasis(basis(['station:fresh'], 'explore'), { type: 'interact', station: 'fresh' });
  const shelf = execute(guard, { type: 'openShelf', stationId: 'fresh' });
  ledger.observe(shelf);
  assert.ok(shelf.products.length);
  const visible = shelf.products[0];
  ledger.assertBasis(basis([`product:${visible.id}`, 'persona:preference:0'], 'interest'), { type: 'add', productId: visible.id, quantity: 1 });
  const hiddenId = snapshot.config.inventoryProductIds.fresh.find(id => !shelf.products.some(p => p.id === id));
  assert.ok(hiddenId, 'The fixture contains an off-screen shelf product');
  assert.throws(() => ledger.assertBasis(basis([`product:${hiddenId}`])), /Unobserved actor basis/);
  let found = false;
  for (const scrollFraction of shelf.shelf.pageFractions) {
    const observed = execute(guard, { type: 'browse', durationMs: 1500, scrollFraction });
    ledger.observe(observed);
    if (observed.products.some(p => p.id === hiddenId)) { found = true; break; }
  }
  assert.equal(found, true);
  ledger.assertBasis(basis([`product:${hiddenId}`], 'interest'));
  const closed = execute(guard, { type: 'closeStation' });
  const remembered = ledger.observe(closed).knowledge;
  assert.deepEqual(closed.products, []);
  assert.ok(remembered.rememberedCueRefs.includes(`product:${hiddenId}`));
  assert.equal(remembered.cues.find(c => c.cueRef === `product:${hiddenId}`).source, 'observed-this-visit');
});

test('declared basis must name the selected observable target, not just a decorative persona preference', () => {
  const { guard } = fixture();
  const ledger = new WholeTraceKnowledgeLedger(persona), o = guard.observeActor();
  ledger.observe(o);
  const anchor = o.anchors[0];
  assert.ok(anchor);
  assert.throws(() => ledger.assertBasis(basis(['persona:preference:0'], 'explore'),
    { type: 'walkToAnchor', anchorId: anchor.id }), /reference the selected control/);
  ledger.assertBasis(basis([`anchor:${anchor.id}`, 'persona:strategy:0'], 'explore'),
    { type: 'walkToAnchor', anchorId: anchor.id });
  assert.throws(() => ledger.assertBasis(basis(['waypoint:W999'], 'explore')), /Unobserved actor basis/);
  for (const value of [undefined, { intent: 'optimal', cueRefs: ['list'] }, basis([]), basis(['list', 'list']),
    { ...basis(['list']), thoughts: 'private reasoning' }, basis(['x'.repeat(301)])])
    assert.equal(validateWholeTraceBasis(value).valid, false);
});

test('confirmed prior experience is explicitly historical and never becomes current mission or map knowledge', () => {
  const { guard } = fixture();
  const prior = { version: '1', source: 'confirmed-app-replay', memberId: 'test-member',
    sessionId: 'test-session', replayId: 'test-replay', episodes: [
      { source: 'executed-app-action', action: 'dragProduct', product: '우유', quantity: 1,
        seenProducts: ['우유'], readList: [{ label: '우유', quantity: 1 }], result: 'Action executed; correctness unknown.' },
    ] };
  const ledger = new WholeTraceKnowledgeLedger(persona, prior);
  const state = ledger.observe(guard.observeActor()).knowledge;
  assert.deepEqual(state.previousExperienceCueRefs, ['prior:episode:0']);
  ledger.assertBasis(basis(['prior:episode:0', 'persona:strategy:0'], 'recover'));
  assert.equal(state.cues.find(c => c.cueRef === 'prior:episode:0').source, 'confirmed-prior-experience');
  assert.equal(state.cues.some(c => c.cueRef.startsWith('objective:') || c.cueRef === 'product:milk'), false);
  assert.throws(() => new WholeTraceKnowledgeLedger(persona, { ...prior, source: 'planned-trace' }), /confirmed-app-replay/);
  prior.episodes[0].readList[0].label = '외부 변조';
  assert.equal(ledger.snapshot().cues.find(c => c.cueRef === 'prior:episode:0').value.readList[0].label, '우유');
});

test('hidden stock and shelf placement changes cannot affect actor knowledge before they become visible', () => {
  const config = { ...DEFAULT_MARKET_ENVIRONMENT_CONFIG, seed: 'hidden-knowledge-fixture', cashierCount: 2 };
  const originalEnvironment = createMarketEnvironment(config);
  const movedEnvironment = createMarketEnvironment({ ...config, shelfOrder: ['fresh', 'produce', 'household', 'meal', 'drink'] });
  assert.notDeepEqual(originalEnvironment.shelves.fresh, movedEnvironment.shelves.fresh);
  const observe = (environment, stockPerProduct) => {
    const snapshot = createMarketReplaySnapshot(createMarketSession({ seed: environment.seed, stockPerProduct }, environment));
    const guard = new TraceGuard(snapshot, persona.id, persona.version, 'offline-fixture', true);
    const ledger = new WholeTraceKnowledgeLedger(persona);
    const o = guard.observeActor();
    return { o, state: ledger.observe(o).knowledge, stock: snapshot.initialStock };
  };
  const a = observe(originalEnvironment, 5), b = observe(movedEnvironment, 9);
  assert.notDeepEqual(a.stock, b.stock);
  assert.deepEqual(a.o, b.o);
  assert.deepEqual(a.state, b.state);
  assert.equal(a.state.cues.some(c => c.kind === 'displayed-product'), false);
});

test('displayed help and cart contents can be referenced and snapshots cannot mutate the private ledger', () => {
  const { guard } = fixture();
  const ledger = new WholeTraceKnowledgeLedger(persona);
  ledger.observe(guard.observeActor());
  const help = execute(guard, { type: 'viewHelp' });
  ledger.observe(help);
  assert.ok(help.supportText.length);
  ledger.assertBasis(basis(['support:0', 'persona:strategy:0'], 'help'));
  execute(guard, { type: 'closeView' });
  const cart = execute(guard, { type: 'viewCart' });
  const state = ledger.observe(cart).knowledge;
  ledger.assertBasis(basis(['cart'], 'check'));
  state.cues.find(c => c.cueRef === 'cart').value.fake = 9;
  state.visibleCueRefs.push('product:secret');
  assert.deepEqual(ledger.snapshot().cues.find(c => c.cueRef === 'cart').value, {});
  assert.throws(() => ledger.assertBasis(basis(['product:secret'])), /Unobserved actor basis/);
});
