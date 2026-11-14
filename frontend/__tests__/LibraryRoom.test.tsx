import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';
import { LibraryRoom } from '../src/components/game/LibraryRoom';
import { GameControls } from '../src/components/game/GameControls';
import { findLibraryPath, isLibraryBlocked, LIBRARY_SHELVES, LIBRARY_SPAWN, LIBRARY_STATIONS, LIBRARY_VISITOR_SPAWNS, LIBRARY_PLAYER_RADIUS, LIBRARY_COMPUTERS, LIBRARY_COUNTER, LIBRARY_LOUNGE, LIBRARY_LOUNGE_FOOTPRINT_TOP, LIBRARY_DECORATIONS, LIBRARY_FOLLOW_DISTANCE } from '../src/game/libraryWorld';
import { getLibraryCategory, LIBRARY_CATEGORIES } from '../src/game/librarySession';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../src/components/game/DirectionalAvatar', () => ({ DirectionalAvatar: () => null }));
jest.mock('../src/game/libraryWorld', () => ({
  ...jest.requireActual('../src/game/libraryWorld'),
  findLibraryPath: jest.fn((_from, to) => [to]),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
  jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(callback => callback(31, 57, 375, 740));
});
afterEach(() => jest.restoreAllMocks());

const props = { locked: false, controlMode: 'touch' as const, visitorVisible: false,
  target: null, onInteract: jest.fn(), reduceMotion: true };

function room() {
  return render(<LibraryRoom {...props} />);
}

it.each([
  // Same world point (500,1380), zoom 1. Portrait framing keeps wall labels visible.
  { name: '모바일', width: 375, height: 740, pageX: 238.5, pageY: 482 },
  { name: '큰 데스크톱', width: 1280, height: 912, pageX: 531, pageY: 639 },
  { name: '낮은 데스크톱', width: 1024, height: 560, pageX: 531, pageY: 287 },
  // A viewport larger than the room centers it without shrinking the character.
  { name: '방보다 큰 데스크톱', width: 2000, height: 1900, pageX: 601, pageY: 1532 },
])('$name에서 바닥 탭의 화면 좌표를 확대·이동된 월드 좌표로 환산한다', sample => {
  const screen = room();
  fireEvent(screen.getByTestId('library-room'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: sample.width, height: sample.height } },
  });
  fireEvent.press(screen.getByLabelText('도서관 바닥'), {
    nativeEvent: { pageX: sample.pageX, pageY: sample.pageY, locationX: 1, locationY: 1 },
  });
  expect(findLibraryPath).toHaveBeenCalledTimes(1);
  const [from, to] = jest.mocked(findLibraryPath).mock.calls[0];
  expect(from).toEqual(LIBRARY_SPAWN);
  expect(to.x).toBeCloseTo(500);
  expect(to.y).toBeCloseTo(1380);
  const marker = StyleSheet.flatten(screen.getByLabelText('이동할 위치').props.style);
  expect(marker.left).toBeCloseTo(488);
  expect(marker.top).toBeCloseTo(1374);
  screen.unmount();
});

it('페이지 좌표를 제공하지 않는 네이티브 탭은 바닥의 로컬 좌표를 사용한다', () => {
  const screen = room();
  fireEvent.press(screen.getByLabelText('도서관 바닥'), {
    nativeEvent: { locationX: 500, locationY: 1100 },
  });
  expect(findLibraryPath).toHaveBeenCalledWith(LIBRARY_SPAWN, { x: 500, y: 1100 });
  screen.unmount();
});

it('대화로 잠긴 동안 또는 조이스틱 모드에는 바닥 탭으로 경로를 만들지 않는다', () => {
  const screen = room();
  const tap = () => fireEvent.press(screen.getByLabelText('도서관 바닥'), {
    nativeEvent: { locationX: 500, locationY: 1100 },
  });
  screen.rerender(<LibraryRoom {...props} locked />);
  tap();
  expect(findLibraryPath).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('이동할 위치')).toBeNull();
  screen.rerender(<LibraryRoom {...props} controlMode="joystick" />);
  tap();
  expect(findLibraryPath).not.toHaveBeenCalled();
  screen.rerender(<LibraryRoom {...props} />);
  tap();
  expect(findLibraryPath).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('이동할 위치')).toBeTruthy();
  screen.rerender(<LibraryRoom {...props} locked />);
  expect(screen.queryByLabelText('이동할 위치')).toBeNull();
  screen.unmount();
});

