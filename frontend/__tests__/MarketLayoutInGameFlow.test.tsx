import { act, fireEvent, render } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { MarketLayoutEditor } from '../src/components/game/MarketLayoutEditor';
import { MarketShelfScene } from '../src/components/game/MarketShelfScene';
import { createMarketEnvironment, type MarketEnvironmentConfig, type MarketEnvironmentStationId } from '../src/game/marketEnvironment';
import { applyMarketTilemapToConfig, createMarketTilemapFromEnvironment } from '../src/game/marketTilemap';
import { MarketSimulationScreen, type MarketInteractionRequest, type MarketSimulationScreenProps } from '../src/screens/MarketSimulationScreen';

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  },
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));
jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
// Exercise the real session and screen lifecycle; the editor's own gesture/JSON tests are separate.
jest.mock('../src/components/game/MarketLayoutEditor', () => ({
  MarketLayoutEditor: ({ onClose }: { onClose: () => void }) => {
    const React = jest.requireActual('react');
    const { View, Pressable, Text } = jest.requireActual('react-native');
    return React.createElement(View, { testID: 'test-live-layout-editor' },
      React.createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: '테스트 편집 취소', onPress: onClose }, React.createElement(Text, null, '취소')));
  },
}));

async function settle() { await act(async () => { jest.advanceTimersByTime(320); await Promise.resolve(); }); }

function setup(cashierCount: 0 | 2 = 2) {
  let environment = createMarketEnvironment({ seed: 'in-game-grid-ui', employeeCount: 1, customerCount: 1,
    pillarCount: 0, chairCount: 0, cashierCount, kioskLane: 'none' });
  const callbacks = { onExit: jest.fn(), onLockChange: jest.fn(), onEpisodeComplete: jest.fn(), onMissionComplete: jest.fn(), onCashierCalled: jest.fn(), onEnvironmentChange: jest.fn() };
  const playerPositionRef = { current: { ...environment.spawn } };
  const playerMovementListenerRef: NonNullable<MarketSimulationScreenProps['playerMovementListenerRef']> = { current: null };
  let request: MarketInteractionRequest | null = null;
  let requestId = 0;
  let externalMenuOpen = false;
  const initialConfig = { seed: environment.seed, sessionId: 'in-game-grid-preserved-session', difficulty: 'exact' as const,
    learning: { stockoutEnabled: false, budgetChoiceEnabled: false, checkoutReviewMode: 'normal' as const }, objectives: [{ productId: 'milk', quantity: 2 }] };
  const element = () => <MarketSimulationScreen embedded environment={environment} initialConfig={initialConfig}
    interactionRequest={request} externalMenuOpen={externalMenuOpen} playerPositionRef={playerPositionRef}
    playerMovementListenerRef={playerMovementListenerRef} {...callbacks} />;
  const screen = render(element());
  const start = async () => {
    fireEvent.press(screen.getByRole('button', { name: '장보기 시작' }));
    await settle();
  };
  const send = async (station: MarketInteractionRequest['station']) => {
    if (station in environment.stations) playerPositionRef.current = { ...environment.stations[station as MarketEnvironmentStationId] };
    request = { id: ++requestId, station }; screen.rerender(element());
    await act(async () => { await Promise.resolve(); });
  };
  const closeShelf = async () => { fireEvent.press(screen.getAllByRole('button', { name: '진열대 닫기' })[0]); await settle(); };
  const addMilk = (count: number) => {
    for (let index = 0; index < count; index += 1) act(() => { expect(screen.UNSAFE_getByType(MarketShelfScene).props.onDropProduct('milk')).toBe(true); });
  };
  const applyLayout = () => {
    const editor = screen.UNSAFE_getByType(MarketLayoutEditor);
    const config = editor.props.config as MarketEnvironmentConfig;
    const map = createMarketTilemapFromEnvironment(createMarketEnvironment(config));
    map.shelves[0].col += 1;
    act(() => editor.props.onApply(applyMarketTilemapToConfig(config, map)));
    fireEvent.press(screen.getByRole('button', { name: '배치 적용' }));
    environment = callbacks.onEnvironmentChange.mock.calls.at(-1)![0];
    return map;
  };
  const setExternalMenuOpen = (value: boolean) => { externalMenuOpen = value; screen.rerender(element()); };
  return { ...callbacks, screen, playerPositionRef, start, send, addMilk, closeShelf, applyLayout, setExternalMenuOpen, environment: () => environment };
}

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

