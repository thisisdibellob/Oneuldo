import type { QuestVariationFailureCode, QuestVariationOutput } from '../contracts';

const allowedKeys = new Set(['situation', 'instruction']);

export class QuestVariationParseError extends Error {
  constructor(
    public readonly code: Extract<QuestVariationFailureCode, 'INVALID_JSON' | 'INVALID_OUTPUT_SHAPE'>,
    message: string,
  ) {
    super(message);
    this.name = 'QuestVariationParseError';
  }
}

function extractJsonObject(text: string): string {
  // 모델이 JSON 코드 블록을 붙여도 내부 객체만 추출할 수 있게 정리한다.
  let candidate = text.trim();
  if (candidate.startsWith('```') && candidate.endsWith('```')) {
    candidate = candidate.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  // 배열을 내부 객체로 잘못 축소하지 않고 형태 검사에서 거절한다.
  if (candidate.startsWith('[') && candidate.endsWith(']')) return candidate;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new QuestVariationParseError('INVALID_JSON', 'AI 응답에서 JSON 객체를 찾지 못했습니다.');
  }
  return candidate.slice(firstBrace, lastBrace + 1);
}

export function parseQuestVariationOutput(text: string): QuestVariationOutput {
  // 빈 출력과 JSON 문법 오류를 서로 같은 INVALID_JSON 계열로 정리한다.
  if (text.trim().length === 0) {
    throw new QuestVariationParseError('INVALID_JSON', 'AI 응답이 비어 있습니다.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch (error) {
    if (error instanceof QuestVariationParseError) throw error;
    throw new QuestVariationParseError('INVALID_JSON', 'AI 응답 JSON을 해석하지 못했습니다.');
  }

  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new QuestVariationParseError('INVALID_OUTPUT_SHAPE', 'AI 응답은 객체여야 합니다.');
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  // 허용하지 않은 키를 무시하지 않고 거절해 모델이 만든 임의 데이터를 차단한다.
  if (keys.length !== 2 || keys.some((key) => !allowedKeys.has(key))) {
    throw new QuestVariationParseError(
      'INVALID_OUTPUT_SHAPE',
      'AI 응답에는 situation과 instruction만 있어야 합니다.',
    );
  }
  if (typeof record.situation !== 'string' || typeof record.instruction !== 'string') {
    throw new QuestVariationParseError('INVALID_OUTPUT_SHAPE', 'AI 응답 문장은 문자열이어야 합니다.');
  }
  return { situation: record.situation, instruction: record.instruction };
}
