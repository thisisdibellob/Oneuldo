import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { GameHud } from '../src/components/game/GameHud';
import { PhonePhotos } from '../src/components/game/PhonePhotos';
import { QuestScreen } from '../src/screens/QuestScreen';
import {
  createActivityAlbumStore, getActivityAlbum, makeCompletedLaundryActivity, makeCompletedShoppingActivity,
  recordCompletedLaundryActivity, resetActivityAlbumForTests,
} from '../src/game/activityAlbum';
import {
  applyLaundryAction, createLaundrySession, LAUNDRY_ITEMS, type LaundryAction, type LaundrySession,
} from '../src/game/laundrySession';
import { clearLaundryDraft, getLaundryDraft, keepLaundryDraft, useLaundryDraft } from '../src/game/laundryStore';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

function complete(id = 'laundry-album', withHelp = false): LaundrySession {
  let session = createLaundrySession({ id, now: 1_000 });
  const dispatch = (action: LaundryAction) => { session = applyLaundryAction(session, action); };
  dispatch({ type: 'PACK_ALL' }); dispatch({ type: 'LEAVE_HOME' }); dispatch({ type: 'ARRIVE_LAUNDROMAT' });
  if (withHelp) dispatch({ type: 'ASK_HELP' });
  for (const item of LAUNDRY_ITEMS) {
    dispatch({ type: 'INSPECT_CARE', itemId: item.id });
    dispatch({ type: 'INSPECT_POCKET', itemId: item.id });
    if (item.pocketItem) dispatch({ type: 'REMOVE_RECEIPT', itemId: item.id });
    dispatch({ type: 'SORT', itemId: item.id, batchId: item.batchId });
  }
  if (withHelp) dispatch({ type: 'PAY_WASH', batchId: 'lights', machineId: 'washer-1' });
  let now = 1_000;
  for (const batchId of ['lights', 'colors'] as const) {
    dispatch({ type: 'PAY_WASH', batchId, machineId: 'washer-2' });
    dispatch({ type: 'START_WASH', batchId, machineId: 'washer-2', now });
    now += 6_000;
    dispatch({ type: 'FINISH_WASH', batchId, now });
  }
  for (const item of LAUNDRY_ITEMS) dispatch({ type: 'SELECT_DRYING', itemId: item.id, method: item.dryMethod });
  for (const method of ['low', 'air'] as const) dispatch({ type: 'START_DRY', method, now });
  now += 6_000;
  for (const method of ['low', 'air'] as const) dispatch({ type: 'FINISH_DRY', method, now });
  for (const item of LAUNDRY_ITEMS.filter(item => item.foldable)) dispatch({ type: 'FOLD', itemId: item.id });
  dispatch({ type: 'PAIR_SOCKS' }); dispatch({ type: 'ARRIVE_HOME' }); dispatch({ type: 'PUT_AWAY', now: 20_000 });
  return session;
}

beforeEach(() => { resetActivityAlbumForTests(); clearLaundryDraft(); });
afterEach(clearLaundryDraft);

it('opens laundry in the shared world through the lifestyle quest filter', () => {
  const onGameQuest = jest.fn(); const onPractice = jest.fn();
  const screen = render(<QuestScreen onPractice={onPractice} onGameQuest={onGameQuest} />);
  fireEvent.press(screen.getByText('생활 훈련'));
  expect(screen.queryByText('혼자 버스 타기')).toBeNull();
  expect(screen.getByText('카페 첫 근무')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '동네 빨래방 퀘스트 열기' }));
  expect(onGameQuest).toHaveBeenCalledWith('laundry');
  expect(onPractice).not.toHaveBeenCalled();
});

it('records only genuinely completed home wardrobe work with its own timestamp and actual facts', () => {
  const initial = createLaundrySession({ id: 'not-finished', now: 1_000 });
  expect(makeCompletedLaundryActivity(initial)).toBeNull();
  expect(makeCompletedLaundryActivity({ ...initial, phase: 'finished', completedAt: 20_000 })).toBeNull();
  const session = complete();
  expect(makeCompletedLaundryActivity(session)).toMatchObject({
    kind: 'laundry', title: '빨래 정리 완료', completedAt: 20_000, summary: '세탁 6개 · 옷장 정리 완료',
    metrics: [{ label: '세탁한 빨래', value: 6, unit: '개' }, { label: '갠 빨래', value: 4, unit: '개' }, { label: '맞춘 양말', value: 1, unit: '쌍' }],
  });
  expect(makeCompletedLaundryActivity({ ...session, homeArrivalConfirmed: false })).toBeNull();
  expect(makeCompletedLaundryActivity({ ...session, id: '' })).toBeNull();
  expect(makeCompletedLaundryActivity({ ...session, completedAt: 999 })).toBeNull();
  expect(makeCompletedLaundryActivity(session)?.facts).not.toContain('빨래 안내를 다시 확인했어요.');
  expect(makeCompletedLaundryActivity(complete('help', true))?.facts).toContain('빨래 안내를 다시 확인했어요.');
});

