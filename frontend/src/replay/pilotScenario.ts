import { buildMarketScenarioMission, type MarketMission } from '../game/scenarios';

/** Explicit control/baseline task for an isolated development replay, never a production fallback. */
export function pilotScenario(enabled: boolean, scenarioId?: string): MarketMission | null {
  if (!enabled || !scenarioId) return null;
  return buildMarketScenarioMission(scenarioId);
}
