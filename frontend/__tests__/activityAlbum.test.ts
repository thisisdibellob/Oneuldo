import { ACTIVITY_ALBUM_LIMIT, ACTIVITY_ALBUM_STORAGE_KEY, createActivityAlbumStore, filterActivityRecords, makeCompletedBusActivity, makeCompletedDeliveryActivity, makeCompletedLibraryActivity, makeCompletedShoppingActivity } from '../src/game/activityAlbum';
import { createBusSession, reduceBusSession, type BusAction } from '../src/game/busSession';
import { applyLibraryAction, createLibrarySession, getLibraryBook } from '../src/game/librarySession';

const shopping = (sessionId = 'paid', completedAt = 500) => makeCompletedShoppingActivity({ sessionId, completedAt, itemCount: 3, totalAmount: 7800, checkoutKind: 'staff' })!;
const memory = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: jest.fn((key: string, value: string) => { values.set(key, value); }) }; };
function completedBus() {
  const actions: BusAction[] = [{ type: 'OPEN_ROUTE' }, { type: 'PACK_CARD' }, { type: 'GO_TO_STOP' }, { type: 'ARRIVE_VEHICLE', route: '201' },
    { type: 'BOARD' }, { type: 'TAP_BOARDING_CARD' }, { type: 'HOLD_HANDRAIL' }, { type: 'DEPART' }, { type: 'REACH_NEXT_STOP', expectedStop: 'park' },
    { type: 'REQUEST_STOP' }, { type: 'REACH_NEXT_STOP', expectedStop: 'library' }, { type: 'STAND_UP' }, { type: 'TAP_ALIGHTING_CARD' }, { type: 'ALIGHT' },
    { type: 'CROSS_ROAD' }, { type: 'REPORT_ARRIVAL', at: 500 }];
  return actions.reduce(reduceBusSession, createBusSession({ id: 'bus-done', startedAt: 100 }));
}

it('records only a genuinely completed bus journey and derives actual ride/card facts', () => {
  expect(makeCompletedBusActivity(createBusSession())).toBeNull();
  const bus = completedBus();
  expect(makeCompletedBusActivity(bus)).toMatchObject({ kind: 'bus', completedAt: 500, place: '마을앞 → 하늘도서관', summary: '201번 · 승차 1회',
    metrics: [{ label: '버스 승차', value: 1, unit: '회' }, { label: '교통카드 사용', value: 2, unit: '회' }, { label: '도움 요청', value: 0, unit: '회' }] });
  expect(makeCompletedBusActivity({ ...bus, events: [] })).toBeNull();
  expect(makeCompletedBusActivity({ ...bus, stop: 'park' })).toBeNull();
});

it('records completed library work with the actual count, not the default shift size', () => {
  let session = createLibrarySession({ sessionId: 'six-books', bookCount: 6, visitorCount: 0, damagedBookCount: 0, startedAt: 100 });
  expect(makeCompletedLibraryActivity(session, 500)).toBeNull();
  session = applyLibraryAction(session, { type: 'acceptTask' });
  session = applyLibraryAction(session, { type: 'collectAll' });
  for (const book of session.books) session = applyLibraryAction(session, { type: 'placeBook', bookId: book.bookId, shelfId: getLibraryBook(book.bookId)!.categoryId });
  session = applyLibraryAction(session, { type: 'report', shelvedCount: 6, handedOffCount: 0 });
  expect(makeCompletedLibraryActivity(session, 500)).toMatchObject({ kind: 'library', completedAt: 500, summary: '서가 정리 6권 · 손님 응대 0명',
    metrics: [{ label: '서가에 꽂은 책', value: 6, unit: '권' }, { label: '사서에게 맡긴 책', value: 0, unit: '권' }, { label: '응대한 손님', value: 0, unit: '명' }] });
  expect(makeCompletedLibraryActivity({ ...session, books: session.books.map(book => ({ ...book, location: 'carried' })) }, 500)).toBeNull();
});

it('keeps a completion only once and preserves its first date, numbers and favorite after reopening', () => {
  const storage = memory(); const store = createActivityAlbumStore(() => storage);
  expect(store.add(shopping())).toEqual({ added: true, duplicate: false, persisted: true });
  store.toggleFavorite(shopping().id);
  const snapshot = store.getSnapshot();
  expect(store.add({ ...shopping(), completedAt: 900, summary: 'changed' })).toEqual({ added: false, duplicate: true, persisted: false });
  expect(store.getSnapshot()).toBe(snapshot);
  const reopened = createActivityAlbumStore(() => storage);
  expect(reopened.getSnapshot()).toEqual([{ ...shopping(), favorite: true }]);
  expect(reopened.add(shopping()).duplicate).toBe(true);
  expect(storage.setItem).toHaveBeenCalledTimes(2);
});