it('조이스틱 모드에서 먼 오브젝트 탭은 이동하지 않고 가까운 오브젝트는 이용한다', () => {
  let frame: FrameRequestCallback | undefined;
  jest.mocked(globalThis.requestAnimationFrame).mockImplementation(callback => { frame = callback; return 1; });
  const onInteract = jest.fn();
  const screen = render(<LibraryRoom {...props} controlMode="joystick" onInteract={onInteract} />);
  fireEvent.press(screen.getByRole('button', { name: /반납 도서 카트/ }));
  fireEvent.press(screen.getByRole('button', { name: /문학 서가/ }));
  expect(findLibraryPath).not.toHaveBeenCalled();
  expect(onInteract).not.toHaveBeenCalled();
  // Walk from the entrance to the handoff box with the same shared input as the village.
  act(() => {
    const controls = screen.UNSAFE_getByType(GameControls).props;
    controls.onMoveStart(); controls.onMove({ x: 1, y: 0, running: false });
  });
  for (let index = 1; index <= 22; index++) act(() => frame!(index * 40));
  act(() => screen.UNSAFE_getByType(GameControls).props.onMoveEnd());
  fireEvent.press(screen.getByRole('button', { name: /담당자 확인함|확인함으로 이동/ }));
  expect(onInteract).toHaveBeenCalledWith('handoff');
  expect(findLibraryPath).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: '확인함 이용하기' }));
  expect(onInteract).toHaveBeenLastCalledWith('handoff');
  expect(onInteract).toHaveBeenCalledTimes(2);
  screen.unmount();
});

it('터치 모드의 먼 오브젝트 탭은 접근 위치로 경로를 만들고 대화 중에는 요청하지 않는다', () => {
  const onInteract = jest.fn();
  const screen = render(<LibraryRoom {...props} onInteract={onInteract} />);
  fireEvent.press(screen.getByRole('button', { name: /반납 도서 카트/ }));
  expect(findLibraryPath).toHaveBeenLastCalledWith(LIBRARY_SPAWN, LIBRARY_STATIONS.cart.point);
  expect(onInteract).not.toHaveBeenCalled();
  screen.rerender(<LibraryRoom {...props} locked onInteract={onInteract} />);
  jest.mocked(findLibraryPath).mockClear();
  fireEvent.press(screen.getByRole('button', { name: /반납 도서 카트/ }));
  fireEvent.press(screen.getByRole('button', { name: /담당자 확인함|확인함으로 이동/ }));
  expect(findLibraryPath).not.toHaveBeenCalled();
  expect(onInteract).not.toHaveBeenCalled();
  screen.unmount();
});

it('업무 패널에서 요청한 먼 목적지도 조이스틱 모드에서 자동 이동시키지 않는다', () => {
  const onInteract = jest.fn();
  const screen = render(<LibraryRoom {...props} controlMode="joystick" onInteract={onInteract}
    navigationRequest={{ id: 1, station: 'story' }} />);
  expect(findLibraryPath).not.toHaveBeenCalled();
  expect(onInteract).not.toHaveBeenCalled();
  screen.rerender(<LibraryRoom {...props} onInteract={onInteract} navigationRequest={{ id: 2, station: 'story' }} />);
  expect(findLibraryPath).toHaveBeenLastCalledWith(LIBRARY_SPAWN, LIBRARY_STATIONS.story.point);
  screen.unmount();
});

it('10개 서가의 번호와 이름을 읽을 수 있고 각각 누르면 해당 분류의 앞쪽으로 이동한다', () => {
  const screen = room();
  for (const category of LIBRARY_CATEGORIES) {
    const shelf = screen.getByRole('button', { name: `${category.callRange} 서가` });
    expect(screen.getByText(category.callRange.slice(0, 3))).toBeTruthy();
    expect(screen.getByText(category.label)).toBeTruthy();
    fireEvent.press(shelf);
    expect(findLibraryPath).toHaveBeenLastCalledWith(LIBRARY_SPAWN, LIBRARY_STATIONS[category.id].point);
  }
  expect(screen.getAllByRole('button', { name: /\d{3} .+ 서가/ })).toHaveLength(10);
  expect(screen.getAllByLabelText(/PC 열람석 \d/)).toHaveLength(3);
  screen.unmount();
});

