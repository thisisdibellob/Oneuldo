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

const validText = JSON.stringify({
  situation: '비가 오는 정류장 앞에 기다리던 버스가 멈췄어요.',
  instruction: '타려는 버스가 맞는지 앞쪽을 살펴보세요.',
  hint: '앞에 표시된 번호를 살펴봐요.',
  choices: [
    { label: '안내판과 버스 번호를 서로 비교해요.', correct: true },
    { label: '확인하지 않고 곧바로 올라타요.', correct: false },
  ],
});

function createRuntime(text = validText): QuestStepGenerationRuntime {
  return {
    getStatus: jest.fn(async () => ready),
    initialize: jest.fn(async () => ready),
    generate: jest.fn(async () => ({ requestId: 'full-step-test', text, latencyMs: 100 })),
  };
}

describe('Phase 4 전체 단계 생성', () => {
  it('상황·지시·힌트·선택지를 생성 대상으로 보낸다', () => {
    const prompt = questStepGeneratorTestables.buildPrompt(quest, step, '비가 살짝 오는 날');
    expect(prompt).toContain(step.situation);
    expect(prompt).toContain(step.hint);
    expect(prompt).toContain(step.choices[0].label);
    expect(prompt.split('\n')).toHaveLength(6);
    expect(prompt).toContain('Output Korean text only');
    expect(prompt).toContain('Never copy an answer choice into s, i, or h');
    expect(prompt).toContain('"h":"..."');
    expect(prompt).toContain('"r":true},{"l":"...","r":false');
    expect(prompt).not.toContain(step.id);
    expect(prompt).not.toContain(step.choices[0].id);
  });

  it('문장은 바꾸지만 ID·순서·정답 여부는 유지한다', async () => {
    const runtime = createRuntime();
    const result = await generateFullQuestStep(quest, step, 'full-step-test', runtime);

    expect(result.source).toBe('ai');
    expect(runtime.generate).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 1024 }));
    expect(result.step.situation).not.toBe(step.situation);
    expect(result.step.instruction).not.toBe(step.instruction);
    expect(result.step.hint).not.toBe(step.hint);
    expect(result.step.id).toBe(step.id);
    expect(result.step.stepOrder).toBe(step.stepOrder);
    expect(result.step.choices.map(({ id, choiceOrder, correct }) => ({ id, choiceOrder, correct }))).toEqual(
      step.choices.map(({ id, choiceOrder, correct }) => ({ id, choiceOrder, correct })),
    );
    expect(result.step.choices[0].label).not.toBe(step.choices[0].label);
  });

  it('선택지 개수가 달라지면 단계 전체를 원문으로 되돌린다', async () => {
    const invalid = JSON.stringify({
      ...JSON.parse(validText),
      choices: [{ label: '한 개뿐인 선택지예요.', correct: true }],
    });
    const result = await generateFullQuestStep(quest, step, 'bad-count', createRuntime(invalid));

    expect(result.source).toBe('original');
    expect(result.failureCode).toBe('CHOICE_COUNT_CHANGED');
    expect(result.step).toBe(step);
  });

  it('원문에 없던 숫자가 추가되면 원문으로 되돌린다', async () => {
    const parsed = JSON.parse(validText);
    parsed.choices[1].label = '99번 버스에 올라타요.';
    const result = await generateFullQuestStep(quest, step, 'bad-number', createRuntime(JSON.stringify(parsed)));

    expect(result.source).toBe('original');
    expect(result.failureCode).toBe('NEW_NUMBER_ADDED');
    expect(result.step).toBe(step);
  });

  it('AI가 정답 여부를 바꾸면 단계 전체를 원문으로 되돌린다', async () => {
    const parsed = JSON.parse(validText);
    parsed.choices[0].correct = false;
    const result = await generateFullQuestStep(quest, step, 'bad-answer', createRuntime(JSON.stringify(parsed)));

    expect(result.source).toBe('original');
    expect(result.failureCode).toBe('CORRECTNESS_CHANGED');
    expect(result.step).toBe(step);
  });

  it('안전한 원문 선택지를 유지해도 승인된 상황 변형은 채택한다', async () => {
    const parsed = JSON.parse(validText);
    parsed.choices[0].label = step.choices[0].label;
    const result = await generateFullQuestStep(quest, step, 'copied-field', createRuntime(JSON.stringify(parsed)));

    expect(result.source).toBe('ai');
    expect(result.step.choices[0].label).toBe(step.choices[0].label);
    expect(result.step.situation).toBe('비가 오는 정류장 앞에 기다리던 버스가 멈췄어요.');
  });

  it('모델이 원문 상황을 복사하면 단계 전체를 원문으로 복구한다', async () => {
    const parsed = JSON.parse(validText);
    parsed.situation = step.situation;
    const result = await generateFullQuestStep(quest, step, 'theme-prefix', createRuntime(JSON.stringify(parsed)));

    expect(result.source).toBe('original');
    expect(result.failureCode).toBe('THEME_NOT_APPLIED');
    expect(result.step).toBe(step);
  });

  it('핵심 행동이 사라진 안내와 선택지는 해당 필드만 원문으로 복구한다', async () => {
    const parsed = JSON.parse(validText);
    parsed.instruction = '해 보세요.';
    parsed.choices[0].label = '그냥 해요.';
    const result = await generateFullQuestStep(quest, step, 'meaning-lost', createRuntime(JSON.stringify(parsed)));

    expect(result.source).toBe('ai');
    expect(result.step.instruction).toBe(step.instruction);
    expect(result.step.choices[0].label).toBe(step.choices[0].label);
    expect(result.step.situation).toBe('비가 오는 정류장 앞에 기다리던 버스가 멈췄어요.');
  });

  it('정답 선택지를 지시와 힌트에 복사하면 단계 전체를 원문으로 복구한다', async () => {
    const parsed = JSON.parse(validText);
    parsed.instruction = parsed.choices[0].label;
    parsed.hint = parsed.choices[0].label;
    const result = await generateFullQuestStep(quest, step, 'choice-role-copy', createRuntime(JSON.stringify(parsed)));

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
    const parsed = JSON.parse(validText);
    parsed.situation = 'Rain 오는 정류장에 버스가 도착했어요.';
    parsed.instruction = '버스 Number를 Check해 보세요.';
    parsed.hint = '앞쪽 Number를 봐요.';
    parsed.choices[0].label = 'Check하고 타요.';
    const result = await generateFullQuestStep(quest, step, 'english-block', createRuntime(JSON.stringify(parsed)));

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
