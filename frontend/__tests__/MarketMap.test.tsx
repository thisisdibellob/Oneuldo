import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, BackHandler, PanResponder, Platform, StyleSheet } from 'react-native';

import { MarketMap } from '../src/components/game/MarketMap';
import { createMarketEnvironment, isMarketEnvironmentBlocked, MARKET_ENVIRONMENT_PLAYER_RADIUS, type MarketCashierAvailability } from '../src/game/marketEnvironment';
import { MarketSimulationScreen } from '../src/screens/MarketSimulationScreen';


jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  },
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

function cleanEnvironment() {
  return createMarketEnvironment({ seed: 'movement-regression', employeeCount: 1, customerCount: 1,
    employeeSlotIds: ['staff-west-aisle'], customerSlotIds: ['customer-west'],
    cashierCount: 0, pillarCount: 0, chairCount: 0, kioskPresent: false });
}

it('처음 만들어진 조이스틱 핸들러도 호출된 계산원의 새 충돌 영역을 읽는다', () => {
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0, clock = 0;
  const raf = jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++frameId, callback); return frameId;
  });
  const cancel = jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(id => { if (id != null) frames.delete(id); });
  let firstHandlers: Parameters<typeof PanResponder.create>[0] | undefined;
  const responder = jest.spyOn(PanResponder, 'create').mockImplementation(handlers => {
    firstHandlers ??= handlers; return { panHandlers: {} };
  });
  const environment = cleanEnvironment();
  const counter = environment.checkouts[0];
  environment.spawn = { x: counter.cashierPoint.x, y: counter.cashierPoint.y - 100 };
  const onPositionChange = jest.fn(), onNearbyStationChange = jest.fn();
  const element = (cashierCalled: Partial<MarketCashierAvailability>) => <MarketMap environment={environment} cashierCalled={cashierCalled}
    interactive hintedStation={null} nearbyStation={null} onPositionChange={onPositionChange} onNearbyStationChange={onNearbyStationChange} />;
  const screen = render(element({}));
  const advance = (count: number) => {
    for (let index = 0; index < count; index++) act(() => {
      clock += 32; const current = [...frames.values()]; frames.clear(); current.forEach(callback => callback(clock));
    });
  };
  try {
    expect(screen.queryByTestId('market-cashier')).toBeNull();
    act(() => {
      firstHandlers!.onPanResponderGrant!({ nativeEvent: { locationX: 76, locationY: 174 } } as never, {} as never);
      firstHandlers!.onPanResponderMove!({} as never, { dx: 0, dy: 34 } as never);
    });
    advance(2);
    expect(onPositionChange.mock.calls.at(-1)![0].y).toBeGreaterThan(environment.spawn.y);
    screen.rerender(element({ checkout: true })); expect(screen.getByTestId('market-cashier')).toBeTruthy();
    advance(30);
    const latest = onPositionChange.mock.calls.at(-1)![0];
    const collisionBoundary = counter.cashierCollider.y - MARKET_ENVIRONMENT_PLAYER_RADIUS;
    expect(latest.y).toBeLessThanOrEqual(collisionBoundary);
    expect(latest.y).toBeGreaterThan(collisionBoundary - 8);
    expect(isMarketEnvironmentBlocked(environment, latest, { checkout: true })).toBe(false);
  } finally {
    screen.unmount(); responder.mockRestore(); cancel.mockRestore(); raf.mockRestore();
  }
});

