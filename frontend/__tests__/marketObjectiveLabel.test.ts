import { marketObjectiveLabel } from '../src/game/marketObjectiveLabel';
import { buildMarketScenarioMission } from '../src/game/scenarios';

it('추천 문장에 규격이 빠져도 정확한 구매 목록은 카탈로그 규격을 표시한다', () => {
  expect(marketObjectiveLabel({ productId: 'milk', quantity: 1 })).toBe('흰 우유 900mL');
  expect(marketObjectiveLabel({ productId: 'water', quantity: 1 })).toBe('생수 500mL');
  expect(marketObjectiveLabel({ productId: 'banana', quantity: 1 })).toBe('바나나 1송이');
});

it('S02의 허용 품종을 단일 사과 규격으로 축소하지 않는다', () => {
  const objective = buildMarketScenarioMission('S02').objectives[0];
  expect(marketObjectiveLabel(objective)).toBe('사과');
  expect(objective.acceptedProductIds).toContain('apple-green');
});

it('포장 규격을 지우지 않고 별도 표시할 구매 수량만 중복 제거한다', () => {
  const milk = buildMarketScenarioMission('S01').objectives[0];
  expect(marketObjectiveLabel(milk)).toBe('흰 우유 900mL');
  expect(marketObjectiveLabel({productId:'eggs', quantity:1, label:'달걀 10개입 1팩'})).toBe('달걀 10개입');
});

it('표시용 이름이 없는 복수 허용 상품은 모두 표시하며 원본을 변경하지 않는다', () => {
  const objective = { productId: 'milk', quantity: 1, acceptedProductIds: ['milk', 'milk-small'] };
  expect(marketObjectiveLabel(objective)).toBe('흰 우유 900mL 또는 작은 흰 우유 200mL');
  expect(objective.acceptedProductIds).toEqual(['milk', 'milk-small']);
});

it('AI의 1품목 집중 과제와 비교 안내를 실행 중 두 품목 과제로 바꾸지 않는다', () => {
  const { resolveMarketAiMission } = require('../src/game/scenarios');
  const base = buildMarketScenarioMission('S01');
  const mission = { ...base, scenarioId: 'CUSTOM', budget: 3000,
    objectives: [base.objectives[0]],
    briefing: ['우유의 숫자를 보고 900mL를 골라요.'],
    checkoutDialogue: ['200mL를 담았다면 빼고 900mL로 바꿔요.'],
  };
  const resolved = resolveMarketAiMission(mission);
  expect(resolved.objectives).toHaveLength(1);
  expect(resolved.briefing).toEqual(mission.briefing);
  expect(resolved.checkoutDialogue).toEqual(mission.checkoutDialogue);
  expect(marketObjectiveLabel(resolved.objectives[0])).toBe('흰 우유 900mL');
});
