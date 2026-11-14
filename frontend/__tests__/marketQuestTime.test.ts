import { MarketQuestClock, MARKET_QUEST_TIME_POLICY, resolveMarketTimeLimitSeconds } from '../src/game/marketQuestTime';
import { applyMarketAction, createMarketSession } from '../src/game/marketSession';

test('briefing has no start time; start is idempotent and the exact boundary expires', () => {
  let wall = 1000000, monotonic = 0;
  const clock = new MarketQuestClock(180, () => wall, () => monotonic);
  wall += 300000; monotonic += 300000;
  expect(clock.snapshot()).toMatchObject({ startedAt: null, elapsedMs: 0, remainingMs: 180000, expired: false });
  const startedAt = clock.start().startedAt;
  wall += 179999; monotonic += 179999;
  expect(clock.start()).toMatchObject({ startedAt, elapsedMs: 179999, remainingMs: 1, expired: false });
  wall++; monotonic++;
  expect(clock.snapshot()).toMatchObject({ elapsedMs: 180000, remainingMs: 0, expired: true });
});

test('background wall time catches up and clock rollback never returns spent time', () => {
  let wall = 1000000, monotonic = 0;
  const clock = new MarketQuestClock(180, () => wall, () => monotonic);
  clock.start();
  wall += 90000; monotonic += 90000;
  expect(clock.snapshot().elapsedMs).toBe(90000);
  wall -= 120000;
  expect(clock.snapshot().elapsedMs).toBe(90000);
  monotonic += 90000;
  expect(clock.snapshot()).toMatchObject({ expired: true, remainingMs: 0 });
  const resumed = new MarketQuestClock(180, () => wall, () => 0);
  resumed.start(); wall += 180000; // The OS may suspend a monotonic clock while backgrounded.
  expect(resumed.snapshot()).toMatchObject({ expired: true, elapsedMs: 180000 });
});

test('early completion freezes its actual elapsed time and a new quest gets its own clock', () => {
  let now = 1000000;
  const clock = new MarketQuestClock(180, () => now, () => now);
  clock.start(); now += 42000;
  expect(clock.freeze()).toMatchObject({ elapsedMs: 42000, remainingMs: 138000, expired: false });
  now += 180000;
  expect(clock.snapshot()).toMatchObject({ elapsedMs: 42000, expired: false });
  const restarted = new MarketQuestClock(600, () => now, () => now);
  expect(restarted.snapshot()).toMatchObject({ startedAt: null, remainingMs: 600000 });
  expect(restarted.start()).toMatchObject({ elapsedMs: 0, remainingMs: 600000 });
});

test.each([179, 601, 180.5, '300', Number.NaN, Number.POSITIVE_INFINITY])('present invalid limit %p is rejected', value => {
  expect(() => resolveMarketTimeLimitSeconds(value)).toThrow('정수');
});

test('only missing legacy limits use the shared default', () => {
  expect(resolveMarketTimeLimitSeconds(undefined)).toBe(MARKET_QUEST_TIME_POLICY.defaultSeconds);
  expect(() => resolveMarketTimeLimitSeconds(undefined, true)).toThrow('빠져');
  expect(() => resolveMarketTimeLimitSeconds(null, true)).toThrow('빠져');
  expect(resolveMarketTimeLimitSeconds(MARKET_QUEST_TIME_POLICY.minimumSeconds, true)).toBe(180);
  expect(resolveMarketTimeLimitSeconds(MARKET_QUEST_TIME_POLICY.maximumSeconds, true)).toBe(600);
});

test('local expiry preserves the cart, records a distinct cause and blocks later purchase actions', () => {
  const session = createMarketSession(); session.cart = { milk: 1 };
  let now = 1000000;
  const clock = new MarketQuestClock(180, () => now, () => now);
  clock.start(); now += 180000;
  const expired = applyMarketAction(session, { type: 'expireTimeLimit', timing: clock.freeze() });
  expect(expired).toMatchObject({ phase: 'finished', outcome: 'time-limit-expired', cart: { milk: 1 } });
  expect(expired.events.at(-1)?.payload).toMatchObject({ reason: 'time_limit_expired', timing: { expired: true } });
  const rejected = applyMarketAction(expired, { type: 'add', productId: 'milk' });
  expect(rejected.cart).toEqual(expired.cart);
  expect(rejected.lastActionError).toBeTruthy();
  expect(expired.events.some(event => event.type.includes('checkout_submitted'))).toBe(false);
});