it('업무 시작 전에도 손님 가까이 가면 짧은 팝업이 보이지만 클릭·이용 버튼·요청 이동으로 대화를 시작하지 못한다', () => {
  let frame: FrameRequestCallback | undefined;
  let now = 0;
  jest.mocked(globalThis.requestAnimationFrame).mockImplementation(callback => { frame = callback; return 1; });
  jest.mocked(findLibraryPath).mockImplementation(jest.requireActual('../src/game/libraryWorld').findLibraryPath);
  const visitor = { id: 'visitor' as const, status: 'waiting' as const, requestType: 'find' as const, bookId: 'test-book' };
  const onInteract = jest.fn();
  const screen = render(<LibraryRoom {...props} visitors={[visitor]} visitorInteractionEnabled={false} onInteract={onInteract} />);
  expect(screen.getByTestId('library-visitor')).toBeTruthy();
  expect(screen.queryByText('이 책은...')).toBeNull(); // The actor is still at the entrance, far from the visitor.
  expect(screen.queryByRole('button', { name: '이용자에게 말 걸기' })).toBeNull();
  fireEvent.press(screen.getByLabelText('도서관 바닥'), { nativeEvent: { locationX: 910, locationY: 1320 } });
  for (let step = 0; step < 115; step++) act(() => frame!(now += 32));
  expect(screen.getByText('이 책은...')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '이용자 이용하기' })).toBeNull();
  jest.mocked(findLibraryPath).mockClear();
  fireEvent.press(screen.getByLabelText('이용자'));
  screen.rerender(<LibraryRoom {...props} visitors={[visitor]} visitorInteractionEnabled={false} onInteract={onInteract} navigationRequest={{ id: 1, station: 'visitor' }} />);
  expect(findLibraryPath).not.toHaveBeenCalled();
  expect(onInteract).not.toHaveBeenCalled();
  screen.rerender(<LibraryRoom {...props} visitors={[visitor]} visitorInteractionEnabled onInteract={onInteract} />);
  for (let step = 0; step < 5; step++) act(() => frame!(now += 32));
  fireEvent.press(screen.getByRole('button', { name: '이용자 이용하기' }));
  expect(onInteract).toHaveBeenCalledWith('visitor');
  for (const status of ['active', 'awaiting-shelve', 'awaiting-report'] as const) {
    screen.rerender(<LibraryRoom {...props} visitors={[{ ...visitor, status }]} visitorInteractionEnabled onInteract={onInteract} />);
    expect(screen.getByText('이 책은...')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '이용자에게 말 걸기' }));
    expect(onInteract).toHaveBeenLastCalledWith('visitor');
  }
  screen.rerender(<LibraryRoom {...props} visitors={[{ ...visitor, status: 'resolved' }]} visitorInteractionEnabled />);
  expect(screen.getByTestId('library-visitor')).toBeTruthy();
  expect(screen.queryByText('이 책은...')).toBeNull();
  expect(screen.queryByRole('button', { name: '이용자에게 말 걸기' })).toBeNull();
  screen.unmount();
});

