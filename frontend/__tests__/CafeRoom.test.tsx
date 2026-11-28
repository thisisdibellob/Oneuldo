import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';
import { CafeRoom } from '../src/components/game/CafeRoom';
import { GameControls } from '../src/components/game/GameControls';
import { CAFE_SPAWN, CAFE_STATIONS, findCafePath } from '../src/game/cafeWorld';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../src/components/game/DirectionalAvatar', () => ({ DirectionalAvatar: () => null }));
jest.mock('../src/game/cafeArt', () => ({ cafeArt: { counter: 1, table: 2, shelf: 3, coworker: 4 } }), { virtual: true });
jest.mock('../src/game/cafeWorld', () => ({ ...jest.requireActual('../src/game/cafeWorld'), findCafePath: jest.fn((_from, to) => [to]) }));

const props = { locked: false, controlMode: 'touch' as const, onInteract: jest.fn(), reduceMotion: true, target: null };
function playerPoint(screen: ReturnType<typeof render>) {
  const transform = StyleSheet.flatten(screen.getByTestId('cafe-player').props.style).transform;
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

it('캐릭터와 카메라 이동을 유지하며 공통 이동키를 사용한다', () => {
  let frame: FrameRequestCallback | undefined;
  jest.mocked(globalThis.requestAnimationFrame).mockImplementation(callback => { frame = callback; return 1; });
  const screen = render(<CafeRoom {...props} controlMode="joystick" />);
  expect(screen.UNSAFE_getByType(GameControls)).toBeTruthy();
  act(() => screen.UNSAFE_getByType(GameControls).props.onMove({ x: 1, y: 0, running: false }));
  for (let index = 1; index <= 10; index++) act(() => frame!(index * 40));
  const beforeModal = playerPoint(screen);
  expect(beforeModal[0]).toBeGreaterThan(CAFE_SPAWN.x);
  screen.rerender(<CafeRoom {...props} controlMode="joystick" locked />);
  for (let index = 11; index <= 20; index++) act(() => frame!(index * 40));
  expect(playerPoint(screen)).toEqual(beforeModal);
  screen.rerender(<CafeRoom {...props} controlMode="joystick" />);
  expect(playerPoint(screen)).toEqual(beforeModal);
  screen.unmount();
});

it('모바일 바닥 터치를 카메라와 페이지 원점을 고려해 월드로 변환한다', () => {
  const screen = render(<CafeRoom {...props} />);
  fireEvent(screen.getByTestId('cafe-room'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 740 } } });
  // World (680,900), camera (-452.5,-485), viewport page origin (31,57).
  fireEvent.press(screen.getByLabelText('카페 바닥'), { nativeEvent: { pageX: 258.5, pageY: 472, locationX: 0, locationY: 0 } });
  expect(findCafePath).toHaveBeenCalledWith(CAFE_SPAWN, { x: 680, y: 900 });
  screen.unmount();
});

it('조이스틱 모드에서 먼 오브젝트를 누르거나 요청받아도 자동 이동하지 않는다', () => {
  const onInteract = jest.fn();
  const screen = render(<CafeRoom {...props} controlMode="joystick" onInteract={onInteract} navigationRequest={{ id: 1, station: 'brew' }} />);
  fireEvent.press(screen.getByRole('button', { name: '카페 음료 작업대' }));
  fireEvent.press(screen.getByLabelText('카페 바닥'), { nativeEvent: { locationX: 595, locationY: 472 } });
  expect(findCafePath).not.toHaveBeenCalled();
  expect(onInteract).not.toHaveBeenCalled();
  screen.unmount();
});

it('터치 모드에서 실제 접근점에 도착한 뒤 상호작용한다', () => {
  let frame: FrameRequestCallback | undefined;
  jest.mocked(globalThis.requestAnimationFrame).mockImplementation(callback => { frame = callback; return 1; });
  const onInteract = jest.fn();
  const screen = render(<CafeRoom {...props} onInteract={onInteract} />);
  fireEvent.press(screen.getByRole('button', { name: '카페 출입문' }));
  expect(findCafePath).toHaveBeenCalledWith(CAFE_SPAWN, CAFE_STATIONS.exit.point);
  expect(onInteract).not.toHaveBeenCalled();
  for (let index = 1; index <= 35; index++) act(() => frame!(index * 40));
  expect(onInteract).toHaveBeenCalledTimes(1);
  expect(onInteract).toHaveBeenCalledWith('exit');
  screen.unmount();
});

it('패널이 열리면 경로를 취소하고 손님이 떠난 뒤에는 응대할 수 없다', () => {
  const onInteract = jest.fn();
  const screen = render(<CafeRoom {...props} onInteract={onInteract} />);
  fireEvent.press(screen.getByLabelText('카페 바닥'), { nativeEvent: { locationX: 690, locationY: 930 } });
  expect(screen.getByLabelText('이동할 위치')).toBeTruthy();
  screen.rerender(<CafeRoom {...props} onInteract={onInteract} locked />);
  expect(screen.queryByLabelText('이동할 위치')).toBeNull();
  jest.mocked(findCafePath).mockClear();
  fireEvent.press(screen.getByRole('button', { name: '카페 음료 작업대' }));
  expect(findCafePath).not.toHaveBeenCalled();
  screen.rerender(<CafeRoom {...props} onInteract={onInteract} guestPresent={false} navigationRequest={{ id: 2, station: 'customer' }} />);
  expect(screen.queryByTestId('cafe-guest')).toBeNull();
  expect(findCafePath).not.toHaveBeenCalled();
  expect(onInteract).not.toHaveBeenCalled();
  screen.unmount();
});

it('음료 운반과 사용한 테이블의 상태를 공간 안에도 표시한다', () => {
  const screen = render(<CafeRoom {...props} carrying tableDirty guestId="jiyoung" />);
  expect(screen.getByLabelText('완성한 음료를 들고 있어요')).toBeTruthy();
  expect(screen.getByTestId('cafe-dirty-table')).toBeTruthy();
  expect(screen.getByRole('button', { name: '지영 손님에게 말 걸기' })).toBeTruthy();
  screen.rerender(<CafeRoom {...props} />);
  expect(screen.queryByLabelText('완성한 음료를 들고 있어요')).toBeNull();
  expect(screen.queryByTestId('cafe-dirty-table')).toBeNull();
  screen.unmount();
});
