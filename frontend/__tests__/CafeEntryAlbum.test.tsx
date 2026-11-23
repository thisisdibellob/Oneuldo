import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { PhonePhotos } from '../src/components/game/PhonePhotos';
import { GameHud } from '../src/components/game/GameHud';
import {
  createActivityAlbumStore, getActivityAlbum, makeCompletedCafeActivity, makeCompletedShoppingActivity,
  recordCompletedCafeActivity, recordCompletedPhishingActivity, resetActivityAlbumForTests,
} from '../src/game/activityAlbum';
import {
  applyCafeAction, CAFE_GUESTS, createCafeSession, getCafeRecipe, getCurrentCafeGuest, type CafeSession,
} from '../src/game/cafeSession';
import { clearCafeDraft, getCafeDraft, keepCafeDraft, useCafeDraft } from '../src/game/cafeStore';
import { createPhishingSession, reducePhishingSession } from '../src/game/phishingSession';
import { QuestScreen } from '../src/screens/QuestScreen';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

function complete(id = 'cafe-album', withHelp = false): CafeSession {
  let session = applyCafeAction(createCafeSession({ id, now: 100 }), { type: 'START' });
  for (let index = 0; index < CAFE_GUESTS.length; index++) {
    session = applyCafeAction(session, { type: 'TAKE_ORDER' });
    if (getCurrentCafeGuest(session)!.stage === 'order-change') session = applyCafeAction(session, { type: 'ACKNOWLEDGE_CHANGE' });
    if (withHelp && index === 0) {
      session = applyCafeAction(session, { type: 'ASK_HELP' });
      session = applyCafeAction(session, { type: 'ASK_AGAIN' });
      session = applyCafeAction(session, { type: 'CHOOSE_CUP', cup: 'mug' });
      session = applyCafeAction(session, { type: 'REMAKE' });
    }
    const recipe = getCafeRecipe(session)!;
    session = applyCafeAction(session, { type: 'CHOOSE_CUP', cup: recipe.cup });
    for (const ingredient of recipe.ingredients) session = applyCafeAction(session, { type: 'ADD_INGREDIENT', ingredient });
    session = applyCafeAction(session, { type: 'FINISH_DRINK' });
    session = applyCafeAction(session, { type: 'PICK_UP_TRAY' });
    session = applyCafeAction(session, { type: 'SERVE', guestId: getCurrentCafeGuest(session)!.guestId });
    session = applyCafeAction(session, { type: 'CLEAN_TABLE' });
    if (index !== CAFE_GUESTS.length - 1) session = applyCafeAction(session, { type: 'NEXT_GUEST' });
  }
  return applyCafeAction(session, { type: 'REPORT', now: 500 });
}

beforeEach(() => { resetActivityAlbumForTests(); clearCafeDraft(); });
afterEach(clearCafeDraft);

it('launches the real café shift through its quest card instead of the generic practice', () => {
  const onGameQuest = jest.fn(); const onPractice = jest.fn();
  const screen = render(<QuestScreen onGameQuest={onGameQuest} onPractice={onPractice} />);
  fireEvent.press(screen.getByRole('button', { name: '카페 첫 근무 퀘스트 열기' }));
  expect(onGameQuest).toHaveBeenCalledWith('cafe');
  expect(onPractice).not.toHaveBeenCalled();
});

it('records only a fully served, cleaned and reported shift with its actual timestamp and facts', () => {
  const initial = createCafeSession({ id: 'incomplete-cafe', now: 100 });
  expect(makeCompletedCafeActivity(initial)).toBeNull();
  expect(makeCompletedCafeActivity({ ...initial, phase: 'finished', completedAt: 500 })).toBeNull();
  const session = complete();
  expect(makeCompletedCafeActivity(session)).toMatchObject({
    kind: 'cafe', title: '카페 근무 완료', completedAt: 500, summary: '음료 3잔 · 자리 정리 3곳',
    metrics: [{ label: '건넨 음료', value: 3, unit: '잔' }, { label: '정리한 자리', value: 3, unit: '곳' }],
    facts: ['손님 3명에게 주문한 음료를 건넸어요.', '사용한 자리 3곳을 정리했어요.', '지영의 변경된 주문을 확인했어요.'],
  });
  expect(makeCompletedCafeActivity({ ...session, completedAt: 99 })).toBeNull();
  expect(makeCompletedCafeActivity({ ...session, id: '' })).toBeNull();
  expect(makeCompletedCafeActivity({ ...session, guests: session.guests.map((guest, index) => index === 2 ? { ...guest, stage: 'served' } : guest) })).toBeNull();
});

it('includes help, repeated questions and remakes only when they happened', () => {
  const facts = makeCompletedCafeActivity(complete('with-help', true))!.facts;
  expect(facts).toContain('동료에게 도움을 요청했어요.');
  expect(facts).toContain('손님에게 주문을 다시 물어봤어요.');
  expect(facts).toContain('음료를 다시 만들어 주문에 맞췄어요.');
  expect(makeCompletedCafeActivity(complete())!.facts).not.toContain('동료에게 도움을 요청했어요.');
  expect(facts.some(fact => /감점|실패|능력 향상/.test(fact))).toBe(false);
});

