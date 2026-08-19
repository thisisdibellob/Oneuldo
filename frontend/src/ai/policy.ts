import type { QuestVariationInput, QuestVariationOutput } from './contracts';

export const QUEST_VARIATION_MAX_CHARACTERS = 80;

// Phase 3 두 문장 변형에서 공통으로 거절하는 위험 표현이다.
const forbiddenPatterns = [
  /죽어|죽여|바보|멍청|쓸모없|혼나|벌을 받아/,
  /https?:\/\//i,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
];

export type QuestVariationPolicyResult =
  | { accepted: true; output: QuestVariationOutput }
  | { accepted: false; reason: string };

function numbersIn(text: string): Set<string> {
  return new Set(text.match(/\d+/g) ?? []);
}

// 문장 하나의 공백·줄바꿈·길이·문장 수·금지어를 검사한다.
function validateSentence(name: string, value: string): string | null {
  if (value !== value.trim() || value.length === 0) return `${name} 문장이 비어 있거나 공백으로 둘러싸여 있습니다.`;
  if (value.includes('\n') || value.includes('\r')) return `${name}은 한 줄이어야 합니다.`;
  if (Array.from(value).length > QUEST_VARIATION_MAX_CHARACTERS) return `${name}이 80자를 초과했습니다.`;
  if ((value.match(/[.!?。！？]/g) ?? []).length > 1) return `${name}은 한 문장이어야 합니다.`;
  if (forbiddenPatterns.some((pattern) => pattern.test(value))) return `${name}에 금지 표현이 포함되어 있습니다.`;
  return null;
}

export function validateQuestVariation(
  input: QuestVariationInput,
  output: QuestVariationOutput,
): QuestVariationPolicyResult {
  // 상황과 지시 중 하나라도 실패하면 부분 채택하지 않고 정책 전체를 거절한다.
  const situationError = validateSentence('situation', output.situation);
  if (situationError) return { accepted: false, reason: situationError };
  const instructionError = validateSentence('instruction', output.instruction);
  if (instructionError) return { accepted: false, reason: instructionError };

  // 원문에 없던 버스 번호 같은 구체값을 새로 만들지 못하게 한다.
  const sourceNumbers = numbersIn([
    input.theme,
    input.objective,
    input.originalSituation,
    input.originalInstruction,
  ].join(' '));
  const outputNumbers = numbersIn(`${output.situation} ${output.instruction}`);
  if ([...outputNumbers].some((value) => !sourceNumbers.has(value))) {
    return { accepted: false, reason: '원문에 없는 숫자가 추가되었습니다.' };
  }

  return {
    // 통과한 문장만 앞뒤 공백을 제거해 화면 계층으로 보낸다.
    accepted: true,
    output: {
      situation: output.situation.trim(),
      instruction: output.instruction.trim(),
    },
  };
}
