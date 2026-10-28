import type { createMarketAgentAdapter, MarketAgentAction } from '../../frontend/src/game/marketSession';
import type { MarketEnvironmentStationId } from '../../frontend/src/game/marketEnvironment';
import type { MarketReplaySnapshot, MarketReplayTrace } from '../../frontend/src/game/marketReplayTrace';

export type Observation = ReturnType<ReturnType<typeof createMarketAgentAdapter>['observe']>;
/** Policy intent; primitive movement exists only inside offline guard validation. */
export type PolicyAction = Exclude<MarketAgentAction, { type: 'move' | 'moveInput' | 'viewCart' | 'viewHelp' }> | { type: 'walkTo'; station: MarketEnvironmentStationId }
  | { type: 'viewCart' | 'viewHelp'; durationMs?: number }
  | { type: 'walkToAnchor'; anchorId: string }
  | { type: 'moveDirection'; direction: ActorDirection; durationMs: number }
  | { type: 'readList'; durationMs: number }
  | { type: 'pause'; durationMs: number }
  | { type: 'lookAround'; durationMs: number }
  | { type: 'browse'; durationMs: number; scrollFraction: number };
export type Decision = { action: PolicyAction; delayMs: number; reason: string; currentTask?: string; attentionTag?: string; cueRefs?: string[];
  feedbackMemory?: import('./feedbackActor').FeedbackBeliefMemory;
  /** Controller-selected movement mode; never an actor-authored claim or hidden route. */
  movementPolicy?: import('../../frontend/src/game/marketReplayTrace').MarketReplayMovementPolicyDecision;
  /** Explicit observed motor attempt; only feedback planning exposes these choices. */
  dragOutcome?: 'drop' | 'miss' | 'cancel';
  exchange?: { request: unknown; response: unknown } };
