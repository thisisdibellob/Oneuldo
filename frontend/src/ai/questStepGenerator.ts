import type { QuestDetail, QuestStep } from '../api/quest';
import { generateNativeText, getNativeRuntimeStatus, initializeNativeModel } from './nativeRuntime';
import type { GenerateResult, NativeRuntimeStatus } from './nativeRuntime.types';
import type { CloudCapableGenerateRequest } from './cloudFirstQuestRuntime';
import { buildKoreanTransportRulePrompt } from './prompts/koreanTransportRules';
import {
  buildIncidentPromptBlock,
  transportIncidents,
  type TransportIncident,
} from './transportIncidents';

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
  generate(request: CloudCapableGenerateRequest): Promise<GenerateResult>;
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

// 모델에는 화면 문장과 정답 배열만 보내고 DB ID·보상·사용자 정보는 보내지 않는다.
function buildPrompt(
  quest: Pick<QuestDetail, 'title' | 'goal' | 'difficulty'> & Partial<Pick<QuestDetail, 'code' | 'summary'>>,
  step: QuestStep,
  incident: TransportIncident,
  retryFailureCode?: string,
): string {
  const input = {
    t: quest.title,
    g: quest.goal,
    d: quest.difficulty,
    incidentType: incident.id,
    s: step.situation,
    i: step.instruction,
    // ID는 보내지 않고 배열 순서와 정답 의미만 전달한다.
    choices: step.choices.map((choice) => ({
      l: choice.label,
      r: choice.correct,
    })),
  };
  const situationOnlyRetry = retryFailureCode === 'INCIDENT_NOT_APPLIED'
    || retryFailureCode === 'SITUATION_MEANING_LOST';
  if (situationOnlyRetry) {
    return [
      '지시문을 실제로 수행할 수 있는 구체적인 상황 한 문장만 한국어로 작성하세요.',
      '원래 단계의 목적을 수행하는 도중 돌발상황이 발생하도록 두 내용을 자연스럽게 결합하세요. 템플릿 제목을 접두어처럼 붙이면 실패입니다.',
      '원문의 핵심 사건과 교통수단을 유지하고, 허용된 돌발상황 외의 사건으로 바꾸면 실패입니다.',
      buildIncidentPromptBlock(incident),
      '숫자와 의미를 유지하고 새로운 사실이나 위험한 행동을 추가하지 마세요. 번호·글머리표·따옴표·설명 없이 한 줄만 출력하세요.',
      buildKoreanTransportRulePrompt(quest, step),
      `입력: ${JSON.stringify(input)}`,
    ].join('\n');
  }
  const lines = [
    `아동용 사회기술 퀘스트에서 지시문에 맞는 새로운 상황 1문장과 선택지 ${step.choices.length}문장을 한국어로 작성하세요.`,
    '1번째 줄은 원래 상황과 허용된 돌발상황을 자연스럽게 결합하세요. 템플릿 제목을 접두어처럼 붙이면 실패입니다.',
    `2~${step.choices.length + 1}번째 줄은 입력 선택지의 순서·정답 위치를 유지하고, r=true에는 원래 행동과 돌발상황의 필수 대처를 함께 반영하세요.`,
    '규칙은 사실 확인에만 사용하세요. 원문의 개찰구 사건을 환승 사건으로 바꾸는 것처럼 핵심 사건을 다른 규칙의 사건으로 교체하면 실패입니다.',
    '숫자를 유지하고 허용된 돌발상황 밖의 새로운 사실이나 위험한 행동을 추가하지 마세요. 각 줄은 80자 이하로 쓰세요.',
    buildIncidentPromptBlock(incident),
    '아래 한국 대중교통 규칙에 없는 운영 방식·설비·요금·법규를 추측하지 마세요.',
    buildKoreanTransportRulePrompt(quest, step),
    `정확히 ${step.choices.length + 1}줄만 출력하세요. JSON·키·번호·글머리표·따옴표·설명은 출력하지 마세요.`,
    `입력: ${JSON.stringify(input)}`,
  ];
  if (retryFailureCode) {
    lines.push(
      `이전 출력 실패(${retryFailureCode}): 1번째 줄에 s/i의 핵심 대상이나 행동을 넣고 총 ${step.choices.length + 1}줄을 완성하세요.`,
    );
  }
  return lines.join('\n');
}

