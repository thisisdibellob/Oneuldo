import { createMarketLayoutStore, MAX_SAVED_MARKET_LAYOUTS, normalizeMarketLayoutName } from '../src/game/marketLayoutStore';
import { createBrowserMarketLayoutStorage, MARKET_LAYOUT_STORAGE_KEY, type MarketLayoutLockManager } from '../src/game/marketLayoutStorage.web';
import { createFileMarketLayoutStorage, type MarketLayoutFileIO } from '../src/game/marketLayoutStorage.file';
import type { MarketLayoutStorage } from '../src/game/marketLayoutStorage.types';
import type { MarketTilemapV1 } from '../src/game/marketTilemap';

const tilemap: MarketTilemapV1 = {
  format: 'oneuldo.market-layout', version: 1, layoutId: 'classic', cellSize: 20,
  shelves: ['produce', 'fresh', 'household', 'meal', 'drink'].map((categoryId, index) => ({
    categoryId: categoryId as MarketTilemapV1['shelves'][number]['categoryId'], col: 10 + index * 8, row: 15, orientation: 'horizontal',
  })),
  people: [{ id: 'employee-1', kind: 'employee', col: 12, row: 30, appearance: 0 }],
};
const cloneMap = () => JSON.parse(JSON.stringify(tilemap)) as MarketTilemapV1;
function harness() {
  let contents: string | null = null, sequence = 0;
  let time = '2026-10-17T03:00:00.000Z';
  const storage: MarketLayoutStorage = {
    read: jest.fn(async () => contents),
    write: jest.fn(async value => { contents = value; }),
  };
  const makeStore = () => createMarketLayoutStore({ storage, now: () => time, createId: () => `layout-${++sequence}` });
  return { storage, makeStore, store: makeStore(), raw: () => contents,
    setRaw: (value: string | null) => { contents = value; }, setTime: (value: string) => { time = value; } };
}