it('손님 0~2명이 서로 다른 자리에 있고 실제로 가까운 두 번째 손님의 팝업·대화를 구분한다', () => {
  let frame: FrameRequestCallback | undefined;
  let now = 0;
  jest.mocked(globalThis.requestAnimationFrame).mockImplementation(callback => { frame = callback; return 1; });
  jest.mocked(findLibraryPath).mockImplementation(jest.requireActual('../src/game/libraryWorld').findLibraryPath);
  const visitors = [
    { id: 'visitor' as const, status: 'waiting' as const, requestType: 'find' as const, bookId: 'book-one' },
    { id: 'visitor-2' as const, status: 'waiting' as const, requestType: 'shelve' as const, bookId: 'book-two' },
  ];
  const onInteract = jest.fn();
  const screen = render(<LibraryRoom {...props} visitors={[]} visitorInteractionEnabled onInteract={onInteract} />);
  expect(screen.queryByTestId('library-visitor')).toBeNull();
  expect(screen.queryByTestId('library-visitor-2')).toBeNull();
  screen.rerender(<LibraryRoom {...props} visitors={visitors.slice(0, 1)} visitorInteractionEnabled onInteract={onInteract} />);
  expect(screen.getByTestId('library-visitor')).toBeTruthy();
  expect(screen.queryByTestId('library-visitor-2')).toBeNull();
  screen.rerender(<LibraryRoom {...props} visitors={visitors} visitorInteractionEnabled onInteract={onInteract} />);
  expect(screen.getByTestId('library-visitor-2')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('도서관 바닥'), { nativeEvent: { locationX: 1110, locationY: 1320 } });
  for (let step = 0; step < 170; step++) act(() => frame!(now += 32));
  expect(screen.queryByTestId('visitor-nearby-hint')).toBeNull();
  expect(screen.getByTestId('visitor-2-nearby-hint')).toBeTruthy();
  expect(screen.getAllByText('이 책은...')).toHaveLength(1);
  fireEvent.press(screen.getByRole('button', { name: '이용자 2 이용하기' }));
  expect(onInteract).toHaveBeenLastCalledWith('visitor-2');
  fireEvent.press(screen.getByRole('button', { name: '이용자 2에게 말 걸기' }));
  expect(onInteract).toHaveBeenCalledTimes(2);
  // Moving away hides the proximity hint without needing a conversation state change.
  fireEvent.press(screen.getByLabelText('도서관 바닥'), { nativeEvent: { locationX: 480, locationY: 1400 } });
  for (let step = 0; step < 175; step++) act(() => frame!(now += 32));
  expect(screen.queryByText('이 책은...')).toBeNull();
  screen.unmount();
});

it('두 번째 손님만 동행할 때 첫 손님은 머무르고 동행 중 대화는 움직인 손님 위치에서 열린다', () => {
  let frame: FrameRequestCallback | undefined;
  let now = 0;
  jest.mocked(globalThis.requestAnimationFrame).mockImplementation(callback => { frame = callback; return 1; });
  jest.mocked(findLibraryPath).mockImplementation(jest.requireActual('../src/game/libraryWorld').findLibraryPath);
  const visitors = [
    { id: 'visitor' as const, status: 'waiting' as const, requestType: 'shelve' as const, bookId: 'book-one' },
    { id: 'visitor-2' as const, status: 'escorting' as const, requestType: 'find' as const, bookId: 'book-two' },
  ];
  const onInteract = jest.fn();
  const screen = render(<LibraryRoom {...props} visitors={visitors} visitorInteractionEnabled onInteract={onInteract} />);
  const point = (id: string) => {
    const style = StyleSheet.flatten(screen.getByTestId(id).props.style);
    const value = (entry: number | { __getValue: () => number }) => typeof entry === 'number' ? entry : entry.__getValue();
    return { x: value(style.transform.find((item: { translateX?: number }) => item.translateX !== undefined).translateX), y: value(style.transform.find((item: { translateY?: number }) => item.translateY !== undefined).translateY) };
  };
  fireEvent.press(screen.getByLabelText('도서관 바닥'), { nativeEvent: { locationX: 910, locationY: 1350 } });
  for (let step = 0; step < 130; step++) act(() => frame!(now += 32));
  expect(point('library-visitor')).toEqual(LIBRARY_VISITOR_SPAWNS.visitor);
  expect(point('library-visitor-2')).not.toEqual(LIBRARY_VISITOR_SPAWNS['visitor-2']);
  jest.mocked(findLibraryPath).mockClear();
  fireEvent.press(screen.getByRole('button', { name: '이용자 2에게 말 걸기' }));
  expect(onInteract).toHaveBeenCalledWith('visitor-2');
  expect(findLibraryPath).not.toHaveBeenCalled();
  const finished = point('library-visitor-2');
  screen.rerender(<LibraryRoom {...props} visitors={[visitors[0], { ...visitors[1], status: 'resolved' }]} visitorInteractionEnabled onInteract={onInteract} />);
  fireEvent.press(screen.getByLabelText('도서관 바닥'), { nativeEvent: { locationX: 1110, locationY: 1350 } });
  for (let step = 0; step < 60; step++) act(() => frame!(now += 32));
  expect(point('library-visitor-2')).toEqual(finished);
  screen.unmount();
});

