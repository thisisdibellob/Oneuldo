import { fireEvent, render } from '@testing-library/react-native';
import { MarketSimulationScreen } from '../src/screens/MarketSimulationScreen';
import { buildMarketScenarioMission } from '../src/game/scenarios';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve(), useFonts: () => [true, null] }));
jest.mock('expo-haptics', () => ({ ImpactFeedbackStyle: { Light: 'light' }, impactAsync: () => Promise.resolve() }));

it('S01 목록의 규격과 구매 단위를 표시하고 15종 진열 목록에서 재고를 넘겨 담지 못한다', () => {
  const mission = buildMarketScenarioMission('S01');
  const screen = render(<MarketSimulationScreen embedded mission={mission} onExit={jest.fn()}
    interactionRequest={{ id: 1, station: 'fresh' }} />);
  fireEvent.press(screen.getByText('다음'));
  fireEvent.press(screen.getByText('장보기 시작'));
  expect(screen.getByText('900mL · 구매 단위: 개')).toBeTruthy();
  expect(screen.getAllByText(/진열 재고 5/)).toHaveLength(6);
  expect(screen.getByText('작은 흰 우유')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('흰 우유 담기'));
  for (let i = 0; i < 4; i++) fireEvent.press(screen.getByLabelText('흰 우유 한 개 더 담기'));
  expect(screen.getByLabelText('흰 우유 한 개 더 담기')).toBeDisabled();
  expect(screen.getByText('진열 재고 0개')).toBeTruthy();
  expect(screen.getByText('흰 우유 900mL 1개')).toBeTruthy();
});

it('S02 초록 사과를 담으면 사과 목표 수량에 함께 표시한다', () => {
  const screen = render(<MarketSimulationScreen embedded mission={buildMarketScenarioMission('S02')} onExit={jest.fn()}
    interactionRequest={{ id: 2, station: 'produce' }} />);
  fireEvent.press(screen.getByText('다음'));
  fireEvent.press(screen.getByText('장보기 시작'));
  fireEvent.press(screen.getByLabelText('초록 사과 담기'));
  fireEvent.press(screen.getByLabelText('초록 사과 한 개 더 담기'));
  expect(screen.getByText('2/2 개')).toBeTruthy();
});