describe('market layout library', () => {
  it('restores named layouts after creating a fresh store, keeping all map fields and zero customers', async () => {
    const { store, makeStore, raw } = harness();
    expect(await store.list()).toEqual([]);
    const saved = await store.save({ name: '  우리 동네 마트  ', tilemap });
    expect(saved).toMatchObject({ name: '우리 동네 마트', id: 'layout-1', tilemap });
    expect(await makeStore().list()).toEqual([saved]);
    expect(JSON.parse(raw()!)).toMatchObject({ format: 'oneuldo.market-layout-library', version: 1, entries: [saved] });
  });

  it('duplicates independently and updates one layout without changing the source or caller-owned data', async () => {
    const { store, setTime } = harness();
    const source = cloneMap();
    const saving = store.save({ name: '첫 배치', tilemap: source });
    source.people[0].col = 40;
    const saved = await saving;
    saved.tilemap.people[0].col = 41;
    const duplicate = await store.duplicate(saved.id);
    expect(duplicate.name).toBe('첫 배치 복사본');
    expect(duplicate.tilemap.people[0].col).toBe(tilemap.people[0].col);
    duplicate.tilemap.people[0].col = 25;
    setTime('2026-10-17T04:00:00.000Z');
    await store.save({ ...duplicate });
    const entries = await store.list();
    expect(entries.find(entry => entry.id === saved.id)!.tilemap.people[0].col).toBe(tilemap.people[0].col);
    expect(entries.find(entry => entry.id === duplicate.id)!).toMatchObject({ createdAt: '2026-10-17T03:00:00.000Z', updatedAt: '2026-10-17T04:00:00.000Z' });
    entries[0].tilemap.shelves[0].col = 55;
    expect((await store.list())[0].tilemap.shelves[0].col).toBe(tilemap.shelves[0].col);
  });

  it('renames and removes durably, rejecting unknown IDs instead of creating replacements', async () => {
    const { store, makeStore, setTime } = harness();
    const entry = await store.save({ name: '배치', tilemap });
    setTime('2026-10-17T05:00:00.000Z');
    expect(await store.rename(entry.id, '  넓은 통로  ')).toMatchObject({ name: '넓은 통로', updatedAt: '2026-10-17T05:00:00.000Z' });
    expect((await makeStore().list())[0].name).toBe('넓은 통로');
    await store.remove(entry.id);
    expect(await makeStore().list()).toEqual([]);
    await expect(store.remove(entry.id)).rejects.toMatchObject({ code: 'not-found' });
    await expect(store.save({ ...entry })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('limits names by Unicode code points and rejects blank, control or oversized names', async () => {
    const { store, storage } = harness();
    expect(normalizeMarketLayoutName('가'.repeat(32))).toHaveLength(32);
    expect(Array.from(normalizeMarketLayoutName('🛒'.repeat(32)))).toHaveLength(32);
    for (const name of ['', ' \n ', '가'.repeat(33), '앞\n뒤', '앞\u0000뒤']) {
      await expect(store.save({ name, tilemap })).rejects.toMatchObject({ code: 'invalid-name' });
    }
    expect(storage.write).not.toHaveBeenCalled();
    const long = await store.save({ name: '가'.repeat(32), tilemap });
    expect(Array.from((await store.duplicate(long.id)).name)).toHaveLength(32);
  });

  it('enforces the 24-entry limit for create/duplicate but permits replacement and rename', async () => {
    const { store, makeStore } = harness();
    const entries = await Promise.all(Array.from({ length: MAX_SAVED_MARKET_LAYOUTS }, (_, index) => store.save({ name: `배치 ${index + 1}`, tilemap })));
    await expect(store.save({ name: '초과', tilemap })).rejects.toMatchObject({ code: 'limit' });
    await expect(store.duplicate(entries[0].id)).rejects.toMatchObject({ code: 'limit' });
    await store.save({ ...entries[0], name: '수정' });
    await store.rename(entries[1].id, '이름 수정');
    expect(await makeStore().list()).toHaveLength(24);
    await store.remove(entries[0].id);
    await store.save({ name: '빈 자리', tilemap });
    expect(await makeStore().list()).toHaveLength(24);
  });

  it('rejects invalid map schemas without changing the durable snapshot', async () => {
    const { store, raw } = harness();
    await store.save({ name: '정상 배치', tilemap });
    const before = raw();
    await expect(store.save({ name: '잘못된 배치', tilemap: { ...tilemap, version: 2 } as unknown as MarketTilemapV1 })).rejects.toMatchObject({ code: 'invalid-map' });
    expect(raw()).toBe(before);
  });

  it.each(['{broken', '', 'null', '{"format":"oneuldo.market-layout-library","version":2,"entries":[]}',
    '{"format":"oneuldo.market-layout-library","version":1,"entries":[],"unknown":true}'])('keeps corrupt/unsupported content intact: %s', async contents => {
    const { store, setRaw, raw, storage } = harness();
    setRaw(contents);
    await expect(store.list()).rejects.toMatchObject({ code: 'corrupt-store' });
    await expect(store.save({ name: '새 배치', tilemap })).rejects.toMatchObject({ code: 'corrupt-store' });
    await expect(store.remove('anything')).rejects.toMatchObject({ code: 'corrupt-store' });
    expect(raw()).toBe(contents);
    expect(storage.write).not.toHaveBeenCalled();
  });

  it('does not silently drop corrupt entries or accept duplicate IDs and invalid timestamps', async () => {
    const { store, setRaw, raw } = harness();
    const entry = await store.save({ name: '정상', tilemap });
    const envelope = JSON.parse(raw()!);
    for (const entries of [[entry, entry], [{ ...entry, name: ' ' }], [{ ...entry, updatedAt: 'yesterday' }],
      [{ ...entry, tilemap: { ...tilemap, people: [] } }]]) {
      setRaw(JSON.stringify({ ...envelope, entries }));
      await expect(store.list()).rejects.toMatchObject({ code: 'corrupt-store' });
    }
  });

  it('reports read/write failure and allows retry without reporting an unsaved change as saved', async () => {
    const { store, storage, raw, makeStore } = harness();
    const saved = await store.save({ name: '보존', tilemap });
    const before = raw();
    (storage.read as jest.Mock).mockRejectedValueOnce(new Error('access denied'));
    await expect(store.rename(saved.id, '실패')).rejects.toMatchObject({ code: 'read-failed' });
    (storage.write as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await expect(store.remove(saved.id)).rejects.toMatchObject({ code: 'write-failed' });
    expect(raw()).toBe(before);
    expect(await makeStore().list()).toEqual([saved]);
    await expect(store.rename(saved.id, '재시도 성공')).resolves.toMatchObject({ name: '재시도 성공' });
  });

  it('waits for durable writes and serializes overlapping save actions', async () => {
    const { store, storage, makeStore } = harness();
    let release!: () => void;
    const actualWrite = storage.write;
    storage.write = jest.fn(async contents => {
      await new Promise<void>(resolve => { release = resolve; });
      await actualWrite(contents);
    });
    const success = jest.fn();
    const saving = store.save({ name: '첫 저장', tilemap }).then(success);
    for (let tick = 0; tick < 5; tick++) await Promise.resolve();
    expect(success).not.toHaveBeenCalled();
    storage.write = actualWrite;
    const second = store.save({ name: '다음 저장', tilemap });
    release();
    await Promise.all([saving, second]);
    expect(success).toHaveBeenCalledTimes(1);
    expect((await makeStore().list()).map(entry => entry.name)).toEqual(['다음 저장', '첫 저장']);
  });

  it('preserves a readable store when a device clock moves backwards', async () => {
    const { store, setTime } = harness();
    const entry = await store.save({ name: '배치', tilemap });
    setTime('2020-01-01T00:00:00.000Z');
    await store.rename(entry.id, '다른 이름');
    expect((await store.list())[0].updatedAt).toBe(entry.createdAt);
  });
});

describe('browser persistent storage', () => {
  function sharedLocks(): MarketLayoutLockManager {
    const pending = new Map<string, Promise<unknown>>();
    return {
      request<T>(name: string, work: () => Promise<T>): Promise<T> {
        const before = pending.get(name) ?? Promise.resolve();
        const next = before.then(work, work);
        pending.set(name, next.then(() => undefined, () => undefined));
        return next;
      },
    };
  }
  it('round-trips through separate adapters and does not use an in-memory fallback', async () => {
    const values = new Map<string, string>();
    const browser = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const locks = sharedLocks();
    const first = createMarketLayoutStore({ storage: createBrowserMarketLayoutStorage(() => browser, () => locks) });
    const saved = await first.save({ name: '웹 배치', tilemap });
    expect(values.has(MARKET_LAYOUT_STORAGE_KEY)).toBe(true);
    const reopened = createMarketLayoutStore({ storage: createBrowserMarketLayoutStorage(() => browser, () => locks) });
    expect(await reopened.list()).toEqual([saved]);
    const unavailable = createMarketLayoutStore({ storage: createBrowserMarketLayoutStorage(() => undefined, () => locks) });
    await expect(unavailable.list()).rejects.toMatchObject({ code: 'storage-unavailable' });
    await expect(unavailable.save({ name: '실패', tilemap })).rejects.toMatchObject({ code: 'storage-unavailable' });
  });

  it('reports blocked localStorage reads and quota errors without resetting existing data', async () => {
    const blocked = createMarketLayoutStore({ storage: createBrowserMarketLayoutStorage(() => { throw new Error('security'); }) });
    await expect(blocked.list()).rejects.toMatchObject({ code: 'read-failed' });
    const locks = sharedLocks();
    const full = createMarketLayoutStore({ storage: createBrowserMarketLayoutStorage(() => ({ getItem: () => null, setItem: () => { throw new Error('quota'); } }), () => locks) });
    await expect(full.save({ name: '공간 없음', tilemap })).rejects.toMatchObject({ code: 'write-failed' });
  });

  it('locks the whole read/modify/write transaction across independent browser contexts', async () => {
    const values = new Map<string, string>();
    const browser = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const locks = sharedLocks();
    const firstTab = createMarketLayoutStore({ storage: createBrowserMarketLayoutStorage(() => browser, () => locks), createId: () => 'first-tab' });
    const secondTab = createMarketLayoutStore({ storage: createBrowserMarketLayoutStorage(() => browser, () => locks), createId: () => 'second-tab' });
    const [a, b] = await Promise.all([
      firstTab.save({ name: '첫 번째 창', tilemap }), secondTab.save({ name: '두 번째 창', tilemap }),
    ]);
    expect((await firstTab.list()).map(entry => entry.id).sort()).toEqual([a.id, b.id].sort());
    await Promise.all([firstTab.rename(a.id, '첫 번째 수정'), secondTab.remove(b.id)]);
    expect(await firstTab.list()).toEqual([expect.objectContaining({ id: a.id, name: '첫 번째 수정' })]);
  });

  it('allows existing read access but refuses writes when cross-tab locking is unavailable', async () => {
    const { store, raw } = harness();
    const entry = await store.save({ name: '기존 배치', tilemap });
    const write = jest.fn();
    const browser = createMarketLayoutStore({ storage: createBrowserMarketLayoutStorage(() => ({ getItem: () => raw(), setItem: write }), () => undefined) });
    expect(await browser.list()).toEqual([entry]);
    await expect(browser.rename(entry.id, '쓰지 않음')).rejects.toMatchObject({ code: 'storage-unavailable' });
    expect(write).not.toHaveBeenCalled();
  });
});

describe('native file snapshot persistence', () => {
  function files() {
    const data = new Map<string, string>();
    const io: MarketLayoutFileIO = {
      list: jest.fn(async () => [...data.keys()]),
      read: jest.fn(async name => { if (!data.has(name)) throw new Error('missing'); return data.get(name)!; }),
      write: jest.fn(async (name, contents) => { data.set(name, contents); }),
      move: jest.fn(async (from, to) => {
        if (data.has(to) || !data.has(from)) throw new Error('move failed');
        data.set(to, data.get(from)!); data.delete(from);
      }),
      remove: jest.fn(async name => { data.delete(name); }),
    };
    return { data, io, makeStore: () => createMarketLayoutStore({ storage: createFileMarketLayoutStorage(io) }) };
  }

  it('reopens from committed snapshots and retains only two generations after repeated saves', async () => {
    const { data, makeStore } = files();
    const first = makeStore();
    const saved = await first.save({ name: '휴대폰 배치', tilemap });
    expect(await makeStore().list()).toEqual([saved]);
    await first.rename(saved.id, '두 번째');
    await first.rename(saved.id, '세 번째');
    expect([...data.keys()].filter(name => name.endsWith('.json'))).toHaveLength(2);
    expect((await makeStore().list())[0].name).toBe('세 번째');
  });

  it('keeps the prior committed snapshot on partial writes or failed moves', async () => {
    const { data, io, makeStore } = files();
    const store = makeStore();
    const entry = await store.save({ name: '원본', tilemap });
    (io.write as jest.Mock).mockImplementationOnce(async (name: string) => { data.set(name, 'partial'); throw new Error('disk full'); });
    await expect(store.rename(entry.id, '불완전')).rejects.toMatchObject({ code: 'write-failed' });
    expect(await makeStore().list()).toEqual([entry]);
    (io.move as jest.Mock).mockRejectedValueOnce(new Error('interrupted rename'));
    await expect(store.remove(entry.id)).rejects.toMatchObject({ code: 'write-failed' });
    expect(await makeStore().list()).toEqual([entry]);
  });

  it('ignores uncommitted temporary files, but never silently falls back from a corrupt committed snapshot', async () => {
    const { data, io, makeStore } = files();
    const store = makeStore();
    await store.save({ name: '이전 정상', tilemap });
    data.set('pending-interrupted.tmp', '{incomplete');
    expect(await makeStore().list()).toHaveLength(1);
    data.set('snapshot-0000000000000002.json', '{broken');
    await expect(makeStore().list()).rejects.toMatchObject({ code: 'corrupt-store' });
    const writes = (io.write as jest.Mock).mock.calls.length;
    await expect(store.save({ name: '덮어쓰기 금지', tilemap })).rejects.toMatchObject({ code: 'corrupt-store' });
    expect(io.write).toHaveBeenCalledTimes(writes);
    expect(data.get('snapshot-0000000000000002.json')).toBe('{broken');
  });

  it('reports unreadable file or directory errors instead of treating them as empty', async () => {
    const { io, makeStore } = files();
    await makeStore().save({ name: '보존', tilemap });
    (io.read as jest.Mock).mockRejectedValueOnce(new Error('cannot read'));
    await expect(makeStore().list()).rejects.toMatchObject({ code: 'read-failed' });
    (io.list as jest.Mock).mockRejectedValueOnce(new Error('cannot list directory'));
    await expect(makeStore().save({ name: '접근 실패', tilemap })).rejects.toMatchObject({ code: 'read-failed' });
  });
});
