import { createRef } from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { BusWorld, type BusWorldHandle, type BusWorldProps } from '../src/components/game/BusWorld';
import { DirectionalAvatar } from '../src/components/game/DirectionalAvatar';
import { busArt } from '../src/game/busArt';
import { BUS_INTERIOR_SIZE, BUS_INTERIOR_BODY, BUS_INTERIOR_STATIONS, BUS_PASSENGER_PLACES, getBusPassengerPlace, BUS_PLAYER_SCALE, BUS_SEATED_POSITION, BUS_SEAT_BACK, busWorldSpawn, busWorldStations, findBusWorldPath, isBusWorldBlocked } from '../src/game/busWorld';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../src/components/game/DirectionalAvatar', () => ({ DirectionalAvatar: () => null }));

let frame: FrameRequestCallback | undefined;
let now = 0;
beforeEach(() => {
  now = 0;
  jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1; });
  jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(callback => callback(31, 57, 375, 740));
});
afterEach(() => jest.restoreAllMocks());
const base: BusWorldProps = { scene: 'village', locked: false, travelling: false, controlMode: 'joystick', reduceMotion: true, onInteract: jest.fn(), onNearbyChange: jest.fn() };
const value = (entry: number | { __getValue: () => number }) => typeof entry === 'number' ? entry : entry.__getValue();
function player(screen: ReturnType<typeof render>) {
  const style = StyleSheet.flatten(screen.getByTestId('bus-world-player').props.style);
  return { x: value(style.transform.find((part: { translateX?: number }) => part.translateX !== undefined).translateX),
    y: value(style.transform.find((part: { translateY?: number }) => part.translateY !== undefined).translateY), depth: value(style.zIndex) };
}
function frames(count = 120) { for (let i = 0; i < count; i++) act(() => frame!(now += 16.7)); }

it('조이스틱에서는 먼 물체를 눌러도 걷지 않고 가까운 준비물은 바로 이용한다', () => {
  const onInteract = jest.fn(); const screen = render(<BusWorld {...base} onInteract={onInteract} />);
  fireEvent.press(screen.getByLabelText('마을앞 주민센터·체육관 방면 정류장'));
  frames(); expect(player(screen)).toMatchObject(busWorldSpawn('village'));
  expect(onInteract).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('교통카드 챙기기'));
  expect(onInteract).toHaveBeenCalledWith('card');
  screen.unmount();
});

it('출발 위치의 캐릭터와 교통카드가 앞쪽 정류장 그림에 완전히 가려지지 않는다', () => {
  const screen = render(<BusWorld {...base} />);
  const spawn = busWorldSpawn('village');
  const character = { left: spawn.x - 64 * BUS_PLAYER_SCALE, top: spawn.y - 106, width: 128 * BUS_PLAYER_SCALE, height: 106 };
  const card = StyleSheet.flatten(screen.getByLabelText('교통카드 챙기기').props.style);
  const shelter = StyleSheet.flatten(screen.getByLabelText('마을앞 느티광장 방면 정류장').props.style);
  const overlaps = (a: typeof character, b: typeof character) => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
  expect(overlaps(character, shelter)).toBe(false);
  expect(overlaps(card, shelter)).toBe(false);
  screen.unmount();
});

it('터치 경로로 횡단보도를 건넌 후에만 반대 방향을 통지한다', () => {
  const onSideChange = jest.fn();
  const screen = render(<BusWorld {...base} scene="stop" controlMode="touch" crossingAllowed onSideChange={onSideChange} />);
  const tap = () => fireEvent.press(screen.getByLabelText('동네 보행로'), { nativeEvent: { locationX: 760, locationY: 570.25 } });
  tap(); frames(70); expect(onSideChange).not.toHaveBeenCalled();
  frames(430); expect(onSideChange).toHaveBeenCalledTimes(1); expect(onSideChange).toHaveBeenCalledWith('inbound');
  expect(player(screen).y).toBeCloseTo(570.25, 0);
  expect(Number.isInteger(player(screen).depth)).toBe(true);
  // Updating direction after the crossing must not teleport to a fresh spawn.
  const before = player(screen);
  screen.rerender(<BusWorld {...base} scene="stop" controlMode="touch" crossingAllowed direction="inbound" onSideChange={onSideChange} />);
  expect(player(screen)).toEqual(before);
  screen.unmount();
});

