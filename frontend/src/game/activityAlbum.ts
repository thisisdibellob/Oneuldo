import { useSyncExternalStore } from 'react';
import { getBusResult, STOP_NAMES, type BusSession, type BusStopId } from './busSession';
import { getLibraryResult, type LibrarySession } from './librarySession';

export type ActivityKind = 'bus' | 'library' | 'shopping' | 'delivery';
export type ActivityMetric = Readonly<{ label: string; value: number; unit: string }>;
export type ActivityRecord = Readonly<{
  id: string; kind: ActivityKind; sessionId: string; completedAt: number;
  title: string; place: string; summary: string;
  metrics: readonly ActivityMetric[]; facts: readonly string[]; favorite: boolean;
}>;
export type CompletedActivity = Omit<ActivityRecord, 'favorite'>;
export type ActivityAlbumStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const ACTIVITY_ALBUM_STORAGE_KEY = 'oneuldo.activity-album.v1';
export const ACTIVITY_ALBUM_LIMIT = 100;
const EMPTY: readonly ActivityRecord[] = Object.freeze([]);
const MAX_BYTES = 256_000;
const KINDS = ['bus', 'library', 'shopping', 'delivery'];
const validText = (value: unknown, max = 240): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const validCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000_000;
const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 8.64e15;
const key = (kind: ActivityKind, sessionId: string) => `${kind}:${encodeURIComponent(sessionId)}`;
function freezeRecord(record: ActivityRecord): ActivityRecord {
  return Object.freeze({ ...record, metrics: Object.freeze(record.metrics.map(metric => Object.freeze({ ...metric }))), facts: Object.freeze([...record.facts]) });
}
function parseRecord(value: unknown): ActivityRecord | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as ActivityRecord;
  if (!validText(row.id, 700) || !KINDS.includes(row.kind) || !validText(row.sessionId, 200) || !validTime(row.completedAt)
    || !validText(row.title) || !validText(row.place) || !validText(row.summary) || typeof row.favorite !== 'boolean'
    || !Array.isArray(row.metrics) || row.metrics.length > 8 || !row.metrics.every(metric => metric && validText(metric.label, 50) && validCount(metric.value) && validText(metric.unit, 12))
    || !Array.isArray(row.facts) || row.facts.length > 12 || !row.facts.every(fact => validText(fact))) return null;
  return freezeRecord({ id: row.id, kind: row.kind, sessionId: row.sessionId, completedAt: row.completedAt,
    title: row.title, place: row.place, summary: row.summary, metrics: row.metrics, facts: row.facts, favorite: row.favorite });
}
function browserStorage(): ActivityAlbumStorage | null {
  try { return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage; } catch { return null; }
}

/** Completed activity summaries only. Matches the existing episode stores: browser persistence,
 * and a shared in-memory album for this app run when native storage is unavailable. */
