import {
  applyMarketAction,
  createMarketSession,
  exportMarketEpisode,
  getMarketObservation,
} from '../src/game/marketSession';
import {
  marketIncidentPlan,
  normalizeMarketTraining,
} from '../src/game/marketTraining';
import {
  buildMarketTrajectory,
  marketRoutePauseMarkers,
} from '../src/game/marketTrajectory';

const at = (seconds: number) =>
  new Date(Date.parse('2026-11-15T00:00:00Z') + seconds * 1000).toISOString();
const game = () =>
  createMarketSession({
    seed: 'training-verification',
    startedAt: at(0),
    objectives: [{ productId: 'milk', quantity: 1 }],
    training: { task: 'shelf-finder', incidents: 'both' },
    learning: { stockoutEnabled: false, budgetChoiceEnabled: false },
    environment: { employeeCount: 1, cashierCount: 2, kioskLane: 'none' },
  });

test('old settings keep hints and incidents off; invalid training conditions are rejected', () => {
  expect(normalizeMarketTraining()).toEqual({
    task: 'shopping',
    mapHint: false,
    directionHint: false,
    incidents: 'none',
    routeIntervalSeconds: 5,
  });
  for (const value of [
    { mapHint: 'yes' },
    { routeIntervalSeconds: 0 },
    { task: 'pretend' },
    { unknown: true },
  ])
    expect(() => normalizeMarketTraining(value as never)).toThrow();
  expect(createMarketSession().config.training).toEqual(
    normalizeMarketTraining()
  );
});
test('incidents are seeded, wait until their due time, and only fire once', () => {
  let session = applyMarketAction(game(), {
    type: 'startTraining',
    at: at(10),
  });
  const plan = marketIncidentPlan(session.environment, session.config.training);
  expect(plan).toEqual(
    marketIncidentPlan(session.environment, session.config.training)
  );
  expect(plan.map((i) => i.kind)).toEqual(['crowd', 'sound-light']);
  session = applyMarketAction(session, { type: 'trainingTick', at: at(27) });
  expect(
    session.events.filter((e) => e.type === 'incident_started')
  ).toHaveLength(0);
  session = applyMarketAction(session, { type: 'trainingTick', at: at(28) });
  expect(
    session.events.filter((e) => e.type === 'incident_started')
  ).toHaveLength(1);
  session = applyMarketAction(session, { type: 'trainingTick', at: at(51) });
  session = applyMarketAction(session, { type: 'trainingTick', at: at(52) });
  expect(
    session.events.filter((e) => e.type === 'incident_started')
  ).toHaveLength(2);
  expect(getMarketObservation(session).visibleIncidents).toEqual([
    expect.objectContaining({ kind: 'sound-light', actualElapsedSeconds: 41 }),
  ]);
  expect(getMarketObservation(session)).not.toHaveProperty('trajectory');
});
test('shelf finding cannot finish remotely; inspecting required shelves finishes without payment', () => {
  let session = game();
  expect(
    applyMarketAction(session, { type: 'finishShelfTask' }).lastActionError
  ).toMatch(/모두/);
  session = applyMarketAction(session, {
    type: 'setPosition',
    point: session.environment.stations.fresh,
    at: at(3),
  });
  session = applyMarketAction(session, {
    type: 'interact',
    station: 'fresh',
    at: at(4),
  });
  expect(
    applyMarketAction(session, { type: 'finishShelfTask' }).lastActionError
  ).toBeTruthy();
  session = applyMarketAction(session, { type: 'closeStation', at: at(6) });
  session = applyMarketAction(session, { type: 'finishShelfTask', at: at(8) });
  expect(session).toMatchObject({
    phase: 'finished',
    outcome: 'success',
    paid: false,
    cart: {},
  });
  expect(exportMarketEpisode(session).trajectory.durationSeconds).toBe(8);
});
test('persona exports use actual accepted movement and exclude rating wait from elapsed time', () => {
  let session = createMarketSession({
    seed: 'route-agent',
    startedAt: at(0),
    provenance: {
      source: 'synthetic',
      agentModel: 'fixture-model',
      personaId: 'fixture-persona',
    },
  });
  session = applyMarketAction(session, { type: 'startTraining', at: at(20) });
  const spawn = session.playerPosition;
  session = applyMarketAction(session, {
    type: 'move',
    dx: 0,
    dy: -12,
    at: at(22),
  });
  session = applyMarketAction(session, {
    type: 'move',
    dx: 100,
    dy: 0,
    at: at(23),
  });
  session = applyMarketAction(session, { type: 'giveUp', at: at(27) });
  session = applyMarketAction(session, { type: 'skipRating', at: at(99) });
  const episode = exportMarketEpisode(session);
  expect(episode.trajectory).toMatchObject({
    durationSeconds: 7,
    distance: 12,
    intervalSeconds: 5,
  });
  expect(episode.trajectory.points.at(-1)).toMatchObject({
    x: spawn.x,
    y: spawn.y - 12,
  });
  expect(episode.trajectory.markers.map((p) => p.elapsedSeconds)).toEqual([
    0, 5, 7,
  ]);
  expect(episode.syntheticDataIsNotClinicalEvidence).toBe(true);
});
test('time markers interpolate accepted samples, split teleports, and do not mistake round trips for pauses', () => {
  const events = [
    {
      type: 'training_started',
      timestamp: at(0),
      payload: { point: { x: 0, y: 0 } },
    },
    {
      type: 'player_moved',
      timestamp: at(2),
      payload: { point: { x: 20, y: 0 } },
    },
    {
      type: 'player_moved',
      timestamp: at(5),
      payload: { point: { x: 0, y: 0 } },
    },
    {
      type: 'player_moved',
      timestamp: at(10),
      payload: { point: { x: 0, y: 0 } },
    },
    {
      type: 'layout_changed',
      timestamp: at(11),
      payload: { playerPosition: { x: 1000, y: 1000 } },
    },
    { type: 'session_finished', timestamp: at(13), payload: {} },
  ].map((e, sequence) => ({ ...e, sequence }));
  const trajectory = buildMarketTrajectory(events, { x: 9, y: 9 }, 5);
  expect(trajectory.distance).toBe(40);
  expect(trajectory.markers.map((p) => [p.x, p.segment])).toEqual([
    [0, 0],
    [0, 0],
    [0, 0],
    [1000, 1],
  ]);
  expect(
    marketRoutePauseMarkers(trajectory).map((p) => p.elapsedSeconds)
  ).toEqual([10]);
  expect(buildMarketTrajectory(events, { x: 0, y: 0 }, 1).markers[1].x).toBe(
    10
  );
  expect(() => buildMarketTrajectory([], { x: 0, y: 0 }, 0)).toThrow();
});

test('analysis waiting does not extend the completed trajectory or trigger later incidents', () => {
  let session = applyMarketAction(game(), { type: 'startTraining', at: at(5) });
  session = applyMarketAction(session, {
    type: 'move',
    dx: 0,
    dy: -12,
    at: at(6),
  });
  session = applyMarketAction(session, { type: 'endTraining', at: at(8) });
  session = applyMarketAction(session, { type: 'trainingTick', at: at(100) });
  session = applyMarketAction(session, { type: 'giveUp', at: at(101) });
  expect(exportMarketEpisode(session).trajectory.durationSeconds).toBe(3);
  expect(session.events.some((e) => e.type === 'incident_started')).toBe(false);
});