it('동행 재입장 손님이 캐릭터 곁에서 따라오고 패널을 열면 멈추며 완료하면 그 자리에 남는다', () => {
  let frame: FrameRequestCallback | undefined;
  let now = 0;
  jest.mocked(globalThis.requestAnimationFrame).mockImplementation(callback => { frame = callback; return 1; });
  jest.mocked(findLibraryPath).mockImplementation(jest.requireActual('../src/game/libraryWorld').findLibraryPath);
  const screen = render(<LibraryRoom {...props} visitorVisible visitorStatus="escorting" />);
  const point = (id: 'player' | 'visitor') => {
    const style = StyleSheet.flatten((id === 'player' ? screen.getByLabelText('내 캐릭터') : screen.getByTestId('library-visitor')).props.style);
    const value = (entry: number | { __getValue: () => number }) => typeof entry === 'number' ? entry : entry.__getValue();
    return { x: value(style.transform.find((item: { translateX?: number }) => item.translateX !== undefined).translateX), y: value(style.transform.find((item: { translateY?: number }) => item.translateY !== undefined).translateY) };
  };
  const advance = (count: number) => { for (let step = 0; step < count; step++) act(() => frame!(now += 32)); };
  const initial = point('visitor');
  expect(Math.hypot(initial.x - LIBRARY_SPAWN.x, initial.y - LIBRARY_SPAWN.y)).toBeCloseTo(LIBRARY_FOLLOW_DISTANCE);
  expect(isLibraryBlocked(initial)).toBe(false);
  fireEvent.press(screen.getByLabelText('도서관 바닥'), { nativeEvent: { locationX: 910, locationY: 1350 } });
  advance(60);
  expect(point('visitor')).not.toEqual(initial);
  const paused = { visitor: point('visitor'), player: point('player') };
  screen.rerender(<LibraryRoom {...props} visitorVisible visitorStatus="escorting" locked />);
  advance(30);
  expect(point('visitor')).toEqual(paused.visitor);
  expect(point('player')).toEqual(paused.player);
  screen.rerender(<LibraryRoom {...props} visitorVisible visitorStatus="escorting" />);
  fireEvent.press(screen.getByLabelText('도서관 바닥'), { nativeEvent: { locationX: 910, locationY: 1350 } });
  advance(90);
  expect(point('visitor')).not.toEqual(paused.visitor);
  expect(Math.hypot(point('visitor').x - point('player').x, point('visitor').y - point('player').y)).toBeCloseTo(LIBRARY_FOLLOW_DISTANCE);
  const finished = point('visitor');
  screen.rerender(<LibraryRoom {...props} visitorVisible visitorStatus="resolved" />);
  fireEvent.press(screen.getByLabelText('도서관 바닥'), { nativeEvent: { locationX: 1100, locationY: 1350 } });
  advance(50);
  expect(point('visitor')).toEqual(finished);
  expect(screen.queryByRole('button', { name: '이용자 이용하기' })).toBeNull();
  screen.unmount();
});

