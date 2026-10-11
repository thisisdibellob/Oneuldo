'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { IDS, sanitize, assertAnonymous, build, grade } = require('../src/personaValidationBlind.cjs');
const profiles = IDS.map(id => require(`../personas/${id}.json`));
const step = (id, type, extra = {}) => ({ id, type, reactionDelayMs: 1200, reason: '우유를 고른다.', ...extra });

function trace() {
  return { personaId: IDS[0], personaVersion: '6', seed: 'hidden-seed', traceId: 'trace-secret',
    generation: { model: 'private-model' }, attentionExperience: { memory: 'private-memory' },
    filePath: '/Users/private/trace.json', steps: [
      step('secret-지민-step', 'walkToAnchor', { target: { anchorId: 'aisle-1', metadata: { personaId: IDS[0] },
        filePath: '/private/tmp/key.json' }, movement: { motorSeed: IDS[0], style: 'careful', speedMultiplier: .8 } }),
      step('secret-selection', 'dragProduct', { productId: 'milk', quantity: 2,
        gesture: { outcome: 'drop', motorSeed: IDS[0], durationMs: 3000 }, attentionTag: 'interest',
        currentTask: '지민의 과제', durationMs: 5000, timeoutMs: 40000, cueRefs: ['private-cue'] }),
      step('secret-checkout', 'checkout', { checkoutId: 'checkout' }),
    ] };
}

test('A uses a strict primitive allowlist including nested targets and preserves action order', () => {
  const cleaned = sanitize(trace(), 'A');
  assert.deepEqual(cleaned.steps, [
    { type: 'walkToAnchor', target: { anchorId: 'aisle-1' }, reactionDelayMs: 1200 },
    { type: 'dragProduct', productId: 'milk', quantity: 2, reactionDelayMs: 1200 },
    { type: 'checkout', checkoutId: 'checkout', reactionDelayMs: 1200 },
  ]);
  assertAnonymous(cleaned, profiles);
  for (const field of ['reason', 'movement', 'motorSeed', 'gesture', 'outcome', 'timeoutMs', 'currentTask', 'attentionTag', 'cueRefs', 'traceId']) {
    assert.ok(!JSON.stringify(cleaned).includes(field), field);
  }
  const b = sanitize(trace(), 'B');
  assert.deepEqual(b.steps.map(({ reason, ...action }) => action), cleaned.steps);
  assert.ok(b.steps.every(row => row.reason === '우유를 고른다.'));
});

test('actor delay and reason are retained without audit state or replay motor settings', () => {
  const source = { steps: [step('start-id', 'start'), step('selection-id', 'dragProduct', {
    productId: 'milk', quantity: 2, gesture: { outcome: 'drop', motorSeed: IDS[1] } })] };
  const audit = { decisions: [{ decisionIndex: 0, before: { sequence: 1 }, action: { type: 'add', productId: 'milk', quantity: 2 },
    delayMs: 3333, reason: '보이는 우유를 담는다.', actorState: { task: 'private task', activity: 'shop' }, personaId: IDS[0] }] };
  assert.deepEqual(sanitize(source, 'B', audit), { steps: [{ type: 'dragProduct', productId: 'milk', quantity: 2,
    reactionDelayMs: 3333, reason: '보이는 우유를 담는다.' }] });
});

test('public descriptions are separate and both shuffled panels have disjoint opaque IDs', () => {
  const samples = IDS.map((personaId, index) => ({ personaId, tracePath: `/private/${index}.json`, trace: trace() }));
  const result = build(samples, profiles);
  assert.ok(!Object.hasOwn(result.bundle, 'publicProfiles'));
  assert.equal(result.publicProfiles.length, 4);
  assert.equal(result.publicProfiles[0].id, IDS[0]);
  assertAnonymous(result.bundle, profiles);
  assert.ok(!JSON.stringify(result.bundle).includes('/private/'));
  assert.equal(result.key.length, 8);
  const a = new Set(result.bundle.panels.A.map(row => row.opaqueId));
  assert.equal(a.size, 4);
  assert.ok(result.bundle.panels.B.every(row => !a.has(row.opaqueId)));
  for (const panel of ['A', 'B']) {
    assert.deepEqual(new Set(result.bundle.panels[panel].map(row => row.opaqueId)),
      new Set(result.key.filter(row => row.version === panel).map(row => row.opaqueId)));
  }
  const answers = Object.fromEntries(result.key.map(row => [row.opaqueId, row.personaId]));
  const scores = grade(result.key, answers);
  assert.equal(scores.A.accuracy, 1); assert.equal(scores.B.accuracy, 1);
});

test('whole anonymous bundle scanning rejects all identity tokens with no public-description exception', () => {
  for (const token of [...IDS, '지민', '서연', '민수']) {
    const source = trace(); source.steps[1].reason = `${token}의 선택`;
    assert.throws(() => build([{ personaId: IDS[0], tracePath: '/secret', trace: source }], profiles), /leaked identity/);
    assert.throws(() => assertAnonymous({ panels: {}, unexpectedMetadata: { label: token } }, profiles), /leaked identity/);
  }
  const source = trace(); source.steps[0].target.anchorId = `route-${IDS[1]}`;
  assert.throws(() => build([{ personaId: IDS[0], trace: source }], profiles), /leaked identity/);
  assert.throws(() => assertAnonymous({ reason: 'C:\\Users\\private\\trace.json' }), /file path/);
  assert.throws(() => assertAnonymous({ reason: '/Users/private/trace.json' }), /file path/);
  assert.throws(() => assertAnonymous({ reason: 'saved in /custom/output.json' }), /file path/);
  assert.throws(() => assertAnonymous({ reason: 'C:/private/trace.json' }), /file path/);
});

test('unexpected types cannot smuggle data through permitted primitive fields', () => {
  for (const [field, value] of [['productId', { personaId: IDS[0] }], ['quantity', 'hidden'], ['reactionDelayMs', Infinity]]) {
    const source = trace(); source.steps[1][field] = value;
    assert.throws(() => sanitize(source, 'A'), /Invalid blind action/);
  }
  const source = trace(); source.steps[0].target.anchorId = { hidden: IDS[0] };
  assert.throws(() => sanitize(source, 'A'), /Invalid blind action/);
  assert.throws(() => sanitize(trace(), 'C'), /panel A or B/);
});
