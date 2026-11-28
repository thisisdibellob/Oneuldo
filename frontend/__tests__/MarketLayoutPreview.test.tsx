import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, BackHandler, Platform, StyleSheet } from 'react-native';
import { DirectionalAvatar } from '../src/components/game/DirectionalAvatar';
import { GameControls } from '../src/components/game/GameControls';
import { MarketLayoutPreview, moveMarketPreviewPoint } from '../src/components/game/MarketLayoutPreview';
import { createMarketEnvironment, isMarketEnvironmentBlocked } from '../src/game/marketEnvironment';
import { getGamePreferences, resetGamePreferencesForTests } from '../src/game/gamePreferences';
import { RUN_SPEED_MULTIPLIER } from '../src/game/movementControls';
import { getMarketShelfUnitRects } from '../src/game/marketFixtureLayout';
import { getMarketPersonCollider } from '../src/game/marketPersonLayout';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('../src/components/game/DirectionalAvatar', () => ({
  DirectionalAvatar: (props: unknown) => require('react').createElement(require('react-native').View, { testID: 'preview-avatar', ...(props as object) }),
}));

const makeEnvironment = () => createMarketEnvironment({ seed: 'preview-regression', employeeCount: 1, customerCount: 1,
  cashierCount: 0, pillarCount: 0, chairCount: 0, kioskLane: 'none' });
const value = (input: number | { __getValue(): number }) => typeof input === 'number' ? input : input.__getValue();
beforeEach(() => resetGamePreferencesForTests());

it('renders actual fixtures in both local preview themes without changing the map or saved preference', () => {
  const environment = makeEnvironment();
  const before = JSON.stringify(environment);
  const onClose = jest.fn();
  const screen = render(<MarketLayoutPreview environment={environment} onClose={onClose} />);
  try {
    expect(screen.getByTestId('market-interior-classic', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryAllByTestId(/^market-shelf-art-/, { includeHiddenElements: true })).toHaveLength(10);
    fireEvent.press(screen.getByRole('button', { name: '동네 마트 미리보기' }));
    expect(screen.getByTestId('market-interior-cozy', { includeHiddenElements: true })).toBeTruthy();
    expect(getGamePreferences().marketInteriorTheme).toBe('classic');
    fireEvent.press(screen.getByRole('button', { name: '여기서 걸어보기' }));
    expect(screen.getByTestId('game-controls')).toBeTruthy();
    fireEvent(screen.getByLabelText('이동 조이스틱'), 'accessibilityAction', { nativeEvent: { actionName: 'moveRight' } });
    expect(JSON.stringify(environment)).toBe(before);
    fireEvent.press(screen.getByRole('button', { name: '편집으로 돌아가기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  } finally { screen.unmount(); }
});

it('cannot cross shelves, people or outside walls even during large movement steps', () => {
  const environment = makeEnvironment();
  const before = JSON.stringify(environment);
  const employee = environment.employees[0];
  const obstacles = [getMarketShelfUnitRects(environment.shelves.meal)[0], getMarketPersonCollider(employee.point, employee.kind, employee.appearance)];
  for (const rect of obstacles) {
    const candidates = [
      { point: { x: rect.x + rect.width / 2, y: rect.y + rect.height + 35 }, dx: 0, dy: -(rect.height + 100), remainsBefore: (p: { x: number; y: number }) => p.y > rect.y + rect.height },
      { point: { x: rect.x - 35, y: rect.y + rect.height / 2 }, dx: rect.width + 100, dy: 0, remainsBefore: (p: { x: number; y: number }) => p.x < rect.x },
      { point: { x: rect.x + rect.width + 35, y: rect.y + rect.height / 2 }, dx: -(rect.width + 100), dy: 0, remainsBefore: (p: { x: number; y: number }) => p.x > rect.x + rect.width },
    ];
    const candidate = candidates.find(item => !isMarketEnvironmentBlocked(environment, item.point));
    expect(candidate).toBeDefined();
    const next = moveMarketPreviewPoint(environment, candidate!.point, candidate!.dx, candidate!.dy);
    expect(candidate!.remainsBefore(next)).toBe(true);
    expect(isMarketEnvironmentBlocked(environment, next)).toBe(false);
  }
  const edge = moveMarketPreviewPoint(environment, environment.spawn, 10000, 0);
  expect(edge.x).toBeLessThan(environment.world.width);
  expect(isMarketEnvironmentBlocked(environment, edge)).toBe(false);
  expect(JSON.stringify(environment)).toBe(before);
});

function keyboardPreview() {
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0, clock = 0;
  const raf = jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++frameId, callback); return frameId; });
  const cancel = jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(id => { if (id != null) frames.delete(id); });
  const spring = jest.spyOn(Animated, 'spring').mockImplementation(() => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }));
  const originalOS = Object.getOwnPropertyDescriptor(Platform, 'OS');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const listeners = new Map<string, Set<(event: KeyboardEvent) => void>>();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    addEventListener: (name: string, listener: (event: KeyboardEvent) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(listener);
    },
    removeEventListener: (name: string, listener: (event: KeyboardEvent) => void) => listeners.get(name)?.delete(listener),
  } });
  const environment = makeEnvironment(), onClose = jest.fn();
  const screen = render(<MarketLayoutPreview environment={environment} initialMode="walk" onClose={onClose} />);
  fireEvent(screen.getByTestId('market-preview-viewport'), 'layout', { nativeEvent: { layout: { width: 375, height: 650, x: 0, y: 0 } } });
  return {
    screen, frames, listeners, onClose, environment,
    point: () => {
      const style = StyleSheet.flatten(screen.getByTestId('market-preview-player', { includeHiddenElements: true }).props.style);
      return { x: value(style.transform[0].translateX), y: value(style.transform[1].translateY) };
    },
    pose: () => screen.UNSAFE_getByType(DirectionalAvatar).props.motion,
    advance: (count = 1) => {
      for (let index = 0; index < count; index++) act(() => {
        clock += 32; const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(clock));
      });
    },
    key: (type: string, key = '', options: Partial<KeyboardEvent> = {}) => act(() => {
      const event = { key, target: { tagName: 'DIV' }, shiftKey: false, preventDefault: jest.fn(), ...options } as unknown as KeyboardEvent;
      listeners.get(type)?.forEach(callback => callback(event));
    }),
    cleanup: () => {
      screen.unmount(); raf.mockRestore(); cancel.mockRestore(); spring.mockRestore();
      if (originalOS) Object.defineProperty(Platform, 'OS', originalOS);
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    },
  };
}

