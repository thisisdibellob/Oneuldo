import {
  BUS_EPISODE_HISTORY_LIMIT, BUS_EPISODE_STORAGE_KEY, BUS_EPISODE_STORAGE_MAX_BYTES,
  createBusEpisodeStore, type BusEpisodeStorage,
} from '../src/game/busEpisodeStore';
import { createBusSession, getBusResult, reduceBusSession, type BusAction, type BusSession } from '../src/game/busSession';

function completed(id = 'commute'): BusSession {
  const actions: BusAction[] = [
    { type: 'OPEN_ROUTE' }, { type: 'PACK_CARD' }, { type: 'GO_TO_STOP' }, { type: 'ARRIVE_VEHICLE', route: '201' },
    { type: 'BOARD' }, { type: 'TAP_BOARDING_CARD' }, { type: 'TAKE_SEAT' }, { type: 'DEPART' },
    { type: 'REACH_NEXT_STOP', expectedStop: 'park' }, { type: 'REQUEST_STOP' }, { type: 'REACH_NEXT_STOP', expectedStop: 'library' },
    { type: 'STAND_UP' }, { type: 'TAP_ALIGHTING_CARD' }, { type: 'ALIGHT' }, { type: 'CROSS_ROAD' }, { type: 'REPORT_ARRIVAL', at: 500 },
  ];
  return actions.reduce(reduceBusSession, createBusSession({ id, startedAt: 100 }));
}
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn((key: string) => values.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => { values.set(key, value); }),
  };
}

it('preserves the completed trip and its rating separately from library, shopping and AI records', () => {
  const storage = memoryStorage();
  storage.setItem('oneuldo.library.episodes.v1', 'library-record');
  storage.setItem('oneuldo.market.episodes.v1', 'market-record');
  const store = createBusEpisodeStore(() => storage);
  const session = completed();
  expect(store.save(session)).toEqual({ storage: 'browser', persisted: true, duplicate: false });
  expect(store.list()).toEqual([{ schema: 'oneuldo.bus.episode', version: 1, sessionId: session.id, startedAt: 100,
    session, result: getBusResult(session), userRating: null }]);
  expect(store.rate(session.id, 4)).toMatchObject({ updated: true, persisted: true });
  const reopened = createBusEpisodeStore(() => storage);
  expect(reopened.list()[0]).toMatchObject({ session, userRating: 4 });
  expect(storage.getItem('oneuldo.library.episodes.v1')).toBe('library-record');
  expect(storage.getItem('oneuldo.market.episodes.v1')).toBe('market-record');
});

it('does not save a completion effect twice or overwrite an existing rating', () => {
  const storage = memoryStorage();
  const store = createBusEpisodeStore(() => storage);
  const session = completed();
  store.save(session);
  expect(store.save(session).duplicate).toBe(true);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  store.rate(session.id, 5);
  expect(store.save(session).duplicate).toBe(true);
  expect(createBusEpisodeStore(() => storage).save(session).duplicate).toBe(true);
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect(store.list()[0].userRating).toBe(5);
});

it('rejects unfinished and forged completion states without a real card-approved trip and arrival report', () => {
  const store = createBusEpisodeStore(() => null);
  expect(() => store.save(createBusSession())).toThrow('출근 보고');
  const session = completed();
  for (const invalid of [
    { ...session, phase: 'arrived' as const },
    { ...session, events: [] },
    { ...session, direction: 'outbound' as const },
    { ...session, completedAt: 0 },
    { ...session, cardPacked: false },
    { ...session, events: session.events.map(event => event.type === 'boarding_card_approved' ? { ...event, type: 'fake' } : event) },
    { ...session, events: session.events.map(event => event.type === 'departed' ? { ...event, type: 'fake' } : event) },
    { ...session, events: session.events.map(event => event.type === 'alighted' ? { ...event, payload: { ...event.payload, stop: 'park' } } : event) },
  ]) expect(() => store.save(invalid)).toThrow('출근 보고');
  expect(store.list()).toEqual([]);
});

