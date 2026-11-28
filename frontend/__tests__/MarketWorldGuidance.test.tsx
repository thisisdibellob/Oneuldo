import { act, render } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { MarketWorldGuidance } from '../src/components/game/MarketWorldGuidance';
import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { MARKET_CONSTRUCTION_NOTICE } from '../src/game/marketWayfinding';

const mockSound = {
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(async () => undefined),
  volume: 1,
};
jest.mock('expo-audio', () => ({ useAudioPlayer: () => mockSound }));
jest.mock('../src/components/game/MarketPanelTransition', () => ({
  useMarketReducedMotion: () => true,
}));
jest.mock('../src/game/dialogueFeedback', () => ({
  isSilentGamePreview: () => false,
}));
jest.mock('expo-font', () => ({ isLoaded: () => true }));
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

test('nearby construction shows the exact detour notice even without arrow hints, and clears on leaving', () => {
  const environment = createMarketEnvironment({ entranceConstruction: true }), rect = environment.constructionZones[0].rect;
  const playerPositionRef = { current: { x: rect.x + rect.width / 2, y: rect.y - 60 } };
  const frameRef = { current: { width: 375, height: 812, zoom: 1, center: { ...playerPositionRef.current } } };
  const props = { environment, frameRef, playerPositionRef, target: null, requestKey: '', incidents: [], elapsedSeconds: 0 };
  const screen = render(<MarketWorldGuidance {...props} />);
  expect(screen.getByText(MARKET_CONSTRUCTION_NOTICE)).toBeTruthy();
  playerPositionRef.current = { x: rect.x - 300, y: rect.y - 300 };
  act(() => jest.advanceTimersByTime(100));
  expect(screen.queryByTestId('market-construction-notice')).toBeNull();
  screen.rerender(<MarketWorldGuidance {...props} visible={false} />);
  expect(screen.queryByTestId('market-construction-notice')).toBeNull();
  screen.unmount();
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});
test('requested arrow stays until the target enters view, waits three seconds, and can be requested again', () => {
  const environment = createMarketEnvironment({ seed: 'hint-view' }),
    shelf = environment.shelves.fresh;
  const frameRef = {
    current: {
      width: 1000,
      height: 1000,
      zoom: 1,
      center: { x: 100000, y: 100000 },
    },
  };
  const props = {
    frameRef,
    environment,
    target: 'fresh' as const,
    requestKey: '1',
    incidents: [],
    elapsedSeconds: 0,
  };
  const screen = render(<MarketWorldGuidance {...props} />);
  act(() => jest.advanceTimersByTime(5000));
  expect(screen.getByTestId('market-shelf-direction-hint')).toBeTruthy();
  frameRef.current.center = { x: shelf.x, y: shelf.y };
  act(() => jest.advanceTimersByTime(100));
  act(() => jest.advanceTimersByTime(2800));
  expect(screen.getByTestId('market-shelf-direction-hint')).toBeTruthy();
  act(() => jest.advanceTimersByTime(350));
  expect(screen.queryByTestId('market-shelf-direction-hint')).toBeNull();
  screen.rerender(<MarketWorldGuidance {...props} requestKey="2" />);
  expect(screen.getByTestId('market-shelf-direction-hint')).toBeTruthy();
  screen.unmount();
});
test('hidden panels do not expose the arrow, and closing/reopening panels never replays a thud', async () => {
  const original = AppState.currentState;
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    value: 'active',
  });
  const environment = createMarketEnvironment(),
    frameRef = {
      current: {
        width: 375,
        height: 812,
        zoom: 1,
        center: { ...environment.spawn },
      },
    };
  const props = {
    environment,
    frameRef,
    target: null,
    requestKey: '',
    elapsedSeconds: 18,
    incidents: [
      {
        id: 'thud',
        kind: 'sound-light' as const,
        point: environment.spawn,
        elapsedSeconds: 18,
        durationSeconds: 8,
      },
    ],
  };
  const screen = render(<MarketWorldGuidance {...props} />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(mockSound.play).toHaveBeenCalledTimes(1);
  screen.rerender(<MarketWorldGuidance {...props} visible={false} />);
  expect(screen.queryByTestId('market-sound-light-incident')).toBeNull();
  screen.rerender(<MarketWorldGuidance {...props} visible />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(mockSound.play).toHaveBeenCalledTimes(1);
  screen.unmount();
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    value: original,
  });
});