it('uses physical WASD, Shift sprint and shared controls while ignoring text inputs', () => {
  const preview = keyboardPreview();
  try {
    preview.key('keydown', 'd', { code: 'KeyD', target: { tagName: 'INPUT' } as never });
    preview.advance(2);
    expect(preview.point()).toEqual(preview.environment.spawn);
    preview.key('keydown', 'ㅇ', { code: 'KeyD' }); preview.advance(2);
    expect(preview.point().x - preview.environment.spawn.x).toBeCloseTo(190 * 0.032);
    expect(preview.pose()).toBe('walk');
    const beforeSprint = preview.point().x;
    preview.key('keydown', 'Shift', { shiftKey: true }); preview.advance();
    expect(preview.point().x - beforeSprint).toBeCloseTo(190 * 0.032 * RUN_SPEED_MULTIPLIER);
    expect(preview.pose()).toBe('sprint');
    preview.key('keyup', 'ㅇ', { code: 'KeyD' });
    expect(preview.pose()).toBe('idle');
    expect(preview.screen.UNSAFE_getByType(GameControls).props.controlMode).toBe('joystick');
  } finally { preview.cleanup(); }
});

it('stops held input on blur, overview, exit and unmount so no movement leaks into the editor', () => {
  const preview = keyboardPreview();
  try {
    preview.key('keydown', 'd', { code: 'KeyD', shiftKey: true }); preview.advance(2);
    preview.key('blur');
    const stopped = preview.point(); preview.advance(3);
    expect(preview.point()).toEqual(stopped);
    expect(preview.pose()).toBe('idle');
    preview.key('keydown', 'd', { code: 'KeyD' }); preview.advance(2);
    expect(preview.point().x - stopped.x).toBeCloseTo(190 * 0.032);
    fireEvent.press(preview.screen.getByRole('button', { name: '전체 모습 보기' }));
    expect(preview.frames.size).toBe(0);
    preview.key('keydown', 'd', { code: 'KeyD' });
    expect(preview.frames.size).toBe(0);
    fireEvent.press(preview.screen.getByRole('button', { name: '여기서 걸어보기' }));
    const resumed = preview.point(); preview.advance(3);
    expect(preview.point()).toEqual(resumed);
    preview.key('keydown', 'd', { code: 'KeyD' }); preview.advance(2);
    preview.key('keydown', 'Escape');
    expect(preview.onClose).toHaveBeenCalledTimes(1);
    expect(preview.frames.size).toBe(0);
    preview.screen.unmount();
    expect([...preview.listeners.values()].every(set => set.size === 0)).toBe(true);
    expect(preview.frames.size).toBe(0);
  } finally { preview.cleanup(); }
});

it('returns to the editor on Android back without starting or ending a market session', () => {
  let back: Parameters<typeof BackHandler.addEventListener>[1] | undefined;
  const subscription = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_name, handler) => {
    back = handler; return { remove: jest.fn() };
  });
  const onClose = jest.fn();
  const screen = render(<MarketLayoutPreview environment={makeEnvironment()} onClose={onClose} initialMode="walk" />);
  try {
    act(() => { expect(back!({ type: 'hardwareBackPress', timeStamp: 0 })).toBe(true); });
    expect(onClose).toHaveBeenCalledTimes(1);
  } finally { screen.unmount(); subscription.mockRestore(); }
});