export function createActivityAlbumStore(storageProvider: () => ActivityAlbumStorage | null = browserStorage) {
  let initialized = false;
  let current: readonly ActivityRecord[] = EMPTY;
  const listeners = new Set<() => void>();
  const initialize = () => {
    if (initialized) return;
    initialized = true;
    try {
      const raw = storageProvider()?.getItem(ACTIVITY_ALBUM_STORAGE_KEY);
      if (!raw || raw.length > MAX_BYTES) return;
      const data: unknown = JSON.parse(raw);
      if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('records' in data) || !Array.isArray(data.records)) return;
      const ids = new Set<string>();
      current = Object.freeze(data.records.map(parseRecord).filter((row): row is ActivityRecord => {
        if (!row || ids.has(row.id)) return false;
        ids.add(row.id); return true;
      }).sort((a, b) => b.completedAt - a.completedAt).slice(0, ACTIVITY_ALBUM_LIMIT));
    } catch { /* An unavailable/corrupt album must never block the phone or a completed game. */ }
  };
  const persistAndNotify = () => {
    let persisted = false;
    try {
      const storage = storageProvider();
      if (storage) { storage.setItem(ACTIVITY_ALBUM_STORAGE_KEY, JSON.stringify({ version: 1, records: current })); persisted = true; }
    } catch { /* Keep the completed record in memory when saving is denied/full. */ }
    listeners.forEach(listener => listener());
    return persisted;
  };
  const getSnapshot = () => { initialize(); return current; };
  return {
    getSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    add(activity: CompletedActivity) {
      initialize();
      const record = parseRecord({ ...activity, favorite: false });
      if (!record) return { added: false, duplicate: false, persisted: false };
      if (current.some(existing => existing.id === record.id)) return { added: false, duplicate: true, persisted: false };
      current = Object.freeze([record, ...current].sort((a, b) => b.completedAt - a.completedAt).slice(0, ACTIVITY_ALBUM_LIMIT));
      return { added: true, duplicate: false, persisted: persistAndNotify() };
    },
    toggleFavorite(id: string) {
      initialize();
      if (!current.some(record => record.id === id)) return false;
      current = Object.freeze(current.map(record => record.id === id ? freezeRecord({ ...record, favorite: !record.favorite }) : record));
      persistAndNotify(); return true;
    },
    resetForTests(records: readonly ActivityRecord[] = []) {
      initialized = true; current = Object.freeze(records.map(freezeRecord)); listeners.forEach(listener => listener());
    },
  };
}
const album = createActivityAlbumStore();
export const getActivityAlbum = album.getSnapshot;
export const toggleActivityFavorite = album.toggleFavorite;
export const resetActivityAlbumForTests = album.resetForTests;
export function useActivityAlbum() { return useSyncExternalStore(album.subscribe, getActivityAlbum, () => EMPTY); }