it('메뉴를 열거나 차량이 주행하면 이동 입력을 해제하고 하차벨만 사용할 수 있다', () => {
  const ref = createRef<BusWorldHandle>(); const onInteract = jest.fn();
  const screen = render(<BusWorld {...base} scene="bus" ref={ref} onInteract={onInteract} />);
  act(() => ref.current!.move({ x: 0, y: 1, running: true })); frames(10);
  screen.rerender(<BusWorld {...base} scene="bus" ref={ref} onInteract={onInteract} travelling />);
  const stopped = player(screen); act(() => ref.current!.move({ x: 0, y: 1, running: true })); frames();
  expect(player(screen)).toEqual(stopped);
  fireEvent.press(screen.getByLabelText('버스 뒷문으로 내리기')); expect(onInteract).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('하차벨 누르기')); expect(onInteract).toHaveBeenCalledWith('bell');
  screen.rerender(<BusWorld {...base} scene="bus" ref={ref} onInteract={onInteract} travelling locked />);
  fireEvent.press(screen.getByLabelText('하차벨 누르기')); expect(onInteract).toHaveBeenCalledTimes(1);
  screen.unmount();
});

it('앉으면 버스 앞을 보는 뒤태를 좌석에 놓고 앞쪽 등받이로 가리며 일어나면 통로를 복원한다', () => {
  const screen = render(<BusWorld {...base} scene="bus" />);
  screen.rerender(<BusWorld {...base} scene="bus" seated />);
  const seated = player(screen);
  expect(seated).toMatchObject(BUS_SEATED_POSITION);
  expect(isBusWorldBlocked(seated, { scene: 'bus' })).toBe(true);
  expect(screen.getByTestId('bus-seated-player')).toBeTruthy();
  expect(screen.UNSAFE_getByType(DirectionalAvatar).props).toMatchObject({ facing: 'back', motion: 'idle', scale: BUS_PLAYER_SCALE });
  const foreground = screen.getByTestId('bus-seat-foreground');
  const back = StyleSheet.flatten(foreground.props.style);
  expect(back).toMatchObject({ left: BUS_SEAT_BACK.x, top: BUS_SEAT_BACK.y, width: BUS_SEAT_BACK.width, height: BUS_SEAT_BACK.height, overflow: 'hidden' });
  expect(back.zIndex).toBeGreaterThan(seated.depth);
  expect(seated.x).toBeGreaterThan(back.left);
  expect(seated.x).toBeLessThan(back.left + back.width);
  expect(back.top).toBeLessThan(seated.y);
  // The foreground uses the identical room image, with matching crop/scale.
  const crop = foreground.findByType(Image);
  expect(crop.props.source).toEqual(busArt.interior);
  expect(StyleSheet.flatten(crop.props.style)).toMatchObject({ left: BUS_INTERIOR_BODY.x - back.left, top: BUS_INTERIOR_BODY.y - back.top, width: BUS_INTERIOR_BODY.width, height: BUS_INTERIOR_BODY.height });
  screen.rerender(<BusWorld {...base} scene="bus" seated={false} />);
  expect(isBusWorldBlocked(player(screen), { scene: 'bus' })).toBe(false);
  expect(player(screen).x).toBeGreaterThan(seated.x);
  expect(screen.queryByTestId('bus-seated-player')).toBeNull();
  expect(screen.queryByTestId('bus-seat-foreground')).toBeNull();
  screen.unmount();
});

it('버스 안에는 배경에 앉은 기사만 사용하고 별도 서 있는 기사 그림을 얹지 않는다', () => {
  const screen = render(<BusWorld {...base} scene="bus" />);
  const images = screen.UNSAFE_getAllByType(Image);
  expect(images.filter(image => image.props.source === busArt.interior)).toHaveLength(1);
  expect(screen.getByLabelText('기사님에게 말 걸기')).toBeTruthy();
  expect(screen.UNSAFE_getAllByType(DirectionalAvatar)).toHaveLength(1);
  screen.unmount();
});

