import type { QuestDetail, QuestStep } from '../../api/quest';
import {
  QUEST_VARIATION_INPUT_VERSION,
  type QuestVariationFailureCode,
  type QuestVariationInput,
} from '../contracts';

const sensitivePatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
];

export class QuestVariationInputError extends Error {
  constructor(public readonly code: Extract<QuestVariationFailureCode, 'SENSITIVE_INPUT' | 'INVALID_INPUT'>, message: string) {
    super(message);
    this.name = 'QuestVariationInputError';
  }
}

function requireText(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new QuestVariationInputError('INVALID_INPUT', `${fieldName}이 비어 있습니다.`);
  }
  if (sensitivePatterns.some((pattern) => pattern.test(normalized))) {
    throw new QuestVariationInputError('SENSITIVE_INPUT', `${fieldName}에 민감한 정보가 포함되어 있습니다.`);
  }
  return normalized;
}

export function selectQuestVariationInput(
  quest: Pick<QuestDetail, 'title' | 'goal'>,
  step: Pick<QuestStep, 'situation' | 'instruction'>,
): QuestVariationInput {
  // ID, 선택지, 정답, 보상은 이 객체에 복사하지 않는다.
  return {
    schemaVersion: QUEST_VARIATION_INPUT_VERSION,
    theme: requireText(quest.title, 'theme'),
    objective: requireText(quest.goal, 'objective'),
    originalSituation: requireText(step.situation, 'originalSituation'),
    originalInstruction: requireText(step.instruction, 'originalInstruction'),
  };
}
