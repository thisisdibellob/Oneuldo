import type { exportMarketEpisode } from './marketSession';

export type MarketStoredEpisode = ReturnType<typeof exportMarketEpisode>;
export type MarketEpisodeStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type MarketEpisodeSaveResult = {
  storage: 'browser' | 'memory';
  persisted: boolean;
  reason?: 'unavailable' | 'quota-or-denied' | 'too-large';
};
export const MARKET_EPISODE_STORAGE_KEY = 'oneuldo.market.episodes.v1';
export const MARKET_EPISODE_HISTORY_LIMIT = 20;
export const MARKET_EPISODE_STORAGE_MAX_BYTES = 5 * 1024 * 1024;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function isEpisode(value: unknown): value is MarketStoredEpisode {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<MarketStoredEpisode>;
  return item.schema === 'oneuldo.market.episode' && item.version === 1 &&
    typeof item.sessionId === 'string' && item.sessionId.length > 0 &&
    (item.outcome === 'success' || item.outcome === 'gave-up') &&
    Number.isInteger(item.attempts) && (item.attempts ?? -1) >= 0 &&
    !!item.config && !!item.environment && Array.isArray(item.events);
}
function browserStorage(): MarketEpisodeStorage | null {
  try { return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage; }
  catch { return null; }
}

/** Local research history, never uploaded. Native uses memory until explicit JSON sharing. */
export function createMarketEpisodeStore(storageProvider: () => MarketEpisodeStorage | null = browserStorage) {
  let initialized = false;
  let episodes: MarketStoredEpisode[] = [];
  const initialize = () => {
    if (initialized) return;
    initialized = true;
    try {
      const raw = storageProvider()?.getItem(MARKET_EPISODE_STORAGE_KEY);
      // Do not parse an arbitrarily large corrupt/local-edited cache.
      if (!raw || raw.length * 2 > MARKET_EPISODE_STORAGE_MAX_BYTES) return;
      const data: unknown = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;
      const envelope = data as { version?: unknown; episodes?: unknown };
      if (envelope.version === 1 && Array.isArray(envelope.episodes)) {
        const seen = new Set<string>();
        episodes = envelope.episodes.filter(isEpisode).filter((episode) => {
          if (seen.has(episode.sessionId)) return false;
          seen.add(episode.sessionId); return true;
        }).slice(0, MARKET_EPISODE_HISTORY_LIMIT);
      }
    } catch { /* Unavailable or corrupt storage must not interrupt gameplay. */ }
  };
  return {
    list(): MarketStoredEpisode[] { initialize(); return clone(episodes); },
    save(episode: MarketStoredEpisode): MarketEpisodeSaveResult {
      if (!isEpisode(episode)) throw new Error('종료된 장보기 기록만 저장할 수 있습니다.');
      initialize();
      episodes = [clone(episode), ...episodes.filter((old) => old.sessionId !== episode.sessionId)]
        .slice(0, MARKET_EPISODE_HISTORY_LIMIT);
      let storage: MarketEpisodeStorage | null;
      try { storage = storageProvider(); } catch { storage = null; }
      if (!storage) return { storage: 'memory', persisted: false, reason: 'unavailable' };
      const persistent = [...episodes];
      let json = JSON.stringify({ version: 1, episodes: persistent });
      while (persistent.length > 1 && json.length * 2 > MARKET_EPISODE_STORAGE_MAX_BYTES) {
        persistent.pop();
        json = JSON.stringify({ version: 1, episodes: persistent });
      }
      if (json.length * 2 > MARKET_EPISODE_STORAGE_MAX_BYTES) {
        return { storage: 'memory', persisted: false, reason: 'too-large' };
      }
      try {
        storage.setItem(MARKET_EPISODE_STORAGE_KEY, json);
        return { storage: 'browser', persisted: true };
      } catch {
        return { storage: 'memory', persisted: false, reason: 'quota-or-denied' };
      }
    },
  };
}

const history = createMarketEpisodeStore();
export const saveMarketEpisode = (episode: MarketStoredEpisode) => history.save(episode);
export const listMarketEpisodes = () => history.list();
