import {
  createLibraryEpisodeStore,
  LIBRARY_EPISODE_HISTORY_LIMIT,
  LIBRARY_EPISODE_STORAGE_KEY,
  LIBRARY_EPISODE_STORAGE_MAX_BYTES,
  type LibraryEpisodeStorage,
} from '../src/game/libraryEpisodeStore';
import { applyLibraryAction, createLibrarySession, getLibraryBook, getLibraryProgress, getLibraryResult, type LibrarySession, type LibraryGameConfig } from '../src/game/librarySession';

function completed(sessionId = 'complete', resolution: 'guided' | 'referred' = 'referred', config:Partial<LibraryGameConfig> = {}): LibrarySession {
  let game = createLibrarySession({ requestMode: 'find', ...config, seed: 'store-tests', sessionId, startedAt: 500 });
  game = applyLibraryAction(game, { type: 'acceptTask' });
  game = applyLibraryAction(game, { type: 'collectAll' });
  for (const book of game.books) {
    if (book.location === 'return-cart') game = applyLibraryAction(game, { type: 'collectBook', bookId: book.bookId });
    if (book.damagedLabel) {
      game = applyLibraryAction(game, { type: 'inspectBook', bookId: book.bookId });
      game = applyLibraryAction(game, { type: 'askLibrarian', bookId: book.bookId });
      game = applyLibraryAction(game, { type: 'handoffBook', bookId: book.bookId });
    } else game = applyLibraryAction(game, { type: 'placeBook', bookId: book.bookId, shelfId: getLibraryBook(book.bookId)!.categoryId });
  }
  for (const visitor of game.visitors) {
    const visitorId = visitor.id;
    game = applyLibraryAction(game, { type: 'talkVisitor', visitorId });
    if (resolution === 'guided') {
      const shelfId = getLibraryBook(visitor.bookId)!.categoryId;
      game = applyLibraryAction(game, { type: 'lookupVisitor', visitorId });
      if (visitor.requestType === 'find') {
        game = applyLibraryAction(game, { type: 'guideVisitor', visitorId, shelfId });
        expect(game.visitors.find(item=>item.id===visitorId)?.status).toBe('escorting');
        game = applyLibraryAction(game, { type: 'finishVisitorGuide', visitorId, shelfId });
      } else {
        game = applyLibraryAction(game, { type: 'acceptVisitorBook', visitorId });
        game = applyLibraryAction(game, { type: 'placeBook',bookId:visitor.bookId,shelfId });
        game = applyLibraryAction(game, { type: 'finishVisitorShelving',visitorId });
      }
    } else game = applyLibraryAction(game, { type: 'referVisitor',visitorId });
  }
  const progress = getLibraryProgress(game);
  game = applyLibraryAction(game, { type: 'report', shelvedCount: progress.correctlyShelved, handedOffCount: progress.handedOff });
  expect(game.phase).toBe('finished');
  return game;
}

function legacyEpisode(game:LibrarySession) {
  const {config, visitors, ...session} = game;
  const {id,requestType,...visitor} = visitors[0];
  return {schema:'oneuldo.library.episode',version:1,sessionId:game.sessionId,startedAt:game.startedAt,userRating:4,
    session:{...session,visitor,books:session.books.map(({source,visitorId,...book})=>book)},result:{total:999}};
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn((key: string) => values.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => { values.set(key, value); }),
  };
}

it('restores an escorted result and its arrival event without changing the version-one record shape', () => {
  const storage = memoryStorage();
  const game = completed('guided-arrival','guided');
  const store = createLibraryEpisodeStore(()=>storage);
  expect(store.save(game).persisted).toBe(true);
  const [restored] = createLibraryEpisodeStore(()=>storage).list();
  expect(restored.version).toBe(1);
  expect(restored.session).toEqual(game);
  expect(restored.result).toMatchObject({visitorResolution:'guided',visitorLookupUsed:true,visitorWrongAttempts:0});
  expect(restored.session.events.filter(event=>event.type==='visitor_guide_completed')).toHaveLength(1);
  const notArrived: LibrarySession = {...game,phase:'working',visitors:[{...game.visitors[0],status:'escorting',resolution:null}]};
  expect(()=>store.save(notArrived)).toThrow('완료된');
  expect(()=>store.save({...notArrived,phase:'finished'})).toThrow('완료된');
});

