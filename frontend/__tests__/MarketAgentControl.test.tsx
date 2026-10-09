import { act, render, waitFor } from '@testing-library/react-native';

import type { MarketAgentController } from '../src/agent/marketAgentProtocol';
import { MarketSimulationScreen } from '../src/screens/MarketSimulationScreen';

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  },
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));
jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

test('browser agent controller uses the visible briefing and bounded shared action path', async () => {
  let controller: MarketAgentController | null = null;
  const screen = render(<MarketSimulationScreen
    agentControl={{
      maxSteps: 20,
      onReady: next => { controller = next; },
      provenance: { agentModel: 'test-model', personaId: 'test-persona', personaVersion: '1' },
      sessionId: 'browser-agent-session',
    }}
    initialConfig={{
      sessionId: 'browser-agent-session', seed: 'browser-agent-control',
      provenance: { source: 'synthetic', agentModel: 'test-model', personaId: 'test-persona', personaVersion: '1' },
    }}
    onExit={jest.fn()}
  />);
  try {
    await waitFor(() => expect(controller).not.toBeNull());
    const initial = controller!.observe() as any;
    expect(initial.observation.screen.visiblePanel.type).toBe('briefing');
    await act(async () => { await controller!.execute({ sessionId: 'browser-agent-session', actionId: 'brief-1', expectedRevision: 0, action: { type: 'continueBriefing' } }); });
    await act(async () => { await controller!.execute({ sessionId: 'browser-agent-session', actionId: 'brief-2', expectedRevision: 1, action: { type: 'continueBriefing' } }); });
    const beforeMove = controller!.observe() as any;
    const y = beforeMove.observation.screen.player.position.y;
    let moved: any;
    await act(async () => { moved = await controller!.execute({
        sessionId: 'browser-agent-session', actionId: 'move-1', expectedRevision: 2,
        action: { type: 'move', dx: 0, dy: -12 },
      });
    });
    expect(moved.accepted).toBe(true);
    expect(moved.observation.screen.player.position.y).toBe(y - 12);
    await expect(controller!.execute({ sessionId: 'browser-agent-session', actionId: 'stale', expectedRevision: 2, action: { type: 'move', dx: 1, dy: 0 } }))
      .rejects.toMatchObject({ code: 'STALE_REVISION' });
    let stopped: any;
    await act(async () => { stopped = await controller!.stop('test stopped'); });
    expect(stopped).toMatchObject({ sessionId: 'browser-agent-session', stopped: true, outcome: 'gave-up' });
    expect((controller!.observe() as any).observation.screen.phase).toBe('finished');
  } finally {
    screen.unmount();
  }
});
