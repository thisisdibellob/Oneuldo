import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { MarketSimulationScreen, type MarketInteractionRequest } from '../src/screens/MarketSimulationScreen';
import { MarketShelfScene } from '../src/components/game/MarketShelfScene';
import { createMarketSession } from '../src/game/marketSession';
import type { ReplayUiPort } from '../src/replay/ports';

const mockLoadConnection = jest.fn();
jest.mock('../src/replay/connection', () => {
  mockLoadConnection();
  return { connectMarketReplay: jest.fn(async () => jest.fn()) };
});
jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-haptics', () => ({ ImpactFeedbackStyle: { Light: 'light' }, impactAsync: () => Promise.resolve() }));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()),
      setPlaybackRate: jest.fn(), volume: 1 }).current;
  },
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native');
  return { GlassView: View, isLiquidGlassAvailable: () => false };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { ...jest.requireActual('react-native-safe-area-context'),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const developmentDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => {
  if (platformDescriptor) Object.defineProperty(Platform, 'OS', platformDescriptor);
  if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
  else Reflect.deleteProperty(globalThis, 'window');
  if (developmentDescriptor) Object.defineProperty(globalThis, '__DEV__', developmentDescriptor);
  jest.clearAllTimers(); jest.useRealTimers();
});
async function transition() {
  await act(async () => { jest.advanceTimersByTime(500); await Promise.resolve(); });
}

test('the ordinary development web game does not load the replay connection module or render replay controls', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { search: '?muteAudio=1' }, addEventListener: jest.fn(), removeEventListener: jest.fn(),
  } });
  const { GamePrototypeScreen } = require('../src/screens/GamePrototypeScreen');
  const screen = render(<GamePrototypeScreen onExit={jest.fn()} />);
  try {
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mockLoadConnection).not.toHaveBeenCalled();
    expect(screen.queryByTestId('market-replay-status')).toBeNull();
  } finally { screen.unmount(); }
});

test.each([false, true])('normal market inputs keep working and no shelf replay port is provided (production=%s)', async production => {
  if (production) Object.defineProperty(globalThis, '__DEV__', { configurable: true, writable: true, value: false });
  const session = createMarketSession({ seed: 'normal-market-gate', environment: { cashierCount: 1 } });
  const player = { current: { ...session.environment.spawn } };
  const replayUiRef: { current: ReplayUiPort | null } = { current: null };
  let request: MarketInteractionRequest | null = null;
  // A production render ignores even an accidentally supplied development-only port.
  const props = production ? { replayUiRef } : {};
  const element = () => <MarketSimulationScreen embedded initialConfig={session.config}
    environment={session.environment} playerPositionRef={player} interactionRequest={request}
    onExit={jest.fn()} {...props} />;
  const screen = render(element());
  try {
    fireEvent.press(screen.getByRole('button', { name: '다음' }));
    fireEvent.press(screen.getByRole('button', { name: '장보기 시작' }));
    await transition();
    player.current = { ...session.environment.stations.fresh };
    request = { id: 1, station: 'fresh' };
    screen.rerender(element());
    await transition();
    expect(screen.UNSAFE_getByType(MarketShelfScene).props.replayPortRef).toBeUndefined();
    expect(replayUiRef.current).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: /^흰 우유 900mL [0-9,]+원 담기$/ }));
    expect(screen.getByRole('button', { name: /^흰 우유 900mL [0-9,]+원 담기$/ })).toBeTruthy();
    fireEvent.press(screen.getAllByRole('button', { name: '진열대 닫기' })[0]);
    await transition();
    fireEvent.press(screen.getByRole('button', { name: '장바구니 열기' }));
    expect(screen.getByText(/담은 물건 1개/)).toBeTruthy();
    expect(mockLoadConnection).not.toHaveBeenCalled();
  } finally { screen.unmount(); }
});
