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
// The library day story card was removed from the quest tab (user request 2026-11-27); the errand story still opens the
// shared world, and server quest cards (including the bus quest) keep the AI practice flow.
it('opens the shared world for the errand story while server quest cards stay on practice', () => {
  const onGameQuest = jest.fn(); const onQuest = jest.fn();
  const screen = render(<QuestScreen error={null} loading={false} onGameQuest={onGameQuest} onQuest={onQuest}
    quests={[busQuest]} showPersonalDifficulty={false} />);
  expect(screen.queryByRole('button', { name: '도서관 다녀오기 퀘스트 열기' })).toBeNull();
  fireEvent.press(screen.getByText('혼자 버스 타기'));
  expect(onQuest).toHaveBeenLastCalledWith('quest-bus');
  expect(onGameQuest).not.toHaveBeenCalled();
  act(() => { dispatchDayJourney({ type: 'start', at: 100 }); });
  expect(screen.queryByText('이어서 하기 · 0/4')).toBeNull();
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
