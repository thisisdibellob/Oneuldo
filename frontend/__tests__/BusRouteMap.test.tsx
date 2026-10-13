import { fireEvent, render, within } from '@testing-library/react-native';
import { BusRouteMap } from '../src/components/game/BusRouteMap';
import { getBusRouteStops, STOP_NAMES } from '../src/game/busSession';
import { StyleSheet } from 'react-native';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

it('실제 운행 순서로 정류장을 연결하고 현재 위치와 목적지를 표시한다', () => {
  const screen = render(<BusRouteMap currentStop="village" destination="library" />);
  expect(screen.getAllByTestId(/^route-map-stop-/).map(node => node.props.testID)).toEqual(getBusRouteStops('201', 'outbound').map(stop => `route-map-stop-${stop}`));
  expect(within(screen.getByTestId('route-map-stop-village')).getByText('현재')).toBeTruthy();
  expect(within(screen.getByTestId('route-map-stop-library')).getByText('목적지')).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: '305번 노선' }));
  expect(screen.queryByTestId('route-map-stop-library')).toBeNull();
  expect(screen.queryByText(`${STOP_NAMES.library}까지 바로 가지 않아요.`)).toBeNull();
  expect(screen.getAllByTestId(/^route-map-stop-/).map(node => node.props.testID)).toEqual(getBusRouteStops('305', 'outbound').map(stop => `route-map-stop-${stop}`));
});

it('반대편 정류장의 방향은 역순으로 보여 주며 이동 상태를 바꾸지 않는다', () => {
  const screen = render(<BusRouteMap currentStop="library" direction="inbound" destination="village" />);
  expect(screen.getByText('느티광장 방면')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '반대 방향 노선 보기' }));
  expect(screen.getByText('늘봄주민센터 방면')).toBeTruthy();
  expect(screen.getByText('반대편 정류장 방향')).toBeTruthy();
  expect(screen.getAllByTestId(/^route-map-stop-/).map(node => node.props.testID)).toEqual(getBusRouteStops('201', 'outbound').map(stop => `route-map-stop-${stop}`));
});

it('종점과 노선에 없는 정류장을 구분한다', () => {
  const screen = render(<BusRouteMap currentStop="civic" direction="outbound" />);
  expect(screen.getByText('종점')).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: '305번 노선' }));
  expect(screen.queryByText('종점')).toBeNull();
  expect(screen.getByRole('tab', { name: '305번 노선' }).props.accessibilityState.selected).toBe(true);
});

it.each([false, true])('노선 수와 방향·안내 문구가 달라도 지도 프레임 크기를 유지한다 (휴대폰 %s)', compact => {
  const screen = render(<BusRouteMap currentStop="village" destination="library" compact={compact} />);
  const frame = () => StyleSheet.flatten(screen.getByTestId('bus-route-map').props.style);
  const initialHeight = frame().height;
  expect(initialHeight).toBeGreaterThan(0);
  fireEvent.press(screen.getByRole('tab', { name: '305번 노선' }));
  expect(screen.getAllByTestId(/^route-map-stop-/)).toHaveLength(4);
  expect(frame().height).toBe(initialHeight);
  fireEvent.press(screen.getByRole('button', { name: '반대 방향 노선 보기' }));
  expect(frame().height).toBe(initialHeight);
  fireEvent.press(screen.getByRole('tab', { name: '201번 노선' }));
  expect(screen.getAllByTestId(/^route-map-stop-/)).toHaveLength(5);
  expect(frame().height).toBe(initialHeight);
});
