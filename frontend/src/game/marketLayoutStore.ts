import { marketLayoutStorage } from './marketLayoutStorage';
import { MarketLayoutStorageUnavailableError, type MarketLayoutStorage } from './marketLayoutStorage.types';
import { parseMarketTilemap, type MarketTilemapV1 } from './marketTilemap';

export const MAX_SAVED_MARKET_LAYOUTS = 24;
export const MAX_MARKET_LAYOUT_NAME_LENGTH = 32;
const LIBRARY_FORMAT = 'oneuldo.market-layout-library';
const MAX_STORE_LENGTH = 1_200_000;
export type SavedMarketLayout = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  tilemap: MarketTilemapV1;
};
export type MarketLayoutStoreErrorCode = 'invalid-name' | 'limit' | 'not-found' | 'invalid-map'
  | 'corrupt-store' | 'storage-unavailable' | 'read-failed' | 'write-failed';
export class MarketLayoutStoreError extends Error {
  constructor(readonly code: MarketLayoutStoreErrorCode, message: string) {
    super(message);
    this.name = 'MarketLayoutStoreError';
  }
}

export function normalizeMarketLayoutName(value: string): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || Array.from(name).length > MAX_MARKET_LAYOUT_NAME_LENGTH || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new MarketLayoutStoreError('invalid-name', '배치 이름은 줄바꿈 없이 1~32자로 적어 주세요.');
  }
  return name;
}
function isRecord(value: unknown, fields: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && Object.keys(value).every(key => fields.includes(key));
}
function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString() === value;
}
function validId(value: unknown): value is string { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value); }
function copy(entry: SavedMarketLayout): SavedMarketLayout { return { ...entry, tilemap: parseMarketTilemap(entry.tilemap) }; }
function parseLibrary(contents: string | null): SavedMarketLayout[] {
  if (contents === null) return [];
  try {
    if (typeof contents !== 'string' || contents.length > MAX_STORE_LENGTH) throw new Error();
    const value: unknown = JSON.parse(contents);
    if (!isRecord(value, ['format', 'version', 'entries']) || value.format !== LIBRARY_FORMAT || value.version !== 1
      || !Array.isArray(value.entries) || value.entries.length > MAX_SAVED_MARKET_LAYOUTS) throw new Error();
    const entries = value.entries.map((entry): SavedMarketLayout => {
      if (!isRecord(entry, ['id', 'name', 'createdAt', 'updatedAt', 'tilemap']) || !validId(entry.id)
        || typeof entry.name !== 'string' || normalizeMarketLayoutName(entry.name) !== entry.name
        || !isTimestamp(entry.createdAt) || !isTimestamp(entry.updatedAt) || entry.updatedAt < entry.createdAt) throw new Error();
      return { id: entry.id, name: entry.name, createdAt: entry.createdAt, updatedAt: entry.updatedAt, tilemap: parseMarketTilemap(entry.tilemap) };
    });
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error();
    return entries;
  } catch {
    throw new MarketLayoutStoreError('corrupt-store', '저장된 보관함을 읽을 수 없어요. 기존 내용은 덮어쓰지 않았어요. JSON으로 현재 배치를 내보내 주세요.');
  }
}
function validatedMap(tilemap: MarketTilemapV1): MarketTilemapV1 {
  try { return parseMarketTilemap(tilemap); }
  catch (error) { throw new MarketLayoutStoreError('invalid-map', error instanceof Error ? error.message : '배치 형식을 확인해 주세요.'); }
}
function storageError(error: unknown, operation: 'read' | 'write'): Error {
  if (error instanceof MarketLayoutStorageUnavailableError) return error;
  return new MarketLayoutStoreError(operation === 'read' ? 'read-failed' : 'write-failed', operation === 'read'
    ? '기기에서 보관함을 불러오지 못했어요. 다시 시도해 주세요. 기존 내용은 변경하지 않았어요.'
    : '기기에 저장하지 못했어요. 저장 공간과 브라우저 설정을 확인한 뒤 다시 시도하거나 JSON으로 내보내 주세요.');
}