it('모달 잠금과 입력 필드에서는 웹 방향키와 접근성 이동이 캐릭터를 움직이지 않는다', () => {
  // The Jest native renderer does not mount DOM nodes when Platform.OS is web.
  // Ignore the joystick's cosmetic native-driver spring, while testing real movement callbacks.
  const spring = jest.spyOn(Animated, 'spring').mockImplementation(() => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }));
  const originalOS = Object.getOwnPropertyDescriptor(Platform, 'OS');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const listeners = new Set<(event: KeyboardEvent) => void>();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    addEventListener: (name: string, listener: (event: KeyboardEvent) => void) => { if (name === 'keydown') listeners.add(listener); },
    removeEventListener: (name: string, listener: (event: KeyboardEvent) => void) => { if (name === 'keydown') listeners.delete(listener); },
  } });
  const environment = cleanEnvironment(), onPositionChange = jest.fn(), onNearbyStationChange = jest.fn();
  const element = (interactive: boolean) => <MarketMap environment={environment} interactive={interactive} hintedStation={null}
    nearbyStation={null} onPositionChange={onPositionChange} onNearbyStationChange={onNearbyStationChange} />;
  const screen = render(element(true));
  const key = (tagName = 'DIV') => act(() => listeners.forEach(listener => listener({ key: 'ArrowRight', target: { tagName }, preventDefault: jest.fn() } as unknown as KeyboardEvent)));
  try {
    key(); expect(onPositionChange).toHaveBeenLastCalledWith({ x: environment.spawn.x + 24, y: environment.spawn.y });
    onPositionChange.mockClear(); screen.rerender(element(false));
    key(); fireEvent(screen.getByLabelText('하늘마트 매장'), 'accessibilityAction', { nativeEvent: { actionName: 'moveRight' } });
    expect(onPositionChange).not.toHaveBeenCalled();
    screen.rerender(element(true)); key('INPUT'); key('TEXTAREA'); key('SELECT');
    expect(onPositionChange).not.toHaveBeenCalled();
    key(); expect(onPositionChange).toHaveBeenLastCalledWith({ x: environment.spawn.x + 48, y: environment.spawn.y });
    screen.unmount(); expect(listeners.size).toBe(0);
  } finally {
    screen.unmount();
    if (originalOS) Object.defineProperty(Platform, 'OS', originalOS);
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    spring.mockRestore();
  }
});

it.each([0, 1, 2] as const)('계산원이 %i명이면 두 계산대 중 그 인원만 보이며 무인 상태와 구별한다', cashierCount => {
  const environment = createMarketEnvironment({ seed: 'cashier-render-count', cashierCount });
  const screen = render(<MarketMap environment={environment} interactive hintedStation={null} nearbyStation={null} onNearbyStationChange={jest.fn()} />);
  try {
    expect(screen.getAllByTestId('market-checkout-art')).toHaveLength(2);
    expect(screen.queryAllByTestId('market-cashier')).toHaveLength(cashierCount);
  } finally { screen.unmount(); }
});

it('이전 기록을 보다가 Android 뒤로 가기를 누르면 게임을 포기하지 않고 시작 화면으로 돌아온다', () => {
  let back: Parameters<typeof BackHandler.addEventListener>[1] | undefined;
  const listener = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_name, handler) => {
    back = handler; return { remove: jest.fn() };
  });
  const screen = render(<MarketSimulationScreen embedded onExit={jest.fn()} />);
  try {
    fireEvent.press(screen.getByRole('button', { name: '이전 게임 기록' }));
    expect(screen.getByRole('header', { name: '이전 게임 기록' })).toBeTruthy();
    act(() => { expect(back!({ type: 'hardwareBackPress', timeStamp: 1 })).toBe(true); });
    expect(screen.getByRole('header', { name: '마트에서 장보기' })).toBeTruthy();
    expect(screen.queryByRole('header', { name: '이전 게임 기록' })).toBeNull();
    expect(screen.queryByText('실패 (포기)')).toBeNull();
  } finally { screen.unmount(); listener.mockRestore(); }
});

