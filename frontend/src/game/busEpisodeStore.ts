import { getBusResult, STOP_NAMES, type BusResult, type BusSession } from './busSession';

export type BusStoredEpisode = {
  schema: 'oneuldo.bus.episode';
  version: 1;
  sessionId: string;
  startedAt: number;
  session: BusSession;
  result: BusResult;
  userRating: number | null;
};
export type BusEpisodeStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type BusEpisodeSaveResult = {
  storage: 'browser' | 'memory';
  persisted: boolean;
  duplicate: boolean;
  reason?: 'unavailable' | 'quota-or-denied' | 'too-large';
};
export type BusEpisodeRatingResult = { updated: false } | ({ updated: true } & BusEpisodeSaveResult);
export const BUS_EPISODE_STORAGE_KEY = 'oneuldo.bus.episodes.v1';
export const BUS_EPISODE_HISTORY_LIMIT = 20;
export const BUS_EPISODE_STORAGE_MAX_BYTES = 2 * 1024 * 1024;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const count = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

function isFinishedSession(value: unknown): value is BusSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as BusSession;
  const isReturn = session.destination === 'village';
  if (session.phase !== 'completed' || typeof session.id !== 'string' || !session.id
    || !Number.isFinite(session.startedAt) || !Number.isFinite(session.completedAt) || session.completedAt! < session.startedAt
    || !['library', 'village'].includes(session.destination) || session.stop !== session.destination
    || (!isReturn && session.direction !== 'inbound') || !['outbound', 'inbound'].includes(session.direction)
    || session.cardPacked !== true || session.routeOpened !== true
    || !['guided', 'independent'].includes(session.guidance) || !count(session.rideNumber) || !session.rideNumber
    || session.route !== null || session.nextStop !== null || session.rideId !== null || session.offeredRoute !== null
    || session.bellRequested !== false || session.boardingApproved !== false || session.alightingApproved !== false || session.seatSecured !== false
    || !session.checkpoint || !(session.checkpoint.stop in STOP_NAMES) || !['outbound', 'inbound'].includes(session.checkpoint.direction)
    || !Array.isArray(session.events) || !session.events.length) return false;
  if (!session.events.every((event, index) => event && event.sequence === index + 1 && typeof event.type === 'string'
    && event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
    && Object.values(event.payload).every(item => item === null || typeof item === 'string' || typeof item === 'boolean'
      || (typeof item === 'number' && Number.isFinite(item))))) return false;
  const last = session.events.at(-1);
  if (last?.type !== (isReturn ? 'journey_completed' : 'arrival_reported') || last.payload.stop !== session.destination
    || last.payload.direction !== session.direction) return false;
  const destinationArrival = session.events.findLast(event => event.type === 'alighted' && event.payload.stop === session.destination);
  if (!destinationArrival || typeof destinationArrival.payload.rideId !== 'string') return false;
  const rideEvents = session.events.filter(event => event.payload.rideId === destinationArrival.payload.rideId);
  const required = ['boarded', 'boarding_card_approved', 'departed', 'vehicle_stopped', 'stood_up', 'alighting_card_approved', 'alighted'];
  let previousSequence = 0;
  return required.every(type => {
    const event = rideEvents.find(candidate => candidate.type === type && candidate.sequence > previousSequence);
    if (!event) return false;
    previousSequence = event.sequence;
    return true;
  });
}

function readEpisode(value: unknown): BusStoredEpisode | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as BusStoredEpisode;
  // Original v1 trips had a fixed library destination. Keep those histories readable.
  const rawSession: unknown = item.session;
  const session = rawSession && typeof rawSession === 'object' && !('destination' in rawSession)
    ? { ...rawSession, destination: 'library' as const } : rawSession;
  if (item.schema !== 'oneuldo.bus.episode' || item.version !== 1 || !isFinishedSession(session)
    || item.sessionId !== session.id || item.startedAt !== session.startedAt) return null;
  return { schema: 'oneuldo.bus.episode', version: 1, sessionId: item.sessionId, startedAt: item.startedAt,
    session, result: getBusResult(session),
    userRating: count(item.userRating) && item.userRating >= 1 && item.userRating <= 5 ? item.userRating : null };
}
function browserStorage(): BusEpisodeStorage | null {
  try { return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage; }
  catch { return null; }
}