it('자리 이동이 끝난 뒤에만 후면 idle과 하체 자르기를 적용하며 이동 중에는 출발 대기를 알린다', () => {
  let finishSitting: ((result: { finished: boolean }) => void) | undefined;
  const onPassengerTransitionChange = jest.fn();
  jest.spyOn(Animated, 'sequence').mockImplementation(() => ({ start: callback => { finishSitting = callback; }, stop: jest.fn(), reset: jest.fn() }));
  const screen = render(<BusWorld {...base} scene="bus" reduceMotion={false} onPassengerTransitionChange={onPassengerTransitionChange} />);
  screen.rerender(<BusWorld {...base} scene="bus" reduceMotion={false} seated securedAt="seat" onPassengerTransitionChange={onPassengerTransitionChange} />);
  expect(onPassengerTransitionChange).toHaveBeenLastCalledWith(true);
  expect(screen.queryByTestId('bus-seated-player')).toBeNull();
  expect(screen.UNSAFE_getByType(DirectionalAvatar).props.motion).toBe('walk');
  act(() => finishSitting!({ finished: true }));
  expect(player(screen)).toMatchObject(BUS_SEATED_POSITION);
  expect(screen.UNSAFE_getByType(DirectionalAvatar).props).toMatchObject({ facing: 'back', motion: 'idle' });
  expect(StyleSheet.flatten(screen.getByTestId('bus-seated-player').props.style)).toMatchObject({ height: 77, overflow: 'hidden' });
  expect(onPassengerTransitionChange).toHaveBeenLastCalledWith(false);
  screen.unmount();
});

it('버스가 전진할 때만 도로 표식을 아래로 흐르게 하고 정차·메뉴·동작 줄이기에서는 정지한다', () => {
  const spy = jest.spyOn(Animated, 'timing');
  const screen = render(<BusWorld {...base} scene="bus" reduceMotion={false} />);
  const drives = () => spy.mock.calls.filter(([, config]) => config.duration === 5100);
  expect(drives()).toHaveLength(0);
  screen.rerender(<BusWorld {...base} scene="bus" reduceMotion={false} travelling />);
  expect(drives()).toHaveLength(1); expect(drives()[0][1].toValue).toBe(960);
  const markings = StyleSheet.flatten(screen.getByTestId('bus-moving-road-markings').props.style);
  expect(markings.left).toBeGreaterThan(0);
  expect(markings.left + markings.width).toBeLessThan(375);
  expect(screen.getByTestId('bus-interior-road').props.accessibilityValue.text).toBe('주행 중');
  screen.rerender(<BusWorld {...base} scene="bus" reduceMotion={false} travelling locked />);
  expect(screen.getByTestId('bus-interior-road').props.accessibilityValue.text).toBe('정차 중');
  screen.rerender(<BusWorld {...base} scene="bus" reduceMotion travelling />);
  expect(drives()).toHaveLength(1);
  screen.unmount();
});

