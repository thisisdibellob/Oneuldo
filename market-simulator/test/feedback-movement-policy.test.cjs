const test = require('node:test');
const assert = require('node:assert/strict');
require('../runtime.cjs');
const { FeedbackMovementPolicy, FEEDBACK_MOVEMENT_POLICY_VERSION } = require('../src/feedbackMovementPolicy.ts');

const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const observation = (sequence, result, extra = {}) => ({
  schemaVersion: 'attention-observation-v1', sequence, elapsedMs: sequence * 1000,
  phase: 'shopping', view: 'world', activeStation: null,
  visibleStations: [], anchors: [], products: [], shelf: null, cart: null, cashiers: {}, listAvailable: true,
  ...(result ? { result } : {}), ...extra,
});
const movement = (direction = 'north', outcome = 'blocked', dx = 0, dy = 0) => ({
  accepted: true, actionType: 'moveDirection', movement: {
    direction, outcome, durationMs: 1000, actualDelta: { dx, dy }, movedDistancePx: Math.hypot(dx, dy),
  },
});
const stationary = actionType => ({ accepted: true, actionType });

test('configuration is explicit, bounded and protected from mutation', () => {
  const policy = new FeedbackMovementPolicy('default');
  assert.equal(FEEDBACK_MOVEMENT_POLICY_VERSION, 'exploration-v1');
  assert.deepEqual(policy.configuration, { version: 'exploration-v1', wanderProbability: .2,
    blockedDirectionCooldown: 4, unblockDistancePx: 24 });
  policy.configuration.wanderProbability = 1;
  assert.equal(policy.configuration.wanderProbability, .2);
  for (const value of [-.1, 1.01, NaN, Infinity, '0.2', null])
    assert.throws(() => new FeedbackMovementPolicy('bad', { wanderProbability: value }), /0\.\.1/);
});

test('constructor validates a plain allowlisted options object without relying on a transport schema', () => {
  for (const options of [null, [], [0], 0, .2, '0.2', true, () => ({}), new Date(),
    Object.create({ wanderProbability: .5 })])
    assert.throws(() => new FeedbackMovementPolicy('bad-options', options), /options must be a plain object/);
  for (const options of [{ probability: .2 }, { wanderProbability: .2, unknown: undefined },
    { [Symbol('unknown')]: 1 }, Object.defineProperty({}, 'hidden', { value: true })])
    assert.throws(() => new FeedbackMovementPolicy('bad-keys', options), /options may only contain wanderProbability/);
  assert.equal(new FeedbackMovementPolicy('default', {}).configuration.wanderProbability, .2);
  assert.equal(new FeedbackMovementPolicy('default', undefined).configuration.wanderProbability, .2);
  const plainWithoutPrototype = Object.assign(Object.create(null), { wanderProbability: 0 });
  assert.equal(new FeedbackMovementPolicy('plain', plainWithoutPrototype).configuration.wanderProbability, 0);
});

test('probability zero preserves actor choice and one requests wandering without targets', () => {
  for (const probability of [0, 1]) {
    const policy = new FeedbackMovementPolicy('probability', { wanderProbability: probability });
    for (let index = 0; index < 12; index++) {
      const context = policy.prepare(observation(index), index);
      assert.equal(context.mode, probability ? 'random-wander' : 'actor-choice');
      assert.equal(context.eligible, true);
      assert.ok(context.roll >= 0 && context.roll < 1);
      assert.deepEqual(context.avoidedDirections, []);
      assert.equal('direction' in context, false);
      assert.equal('durationMs' in context, false);
    }
  }
});

test('seed and decision index reproduce rolls independent of previous random draws or hidden data', () => {
  const left = new FeedbackMovementPolicy('repeat'), right = new FeedbackMovementPolicy('repeat');
  let otherSeedDiffers = false;
  const other = new FeedbackMovementPolicy('other');
  for (let index = 0; index < 30; index++) {
    const a = left.prepare(observation(index), index);
    const b = right.prepare(observation(index, null, { environment: { secret: 'route' }, goals: ['answer'] }), index);
    assert.deepEqual(a, b);
    otherSeedDiffers ||= a.roll !== other.prepare(observation(index), index).roll;
    const fresh = new FeedbackMovementPolicy('repeat').prepare(observation(index), index);
    assert.equal(a.roll, fresh.roll);
    assert.equal(a.mode, a.roll < .2 ? 'random-wander' : 'actor-choice');
  }
  assert.equal(otherSeedDiffers, true);
});

