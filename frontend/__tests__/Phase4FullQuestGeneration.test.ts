import type { QuestDetail, QuestStep } from '../src/api/quest';
import {
  generateFullQuestStep,
  questStepGeneratorTestables,
  type QuestStepGenerationRuntime,
} from '../src/ai/questStepGenerator';
import type { NativeRuntimeStatus } from '../src/ai/nativeRuntime.types';

const step: QuestStep = {
  id: 'step-2',
  stepOrder: 2,
  instruction: '도착한 버스가 탈 버스인지 확인하세요.',
  situation: '정류장에 버스 한 대가 도착했습니다.',
  hint: '버스 앞 번호를 확인해요.',
  choices: [
    { id: 'correct-id', choiceOrder: 1, label: '버스 번호를 비교한다.', correct: true, feedback: '맞아요.' },
    { id: 'wrong-id', choiceOrder: 2, label: '확인하지 않고 바로 탄다.', correct: false, feedback: '번호부터 확인해요.' },
  ],
};

const quest = {
  difficulty: 'EASY',
  title: '혼자 버스 타기',
  goal: '목적지로 가는 버스를 구분한다.',
} satisfies Pick<QuestDetail, 'title' | 'goal' | 'difficulty'>;

const ready: NativeRuntimeStatus = {
  supported: true,
  platform: 'android',
  state: 'ready',
  runtimeVersion: 'llama.cpp-test',
  abi: 'x86_64',
  modelPath: '/model.gguf',
  initializationMs: 1,
  alreadyInitialized: true,
  activeRequestId: null,
  errorCode: null,
  errorMessage: null,
};

const validText = [
  '비가 살짝 오는 날, 정류장 앞에 기다리던 버스가 멈췄어요.',
  '안내판과 버스 번호를 서로 비교해요.',
  '확인하지 않고 곧바로 올라타요.',
].join('\n');

function createRuntime(text = validText): QuestStepGenerationRuntime {
  return {
    getStatus: jest.fn(async () => ready),
    initialize: jest.fn(async () => ready),
    generate: jest.fn(async () => ({ requestId: 'full-step-test', text, latencyMs: 100 })),
  };
}

