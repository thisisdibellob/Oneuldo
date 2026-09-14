import {
  createMarketEpisodeStore, MARKET_EPISODE_STORAGE_KEY, MARKET_EPISODE_STORAGE_MAX_BYTES,
  type MarketEpisodeStorage,
} from '../src/game/marketEpisodeStore';
import { applyMarketAction, createMarketSession, exportMarketEpisode } from '../src/game/marketSession';

function episode(id: string) {
  return exportMarketEpisode(applyMarketAction(createMarketSession({ sessionId: id }), { type: 'giveUp' }));
}
function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: jest.fn((key: string) => values.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => { values.set(key, value); }) };
}

it('최근 20회만 브라우저에 저장하고 재시작 후 같은 기록을 읽는다', () => {
  const storage = memoryStorage(), store = createMarketEpisodeStore(() => storage);
  for (let index = 0; index < 25; index++) expect(store.save(episode('run-' + index)).persisted).toBe(true);
  const saved = store.list();
  expect(saved).toHaveLength(20); expect(saved[0].sessionId).toBe('run-24'); expect(saved[19].sessionId).toBe('run-5');
  expect(createMarketEpisodeStore(() => storage).list()).toEqual(saved);
  expect(storage.values.get(MARKET_EPISODE_STORAGE_KEY)!.length * 2).toBeLessThanOrEqual(MARKET_EPISODE_STORAGE_MAX_BYTES);
});

it('같은 게임의 별점 갱신은 중복 저장하지 않고 외부 변경에서 기록을 보호한다', () => {
  const storage = memoryStorage(), store = createMarketEpisodeStore(() => storage), original = episode('once');
  store.save(original); original.attempts = 99;
  expect(store.list()[0].attempts).toBe(0);
  const updated = episode('once'); updated.ratings = { difficulty: 2, interest: 4 }; store.save(updated);
  expect(store.list()).toHaveLength(1); expect(store.list()[0].ratings).toEqual(updated.ratings);
  const listed = store.list(); listed[0].ratings = null;
  expect(store.list()[0].ratings).toEqual(updated.ratings);
});

it('네이티브·저장 거부·용량 초과에서는 게임을 막지 않고 메모리에 보관한다', () => {
  const unavailable = createMarketEpisodeStore(() => null);
  expect(unavailable.save(episode('native'))).toEqual({ storage: 'memory', persisted: false, reason: 'unavailable' });
  expect(unavailable.list()[0].sessionId).toBe('native');
  const denied: MarketEpisodeStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
  const store = createMarketEpisodeStore(() => denied);
  expect(store.save(episode('denied')).reason).toBe('quota-or-denied'); expect(store.list()[0].sessionId).toBe('denied');
  const storage = memoryStorage(), largeStore = createMarketEpisodeStore(() => storage), huge = episode('huge');
  huge.config.provenance.notes = 'x'.repeat(MARKET_EPISODE_STORAGE_MAX_BYTES);
  expect(largeStore.save(huge)).toEqual({ storage: 'memory', persisted: false, reason: 'too-large' });
  expect(storage.setItem).not.toHaveBeenCalled(); expect(largeStore.list()[0].sessionId).toBe('huge');
});

it('5MB 한도에 걸리면 오래된 기록부터 브라우저 캐시에서 제외한다', () => {
  const storage = memoryStorage(), store = createMarketEpisodeStore(() => storage);
  for (let index = 0; index < 3; index++) {
    const item = episode('large-' + index); item.config.provenance.notes = 'x'.repeat(1_000_000); store.save(item);
  }
  expect(store.list()).toHaveLength(3);
  const persisted = createMarketEpisodeStore(() => storage).list();
  expect(persisted.length).toBeLessThan(3); expect(persisted[0].sessionId).toBe('large-2');
  expect(storage.values.get(MARKET_EPISODE_STORAGE_KEY)!.length * 2).toBeLessThanOrEqual(MARKET_EPISODE_STORAGE_MAX_BYTES);
});

it('손상된 캐시·잘못된 스키마는 무시하고 다음 완료 기록을 정상 저장한다', () => {
  const storage = memoryStorage(); storage.values.set(MARKET_EPISODE_STORAGE_KEY, '{bad json');
  const store = createMarketEpisodeStore(() => storage); expect(store.list()).toEqual([]);
  expect(store.save(episode('new')).persisted).toBe(true);
  const invalid = episode('invalid'); (invalid as { outcome: string | null }).outcome = null;
  expect(() => store.save(invalid)).toThrow(); expect(store.list()).toHaveLength(1);
});
