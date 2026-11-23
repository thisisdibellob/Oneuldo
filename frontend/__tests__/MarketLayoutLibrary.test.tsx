import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { MarketLayoutLibrary, type MarketLayoutLibraryStore } from '../src/components/game/MarketLayoutLibrary';
import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { createMarketTilemapFromEnvironment } from '../src/game/marketTilemap';
import type { SavedMarketLayout } from '../src/game/marketLayoutStore';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('../src/game/marketLayoutStore', () => ({
  marketLayoutStore: {}, MAX_SAVED_MARKET_LAYOUTS: 24, MAX_MARKET_LAYOUT_NAME_LENGTH: 32,
}));

const map = () => createMarketTilemapFromEnvironment(createMarketEnvironment({ seed: 'grid-test', employeeCount: 2, customerCount: 2, pillarCount: 0, chairCount: 0, cashierCount: 2, kioskPresent: false }));
const entry = (id = 'saved-1', name = '우리 동네 마트'): SavedMarketLayout => ({ id, name, createdAt: '2026-10-17T01:00:00.000Z', updatedAt: '2026-10-17T01:00:00.000Z', tilemap: map() });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function memoryStore(initial: SavedMarketLayout[] = []) {
  let saved = clone(initial);
  const store: MarketLayoutLibraryStore = {
    list: jest.fn(async () => clone(saved)),
    save: jest.fn(async (input) => {
      const existing = saved.find(item => item.id === input.id);
      const item = { ...entry(input.id ?? `saved-${saved.length + 1}`, input.name.trim()), ...existing, name: input.name.trim(), tilemap: clone(input.tilemap), updatedAt: '2026-10-17T02:00:00.000Z' };
      saved = [...saved.filter(previous => previous.id !== item.id), item];
      return clone(item);
    }),
    rename: jest.fn(async (id, name) => {
      const item = saved.find(item => item.id === id)!;
      item.name = name.trim(); return clone(item);
    }),
    duplicate: jest.fn(async (id, name) => {
      const original = saved.find(item => item.id === id)!;
      const item = { ...clone(original), id: `saved-${saved.length + 1}`, name: name ?? `${original.name} 복사본` };
      saved.push(item); return clone(item);
    }),
    remove: jest.fn(async id => { saved = saved.filter(item => item.id !== id); }),
  };
  return store;
}
const open = async (store: MarketLayoutLibraryStore, extra: Partial<React.ComponentProps<typeof MarketLayoutLibrary>> = {}) => {
  const onLoad = jest.fn();
  const getCurrentLayout = jest.fn(map);
  const screen = render(<MarketLayoutLibrary store={store} getCurrentLayout={getCurrentLayout} onLoad={onLoad} {...extra} />);
  await waitFor(() => expect(screen.queryByText('보관함을 열고 있어요')).toBeNull());
  return { ...screen, onLoad, getCurrentLayout };
};

it('saves the latest validated draft by name and reopens it from the store without applying the game', async () => {
  const store = memoryStore();
  const latest = map(); latest.people = latest.people.filter(person => person.kind === 'employee');
  const getCurrentLayout = jest.fn(() => latest);
  const screen = await open(store, { getCurrentLayout });
  fireEvent.changeText(screen.getByLabelText('새 배치 이름'), '조용한 마트');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '새로 저장' })); });
  expect(getCurrentLayout).toHaveBeenCalledTimes(1);
  expect(store.save).toHaveBeenCalledWith({ name: '조용한 마트', tilemap: latest });
  expect(screen.getByText('종업원 2 · 손님 0')).toBeTruthy();
  expect(screen.onLoad).not.toHaveBeenCalled();
  screen.unmount();
  const reopened = await open(store);
  fireEvent.press(reopened.getByRole('button', { name: '조용한 마트 배치 불러오기' }));
  expect(reopened.onLoad).toHaveBeenCalledWith(latest);
  expect(reopened.onLoad.mock.calls[0][0]).not.toBe(latest);
});

it('keeps a typed name and avoids writes when the pending draft cannot be saved', async () => {
  const store = memoryStore();
  const screen = await open(store, { getCurrentLayout: () => { throw new Error('과일·채소 진열대가 벽과 겹쳐요.'); } });
  fireEvent.changeText(screen.getByLabelText('새 배치 이름'), '통로를 고칠 마트');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '새로 저장' })); });
  expect(screen.getByRole('alert', { name: '과일·채소 진열대가 벽과 겹쳐요.' })).toBeTruthy();
  expect(screen.getByLabelText('새 배치 이름').props.value).toBe('통로를 고칠 마트');
  expect(store.save).not.toHaveBeenCalled();
});

