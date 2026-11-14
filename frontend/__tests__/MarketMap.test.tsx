import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, BackHandler, PanResponder, Platform, StyleSheet } from 'react-native';

import { DirectionalAvatar } from '../src/components/game/DirectionalAvatar';
import { AVATAR_WALK_CYCLE_DISTANCE } from '../src/game/avatarAnimation';
import { RUN_SPEED_MULTIPLIER } from '../src/game/movementControls';
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

function keyboardMarket() {
  const spring = jest.spyOn(Animated, 'spring').mockImplementation(() => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }));
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0, time = 0;
  const raf = jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++frameId, callback); return frameId;
  });
  const cancel = jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(id => { if (id != null) frames.delete(id); });
  const originalOS = Object.getOwnPropertyDescriptor(Platform, 'OS');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const listeners = new Map<string, Set<(event: KeyboardEvent) => void>>();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    addEventListener: (name: string, listener: (event: KeyboardEvent) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    },
    removeEventListener: (name: string, listener: (event: KeyboardEvent) => void) => listeners.get(name)?.delete(listener),
  } });
  const environment = cleanEnvironment(), onPositionChange = jest.fn(), onNearbyStationChange = jest.fn();
  const element = (interactive: boolean) => <MarketMap environment={environment} interactive={interactive} hintedStation={null}
    nearbyStation={null} onPositionChange={onPositionChange} onNearbyStationChange={onNearbyStationChange} />;
  const screen = render(element(true));
  return {
    screen,
    onPositionChange,
    pose: () => screen.UNSAFE_getByType(DirectionalAvatar).props.motion,
    distance: () => (onPositionChange.mock.calls.at(-1)?.[0].x ?? environment.spawn.x) - environment.spawn.x,
    interactive: (value: boolean) => screen.rerender(element(value)),
    key: (name: string, key = '', options: Partial<KeyboardEvent> = {}) => act(() => {
      const event = { key, target: { tagName: 'DIV' }, preventDefault: jest.fn(), ...options } as unknown as KeyboardEvent;
      listeners.get(name)?.forEach(listener => listener(event));
    }),
    advance: (count = 1) => {
      for (let i = 0; i < count; i++) act(() => {
        time += 32; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(time));
      });
    },
    cleanup: () => {
      screen.unmount();
      if (originalOS) Object.defineProperty(Platform, 'OS', originalOS);
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
      else Reflect.deleteProperty(globalThis, 'window');
      spring.mockRestore(); cancel.mockRestore(); raf.mockRestore();
    },
  };
}

it('독립 마트는 Shift를 먼저 누른 채 한글 배열 WASD를 눌러도 달리고 방향키만 뗐다 다시 누르면 달리기를 유지한다', () => {
  const market = keyboardMarket();
  const runStep = 190 * 0.032 * RUN_SPEED_MULTIPLIER;
  try {
    market.key('keydown', 'Shift', { code: 'ShiftLeft', shiftKey: true });
    market.advance(2);
    expect(market.onPositionChange).not.toHaveBeenCalled();
    expect(market.pose()).toBe('idle');
    market.key('keydown', 'ㅇ', { code: 'KeyD', shiftKey: true });
    market.advance(2);
    expect(market.distance()).toBeCloseTo(runStep);
    expect(market.pose()).toBe('sprint');
    market.key('keyup', 'ㅇ', { code: 'KeyD', shiftKey: true });
    market.advance(2);
    expect(market.distance()).toBeCloseTo(runStep);
    expect(market.pose()).toBe('idle');
    market.key('keydown', 'D', { code: 'KeyD', shiftKey: true });
    market.advance(2);
    expect(market.distance()).toBeCloseTo(runStep * 2);
    expect(market.pose()).toBe('sprint');
    market.key('keyup', 'Shift', { code: 'ShiftLeft', shiftKey: false });
    market.advance();
    expect(market.distance()).toBeCloseTo(runStep * 2 + 190 * 0.032);
    expect(market.pose()).toBe('walk');
  } finally { market.cleanup(); }
});

it('독립 마트는 이동 중 Shift로 속도와 달리기 모션을 바꾸고 기존 달리기 토글도 유지한다', () => {
  const market = keyboardMarket();
  const walkStep = 190 * 0.032;
  try {
    market.key('keydown', 'd', { code: 'KeyD', shiftKey: false });
    market.advance(2);
    expect(market.distance()).toBeCloseTo(walkStep);
    expect(market.pose()).toBe('walk');
    market.key('keydown', 'Shift', { code: 'ShiftLeft', shiftKey: true });
    market.key('keydown', 'Shift', { code: 'ShiftRight', shiftKey: true });
    market.key('keyup', 'Shift', { code: 'ShiftLeft', shiftKey: true });
    market.advance();
    expect(market.distance()).toBeCloseTo(walkStep * (1 + RUN_SPEED_MULTIPLIER));
    expect(market.pose()).toBe('sprint');
    fireEvent.press(market.screen.getByRole('button', { name: '마트에서 달리기 켜기' }));
    market.key('keyup', 'Shift', { code: 'ShiftRight', shiftKey: false });
    market.advance();
    expect(market.distance()).toBeCloseTo(walkStep * (1 + RUN_SPEED_MULTIPLIER * 2));
    expect(market.pose()).toBe('sprint');
    fireEvent.press(market.screen.getByRole('button', { name: '마트에서 달리기 끄기' }));
    market.advance();
    expect(market.distance()).toBeCloseTo(walkStep * (2 + RUN_SPEED_MULTIPLIER * 2));
    expect(market.pose()).toBe('walk');
  } finally { market.cleanup(); }
});

