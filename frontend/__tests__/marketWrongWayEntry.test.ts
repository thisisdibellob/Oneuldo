import { createMarketEnvironment, crossesMarketGate, getMarketWrongWayGate, getMarketWrongWayRearm, MARKET_LAYOUT_OPTIONS, type MarketAlarmGate, type MarketEnvironment } from '../src/game/marketEnvironment';
import { applyMarketAction, createMarketSession, exportMarketEpisode, getMarketObservation, parseMarketSessionConfig, type MarketSession } from '../src/game/marketSession';
import { getMarketNavigationPath, isMarketNavigationSegmentClear } from '../src/game/marketNavigation';
import type { Point } from '../src/game/prototypeWorld';

const cases = MARKET_LAYOUT_OPTIONS.flatMap(layout => [false, true].map(entranceConstruction => ({ ...layout, entranceConstruction })));
function make(layoutId: typeof MARKET_LAYOUT_OPTIONS[number]['id'], entranceConstruction: boolean, wrongWayPenaltyPoints = 10) {
  return createMarketSession({ seed: 'entry-direction-check', wrongWayPenaltyPoints, alarmPenaltyPoints: 7,
    learning: { stockoutEnabled: false, budgetChoiceEnabled: false },
    environment: { layoutId, entranceConstruction, kioskLane: 'none', employeeCount: 1, employeeSlotIds: ['staff-southwest'],
      customerCount: 1, customerSlotIds: ['customer-west'], pillarCount: 0, cashierCount: 0 } });
}
function sides(env: MarketEnvironment, gate: MarketAlarmGate) {
  const other = gate.axis === 'x' ? 'y' : 'x';
  const fraction = gate.axis === 'x' ? (env.config.layoutId === 'corner' ? 0.75 : 0.4)
    : env.config.layoutId === 'corner' && gate.id === 'exit' ? 0.85 : 0.5;
  const center = gate.gate[other] + (gate.axis === 'x' ? gate.gate.height : gate.gate.width) * fraction;
  return { inside: { [gate.axis]: gate.boundary - gate.outward * 64, [other]: center } as Point,
    outside: { [gate.axis]: gate.boundary + gate.outward * 64, [other]: center } as Point };
}
function walk(game: MarketSession, point: Point) {
  const from = game.playerPosition; const steps = Math.max(1, Math.ceil(Math.hypot(point.x - from.x, point.y - from.y) / 8));
  for (let index = 0; index < steps; index++) {
    game = applyMarketAction(game, { type: 'move', dx: (point.x - from.x) / steps, dy: (point.y - from.y) / steps });
    expect(game.lastActionError).toBeNull();
  }
  return game;
}

it.each(cases)('$label 공사=$entranceConstruction: 빈 장바구니·미결제·결제 완료와 관계없이 출구 역진입만 감점한다', ({ id, entranceConstruction }) => {
  for (const state of ['empty', 'unpaid', 'paid'] as const) {
    let game = make(id, entranceConstruction);
    const gate = game.environment.alarmGates.find(item => item.id === 'exit')!;
    const { inside, outside } = sides(game.environment, gate);
    game = { ...game, playerPosition: outside, cart: state === 'empty' ? {} : { apple: 1 }, paid: state === 'paid' };
    game = walk(game, inside);
    expect(game).toMatchObject({ score: 90, penaltyPoints: 10, wrongWayEntryCount: 1, wrongWayEntryArmed: false, alarmCount: 0 });
    expect(game.events.find(event => event.type === 'wrong_way_entry')?.payload).toMatchObject({
      gateId: 'exit', delta: -10, configuredPenalty: 10, message: entranceConstruction ? '안쪽 입구를 이용해 주세요.' : '입구를 이용해 주세요.',
    });
    expect(game.events.some(event => event.type === 'entrance_alarm')).toBe(false);
  }
});

it.each(cases)('$label 공사=$entranceConstruction: 정상 입구와 양쪽 축의 안쪽 입구는 무감점이다', ({ id, entranceConstruction }) => {
  const initial = make(id, entranceConstruction);
  for (const gate of initial.environment.alarmGates.filter(item => item.id !== 'exit' && !(entranceConstruction && item.id === 'entrance'))) {
    const { inside, outside } = sides(initial.environment, gate);
    const game = walk({ ...initial, playerPosition: outside }, inside);
    expect(game).toMatchObject({ score: 100, penaltyPoints: 0, wrongWayEntryCount: 0, alarmCount: 0 });
  }
});