it('착석 애니메이션 중 비동기로 동작 줄이기가 켜져도 목적지와 앉은 자세를 끝까지 반영한다', () => {
  let finishAnimation: ((result: { finished: boolean }) => void) | undefined;
  const stopAnimation = jest.fn(); const onPassengerTransitionChange = jest.fn();
  jest.spyOn(Animated, 'sequence').mockImplementation(() => ({ start: callback => { finishAnimation = callback; }, stop: stopAnimation, reset: jest.fn() }));
  const seatedProps = { ...base, scene: 'bus' as const, seated: true, securedAt: 'seat' as const, passengerPlaceId: 'seat-middle-left' as const, onPassengerTransitionChange };
  const screen = render(<BusWorld {...seatedProps} reduceMotion={false} />);
  expect(onPassengerTransitionChange).toHaveBeenLastCalledWith(true);
  expect(screen.queryByTestId('bus-seated-player')).toBeNull();
  screen.rerender(<BusWorld {...seatedProps} reduceMotion />);
  const seat = getBusPassengerPlace('seat-middle-left')!;
  expect(stopAnimation).toHaveBeenCalled();
  expect(player(screen)).toMatchObject(seat.position);
  expect(screen.getByTestId('bus-seated-player')).toBeTruthy();
  expect(screen.UNSAFE_getByType(DirectionalAvatar).props).toMatchObject({ facing: 'back', motion: 'idle' });
  expect(onPassengerTransitionChange).toHaveBeenLastCalledWith(false);
  // A stopped animation must not later restore its stale destination.
  screen.rerender(<BusWorld {...seatedProps} passengerPlaceId="seat-front-right" reduceMotion />);
  act(() => finishAnimation!({ finished: true }));
  expect(player(screen)).toMatchObject(getBusPassengerPlace('seat-front-right')!.position);
  screen.rerender(<BusWorld {...seatedProps} seated={false} securedAt="none" passengerPlaceId={null} reduceMotion={false} />);
  expect(onPassengerTransitionChange).toHaveBeenLastCalledWith(true);
  screen.rerender(<BusWorld {...seatedProps} seated={false} securedAt="none" passengerPlaceId={null} reduceMotion />);
  expect(player(screen)).toMatchObject(getBusPassengerPlace('seat-front-right')!.approach);
  expect(isBusWorldBlocked(player(screen), { scene: 'bus' })).toBe(false);
  expect(screen.queryByTestId('bus-seated-player')).toBeNull();
  expect(onPassengerTransitionChange).toHaveBeenLastCalledWith(false);
  screen.unmount();
});

it('승차 직후에는 더 가까운 기사보다 손이 닿는 카드 단말기를 우선하고 목표 변경도 즉시 반영한다', () => {
  const ref = createRef<BusWorldHandle>(); const onNearbyChange = jest.fn(); const onInteract = jest.fn();
  const props = { ...base, scene: 'bus' as const, ref, onNearbyChange, onInteract };
  const screen = render(<BusWorld {...props} />);
  expect(onNearbyChange).toHaveBeenLastCalledWith('driver');
  const before = player(screen);
  screen.rerender(<BusWorld {...props} target="reader-front" />);
  expect(onNearbyChange).toHaveBeenLastCalledWith('reader-front');
  expect(player(screen)).toEqual(before);
  act(() => ref.current!.interact());
  expect(onInteract).toHaveBeenLastCalledWith('reader-front');
  // A distant goal must not make the shared action button operate through furniture.
  screen.rerender(<BusWorld {...props} target="seat" />);
  expect(onNearbyChange).toHaveBeenLastCalledWith('driver');
  act(() => ref.current!.interact());
  expect(onInteract).toHaveBeenLastCalledWith('driver');
  screen.unmount();
});

it('새 버스 내부에서 승차 단말기·좌석·하차벨·중문을 실제 프레임 이동으로 차례로 이용한다', () => {
  const ref = createRef<BusWorldHandle>(); const onInteract = jest.fn();
  const screen = render(<BusWorld {...base} scene="bus" controlMode="touch" ref={ref} onInteract={onInteract} />);
  for (const station of ['reader-front', 'seat', 'bell', 'reader-rear', 'door-rear', 'driver'] as const) {
    onInteract.mockClear();
    act(() => ref.current!.navigate(station));
    for (let step = 0; step < 800 && !onInteract.mock.calls.length; step++) {
      act(() => frame!(now += 16.7));
      expect(isBusWorldBlocked(player(screen), { scene: 'bus' })).toBe(false);
    }
    expect(onInteract).toHaveBeenCalledTimes(1);
    if (station === 'seat') expect(onInteract).toHaveBeenCalledWith(station, 'seat-front-left');
    else expect(onInteract).toHaveBeenCalledWith(station);
    const target = BUS_INTERIOR_STATIONS[station]!;
    expect(Math.hypot(player(screen).x - target.x, player(screen).y - target.y)).toBeLessThanOrEqual(91);
  }
  screen.unmount();
});

