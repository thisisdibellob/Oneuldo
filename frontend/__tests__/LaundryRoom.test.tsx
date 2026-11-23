import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, StyleSheet, View } from 'react-native';
import { LaundryRoom } from '../src/components/game/LaundryRoom';
import { GameControls } from '../src/components/game/GameControls';
import { DirectionalAvatar } from '../src/components/game/DirectionalAvatar';
import { LAUNDRY_PLAYER_SCALE, LAUNDRY_SPAWN, LAUNDRY_STATIONS, findLaundryPath } from '../src/game/laundryWorld';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../src/components/game/DirectionalAvatar', () => ({ DirectionalAvatar: () => null }));
jest.mock('../src/game/laundryArt', () => ({ laundryArt: { washer: 1, dryer: 2, foldingTable: 3, dryingRack: 4, basket: 5 } }), { virtual: true });
jest.mock('../src/game/laundryWorld', () => ({ ...jest.requireActual('../src/game/laundryWorld'), findLaundryPath: jest.fn((_from, to) => [to]) }));

const props = { locked: false, controlMode: 'touch' as const, onInteract: jest.fn(), reduceMotion: true, target: null, washing: false, drying: false, carrying: false };
function playerPoint(screen: ReturnType<typeof render>) {
  const transform = StyleSheet.flatten(screen.getByTestId('laundry-player').props.style).transform;
  return transform.map((axis: Record<string, number | { __getValue: () => number }>) => {
    const value = Object.values(axis)[0];
    return typeof value === 'number' ? value : value.__getValue();
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
  jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(callback => callback(31, 57, 375, 740));
});
afterEach(() => jest.restoreAllMocks());

it('공통 조작과 캐릭터 크기를 유지하고 업무 창이 열려도 위치가 바뀌지 않는다', () => {
  let frame: FrameRequestCallback | undefined;
  jest.mocked(globalThis.requestAnimationFrame).mockImplementation(callback => { frame = callback; return 1; });
  const screen = render(<LaundryRoom {...props} controlMode="joystick" />);
  expect(screen.UNSAFE_getByType(DirectionalAvatar).props.scale).toBe(LAUNDRY_PLAYER_SCALE);
  act(() => screen.UNSAFE_getByType(GameControls).props.onMove({ x: 1, y: 0, running: false }));
  for (let index = 1; index <= 10; index++) act(() => frame!(index * 40));
  const beforeModal = playerPoint(screen);
  expect(beforeModal[0]).toBeGreaterThan(LAUNDRY_SPAWN.x);
  // Keep subpixel motion: rounding the actor but not the camera creates jitter.
  expect(beforeModal[0] % 1).not.toBe(0);
  screen.rerender(<LaundryRoom {...props} controlMode="joystick" locked />);
  for (let index = 11; index <= 20; index++) act(() => frame!(index * 40));
  expect(playerPoint(screen)).toEqual(beforeModal);
  screen.rerender(<LaundryRoom {...props} controlMode="joystick" />);
  expect(playerPoint(screen)).toEqual(beforeModal);
  screen.unmount();
});

it('카메라와 화면 원점을 고려해 모바일 터치를 월드 좌표로 바꾼다', () => {
  const screen = render(<LaundryRoom {...props} />);
  fireEvent(screen.getByTestId('laundry-room'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 740 } } });
  // Camera (-412.5,-410), page origin (31,57), world (650,850).
  fireEvent.press(screen.getByLabelText('빨래방 바닥'), { nativeEvent: { pageX: 268.5, pageY: 497, locationX: 0, locationY: 0 } });
  expect(findLaundryPath).toHaveBeenCalledWith(LAUNDRY_SPAWN, { x: 650, y: 850 });
  screen.unmount();
});

it('조이스틱에서는 물건이나 방향 안내를 눌러도 자동으로 걷지 않는다', () => {
  const onInteract = jest.fn();
  const screen = render(<LaundryRoom {...props} controlMode="joystick" onInteract={onInteract} target="washer" navigationRequest={{ id: 1, station: 'washer' }} />);
  fireEvent.press(screen.getByRole('button', { name: '빨래방 세탁기' }));
  fireEvent.press(screen.getByLabelText('빨래방 바닥'), { nativeEvent: { locationX: 467, locationY: 493 } });
  expect(findLaundryPath).not.toHaveBeenCalled();
  expect(onInteract).not.toHaveBeenCalled();
  expect(screen.getByTestId('laundry-target-edge').props.accessibilityRole).not.toBe('button');
  screen.unmount();
});

