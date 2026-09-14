import type { MarketAction, MarketSessionConfig } from '../game/marketSession';

export const MARKET_AGENT_PROTOCOL_VERSION = 2;

export type MarketAgentAction = Exclude<MarketAction, { type: 'setPosition' }> | { type: 'continueBriefing' };

export type MarketAgentStartInput = {
  agentModel: string;
  personaId: string;
  personaVersion?: string;
  notes?: string;
  sessionId?: string;
  startedAt?: string;
  maxSteps?: number;
  config?: Partial<MarketSessionConfig>;
};

export type MarketAgentActionInput = {
  sessionId: string;
  actionId: string;
  expectedRevision: number;
  decisionSummary?: string;
  action: MarketAgentAction;
};

export type MarketAgentBrowserCommand =
  | { type: 'start'; requestId: string; input: MarketAgentStartInput }
  | { type: 'observe'; requestId: string; input: { sessionId: string } }
  | { type: 'action'; requestId: string; input: MarketAgentActionInput }
  | { type: 'export'; requestId: string; input: { sessionId: string } }
  | { type: 'stop'; requestId: string; input: { sessionId: string; reason?: string } };

export type MarketAgentBrowserEnvelope =
  | { type: 'browserReady'; protocolVersion: number; browserId: string; url: string | null; title: string | null; visibility: string | null; authenticated: boolean; view: 'login' | 'app' | 'game' }
  | { type: 'result'; requestId: string; payload: unknown }
  | { type: 'error'; requestId: string; error: { code: string; message: string; details?: unknown } };

export type MarketAgentController = {
  sessionId: string;
  observe: () => unknown;
  execute: (input: MarketAgentActionInput) => Promise<unknown>;
  exportEpisode: () => Promise<unknown>;
  stop: (reason?: string) => Promise<unknown>;
};

export function isMarketAgentBrowserCommand(value: unknown): value is MarketAgentBrowserCommand {
  if (!value || typeof value !== 'object') return false;
  const item = value as { type?: unknown; requestId?: unknown; input?: unknown };
  return ['start', 'observe', 'action', 'export', 'stop'].includes(String(item.type))
    && typeof item.requestId === 'string'
    && !!item.input && typeof item.input === 'object';
}