it('continues accepting old completed guided records without an escort-arrival event', () => {
  const storage = memoryStorage();
  const legacy = completed('legacy-guided','guided');
  legacy.events = legacy.events.filter(event=>event.type!=='visitor_guide_completed');
  storage.setItem(LIBRARY_EPISODE_STORAGE_KEY,JSON.stringify({version:1,episodes:[legacyEpisode(legacy)]}));
  const [restored] = createLibraryEpisodeStore(()=>storage).list();
  expect(restored.result.visitorResolution).toBe('guided');
  expect(restored.session.config).toEqual({visitorCount:1,requestMode:'find',bookCount:12,damagedBookCount:1});
  expect(restored.session.visitors).toEqual(legacy.visitors);
  expect(restored.session.books.every(book=>book.source==='cart')).toBe(true);
  expect(restored.userRating).toBe(4);
});

it('restores an existing six-book episode alongside a new twelve-book episode', () => {
  const storage = memoryStorage();
  const legacy = completed('legacy-six','referred',{bookCount:6});
  legacy.events = [];
  storage.setItem(LIBRARY_EPISODE_STORAGE_KEY,JSON.stringify({version:1,episodes:[legacyEpisode(legacy)]}));
  const store = createLibraryEpisodeStore(() => storage);
  expect(store.list()).toHaveLength(1);
  expect(store.save(completed('new-twelve')).persisted).toBe(true);
  const reopened = createLibraryEpisodeStore(() => storage).list();
  expect(reopened.map(episode => episode.result.total)).toEqual([12, 6]);
  expect(reopened.map(episode => episode.result.correctlyShelved)).toEqual([11, 5]);
});

it('persists a completed session, its ordered events and its result, and restores them on reopening', () => {
  const storage = memoryStorage();
  storage.setItem('unrelated', 'keep');
  const store = createLibraryEpisodeStore(() => storage);
  const game = completed();
  expect(store.save(game)).toEqual({ storage: 'browser', persisted: true, duplicate: false });
  const records = store.list();
  expect(records).toHaveLength(1);
  expect(records[0]).toEqual({ schema: 'oneuldo.library.episode', version: 1, sessionId: game.sessionId,
    startedAt: 500, session: game, result: getLibraryResult(game), userRating: null });
  expect(createLibraryEpisodeStore(() => storage).list()).toEqual(records);
  expect(storage.getItem('unrelated')).toBe('keep');
});

it('saves each session id once even if the completion effect runs again or a caller changes the object', () => {
  const storage = memoryStorage();
  const store = createLibraryEpisodeStore(() => storage);
  const game = completed('once');
  store.save(game);
  const first = store.list();
  game.reportAttempts = 99;
  expect(store.save(game)).toEqual({ storage: 'browser', persisted: true, duplicate: true });
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  expect(store.list()).toEqual(first);
  const reopened = createLibraryEpisodeStore(() => storage);
  expect(reopened.save(game).duplicate).toBe(true);
  expect(reopened.list()).toEqual(first);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
});

it('returns independent snapshots and rejects unfinished or falsely finished work', () => {
  const store = createLibraryEpisodeStore(() => null);
  const unfinished = createLibrarySession({ requestMode: 'find', seed: 'unfinished' });
  expect(() => store.save(unfinished)).toThrow('완료된');
  expect(() => store.save({ ...unfinished, phase: 'finished' })).toThrow('완료된');
  const game = completed();
  store.save(game);
  game.events[0].payload.bookCount = 999;
  const first = store.list();
  expect(first[0].session.events[0].payload.bookCount).toBe(12);
  first[0].session.events.length = 0;
  first[0].result.correctlyShelved = 999;
  const second = store.list();
  expect(second[0].session.events.length).toBeGreaterThan(0);
  expect(second[0].result.correctlyShelved).toBe(11);
});

