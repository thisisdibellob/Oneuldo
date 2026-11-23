import { act, fireEvent, render } from '@testing-library/react-native';
import { QuestScreen } from '../src/screens/QuestScreen';
import type { QuestSummary } from '../src/api/quest';
import { dispatchDayJourney, resetDayJourneyForTests } from '../src/game/dayJourney';
import { offerShoppingErrand, resetShoppingErrandForTests } from '../src/game/shoppingErrandStore';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
beforeEach(() => { resetDayJourneyForTests(); resetShoppingErrandForTests(); });
const busQuest: QuestSummary = {
  categoryCode: 'PUBLIC_TRANSPORT', categoryName: '대중교통', difficulty: 'EASY', id: 'quest-bus',
  rewardPoints: 20, summary: '목적지까지 가는 버스를 찾아봐요.', title: '혼자 버스 타기',
};
// Village story quests open the shared world; server quest cards (including the bus quest) keep the AI practice flow.
it('opens the shared world for the day and errand stories while server quest cards stay on practice', () => {
  const onGameQuest = jest.fn(); const onQuest = jest.fn();
  const screen = render(<QuestScreen error={null} loading={false} onGameQuest={onGameQuest} onQuest={onQuest}
    quests={[busQuest]} showPersonalDifficulty={false} />);
  fireEvent.press(screen.getByRole('button', { name: '도서관 다녀오기 퀘스트 열기' }));
  expect(onGameQuest).toHaveBeenLastCalledWith('day');
  fireEvent.press(screen.getByText('혼자 버스 타기'));
  expect(onQuest).toHaveBeenLastCalledWith('quest-bus');
  expect(onGameQuest).toHaveBeenCalledTimes(1);
  act(() => { dispatchDayJourney({ type: 'start', at: 100 }); });
  expect(screen.getByText('이어서 하기 · 0/4')).toBeTruthy();
  act(() => { offerShoppingErrand('finished-library'); });
  fireEvent.press(screen.getByRole('button', { name: '퇴근길 장보기 퀘스트 열기' }));
  expect(onGameQuest).toHaveBeenLastCalledWith('errand');
});

it('retains the practice fallback when a host does not provide a game callback', () => {
  const onPractice = jest.fn();
  const screen = render(<QuestScreen onPractice={onPractice} />);
  fireEvent.press(screen.getByRole('button', { name: '카페 첫 근무 퀘스트 열기' }));
  expect(onPractice).toHaveBeenCalledTimes(1);
});
