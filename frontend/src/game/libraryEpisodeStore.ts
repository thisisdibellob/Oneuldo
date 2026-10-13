import { getLibraryBook, getLibraryProgress, getLibraryResult, normalizeLibraryConfig, type LibraryResult, type LibrarySession } from './librarySession';

export type LibraryStoredEpisode = {
  schema: 'oneuldo.library.episode';
  version: 1;
  sessionId: string;
  startedAt: number;
  session: LibrarySession;
  result: LibraryResult;
  userRating: number | null;
};
export type LibraryEpisodeStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type LibraryEpisodeSaveResult = {
  storage: 'browser' | 'memory';
  persisted: boolean;
  duplicate: boolean;
  reason?: 'unavailable' | 'quota-or-denied' | 'too-large';
};
export type LibraryEpisodeRatingResult = { updated: false } | ({ updated: true } & LibraryEpisodeSaveResult);

export const LIBRARY_EPISODE_STORAGE_KEY = 'oneuldo.library.episodes.v1';
export const LIBRARY_EPISODE_HISTORY_LIMIT = 20;
export const LIBRARY_EPISODE_STORAGE_MAX_BYTES = 2 * 1024 * 1024;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const count = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

function readFinishedSession(value: unknown): LibrarySession | null {
  if (!value || typeof value !== 'object') return null;
  let session = value as LibrarySession;
  // Version-one history originally stored one visitor and six/twelve return books.
  // Normalize that saved shape at the read boundary; all live work uses visitors/config.
  if (!('visitors' in value) && !('config' in value) && 'visitor' in value && value.visitor
    && typeof value.visitor === 'object' && Array.isArray(session.books) && [6, 12].includes(session.books.length)) {
    const { visitor, ...legacy } = value as LibrarySession & { visitor: Record<string, unknown> };
    session = { ...legacy,
      config: { visitorCount: 1, requestMode: 'find', bookCount: session.books.length as 6 | 12, damagedBookCount: 1 },
      books: session.books.map(book => ({ ...book, source: 'cart' })),
      visitors: [{ ...visitor, id: 'visitor', requestType: 'find' }],
    } as LibrarySession;
  }
  if (session.phase !== 'finished' || typeof session.sessionId !== 'string' || !session.sessionId
    || typeof session.seed !== 'string' || !Number.isFinite(session.startedAt)
    || !['guided', 'independent'].includes(session.supportMode) || !count(session.reportAttempts)
    || !Array.isArray(session.books) || !Array.isArray(session.events)
    || !Array.isArray(session.supportUses) || !Array.isArray(session.visitors) || !session.config) return null;
  try {
    const config = normalizeLibraryConfig(session.config);
    if (Object.entries(config).some(([key, setting]) => session.config[key as keyof typeof config] !== setting)) return null;
  } catch { return null; }
  if (new Set(session.books.map(book => book?.bookId)).size !== session.books.length) return null;
  if (!session.books.every(book => book && getLibraryBook(book.bookId)
    && ['cart', 'visitor'].includes(book.source)
    && typeof book.damagedLabel === 'boolean' && typeof book.librarianAsked === 'boolean'
    && typeof book.inspected === 'boolean' && typeof book.needsCorrection === 'boolean'
    && ['shelf', 'handoff'].includes(book.location) && count(book.placementAttempts)
    && count(book.wrongAttempts) && count(book.corrections))) return null;
  if (!session.events.every(event => event && count(event.sequence) && typeof event.type === 'string'
    && event.payload && typeof event.payload === 'object')) return null;
  if (!session.supportUses.every(support => support && ['notebook', 'repeat-instructions', 'label-zoom'].includes(support.kind))) return null;
  const cartBooks = session.books.filter(book => book.source === 'cart');
  const visitorBooks = session.books.filter(book => book.source === 'visitor');
  if (cartBooks.length !== session.config.bookCount || cartBooks.some(book => book.visitorId !== undefined)
    || cartBooks.filter(book => book.damagedLabel).length !== session.config.damagedBookCount
    || session.visitors.length !== session.config.visitorCount
    || new Set(session.visitors.map(visitor => visitor?.id)).size !== session.visitors.length
    || new Set(session.visitors.map(visitor => visitor?.bookId)).size !== session.visitors.length) return null;
  if (!session.visitors.every((visitor, index) => visitor && visitor.id === (index === 0 ? 'visitor' : 'visitor-2')
    && visitor.status === 'resolved' && getLibraryBook(visitor.bookId)
    && !cartBooks.some(book => book.bookId === visitor.bookId)
    && ['find', 'shelve'].includes(visitor.requestType)
    && (session.config.requestMode === 'mixed' || visitor.requestType === session.config.requestMode)
    && (visitor.resolution === 'referred' || visitor.resolution === (visitor.requestType === 'find' ? 'guided' : 'shelved'))
    && typeof visitor.lookupUsed === 'boolean' && count(visitor.attempts) && count(visitor.wrongAttempts))) return null;
  if (session.config.requestMode === 'mixed' && session.visitors.length === 2
    && session.visitors[0].requestType === session.visitors[1].requestType) return null;
  if (!visitorBooks.every(book => !book.damagedLabel && session.visitors.some(visitor => visitor.id === book.visitorId
    && visitor.bookId === book.bookId && visitor.requestType === 'shelve' && visitor.resolution === 'shelved'))
    || !session.visitors.every(visitor => (visitor.resolution === 'shelved') === visitorBooks.some(book => book.visitorId === visitor.id))) return null;
  const progress = getLibraryProgress(session);
  return progress.visitorResolved && progress.correctlyShelved === session.books.length - session.config.damagedBookCount
    && progress.handedOff === session.config.damagedBookCount && progress.remaining === 0 ? session : null;
}