it('여러 경유점을 거치는 실제 터치 경로를 멈추지 않고 끝까지 걸은 뒤 상호작용을 한 번 호출한다', () => {
  const onInteract = jest.fn();
  const destination = busWorldStations({ scene: 'village', direction: 'inbound' }).crossing!;
  const path = findBusWorldPath(busWorldSpawn('village'), destination, { scene: 'village', direction: 'inbound' });
  expect(path.length).toBeGreaterThan(1);
  const screen = render(<BusWorld {...base} controlMode="touch" direction="inbound" onInteract={onInteract} />);
  fireEvent.press(screen.getByLabelText('횡단보도 주변 살피기'));
  for (let step = 0; step < 1000 && !onInteract.mock.calls.length; step++) act(() => frame!(now += 16.7));
  expect(onInteract).toHaveBeenCalledTimes(1);
  expect(onInteract).toHaveBeenCalledWith('crossing');
  expect(Math.hypot(player(screen).x - destination.x, player(screen).y - destination.y)).toBeLessThan(2);
  frames(30); expect(onInteract).toHaveBeenCalledTimes(1);
  screen.unmount();
});

it('움직여 들어오는 버스의 승차·기사 버튼은 도착 애니메이션 완료 후에만 활성화한다', () => {
  let finishedArrival: ((result: { finished: boolean }) => void) | undefined;
  const original = Animated.timing;
  jest.spyOn(Animated, 'timing').mockImplementation((animationValue, config) => config.duration === 1100
    ? { start: callback => { finishedArrival = callback; }, stop: () => {}, reset: () => {} }
    : original(animationValue, config));
  const screen = render(<BusWorld {...base} scene="stop" reduceMotion={false} bus={{ number: '201', destination: '늘봄주민센터 방면', id: 'arrival-1' }} />);
  const board = () => screen.getByLabelText('201번 버스 타기');
  const driver = () => screen.getByLabelText('201번 기사에게 말 걸기');
  expect(board().props.accessibilityState.disabled).toBe(true);
  expect(driver().props.accessibilityState.disabled).toBe(true);
  act(() => finishedArrival!({ finished: true }));
  expect(board().props.accessibilityState.disabled).toBe(false);
  expect(driver().props.accessibilityState.disabled).toBe(false);
  screen.unmount();
});

it('손잡이를 선택하면 좌석으로 이동하지 않고 손잡이 옆에 서며 놓으면 그 옆 통로로 나온다', () => {
  const screen = render(<BusWorld {...base} scene="bus" />);
  screen.rerender(<BusWorld {...base} scene="bus" seated securedAt="handrail" />);
  const holding = player(screen);
  expect(holding).toMatchObject(BUS_INTERIOR_STATIONS.handrail!);
  expect(isBusWorldBlocked(holding, { scene: 'bus' })).toBe(false);
  expect(screen.queryByTestId('bus-seat-foreground')).toBeNull();
  expect(screen.queryByTestId('bus-seated-player')).toBeNull();
  screen.rerender(<BusWorld {...base} scene="bus" seated={false} securedAt="none" />);
  expect(isBusWorldBlocked(player(screen), { scene: 'bus' })).toBe(false);
  expect(Math.hypot(player(screen).x - holding.x, player(screen).y - holding.y)).toBeLessThan(70);
  screen.unmount();
});

it('정차 중에도 일어나기를 선택하기 전에는 패드·접근성·터치 경로로 자리를 벗어나지 않는다', () => {
  const ref = createRef<BusWorldHandle>();
  const screen = render(<BusWorld {...base} scene="bus" ref={ref} controlMode="touch" seated securedAt="seat" />);
  const before = player(screen);
  act(() => { ref.current!.move({ x: 0, y: 1, running: false }); ref.current!.nudge('moveDown'); });
  fireEvent.press(screen.getByLabelText('버스 통로'), { nativeEvent: { locationX: 350, locationY: 960 } });
  fireEvent.press(screen.getByLabelText('버스 뒷문으로 내리기'));
  frames(120); expect(player(screen)).toEqual(before);
  screen.rerender(<BusWorld {...base} scene="bus" ref={ref} controlMode="touch" seated={false} />);
  act(() => ref.current!.move({ x: 0, y: 1, running: false }));
  const stood = player(screen); frames(15); expect(player(screen).y).toBeGreaterThan(stood.y);
  screen.unmount();
});

