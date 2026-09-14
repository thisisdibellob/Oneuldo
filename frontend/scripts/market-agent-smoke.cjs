/* Run from frontend: node scripts/market-agent-smoke.cjs [--config file.json] [--output episode.json]
 * Uses the already installed TypeScript compiler; installs no dependencies and calls no model/server.
 * This deterministic actor is a software smoke test, not a disability persona.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Restrict this process-local TS loader to project game modules.
const gameRoot = path.resolve(__dirname, '../src/game') + path.sep;
require.extensions['.ts'] = (module, filename) => {
  if (!path.resolve(filename).startsWith(gameRoot)) throw new Error('Only project game modules are supported by this smoke loader.');
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  module._compile(outputText, filename);
};

const { createMarketAgentAdapter } = require('../src/game/marketSession.ts');
const { isMarketEnvironmentBlocked, isNearMarketStation } = require('../src/game/marketEnvironment.ts');
const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); if (index >= 0 && !args[index + 1]) throw new Error(`${name} requires a path.`); return index < 0 ? undefined : args[index + 1]; };
const configPath = option('--config') || path.resolve(__dirname, '../docs/market-environment.example.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const adapter = createMarketAgentAdapter(config);

function act(action) {
  const result = adapter.act(action);
  if (result.lastActionError) throw new Error(`${action.type}: ${result.lastActionError}`);
  return result;
}

function routeTo(stationId) {
  if (adapter.observe().view !== 'world') act({ type: 'closeView' });
  if (adapter.observe().activeStation) act({ type: 'closeStation' });
  const observation = adapter.observe();
  const environment = observation.environment;
  const target = environment.stations[stationId];
  assert.ok(target, `Missing station ${stationId}`);
  const start = observation.playerPosition;
  const key = (point) => `${point.x},${point.y}`;
  const queue = [start];
  const parents = new Map([[key(start), null]]);
  const positions = new Map([[key(start), start]]);
  const cashierCalled = observation.cashierAvailability;
  let finish;
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (isNearMarketStation(environment, stationId, current, undefined, cashierCalled)) { finish = current; break; }
    for (const [dx, dy] of [[20, 0], [-20, 0], [0, 20], [0, -20]]) {
      const next = { x: current.x + dx, y: current.y + dy };
      if (parents.has(key(next))) continue;
      let blocked = false;
      for (let step = 1; step <= 5; step++) {
        if (isMarketEnvironmentBlocked(environment, { x: current.x + dx * step / 5, y: current.y + dy * step / 5 }, cashierCalled)) { blocked = true; break; }
      }
      if (blocked) continue;
      parents.set(key(next), key(current)); positions.set(key(next), next); queue.push(next);
    }
  }
  assert.ok(finish, `No collision-free route to ${stationId}`);
  const route = [];
  for (let cursor = key(finish); parents.get(cursor) !== null; cursor = parents.get(cursor)) route.unshift(positions.get(cursor));
  for (const point of route) {
    const current = adapter.observe().playerPosition;
    act({ type: 'move', dx: point.x - current.x, dy: point.y - current.y });
  }
  return act({ type: 'interact', station: stationId });
}

let checkoutId = Object.entries(adapter.observe().cashierAvailability).find(([, available]) => available)?.[0];
if (!checkoutId) {
  const staff = adapter.observe().environment.stationDetails.find((station) => station.kind === 'employee');
  routeTo(staff.id);
  assert.equal(adapter.observe().cashierAvailable, false, 'Talking alone must not call the cashier.');
  const response = act({ type: 'requestCashier' });
  assert.equal(response.cashierRequestFeedback?.accepted, true, 'A fully unstaffed market accepts the single cashier request.');
  checkoutId = response.cashierRequestFeedback.checkoutIds[0];
}
routeTo(checkoutId);
act({ type: 'submit' });
assert.deepEqual(adapter.observe().feedback, { success: false }, 'First failure must not disclose corrections.');
act({ type: 'retry' });

// The demonstration actor matches only the visible exact objective labels.
// It never reads hidden objective IDs or export data to choose purchases.
let returnProduct;
for (const objective of adapter.observe().objectives) {
  assert.equal(objective.match, 'exact', 'This demo policy supports exact-label objectives only.');
  let product;
  for (const station of adapter.observe().environment.stationDetails.filter((candidate) => candidate.kind === 'shelf')) {
    routeTo(station.id);
    product = adapter.observe().products.find((candidate) => candidate.name === objective.label);
    if (product) break;
  }
  assert.ok(product, `Visible product matching ${objective.label} must exist.`);
  act({ type: 'add', productId: product.id, quantity: objective.quantity });
  if (!returnProduct) {
    returnProduct = product;
    const pickedStock = adapter.observe().stock[product.id];
    act({ type: 'remove', productId: product.id });
    assert.equal(adapter.observe().stock[product.id], pickedStock + 1, 'A shelf return restores the same SKU stock.');
    act({ type: 'add', productId: product.id });
  }
}
act({ type: 'closeStation' });
act({ type: 'viewCart' });
assert.ok(adapter.observe().cart, 'The basket is visible only after explicitly opening it.');
const basketBeforeReturn = adapter.observe().cart;
const remoteReturn = adapter.act({ type: 'remove', productId: returnProduct.id });
assert.ok(remoteReturn.lastActionError, 'The general basket cannot return goods to a remote shelf.');
assert.deepEqual(remoteReturn.cart, basketBeforeReturn);
const returnStaff = adapter.observe().environment.stationDetails.find((station) => station.kind === 'employee');
routeTo(returnStaff.id);
assert.deepEqual(adapter.observe().cart, basketBeforeReturn, 'The employee conversation exposes the basket for selecting a return.');
const scoreBeforeReturn = adapter.observe().score;
act({ type: 'requestReturn', productId: returnProduct.id });
assert.equal(adapter.observe().cart[returnProduct.id] ?? 0, basketBeforeReturn[returnProduct.id] - 1);
assert.equal(adapter.observe().score, scoreBeforeReturn, 'Asking an employee to return a product has no score penalty.');
assert.equal(adapter.observe().feedback, null, 'Return help must not reveal purchase correctness.');
routeTo(returnProduct.categoryId);
act({ type: 'add', productId: returnProduct.id });
routeTo(checkoutId);
act({ type: 'submit' });
assert.equal(adapter.observe().outcome, 'success');
assert.equal(adapter.observe().attempts, 2);
act({ type: 'skipRating' });
const episode = adapter.exportEpisode();
assert.ok(episode.events.some((event) => event.type === 'player_moved'));
assert.ok(episode.events.some((event) => event.type === 'return_help_requested'));
for (const method of ['shelf', 'employee']) {
  assert.ok(episode.events.some((event) => event.type === 'cart_changed' && event.payload.operation === 'remove' && event.payload.method === method));
}
assert.ok(episode.events.every((event) => event.payload.input !== 'trusted-renderer'), 'Agent must never teleport.');
const output = option('--output');
if (output) { fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true }); fs.writeFileSync(output, JSON.stringify(episode, null, 2) + '\n'); }
process.stdout.write(JSON.stringify({
  status: 'passed', sessionId: episode.sessionId, seed: episode.seed,
  source: episode.provenance.source, outcome: episode.outcome, attempts: episode.attempts,
  employees: episode.environment.employees.length, customers: episode.environment.customers.length,
  layoutVersion: episode.environment.layoutVersion, score: episode.score, penaltyPoints: episode.penaltyPoints,
  alarmCount: episode.alarmCount, paid: episode.paid, cashierAvailability: episode.cashierAvailability,
  shelfSlots: Object.fromEntries(Object.entries(episode.shelfSlots).map(([category, slots]) => [category, { slots: slots.length, distinct: new Set(slots).size }])),
  events: episode.events.length, ...(output ? { exportPath: path.resolve(output) } : {}),
}, null, 2) + '\n');