function normalizeGeneratedLine(value: string): string {
  return value
    .trim()
    .replace(/^(?:[-*•]\s*|\d+\s*[.)]\s*)/u, '')
    .replace(/^["'“”‘’](.*)["'“”‘’]$/u, '$1')
    .trim();
}

// 모델은 상황과 선택지 문장만 줄 단위로 반환하고, 나머지 구조는 원본에서 복원한다.
function parseOutput(text: string, step: QuestStep): QuestStepGenerationOutput {
  let lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^```(?:text)?$/iu.test(line))
    .map(normalizeGeneratedLine);
  if (lines.some((line) => line.length === 0)) throw new Error('INVALID_OUTPUT_SHAPE');
  const [firstLine, ...rawChoiceLabels] = lines;
  let situationLines = [firstLine];
  let choiceLabels = rawChoiceLabels;
  if (rawChoiceLabels.length > step.choices.length
      && rawChoiceLabels.length % step.choices.length === 0) {
    const firstBlock = rawChoiceLabels.slice(0, step.choices.length);
    const repeatedExactly = rawChoiceLabels.every(
      (line, index) => line === firstBlock[index % step.choices.length],
    );
    if (repeatedExactly) choiceLabels = firstBlock;
  }
  if (choiceLabels === rawChoiceLabels && lines.length > step.choices.length + 1) {
    situationLines = lines.slice(0, -step.choices.length);
    choiceLabels = lines.slice(-step.choices.length);
  }
  const situation = situationLines.join(' ');
  if (!situation || choiceLabels.length !== step.choices.length) throw new Error('CHOICE_COUNT_CHANGED');
  return {
    situation,
    instruction: step.instruction,
    hint: step.hint,
    choices: step.choices.map((choice, index) => ({
      label: choiceLabels[index],
      correct: choice.correct,
    })),
  };
}

function parseSituationOutput(text: string): string {
  const lines = text
    .split(/\r?\n/u)
    .map(normalizeGeneratedLine)
    .filter((line) => line.length > 0 && !/^```(?:text)?$/iu.test(line));
  if (lines.length === 0) throw new Error('INVALID_OUTPUT_SHAPE');
  // 상황 전용 재시도에서 모델이 선택지를 덧붙여도 첫 문장만 사용하고 기존 선택지는 유지한다.
  return lines[0];
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
const positiveEndorsementMarkers = ['좋', '맞', '안전', '도움', '편하', '괜찮', '추천'];

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
function applyIncidentTemplate(
  output: QuestStepGenerationOutput,
  incident: TransportIncident,
  step: QuestStep,
): QuestStepGenerationOutput {
  const situation = output.situation.trim();
  const usableSituation = !/[A-Za-z]/.test(situation)
    && situation !== step.situation.trim()
    && incident.situationAnchors.some((anchor) => situation.includes(anchor));
  const koreanOnly = (generated: string, original: string): string => (
    /[A-Za-z]/.test(generated) ? original : generated
  );
  // 돌발상황 이탈·영어 출력은 억지 접두어를 붙이지 않고 해당 원본 필드로 복구한다.
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

// 규칙집으로 막는 대표적인 한국 교통 맥락 오류를 화면 노출 전에 한 번 더 거절한다.
function hasUnsupportedTransportFact(step: QuestStep, output: QuestStepGenerationOutput): boolean {
  const originalText = [
    step.situation,
    step.instruction,
    step.hint ?? '',
    ...step.choices.map((choice) => choice.label),
  ].join(' ');
  const generatedPositiveText = [
    output.situation,
    output.instruction,
    output.hint ?? '',
    ...output.choices.filter((choice) => choice.correct).map((choice) => choice.label),
  ].join(' ');
  const subway = /지하철|전철|개찰구|승강장|역무원/u.test(originalText);
  if (subway) {
    return /하차\s*버튼|버스\s*번호|기사님/u.test(generatedPositiveText)
      && !/하차\s*버튼|버스\s*번호|기사님/u.test(originalText);
  }
  const addedSubwayEquipment = /개찰구|스크린도어|승강장|역무원/u.test(generatedPositiveText)
    && !/개찰구|스크린도어|승강장|역무원/u.test(originalText);
  const addedSeatBelt = /안전벨트/u.test(generatedPositiveText) && !/안전벨트/u.test(originalText);
  const pressesAfterArrival = /(?:도착한|도착하고|도착한\s*(?:뒤|후)).{0,20}하차\s*버튼|하차\s*버튼.{0,20}도착한\s*(?:뒤|후)/u
    .test(generatedPositiveText);
  return addedSubwayEquipment || addedSeatBelt || pressesAfterArrival || /승차권\s*(?:찍는|기계)/u.test(generatedPositiveText);
}

// AI 문장만 서버 원본 QuestStep에 병합해 ID·순서·정답·보상 구조를 보존한다.
function validateAndMerge(step: QuestStep, output: QuestStepGenerationOutput, incident: TransportIncident): QuestStep {
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
  if (hasUnsupportedTransportFact(step, output)) throw new Error('UNSUPPORTED_TRANSPORT_FACT');
  if (output.situation.trim() === step.situation.trim()
      || !incident.situationAnchors.some((anchor) => output.situation.includes(anchor))) {
    throw new Error('INCIDENT_NOT_APPLIED');
  }
  if (!preservesCoreMeaning(
    `${step.situation} ${step.instruction}`,
    output.situation,
  )) throw new Error('SITUATION_MEANING_LOST');
  const generatedChoiceSentences = output.choices.map((choice) => choice.label.trim());
  const correctResponses = output.choices
    .filter((choice) => choice.correct)
    .map((choice) => choice.label)
    .join(' ');
  if (!incident.responseAnchors.some((anchor) => correctResponses.includes(anchor))) {
    throw new Error('INCIDENT_RESPONSE_MISSING');
  }
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
    const wronglyEndorsesUnsafeChoice = !choice.correct
      && positiveEndorsementMarkers.some((marker) => generated.label.includes(marker));
    return {
      ...choice,
      // 핵심 단어·부정 의미가 사라진 선택지는 안전한 서버 원문을 유지한다.
      label: !wronglyEndorsesUnsafeChoice && preservesCoreMeaning(choice.label, generated.label)
        ? generated.label.trim()
        : choice.label,
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
  quest: Pick<QuestDetail, 'title' | 'goal' | 'difficulty'> & Partial<Pick<QuestDetail, 'id'>>,
  step: QuestStep,
  requestId: string,
  dependency: QuestStepGenerationRuntime = runtime,
  incident: TransportIncident = transportIncidents.BUS[9],
): Promise<QuestStepGenerationResult> {
  try {
    let status = await dependency.getStatus();
    if (!status.supported) throw new Error('RUNTIME_UNAVAILABLE');
    if (status.state !== 'ready') status = await dependency.initialize();
    if (status.state !== 'ready') throw new Error('RUNTIME_ERROR');
    let retryFailureCode: string | undefined;
    let previousOutput: QuestStepGenerationOutput | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const generated = await dependency.generate({
          requestId: attempt === 0 ? requestId : `${requestId}-retry-1`,
          prompt: buildPrompt(quest, step, incident, retryFailureCode),
          // 상황 한 줄과 선택지만 생성하므로 256토큰이면 충분한 여유가 있다.
          maxTokens: 256,
          timeoutMs: 120_000,
          ...(quest.id ? {
            cloudInput: {
              questId: quest.id,
              stepId: step.id,
              incidentType: incident.id,
              ...(retryFailureCode ? { retryFailureCode } : {}),
            },
          } : {}),
        });
        const situationOnlyRetry = attempt === 1
          && previousOutput !== undefined
          && (retryFailureCode === 'INCIDENT_NOT_APPLIED' || retryFailureCode === 'SITUATION_MEANING_LOST');
        const retryBaseOutput = previousOutput;
        const output = situationOnlyRetry && retryBaseOutput
          ? applyIncidentTemplate({
            ...retryBaseOutput,
            situation: parseSituationOutput(generated.text),
          }, incident, step)
          : applyIncidentTemplate(parseOutput(generated.text, step), incident, step);
        previousOutput = output;
        return {
          step: validateAndMerge(step, output, incident),
          source: 'ai',
          requestId,
          failureCode: null,
        };
      } catch (error) {
        retryFailureCode = error instanceof Error ? error.message : 'RUNTIME_ERROR';
        const retryable = !['CANCELLED', 'RUNTIME_ERROR', 'RUNTIME_UNAVAILABLE'].includes(retryFailureCode);
        if (attempt === 1 || !retryable) throw error;
      }
    }
    throw new Error(retryFailureCode ?? 'RUNTIME_ERROR');
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
  applyIncidentTemplate,
  buildPrompt,
  hasUnsupportedTransportFact,
  parseOutput,
  preservesCoreMeaning,
  validateAndMerge,
};
