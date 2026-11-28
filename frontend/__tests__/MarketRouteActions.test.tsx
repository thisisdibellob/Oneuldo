import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { MarketRouteReview, trajectorySvg } from '../src/components/game/MarketRouteReview';
import { applyMarketAction, createMarketSession, exportMarketEpisode, type MarketEpisodeEvent } from '../src/game/marketSession';
import { buildMarketTrajectory, marketRoutePointAt } from '../src/game/marketTrajectory';

// The test renderer has no native view tags; exercise the real JS animation clock here.
beforeEach(() => { jest.replaceProperty(Platform, 'OS', 'web'); });
afterEach(() => { jest.restoreAllMocks(); });

const at = (seconds: number) => new Date(Date.parse('2026-11-18T00:00:00Z') + seconds * 1000).toISOString();
function shopping() {
  let session = createMarketSession({ startedAt: at(0), seed: 'route-actions',
    objectives: [{ productId: 'milk', quantity: 2 }],
    learning: { stockoutEnabled: false, budgetChoiceEnabled: false } });
  session = applyMarketAction(session, { type: 'startTraining', at: at(1) });
  session = applyMarketAction(session, { type: 'setPosition', point: session.environment.stations.fresh, at: at(3) });
  session = applyMarketAction(session, { type: 'interact', station: 'fresh', at: at(4) });
  session = applyMarketAction(session, { type: 'add', productId: 'milk', quantity: 2, at: at(6) });
  session = applyMarketAction(session, { type: 'remove', productId: 'milk', at: at(8) });
  session = applyMarketAction(session, { type: 'closeStation', at: at(9) });
  return session;
}

test('accepted shelf and item actions preserve their exact position, order, quantities and elapsed time', () => {
  let session = shopping();
  const before = session.events.length;
  session = applyMarketAction(session, { type: 'add', productId: 'milk', at: at(10) });
  expect(session.lastActionError).toBeTruthy();
  expect(session.events.slice(before).map(e => e.type)).toEqual(['action_rejected']);
  session = applyMarketAction(session, { type: 'giveUp', at: at(11) });
  const { trajectory } = exportMarketEpisode(session);
  expect(trajectory.actions?.map(a => [a.kind, a.elapsedSeconds, a.quantity])).toEqual([
    ['shelf-opened', 3, undefined], ['item-added', 5, 2], ['item-removed', 7, 1], ['shelf-closed', 8, undefined],
  ]);
  for (const action of trajectory.actions ?? []) {
    expect(action).toMatchObject({ ...session.environment.stations.fresh, positionSource: 'recorded', stationId: 'fresh' });
    expect(marketRoutePointAt(trajectory, action.elapsedSeconds)).toMatchObject({ x: action.x, y: action.y });
  }
  expect(session.events.find(e => e.type === 'station_closed')?.payload.station).toBe('fresh');
  expect(trajectory.actions?.[1].label).toMatch(/2개 담기/);
});

test('legacy missing positions use only the last accepted sample; staff talks are included and post-end events excluded', () => {
  const events: MarketEpisodeEvent[] = [
    { type: 'training_started', timestamp: at(1), payload: { point: { x: 2, y: 3 } } },
    { type: 'station_interacted', timestamp: at(2), payload: { station: 'fresh', playerPosition: { x: 50, y: 60 } } },
    { type: 'cart_changed', timestamp: at(3), payload: { operation: 'add', productId: 'milk', quantity: 1 } },
    { type: 'station_closed', timestamp: at(4), payload: {} },
    { type: 'station_interacted', timestamp: at(5), payload: { station: 'staff:1' } },
    { type: 'station_closed', timestamp: at(6), payload: {} },
    { type: 'session_finished', timestamp: at(7), payload: {} },
    { type: 'cart_changed', timestamp: at(8), payload: { operation: 'add', productId: 'milk', quantity: 1 } },
  ].map((e, sequence) => ({ ...e, sequence }));
  const trajectory = buildMarketTrajectory(events, { x: 0, y: 0 });
  expect(trajectory.actions).toHaveLength(4);
  expect(trajectory.actions?.slice(1).map(a => [a.x, a.y, a.positionSource])).toEqual([
    [50, 60, 'last-known'], [50, 60, 'last-known'], [50, 60, 'last-known'],
  ]);
  expect(trajectory.durationSeconds).toBe(6);
});