it.each(['blur', 'lock'] as const)('독립 마트는 %s 후 눌린 이동키와 Shift를 초기화한다', reset => {
  const market = keyboardMarket();
  try {
    market.key('keydown', 'Shift', { shiftKey: true });
    market.key('keydown', 'd', { code: 'KeyD', shiftKey: true });
    market.advance(2);
    expect(market.pose()).toBe('sprint');
    if (reset === 'blur') market.key('blur');
    else market.interactive(false);
    const stoppedDistance = market.distance();
    market.advance(2);
    expect(market.distance()).toBe(stoppedDistance);
    expect(market.pose()).toBe('idle');
    if (reset === 'lock') market.interactive(true);
    market.key('keydown', 'd', { code: 'KeyD' });
    market.advance(2);
    expect(market.distance() - stoppedDistance).toBeCloseTo(190 * 0.032);
    expect(market.pose()).toBe('walk');
  } finally { market.cleanup(); }
});

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
    expect(screen.UNSAFE_getByType(DirectionalAvatar).props.motion).toBe('walk');
    screen.rerender(element({ checkout: true })); expect(screen.getByTestId('market-cashier')).toBeTruthy();
    advance(30);
    const latest = onPositionChange.mock.calls.at(-1)![0];
    const collisionBoundary = counter.cashierCollider.y - MARKET_ENVIRONMENT_PLAYER_RADIUS;
    expect(latest.y).toBeLessThanOrEqual(collisionBoundary);
    expect(latest.y).toBeGreaterThan(collisionBoundary - 8);
    expect(isMarketEnvironmentBlocked(environment, latest, { checkout: true })).toBe(false);
    expect(screen.UNSAFE_getByType(DirectionalAvatar).props.motion).toBe('idle');
    const gait = screen.UNSAFE_getByType(DirectionalAvatar).props.walkCycle;
    const stoppedPhase = gait.frameIndex(1000);
    advance(10);
    expect(gait.frameIndex(1000)).toBe(stoppedPhase);
  } finally {
    screen.unmount(); responder.mockRestore(); cancel.mockRestore(); raf.mockRestore();
  }
});