it('returns independent snapshots and recalculates a stored result instead of trusting cached totals', () => {
  const storage = memoryStorage();
  const store = createBusEpisodeStore(() => storage);
  const game = completed();
  store.save(game);
  game.events[0].payload.stop = 'tampered';
  const records = store.list();
  expect(records[0].session.events[0].payload.stop).toBe('village');
  records[0].result.rides = 999;
  expect(store.list()[0].result.rides).toBe(1);
  storage.setItem(BUS_EPISODE_STORAGE_KEY, JSON.stringify({ version: 1, episodes: [records[0], records[0]] }));
  const restored = createBusEpisodeStore(() => storage).list();
  expect(restored).toHaveLength(1);
  expect(restored[0].result.rides).toBe(1);
});

it('keeps the most recent twenty sessions', () => {
  const storage = memoryStorage();
  const store = createBusEpisodeStore(() => storage);
  for (let index = 0; index < BUS_EPISODE_HISTORY_LIMIT + 3; index++) store.save(completed(`trip-${index}`));
  const records = store.list();
  expect(records).toHaveLength(20);
  expect(records[0].sessionId).toBe('trip-22');
  expect(records.at(-1)?.sessionId).toBe('trip-3');
  expect(createBusEpisodeStore(() => storage).list()).toEqual(records);
});

it('reports memory-only native/blocked storage honestly while retaining the current result', () => {
  const native = createBusEpisodeStore(() => null);
  expect(native.save(completed())).toEqual({ storage: 'memory', persisted: false, duplicate: false, reason: 'unavailable' });
  expect(native.list()).toHaveLength(1);
  expect(native.rate('commute', 3)).toMatchObject({ updated: true, storage: 'memory', persisted: false });
  const throwingProvider = createBusEpisodeStore(() => { throw new Error('denied'); });
  expect(throwingProvider.save(completed()).reason).toBe('unavailable');
  const denied: BusEpisodeStorage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  expect(createBusEpisodeStore(() => denied).save(completed())).toMatchObject({ persisted: false, reason: 'quota-or-denied' });
});

it.each(['not-json', '{"version":2,"episodes":[]}', '{"version":1,"episodes":[null,{"schema":"oneuldo.bus.episode","version":1,"session":{"phase":"completed"}}]}'])
('ignores malformed cache and still stores a new legitimate trip: %s', raw => {
  const storage = memoryStorage();
  storage.setItem(BUS_EPISODE_STORAGE_KEY, raw);
  const store = createBusEpisodeStore(() => storage);
  expect(store.list()).toEqual([]);
  expect(store.save(completed()).persisted).toBe(true);
  expect(createBusEpisodeStore(() => storage).list()).toHaveLength(1);
});

it('bounds cache parsing and oversized writes without discarding the in-memory result', () => {
  const storage = memoryStorage();
  storage.setItem(BUS_EPISODE_STORAGE_KEY, 'x'.repeat(BUS_EPISODE_STORAGE_MAX_BYTES));
  const store = createBusEpisodeStore(() => storage);
  expect(store.list()).toEqual([]);
  const game = completed();
  game.events[0].payload.detail = 'x'.repeat(BUS_EPISODE_STORAGE_MAX_BYTES);
  expect(store.save(game)).toEqual({ storage: 'memory', persisted: false, duplicate: false, reason: 'too-large' });
  expect(store.list()).toHaveLength(1);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
});

it.each([0, 6, -1, 2.5, NaN, Infinity])('rejects invalid satisfaction rating %s', rating => {
  const storage = memoryStorage();
  const store = createBusEpisodeStore(() => storage);
  store.save(completed());
  expect(store.rate('commute', rating)).toEqual({ updated: false });
  expect(store.list()[0].userRating).toBeNull();
  expect(storage.setItem).toHaveBeenCalledTimes(1);
});

it('never creates a completed trip merely because a rating is submitted', () => {
  const store = createBusEpisodeStore(() => null);
  expect(store.rate('missing', 4)).toEqual({ updated: false });
  expect(store.list()).toEqual([]);
});

