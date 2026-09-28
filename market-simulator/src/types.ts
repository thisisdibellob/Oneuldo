import type { createMarketAgentAdapter, MarketAgentAction } from '../../frontend/src/game/marketSession';
import type { MarketEnvironmentStationId } from '../../frontend/src/game/marketEnvironment';
import type { MarketReplaySnapshot, MarketReplayTrace } from '../../frontend/src/game/marketReplayTrace';

export type Observation = ReturnType<ReturnType<typeof createMarketAgentAdapter>['observe']>;
/** Policy intent; primitive movement exists only inside offline guard validation. */
export type PolicyAction = Exclude<MarketAgentAction, { type: 'move' }> | { type: 'walkTo'; station: MarketEnvironmentStationId }
  | { type: 'walkToAnchor'; anchorId: string }
  | { type: 'readList'; durationMs: number }
  | { type: 'pause'; durationMs: number }
  | { type: 'lookAround'; durationMs: number }
  | { type: 'browse'; durationMs: number; scrollFraction: number };
export type Decision = { action: PolicyAction; delayMs: number; reason: string; attentionTag?: string; cueRefs?: string[];
  exchange?: { request: unknown; response: unknown } };
export type PrimitiveDecision = { action: MarketAgentAction; delayMs: number; reason: string };
export type TraceEntry = Decision;
export type Persona = {
  id: string; version: string; name: string; description: string; prompt: string;
  /** Fictional personal history and a stable subset of traits, never population estimates. */
  character?: {
    name: string; age: number; goal: string; selectedTraits: string[]; strengths: string[];
    preferences: string[]; familiarCategories: string[]; familiarProductIds: string[];
    practicedStrategies: string[];
  };
  attention?: AttentionProfile;
  /** Stable shopping habits; probabilities are synthetic design settings, not population estimates. */
  shoppingStyle?: ShoppingStyle;
  parameters: {
    reactionMedianMs: number; reactionSigma: number; walkSpeed: number;
    recheckProbability: number; hesitationProbability: number; confusionProbability: number;
    quantitySlipProbability: number; helpProbability: number; explorationProbability: number;
    retryProbability: number; feedbackLearningRate: number; pricePreference: number;
    familiarityBias: number; itemPreferenceWeights: Record<string, number>;
  };
};

export type ShoppingStyle = {
  comparisonProbability: number; maxComparisonPages: number;
  listCheckAfterSelectionProbability: number; preCheckoutCheckProbability: number;
  familiarShortcutProbability: number; headingPersistence: number;
};

export type ActorDirection = 'north' | 'northeast' | 'east' | 'southeast' | 'south' | 'southwest' | 'west' | 'northwest';
export type ActorDistanceBand = 'near' | 'medium' | 'far';
export type ActorStation = { id: MarketEnvironmentStationId; kind: string; label: string;
  direction: ActorDirection; distanceBand: ActorDistanceBand; near: boolean };
export type ActorAnchor = { id: string; label: string; direction: ActorDirection; distanceBand: ActorDistanceBand };
export type ActorObjective = { id: string; label: string; quantity: number; match: 'exact' | 'family' };
export type ActorProduct = { id: string; categoryId: string; name: string; detail?: string; price: number; stock: number };
/** Actor projection, deliberately not assignable to the raw game observation. No coordinates, global map or automatic goal copy. */
export type ActorObservation = {
  schemaVersion: 'attention-observation-v1';
  sequence?: number; elapsedMs?: number;
  phase: Observation['phase']; view: Observation['view']; activeStation: MarketEnvironmentStationId | null;
  visibleStations: ActorStation[]; anchors: ActorAnchor[]; products: ActorProduct[];
  shelf: { page: number; pageCount: number; scrollFraction: number; pageFractions?: number[] } | null;
  listAvailable: boolean;
  /** Present for one observation after an accepted readList, never prefilled at entry. */
  readObjectives?: ActorObjective[];
  cart: Record<string, number> | null;
  cashiers: Partial<Record<string, boolean>>;
  lastActionError?: string | null;
  result?: { accepted: boolean; actionType: PolicyAction['type']; productId?: string; quantity?: number;
    stationId?: MarketEnvironmentStationId; anchorId?: string; message?: string };
};
export type AttentionProfile = {
  version: '1'; interestProductWeights: Record<string, number>; interestCategoryWeights: Record<string, number>;
  captureProbability: number; interestPurchaseProbability: number; resumeProbability: number;
  minimumInterestActions: number; maximumInterestActions: number; firstPlayOrientationActions: number;
  goalMemoryCapacity: number; spatialMemoryCapacity: number; switchMemoryDecay: number;
};
export type AttentionFocus = 'orient' | 'read-goal' | 'goal-item' | 'interest' | 'recover-goal' | 'checkout' | 'disengaged';
export type AttentionMemory = {
  version: '1';
  /** Only discoveries made by a previous policy; no full snapshot or target answer is accepted. */
  stations: { id: MarketEnvironmentStationId; label: string; kind: string; anchorId?: string; visits: number }[];
  anchors: { id: string; neighbors: string[]; visits: number }[];
  knownProducts: ActorProduct[];
  controlsPracticed: string[];
};
export type AttentionExperience = {
  visit: 'first-play' | 'revisit';
  /** A layout fingerprint from the controller. Reuse spatial memory only for the same value. */
  layoutKey?: string;
  previousLayoutKey?: string;
  memory?: AttentionMemory;
};
export type TraceOptions = {
  personaId: string; seed: string | number; snapshot: MarketReplaySnapshot;
  mode?: 'stochastic' | 'llm'; maxActions?: number; timeBudgetMs?: number;
  llm?: { baseUrl?: string; model?: string; apiKeyEnv?: string; maxCalls?: number; timeoutMs?: number };
  /** Optional local model contract. A failed LLM call is never replaced by stochastic actions. */
  decisionProvider?: (observation: Observation, history: TraceEntry[], persona: Persona) => Promise<Decision>;
  attentionExperience?: AttentionExperience;
  actorDecisionProvider?: (observation: ActorObservation, history: TraceEntry[], persona: Persona) => Promise<Decision>;
};
export type TraceSummary = { personaId: string; steps: number; walkingIntentions: number; cartChecks: number;
  helpRequests: number; productsDragged: number; plannedReactionMs: number; ending: 'review-requested' | 'gave-up' };
export type GeneratedTrace = MarketReplayTrace;
