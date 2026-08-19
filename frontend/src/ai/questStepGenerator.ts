import type { QuestDetail, QuestStep } from '../api/quest';
import { generateNativeText, getNativeRuntimeStatus, initializeNativeModel } from './nativeRuntime';
import type { GenerateRequest, GenerateResult, NativeRuntimeStatus } from './nativeRuntime.types';

export type QuestStepGenerationOutput = {
  situation: string;
  instruction: string;
  hint: string | null;
  choices: Array<{ label: string; correct: boolean; feedback?: string }>;
};

export type QuestStepGenerationResult = {
  step: QuestStep;
  source: 'ai' | 'original';
  requestId: string;
  failureCode: string | null;
};

export type QuestStepGenerationRuntime = {
  getStatus(): Promise<NativeRuntimeStatus>;
  initialize(): Promise<NativeRuntimeStatus>;
  generate(request: GenerateRequest): Promise<GenerateResult>;
};

const runtime: QuestStepGenerationRuntime = {
  getStatus: getNativeRuntimeStatus,
  initialize: initializeNativeModel,
  generate: generateNativeText,
};

// 아동에게 노출하면 안 되는 공격적 표현·외부 링크·이메일을 차단한다.
const forbiddenPatterns = [
  /죽어|죽여|바보|멍청|쓸모없|혼나|벌을 받아/,
  /https?:\/\//i,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
];

// AI가 실제로 선택된 테마를 반영했는지 빠르게 확인하는 핵심 단어다.
const themeAnchors: Record<string, string[]> = {
  '한산한 낮': ['한산', '낮', '조용'],
  '비가 살짝 오는 날': ['비', '빗', '우산', '젖'],
  '사람이 조금 있는 시간': ['사람', '승객', '차례'],
  '사람이 많은 퇴근 시간': ['사람', '승객', '혼잡', '붐비', '퇴근'],
  '안내가 잘 들리지 않는 순간': ['안내', '방송', '화면', '소리'],
  '비가 와서 이동이 느린 날': ['비', '빗', '우산', '젖', '천천히'],
};

// 모델에는 화면 문장과 정답 배열만 보내고 DB ID·보상·사용자 정보는 보내지 않는다.
function buildPrompt(quest: Pick<QuestDetail, 'title' | 'goal' | 'difficulty'>, step: QuestStep, variationTheme: string): string {
  const correctSequence = step.choices.map((choice) => choice.correct);
  const hintSchema = step.hint === null ? 'null' : '"..."';
  const choicesSchema = correctSequence
    .map((correct) => `{"l":"...","r":${correct}}`)
    .join(',');
  const complexityRule = quest.difficulty === 'NORMAL'
    ? 'This is NORMAL difficulty: preserve every original condition, unexpected event, and action order.'
    : 'This is EASY difficulty: express one clear clue and one action.';
  const input = {
    t: quest.title,
    g: quest.goal,
    variationTheme,
    s: step.situation,
    i: step.instruction,
    h: step.hint,
    // ID는 보내지 않고 배열 순서와 정답 의미만 전달한다.
    choices: step.choices.map((choice) => ({
      l: choice.label,
      r: choice.correct,
    })),
  };
  return [
    `Input: ${JSON.stringify(input)}`,
    'Rewrite this child social-skills quest step in natural, simple, polite Korean. Mandatory: s must be a new setting that includes variationTheme; change every s, i, h, and c.l using only facts in Input.',
    `${complexityRule} Keep meaning, numbers, hint presence, choice count/order, and every r value unchanged.`,
    'Output Korean text only. Add no new place, person, object, condition, or unsafe action. Limits: s/i/h 60 Korean characters and each c.l 35.',
    'Keep field roles distinct: s is only the setting/event, i is only the action request, h is only a helpful clue, and each c.l is one distinct answer action. Never copy an answer choice into s, i, or h.',
    `Return only this JSON shape with no markdown or extra keys: {"s":"...","i":"...","h":${hintSchema},"c":[${choicesSchema}]}`,
  ].join('\n');
}