it('preserves older activity records and favorites when reopening, deduplicating by café session', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const store = createActivityAlbumStore(() => storage);
  store.add(makeCompletedShoppingActivity({ sessionId: 'previous-market', completedAt: 300, itemCount: 2, totalAmount: 6000 })!);
  const record = makeCompletedCafeActivity(complete())!;
  expect(store.add(record).added).toBe(true);
  store.toggleFavorite(record.id);
  const reopened = createActivityAlbumStore(() => storage);
  expect(reopened.getSnapshot().map(row => row.kind)).toEqual(['cafe', 'shopping']);
  expect(reopened.getSnapshot()[0]).toMatchObject({ favorite: true, completedAt: 500 });
  expect(reopened.add({ ...record, completedAt: 800 }).duplicate).toBe(true);
  recordCompletedCafeActivity(complete());
  recordCompletedCafeActivity(complete());
  expect(getActivityAlbum()).toHaveLength(1);
  expect(getActivityAlbum()[0].completedAt).toBe(500);
});

it('shows café records with an uncropped drink illustration while preserving the contact album', () => {
  const contact = reducePhishingSession(reducePhishingSession(reducePhishingSession(reducePhishingSession(
    createPhishingSession('friend-scam', 'previous-contact', 100), { type: 'STOP' }),
  { type: 'VERIFY', method: 'saved-contact' }), { type: 'BLOCK' }), { type: 'FINISH', now: 400 });
  recordCompletedPhishingActivity(contact);
  recordCompletedCafeActivity(complete('cafe-art', true));
  const screen = render(<PhonePhotos />);
  fireEvent.press(screen.getByRole('tab', { name: '사진 앨범' }));
  expect(screen.getByRole('button', { name: '연락 확인' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '카페 근무' }));
  expect(screen.queryByRole('button', { name: '민수에게 온 연락 기록 열기' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '카페 근무 완료 기록 열기' }));
  expect(screen.getByTestId('cafe-activity-illustration')).toBeTruthy();
  expect(screen.getByTestId('cafe-activity-drink').props.resizeMode).toBe('contain');
  expect(screen.getByText('지영의 변경된 주문을 확인했어요.')).toBeTruthy();
  expect(screen.getByText('동료에게 도움을 요청했어요.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '즐겨찾기에 추가' }));
  expect(getActivityAlbum().find(record => record.kind === 'cafe')?.favorite).toBe(true);
});

it('keeps the current order across reads and screen remounts until an explicit replacement', () => {
  function CurrentOrder() { const session = useCafeDraft(); return <Text testID="draft-status">{session ? `${session.id}:${session.phase}` : '없음'}</Text>; }
  const first = render(<CurrentOrder />);
  expect(first.getByTestId('draft-status').props.children).toBe('없음');
  const initial = createCafeSession({ id: 'resume-cafe', now: 100 });
  const working = applyCafeAction(initial, { type: 'START' });
  act(() => { keepCafeDraft(working); });
  expect(first.getByTestId('draft-status').props.children).toBe('resume-cafe:working');
  expect(getCafeDraft()).toBe(working);
  act(() => { keepCafeDraft(working); });
  expect(getCafeDraft()).toBe(working);
  first.unmount();
  const next = render(<CurrentOrder />);
  expect(next.getByTestId('draft-status').props.children).toBe('resume-cafe:working');
  act(() => { clearCafeDraft(); });
  expect(next.getByTestId('draft-status').props.children).toBe('없음');
});

it('opens café work from the shared diary after closing it and reflects the current order', async () => {
  jest.useFakeTimers();
  const onOpenCafe = jest.fn();
  const onMenuVisibilityChange = jest.fn();
  const screen = render(<GameHud controlMode="joystick" dailyQuests={[]} onControlModeChange={jest.fn()}
    onEmergencyExit={jest.fn()} onExit={jest.fn()} onMenuVisibilityChange={onMenuVisibilityChange} onOpenCafe={onOpenCafe} />);
  try {
    fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
    expect(screen.getByRole('button', { name: '수상한 연락 확인하기' })).toBeTruthy();
    expect(screen.getByText('주문받기 · 음료 만들기 · 자리 정리')).toBeTruthy();
    act(() => { keepCafeDraft(applyCafeAction(createCafeSession({ id: 'diary-cafe', now: 100 }), { type: 'START' })); });
    expect(screen.getByText('민수에게 주문 받기')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '카페 첫 근무 열기' }));
    expect(onOpenCafe).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(240); await Promise.resolve(); });
    expect(onOpenCafe).toHaveBeenCalledTimes(1);
    expect(onMenuVisibilityChange).toHaveBeenLastCalledWith(false);
    expect(onMenuVisibilityChange.mock.invocationCallOrder.at(-1)).toBeLessThan(onOpenCafe.mock.invocationCallOrder[0]);
    expect(screen.queryByRole('button', { name: '카페 첫 근무 열기' })).toBeNull();
  } finally { screen.unmount(); jest.useRealTimers(); }
});