test('action positions split at layout changes; imported item names are escaped in exported SVG', () => {
  const events = [
    { type: 'training_started', timestamp: at(0), payload: { point: { x: 0, y: 0 } } },
    { type: 'layout_changed', timestamp: at(2), payload: { playerPosition: { x: 800, y: 800 } } },
    { type: 'cart_changed', timestamp: at(3), payload: { operation: 'remove', productId: 'milk', productName: '<우유 & 음료>', quantity: 1, method: 'employee', staffStation: 'staff:1', playerPosition: { x: 800, y: 800 } } },
  ].map((e, sequence) => ({ ...e, sequence }));
  const trajectory = buildMarketTrajectory(events, { x: 0, y: 0 });
  expect(trajectory.distance).toBe(0);
  expect(trajectory.actions?.[0]).toMatchObject({ segment: 1, method: 'employee', stationId: 'staff:1' });
  const svg = trajectorySvg(createMarketSession().environment, trajectory);
  expect(svg).toContain('&lt;우유 &amp; 음료&gt;');
  expect(svg).not.toContain('<우유');
  expect(svg).toContain('행동 타임라인');
});

test('map clusters, timeline filters and playback select the correct action and exact moment', () => {
  jest.useFakeTimers();
  const session = applyMarketAction(shopping(), { type: 'giveUp', at: at(11) }), trajectory = exportMarketEpisode(session).trajectory;
  const view = render(<MarketRouteReview environment={session.environment} trajectory={trajectory} />);
  try {
    fireEvent.press(view.getByRole('button', { name: '이동 경로·시간 확인' }));
    expect(view.getByRole('button', { name: /경로 행동 1: .* 외 3건/ })).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: /행동 2: 00:05/ }));
    expect(view.getByTestId('market-route-action-detail')).toHaveTextContent(/2개 담기/);
    expect(view.getByTestId('market-route-action-detail')).toHaveTextContent(/00:05/);
    fireEvent.press(view.getByRole('button', { name: '행동 필터 내려놓기' }));
    expect(view.queryByRole('button', { name: /행동 2: 00:05/ })).toBeNull();
    fireEvent.press(view.getByRole('button', { name: /경로 행동 3:/ }));
    expect(view.getByTestId('market-route-action-detail')).toHaveTextContent(/1개 내려놓기/);
    fireEvent.press(view.getByRole('button', { name: '이동 경로 처음' }));
    expect(view.queryByTestId('market-route-action-detail')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: '이동 경로 다음' }));
    expect(view.getByText(/^3초 · x /)).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: '이동 경로 재생' }));
    act(() => { jest.advanceTimersByTime(500); });
    expect(view.getByText(/^4초 · x /)).toBeTruthy();
  } finally { view.unmount(); jest.clearAllTimers(); jest.useRealTimers(); }
});

test('old trajectories without actions still render their route and playback', () => {
  const session = applyMarketAction(shopping(), { type: 'giveUp', at: at(11) }), { actions: _actions, ...legacy } = exportMarketEpisode(session).trajectory;
  const view = render(<MarketRouteReview environment={session.environment} trajectory={legacy} />);
  fireEvent.press(view.getByRole('button', { name: '이동 경로·시간 확인' }));
  expect(view.getByTestId('market-route-map')).toBeTruthy();
  expect(view.getByText(/기록된 매대·상품·종업원 대화 행동이 없어요/)).toBeTruthy();
  view.unmount();
});

test('talking to staff records the character position, survives export and can be selected in the NPC filter', () => {
  let session = shopping();
  const station = `staff:${session.environment.employees[0].id}` as const;
  const position = session.environment.stations[station];
  session = applyMarketAction(session, { type: 'setPosition', point: position, at: at(10) });
  expect(session.lastActionError).toBeNull();
  session = applyMarketAction(session, { type: 'interact', station, at: at(11) });
  expect(session.lastActionError).toBeNull();
  session = applyMarketAction(session, { type: 'giveUp', at: at(12) });
  const trajectory = exportMarketEpisode(session).trajectory;
  const action = trajectory.actions?.find(a => a.kind === 'staff-talked');
  expect(action).toMatchObject({ ...position, stationId: station, elapsedSeconds: 10, positionSource: 'recorded' });
  expect(trajectorySvg(session.environment, trajectory)).toContain('종업원에게 말 걸기');
  const view = render(<MarketRouteReview environment={session.environment} trajectory={trajectory} />);
  fireEvent.press(view.getByRole('button', { name: '이동 경로·시간 확인' }));
  fireEvent.press(view.getByRole('button', { name: '행동 필터 종업원 대화' }));
  fireEvent.press(view.getByRole('button', { name: /^행동 5: .*종업원에게 말 걸기/ }));
  expect(view.getByTestId('market-route-action-detail')).toHaveTextContent(/종업원에게 말 걸기/);
  expect(view.getByText('입구')).toHaveStyle({ fontFamily: 'Pretendard-Bold', fontSize: 12 });
  view.unmount();
});
