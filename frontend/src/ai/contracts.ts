import type { QuestStep } from '../api/quest';

export const QUEST_VARIATION_INPUT_VERSION = 'quest-variation-input-v1' as const;
export const QUEST_VARIATION_OUTPUT_VERSION = 'quest-variation-output-v1' as const;
export const QUEST_VARIATION_PROMPT_VERSION = 'quest-variation-prompt-v1' as const;
export const QUEST_VARIATION_POLICY_VERSION = 'quest-variation-policy-v1' as const;

export type QuestVariationInput = {
  schemaVersion: typeof QUEST_VARIATION_INPUT_VERSION;
  theme: string;
  objective: string;
  originalSituation: string;
  originalInstruction: string;
};

export type QuestVariationOutput = {
  situation: string;
  instruction: string;
};

export type QuestVariationFailureCode =
  | 'SENSITIVE_INPUT'
  | 'INVALID_INPUT'
  | 'RUNTIME_UNAVAILABLE'
  | 'RUNTIME_ERROR'
  | 'INVALID_JSON'
  | 'INVALID_OUTPUT_SHAPE'
  | 'POLICY_REJECTED';

export type QuestVariationMetadata = {
  requestId: string;
  modelVersion: string | null;
  promptVersion: typeof QUEST_VARIATION_PROMPT_VERSION;
  policyVersion: typeof QUEST_VARIATION_POLICY_VERSION;
  latencyMs: number;
  fallbackUsed: boolean;
  failureCode: QuestVariationFailureCode | null;
};

export type QuestVariationResult = {
  step: QuestStep;
  variation: QuestVariationOutput;
  source: 'ai' | 'original';
  metadata: QuestVariationMetadata;
};
