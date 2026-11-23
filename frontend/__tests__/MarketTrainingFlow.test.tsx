import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { MarketSetupPanel } from '../src/components/game/MarketSetupPanel';
import { MarketSimulationScreen } from '../src/screens/MarketSimulationScreen';
import { createMarketSession } from '../src/game/marketSession';
import { buildMarketScenarioMission } from '../src/game/scenarios';

jest.mock('expo-font', () => ({
  isLoaded: () => true,
  loadAsync: async () => undefined,
}));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: async () => undefined,
  useAudioPlayer: () => {
    const React = jest.requireActual('react');
    return React.useRef({
      pause: jest.fn(),
      play: jest.fn(),
      seekTo: async () => undefined,
      volume: 1,
    }).current;
  },
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));
jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map();
  return {
    __esModule: true,
    default: {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
    },
  };
});
test('a custom mother request saves and restores the complete list and hint/incident conditions', async () => {
  const config = createMarketSession({
    objectives: [{ productId: 'milk', quantity: 1 }],
    learning: { stockoutEnabled: false, budgetChoiceEnabled: false },
  }).config;
  const onApply = jest.fn(),
    view = render(
      <MarketSetupPanel config={config} onApply={onApply} onClose={jest.fn()} />
    );
  fireEvent.press(view.getByRole('button', { name: '과제·힌트·돌발 상황' }));
  fireEvent.press(view.getByRole('button', { name: '어머니 심부름' }));
  fireEvent.press(view.getByRole('button', { name: '지도 제공' }));
  fireEvent.press(view.getByRole('button', { name: '두 상황 모두' }));
  fireEvent.press(view.getByRole('button', { name: '부탁 물건 목록' }));
  const productName = require('../src/game/scenarios').getMarketProduct(
    'milk'
  ).name;
  fireEvent.press(
    view.getByRole('button', { name: productName + ' 수량 늘리기' })
  );
  fireEvent.changeText(view.getByLabelText('테스트 이름'), '어머니 · 두 개');
  fireEvent.press(
    view.getByRole('button', { name: '현재 조건을 테스트로 저장' })
  );
  await waitFor(() =>
    expect(
      view.getByRole('button', { name: '테스트 선택 어머니 · 두 개' })
    ).toBeTruthy()
  );
  fireEvent.press(view.getByRole('button', { name: '기본 장보기' }));
  fireEvent.press(
    view.getByRole('button', { name: '테스트 선택 어머니 · 두 개' })
  );
  fireEvent.press(view.getByRole('button', { name: '설정 적용' }));
  expect(onApply.mock.calls[0][0]).toMatchObject({
    objectives: [{ productId: 'milk', quantity: 2 }],
    training: {
      task: 'mother-request',
      mapHint: true,
      directionHint: false,
      incidents: 'both',
    },
  });
  view.unmount();
});
test('the finder task exposes its optional map and completion only after starting, then shows the recorded route', async () => {
  jest.useFakeTimers();
  const session = createMarketSession({
    objectives: [{ productId: 'milk', quantity: 1 }],
    learning: { stockoutEnabled: false, budgetChoiceEnabled: false },
    training: { task: 'shelf-finder', mapHint: true },
  });
  const player = { current: { ...session.environment.spawn } };
  let request: null | { id: number; station: 'fresh' } = null;
  const element = () => (
    <MarketSimulationScreen
      embedded
      environment={session.environment}
      initialConfig={session.config}
      playerPositionRef={player}
      interactionRequest={request}
      onExit={jest.fn()}
    />
  );
  const view = render(element());
  try {
    expect(view.queryByRole('button', { name: '매장 지도' })).toBeNull();
    fireEvent.press(view.getByRole('button', { name: '장보기 시작' }));
    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });
    fireEvent.press(view.getByRole('button', { name: '매장 지도' }));
    expect(view.getByTestId('market-route-map')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: '지도 닫기' }));
    player.current = { ...session.environment.stations.fresh };
    request = { id: 1, station: 'fresh' };
    view.rerender(element());
    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });
    fireEvent.press(view.getAllByRole('button', { name: '진열대 닫기' })[0]);
    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });
    fireEvent.press(view.getByRole('button', { name: '위치 찾기 완료' }));
    fireEvent.press(view.getByRole('button', { name: '이동 경로·시간 확인' }));
    expect(view.getByTestId('market-route-map')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: '이동 경로 처음' }));
    expect(view.getByText(/^0초 · x /)).toBeTruthy();
  } finally {
    view.unmount();
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test('a manually selected test keeps its own list instead of being replaced by the original AI mission', () => {
  const onEnvironmentChange = jest.fn();
  const view = render(
    <MarketSimulationScreen
      embedded
      mission={buildMarketScenarioMission('S01')}
      onExit={jest.fn()}
      onEnvironmentChange={onEnvironmentChange}
    />
  );
  fireEvent.press(view.getByRole('button', { name: '마트 설정' }));
  fireEvent.press(view.getByRole('button', { name: '과제·힌트·돌발 상황' }));
  fireEvent.press(view.getByRole('button', { name: '어머니 심부름' }));
  fireEvent.press(view.getByRole('button', { name: '부탁 물건 목록' }));
  const { getMarketProduct } = require('../src/game/scenarios');
  const milkName = getMarketProduct('milk').name;
  fireEvent.press(
    view.getByRole('button', { name: milkName + ' 수량 늘리기' })
  );
  fireEvent.press(view.getByRole('button', { name: '설정 적용' }));
  expect(onEnvironmentChange).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ trainingTestTouched: true })
  );
  expect(view.getByText('어머니의 부탁')).toBeTruthy();
  expect(view.getByText('2개')).toBeTruthy();
  view.unmount();
});