test('same-index retries return an isolated cached context without processing another result', () => {
  const policy = new FeedbackMovementPolicy('retry', { wanderProbability: 0 });
  const first = policy.prepare(observation(1, movement()), 1);
  const retry = policy.prepare(observation(2, movement('east')), 1);
  assert.deepEqual(retry, first);
  retry.avoidedDirections.push('south');
  assert.deepEqual(policy.prepare(observation(1), 1).avoidedDirections, ['north']);
  const next = policy.prepare(observation(2, stationary('readList')), 2);
  assert.deepEqual(next.avoidedDirections, ['north']);
  assert.equal(next.mode, 'blocked-recovery');
  assert.deepEqual(policy.prepare(observation(100), 1), first);
});

test('blocked direction is excluded for exactly four unlocked world decisions, with no stale-result refresh', () => {
  const policy = new FeedbackMovementPolicy('cooldown', { wanderProbability: 0 });
  const blocked = observation(1, movement());
  for (let index = 1; index <= 4; index++) {
    const context = policy.prepare(blocked, index);
    assert.deepEqual(context.avoidedDirections, ['north']);
    assert.equal(context.mode, 'blocked-recovery');
    assert.equal(context.roll, null);
  }
  assert.deepEqual(policy.prepare(blocked, 5).avoidedDirections, []);
});

test('panels, entry, checkout and open stations neither request movement nor age local blocks', () => {
  const policy = new FeedbackMovementPolicy('panels', { wanderProbability: 1 });
  policy.prepare(observation(1, movement()), 1);
  const locked = [{ view: 'cart' }, { view: 'help' }, { activeStation: 'fresh' }, { phase: 'checkout' }, { phase: 'entry' }];
  locked.forEach((extra, index) => {
    const context = policy.prepare(observation(index + 2, stationary('viewHelp'), extra), index + 2);
    assert.equal(context.mode, 'actor-choice');
    assert.equal(context.eligible, false);
    assert.equal(context.roll, null);
    assert.deepEqual(context.avoidedDirections, ['north']);
  });
  for (let index = 7; index < 10; index++)
    assert.deepEqual(policy.prepare(observation(index, stationary('lookAround')), index).avoidedDirections, ['north']);
  assert.deepEqual(policy.prepare(observation(10), 10).avoidedDirections, []);
});

test('stationary results preserve pending recovery; a new directional attempt consumes or renews it', () => {
  const policy = new FeedbackMovementPolicy('recovery', { wanderProbability: 0 });
  assert.equal(policy.prepare(observation(1, movement()), 1).mode, 'blocked-recovery');
  const stationaryContext = policy.prepare(observation(2, stationary('readList')), 2);
  assert.equal(stationaryContext.mode, 'blocked-recovery');
  assert.deepEqual(stationaryContext.avoidedDirections, ['north']);
  const repeated = policy.prepare(observation(3, movement()), 3);
  assert.equal(repeated.mode, 'blocked-recovery');
  assert.equal(repeated.roll, null);
  const changed = policy.prepare(observation(4, movement('east', 'partially-blocked', 2, 0)), 4);
  assert.equal(changed.mode, 'actor-choice');
  assert.deepEqual(changed.avoidedDirections, ['north']);
});

test('block then panel results then world results preserves recovery until an applied movement', () => {
  const policy = new FeedbackMovementPolicy('panel-recovery', { wanderProbability: 0 });
  policy.prepare(observation(1, movement()), 1);
  for (const [sequence, view, actionType] of [[2, 'help', 'viewHelp'], [3, 'cart', 'viewCart']]) {
    const panel = policy.prepare(observation(sequence, stationary(actionType), { view }), sequence);
    assert.equal(panel.eligible, false);
    assert.equal(panel.mode, 'actor-choice');
    assert.deepEqual(panel.avoidedDirections, ['north']);
  }
  const world = policy.prepare(observation(4, stationary('closeView')), 4);
  assert.equal(world.eligible, true);
  assert.equal(world.mode, 'blocked-recovery');
  assert.equal(world.roll, null);
  assert.deepEqual(world.avoidedDirections, ['north']);
  const rejected = policy.prepare(observation(5, { ...movement('east', 'moved', 40, 0), accepted: false }), 5);
  assert.equal(rejected.mode, 'blocked-recovery');
  assert.deepEqual(rejected.avoidedDirections, ['north']);
  const moved = policy.prepare(observation(6, movement('east', 'partially-blocked', 5, 0)), 6);
  assert.equal(moved.mode, 'actor-choice');
  assert.deepEqual(moved.avoidedDirections, ['north']);
});