it('조이스틱 모드에서는 화면 밖 횡단보도의 방향만 알리고 안내를 눌러 자동 이동하지 않는다', () => {
  const onInteract = jest.fn();
  const screen = render(<BusWorld {...base} scene="district" spawn={busWorldSpawn('stop')} target="crossing" onInteract={onInteract} />);
  const hint = screen.getByTestId('bus-target-edge');
  expect(hint.props.accessibilityLabel).toBe('오른쪽 횡단보도');
  expect(hint.props.pointerEvents).toBe('none');
  expect(hint.props.onPress).toBeUndefined();
  const before = player(screen);
  fireEvent.press(hint); frames(120);
  expect(player(screen)).toEqual(before); expect(onInteract).not.toHaveBeenCalled();
  const style = StyleSheet.flatten(hint.props.style);
  expect(style.left).toBe(375 - style.width - 18);
  expect(style.top).toBeGreaterThanOrEqual(260);
  expect(style.top + style.height).toBeLessThanOrEqual(740 - 245);
  screen.rerender(<BusWorld {...base} scene="district" spawn={busWorldSpawn('stop')} target={null} onInteract={onInteract} />);
  expect(screen.queryByTestId('bus-target-edge')).toBeNull();
  screen.unmount();
});

it('터치 모드의 화면 밖 단말기 안내를 누르면 실제 통로를 따라 이동하고 목표가 보이면 안내가 사라진다', () => {
  const onInteract = jest.fn();
  const screen = render(<BusWorld {...base} scene="bus" controlMode="touch" target="reader-rear" onInteract={onInteract} />);
  fireEvent.press(screen.getByRole('button', { name: '아래쪽 하차 단말기까지 이동' }));
  for (let step = 0; step < 800 && !onInteract.mock.calls.length; step++) {
    act(() => frame!(now += 16.7));
    expect(isBusWorldBlocked(player(screen), { scene: 'bus' })).toBe(false);
  }
  expect(onInteract).toHaveBeenCalledTimes(1); expect(onInteract).toHaveBeenCalledWith('reader-rear');
  expect(screen.queryByTestId('bus-target-edge')).toBeNull();
  screen.unmount();
});

it('작은 화면에서 숨은 목표가 태블릿 화면에 들어오면 가장자리 안내를 숨긴다', () => {
  const screen = render(<BusWorld {...base} scene="district" spawn={busWorldSpawn('stop')} target="crossing" />);
  expect(screen.getByTestId('bus-target-edge')).toBeTruthy();
  fireEvent(screen.getByTestId('bus-world'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 1024, height: 900 } } });
  expect(screen.queryByTestId('bus-target-edge')).toBeNull();
  screen.unmount();
});

it('정차 중 다른 좌석과 손잡이를 직접 골라 바꾸고 선택한 좌석에 맞는 등받이를 사용한다', () => {
  const onInteract = jest.fn();
  const screen = render(<BusWorld {...base} scene="bus" onInteract={onInteract} seated securedAt="seat" passengerPlaceId="seat-front-left" />);
  expect(screen.getByTestId('bus-place-seat-front-left').props.accessibilityState.selected).toBe(true);
  fireEvent.press(screen.getByLabelText('오른쪽 좌석에 앉기'));
  expect(onInteract).toHaveBeenLastCalledWith('seat', 'seat-front-right');
  screen.rerender(<BusWorld {...base} scene="bus" onInteract={onInteract} seated securedAt="seat" passengerPlaceId="seat-front-right" />);
  const right = getBusPassengerPlace('seat-front-right')!;
  expect(player(screen)).toMatchObject(right.position);
  expect(StyleSheet.flatten(screen.getByTestId('bus-seat-foreground').props.style)).toMatchObject({ left: right.seatBack!.x, top: right.seatBack!.y });
  fireEvent.press(screen.getByLabelText('뒤쪽 손잡이 잡기'));
  expect(onInteract).toHaveBeenLastCalledWith('handrail', 'handrail-rear');
  screen.rerender(<BusWorld {...base} scene="bus" onInteract={onInteract} seated securedAt="handrail" passengerPlaceId="handrail-rear" />);
  expect(player(screen)).toMatchObject(getBusPassengerPlace('handrail-rear')!.position);
  expect(screen.queryByTestId('bus-seat-foreground')).toBeNull();
  expect(screen.getByTestId('bus-place-handrail-rear').props.accessibilityState.selected).toBe(true);
  screen.rerender(<BusWorld {...base} scene="bus" onInteract={onInteract} seated={false} securedAt="none" />);
  expect(isBusWorldBlocked(player(screen), { scene: 'bus' })).toBe(false);
  screen.unmount();
});

