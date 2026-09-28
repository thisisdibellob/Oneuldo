import { playMarketTrace, type ReplayProgress } from '../src/replay/player';
import { replayUntil, type ReplayMotionPort, type ReplayUiPort } from '../src/replay/ports';
import type { MarketReplayTrace } from '../src/game/marketReplayTrace';

// This suite isolates lifecycle behavior; the real shared schema has its own contract tests.
jest.mock('../src/game/marketReplayTrace', () => ({ validateMarketReplayTrace: () => ({ valid: true, errors: [] }) }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function harness(timeoutMs = 1000) {
  let briefing = true, accepted = false;
  const submit = deferred(), leave = deferred();
  const ui = {
    snapshot: jest.fn(() => ({})), sessionId: () => 'session',
    read: () => ({ briefing, briefingStep: 0, phase: 'checkout', reviewAccepted: accepted, reviewError: null }),
    advanceBriefing: jest.fn(() => { briefing = false; }),
    submit: jest.fn(async () => { await submit.promise; accepted = true; }),
    leave: jest.fn(() => leave.promise),
  } as unknown as ReplayUiPort;
  const motion = { read: () => ({ locked: false }), stop: jest.fn() } as unknown as ReplayMotionPort;
  const progress: ReplayProgress[] = [];
  const trace = { steps: ['start', 'submitForReview', 'awaitReviewAccepted', 'leave'].map((type, index) => ({
    type, id: `step-${index}`, timeoutMs, reactionDelayMs: 0, reason: 'lifecycle-test',
  })) } as unknown as MarketReplayTrace;
  const controller = new AbortController();
  const run = () => playMarketTrace(trace, () => ui, motion, controller.signal, value => progress.push(value));
  return { ui, motion, progress, controller, submit, leave, run };
}
async function untilCalled(mock: unknown) {
  for (let count = 0; count < 20 && !(mock as jest.Mock).mock.calls.length; count++) await jest.advanceTimersByTimeAsync(1);
  expect(mock).toHaveBeenCalledTimes(1);
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('stop during pending app submission acknowledges immediately and issues no later replay input', async () => {
  const test = harness(), run = test.run();
  await untilCalled(test.ui.submit);
  test.controller.abort('operator stop');
  await run;
  expect(test.progress.at(-1)).toMatchObject({ status: 'stopped', error: 'operator stop', report: { acknowledged: false } });
  expect(test.ui.leave).not.toHaveBeenCalled();
  expect(test.motion.stop).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
  // An existing app HTTP handler can finish later; the replay must stay terminal.
  const reports = test.progress.length;
  test.submit.resolve(); await jest.advanceTimersByTimeAsync(10000);
  expect(test.ui.leave).not.toHaveBeenCalled();
  expect(test.progress).toHaveLength(reports);
});

test('step timeout aborts a stalled submit without waiting for its network response', async () => {
  const test = harness(80), run = test.run();
  await untilCalled(test.ui.submit);
  await jest.advanceTimersByTimeAsync(81); await run;
  expect(test.controller.signal.aborted).toBe(false);
  expect(test.progress.at(-1)).toMatchObject({ status: 'failed', error: 'Replay step timed out after 80ms' });
  expect(test.ui.leave).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
  test.submit.resolve(); await jest.advanceTimersByTimeAsync(1000);
  expect(test.ui.leave).not.toHaveBeenCalled();
});

test('stop during pending leave never reports acknowledgement after the old handler resolves', async () => {
  const test = harness(); test.submit.resolve();
  const run = test.run(); await untilCalled(test.ui.leave);
  test.controller.abort('disconnected'); await run;
  expect(test.progress.at(-1)).toMatchObject({ status: 'stopped', report: { acknowledged: false } });
  const count = test.progress.length;
  test.leave.resolve(); await jest.advanceTimersByTimeAsync(10000);
  expect(test.progress).toHaveLength(count);
  expect(test.progress.at(-1)?.report.acknowledged).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
});

test('step deadline reaches an internal briefing wait and prevents later page presses', async () => {
  const test = harness(40);
  (test.ui.advanceBriefing as jest.Mock).mockImplementation(() => {});
  const run = test.run(); await untilCalled(test.ui.advanceBriefing);
  await jest.advanceTimersByTimeAsync(50); await run;
  expect(test.progress.at(-1)?.status).toBe('failed');
  await jest.advanceTimersByTimeAsync(10000);
  expect(test.ui.advanceBriefing).toHaveBeenCalledTimes(1);
  expect(test.ui.submit).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('replayUntil rejects an aborted signal even when the condition is already true', async () => {
  const controller = new AbortController(); controller.abort('already stopped');
  const check = jest.fn(() => true);
  await expect(replayUntil(check, controller.signal)).rejects.toThrow('already stopped');
  expect(check).not.toHaveBeenCalled();
  const other = new AbortController();
  await expect(replayUntil(() => { other.abort('stopped while reading'); return true; }, other.signal)).rejects.toThrow('stopped while reading');
  expect(jest.getTimerCount()).toBe(0);
});

test('a partly advanced briefing is rejected before player input', async () => {
  const test = harness();
  const originalRead = test.ui.read;
  test.ui.read = () => ({ ...originalRead(), briefingStep: 1 });
  await expect(test.run()).rejects.toThrow('first page');
  expect(test.ui.advanceBriefing).not.toHaveBeenCalled();
  expect(test.ui.submit).not.toHaveBeenCalled();
  expect(test.progress).toHaveLength(0);
});

test.each([[2, [1, 1]], [3, [3]]] as const)('staff return of %i uses only the visible one/all choices', async (quantity, expected) => {
  const test = harness();
  let count = 3, returning = false;
  test.ui.read = () => ({ briefing: true, briefingStep: 0, staffOpen: true,
    staffReturnHelp: returning, cart: { milk: count } } as any);
  test.ui.openReturnHelp = jest.fn(() => { returning = true; });
  test.ui.requestReturn = jest.fn((_product, amount) => { count -= amount; });
  const trace = { steps: [{ id: 'return', type: 'talkToStaff', stationId: 'staff:employee-1',
    choice: 'returnProduct', productId: 'milk', quantity, reactionDelayMs: 0, timeoutMs: 5000, reason: 'correct extra quantity' }] } as unknown as MarketReplayTrace;
  const run = playMarketTrace(trace, () => test.ui, test.motion, test.controller.signal, progress => test.progress.push(progress));
  await jest.advanceTimersByTimeAsync(1500); await run;
  expect(jest.mocked(test.ui.requestReturn).mock.calls.map(([, amount]) => amount)).toEqual(expected);
  expect(count).toBe(3 - quantity);
  expect(test.progress.at(-1)?.status).toBe('completed');
});

test('cashier choice returns from the product-return submenu before pressing its visible button', async () => {
  const test = harness();
  let returning = true;
  test.ui.read = () => ({ briefing: true, briefingStep: 0, staffOpen: true, staffReturnHelp: returning } as any);
  test.ui.backToStaff = jest.fn(() => { returning = false; });
  test.ui.requestCashier = jest.fn(() => { expect(returning).toBe(false); });
  const trace = { steps: [{ id: 'cashier', type: 'talkToStaff', stationId: 'staff:employee-1',
    choice: 'requestCashier', checkoutId: 'checkout-2', reactionDelayMs: 0, timeoutMs: 5000, reason: 'ask available staff' }] } as unknown as MarketReplayTrace;
  const run = playMarketTrace(trace, () => test.ui, test.motion, test.controller.signal, progress => test.progress.push(progress));
  await jest.advanceTimersByTimeAsync(1000); await run;
  expect(test.ui.backToStaff).toHaveBeenCalledTimes(1);
  expect(test.ui.requestCashier).toHaveBeenCalledWith('checkout-2');
  expect(test.progress.at(-1)?.status).toBe('completed');
});

test('stopping during a v2 list read prevents later scroll inputs', async () => {
  const presentation = { viewport: { width: 390, height: 844 }, zoom: 1.3 };
  let briefing = true;
  const scrollList = jest.fn();
  const ui = { snapshot: () => ({ presentation }), presentation: () => presentation,
    read: () => ({ briefing, briefingStep: 0, phase: 'shopping', shelf: null, cartOpen: false, helpOpen: false, staffOpen: false }),
    advanceBriefing: () => { briefing = false; }, scrollList,
  } as unknown as ReplayUiPort;
  const motion = { read: () => ({ locked: false, presentation }), stop: jest.fn() } as unknown as ReplayMotionPort;
  const trace = { traceSchemaVersion: '2', steps: [
    { type: 'start' }, { type: 'readList', durationMs: 1000 },
  ].map((step, i) => ({ ...step, id: `step-${i}`, timeoutMs: 3000, reactionDelayMs: 0, reason: 'read visible list' })) } as unknown as MarketReplayTrace;
  const controller = new AbortController(), progress: ReplayProgress[] = [];
  const run = playMarketTrace(trace, () => ui, motion, controller.signal, value => progress.push(value));
  await untilCalled(scrollList);
  expect(scrollList).toHaveBeenCalledWith(0);
  controller.abort('reader stopped'); await run;
  await jest.advanceTimersByTimeAsync(5000);
  expect(scrollList).toHaveBeenCalledTimes(1);
  expect(progress.at(-1)).toMatchObject({ status: 'stopped', error: 'reader stopped' });
});

test('a v2 trace cannot start against an absent or changed presentation', async () => {
  const test = harness();
  const p = { viewport: { width: 390, height: 844 }, zoom: 1.3 };
  const trace = { traceSchemaVersion: '2', steps: [] } as unknown as MarketReplayTrace;
  await expect(playMarketTrace(trace, () => test.ui, test.motion, test.controller.signal, () => {})).rejects.toThrow(/actual bound app presentation/);
  test.ui.snapshot = () => ({ presentation: p } as any);
  test.ui.presentation = () => ({ ...p, zoom: 2 });
  await expect(playMarketTrace(trace, () => test.ui, test.motion, test.controller.signal, () => {})).rejects.toThrow(/presentation changed/);
  expect(test.ui.advanceBriefing).not.toHaveBeenCalled();
});

test('an acknowledged v2 leave may unmount the shopping UI and restore village zoom', async () => {
  const presentation = { viewport: { width: 390, height: 844 }, zoom: 1.3 };
  let briefing = true, mounted = true, phase = 'shopping', currentPresentation = presentation;
  const ui = { snapshot: () => ({ presentation }), presentation: () => currentPresentation,
    read: () => ({ briefing, briefingStep: 0, phase, reviewAccepted: false, reviewError: null }),
    advanceBriefing: () => { briefing = false; },
    giveUp: () => { phase = 'finished'; }, skipRating: jest.fn(),
    leave: jest.fn(async () => { mounted = false; currentPresentation = { ...presentation, zoom: 1 }; }),
  } as unknown as ReplayUiPort;
  const motion = { read: () => ({ locked: false, presentation: currentPresentation }), stop: jest.fn() } as unknown as ReplayMotionPort;
  const trace = { traceSchemaVersion: '2', steps: ['start', 'giveUp', 'skipRating', 'leave'].map((type, i) => ({
    type, id: `step-${i}`, timeoutMs: 3000, reactionDelayMs: 0, reason: 'normal terminal transition',
  })) } as unknown as MarketReplayTrace;
  const progress: ReplayProgress[] = [];
  const run = playMarketTrace(trace, () => mounted ? ui : null, motion, new AbortController().signal, value => progress.push(value));
  await jest.advanceTimersByTimeAsync(2000); await run;
  expect(ui.leave).toHaveBeenCalledTimes(1);
  expect(progress.at(-1)).toMatchObject({ status: 'completed', report: { acknowledged: true } });
  expect(progress.at(-1)?.report.completedSteps.map(step => step.type)).toEqual(['start', 'giveUp', 'skipRating', 'leave']);
});