test('partial movement clears local blocks only after 24px of net displacement, not path length', () => {
  const policy = new FeedbackMovementPolicy('net', { wanderProbability: 0 });
  policy.prepare(observation(1, movement()), 1);
  assert.deepEqual(policy.prepare(observation(2, movement('east', 'partially-blocked', 13, 0)), 2).avoidedDirections, ['north']);
  assert.deepEqual(policy.prepare(observation(3, movement('west', 'partially-blocked', -13, 0)), 3).avoidedDirections, ['north']);
  assert.deepEqual(policy.prepare(observation(4, movement('east', 'partially-blocked', 24, 0)), 4).avoidedDirections, []);
  const diagonal = new FeedbackMovementPolicy('diagonal');
  diagonal.prepare(observation(1, movement()), 1);
  assert.deepEqual(diagonal.prepare(observation(2, movement('southeast', 'moved', 18, 18)), 2).avoidedDirections, []);
});

test('a repeated observation cannot accumulate its displacement twice or reactivate expired blocks', () => {
  const policy = new FeedbackMovementPolicy('sequence', { wanderProbability: 0 });
  policy.prepare(observation(1, movement()), 1);
  const moved = observation(2, movement('east', 'moved', 13, 0));
  policy.prepare(moved, 2);
  assert.deepEqual(policy.prepare(moved, 3).avoidedDirections, ['north']);
  assert.deepEqual(policy.prepare(observation(1, movement('west')), 4).avoidedDirections, ['north']);
  assert.deepEqual(policy.prepare(observation(1, movement('west')), 5).avoidedDirections, []);
});

test('accepted different or first legacy arrivals clear local blocks; same arrival and rejection do not', () => {
  const policy = new FeedbackMovementPolicy('arrivals', { wanderProbability: 0 });
  const arrival = anchorId => ({ accepted: true, actionType: 'walkToAnchor', anchorId });
  policy.prepare(observation(0, arrival('local-A')), 0);
  policy.prepare(observation(1, movement()), 1);
  const same = policy.prepare(observation(2, arrival('local-A')), 2);
  assert.deepEqual(same.avoidedDirections, ['north']);
  assert.equal(same.mode, 'blocked-recovery');
  const rejected = policy.prepare(observation(3, { ...arrival('local-B'), accepted: false }), 3);
  assert.deepEqual(rejected.avoidedDirections, ['north']);
  assert.equal(rejected.mode, 'blocked-recovery');
  const different = policy.prepare(observation(4, arrival('local-B')), 4);
  assert.deepEqual(different.avoidedDirections, []);
  assert.equal(different.mode, 'actor-choice');
  const first = new FeedbackMovementPolicy('first');
  first.prepare(observation(1, movement()), 1);
  assert.deepEqual(first.prepare(observation(2, arrival('local-A')), 2).avoidedDirections, []);
});

test('positive directional displacement invalidates the remembered legacy arrival', () => {
  const policy = new FeedbackMovementPolicy('leave-anchor', { wanderProbability: 0 });
  const arrival = { accepted: true, actionType: 'walkToAnchor', anchorId: 'local-A' };
  policy.prepare(observation(0, arrival), 0);
  policy.prepare(observation(1, movement()), 1);
  assert.deepEqual(policy.prepare(observation(2, movement('east', 'partially-blocked', 1, 0)), 2).avoidedDirections, ['north']);
  assert.deepEqual(policy.prepare(observation(3, arrival), 3).avoidedDirections, []);
});

test('all blocked directions fall back to nonmovement eligibility without choosing an escape', () => {
  const policy = new FeedbackMovementPolicy('all-blocked', { wanderProbability: 1 });
  // Each result is a distinct observation; locked views do not spend cooldown decisions.
  directions.forEach((direction, index) => policy.prepare(observation(index, movement(direction), { view: 'cart' }), index));
  const context = policy.prepare(observation(8), 8);
  assert.deepEqual(context, { version: 'exploration-v1', mode: 'actor-choice', eligible: false,
    wanderProbability: 1, roll: null, avoidedDirections: directions });
});

test('missing sequence cannot manufacture a new movement result and invalid indices fail explicitly', () => {
  const policy = new FeedbackMovementPolicy('sequence-required');
  const context = policy.prepare(observation(undefined, movement()), 0);
  assert.deepEqual(context.avoidedDirections, []);
  for (const index of [-1, .5, NaN, Infinity]) assert.throws(() => policy.prepare(observation(1), index), /decisionIndex/);
  policy.prepare(observation(2), 2);
  assert.throws(() => policy.prepare(observation(1), 1), /increasing index/);
});