it('조이스틱에서도 명시적으로 고른 먼 손잡이는 통로를 따라 접근한 후 잡으며 주행 중에는 자리 선택을 잠근다', () => {
  const onInteract = jest.fn();
  const screen = render(<BusWorld {...base} scene="bus" onInteract={onInteract} />);
  fireEvent.press(screen.getByLabelText('뒤쪽 손잡이 잡기'));
  expect(onInteract).not.toHaveBeenCalled();
  for (let step = 0; step < 800 && !onInteract.mock.calls.length; step++) {
    act(() => frame!(now += 16.7));
    expect(isBusWorldBlocked(player(screen), { scene: 'bus' })).toBe(false);
  }
  expect(onInteract).toHaveBeenCalledWith('handrail', 'handrail-rear');
  onInteract.mockClear();
  screen.rerender(<BusWorld {...base} scene="bus" onInteract={onInteract} travelling seated securedAt="handrail" passengerPlaceId="handrail-rear" />);
  for (const place of BUS_PASSENGER_PLACES) {
    expect(screen.getByTestId(`bus-place-${place.id}`).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByTestId(`bus-place-${place.id}`));
  }
  expect(onInteract).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('하차벨 누르기')); expect(onInteract).toHaveBeenCalledWith('bell');
  screen.unmount();
});

it('정류장 전광판은 해당 방향에 온 실제 노선만 도착으로 표시한다', () => {
  const screen = render(<BusWorld {...base} scene="stop" stopName="마을앞" direction="outbound" bus={{ number: '305', destination: '체육관' }} />);
  const outbound = within(screen.getByTestId('bus-stop-display-outbound'));
  expect(outbound.getByText('305')).toBeTruthy(); expect(outbound.getByText('201')).toBeTruthy();
  expect(outbound.getAllByText('도착')).toHaveLength(1);
  expect(within(screen.getByTestId('bus-stop-display-inbound')).queryByText('도착')).toBeNull();
  screen.rerender(<BusWorld {...base} scene="district" stopName="하늘도서관" />);
  expect(within(screen.getByTestId('bus-stop-display-outbound')).queryByText('305')).toBeNull();
  screen.unmount();
});

it('조이스틱 투명 영역에서 전달된 화면 좌표는 카메라와 화면 원점을 적용해 해당 좌석만 선택한다', () => {
  const onInteract = jest.fn(); const ref = createRef<BusWorldHandle>();
  const screen = render(<BusWorld {...base} scene="bus" ref={ref} onInteract={onInteract} />);
  fireEvent(screen.getByTestId('bus-world'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } });
  const style = StyleSheet.flatten(screen.getByTestId('bus-world-camera').props.style);
  const camera = { x: value(style.transform[0].translateX), y: value(style.transform[1].translateY) };
  const place = getBusPassengerPlace('seat-front-left')!;
  const screenPoint = { x: 31 + camera.x + place.hitbox.x + 30, y: 57 + camera.y + place.hitbox.y + 30 };
  act(() => ref.current!.tapPassengerPlace(screenPoint));
  for (let step = 0; step < 800 && !onInteract.mock.calls.length; step++) act(() => frame!(now += 16.7));
  expect(onInteract).toHaveBeenCalledWith('seat', 'seat-front-left');
  onInteract.mockClear();
  act(() => ref.current!.tapPassengerPlace({ x: 390, y: 20 }));
  expect(onInteract).not.toHaveBeenCalled();
  screen.rerender(<BusWorld {...base} scene="bus" ref={ref} onInteract={onInteract} travelling />);
  act(() => ref.current!.tapPassengerPlace(screenPoint));
  expect(onInteract).not.toHaveBeenCalled();
  screen.unmount();
});
