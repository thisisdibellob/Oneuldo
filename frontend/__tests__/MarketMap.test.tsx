import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, BackHandler, PanResponder, Platform } from 'react-native';

import { MarketMap } from '../src/components/game/MarketMap';
import { createMarketEnvironment, isMarketEnvironmentBlocked, type MarketCashierAvailability } from '../src/game/marketEnvironment';
import { MarketSimulationScreen } from '../src/screens/MarketSimulationScreen';

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
  const environment = cleanEnvironment(); environment.spawn = { x: 684, y: 740 };
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
    expect(onPositionChange.mock.calls.at(-1)![0].y).toBeGreaterThan(740);
    screen.rerender(element({ checkout: true })); expect(screen.getByTestId('market-cashier')).toBeTruthy();
    advance(30);
    const latest = onPositionChange.mock.calls.at(-1)![0];
    expect(latest.y).toBeLessThanOrEqual(818);
    expect(latest.y).toBeGreaterThan(780);
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
