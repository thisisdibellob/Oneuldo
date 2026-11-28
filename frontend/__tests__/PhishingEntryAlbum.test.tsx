import { fireEvent, render } from '@testing-library/react-native';
import { PhonePhotos } from '../src/components/game/PhonePhotos';
import {
  createActivityAlbumStore, createPhishingActivity, getActivityAlbum, makeCompletedShoppingActivity,
  recordCompletedPhishingActivity, recordCompletedShoppingActivity, resetActivityAlbumForTests,
} from '../src/game/activityAlbum';
import { createPhishingSession, reducePhishingSession, type PhishingAction, type PhishingScenarioId } from '../src/game/phishingSession';
import { QuestScreen } from '../src/screens/QuestScreen';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

const complete = (scenarioId: PhishingScenarioId = 'friend-scam', actions: PhishingAction[] = []) => [
  ...actions,
  { type: 'STOP' }, { type: 'VERIFY', method: 'saved-contact' },
  ...(scenarioId === 'friend-real' ? [{ type: 'GENUINE_DECISION', decision: 'decline' }] : [{ type: 'BLOCK' }]),
  { type: 'FINISH', now: 500 },
].reduce((session, action) => reducePhishingSession(session, action as PhishingAction), createPhishingSession(scenarioId, `album-${scenarioId}`, 100));

beforeEach(() => resetActivityAlbumForTests());

it('launches the contact episode from the safety quest category instead of the generic practice', () => {
  const onGameQuest = jest.fn(); const onPractice = jest.fn();
  const screen = render(<QuestScreen onGameQuest={onGameQuest} onPractice={onPractice} />);
  fireEvent.press(screen.getAllByText('안전')[0]);
  const card = screen.getByRole('button', { name: '수상한 연락 확인하기 퀘스트 열기' });
  expect(screen.getByText(/한 이야기 3~5분/)).toBeTruthy();
  fireEvent.press(card);
  expect(onGameQuest).toHaveBeenCalledWith('phishing');
  expect(onPractice).not.toHaveBeenCalled();
});

it('records only completed and verified episodes, preserving the actual help and recovery choices', () => {
  const active = createPhishingSession('friend-scam', 'active', 100);
  expect(createPhishingActivity(active)).toBeNull();
  expect(createPhishingActivity({ ...active, status: 'completed', completedAt: 500 })).toBeNull();
  const session = complete('friend-scam', [{ type: 'ASK_HELP' }]);
  expect(createPhishingActivity(session)).toMatchObject({
    kind: 'safety', title: '민수에게 온 연락', completedAt: 500, summary: '사칭 연락 확인 · 차단',
    metrics: [{ label: '확인한 연락', value: 1, unit: '건' }, { label: '도움 요청', value: 1, unit: '회' }],
    facts: expect.arrayContaining(['지영에게 도움을 요청했어요.', '원래 저장된 민수의 연락처로 확인했어요.']),
  });
  expect(createPhishingActivity({ ...session, completedAt: 99 })).toBeNull();
  expect(createPhishingActivity({ ...session, exposure: 'money', reported: false, bankContacted: false })).toBeNull();
  const recovered = complete('friend-scam', [
    { type: 'SIMULATE_EXPOSURE', exposure: 'money' }, { type: 'STOP' }, { type: 'REPORT' }, { type: 'CONTACT_BANK' },
  ]);
  expect(createPhishingActivity(recovered)?.facts).toEqual(expect.arrayContaining([
    '돈을 이미 보낸 상황에서 대처를 연습했어요.', '112에 상황과 연락 내용을 알리는 연습을 했어요.',
    '금융회사에 지급정지를 요청하는 연습을 했어요.',
  ]));
});

it('records a genuine contact and a declined invitation without inventing a block or failure', () => {
  const record = createPhishingActivity(complete('friend-real'))!;
  expect(record.summary).toBe('연락을 확인하고 약속을 사양했어요');
  expect(record.facts).toContain('민수의 연락임을 확인한 뒤 이번 약속은 사양했어요.');
  expect(record.facts).not.toContain('해당 연락을 차단했어요.');
  expect(record.metrics).toEqual([{ label: '확인한 연락', value: 1, unit: '건' }]);
});

it('keeps older album entries and saves a contact completion once across reopening', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const store = createActivityAlbumStore(() => storage);
  store.add(makeCompletedShoppingActivity({ sessionId: 'old-shopping', completedAt: 300, itemCount: 3, totalAmount: 6000 })!);
  const record = createPhishingActivity(complete())!;
  expect(store.add(record).added).toBe(true);
  store.toggleFavorite(record.id);
  const reopened = createActivityAlbumStore(() => storage);
  expect(reopened.getSnapshot().map(row => row.kind)).toEqual(['safety', 'shopping']);
  expect(reopened.getSnapshot()[0].favorite).toBe(true);
  expect(reopened.add({ ...record, completedAt: 800 }).duplicate).toBe(true);
  expect(reopened.getSnapshot()[0].completedAt).toBe(500);
  recordCompletedPhishingActivity(complete());
  recordCompletedPhishingActivity(complete());
  expect(getActivityAlbum()).toHaveLength(1);
});

it('shows contact records in their own album with a phone illustration and actual selected actions', () => {
  recordCompletedShoppingActivity({ sessionId: 'market', completedAt: 300, itemCount: 1, totalAmount: 1200 });
  recordCompletedPhishingActivity(complete('friend-real'));
  const screen = render(<PhonePhotos />);
  fireEvent.press(screen.getByRole('tab', { name: '사진 앨범' }));
  fireEvent.press(screen.getByRole('button', { name: '연락 확인' }));
  expect(screen.queryByRole('button', { name: '장보기 완료 기록 열기' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '민수의 새 연락 기록 열기' }));
  expect(screen.getByTestId('safety-activity-illustration')).toBeTruthy();
  expect(screen.getByText('민수의 연락임을 확인한 뒤 이번 약속은 사양했어요.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '즐겨찾기에 추가' }));
  expect(getActivityAlbum().find(record => record.kind === 'safety')?.favorite).toBe(true);
});