function readEpisode(value: unknown): LibraryStoredEpisode | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as LibraryStoredEpisode;
  const session = readFinishedSession(item.session);
  if (item.schema !== 'oneuldo.library.episode' || item.version !== 1 || !session
    || item.sessionId !== session.sessionId || item.startedAt !== session.startedAt) return null;
  // Recompute summaries from the preserved work state rather than trusting cached display numbers.
  return { schema: 'oneuldo.library.episode', version: 1, sessionId: item.sessionId, startedAt: item.startedAt,
    session, result: getLibraryResult(session)!,
    userRating: count(item.userRating) && item.userRating >= 1 && item.userRating <= 5 ? item.userRating : null };
}

function browserStorage(): LibraryEpisodeStorage | null {
  try { return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage; }
  catch { return null; }
}

/** Device-local history only. Native/blocked storage keeps records in memory for this app session. */
export function createLibraryEpisodeStore(storageProvider: () => LibraryEpisodeStorage | null = browserStorage) {
  let initialized = false;
  let episodes: LibraryStoredEpisode[] = [];
  const savedResults = new Map<string, LibraryEpisodeSaveResult>();
  const initialize = () => {
    if (initialized) return;
    initialized = true;
    try {
      const raw = storageProvider()?.getItem(LIBRARY_EPISODE_STORAGE_KEY);
      if (!raw || raw.length * 2 > LIBRARY_EPISODE_STORAGE_MAX_BYTES) return;
      const data: unknown = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;
      const envelope = data as { version?: unknown; episodes?: unknown };
      if (envelope.version !== 1 || !Array.isArray(envelope.episodes)) return;
      const seen = new Set<string>();
      episodes = envelope.episodes.map(readEpisode).filter((episode): episode is LibraryStoredEpisode => {
        if (!episode || seen.has(episode.sessionId)) return false;
        seen.add(episode.sessionId);
        return true;
      }).slice(0, LIBRARY_EPISODE_HISTORY_LIMIT);
      episodes.forEach(episode => savedResults.set(episode.sessionId, { storage: 'browser', persisted: true, duplicate: false }));
    } catch { /* A damaged cache or denied browser storage must not interrupt a shift. */ }
  };
  const persist = (): LibraryEpisodeSaveResult => {
    let storage: LibraryEpisodeStorage | null;
    try { storage = storageProvider(); } catch { storage = null; }
    if (!storage) return { storage: 'memory', persisted: false, duplicate: false, reason: 'unavailable' };
    const persistent = [...episodes];
    let json = JSON.stringify({ version: 1, episodes: persistent });
    while (persistent.length > 1 && json.length * 2 > LIBRARY_EPISODE_STORAGE_MAX_BYTES) {
      persistent.pop();
      json = JSON.stringify({ version: 1, episodes: persistent });
    }
    if (json.length * 2 > LIBRARY_EPISODE_STORAGE_MAX_BYTES) {
      return { storage: 'memory', persisted: false, duplicate: false, reason: 'too-large' };
    }
    try {
      storage.setItem(LIBRARY_EPISODE_STORAGE_KEY, json);
      return { storage: 'browser', persisted: true, duplicate: false };
    } catch {
      return { storage: 'memory', persisted: false, duplicate: false, reason: 'quota-or-denied' };
    }
  };

  return {
    list(): LibraryStoredEpisode[] { initialize(); return clone(episodes); },
    save(session: LibrarySession): LibraryEpisodeSaveResult {
      const finished = readFinishedSession(session);
      if (!finished) throw new Error('완료된 도서관 근무 기록만 저장할 수 있습니다.');
      initialize();
      const previousResult = savedResults.get(finished.sessionId);
      if (previousResult) return { ...previousResult, duplicate: true };
      const episode: LibraryStoredEpisode = { schema: 'oneuldo.library.episode', version: 1,
        sessionId: finished.sessionId, startedAt: finished.startedAt, session: clone(finished), result: getLibraryResult(finished)!, userRating: null };
      episodes = [episode, ...episodes].slice(0, LIBRARY_EPISODE_HISTORY_LIMIT);
      const result = persist();
      savedResults.set(finished.sessionId, result);
      return { ...result };
    },
    rate(sessionId: string, rating: number): LibraryEpisodeRatingResult {
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { updated: false };
      initialize();
      const index = episodes.findIndex(episode => episode.sessionId === sessionId);
      if (index < 0) return { updated: false };
      episodes = episodes.map((episode, row) => row === index ? { ...episode, userRating: rating } : episode);
      const result = persist();
      savedResults.set(sessionId, result);
      return { updated: true, ...result };
    },
  };
}

const history = createLibraryEpisodeStore();
export const saveLibraryEpisode = (session: LibrarySession) => history.save(session);
export const listLibraryEpisodes = () => history.list();
export const rateLibraryEpisode = (sessionId: string, rating: number) => history.rate(sessionId, rating);
