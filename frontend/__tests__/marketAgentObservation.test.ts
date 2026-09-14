import { buildMarketAgentObservation, type MarketAgentUiState } from '../src/game/marketAgentObservation';
import { applyMarketAction, createMarketSession } from '../src/game/marketSession';

const ui = (briefing = false): MarketAgentUiState => ({
  briefing, briefingStep: 0, briefingText: briefing ? '목록을 확인하세요.' : null,
  cartOpen: false, helpOpen: false, staffMessage: false, staffReturnHelp: false,
  staffResponse: '', settingsOpen: false, historyOpen: false, reviewMessage: null,
});

test('agent observation describes the visible briefing before exposing game actions', () => {
  const session = createMarketSession({
    sessionId: 'agent-session', seed: 'agent-observation',
    provenance: { source: 'synthetic', agentModel: 'test-model', personaId: 'test-persona' },
  });
  const observation = buildMarketAgentObservation(session, 0, 0, 2000, ui(true));
  expect(observation.screen.visiblePanel.type).toBe('briefing');
  expect(observation.screen.mission.instruction).toBe('목록을 확인하세요.');
  expect(observation.availableActions).toEqual([{ type: 'continueBriefing' }]);
});

test('agent observation follows the actual bounded game state without exposing unopened shelf products', () => {
  const initial = createMarketSession({
    sessionId: 'agent-session', seed: 'agent-observation',
    provenance: { source: 'synthetic', agentModel: 'test-model', personaId: 'test-persona' },
  });
  const moved = applyMarketAction(initial, { type: 'move', dx: 0, dy: -12 });
  const observation = buildMarketAgentObservation(moved, 1, 1, 2000, ui());
  expect(observation.screen.player.position.y).toBe(initial.playerPosition.y - 12);
  expect(observation.screen.visiblePanel.products).toEqual([]);
  expect(observation.availableActions.some(action => action.type === 'move')).toBe(true);
});