it('opens the layout editor after starting, locks movement and cancel preserves the active shopping attempt', async () => {
  const game = setup();
  try {
    await game.start();
    await game.send('fresh'); game.addMilk(1); await game.closeShelf();
    expect(game.onLockChange).toHaveBeenLastCalledWith(false);
    await game.send('edit-layout');
    if (game.screen.queryByRole('button', { name: '직접 배치 편집' })) fireEvent.press(game.screen.getByRole('button', { name: '직접 배치 편집' }));
    expect(game.screen.getByTestId('test-live-layout-editor')).toBeTruthy();
    expect(game.screen.queryByTestId('market-hud')).toBeNull();
    expect(game.onLockChange).toHaveBeenLastCalledWith(true);
    fireEvent.press(game.screen.getByRole('button', { name: '테스트 편집 취소' }));
    fireEvent.press(game.screen.getByRole('button', { name: '뒤로가기' }));
    await settle();
    expect(game.screen.queryByTestId('test-live-layout-editor')).toBeNull();
    expect(game.onLockChange).toHaveBeenLastCalledWith(false);
    expect(game.onEnvironmentChange).not.toHaveBeenCalled();
    expect(game.onCashierCalled).not.toHaveBeenCalled();
    await game.send('fresh');
    expect(game.screen.UNSAFE_getByType(MarketShelfScene).props.cart).toEqual({ milk: 1 });
    expect(game.onEpisodeComplete).not.toHaveBeenCalled();
    expect(game.onExit).not.toHaveBeenCalled();
  } finally { game.screen.unmount(); }
});

it('applies a live layout while preserving the cart, stock, session ID and event history through successful checkout', async () => {
  const game = setup();
  try {
    await game.start();
    await game.send('fresh');
    const initialStock = game.screen.UNSAFE_getByType(MarketShelfScene).props.stock.milk;
    game.addMilk(2); await game.closeShelf();
    await game.send('edit-layout');
    if (game.screen.queryByRole('button', { name: '직접 배치 편집' })) fireEvent.press(game.screen.getByRole('button', { name: '직접 배치 편집' }));
    const map = game.applyLayout(); await settle();
    expect(game.onEnvironmentChange).toHaveBeenCalledTimes(1);
    expect(game.onEnvironmentChange.mock.calls[0][0].config.tilemap).toEqual(map);
    expect(game.onCashierCalled).toHaveBeenLastCalledWith({ checkout: true, 'checkout-2': true });
    expect(game.playerPositionRef.current).toEqual(game.environment().spawn);
    expect(game.onLockChange).toHaveBeenLastCalledWith(false);
    expect(game.screen.queryByRole('header', { name: '장 보기' })).toBeNull();
    await game.send('fresh');
    expect(game.screen.UNSAFE_getByType(MarketShelfScene).props.cart).toEqual({ milk: 2 });
    await game.closeShelf();
    await game.send('checkout');
    fireEvent.press(game.screen.getByRole('button', { name: '이대로 결제하기' }));
    fireEvent.press(game.screen.getByRole('button', { name: '평가 건너뛰기' }));
    const episode = game.onEpisodeComplete.mock.calls[0][0];
    expect(episode).toMatchObject({ sessionId: 'in-game-grid-preserved-session', finalCart: { milk: 2 }, paid: true, outcome: 'success', attempts: 1 });
    expect(episode.finalStock.milk).toBe(initialStock - 2);
    expect(episode.events.filter((event: { type: string }) => event.type === 'session_started')).toHaveLength(1);
    expect(episode.events.filter((event: { type: string }) => event.type === 'layout_changed')).toHaveLength(1);
    expect(episode.events.findIndex((event: { type: string }) => event.type === 'layout_changed')).toBeGreaterThan(1);
    expect(game.onMissionComplete).toHaveBeenCalledTimes(1);
  } finally { game.screen.unmount(); }
});

