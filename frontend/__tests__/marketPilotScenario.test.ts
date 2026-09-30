import { pilotScenario } from '../src/replay/pilotScenario';

test('fixed control mission is unavailable outside development replay', () => {
  expect(pilotScenario(false, 'S01')).toBeNull();
  expect(pilotScenario(true)).toBeNull();
});
test('explicit pilot scenario is deterministic; an invalid scenario is not silently substituted', () => {
  expect(pilotScenario(true, 'S01')).toEqual(pilotScenario(true, 'S01'));
  expect(pilotScenario(true, 'S01')?.scenarioId).toBe('S01');
  expect(() => pilotScenario(true, 'UNKNOWN')).toThrow();
});