it('터치 이동 후 출입문에 도착해야 나가기 동작을 실행한다', () => {
  let frame: FrameRequestCallback | undefined;
  jest.mocked(globalThis.requestAnimationFrame).mockImplementation(callback => { frame = callback; return 1; });
  const onInteract = jest.fn();
  const screen = render(<LaundryRoom {...props} onInteract={onInteract} />);
  fireEvent.press(screen.getByRole('button', { name: '빨래방 출입문' }));
  expect(findLaundryPath).toHaveBeenCalledWith(LAUNDRY_SPAWN, LAUNDRY_STATIONS.exit.point);
  expect(onInteract).not.toHaveBeenCalled();
  for (let index = 1; index <= 30; index++) act(() => frame!(index * 40));
  expect(onInteract).toHaveBeenCalledTimes(1);
  expect(onInteract).toHaveBeenCalledWith('exit');
  screen.unmount();
});

it('열린 패널은 터치 경로를 취소하고 다른 손님 세탁기는 조작 대상이 아니다', () => {
  const screen = render(<LaundryRoom {...props} />);
  fireEvent.press(screen.getByLabelText('빨래방 바닥'), { nativeEvent: { locationX: 690, locationY: 855 } });
  expect(screen.getByLabelText('이동할 위치')).toBeTruthy();
  screen.rerender(<LaundryRoom {...props} locked />);
  expect(screen.queryByLabelText('이동할 위치')).toBeNull();
  jest.mocked(findLaundryPath).mockClear();
  fireEvent.press(screen.getByRole('button', { name: '빨래방 세탁기' }));
  expect(findLaundryPath).not.toHaveBeenCalled();
  expect(screen.getByTestId('laundry-occupied-washer').props.accessibilityRole).not.toBe('button');
  expect(screen.getByTestId('laundry-occupied-washer').props.onPress).toBeUndefined();
  screen.unmount();
});

it('실제 세탁·건조 상태와 운반 중인 바구니를 표시하며 모션 감소 시 회전하지 않는다', () => {
  const loop = jest.spyOn(Animated, 'loop');
  const screen = render(<LaundryRoom {...props} washing drying airDrying carrying />);
  expect(screen.getByTestId('laundry-washer-running')).toBeTruthy();
  expect(screen.getByTestId('laundry-dryer-running')).toBeTruthy();
  expect(screen.getByTestId('laundry-rack-running')).toBeTruthy();
  expect(screen.getByLabelText('빨래 바구니를 들고 있어요')).toBeTruthy();
  expect(loop).not.toHaveBeenCalled();
  screen.rerender(<LaundryRoom {...props} />);
  expect(screen.queryByTestId('laundry-washer-running')).toBeNull();
  expect(screen.queryByTestId('laundry-dryer-running')).toBeNull();
  expect(screen.queryByTestId('laundry-rack-running')).toBeNull();
  expect(screen.queryByLabelText('빨래 바구니를 들고 있어요')).toBeNull();
  screen.unmount();
});

it('돌아가는 기계는 네이티브 드라이버를 사용하고 멈추면 애니메이션을 정리한다', () => {
  const start = jest.fn(); const stop = jest.fn();
  const loop = jest.spyOn(Animated, 'loop').mockReturnValue({ start, stop, reset: jest.fn() });
  const timing = jest.spyOn(Animated, 'timing');
  const screen = render(<LaundryRoom {...props} reduceMotion={false} washing drying />);
  expect(loop).toHaveBeenCalledTimes(3); // occupied washer, own washer, dryer
  expect(timing.mock.calls.every(([, config]) => config.useNativeDriver && config.isInteraction === false)).toBe(true);
  screen.rerender(<LaundryRoom {...props} reduceMotion={false} />);
  expect(stop).toHaveBeenCalledTimes(2);
  screen.unmount();
  expect(stop).toHaveBeenCalledTimes(3);
});