it('벽 서가의 앞과 양면 서가의 앞뒤에 실제로 도달하며 발 위치에 맞춰 표시 순서가 바뀐다', () => {
  let frame: FrameRequestCallback | undefined;
  let now = 0;
  jest.mocked(globalThis.requestAnimationFrame).mockImplementation(callback => { frame = callback; return 1; });
  jest.mocked(findLibraryPath).mockImplementation(jest.requireActual('../src/game/libraryWorld').findLibraryPath);
  const screen = room();
  const value = (entry: number | { __getValue: () => number }) => typeof entry === 'number' ? entry : entry.__getValue();
  const player = () => {
    const style = StyleSheet.flatten(screen.getByLabelText('내 캐릭터').props.style);
    return {
      x: value(style.transform.find((item: { translateX?: number }) => item.translateX !== undefined).translateX),
      y: value(style.transform.find((item: { translateY?: number }) => item.translateY !== undefined).translateY),
      depth: value(style.zIndex),
    };
  };
  for (const shelf of LIBRARY_SHELVES) {
    const shelfView = screen.getByRole('button', { name: `${getLibraryCategory(shelf.id).callRange} 서가` });
    const shelfDepth = StyleSheet.flatten(shelfView.props.style).zIndex;
    expect(shelfDepth).toBe(shelf.y + shelf.height);
    const foot = shelf.y + shelf.height;
    const reachableSides = shelf.kind === 'wall' ? [foot + LIBRARY_PLAYER_RADIUS + 3.25]
      : [foot + LIBRARY_PLAYER_RADIUS + 3.25, foot - shelf.footprintDepth - LIBRARY_PLAYER_RADIUS - 3.25];
    for (const y of reachableSides) {
      const target = { x: shelf.x + shelf.width / 2, y };
      fireEvent.press(screen.getByLabelText('도서관 바닥'), { nativeEvent: { locationX: target.x, locationY: target.y } });
      for (let step = 0; step < 1200 && Math.hypot(player().x - target.x, player().y - target.y) >= 3; step++) act(() => frame!(now += 32));
      const actual = player();
      expect(Math.hypot(actual.x - target.x, actual.y - target.y)).toBeLessThan(3);
      expect(Number.isInteger(actual.depth)).toBe(true);
      expect(actual.depth > shelfDepth).toBe(target.y > shelfDepth);
      expect(Math.abs(actual.depth - actual.y)).toBeLessThanOrEqual(0.5);
    }
  }
  screen.unmount();
});

it('PC 앞뒤를 오갈 때 소수점 이동 좌표와 별개로 유효한 정수 표시 순서를 갱신한다', () => {
  let frame: FrameRequestCallback | undefined;
  let now = 0;
  jest.mocked(globalThis.requestAnimationFrame).mockImplementation(callback => { frame = callback; return 1; });
  jest.mocked(findLibraryPath).mockImplementation(jest.requireActual('../src/game/libraryWorld').findLibraryPath);
  const screen = room();
  const value = (entry: number | { __getValue: () => number }) => typeof entry === 'number' ? entry : entry.__getValue();
  const player = () => {
    const style = StyleSheet.flatten(screen.getByLabelText('내 캐릭터').props.style);
    return {
      x: value(style.transform.find((item: { translateX?: number }) => item.translateX !== undefined).translateX),
      y: value(style.transform.find((item: { translateY?: number }) => item.translateY !== undefined).translateY),
      depth: value(style.zIndex),
    };
  };
  const pc = StyleSheet.flatten(screen.getByLabelText('PC 열람석 1').props.style);
  for (const target of [{ x: 1290, y: 750.25 }, { x: 1290, y: 670.25 }, { x: 1290, y: 750.25 }]) {
    fireEvent.press(screen.getByLabelText('도서관 바닥'), { nativeEvent: { locationX: target.x, locationY: target.y } });
    for (let step = 0; step < 1200 && Math.hypot(player().x - target.x, player().y - target.y) >= 3; step++) {
      act(() => frame!(now += 16.7));
    }
    const actual = player();
    expect(Math.hypot(actual.x - target.x, actual.y - target.y)).toBeLessThan(3);
    // CSS rejects fractional z-index, leaving the previous depth on screen.
    expect(Number.isInteger(actual.depth)).toBe(true);
    expect(actual.depth > pc.zIndex).toBe(target.y > pc.zIndex);
    expect(Math.abs(actual.depth - actual.y)).toBeLessThanOrEqual(0.5);
  }
  screen.unmount();
});