it('나란한 진열대 사이에서는 실제 가까운 진열대를 선택하고 떨어지면 안내를 숨긴다', () => {
  const environment = cleanEnvironment();
  const shelf = environment.shelves.household;
  environment.spawn = { x: shelf.x + shelf.width + 20, y: shelf.y + shelf.height - 50 };
  const onNearbyStationChange = jest.fn();
  const screen = render(<MarketMap environment={environment} interactive hintedStation={null} nearbyStation={null}
    onNearbyStationChange={onNearbyStationChange} />);
  try {
    const map = screen.getByLabelText('하늘마트 매장');
    const moveRight = () => fireEvent(map, 'accessibilityAction', { nativeEvent: { actionName: 'moveRight' } });
    moveRight(); expect(onNearbyStationChange).toHaveBeenLastCalledWith('household');
    moveRight(); expect(onNearbyStationChange).toHaveBeenLastCalledWith(null);
    moveRight(); expect(onNearbyStationChange).toHaveBeenLastCalledWith('meal');
  } finally { screen.unmount(); }
});

it('플레이어는 진열대와 같은 월드 안에서 발 위치의 깊이로 렌더링되며 이동 시 함께 갱신된다', () => {
  const environment = cleanEnvironment();
  const screen = render(<MarketMap environment={environment} interactive hintedStation={null} nearbyStation={null} onNearbyStationChange={jest.fn()} />);
  try {
    const player = screen.getByTestId('market-player-world');
    const world = screen.getByTestId('market-world');
    let parent = player.parent;
    while (parent && parent !== world) parent = parent.parent;
    expect(parent).toBe(world);
    const style = () => require('react-native').StyleSheet.flatten(player.props.style);
    const readAnimated = (value: number | { __getValue: () => number }) => typeof value === 'number' ? value : value.__getValue();
    expect(readAnimated(style().zIndex)).toBe(10 + environment.spawn.y);
    expect(style()).toMatchObject({ left: 0, top: 0 });
    fireEvent(screen.getByLabelText('하늘마트 매장'), 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
    expect(readAnimated(style().zIndex)).toBe(10 + environment.spawn.y + 24);
    expect(readAnimated(style().transform[1].translateY)).toBe(environment.spawn.y + 24);
  } finally { screen.unmount(); }
});


it('모퉁이 지점은 자체 월드 크기·공동문 스폰을 사용하고 이전 매장 오른쪽 경계를 넘어 이동한다', () => {
  const environment = createMarketEnvironment({ layoutId: 'corner', seed: 'corner-camera', employeeCount: 1,
    customerCount: 1, pillarCount: 0, chairCount: 0, cashierCount: 0, kioskPresent: false });
  const onPositionChange = jest.fn();
  const screen = render(<MarketMap environment={environment} interactive hintedStation={null} nearbyStation={null}
    onPositionChange={onPositionChange} onNearbyStationChange={jest.fn()} />);
  try {
    expect(StyleSheet.flatten(screen.getByTestId('market-world').props.style)).toEqual(expect.objectContaining(environment.world));
    const map = screen.getByLabelText('하늘마트 매장');
    fireEvent(map, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 812 } } });
    const player = StyleSheet.flatten(screen.getByTestId('market-player-world').props.style);
    const read = (value: number | { __getValue: () => number }) => typeof value === 'number' ? value : value.__getValue();
    expect(read(player.transform![0].translateX)).toBe(environment.spawn.x);
    expect(read(player.transform![1].translateY)).toBe(environment.spawn.y);
    for (let step = 0; step < 4; step++) fireEvent(map, 'accessibilityAction', { nativeEvent: { actionName: 'moveRight' } });
    const moved = onPositionChange.mock.calls.at(-1)![0];
    expect(moved.x).toBe(environment.spawn.x + 96);
    expect(moved.x).toBeGreaterThan(1100);
    expect(isMarketEnvironmentBlocked(environment, moved)).toBe(false);
    const world = StyleSheet.flatten(screen.getByTestId('market-world').props.style);
    const expected = require('../src/game/worldZoom').getWorldCameraFrame(moved, { width: 375, height: 812 }, 1.3, environment.world);
    expect(read(world.transform![0].translateX)).toBeCloseTo(expected.translation.x);
    expect(read(world.transform![1].translateY)).toBeCloseTo(expected.translation.y);
  } finally { screen.unmount(); }
});