it('requires explicit overwrite confirmation and leaves the saved layout unchanged on cancel', async () => {
  const store = memoryStore([entry()]);
  const latest = map(); latest.shelves[0].col += 1;
  const screen = await open(store, { getCurrentLayout: () => latest });
  fireEvent.press(screen.getByRole('button', { name: '우리 동네 마트 배치 관리' }));
  fireEvent.press(screen.getByRole('button', { name: '현재 배치로 덮어쓰기' }));
  expect(store.save).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: '우리 동네 마트 덮어쓰기 취소' }));
  expect(store.save).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: '현재 배치로 덮어쓰기' }));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '우리 동네 마트 덮어쓰기 확인' })); });
  expect(store.save).toHaveBeenCalledWith({ id: 'saved-1', name: '우리 동네 마트', tilemap: latest });
  expect(screen.onLoad).not.toHaveBeenCalled();
});

it('can rename, duplicate and delete a saved layout without touching the current draft', async () => {
  const store = memoryStore([entry()]);
  const screen = await open(store);
  fireEvent.press(screen.getByRole('button', { name: '우리 동네 마트 배치 관리' }));
  fireEvent.changeText(screen.getByLabelText('우리 동네 마트 새 이름'), '첫 연습');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '우리 동네 마트 이름 변경' })); });
  fireEvent.press(screen.getByRole('button', { name: '첫 연습 배치 관리' }));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '첫 연습 배치 복제' })); });
  expect(screen.getByRole('button', { name: '첫 연습 복사본 배치 불러오기' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '첫 연습 복사본 배치 관리' }));
  fireEvent.press(screen.getByRole('button', { name: '첫 연습 복사본 배치 삭제' }));
  expect(store.remove).not.toHaveBeenCalled();
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '첫 연습 복사본 삭제 확인' })); });
  expect(screen.queryByRole('button', { name: '첫 연습 복사본 배치 불러오기' })).toBeNull();
  expect(screen.getByRole('button', { name: '첫 연습 배치 불러오기' })).toBeTruthy();
  expect(screen.getCurrentLayout).not.toHaveBeenCalled();
  expect(screen.onLoad).not.toHaveBeenCalled();
});

it('does not report failed persistent writes as successful or discard the name', async () => {
  const store = memoryStore();
  jest.mocked(store.save).mockRejectedValue(new Error('기기 저장 공간을 확인해 주세요.'));
  const screen = await open(store);
  fireEvent.changeText(screen.getByLabelText('새 배치 이름'), '보존할 이름');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '새로 저장' })); });
  expect(screen.getByRole('alert', { name: '기기 저장 공간을 확인해 주세요.' })).toBeTruthy();
  expect(screen.getByLabelText('새 배치 이름').props.value).toBe('보존할 이름');
  expect(screen.queryByRole('button', { name: '보존할 이름 배치 불러오기' })).toBeNull();
});

it('blocks writes after a failed read and allows retry without silently replacing data', async () => {
  const store = memoryStore([entry()]);
  jest.mocked(store.list).mockRejectedValueOnce(new Error('저장한 배치를 읽지 못했어요.'));
  const screen = await open(store);
  expect(screen.getByRole('button', { name: '새로 저장' }).props.accessibilityState.disabled).toBe(true);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '보관함 다시 읽기' })); });
  expect(screen.getByRole('button', { name: '우리 동네 마트 배치 불러오기' })).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(store.save).not.toHaveBeenCalled();
});

it('blocks additional saves and duplication at the limit but still supports overwrite and delete', async () => {
  const store = memoryStore(Array.from({ length: 24 }, (_, i) => entry(`saved-${i}`, `내 마트 ${i + 1}`)));
  const screen = await open(store);
  expect(screen.getByLabelText('새 배치 이름').props.value).toBe('내 마트 25');
  expect(screen.getByRole('button', { name: '새로 저장' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: '내 마트 1 배치 관리' }));
  expect(screen.getByRole('button', { name: '내 마트 1 배치 복제' }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByRole('button', { name: '현재 배치로 덮어쓰기' }).props.accessibilityState.disabled).toBe(false);
  expect(screen.getByRole('button', { name: '내 마트 1 배치 삭제' }).props.accessibilityState.disabled).toBe(false);
});

it('reports an incompatible stored layout without mutating the saved data', async () => {
  const store = memoryStore([entry()]);
  const screen = await open(store, { onLoad: () => { throw new Error('현재 계산대까지 가는 통로가 막혀요.'); } });
  fireEvent.press(screen.getByRole('button', { name: '우리 동네 마트 배치 불러오기' }));
  expect(screen.getByRole('alert', { name: '현재 계산대까지 가는 통로가 막혀요.' })).toBeTruthy();
  expect(store.save).not.toHaveBeenCalled();
  expect(store.remove).not.toHaveBeenCalled();
});

it('uses the same 32 Unicode character limit as persistent names without splitting emoji', async () => {
  const store = memoryStore();
  const screen = await open(store);
  fireEvent.changeText(screen.getByLabelText('새 배치 이름'), `${'가'.repeat(30)}🏡🍎초과`);
  expect(screen.getByLabelText('새 배치 이름').props.value).toBe(`${'가'.repeat(30)}🏡🍎`);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '새로 저장' })); });
  expect(jest.mocked(store.save).mock.calls[0][0].name).toBe(`${'가'.repeat(30)}🏡🍎`);
});
