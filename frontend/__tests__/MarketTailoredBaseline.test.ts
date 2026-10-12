import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pilotScenario, isPilotBaselineScenario } from '../src/replay/pilotScenario';
import { pilotEnvironment, pilotSessionConfig, TAILORED_SHARED_ENVIRONMENT_ID } from '../src/replay/pilotEnvironment';
import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { createMissionSession } from '../src/game/marketMissionSession';
import { evaluateMarketCart } from '../src/game/scenarios';

const ids = ['TAILORED_MINJAE_BASELINE_V1', 'TAILORED_SEOYEON_BASELINE_V1', 'TAILORED_MINSU_BASELINE_V1'];
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function build(id: string) {
  const mission = pilotScenario(true, id)!;
  const environment = createMarketEnvironment(pilotEnvironment(true, TAILORED_SHARED_ENVIRONMENT_ID)!);
  const session = createMissionSession({ seed: environment.seed, ...pilotSessionConfig(true, TAILORED_SHARED_ENVIRONMENT_ID) }, mission, environment);
  return { mission, environment, session };
}

test.each(ids)('tailored task %s is achievable, contains real visible contrasts and repeats the same entire condition', id => {
  const pre = build(id); const post = build(id);
  expect(digest(pre)).toBe(digest(post));
  expect(pre.mission.scenarioId).toBe('CUSTOM');
  expect(pre.mission.timeLimitSeconds).toBe(600);
  expect(isPilotBaselineScenario(id)).toBe(true);
  expect(pilotScenario(false, id)).toBeNull();
  expect(pre.environment.config.shelfOrder).toEqual(['drink', 'meal', 'household', 'fresh', 'produce']);
  const visible = Object.values(pre.session.shelfSlots).flat();
  expect(new Set(visible).size).toBe(60);
  for (const goal of pre.mission.objectives) {
    expect(visible).toContain(goal.productId);
    expect(pre.session.initialStock[goal.productId]).toBeGreaterThanOrEqual(goal.quantity);
    expect(goal.acceptedProductIds).toBeUndefined();
  }
  const cart = Object.fromEntries(pre.mission.objectives.map(x => [x.productId, x.quantity]));
  expect(evaluateMarketCart(cart, pre.mission).success).toBe(true);
  expect(evaluateMarketCart({}, pre.mission).success).toBe(false);
  if (id.includes('MINJAE')) expect(visible).toEqual(expect.arrayContaining(['milk-small', 'banana-single', 'instant-rice-single', 'water-large']));
  if (id.includes('SEOYEON')) expect(visible).toEqual(expect.arrayContaining(['premium-eggs', 'dumpling', 'juice']));
  if (id.includes('MINSU')) expect(visible).toEqual(expect.arrayContaining(['curry-spicy', 'apple-green', 'premium-eggs']));
  const modified = pilotScenario(true, id)!; modified.objectives[0].quantity = 1; modified.briefing.push('modified');
  expect(digest(build(id))).toBe(digest(post));
});

test('personas share the environment and research learning instructions while their authored goals differ', () => {
  const cases = ids.map(build);
  expect(new Set(cases.map(x => digest(x.mission.objectives))).size).toBe(3);
  expect(new Set(cases.map(x => digest(x.environment))).size).toBe(1);
  const personas = ['minjae', 'seoyeon', 'minsu'].map(name => JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../market-simulator/personas/research-learning-' + name + '-v2.json'), 'utf8')));
  expect(new Set(personas.map(x => digest(x.learningInstructions))).size).toBe(1);
  expect(new Set(personas.map(x => digest(x.researchSourceIds))).size).toBe(1);
});