it.each([{ width: 375, height: 812 }, { width: 320, height: 568 }])('$width×$height 모바일에서 벽 서가 이용 위치의 표지가 업무 카드 아래에 보이고 캐릭터는 하단 툴바 위에 남는다', size => {
  let frame: FrameRequestCallback | undefined;
  let now = 0;
  jest.mocked(globalThis.requestAnimationFrame).mockImplementation(callback => { frame = callback; return 1; });
  jest.mocked(findLibraryPath).mockImplementation(jest.requireActual('../src/game/libraryWorld').findLibraryPath);
  const screen = room();
  fireEvent(screen.getByTestId('library-room'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, ...size } } });
  const value = (entry: number | { __getValue: () => number }) => typeof entry === 'number' ? entry : entry.__getValue();
  const translation = (label: 'player' | 'camera') => {
    const style = StyleSheet.flatten((label === 'player' ? screen.getByLabelText('내 캐릭터') : screen.getByTestId('library-camera')).props.style);
    return { x: value(style.transform.find((item: { translateX?: number }) => item.translateX !== undefined).translateX), y: value(style.transform.find((item: { translateY?: number }) => item.translateY !== undefined).translateY) };
  };
  const wall = LIBRARY_SHELVES.filter(shelf => shelf.kind === 'wall');
  const samples = [...wall.map(shelf => ({ shelf, point: LIBRARY_STATIONS[shelf.id].point })), { shelf: wall[0], point: { x: wall[0].x + wall[0].width / 2, y: wall[0].y + wall[0].height + LIBRARY_PLAYER_RADIUS + 0.25 } }];
  for (const { shelf, point } of samples) {
    fireEvent.press(screen.getByLabelText('도서관 바닥'), { nativeEvent: { locationX: point.x, locationY: point.y } });
    for (let step = 0; step < 1600 && Math.hypot(translation('player').x - point.x, translation('player').y - point.y) >= 3; step++) act(() => frame!(now += 32));
    const player = translation('player'), camera = translation('camera');
    expect(Math.hypot(player.x - point.x, player.y - point.y)).toBeLessThan(3);
    expect(shelf.y + shelf.labelTop + camera.y).toBeGreaterThanOrEqual(190);
    expect(player.y + camera.y).toBeLessThanOrEqual(size.height - 128);
    // The toolbar occupies the bottom 100px; the feet retain at least 28px above it.
    expect(size.height - 100 - (player.y + camera.y)).toBeGreaterThanOrEqual(28);
  }
  screen.unmount();
});

it.each([
  { label: '중앙 독서 라운지', box: LIBRARY_LOUNGE, footprint: LIBRARY_LOUNGE.y + LIBRARY_LOUNGE_FOOTPRINT_TOP },
  { label: '두 자리 안내 데스크', box: LIBRARY_COUNTER, footprint: LIBRARY_COUNTER.y + LIBRARY_COUNTER.height - 46 },
  ...LIBRARY_DECORATIONS.map(item => ({ label: item.label, box: item, footprint: item.y + item.footprintTop })),
])('$label 아래쪽에 도달하면 캐릭터가 앞에 보이고 뒤로 돌아가면 가구 뒤에 보인다', ({ label, box, footprint }) => {
  let frame: FrameRequestCallback | undefined;
  let now = 0;
  jest.mocked(globalThis.requestAnimationFrame).mockImplementation(callback => { frame = callback; return 1; });
  jest.mocked(findLibraryPath).mockImplementation(jest.requireActual('../src/game/libraryWorld').findLibraryPath);
  const screen = room();
  expect(screen.getByLabelText(label)).toBeTruthy();
  const value = (entry: number | { __getValue: () => number }) => typeof entry === 'number' ? entry : entry.__getValue();
  const player = () => {
    const style = StyleSheet.flatten(screen.getByLabelText('내 캐릭터').props.style);
    return { x: value(style.transform.find((item: { translateX?: number }) => item.translateX !== undefined).translateX), y: value(style.transform.find((item: { translateY?: number }) => item.translateY !== undefined).translateY), depth: value(style.zIndex) };
  };
  for (const y of [box.y + box.height + LIBRARY_PLAYER_RADIUS + 3.25, footprint - LIBRARY_PLAYER_RADIUS - 3.25, box.y + box.height + LIBRARY_PLAYER_RADIUS + 3.25]) {
    const target = { x: box.x + box.width / 2, y };
    fireEvent.press(screen.getByLabelText('도서관 바닥'), { nativeEvent: { locationX: target.x, locationY: target.y } });
    for (let step = 0; step < 1800 && Math.hypot(player().x - target.x, player().y - target.y) >= 3; step++) act(() => frame!(now += 32));
    expect(Math.hypot(player().x - target.x, player().y - target.y)).toBeLessThan(3);
    expect(Number.isInteger(player().depth)).toBe(true);
    expect(player().depth > box.y + box.height).toBe(y > box.y + box.height);
  }
  screen.unmount();
});
