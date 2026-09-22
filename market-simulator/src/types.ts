import type { createMarketAgentAdapter, MarketAgentAction, MarketSessionConfig, exportMarketEpisode } from '../../frontend/src/game/marketSession';
import type { BehaviorLogRequest } from '../../frontend/src/api/behaviorLog';

export type Observation = ReturnType<ReturnType<typeof createMarketAgentAdapter>['observe']>;
export type Episode = ReturnType<typeof exportMarketEpisode>;
export type Decision = { action: MarketAgentAction; delayMs: number; reason: string; exchange?: { request: unknown; response: unknown } };
export type TraceEntry = Decision & { observationHash: string; contextHash: string; source: 'stochastic' | 'llm' | 'limit' };
export type RunContext = {
  policyVersion: '1' | '2'; policySeed: string | number; mode: 'stochastic' | 'llm'; maxActions: number;
  timeBudgetMs?: number; maxCalls?: number;
};
export type Persona = {
  id: string; version: string; name: string; description: string; prompt: string;
  /** Fictional personal history and a stable subset of traits, never population estimates. */
  character?: {
    name: string; age: number; goal: string; selectedTraits: string[]; strengths: string[];
    preferences: string[]; familiarCategories: string[]; familiarProductIds: string[];
    practicedStrategies: string[];
  };
  parameters: {
    reactionMedianMs: number; reactionSigma: number; walkSpeed: number;
    recheckProbability: number; hesitationProbability: number; confusionProbability: number;
    quantitySlipProbability: number; helpProbability: number; explorationProbability: number;
    retryProbability: number; feedbackLearningRate: number; pricePreference: number;
    familiarityBias: number; itemPreferenceWeights: Record<string, number>;
  };
};
export type EpisodeOptions = {
  personaId: string; seed: string | number; environmentSeed?: string | number;
  difficulty?: 'family' | 'exact'; mode?: 'stochastic' | 'llm'; sessionId?: string; startedAt?: string;
  maxActions?: number; timeBudgetMs?: number; config?: Partial<MarketSessionConfig>;
  llm?: { baseUrl?: string; model?: string; apiKeyEnv?: string; maxCalls?: number; timeoutMs?: number };
  replayTrace?: TraceEntry[];
  /** Dependency injection for a local model or provider contract testing. Never serialized into workers. */
  decisionProvider?: (observation: Observation, history: TraceEntry[], persona: Persona) => Promise<Decision>;
};
export type EpisodeSummary = {
  personaId: string; seed: string | number; mode: string; outcome: string | null;
  actionCount: number; moveCount: number; pathDistance: number; maxMoveDistance: number;
  elapsedMs: number; decisionMeanMs: number; decisionP50Ms: number; decisionP90Ms: number;
  cartChecks: number; helpRequests: number; retries: number; rejectedActions: number;
  wrongSelections: number; selections: number; selectedItemCounts: Record<string, number>;
  actionFingerprint: string; termination: 'game' | 'action-limit' | 'time-budget' | 'model-call-limit';
};
export type GeneratedEpisode = { run: RunContext; episode: Episode; behaviorLogs: BehaviorLogRequest[]; trace: TraceEntry[]; summary: EpisodeSummary };
