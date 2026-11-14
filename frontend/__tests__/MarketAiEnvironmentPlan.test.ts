import { createMarketEnvironment, getMarketLayoutSlots, MARKET_LAYOUT_OPTIONS } from '../src/game/marketEnvironment';
import { applyMarketEnvironmentPlan, getMarketEnvironmentContext, resolveMarketEnvironmentPlan } from '../src/game/marketEnvironmentPlan';
import { createMissionSession } from '../src/game/marketMissionSession';
import { createMarketScene } from '../src/game/marketScene';
import { buildMarketScenarioMission, resolveMarketAiMission } from '../src/game/scenarios';

const plan = { shelfOrder: ['drink', 'meal', 'fresh', 'produce', 'household'] as const, rationale: '매대 안내판을 확인하고 목록의 분류를 찾아가요.' };

it('예전 저장 퀘스트의 미제공·null 배치 계획은 호환하지만 새 추천은 계획을 요구한다', () => {
  const legacy = buildMarketScenarioMission('S01');
  expect(resolveMarketAiMission(legacy).environmentPlan).toBeUndefined();
  expect(resolveMarketEnvironmentPlan(null)).toBeUndefined();
  expect(() => resolveMarketEnvironmentPlan(undefined, true)).toThrow('빠져');
  expect(() => resolveMarketEnvironmentPlan(null, true)).toThrow('빠져');
  expect(resolveMarketAiMission({ ...legacy, environmentPlan: plan }).environmentPlan).toEqual(plan);
});

it.each([
  { shelfOrder: ['fresh', 'produce', 'meal', 'drink'], rationale: '이전 네 분류' },
  { shelfOrder: ['fresh', 'produce', 'meal', 'drink', 'drink'], rationale: '중복' },
  { shelfOrder: ['fresh', 'produce', 'meal', 'drink', 'unknown'], rationale: '없는 분류' },
  { ...plan, rationale: ' ' }, { ...plan, rationale: '가'.repeat(161) },
  { ...plan, layoutId: 'aisles' }, { ...plan, spawn: { x: 0, y: 0 } },
])('손상되거나 안전 범위를 벗어난 AI 배치를 조용히 고치지 않는다: %j', value => {
  expect(() => resolveMarketEnvironmentPlan(value)).toThrow('AI 진열대 추천');
});

it.each(MARKET_LAYOUT_OPTIONS)('$id 현재 배치 컨텍스트는 실제 안전 슬롯 순서와 분류·좌표를 기록한다', ({ id }) => {
  const environment = createMarketEnvironment({ seed: 'observed-' + id, layoutId: id, shelfOrder: 'random' });
  const context = getMarketEnvironmentContext(environment);
  expect(context.layoutId).toBe(id);
  expect(context.preserveShelfOrder).toBe(false);
  expect(getMarketEnvironmentContext(environment, true)).toEqual({ ...context, preserveShelfOrder: true });
  expect(context.shelfSlots.map(slot => slot.slotId)).toEqual(getMarketLayoutSlots(id).shelves.map(slot => slot.slotId));
  for (const slot of context.shelfSlots) expect(slot).toMatchObject({
    x: environment.shelves[slot.categoryId].x, y: environment.shelves[slot.categoryId].y,
    orientation: environment.shelves[slot.categoryId].orientation,
  });
  expect(context.world).toEqual(environment.world); expect(context.spawn).toEqual(environment.spawn);
  expect(context).not.toHaveProperty('seed');
});

it.each(MARKET_LAYOUT_OPTIONS)('$id 추천은 현재 다섯 매대의 분류만 바꾸고 충돌·인물·시작 지점을 보존한다', ({ id }) => {
  const original = createMarketEnvironment({ seed: 'map-' + id, layoutId: id, shelfOrder: 'random', entranceConstruction: true });
  const before = JSON.parse(JSON.stringify(original));
  const applied = applyMarketEnvironmentPlan(original, plan);
  expect(original).toEqual(before);
  expect(getMarketEnvironmentContext(applied).shelfSlots.map(slot => slot.categoryId)).toEqual(plan.shelfOrder);
  for (const key of ['seed', 'objects', 'obstacles', 'employees', 'customers', 'checkouts', 'kiosks', 'spawn', 'exit', 'walls', 'constructionZones'] as const) {
    expect(applied[key]).toEqual(original[key]);
  }
  for (const categoryId of plan.shelfOrder) {
    expect(applied.stations[categoryId]).toEqual(applied.shelves[categoryId].point);
    expect(applied.stationDetails.find(station => station.id === categoryId)?.point).toEqual(applied.shelves[categoryId].point);
  }
  const mission = { ...buildMarketScenarioMission('S01'), environmentPlan: plan };
  const session = createMissionSession({ seed: applied.seed }, mission, applied);
  expect(session.environment).toEqual(applied); expect(session.playerPosition).toEqual(applied.spawn);
  expect(Object.values(session.shelfSlots).every(slots => slots.length === 12)).toBe(true);
  for (const target of mission.objectives) {
    expect(Object.values(session.shelfSlots).flat()).toContain(target.productId);
    expect(session.initialStock[target.productId]).toBeGreaterThanOrEqual(target.quantity);
  }
});

it('새 독립 미션에도 추천을 적용하고 직접 설정한 분류 순서는 우선한다', () => {
  const mission = { ...buildMarketScenarioMission('S01'), environmentPlan: plan };
  const recommended = createMissionSession({ seed: 'mission-plan', environment: { layoutId: 'corner' } }, mission);
  expect(recommended.environment.config.layoutId).toBe('corner');
  expect(recommended.environment.config.shelfOrder).toEqual(plan.shelfOrder);
  const manual = ['produce', 'fresh', 'household', 'meal', 'drink'] as const;
  const overridden = createMissionSession({ seed: 'mission-plan', environment: { layoutId: 'corner', shelfOrder: manual } }, mission);
  expect(overridden.environment.config.shelfOrder).toEqual(manual);
  const imported = createMarketEnvironment({ seed: 'mission-plan', shelfOrder: manual });
  expect(createMissionSession({ seed: imported.seed }, mission, imported).environment).toEqual(imported);
});

it('추천을 가진 미리보기의 seed·시작 지점·실제 기하를 같은 배치로 보존한다', () => {
  const mission = { ...buildMarketScenarioMission('S01'), environmentPlan: plan };
  const scene = createMarketScene(mission, 7);
  const environment = JSON.parse(scene.startingConditions.geometry);
  expect(environment.seed).toBe('7');
  expect(scene.startingConditions.player).toEqual(environment.spawn);
  expect(getMarketEnvironmentContext(environment).shelfSlots.map(slot => slot.categoryId)).toEqual(plan.shelfOrder);
  expect(scene.mission.environmentPlan).toEqual(plan);
});