/** Device-local only, separate from library and AI records. Native currently retains the running app's history in memory. */
export function createBusEpisodeStore(storageProvider: () => BusEpisodeStorage | null = browserStorage) {
  let initialized = false;
  let episodes: BusStoredEpisode[] = [];
  const savedResults = new Map<string, BusEpisodeSaveResult>();
  const initialize = () => {
    if (initialized) return;
    initialized = true;
    try {
      const raw = storageProvider()?.getItem(BUS_EPISODE_STORAGE_KEY);
      if (!raw || raw.length * 2 > BUS_EPISODE_STORAGE_MAX_BYTES) return;
      const data: unknown = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;
      const envelope = data as { version?: unknown; episodes?: unknown };
      if (envelope.version !== 1 || !Array.isArray(envelope.episodes)) return;
      const seen = new Set<string>();
      episodes = envelope.episodes.map(readEpisode).filter((episode): episode is BusStoredEpisode => {
        if (!episode || seen.has(episode.sessionId)) return false;
        seen.add(episode.sessionId);
        return true;
      }).slice(0, BUS_EPISODE_HISTORY_LIMIT);
      episodes.forEach(episode => savedResults.set(episode.sessionId, { storage: 'browser', persisted: true, duplicate: false }));
    } catch { /* Invalid or unavailable local history must never interrupt this trip. */ }
  };
  const persist = (): BusEpisodeSaveResult => {
    let storage: BusEpisodeStorage | null;
    try { storage = storageProvider(); } catch { storage = null; }
    if (!storage) return { storage: 'memory', persisted: false, duplicate: false, reason: 'unavailable' };
    const persistent = [...episodes];
    let json = JSON.stringify({ version: 1, episodes: persistent });
    while (persistent.length > 1 && json.length * 2 > BUS_EPISODE_STORAGE_MAX_BYTES) {
      persistent.pop();
      json = JSON.stringify({ version: 1, episodes: persistent });
    }
    if (json.length * 2 > BUS_EPISODE_STORAGE_MAX_BYTES) return { storage: 'memory', persisted: false, duplicate: false, reason: 'too-large' };
    try {
      storage.setItem(BUS_EPISODE_STORAGE_KEY, json);
      return { storage: 'browser', persisted: true, duplicate: false };
    } catch { return { storage: 'memory', persisted: false, duplicate: false, reason: 'quota-or-denied' }; }
  };
  return {
    list(): BusStoredEpisode[] { initialize(); return clone(episodes); },
    save(session: BusSession): BusEpisodeSaveResult {
      if (!isFinishedSession(session)) throw new Error('출근 보고 또는 마을 귀환을 마친 버스 이동만 저장할 수 있습니다.');
      initialize();
      const previousResult = savedResults.get(session.id);
      if (previousResult) return { ...previousResult, duplicate: true };
      const episode: BusStoredEpisode = { schema: 'oneuldo.bus.episode', version: 1, sessionId: session.id,
        startedAt: session.startedAt, session: clone(session), result: getBusResult(session), userRating: null };
      episodes = [episode, ...episodes].slice(0, BUS_EPISODE_HISTORY_LIMIT);
      const result = persist();
      savedResults.set(session.id, result);
      return { ...result };
    },
    rate(sessionId: string, rating: number): BusEpisodeRatingResult {
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
const history = createBusEpisodeStore();
export const saveBusEpisode = (session: BusSession) => history.save(session);
export const listBusEpisodes = () => history.list();
export const readBusEpisodes = listBusEpisodes;
export const rateBusEpisode = (sessionId: string, rating: number) => history.rate(sessionId, rating);