it('preserves previous activity records and favorites, including when laundry storage is reopened', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const store = createActivityAlbumStore(() => storage);
  const previous = makeCompletedShoppingActivity({ sessionId: 'previous-market', completedAt: 300, itemCount: 2, totalAmount: 6000 })!;
  store.add(previous); store.toggleFavorite(previous.id);
  const record = makeCompletedLaundryActivity(complete())!;
  expect(store.add(record).added).toBe(true);
  const reopened = createActivityAlbumStore(() => storage);
  expect(reopened.getSnapshot().map(row => row.kind)).toEqual(['laundry', 'shopping']);
  expect(reopened.getSnapshot()[1].favorite).toBe(true);
  expect(reopened.add({ ...record, completedAt: 25_000 }).duplicate).toBe(true);
  recordCompletedLaundryActivity(complete()); recordCompletedLaundryActivity(complete());
  expect(getActivityAlbum()).toHaveLength(1);
  expect(getActivityAlbum()[0].completedAt).toBe(20_000);
});

it('shows a contained basket illustration and the actual completed laundry facts in Photos', () => {
  recordCompletedLaundryActivity(complete('photo', true));
  const screen = render(<PhonePhotos />);
  fireEvent.press(screen.getByRole('tab', { name: '사진 앨범' }));
  expect(screen.getByRole('button', { name: '카페 근무' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '연락 확인' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '빨래하는 날' }));
  fireEvent.press(screen.getByRole('button', { name: '빨래 정리 완료 기록 열기' }));
  expect(screen.getByTestId('laundry-activity-illustration')).toBeTruthy();
  expect(screen.getByTestId('laundry-activity-basket').props.resizeMode).toBe('contain');
  expect(screen.getByText('집으로 돌아와 옷장에 정리했어요.')).toBeTruthy();
  expect(screen.getByText('사용 중인 세탁기를 확인하고 빈 세탁기를 골랐어요.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '즐겨찾기에 추가' }));
  expect(getActivityAlbum()[0].favorite).toBe(true);
});

it('keeps the same basket when a subscribed room screen unmounts and another screen opens', () => {
  function BasketStatus() { const session = useLaundryDraft(); return <Text testID="basket-status">{session ? `${session.id}:${session.phase}` : '없음'}</Text>; }
  const first = render(<BasketStatus />);
  const travelling = applyLaundryAction(applyLaundryAction(createLaundrySession({ id: 'same-basket', now: 1_000 }), { type: 'PACK_ALL' }), { type: 'LEAVE_HOME' });
  act(() => { keepLaundryDraft(travelling); });
  expect(first.getByTestId('basket-status').props.children).toBe('same-basket:travel');
  first.unmount();
  const second = render(<BasketStatus />);
  expect(second.getByTestId('basket-status').props.children).toBe('same-basket:travel');
  expect(getLaundryDraft()).toBe(travelling);
  act(() => { clearLaundryDraft(); });
  expect(second.getByTestId('basket-status').props.children).toBe('없음');
});

it('closes the diary before opening laundry and updates the card with the saved basket objective', async () => {
  jest.useFakeTimers();
  const onOpenLaundry = jest.fn(); const onMenuVisibilityChange = jest.fn();
  const screen = render(<GameHud controlMode="joystick" dailyQuests={[]} onControlModeChange={jest.fn()}
    onEmergencyExit={jest.fn()} onExit={jest.fn()} onMenuVisibilityChange={onMenuVisibilityChange}
    onOpenLaundry={onOpenLaundry} onOpenCafe={jest.fn()} />);
  try {
    fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
    expect(screen.getByRole('button', { name: '카페 첫 근무 열기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '수상한 연락 확인하기' })).toBeTruthy();
    expect(screen.getByText('빨래 챙기기 · 세탁하기 · 옷장 정리')).toBeTruthy();
    const travelling = applyLaundryAction(applyLaundryAction(createLaundrySession({ id: 'diary-laundry', now: 1_000 }), { type: 'PACK_ALL' }), { type: 'LEAVE_HOME' });
    act(() => { keepLaundryDraft(travelling); });
    expect(screen.getByText('마을 세탁소에 들어가기')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '동네 빨래방 열기' }));
    expect(onOpenLaundry).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(240); await Promise.resolve(); });
    expect(onOpenLaundry).toHaveBeenCalledTimes(1);
    expect(onMenuVisibilityChange).toHaveBeenLastCalledWith(false);
    expect(onMenuVisibilityChange.mock.invocationCallOrder.at(-1)).toBeLessThan(onOpenLaundry.mock.invocationCallOrder[0]);
  } finally { screen.unmount(); jest.useRealTimers(); }
});

it('does not show a laundry diary button without a host entry callback', () => {
  const screen = render(<GameHud controlMode="joystick" dailyQuests={[]} onControlModeChange={jest.fn()}
    onEmergencyExit={jest.fn()} onExit={jest.fn()} onMenuVisibilityChange={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
  expect(screen.queryByRole('button', { name: '동네 빨래방 열기' })).toBeNull();
});
