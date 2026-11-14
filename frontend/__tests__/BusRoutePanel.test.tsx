import { fireEvent, render } from '@testing-library/react-native';
import { Dimensions, StyleSheet, Text } from 'react-native';
import { BusRoutePanel, BusTimetable } from '../src/components/game/BusJourneyPanels';
import { createBusSession } from '../src/game/busSession';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

it('201·305 및 반대 방향과 종점의 내용이 달라도 팝업과 지도의 크기가 동일하다', () => {
  const screen = render(<BusRoutePanel title="정류장 노선" onClose={jest.fn()}><BusTimetable session={createBusSession({ phase: 'waiting' })} /></BusRoutePanel>);
  const frame = () => StyleSheet.flatten(screen.getByTestId('bus-route-panel-frame').props.style);
  const initial = frame();
  expect(initial.height).toBe(Math.min(700, Dimensions.get('window').height - 64));
  const initialMapHeight = StyleSheet.flatten(screen.getByTestId('bus-route-map').props.style).height;
  fireEvent.press(screen.getByRole('tab', { name: '305번 노선' }));
  fireEvent.press(screen.getByRole('button', { name: '반대 방향 노선 보기' }));
  expect([frame().height, frame().width, frame().maxWidth]).toEqual([initial.height, initial.width, initial.maxWidth]);
  expect(StyleSheet.flatten(screen.getByTestId('bus-route-map').props.style).height).toBe(initialMapHeight);
  screen.rerender(<BusRoutePanel title="가는 길" onClose={jest.fn()}><Text>도착</Text></BusRoutePanel>);
  expect([frame().height, frame().width, frame().maxWidth]).toEqual([initial.height, initial.width, initial.maxWidth]);
});

it('전광판은 실제 접근·정차 상태를 표시하고 누른 버스의 노선도를 연다', () => {
  const session = createBusSession({ phase: 'waiting' });
  const screen = render(<BusTimetable session={session} upcomingRoute="305" />);
  const approaching = screen.getByRole('button', { name: '305번 체육관 방면, 곧도착. 노선 보기' });
  expect(screen.getByRole('button', { name: '201번 늘봄주민센터 방면, 대기. 노선 보기' })).toBeTruthy();
  fireEvent.press(approaching);
  expect(screen.getByRole('tab', { name: '305번 노선' })).toBeSelected();
  screen.rerender(<BusTimetable session={{ ...session, offeredRoute: '305' }} upcomingRoute="201" />);
  expect(screen.getByRole('button', { name: '305번 체육관 방면, 도착. 노선 보기' })).toBeTruthy();
  expect(screen.queryByText('곧도착')).toBeNull();
  expect(screen.getByText('305번 버스가 도착했습니다')).toBeTruthy();
});

it('종점 안내판에 존재하지 않는 출발 버스나 도착 시간을 만들지 않는다', () => {
  const screen = render(<BusTimetable session={createBusSession({ stop: 'civic', direction: 'outbound', phase: 'waiting' })} upcomingRoute="201" />);
  expect(screen.getByText('반대편 정류장에서 타요')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /, (대기|곧도착|도착). 노선 보기/ })).toBeNull();
});
