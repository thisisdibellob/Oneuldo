import { act, fireEvent, render } from '@testing-library/react-native';

import { recordCompletedShoppingActivity, resetActivityAlbumForTests } from '../src/game/activityAlbum';
import { GameScreen } from '../src/screens/GameScreen';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

afterEach(() => resetActivityAlbumForTests?.());

it('게임 탭은 최근 기록을 하나만 보여 주고, 누르면 전체 기록 창을 열고 확인으로 닫는다', () => {
  const now = Date.now();
  act(() => {
    recordCompletedShoppingActivity({ sessionId: 'tab-a', completedAt: now - 2000, itemCount: 1, totalAmount: 1000 });
    recordCompletedShoppingActivity({ sessionId: 'tab-b', completedAt: now - 1000, itemCount: 2, totalAmount: 2000 });
  });
  const screen = render(<GameScreen onEnter={jest.fn()} />);
  expect(screen.getAllByText(/개 · /)).toHaveLength(1);
  expect(screen.getByText('전체 2개')).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: '최근 기록 전체 보기' }));
  expect(screen.getByTestId('game-history-sheet')).toBeTruthy();
  expect(screen.getAllByText(/개 · /).length).toBeGreaterThanOrEqual(3);
  fireEvent.press(screen.getByRole('button', { name: '확인' }));
});

it('기록이 없어도 최근 기록을 누를 수 있고, 창에 기록이 없다고 알려준다', () => {
  const screen = render(<GameScreen onEnter={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '최근 기록 전체 보기' }));
  expect(screen.getByText('최근 기록이 없어요')).toBeTruthy();
});