// Bllossom 출력에서 JSON만 꺼낸 뒤 허용한 필드와 자료형인지 확인한다.
// 짧은 키는 실제 프롬프트용이고, 긴 키는 이전 출력과 테스트 호환용이다.
function parseOutput(text: string): QuestStepGenerationOutput {
  const candidate = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('INVALID_JSON');
  let value: unknown;
  try {
    value = JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new Error('INVALID_JSON');
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('INVALID_OUTPUT_SHAPE');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const compact = keys.join(',') === 'c,h,i,s';
  const expanded = keys.join(',') === 'choices,hint,instruction,situation';
  if (!compact && !expanded) throw new Error('INVALID_OUTPUT_SHAPE');
  const situation = compact ? record.s : record.situation;
  const instruction = compact ? record.i : record.instruction;
  const hint = compact ? record.h : record.hint;
  const rawChoices = compact ? record.c : record.choices;
  if (typeof situation !== 'string' || typeof instruction !== 'string') throw new Error('INVALID_OUTPUT_SHAPE');
  if (hint !== null && typeof hint !== 'string') throw new Error('INVALID_OUTPUT_SHAPE');
  if (!Array.isArray(rawChoices)) throw new Error('INVALID_OUTPUT_SHAPE');
  const choices = rawChoices.map((choice) => {
    if (!choice || Array.isArray(choice) || typeof choice !== 'object') throw new Error('INVALID_OUTPUT_SHAPE');
    const item = choice as Record<string, unknown>;
    const itemKeys = Object.keys(item).sort().join(',');
    const compactShape = itemKeys === 'l,r' || itemKeys === 'correct,f,l';
    const expandedShape = itemKeys === 'correct,label' || itemKeys === 'correct,feedback,label';
    if (compact ? !compactShape : !expandedShape) throw new Error('INVALID_OUTPUT_SHAPE');
    const label = compact ? item.l : item.label;
    const correct = compact ? (item.r ?? item.correct) : item.correct;
    const feedback = compact ? item.f : item.feedback;
    if (typeof label !== 'string' || typeof correct !== 'boolean') throw new Error('INVALID_OUTPUT_SHAPE');
    if (feedback !== undefined && typeof feedback !== 'string') throw new Error('INVALID_OUTPUT_SHAPE');
    return { label, correct, ...(typeof feedback === 'string' ? { feedback } : {}) };
  });
  return {
    situation,
    instruction,
    hint: hint as string | null,
    choices,
  };
}

// 생성 결과가 원문에 없던 버스 번호 같은 숫자를 만들었는지 비교할 때 사용한다.
function numbersIn(text: string): Set<string> {
  return new Set(text.match(/\d+/g) ?? []);
}

// 화면에 표시하기 전 한 줄·길이·문장 수·한국어 전용·금지어를 한 번에 검사한다.
function validateSentence(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0
    && !trimmed.includes('\n')
    && Array.from(trimmed).length <= 80
    && (trimmed.match(/[.!?。！？]/g) ?? []).length <= 2
    && !/[A-Za-z]/.test(trimmed)
    && !forbiddenPatterns.some((pattern) => pattern.test(trimmed));
}

const semanticStopWords = new Set(['한다', '해요', '하세요', '보세요', '봐요', '있어요', '됩니다']);
const negativeMarkers = ['않', '말', '없이', '아니', '못'];

// 조사와 흔한 종결 표현을 제거해 의미 비교에 쓸 핵심 단어만 남긴다.
function semanticTokens(value: string): string[] {
  return (value.match(/[가-힣A-Za-z0-9]+/g) ?? [])
    .map((token) => token.replace(/(으로|에서|에게|까지|부터|처럼|인지|이면|을|를|이|가|은|는|에|로|와|과|도|만)$/u, ''))
    .filter((token) => token.length >= 2 && !semanticStopWords.has(token));
}

// 원문과 생성문이 핵심 단어를 공유하고 부정 의미도 동일한지 검사한다.
// 예: "확인한다"가 "확인하지 않는다"로 바뀌면 false를 반환한다.
function preservesCoreMeaning(original: string, generated: string): boolean {
  const originalNegative = negativeMarkers.some((marker) => original.includes(marker));
  const generatedNegative = negativeMarkers.some((marker) => generated.includes(marker));
  if (originalNegative !== generatedNegative) return false;
  const originalTokens = semanticTokens(original);
  const generatedTokens = semanticTokens(generated);
  return originalTokens.some((source) => generatedTokens.some(
    (candidate) => source.includes(candidate) || candidate.includes(source),
  ));
}

// 상황 품질과 한국어 전용 규칙을 필드별로 보정한다.
// 상황은 검토 문장으로 교체하고, 나머지 영문 혼입 필드는 서버 원문으로 복구한다.
function applyApprovedTheme(
  output: QuestStepGenerationOutput,
  variationTheme: string,
  step: QuestStep,
): QuestStepGenerationOutput {
  const situation = output.situation.trim();
  const anchors = themeAnchors[variationTheme] ?? [];
  const usableSituation = !/[A-Za-z]/.test(situation)
    && !situation.includes(step.situation.trim())
    && anchors.some((anchor) => situation.includes(anchor));
  const koreanOnly = (generated: string, original: string): string => (
    /[A-Za-z]/.test(generated) ? original : generated
  );
  // 복사·테마 이탈·영어 출력은 억지 접두어를 붙이지 않고 해당 원본 필드로 복구한다.
  return {
    ...output,
    situation: usableSituation ? situation : step.situation,
    instruction: koreanOnly(output.instruction, step.instruction),
    hint: output.hint === null || step.hint === null ? null : koreanOnly(output.hint, step.hint),
    choices: output.choices.map((choice, index) => ({
      ...choice,
      label: koreanOnly(choice.label, step.choices[index]?.label ?? ''),
      ...(choice.feedback
        ? { feedback: koreanOnly(choice.feedback, step.choices[index]?.feedback ?? '') }
        : {}),
    })),
  };
}

// AI 문장만 서버 원본 QuestStep에 병합해 ID·순서·정답·보상 구조를 보존한다.
function validateAndMerge(step: QuestStep, output: QuestStepGenerationOutput): QuestStep {
  // 선택지 개수와 힌트 유무가 달라지면 단계 전체를 사용할 수 없다.
  if (output.choices.length !== step.choices.length) throw new Error('CHOICE_COUNT_CHANGED');
  if ((step.hint === null) !== (output.hint === null)) throw new Error('HINT_SHAPE_CHANGED');
  const strings = [
    output.situation,
    output.instruction,
    ...(output.hint ? [output.hint] : []),
    ...output.choices.flatMap((choice) => [choice.label, ...(choice.feedback ? [choice.feedback] : [])]),
  ];
  if (strings.some((value) => !validateSentence(value))) throw new Error('UNSAFE_OR_LONG_TEXT');
  // 상황 변형의 핵심인 테마가 빠지면 어색한 부분 생성물을 쓰지 않고 단계 전체를 복구한다.
  if (output.situation.trim() === step.situation.trim()) throw new Error('THEME_NOT_APPLIED');
  const generatedChoiceSentences = output.choices.map((choice) => choice.label.trim());
  const instructionText = output.instruction.trim();
  const hintText = output.hint?.trim() ?? null;
  // 지시·힌트가 서로 같거나 선택지 전체를 복사하면 역할이 무너진 출력으로 판단한다.
  if (
    generatedChoiceSentences.includes(instructionText)
    || (hintText !== null && (
      hintText === instructionText
      || generatedChoiceSentences.includes(hintText)
    ))
  ) throw new Error('FIELD_ROLE_COLLISION');

  const originalText = [
    step.situation,
    step.instruction,
    step.hint ?? '',
    ...step.choices.map((choice) => choice.label),
  ].join(' ');
  const generatedText = strings.join(' ');
  const sourceNumbers = numbersIn(originalText);
  // AI가 원문에 없던 노선 번호나 금액을 임의로 만들지 못하게 한다.
  if ([...numbersIn(generatedText)].some((number) => !sourceNumbers.has(number))) throw new Error('NEW_NUMBER_ADDED');
  if (generatedText === originalText) throw new Error('UNCHANGED_OUTPUT');

  const choices = step.choices.map((choice, index) => {
    const generated = output.choices[index];
    // 모델이 정답 위치를 바꾸면 서버 판정과 화면이 어긋나므로 즉시 거절한다.
    if (generated.correct !== choice.correct) throw new Error('CORRECTNESS_CHANGED');
    return {
      ...choice,
      // 핵심 단어·부정 의미가 사라진 선택지는 안전한 서버 원문을 유지한다.
      label: preservesCoreMeaning(choice.label, generated.label) ? generated.label.trim() : choice.label,
      feedback: generated.feedback?.trim() ?? choice.feedback,
    };
  });

  const instruction = preservesCoreMeaning(step.instruction, output.instruction)
    ? output.instruction.trim()
    : step.instruction;
  const hint = step.hint === null || output.hint === null
    ? null
    : (preservesCoreMeaning(step.hint, output.hint) ? output.hint.trim() : step.hint);

  return {
    ...step,
    situation: output.situation.trim(),
    instruction,
    hint,
    choices,
  };
}

// 런타임 준비 → 프롬프트 생성 → 모델 호출 → 파싱 → 정책 검사 → 원문 병합 순서로 실행한다.
// 어느 단계에서든 실패하면 예외를 화면으로 보내지 않고 서버 원본 단계를 반환한다.
export async function generateFullQuestStep(
  quest: Pick<QuestDetail, 'title' | 'goal' | 'difficulty'>,
  step: QuestStep,
  requestId: string,
  dependency: QuestStepGenerationRuntime = runtime,
  variationTheme = '비가 살짝 오는 날',
): Promise<QuestStepGenerationResult> {
  try {
    let status = await dependency.getStatus();
    if (!status.supported) throw new Error('RUNTIME_UNAVAILABLE');
    if (status.state !== 'ready') status = await dependency.initialize();
    if (status.state !== 'ready') throw new Error('RUNTIME_ERROR');
    const generated = await dependency.generate({
      requestId,
      prompt: buildPrompt(quest, step, variationTheme),
      // 복잡한 상황과 전체 선택지를 충분히 생성할 수 있도록 출력 여유를 둔다.
      maxTokens: 1024,
      // 3B 모델로 선택지 세 개까지 만드는 MuMu x86_64 환경을 고려한다.
      timeoutMs: 120_000,
    });
    return {
      step: validateAndMerge(step, applyApprovedTheme(parseOutput(generated.text), variationTheme, step)),
      source: 'ai',
      requestId,
      failureCode: null,
    };
  } catch (error) {
    return {
      step,
      source: 'original',
      requestId,
      failureCode: error instanceof Error ? error.message : 'RUNTIME_ERROR',
    };
  }
}

export const questStepGeneratorTestables = {
  applyApprovedTheme,
  buildPrompt,
  parseOutput,
  preservesCoreMeaning,
  validateAndMerge,
};