it('keeps only the latest twenty distinct shifts in memory and browser storage', () => {
  const storage = memoryStorage();
  const store = createLibraryEpisodeStore(() => storage);
  for (let index = 0; index < LIBRARY_EPISODE_HISTORY_LIMIT + 3; index++) store.save(completed(`shift-${index}`));
  const ids = store.list().map(episode => episode.sessionId);
  expect(ids).toHaveLength(20);
  expect(ids[0]).toBe('shift-22');
  expect(ids.at(-1)).toBe('shift-3');
  expect(createLibraryEpisodeStore(() => storage).list().map(episode => episode.sessionId)).toEqual(ids);
});

it('keeps unavailable/native or denied-storage results in memory and reports that they are not persistent', () => {
  const native = createLibraryEpisodeStore(() => null);
  expect(native.save(completed())).toEqual({ storage: 'memory', persisted: false, duplicate: false, reason: 'unavailable' });
  expect(native.list()).toHaveLength(1);
  expect(native.save(completed())).toEqual({ storage: 'memory', persisted: false, duplicate: true, reason: 'unavailable' });
  const denied: LibraryEpisodeStorage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  const blocked = createLibraryEpisodeStore(() => denied);
  expect(blocked.save(completed())).toEqual({ storage: 'memory', persisted: false, duplicate: false, reason: 'quota-or-denied' });
  expect(blocked.list()).toHaveLength(1);
  const throwingProvider = createLibraryEpisodeStore(() => { throw new Error('denied'); });
  expect(throwingProvider.save(completed()).persisted).toBe(false);
  expect(throwingProvider.list()).toHaveLength(1);
});

it.each(['not-json', '{"version":2,"episodes":[]}', '{"version":1,"episodes":[null,{"schema":"oneuldo.library.episode","version":1,"session":{"phase":"finished"}}]}'])('ignores malformed cache without breaking a new result', raw => {
  const storage = memoryStorage();
  storage.setItem(LIBRARY_EPISODE_STORAGE_KEY, raw);
  const store = createLibraryEpisodeStore(() => storage);
  expect(store.list()).toEqual([]);
  expect(store.save(completed()).persisted).toBe(true);
  expect(createLibraryEpisodeStore(() => storage).list()).toHaveLength(1);
});

it('deduplicates restored rows and recomputes the display result from saved work', () => {
  const storage = memoryStorage();
  const store = createLibraryEpisodeStore(() => storage);
  store.save(completed());
  const episode = store.list()[0];
  episode.result.correctlyShelved = 999;
  storage.setItem(LIBRARY_EPISODE_STORAGE_KEY, JSON.stringify({ version: 1, episodes: [episode, episode] }));
  const restored = createLibraryEpisodeStore(() => storage).list();
  expect(restored).toHaveLength(1);
  expect(restored[0].result.correctlyShelved).toBe(11);
});

it('does not parse an oversized cache or write an oversized single record, while retaining the new result in memory', () => {
  const storage = memoryStorage();
  storage.setItem(LIBRARY_EPISODE_STORAGE_KEY, 'x'.repeat(LIBRARY_EPISODE_STORAGE_MAX_BYTES));
  const store = createLibraryEpisodeStore(() => storage);
  expect(store.list()).toEqual([]);
  const game = completed('large');
  game.events.push({ sequence: game.events.length + 1, type: 'oversized-test', payload: { detail: 'x'.repeat(LIBRARY_EPISODE_STORAGE_MAX_BYTES) } });
  expect(store.save(game)).toEqual({ storage: 'memory', persisted: false, duplicate: false, reason: 'too-large' });
  expect(store.list()).toHaveLength(1);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
});