function completedReturn(id = 'return', fromTerminal = false): BusSession {
  const session = createBusSession({ id, startedAt: 100, destination: 'village',
    stop: fromTerminal ? 'neuti' : 'library', direction: fromTerminal ? 'outbound' : 'inbound' });
  const actions: BusAction[] = [
    { type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' }, { type: 'TAP_BOARDING_CARD' }, { type: 'TAKE_SEAT' }, { type: 'DEPART' },
    ...(!fromTerminal ? [{ type: 'REACH_NEXT_STOP', expectedStop: 'park' } as const] : []),
    { type: 'REQUEST_STOP' }, { type: 'REACH_NEXT_STOP', expectedStop: 'village' }, { type: 'STAND_UP' },
    { type: 'TAP_ALIGHTING_CARD' }, { type: 'ALIGHT' }, { type: 'COMPLETE_JOURNEY', at: 500 },
  ];
  return actions.reduce(reduceBusSession, session);
}

it('stores the outward commute and homebound journey separately with destination-specific facts', () => {
  const storage = memoryStorage();
  const store = createBusEpisodeStore(() => storage);
  const outward = completed('outward');
  const homebound = completedReturn('homebound');
  expect(store.save(outward).persisted).toBe(true);
  expect(store.save(homebound).persisted).toBe(true);
  const records = createBusEpisodeStore(() => storage).list();
  expect(records).toHaveLength(2);
  expect(records[0]).toMatchObject({ sessionId: 'homebound', session: { destination: 'village' }, result: { destination: 'village', completed: true } });
  expect(records[1]).toMatchObject({ sessionId: 'outward', session: { destination: 'library' }, result: { destination: 'library', completed: true } });
  expect(records[0].result.facts.join(' ')).not.toContain('출근');
  expect(records[0].session.events.at(-1)?.type).toBe('journey_completed');
  expect(store.rate('homebound', 4).updated).toBe(true);
  expect(store.list()[1].userRating).toBeNull();
});

it('accepts a real homebound alighting on either sidewalk without inventing a library report', () => {
  const store = createBusEpisodeStore(() => null);
  const north = completedReturn('north');
  const south = completedReturn('south', true);
  expect(north.direction).toBe('inbound'); expect(south.direction).toBe('outbound');
  store.save(north); store.save(south);
  expect(store.list()).toHaveLength(2);
  expect(store.list().every(item => item.session.events.at(-1)?.type === 'journey_completed')).toBe(true);
  const forged = { ...south, events: south.events.map(event => event.type === 'journey_completed' ? { ...event, type: 'arrival_reported' } : event) };
  expect(() => store.save(forged)).toThrow('귀환');
});

it('migrates original fixed-library v1 history without changing its prior events or rating', () => {
  const storage = memoryStorage();
  const store = createBusEpisodeStore(() => storage);
  store.save(completed('old-v1')); store.rate('old-v1', 3);
  const envelope = JSON.parse(storage.getItem(BUS_EPISODE_STORAGE_KEY)!);
  delete envelope.episodes[0].session.destination;
  delete envelope.episodes[0].result.destination;
  for (const event of envelope.episodes[0].session.events) delete event.payload.destination;
  storage.setItem(BUS_EPISODE_STORAGE_KEY, JSON.stringify(envelope));
  const restored = createBusEpisodeStore(() => storage).list();
  expect(restored).toHaveLength(1);
  expect(restored[0]).toMatchObject({ sessionId: 'old-v1', userRating: 3, session: { destination: 'library' }, result: { destination: 'library', rides: 1 } });
  expect(restored[0].session.events).toEqual(envelope.episodes[0].session.events);
});

it('rejects unknown destinations rather than treating them as legacy library records', () => {
  const storage = memoryStorage();
  const store = createBusEpisodeStore(() => storage);
  store.save(completed());
  const envelope = JSON.parse(storage.getItem(BUS_EPISODE_STORAGE_KEY)!);
  envelope.episodes[0].session.destination = 'gym';
  storage.setItem(BUS_EPISODE_STORAGE_KEY, JSON.stringify(envelope));
  expect(createBusEpisodeStore(() => storage).list()).toEqual([]);
});