describe('Phase 4 전체 단계 생성', () => {
  it('지시에 맞는 상황·선택지만 줄 단위 생성 대상으로 보낸다', () => {
    const prompt = questStepGeneratorTestables.buildPrompt(quest, step, '비가 살짝 오는 날');
    expect(prompt).toContain(step.situation);
    expect(prompt).toContain(step.instruction);
    expect(prompt).toContain(step.choices[0].label);
    expect(prompt.split('\n')).toHaveLength(6);
    expect(prompt).toContain('선택지 2문장');
    expect(prompt).toContain('정확히 3줄만 출력하세요');
    expect(prompt).toContain('JSON·키·번호');
    expect(prompt).not.toContain(step.hint);
    expect(prompt).not.toContain(step.id);
    expect(prompt).not.toContain(step.choices[0].id);
  });

  it('상황·선택지만 바꾸고 지시·힌트·ID·순서·정답 여부는 원본에서 복원한다', async () => {
    const runtime = createRuntime();
    const result = await generateFullQuestStep(quest, step, 'full-step-test', runtime);

    expect(result.source).toBe('ai');
    expect(runtime.generate).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 256 }));
    expect(result.step.situation).not.toBe(step.situation);
    expect(result.step.instruction).toBe(step.instruction);
    expect(result.step.hint).toBe(step.hint);
    expect(result.step.id).toBe(step.id);
    expect(result.step.stepOrder).toBe(step.stepOrder);
    expect(result.step.choices.map(({ id, choiceOrder, correct }) => ({ id, choiceOrder, correct }))).toEqual(
      step.choices.map(({ id, choiceOrder, correct }) => ({ id, choiceOrder, correct })),
    );
    expect(result.step.choices[0].label).not.toBe(step.choices[0].label);
  });

  it('선택지 개수가 달라지면 단계 전체를 원문으로 되돌린다', async () => {
    const runtime = createRuntime('비가 살짝 오는 날, 버스가 도착했어요.\n한 개뿐인 선택지예요.');
    const result = await generateFullQuestStep(quest, step, 'bad-count', runtime);

    expect(result.source).toBe('original');
    expect(result.failureCode).toBe('CHOICE_COUNT_CHANGED');
    expect(result.step).toBe(step);
    expect(runtime.generate).toHaveBeenCalledTimes(2);
    expect(runtime.generate).toHaveBeenLastCalledWith(expect.objectContaining({
      requestId: 'bad-count-retry-1',
      prompt: expect.stringContaining('이전 출력 실패(CHOICE_COUNT_CHANGED)'),
    }));
  });

  it('원문에 없던 숫자가 추가되면 원문으로 되돌린다', async () => {
    const invalid = validText.replace('확인하지 않고 곧바로 올라타요.', '99번 버스에 올라타요.');
    const result = await generateFullQuestStep(quest, step, 'bad-number', createRuntime(invalid));

    expect(result.source).toBe('original');
    expect(result.failureCode).toBe('NEW_NUMBER_ADDED');
    expect(result.step).toBe(step);
  });

  it('첫 생성이 실패해도 두 번째 생성이 안전하면 채택한다', async () => {
    const runtime = createRuntime();
    jest.mocked(runtime.generate)
      .mockResolvedValueOnce({ requestId: 'retry-success', text: '한 줄뿐이에요.', latencyMs: 10 })
      .mockResolvedValueOnce({ requestId: 'retry-success-retry-1', text: validText, latencyMs: 10 });
    const result = await generateFullQuestStep(quest, step, 'retry-success', runtime);

    expect(result.source).toBe('ai');
    expect(result.failureCode).toBeNull();
    expect(runtime.generate).toHaveBeenCalledTimes(2);
  });

  it('안전한 원문 선택지를 유지해도 승인된 상황 변형은 채택한다', async () => {
    const copied = validText.replace('안내판과 버스 번호를 서로 비교해요.', step.choices[0].label);
    const result = await generateFullQuestStep(quest, step, 'copied-field', createRuntime(copied));

    expect(result.source).toBe('ai');
    expect(result.step.choices[0].label).toBe(step.choices[0].label);
    expect(result.step.situation).toBe('비가 살짝 오는 날, 정류장 앞에 기다리던 버스가 멈췄어요.');
  });

  it('모델이 원문 상황을 복사하면 단계 전체를 원문으로 복구한다', async () => {
    const copied = validText.replace('비가 살짝 오는 날, 정류장 앞에 기다리던 버스가 멈췄어요.', step.situation);
    const result = await generateFullQuestStep(quest, step, 'theme-prefix', createRuntime(copied));

    expect(result.source).toBe('original');
    expect(result.failureCode).toBe('THEME_NOT_APPLIED');
    expect(result.step).toBe(step);
  });

  it('테마 이름만 있고 지시를 수행할 사건이 없는 상황은 재시도 후 거절한다', async () => {
    const themeOnly = validText.replace(
      '비가 살짝 오는 날, 정류장 앞에 기다리던 버스가 멈췄어요.',
      '비가 살짝 오는 날',
    );
    const runtime = createRuntime(themeOnly);
    const result = await generateFullQuestStep(quest, step, 'theme-only', runtime);

    expect(result.source).toBe('original');
    expect(result.failureCode).toBe('SITUATION_MEANING_LOST');
    expect(runtime.generate).toHaveBeenCalledTimes(2);
    expect(runtime.generate).toHaveBeenLastCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('구체적인 상황 한 문장만'),
    }));
  });

  it('동일한 선택지 묶음을 반복한 출력은 한 묶음으로 안전하게 정리한다', async () => {
    const [situation, ...choices] = validText.split('\n');
    const repeated = [situation, ...choices, ...choices, ...choices].join('\n');
    const result = await generateFullQuestStep(quest, step, 'repeated-block', createRuntime(repeated));

    expect(result.source).toBe('ai');
    expect(result.step.choices).toHaveLength(step.choices.length);
    expect(result.step.choices[0].label).toBe('안내판과 버스 번호를 서로 비교해요.');
  });

  it('테마와 실제 상황을 두 줄로 출력하면 한 상황 문장으로 복원한다', async () => {
    const splitSituation = [
      '비가 살짝 오는 날',
      '정류장 앞에 기다리던 버스가 멈췄어요.',
      '안내판과 버스 번호를 서로 비교해요.',
      '확인하지 않고 곧바로 올라타요.',
    ].join('\n');
    const result = await generateFullQuestStep(quest, step, 'split-situation', createRuntime(splitSituation));

    expect(result.source).toBe('ai');
    expect(result.step.situation).toBe('비가 살짝 오는 날, 정류장 앞에 기다리던 버스가 멈췄어요.');
    expect(result.step.choices).toHaveLength(2);
  });

  it('테마 뒤의 상황 설명이 여러 줄이어도 마지막 N줄을 선택지로 복원한다', async () => {
    const multiLineSituation = [
      '비가 살짝 오는 날',
      '어린이가 정류장에 도착했어요.',
      '기다리던 버스가 정류장 앞에 멈췄어요.',
      '안내판과 버스 번호를 서로 비교해요.',
      '확인하지 않고 곧바로 올라타요.',
    ].join('\n');
    const result = await generateFullQuestStep(quest, step, 'multi-line-situation', createRuntime(multiLineSituation));

    expect(result.source).toBe('ai');
    expect(result.step.situation).toContain('어린이가 정류장에 도착했어요.');
    expect(result.step.situation).toContain('기다리던 버스가 정류장 앞에 멈췄어요.');
    expect(result.step.choices[0].label).toBe('안내판과 버스 번호를 서로 비교해요.');
  });

  it('오답을 좋은 행동처럼 표현하면 해당 선택지만 원문으로 복구한다', async () => {
    const endorsedWrongChoice = validText.replace(
      '확인하지 않고 곧바로 올라타요.',
      '확인하지 않고 바로 타는 것이 더 편하고 좋아요.',
    );
    const result = await generateFullQuestStep(quest, step, 'endorsed-wrong-choice', createRuntime(endorsedWrongChoice));

    expect(result.source).toBe('ai');
    expect(result.step.choices[1].label).toBe(step.choices[1].label);
  });

  it('핵심 행동이 사라진 안내와 선택지는 해당 필드만 원문으로 복구한다', async () => {
    const invalidChoice = validText.replace('안내판과 버스 번호를 서로 비교해요.', '그냥 해요.');
    const result = await generateFullQuestStep(quest, step, 'meaning-lost', createRuntime(invalidChoice));

    expect(result.source).toBe('ai');
    expect(result.step.instruction).toBe(step.instruction);
    expect(result.step.choices[0].label).toBe(step.choices[0].label);
    expect(result.step.situation).toBe('비가 살짝 오는 날, 정류장 앞에 기다리던 버스가 멈췄어요.');
  });

  it('선택지를 지시문과 같게 만들면 단계 전체를 원문으로 복구한다', async () => {
    const collision = validText.replace('안내판과 버스 번호를 서로 비교해요.', step.instruction);
    const result = await generateFullQuestStep(quest, step, 'choice-role-copy', createRuntime(collision));

    expect(result.source).toBe('original');
    expect(result.failureCode).toBe('FIELD_ROLE_COLLISION');
    expect(result.step).toBe(step);
  });

  it('원문과 부정 의미가 달라진 선택지는 원문으로 복구한다', () => {
    expect(questStepGeneratorTestables.preservesCoreMeaning(
      '버스 번호를 확인한다.',
      '버스 번호를 확인하지 않아요.',
    )).toBe(false);
  });

  it('한국어 사이에 영어가 섞이면 해당 필드를 안전한 한국어로 복구한다', async () => {
    const english = [
      'Rain 오는 정류장에 버스가 도착했어요.',
      'Check하고 타요.',
      '확인하지 않고 곧바로 올라타요.',
    ].join('\n');
    const result = await generateFullQuestStep(quest, step, 'english-block', createRuntime(english));

    expect(result.source).toBe('original');
    expect(result.failureCode).toBe('THEME_NOT_APPLIED');
    expect(result.step.situation).toBe(step.situation);
    expect(result.step.instruction).toBe(step.instruction);
    expect(result.step.hint).toBe(step.hint);
    expect(result.step.choices[0].label).toBe(step.choices[0].label);
    const visibleText = [
      result.step.situation,
      result.step.instruction,
      result.step.hint ?? '',
      ...result.step.choices.flatMap((choice) => [choice.label, choice.feedback]),
    ].join(' ');
    expect(visibleText).not.toMatch(/[A-Za-z]/);
  });
});