it('updates a one-to-five user rating without replacing the finished work and restores it after reopening', () => {
  const storage = memoryStorage();
  const store = createLibraryEpisodeStore(() => storage);
  const game = completed('rating');
  store.save(game);
  expect(store.rate(game.sessionId, 4)).toMatchObject({ updated: true, persisted: true });
  expect(store.list()[0]).toMatchObject({ userRating: 4, session: game, result: getLibraryResult(game) });
  expect(createLibraryEpisodeStore(() => storage).list()[0].userRating).toBe(4);
  expect(store.rate(game.sessionId, 2).updated).toBe(true);
  expect(store.save(game).duplicate).toBe(true);
  expect(store.list()[0].userRating).toBe(2);
  expect(store.list()[0].session).toEqual(game);
});

it.each([0, 6, -1, 2.5, NaN, Infinity])('rejects out-of-range or noninteger user rating %s', rating => {
  const storage = memoryStorage();
  const store = createLibraryEpisodeStore(() => storage);
  store.save(completed('rated'));
  expect(store.rate('rated', rating)).toEqual({ updated: false });
  expect(store.list()[0].userRating).toBeNull();
  expect(storage.setItem).toHaveBeenCalledTimes(1);
});

it('does not create a phantom episode for a rating and accurately reports memory-only rating updates', () => {
  const store = createLibraryEpisodeStore(() => null);
  expect(store.rate('missing', 5)).toEqual({ updated: false });
  expect(store.list()).toEqual([]);
  store.save(completed('native'));
  expect(store.rate('native', 5)).toMatchObject({ updated: true, persisted: false, storage: 'memory' });
  expect(store.list()[0].userRating).toBe(5);
});

it.each([
  {visitorCount:0,requestMode:'mixed',bookCount:6,damagedBookCount:0},
  {visitorCount:2,requestMode:'mixed',bookCount:12,damagedBookCount:1},
  {visitorCount:2,requestMode:'shelve',bookCount:18,damagedBookCount:2},
] as LibraryGameConfig[])('round-trips configured shifts and their visitor-owned books %j', config => {
  const storage = memoryStorage();
  const game = completed('configured','guided',config);
  const store = createLibraryEpisodeStore(()=>storage);
  expect(store.save(game).persisted).toBe(true);
  const [record] = createLibraryEpisodeStore(()=>storage).list();
  expect(record.session).toEqual(game);
  expect(record.session.config).toEqual(config);
  expect(record.result).toEqual(getLibraryResult(game));
  expect(record.result.visitorsResolved).toBe(config.visitorCount);
  expect(record.result.total).toBe(config.bookCount+record.result.visitorsShelved);
});

it('rejects contradictory settings, duplicate guests, unreported or unowned guest books while retaining valid neighboring records', () => {
  const good = completed('valid','guided',{visitorCount:2,requestMode:'shelve',damagedBookCount:2});
  const invalid:LibrarySession[] = [
    {...good,config:{...good.config,bookCount:18}},
    {...good,config:{...good.config,damagedBookCount:1}},
    {...good,visitors:[good.visitors[0],good.visitors[0]]},
    {...good,visitors:good.visitors.map((visitor,index)=>index===0?{...visitor,status:'awaiting-report',resolution:null}:visitor)},
    {...good,visitors:good.visitors.map((visitor,index)=>index===0?{...visitor,resolution:'referred'}:visitor)},
    {...good,books:good.books.filter(book=>book.visitorId!=='visitor')},
    {...good,books:good.books.map(book=>book.visitorId==='visitor'?{...book,visitorId:'visitor-2'}:book)},
    {...good,books:good.books.map(book=>book.visitorId==='visitor'?{...book,shelfId:null}:book)},
  ];
  for (const game of invalid) expect(()=>createLibraryEpisodeStore(()=>null).save(game)).toThrow('완료된');
  const storage = memoryStorage();
  const store = createLibraryEpisodeStore(()=>storage);
  store.save(good);
  const record = store.list()[0];
  storage.setItem(LIBRARY_EPISODE_STORAGE_KEY,JSON.stringify({version:1,episodes:[
    ...invalid.map((session,index)=>({...record,sessionId:`invalid-${index}`,session:{...session,sessionId:`invalid-${index}`}})),record,
  ]}));
  expect(createLibraryEpisodeStore(()=>storage).list()).toEqual([record]);
});