it('waits for the phone settings panel to close before opening the pending editor request', async () => {
  const game = setup();
  try {
    await game.start();
    game.setExternalMenuOpen(true);
    await game.send('edit-layout');
    if (game.screen.queryByRole('button', { name: '직접 배치 편집' })) fireEvent.press(game.screen.getByRole('button', { name: '직접 배치 편집' }));
    expect(game.screen.queryByTestId('test-live-layout-editor')).toBeNull();
    game.setExternalMenuOpen(false);
    await act(async () => { await Promise.resolve(); });
    fireEvent.press(game.screen.getByRole('button', { name: '직접 배치 편집' }));
    expect(game.screen.getByTestId('test-live-layout-editor')).toBeTruthy();
    expect(game.onLockChange).toHaveBeenLastCalledWith(true);
  } finally { game.screen.unmount(); }
});

it('keeps a previously called cashier at the counter when the layout is rebuilt', async () => {
  const game = setup(0);
  const finishLine = () => {
    const button = game.screen.queryByRole('button', { name: '직원 대화 계속하기' });
    if (button && !button.props.accessibilityState?.disabled) fireEvent.press(button);
  };
  try {
    await game.start();
    await game.send(`staff:${game.environment().employees[0].id}`);
    finishLine();
    fireEvent.press(game.screen.getByRole('button', { name: '계산대에 사람이 없어요,\n계산 부탁드릴게요' }));
    finishLine();
    expect(game.onCashierCalled).toHaveBeenLastCalledWith({ checkout: true, 'checkout-2': false });
    fireEvent.press(game.screen.getByRole('button', { name: '아니에요, 감사합니다.' }));
    await settle();
    game.onCashierCalled.mockClear();
    await game.send('edit-layout');
    if (game.screen.queryByRole('button', { name: '직접 배치 편집' })) fireEvent.press(game.screen.getByRole('button', { name: '직접 배치 편집' })); game.applyLayout(); await settle();
    expect(game.onCashierCalled).toHaveBeenCalledTimes(1);
    expect(game.onCashierCalled).toHaveBeenLastCalledWith({ checkout: true, 'checkout-2': false });
    expect(game.environment().checkouts.find(counter => counter.id === 'checkout')?.cashierPresent).toBe(true);
  } finally { game.screen.unmount(); }
});

it('the Android back action closes editing without abandoning the game', async () => {
  const backEvents = jest.spyOn(BackHandler, 'addEventListener');
  const game = setup();
  try {
    await game.start(); await game.send('edit-layout');
    if (game.screen.queryByRole('button', { name: '직접 배치 편집' })) fireEvent.press(game.screen.getByRole('button', { name: '직접 배치 편집' }));
    const handler = backEvents.mock.calls.filter(([event]) => event === 'hardwareBackPress').at(-1)?.[1];
    expect(handler).toBeDefined();
    act(() => { expect(handler!({ type: 'hardwareBackPress', timeStamp: Date.now() })).toBe(true); });
    await settle();
    expect(game.screen.queryByTestId('test-live-layout-editor')).toBeNull();
    expect(game.screen.getByTestId('market-hud')).toBeTruthy();
    expect(game.onLockChange).toHaveBeenLastCalledWith(false);
    expect(game.onExit).not.toHaveBeenCalled();
    expect(game.onEpisodeComplete).not.toHaveBeenCalled();
  } finally { game.screen.unmount(); backEvents.mockRestore(); }
});

it('cannot replace the map while a shelf interaction is still open', async () => {
  const game = setup();
  try {
    await game.start(); await game.send('fresh'); game.addMilk(1);
    await game.send('edit-layout');
    if (game.screen.queryByRole('button', { name: '직접 배치 편집' })) fireEvent.press(game.screen.getByRole('button', { name: '직접 배치 편집' }));
    expect(game.screen.queryByTestId('test-live-layout-editor')).toBeNull();
    expect(game.screen.UNSAFE_getByType(MarketShelfScene).props.cart).toEqual({ milk: 1 });
    expect(game.onEnvironmentChange).not.toHaveBeenCalled();
  } finally { game.screen.unmount(); }
});
