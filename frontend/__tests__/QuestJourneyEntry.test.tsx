import { act, fireEvent, render } from '@testing-library/react-native';
import { QuestScreen } from '../src/screens/QuestScreen';
import { dispatchDayJourney, resetDayJourneyForTests } from '../src/game/dayJourney';
import { offerShoppingErrand, resetShoppingErrandForTests } from '../src/game/shoppingErrandStore';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
beforeEach(() => { resetDayJourneyForTests(); resetShoppingErrandForTests(); });
it('opens the shared world for the full day, bus, shopping and café work', () => {
  const onGameQuest = jest.fn(); const onPractice = jest.fn();
  const screen = render(<QuestScreen onGameQuest={onGameQuest} onPractice={onPractice} />);
  fireEvent.press(screen.getByRole('button', { name: '도서관 다녀오기 퀘스트 열기' }));
  expect(onGameQuest).toHaveBeenLastCalledWith('day');
  fireEvent.press(screen.getByText('혼자 버스 타기')); expect(onGameQuest).toHaveBeenLastCalledWith('bus');
  fireEvent.press(screen.getByText('마트에서 장보기')); expect(onGameQuest).toHaveBeenLastCalledWith('market');
  fireEvent.press(screen.getByText('카페 첫 근무')); expect(onGameQuest).toHaveBeenLastCalledWith('cafe');
  expect(onPractice).not.toHaveBeenCalled();
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