/** No cache is used as a substitute for disk. Each operation validates the last durable snapshot. */
export function createMarketLayoutStore(options: {
  storage: MarketLayoutStorage;
  now?: () => string;
  createId?: () => string;
}) {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => `layout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
  let pending: Promise<unknown> = Promise.resolve();
  const queue = <T,>(task: () => Promise<T>, write = false): Promise<T> => {
    const run = () => write && options.storage.withExclusiveWrite ? options.storage.withExclusiveWrite(task) : task();
    const result = pending.then(run, run);
    pending = result.then(() => undefined, () => undefined);
    return result;
  };
  async function read() {
    let contents: string | null;
    try { contents = await options.storage.read(); } catch (error) { throw storageError(error, 'read'); }
    return parseLibrary(contents);
  }
  async function write(entries: SavedMarketLayout[]) {
    const contents = JSON.stringify({ format: LIBRARY_FORMAT, version: 1, entries });
    parseLibrary(contents);
    try { await options.storage.write(contents); } catch (error) { throw storageError(error, 'write'); }
  }
  function timestamp(previous?: string) {
    const value = now();
    if (!isTimestamp(value)) throw new MarketLayoutStoreError('write-failed', '기기의 날짜와 시간을 확인해 주세요.');
    // A clock adjustment must not invalidate an otherwise good existing entry.
    return previous && value < previous ? previous : value;
  }
  function newId(entries: SavedMarketLayout[]) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = createId();
      if (validId(id) && !entries.some(entry => entry.id === id)) return id;
    }
    throw new MarketLayoutStoreError('write-failed', '새 배치를 만들지 못했어요. 다시 시도해 주세요.');
  }
  function requireEntry(entries: SavedMarketLayout[], id: string) {
    const found = entries.find(entry => entry.id === id);
    if (!found) throw new MarketLayoutStoreError('not-found', '이 배치가 보관함에 없어요. 목록을 다시 불러와 주세요.');
    return found;
  }
  function requireRoom(entries: SavedMarketLayout[]) {
    if (entries.length >= MAX_SAVED_MARKET_LAYOUTS) throw new MarketLayoutStoreError('limit', '배치는 최대 24개까지 보관할 수 있어요. 필요 없는 배치를 삭제해 주세요.');
  }
  return {
    list: () => queue(async () => (await read()).map(copy)),
    save: (input: { id?: string; name: string; tilemap: MarketTilemapV1 }) => {
      // Capture caller-owned values immediately, before a pending write can yield.
      let name: string, tilemap: MarketTilemapV1;
      try { name = normalizeMarketLayoutName(input.name); tilemap = validatedMap(input.tilemap); }
      catch (error) { return Promise.reject(error); }
      const id = input.id;
      return queue(async () => {
        const entries = await read();
        const existing = id === undefined ? undefined : requireEntry(entries, id);
        if (!existing) requireRoom(entries);
        const at = timestamp(existing?.updatedAt);
        const next: SavedMarketLayout = { id: existing?.id ?? newId(entries), name, tilemap,
          createdAt: existing?.createdAt ?? at, updatedAt: at };
        await write([next, ...entries.filter(entry => entry.id !== next.id)]);
        return copy(next);
      }, true);
    },
    rename: (id: string, value: string) => {
      let name: string;
      try { name = normalizeMarketLayoutName(value); } catch (error) { return Promise.reject(error); }
      return queue(async () => {
        const entries = await read();
        const existing = requireEntry(entries, id);
        const next = { ...existing, name, updatedAt: timestamp(existing.updatedAt) };
        await write([next, ...entries.filter(entry => entry.id !== id)]);
        return copy(next);
      }, true);
    },
    duplicate: (id: string, value?: string) => queue(async () => {
      const entries = await read();
      const existing = requireEntry(entries, id);
      requireRoom(entries);
      const name = normalizeMarketLayoutName(value ?? `${Array.from(existing.name).slice(0, 28).join('')} 복사본`);
      const at = timestamp();
      const next: SavedMarketLayout = { ...copy(existing), id: newId(entries), name, createdAt: at, updatedAt: at };
      await write([next, ...entries]);
      return copy(next);
    }, true),
    remove: (id: string) => queue(async () => {
      const entries = await read();
      requireEntry(entries, id);
      await write(entries.filter(entry => entry.id !== id));
    }, true),
  };
}
export type MarketLayoutStore = ReturnType<typeof createMarketLayoutStore>;
export const marketLayoutStore = createMarketLayoutStore({ storage: marketLayoutStorage });