export function makeCompletedBusActivity(session: BusSession): CompletedActivity | null {
  if (session.phase !== 'completed' || !validTime(session.completedAt) || session.stop !== session.destination) return null;
  const result = getBusResult(session);
  if (result.rides < 1 || !session.events.some(event => event.type === 'alighted' && event.payload.stop === session.destination)) return null;
  const departures = session.events.filter(event => event.type === 'departed');
  const routes = [...new Set(departures.map(event => event.payload.route).filter(route => route === '201' || route === '305'))];
  const start = departures[0]?.payload.stop;
  const origin = typeof start === 'string' && start in STOP_NAMES ? STOP_NAMES[start as BusStopId] : '정류장';
  return { id: key('bus', session.id), kind: 'bus', sessionId: session.id, completedAt: session.completedAt,
    title: `${STOP_NAMES[session.destination]}까지 버스 타기`, place: `${origin} → ${STOP_NAMES[session.destination]}`,
    summary: `${routes.length ? `${routes.join('·')}번 · ` : ''}승차 ${result.rides}회`,
    metrics: [{ label: '버스 승차', value: result.rides, unit: '회' }, { label: '교통카드 사용', value: result.cardApprovals, unit: '회' }, { label: '도움 요청', value: result.helpRequests, unit: '회' }], facts: result.facts };
}
export function makeCompletedLibraryActivity(session: LibrarySession, completedAt = Date.now()): CompletedActivity | null {
  if (session.phase !== 'finished' || !validTime(completedAt)) return null;
  const result = getLibraryResult(session);
  if (!result || result.correctlyShelved + result.handedOff !== result.total || result.visitorsResolved !== result.visitorsTotal) return null;
  return { id: key('library', session.sessionId), kind: 'library', sessionId: session.sessionId, completedAt,
    title: '도서관 업무 완료', place: '하늘도서관', summary: `서가 정리 ${result.correctlyShelved}권 · 손님 응대 ${result.visitorsResolved}명`,
    metrics: [{ label: '서가에 꽂은 책', value: result.correctlyShelved, unit: '권' }, { label: '사서에게 맡긴 책', value: result.handedOff, unit: '권' }, { label: '응대한 손님', value: result.visitorsResolved, unit: '명' }],
    facts: [`책 ${result.total}권의 처리를 마치고 사서에게 보고했어요.`,
      ...(result.visitorsGuided ? [`손님 ${result.visitorsGuided}명을 서가까지 안내했어요.`] : []),
      ...(result.visitorsShelved ? [`손님 ${result.visitorsShelved}명의 책을 대신 꽂아 드렸어요.`] : []),
      ...(result.visitorsReferred ? [`손님 ${result.visitorsReferred}명을 사서에게 안내했어요.`] : [])] };
}
export type CompletedShoppingActivity = { sessionId: string; completedAt: number; itemCount: number; totalAmount: number; checkoutKind?: 'staff' | 'kiosk' };
export function makeCompletedShoppingActivity(input: CompletedShoppingActivity): CompletedActivity | null {
  if (!validText(input.sessionId, 200) || !validTime(input.completedAt) || !validCount(input.itemCount) || !validCount(input.totalAmount)) return null;
  const method = input.checkoutKind === 'kiosk' ? '무인 계산대' : input.checkoutKind === 'staff' ? '직원 계산대' : '계산대';
  return { id: key('shopping', input.sessionId), kind: 'shopping', sessionId: input.sessionId, completedAt: input.completedAt,
    title: '장보기 완료', place: '하늘마트', summary: `${input.itemCount}개 · ${input.totalAmount.toLocaleString('ko-KR')}원`,
    metrics: [{ label: '구매한 물품', value: input.itemCount, unit: '개' }, { label: '결제한 금액', value: input.totalAmount, unit: '원' }],
    facts: [`${method}에서 물품 ${input.itemCount}개의 결제를 마쳤어요.`] };
}
export type CompletedDeliveryActivity = { sessionId: string; completedAt: number; recipient: string; itemCount: number; items?: string[] };
export function makeCompletedDeliveryActivity(input: CompletedDeliveryActivity): CompletedActivity | null {
  if (!validText(input.sessionId, 200) || !validTime(input.completedAt) || !validText(input.recipient, 30) || !validCount(input.itemCount)
    || (input.items && (!Array.isArray(input.items) || !input.items.every(item => validText(item, 100))))) return null;
  return { id: `${key('delivery', input.sessionId)}:${encodeURIComponent(input.recipient)}`, kind: 'delivery', sessionId: input.sessionId, completedAt: input.completedAt,
    title: `${input.recipient}에게 물품 전달`, place: '우리 마을', summary: `물품 ${input.itemCount}개 전달`,
    metrics: [{ label: '전달한 물품', value: input.itemCount, unit: '개' }],
    facts: [`${input.recipient}에게 물품을 건넸어요.`, ...(input.items ?? []).slice(0, 10)] };
}
export function recordCompletedBusActivity(session: BusSession) { const record = makeCompletedBusActivity(session); return record ? album.add(record) : null; }
export function recordCompletedLibraryActivity(session: LibrarySession, completedAt = Date.now()) { const record = makeCompletedLibraryActivity(session, completedAt); return record ? album.add(record) : null; }
export function recordCompletedShoppingActivity(input: CompletedShoppingActivity) { const record = makeCompletedShoppingActivity(input); return record ? album.add(record) : null; }
export function recordCompletedDeliveryActivity(input: CompletedDeliveryActivity) { const record = makeCompletedDeliveryActivity(input); return record ? album.add(record) : null; }

export function filterActivityRecords(records: readonly ActivityRecord[], query = '', favoritesOnly = false): readonly ActivityRecord[] {
  const terms = query.trim().toLocaleLowerCase('ko-KR').split(/\s+/).filter(Boolean);
  return records.filter(record => {
    if (favoritesOnly && !record.favorite) return false;
    const date = new Date(record.completedAt);
    const searchable = [record.title, record.place, record.summary, ...record.facts,
      `${date.getFullYear()} ${date.getMonth() + 1}월 ${date.getDate()}일`, `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      ...record.metrics.map(metric => `${metric.label} ${metric.value}${metric.unit}`)].join(' ').toLocaleLowerCase('ko-KR');
    return terms.every(term => searchable.includes(term));
  });
}