export type PrimitiveDecision = { action: MarketAgentAction; delayMs: number; reason: string };
export type TraceEntry = Decision;
export type PersonaTraitKey = 'deliberation' | 'checking' | 'exploration' | 'persistence' | 'helpSeeking';
export type PersonaTraitLevel = 'low' | 'medium' | 'high';
export type PersonaTraitContext = {
  capability: {
    reactionMedianMs: number; reactionSigma: number; walkSpeed: number;
    confusionProbability: number; quantitySlipProbability: number; feedbackLearningRate: number;
    goalMemoryCapacity: number | null; spatialMemoryCapacity: number | null; switchMemoryDecay: number | null;
  };
  preferences: {
    pricePreference: number; familiarityBias: number; itemPreferenceWeights: Record<string, number>;
    interestProductWeights: Record<string, number>; interestCategoryWeights: Record<string, number>;
  };
  experience: {
    familiarProductIds: string[]; familiarCategories: string[];
    learningProfile: { baseline: 'initial-personal-history'; practiceFocus: string[]; transferConditions: string[] } | null;
    interpretation: string;
  };
};
export type PersonaTraitProfile = {
  schemaVersion: 'persona-traits-v1'; basePersonaId: string; presetId: string | null;
  traits: Record<PersonaTraitKey, PersonaTraitLevel>; contextHash: string; context: PersonaTraitContext;
};
export type Persona = {
  id: string; version: string; name: string; description: string; prompt: string;
  /** Validation-only composition. Canonical persona files and ordinary generation remain unchanged. */
  traitProfile?: PersonaTraitProfile;
  /** Fictional personal history and a stable subset of traits, never population estimates. */
  character?: {
    name: string; age: number; goal: string; selectedTraits: string[]; strengths: string[];
    preferences: string[]; familiarCategories: string[]; familiarProductIds: string[];
    practicedStrategies: string[];
    /** Initial habits are fixed during a trial; newly observed practice lives in learner memory. */
    learningProfile?: { baseline: 'initial-personal-history'; practiceFocus: string[]; transferConditions: string[] };
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
export type ActorProduct = { id: string; categoryId: string; name: string; detail?: string; price: number; stock: number;
  /** v8: the open shelf's own add control shows whether this product is already in the basket, never how many. */
  inCart?: boolean };
/** Actor projection, deliberately not assignable to the raw game observation. No coordinates, global map or automatic goal copy. */
export type ActorObservation = {
  schemaVersion: 'attention-observation-v1';
  sequence?: number; elapsedMs?: number;
  phase: Observation['phase']; view: Observation['view']; activeStation: MarketEnvironmentStationId | null;
  visibleStations: ActorStation[]; anchors: ActorAnchor[]; products: ActorProduct[];
  /** Visible shelf bodies whose signs cannot be read; no category IDs or hidden products. */
  visibleStructures?: { kind: 'shelf'; label: '진열대'; direction: ActorDirection; distanceBand: ActorDistanceBand }[];
  shelf: { page: number; pageCount: number; scrollFraction: number; pageFractions?: number[] } | null;
  listAvailable: boolean;
  /** Present for one observation after an accepted readList, never prefilled at entry. */
  readObjectives?: ActorObjective[];
  /** Text actually shown by the app. No analysis, hidden goals or expected answer. */
  instructions?: { phase: 'entry' | 'checkout'; lines: string[] };
  /** Exact shared UI help content, present only while that support view is open. */
  supportText?: string[];
  cart: Record<string, number> | null;
  /** v5+: product text in the currently displayed basket, never a hidden goal comparison. */
  cartItems?: { id: string; name: string; detail?: string; quantity: number }[];
  /** Enabled return controls in the open shelf basket; a standalone cart has none. */
  removableProductIds?: string[];
  cashiers: Partial<Record<string, boolean>>;
  lastActionError?: string | null;
  result?: { accepted: boolean; actionType: PolicyAction['type']; productId?: string; quantity?: number;
    stationId?: MarketEnvironmentStationId; anchorId?: string; message?: string;
    movement?: { direction: ActorDirection; durationMs: number; actualDelta: { dx: number; dy: number };
      movedDistancePx: number; outcome: 'moved' | 'partially-blocked' | 'blocked' } };
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
  learning?: import('./actorLearning').ConfirmedLearning;
};
export type TraceOptions = {
  personaId: string; seed: string | number; snapshot: MarketReplaySnapshot;
  mode?: 'stochastic' | 'llm'; maxActions?: number; timeBudgetMs?: number;
  tracePolicyVersion?: '5' | '6'; actorPolicyVersion?: 'episodic-choice-v9' | 'episodic-choice-v10' | 'feedback-choice-v1' | 'feedback-choice-v2' | 'feedback-choice-v3' | 'feedback-choice-v4' | 'feedback-choice-v5' | 'feedback-choice-v6' | 'feedback-choice-v7' | 'feedback-choice-v8' | 'feedback-choice-v9' | 'feedback-choice-v10' | 'feedback-choice-v11' | 'feedback-choice-v12' | 'feedback-choice-v13' | 'whole-trace-v1' | 'whole-trace-v2' | 'whole-trace-v3'; reasoningEffort?: 'low';
  feedbackMovement?: import('./feedbackMovementPolicy').FeedbackMovementPolicyOptions;
  planningMode?: 'whole-trace'; planningSubmissions?: number; repairSubmissions?: number;
  /** Compact is a test execution schedule, not an estimate of a person's speed. */
  timingProfile?: 'original' | 'compact';
  llm?: { baseUrl?: string; model?: string; apiKeyEnv?: string; maxCalls?: number; timeoutMs?: number;
    protocol?: 'openai' | 'ollama' };
  /** Optional local model contract. A failed LLM call is never replaced by stochastic actions. */
  decisionProvider?: (observation: Observation, history: TraceEntry[], persona: Persona) => Promise<Decision>;
  attentionExperience?: AttentionExperience;
  learnerIdentity?: import('./actorLearning').LearnerIdentity;
  trialBinding?: { trialId: string; arm: 'A' | 'B' | 'C'; roundId: string; requestHash: string };
  actorDecisionProvider?: (observation: ActorObservation, history: TraceEntry[], persona: Persona,
    activity: import('./actorActivity').ActorActivityState, state?: unknown) => Promise<Decision>;
  /** The feedback actor boundary never receives archived observations or the full snapshot. */
  feedbackDecisionProvider?: (frame: import('./feedbackActor').FeedbackActorFrame) => Promise<Decision>;
  onActorDecisionAccepted?: () => void;
  /** Applied offline UI outcome, including a handled UI rejection; never a correctness verdict. */
  onActorDecisionApplied?: (after: ActorObservation) => void;
  /** Local diagnostics only. Unfinished plans never become executed learner experience. */
  onCheckpoint?: (entry: GenerationCheckpoint) => void;
};
export type GenerationCheckpoint = { kind: 'decision'; index: number; before: ActorObservation;
  decision: Omit<Decision, 'exchange'>; after: ActorObservation; activity: import('./actorActivity').ActorActivityState }
  | { kind: 'controlled-stop' | 'system-completion'; index: number; activity: import('./actorActivity').ActorActivityState };
export type TraceSummary = { personaId: string; steps: number; walkingIntentions: number; cartChecks: number;
  helpRequests: number; productsDragged: number; plannedReactionMs: number; ending: 'review-requested' | 'gave-up' | 'controlled-stop' | 'action-limit-incomplete' | 'assisted-review-requested' };
export type GeneratedTrace = MarketReplayTrace;