it('문턱 근처 왕복은 한 번만 기록하고 공용 복도로 충분히 나왔다가 들어올 때 재무장한다', () => {
  let game = make('classic', false, 13); const gate = game.environment.alarmGates.find(item => item.id === 'exit')!;
  const { inside, outside } = sides(game.environment, gate);
  game = walk({ ...game, playerPosition: outside }, inside);
  const innerEdge = { x: inside.x, y: gate.boundary - 8 }, outerEdge = { x: inside.x, y: gate.boundary + 8 };
  game = walk(game, innerEdge);
  for (let index = 0; index < 8; index++) { game = walk(game, outerEdge); game = walk(game, innerEdge); }
  expect(game).toMatchObject({ score: 87, wrongWayEntryCount: 1, alarmCount: 0 });
  game = walk(game, outside);
  expect(game.wrongWayEntryArmed).toBe(true);
  game = walk(game, inside);
  expect(getMarketObservation(game)).toMatchObject({ score: 74, penaltyPoints: 26, wrongWayEntryCount: 2 });
  const ended = applyMarketAction(game, { type: 'giveUp' });
  expect(exportMarketEpisode(ended)).toMatchObject({ score: 74, penaltyPoints: 26, wrongWayEntryCount: 2, alarmCount: 0 });
});

it.each([0, 65])('독립 감점 %s는 0점 아래로 떨어뜨리지 않고 실제 차감량을 기록한다', wrongWayPenaltyPoints => {
  let game = make('classic', false, wrongWayPenaltyPoints); const gate = game.environment.alarmGates.find(item => item.id === 'exit')!;
  const { inside, outside } = sides(game.environment, gate);
  game.playerPosition = outside;
  for (let index = 0; index < 3; index++) { game = walk(game, inside); game = walk(game, outside); }
  expect(game.score).toBe(wrongWayPenaltyPoints ? 0 : 100);
  expect(game.wrongWayEntryCount).toBe(3);
  expect(game.alarmCount).toBe(0);
  expect(game.events.filter(event => event.type === 'wrong_way_entry').map(event => event.payload.delta))
    .toEqual(wrongWayPenaltyPoints ? [-65, -35, 0] : [0, 0, 0]);
});

it('출구 역진입과 미결제 반출은 서로 다른 사건으로 누적된다', () => {
  let game = make('classic', false); const gate = game.environment.alarmGates.find(item => item.id === 'exit')!;
  const { inside, outside } = sides(game.environment, gate);
  game = walk({ ...game, playerPosition: inside, cart: { apple: 1 } }, outside);
  expect(game).toMatchObject({ alarmCount: 1, wrongWayEntryCount: 0, score: 93 });
  game = walk(game, inside);
  expect(game).toMatchObject({ alarmCount: 1, wrongWayEntryCount: 1, score: 83, penaltyPoints: 17 });
});

it('방향 교차는 가로·세로 및 양쪽 outward 방향 모두에서 문 폭 안에서만 검출한다', () => {
  for (const axis of ['x', 'y'] as const) for (const outward of [-1, 1] as const) {
    const gate: MarketAlarmGate = { id: 'exit', axis, outward, boundary: 200, rearm: 200 - outward * 60,
      gate: axis === 'x' ? { x: 180, y: 50, width: 40, height: 100 } : { x: 50, y: 180, width: 100, height: 40 } };
    const other = axis === 'x' ? 'y' : 'x';
    const outside = { [axis]: 200 + outward * 30, [other]: 100 } as Point;
    const inside = { [axis]: 200 - outward * 30, [other]: 100 } as Point;
    expect(crossesMarketGate(gate, outside, inside, 'inward')).toBe(true);
    expect(crossesMarketGate(gate, inside, outside, 'inward')).toBe(false);
    expect(crossesMarketGate(gate, { ...outside, [other]: 151 }, { ...inside, [other]: 151 }, 'inward')).toBe(false);
    expect(getMarketWrongWayRearm(gate)).toBe(200 + outward * 60);
  }
});

it.each(cases)('$label 공사=$entranceConstruction: 자동 이동은 출구 역진입을 피하고 안쪽 입구로 정상 진입한다', ({ id, entranceConstruction }) => {
  let game = make(id, entranceConstruction); const env = game.environment;
  const gate = env.alarmGates.find(item => item.id === 'exit')!;
  const { inside, outside } = sides(env, gate);
  expect(isMarketNavigationSegmentClear(env, outside, inside)).toBe(true);
  const path = getMarketNavigationPath(env, outside, inside)!;
  expect(path).not.toBeNull(); expect(path.length).toBeGreaterThan(1);
  game.playerPosition = outside;
  for (const point of path) {
    expect(getMarketWrongWayGate(env, game.playerPosition, point)).toBeNull();
    game = walk(game, point);
  }
  expect(game).toMatchObject({ score: 100, wrongWayEntryCount: 0, alarmCount: 0 });
  if (entranceConstruction) expect(env.constructionZones[0].detourGateIds).toEqual([id === 'corner' ? 'east-door' : 'west-door']);
});

it('예전 JSON은 역진입 기본값을 받고 독립 점수 설정을 검증한다', () => {
  expect(parseMarketSessionConfig('{"seed":42}').wrongWayPenaltyPoints).toBe(10);
  expect(parseMarketSessionConfig('{"wrongWayPenaltyPoints":3,"alarmPenaltyPoints":17}')).toMatchObject({ wrongWayPenaltyPoints: 3, alarmPenaltyPoints: 17 });
  for (const wrongWayPenaltyPoints of [-1, 101, 0.5, '10', null]) expect(() => parseMarketSessionConfig(JSON.stringify({ wrongWayPenaltyPoints }))).toThrow('출구 역진입 감점');
});
