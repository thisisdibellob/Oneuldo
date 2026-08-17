import type { QuestStep } from '../api/quest';
import type { QuestVariationOutput } from './contracts';

export function getOriginalQuestVariation(
  step: Pick<QuestStep, 'situation' | 'instruction'>,
): QuestVariationOutput {
  return {
    situation: step.situation,
    instruction: step.instruction,
  };
}

export function mergeQuestVariation(
  originalStep: QuestStep,
  variation: QuestVariationOutput,
): QuestStep {
  return {
    ...originalStep,
    // AI 결과는 아래 두 문장에만 반영한다.
    situation: variation.situation,
    instruction: variation.instruction,
  };
}