it('모달 잠금과 입력 필드에서는 웹 방향키와 접근성 이동이 캐릭터를 움직이지 않는다', () => {
  // The Jest native renderer does not mount DOM nodes when Platform.OS is web.
  // Ignore the joystick's cosmetic native-driver spring, while testing real movement callbacks.
  const spring = jest.spyOn(Animated, 'spring').mockImplementation(() => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }));
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0, time = 0;
  const raf = jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++frameId, callback); return frameId;
  });
  const cancel = jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(id => { if (id != null) frames.delete(id); });
  const advance = () => { for (let i = 0; i < 2; i++) act(() => {
    time += 32; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(time));
  }); };
  const originalOS = Object.getOwnPropertyDescriptor(Platform, 'OS');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const listeners = new Set<(event: KeyboardEvent) => void>();
  const releaseListeners = new Set<(event: KeyboardEvent) => void>();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    addEventListener: (name: string, listener: (event: KeyboardEvent) => void) => { if (name === 'keydown') listeners.add(listener); if (name === 'keyup') releaseListeners.add(listener); },
    removeEventListener: (name: string, listener: (event: KeyboardEvent) => void) => { if (name === 'keydown') listeners.delete(listener); if (name === 'keyup') releaseListeners.delete(listener); },
  } });
  const environment = cleanEnvironment(), onPositionChange = jest.fn(), onNearbyStationChange = jest.fn();
  const element = (interactive: boolean) => <MarketMap environment={environment} interactive={interactive} hintedStation={null}
    nearbyStation={null} onPositionChange={onPositionChange} onNearbyStationChange={onNearbyStationChange} />;
  const screen = render(element(true));
  const key = (tagName = 'DIV') => act(() => listeners.forEach(listener => listener({ key: 'ArrowRight', target: { tagName }, preventDefault: jest.fn() } as unknown as KeyboardEvent)));
  try {
    key(); advance();
    expect(onPositionChange.mock.calls.at(-1)![0].x).toBeCloseTo(environment.spawn.x + 190 * 0.032);
    expect(screen.UNSAFE_getByType(DirectionalAvatar).props.motion).toBe('walk');
    onPositionChange.mockClear(); screen.rerender(element(false));
    key(); fireEvent(screen.getByLabelText('하늘마트 매장'), 'accessibilityAction', { nativeEvent: { actionName: 'moveRight' } });
    expect(onPositionChange).not.toHaveBeenCalled();
    screen.rerender(element(true)); key('INPUT'); key('TEXTAREA'); key('SELECT');
    expect(onPositionChange).not.toHaveBeenCalled();
    key(); advance();
    expect(onPositionChange.mock.calls.at(-1)![0].x).toBeCloseTo(environment.spawn.x + 190 * 0.032 * 2);
    act(() => releaseListeners.forEach(listener => listener({ key: 'ArrowRight' } as KeyboardEvent)));
    expect(screen.UNSAFE_getByType(DirectionalAvatar).props.motion).toBe('idle');
    const callCount = onPositionChange.mock.calls.length; advance();
    expect(onPositionChange).toHaveBeenCalledTimes(callCount);
    screen.unmount(); expect(listeners.size).toBe(0);
  } finally {
    screen.unmount();
    if (originalOS) Object.defineProperty(Platform, 'OS', originalOS);
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    spring.mockRestore(); cancel.mockRestore(); raf.mockRestore();
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
    moveRight(); expect(onNearbyStationChange).toHaveBeenLastCalledWith('meal');
    // Enlarged fixtures have overlapping reach ranges here: choose the nearer
    // shelf, then hide the action after walking clear of both actual surfaces.
    for (let step = 0; step < 5; step++) {
      fireEvent(map, 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
    }
    expect(onNearbyStationChange).toHaveBeenLastCalledWith(null);
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

it('독립 마트의 보행 위상은 조이스틱 세기와 달리기의 실제 이동거리를 따른다', () => {
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0, time = 0;
  const raf = jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++frameId, callback); return frameId;
  });
  const cancel = jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(id => { if (id != null) frames.delete(id); });
  let handlers: Parameters<typeof PanResponder.create>[0] | undefined;
  const responder = jest.spyOn(PanResponder, 'create').mockImplementation(value => {
    handlers ??= value; return { panHandlers: {} };
  });
  const environment = cleanEnvironment();
  const onPositionChange = jest.fn();
  const screen = render(<MarketMap environment={environment} interactive hintedStation={null} nearbyStation={null}
    onPositionChange={onPositionChange} onNearbyStationChange={jest.fn()} />);
  const advance = (count: number) => {
    for (let index = 0; index < count; index++) act(() => {
      time += 32; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(time));
    });
  };
  const pose = () => screen.UNSAFE_getByType(DirectionalAvatar).props;
  try {
    act(() => {
      handlers!.onPanResponderGrant!({ nativeEvent: { locationX: 76, locationY: 174 } } as never, {} as never);
      handlers!.onPanResponderMove!({} as never, { dx: 17, dy: 0 } as never);
    });
    advance(5); // Four elapsed frames after the initial timestamp.
    const halfDistance = onPositionChange.mock.calls.at(-1)![0].x - environment.spawn.x;
    expect(halfDistance).toBeCloseTo(190 * 0.5 * 0.032 * 4);
    expect(pose().motion).toBe('walk');
    expect(pose().walkCycle.frameIndex(10000)).toBe(Math.floor(halfDistance / AVATAR_WALK_CYCLE_DISTANCE * 10000));
    act(() => handlers!.onPanResponderMove!({} as never, { dx: 34, dy: 0 } as never));
    advance(4);
    const fullDistance = onPositionChange.mock.calls.at(-1)![0].x - environment.spawn.x;
    expect(fullDistance - halfDistance).toBeCloseTo(halfDistance * 2);
    fireEvent.press(screen.getByRole('button', { name: '마트에서 달리기 켜기' }));
    advance(4);
    const runningDistance = onPositionChange.mock.calls.at(-1)![0].x - environment.spawn.x;
    expect(pose().motion).toBe('sprint');
    expect(runningDistance - fullDistance).toBeCloseTo(halfDistance * 2 * 1.55);
    expect(pose().walkCycle.frameIndex(10000)).toBe(Math.floor(runningDistance / AVATAR_WALK_CYCLE_DISTANCE * 10000));
    fireEvent.press(screen.getByRole('button', { name: '마트에서 달리기 끄기' }));
    advance(2);
    expect(pose().motion).toBe('walk');
    act(() => handlers!.onPanResponderRelease!({} as never, {} as never));
    expect(pose().motion).toBe('idle');
  } finally {
    screen.unmount(); responder.mockRestore(); cancel.mockRestore(); raf.mockRestore();
  }
});