it('separates multiple activities in one session and different delivery recipients', () => {
  const store = createActivityAlbumStore(() => null);
  store.add(shopping('same'));
  const input = { sessionId: 'same', completedAt: 600, recipient: '민수', itemCount: 2, items: ['사과', '우유'] };
  store.add(makeCompletedDeliveryActivity(input)!);
  store.add(makeCompletedDeliveryActivity({ ...input, recipient: '지영' })!);
  expect(store.add(makeCompletedDeliveryActivity(input)!).duplicate).toBe(true);
  expect(store.getSnapshot()).toHaveLength(3);
  expect(store.getSnapshot()[0].metrics[0].value).toBe(2);
});

it('keeps the newest bounded records and emits stable immutable snapshots only for changes', () => {
  const store = createActivityAlbumStore(() => null); const listener = jest.fn(); const unsubscribe = store.subscribe(listener);
  expect(store.getSnapshot()).toBe(store.getSnapshot());
  for (let index = 0; index < ACTIVITY_ALBUM_LIMIT + 3; index++) store.add(shopping(String(index), 1000 + index));
  expect(store.getSnapshot()).toHaveLength(ACTIVITY_ALBUM_LIMIT);
  expect(store.getSnapshot()[0].sessionId).toBe(String(ACTIVITY_ALBUM_LIMIT + 2));
  expect(Object.isFrozen(store.getSnapshot()[0].metrics)).toBe(true);
  const count = listener.mock.calls.length;
  expect(store.toggleFavorite('missing')).toBe(false);
  expect(listener).toHaveBeenCalledTimes(count);
  unsubscribe(); store.toggleFavorite(store.getSnapshot()[0].id); expect(listener).toHaveBeenCalledTimes(count);
});

it('survives denied storage and ignores corrupt, duplicated or invalid saved entries', () => {
  const denied = createActivityAlbumStore(() => { throw new Error('denied'); });
  expect(denied.add(shopping()).persisted).toBe(false); expect(denied.getSnapshot()).toHaveLength(1);
  const storage = memory(); const row = { ...shopping(), favorite: true };
  storage.setItem(ACTIVITY_ALBUM_STORAGE_KEY, JSON.stringify({ version: 1, records: [null, row, row, { ...row, completedAt: -1 }, { ...row, id: 'bad', metrics: [{ value: -1 }] }] }));
  expect(createActivityAlbumStore(() => storage).getSnapshot()).toEqual([row]);
  storage.setItem(ACTIVITY_ALBUM_STORAGE_KEY, '{'); expect(createActivityAlbumStore(() => storage).getSnapshot()).toEqual([]);
  storage.setItem(ACTIVITY_ALBUM_STORAGE_KEY, 'x'.repeat(260_000)); expect(createActivityAlbumStore(() => storage).getSnapshot()).toEqual([]);
  expect(makeCompletedShoppingActivity({ sessionId: 'bad', completedAt: 500, itemCount: -2, totalAmount: 10 })).toBeNull();
  expect(makeCompletedDeliveryActivity({ sessionId: 'bad', completedAt: 500, recipient: '', itemCount: 1 })).toBeNull();
});

it('searches activity, recipient, actual item, amount and calendar date; favorites remain a real filter', () => {
  const store = createActivityAlbumStore(() => null);
  const date = new Date(2026, 9, 3, 14, 5).getTime();
  store.add(shopping('paid', date));
  const delivery = makeCompletedDeliveryActivity({ sessionId: 'delivery', completedAt: date, recipient: '민수', itemCount: 1, items: ['우유'] })!;
  store.add(delivery); store.toggleFavorite(delivery.id);
  expect(filterActivityRecords(store.getSnapshot(), '민수 우유')).toHaveLength(1);
  expect(filterActivityRecords(store.getSnapshot(), '2026-10-03')).toHaveLength(2);
  expect(filterActivityRecords(store.getSnapshot(), '7800')).toHaveLength(1);
  expect(filterActivityRecords(store.getSnapshot(), '', true)).toHaveLength(1);
  expect(filterActivityRecords(store.getSnapshot(), '버스')).toHaveLength(0);
});
