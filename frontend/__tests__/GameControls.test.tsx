import { act, fireEvent, render } from '@testing-library/react-native';
import { PanResponder, StyleSheet } from 'react-native';
import { GameControls } from '../src/components/game/GameControls';
import { resetGamePreferencesForTests, updateGamePreferences } from '../src/game/gamePreferences';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

const props = () => ({
  controlMode: 'joystick' as const, locked: false, reduceMotion: true,
  action: { label: '대화', icon: 'chatbubble' as const, available: true, onPress: jest.fn() },
  onMove: jest.fn(), onMoveStart: jest.fn(), onMoveEnd: jest.fn(), onAccessibilityMove: jest.fn(),
  runEnabled: false, onRunEnabledChange: jest.fn(),
});
let handlers: Parameters<typeof PanResponder.create>[0];
beforeEach(() => {
  resetGamePreferencesForTests();
  jest.spyOn(PanResponder, 'create').mockImplementation(config => { handlers = config; return { panHandlers: {} }; });
});
afterEach(() => jest.restoreAllMocks());
const grant = (x: number, y: number) => act(() => handlers.onPanResponderGrant!({ nativeEvent: { locationX: x, locationY: y } } as never, {} as never));
const move = (dx: number, dy: number) => act(() => handlers.onPanResponderMove!({} as never, { dx, dy } as never));

it('the stick starts at the first touch within its larger hit area and releases all movement', () => {
  const callbacks = props(); const screen = render(<GameControls {...callbacks} />);
  fireEvent(screen.getByLabelText('이동 조이스틱'), 'layout', { nativeEvent: { layout: { width: 240, height: 270 } } });
  grant(160, 100);
  const pad = () => StyleSheet.flatten(screen.getByTestId('game-joystick-pad').props.style);
  expect({ left: pad().left, top: pad().top }).toEqual({ left: 105, top: 45 });
  expect(callbacks.onMoveStart).toHaveBeenCalledTimes(1);
  move(18, 0); expect(callbacks.onMove.mock.lastCall?.[0].running).toBe(false);
  move(36, 0); expect(callbacks.onMove.mock.lastCall?.[0]).toEqual({ x: 1, y: 0, running: true });
  act(() => handlers.onPanResponderRelease!({} as never, {} as never));
  expect(callbacks.onMoveEnd).toHaveBeenCalledTimes(1);
  expect(pad().left).toBe(21);
  grant(80, 195);
  expect(pad().left).toBe(25);
  act(() => handlers.onPanResponderTerminate!({} as never, {} as never));
  expect(callbacks.onMoveEnd).toHaveBeenCalledTimes(2);
});

it('default distance mode has no toggle; a live settings change supplies the shared run button', () => {
  const callbacks = props(); const screen = render(<GameControls {...callbacks} />);
  expect(screen.queryByRole('button', { name: '달리기 켜기' })).toBeNull();
  act(() => updateGamePreferences({ runMode: 'toggle' }));
  fireEvent.press(screen.getByRole('button', { name: '달리기 켜기' }));
  expect(callbacks.onRunEnabledChange).toHaveBeenCalledWith(true);
  screen.rerender(<GameControls {...callbacks} runEnabled />);
  expect(screen.getByRole('button', { name: '달리기 끄기' }).props.accessibilityState.selected).toBe(true);
  grant(76, 198); move(18, 0);
  expect(callbacks.onMove.mock.lastCall?.[0].running).toBe(true);
});

it('a modal or touch-mode switch cancels held movement and action availability stays explicit', () => {
  const callbacks = props(); const screen = render(<GameControls {...callbacks} />);
  grant(76, 198); move(36, 0);
  screen.rerender(<GameControls {...callbacks} locked />);
  expect(callbacks.onMoveEnd).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('game-controls')).toBeNull();
  expect(handlers.onStartShouldSetPanResponder!({} as never, {} as never)).toBe(false);
  screen.rerender(<GameControls {...callbacks} controlMode="touch" />);
  expect(screen.queryByLabelText('이동 조이스틱')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '대화' }));
  expect(callbacks.action.onPress).toHaveBeenCalledTimes(1);
  screen.rerender(<GameControls {...callbacks} action={{ ...callbacks.action, available: false }} />);
  fireEvent.press(screen.getByRole('button', { name: '대화' }));
  expect(callbacks.action.onPress).toHaveBeenCalledTimes(1);
  fireEvent(screen.getByLabelText('이동 조이스틱'), 'accessibilityAction', { nativeEvent: { actionName: 'moveRight' } });
  expect(callbacks.onAccessibilityMove).toHaveBeenCalledWith('moveRight');
});

it('a travelling bus stops movement but keeps its bell action usable', () => {
  const callbacks = props(); const screen = render(<GameControls {...callbacks} />);
  grant(76, 198); move(36, 0);
  screen.rerender(<GameControls {...callbacks} movementDisabled />);
  expect(callbacks.onMoveEnd).toHaveBeenCalledTimes(1);
  expect(handlers.onStartShouldSetPanResponder!({} as never, {} as never)).toBe(false);
  fireEvent(screen.getByLabelText('이동 조이스틱'), 'accessibilityAction', { nativeEvent: { actionName: 'moveRight' } });
  expect(callbacks.onAccessibilityMove).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: '대화' }));
  expect(callbacks.action.onPress).toHaveBeenCalledTimes(1);
});

it('opt-in world taps pass through the large stick zone only after a short stationary release', () => {
  const callbacks = props(); const onWorldTap = jest.fn();
  const screen = render(<GameControls {...callbacks} onWorldTap={onWorldTap} />);
  let time = 1000; jest.spyOn(Date, 'now').mockImplementation(() => time);
  const touch = () => act(() => handlers.onPanResponderGrant!({ nativeEvent: { locationX: 125, locationY: 35, pageX: 125, pageY: 512 } } as never, {} as never));
  const release = () => act(() => handlers.onPanResponderRelease!({} as never, { dx: 0, dy: 0 } as never));
  touch(); time += 120; release();
  expect(onWorldTap).toHaveBeenCalledWith({ x: 125, y: 512 });
  expect(callbacks.onMoveEnd.mock.invocationCallOrder[0]).toBeLessThan(onWorldTap.mock.invocationCallOrder[0]);
  onWorldTap.mockClear();
  touch(); move(24, 0); move(0, 0); release();
  expect(onWorldTap).not.toHaveBeenCalled();
  touch(); time += 500; release(); expect(onWorldTap).not.toHaveBeenCalled();
  touch(); act(() => handlers.onPanResponderTerminate!({} as never, {} as never)); release(); expect(onWorldTap).not.toHaveBeenCalled();
  screen.rerender(<GameControls {...callbacks} movementDisabled onWorldTap={onWorldTap} />);
  expect(screen.getByLabelText('이동 조이스틱').props.pointerEvents).toBe('none');
  expect(handlers.onStartShouldSetPanResponder!({} as never, {} as never)).toBe(false);
  screen.unmount();
});

it('games without world-tap forwarding keep the existing floating stick hit area', () => {
  const screen = render(<GameControls {...props()} movementDisabled />);
  expect(screen.getByLabelText('이동 조이스틱').props.pointerEvents).toBe('auto');
  screen.unmount();
});
