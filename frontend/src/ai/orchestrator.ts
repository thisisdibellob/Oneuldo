import type { QuestDetail, QuestStep } from '../api/quest';
import {
  generateNativeText,
  getNativeRuntimeStatus,
  initializeNativeModel,
} from './nativeRuntime';
import {
  QUEST_VARIATION_POLICY_VERSION,
  QUEST_VARIATION_PROMPT_VERSION,
  type QuestVariationFailureCode,
  type QuestVariationMetadata,
  type QuestVariationResult,
} from './contracts';
import { getOriginalQuestVariation, mergeQuestVariation } from './fallback';
import { parseQuestVariationOutput, QuestVariationParseError } from './parsers/questVariationParser';
import { validateQuestVariation } from './policy';
import { buildQuestVariationPrompt } from './prompts/questVariationPrompt';
import { QuestVariationInputError, selectQuestVariationInput } from './selectors/questVariationSelector';
import type { GenerateRequest, GenerateResult, NativeRuntimeStatus } from './nativeRuntime.types';

export type QuestVariationRuntime = {
  getStatus(): Promise<NativeRuntimeStatus>;
  initialize(): Promise<NativeRuntimeStatus>;
  generate(request: GenerateRequest): Promise<GenerateResult>;
};

export type QuestVariationOptions = {
  quest: Pick<QuestDetail, 'title' | 'goal'>;
  step: QuestStep;
  requestId?: string;
  maxTokens?: number;
  timeoutMs?: number;
};

export type QuestVariationDependencies = {
  runtime?: QuestVariationRuntime;
  now?: () => number;
  onDiagnostic?: (metadata: QuestVariationMetadata) => void;
};

const defaultRuntime: QuestVariationRuntime = {
  getStatus: getNativeRuntimeStatus,
  initialize: initializeNativeModel,
  generate: generateNativeText,
};

let requestSequence = 0;

function createRequestId(now: number): string {
  requestSequence = (requestSequence + 1) % 1_000_000;
  return `quest-variation-${now}-${requestSequence}`;
}

async function ensureRuntimeReady(runtime: QuestVariationRuntime): Promise<NativeRuntimeStatus> {
  let status = await runtime.getStatus();
  if (!status.supported) throw new Error('RUNTIME_UNAVAILABLE');
  if (status.state !== 'ready') status = await runtime.initialize();
  if (status.state !== 'ready') throw new Error('RUNTIME_ERROR');
  return status;
}

function classifyFailure(error: unknown): QuestVariationFailureCode {
  if (error instanceof QuestVariationInputError) return error.code;
  if (error instanceof QuestVariationParseError) return error.code;
  if (error instanceof Error && error.message === 'POLICY_REJECTED') return 'POLICY_REJECTED';
  if (error instanceof Error && error.message === 'RUNTIME_UNAVAILABLE') return 'RUNTIME_UNAVAILABLE';
  return 'RUNTIME_ERROR';
}

export async function generateQuestVariation(
  options: QuestVariationOptions,
  dependencies: QuestVariationDependencies = {},
): Promise<QuestVariationResult> {
  const runtime = dependencies.runtime ?? defaultRuntime;
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  const requestId = options.requestId ?? createRequestId(startedAt);
  let modelVersion: string | null = null;

  const finish = (
    source: 'ai' | 'original',
    failureCode: QuestVariationFailureCode | null,
    variation = getOriginalQuestVariation(options.step),
  ): QuestVariationResult => {
    const metadata: QuestVariationMetadata = {
      requestId,
      modelVersion,
      promptVersion: QUEST_VARIATION_PROMPT_VERSION,
      policyVersion: QUEST_VARIATION_POLICY_VERSION,
      latencyMs: Math.max(0, now() - startedAt),
      fallbackUsed: source === 'original',
      failureCode,
    };
    // 진단 콜백에는 프롬프트와 원문을 전달하지 않는다.
    if (__DEV__) dependencies.onDiagnostic?.(metadata);
    return {
      step: mergeQuestVariation(options.step, variation),
      variation,
      source,
      metadata,
    };
  };

  try {
    const input = selectQuestVariationInput(options.quest, options.step);
    const runtimeStatus = await ensureRuntimeReady(runtime);
    modelVersion = runtimeStatus.runtimeVersion;
    const generated = await runtime.generate({
      requestId,
      prompt: buildQuestVariationPrompt(input),
      maxTokens: options.maxTokens ?? 128,
      timeoutMs: options.timeoutMs ?? 30_000,
    });
    const parsed = parseQuestVariationOutput(generated.text);
    const policy = validateQuestVariation(input, parsed);
    if (!policy.accepted) throw new Error('POLICY_REJECTED');
    return finish('ai', null, policy.output);
  } catch (error) {
    return finish('original', classifyFailure(error));
  }
}
