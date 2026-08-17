import type { QuestDetail, QuestStep } from '../src/api/quest';
import {
  buildQuestVariationPrompt,
  generateQuestVariation,
  mergeQuestVariation,
  parseQuestVariationOutput,
  QuestVariationInputError,
  QuestVariationParseError,
  selectQuestVariationInput,
  validateQuestVariation,
  type QuestVariationRuntime,
} from '../src/ai';
import type { NativeRuntimeStatus } from '../src/ai/nativeRuntime.types';

const step: QuestStep = {
  id: 'step-secret-id',
  stepOrder: 1,
  instruction: '목적지로 가는 버스 번호를 확인해 보세요.',
  situation: '여러 대의 버스가 정류장에 도착했어요.',
  hint: '안내판을 확인해요.',
  choices: [
    { id: 'choice-secret-id', choiceOrder: 1, label: '12번 버스', correct: true, feedback: '맞아요.' },
    { id: 'wrong-secret-id', choiceOrder: 2, label: '25번 버스', correct: false, feedback: '다시 봐요.' },
  ],
};

const quest = {
  title: '혼자 버스 타기',
  goal: '목적지로 가는 버스를 구분한다.',
} satisfies Pick<QuestDetail, 'title' | 'goal'>;

const readyStatus: NativeRuntimeStatus = {
  supported: true,
  platform: 'android',
  state: 'ready',
  runtimeVersion: 'llama.cpp-b10455',
  abi: 'arm64-v8a',
  modelPath: '/private/model.gguf',
  initializationMs: 100,
  alreadyInitialized: false,
  activeRequestId: null,
  errorCode: null,
  errorMessage: null,
};

function createRuntime(overrides: Partial<QuestVariationRuntime> = {}): QuestVariationRuntime {
  return {
    getStatus: jest.fn(async () => readyStatus),
    initialize: jest.fn(async () => readyStatus),
    generate: jest.fn(async () => ({
      requestId: 'phase3-test',
      text: '{"situation":"버스들이 정류장으로 들어오고 있어요.","instruction":"목적지 버스 번호를 차분히 확인해 보세요."}',
      latencyMs: 500,
    })),
    ...overrides,
  };
}

describe('quest variation input selector', () => {
  it('selects only approved public text fields', () => {
    const input = selectQuestVariationInput(quest, step);
    expect(input).toEqual({
      schemaVersion: 'quest-variation-input-v1',
      theme: quest.title,
      objective: quest.goal,
      originalSituation: step.situation,
      originalInstruction: step.instruction,
    });
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain(step.id);
    expect(serialized).not.toContain(step.choices[0].id);
    expect(serialized).not.toContain('correct');
    expect(serialized).not.toContain('reward');
  });

  it('rejects sensitive text instead of sending it to the model', () => {
    expect(() => selectQuestVariationInput(
      { ...quest, goal: '보호자 test@example.com에게 연락한다.' },
      step,
    )).toThrow(QuestVariationInputError);
  });
});

describe('quest variation prompt and parser', () => {
  const input = selectQuestVariationInput(quest, step);

  it('asks for exactly two JSON fields without protected quest data', () => {
    const prompt = buildQuestVariationPrompt(input);
    expect(prompt).toContain('situation과 instruction 두 개뿐');
    expect(prompt).toContain(quest.goal);
    expect(prompt).not.toContain(step.id);
    expect(prompt).not.toContain(step.choices[0].id);
  });

  it.each([
    '{"situation":"버스가 왔어요.","instruction":"번호를 확인해 보세요."}',
    '결과입니다.\n```json\n{"situation":"버스가 왔어요.","instruction":"번호를 확인해 보세요."}\n```',
  ])('parses a JSON object from model text', (text) => {
    expect(parseQuestVariationOutput(text)).toEqual({
      situation: '버스가 왔어요.',
      instruction: '번호를 확인해 보세요.',
    });
  });

  it.each([
    '',
    '{"situation":"잘린 JSON",',
    '{"situation":"버스가 왔어요.","instruction":"확인해요.","correctChoiceId":"changed"}',
    '[{"situation":"버스","instruction":"확인"}]',
  ])('rejects malformed or expanded output', (text) => {
    expect(() => parseQuestVariationOutput(text)).toThrow(QuestVariationParseError);
  });
});

describe('quest variation policy and merge', () => {
  const input = selectQuestVariationInput(quest, step);

  it('accepts a short, safe variation', () => {
    expect(validateQuestVariation(input, {
      situation: '버스들이 정류장으로 들어오고 있어요.',
      instruction: '목적지 버스 번호를 차분히 확인해 보세요.',
    })).toMatchObject({ accepted: true });
  });

  it.each([
    { situation: '버스가 왔어요.', instruction: '99번 버스를 타세요.' },
    { situation: '버스가 왔어요.', instruction: '틀리면 혼나니 빨리 고르세요.' },
    { situation: '버스가 왔어요. 사람들이 기다려요.', instruction: '번호를 확인해요.' },
    { situation: '버스가 '.repeat(30), instruction: '번호를 확인해요.' },
  ])('rejects unsafe or out-of-scope text', (output) => {
    expect(validateQuestVariation(input, output)).toMatchObject({ accepted: false });
  });

  it('changes only situation and instruction when merging', () => {
    const merged = mergeQuestVariation(step, {
      situation: '새 상황이에요.',
      instruction: '새 안내를 확인해요.',
    });
    expect(merged).toMatchObject({
      id: step.id,
      stepOrder: step.stepOrder,
      hint: step.hint,
      situation: '새 상황이에요.',
      instruction: '새 안내를 확인해요.',
    });
    expect(merged.choices).toBe(step.choices);
  });
});

describe('quest variation orchestrator', () => {
  it('returns a validated AI variation and metadata', async () => {
    const runtime = createRuntime();
    const diagnostic = jest.fn();
    const times = [1_000, 1_700];
    const result = await generateQuestVariation(
      { quest, step, requestId: 'phase3-test' },
      { runtime, now: () => times.shift() ?? 1_700, onDiagnostic: diagnostic },
    );

    expect(result.source).toBe('ai');
    expect(result.metadata).toMatchObject({
      requestId: 'phase3-test',
      modelVersion: 'llama.cpp-b10455',
      latencyMs: 700,
      fallbackUsed: false,
      failureCode: null,
    });
    expect(result.step.id).toBe(step.id);
    expect(result.step.choices).toBe(step.choices);
    const nativeRequest = (runtime.generate as jest.Mock).mock.calls[0][0];
    expect(nativeRequest.prompt).not.toContain(step.id);
    expect(nativeRequest.prompt).not.toContain(step.choices[0].id);
    expect(nativeRequest.prompt).not.toContain(step.choices[0].label);
    expect(diagnostic).toHaveBeenCalledWith(result.metadata);
    expect(Object.keys(diagnostic.mock.calls[0][0])).not.toContain('prompt');
  });

  it('initializes the runtime when it is not ready', async () => {
    const runtime = createRuntime({
      getStatus: jest.fn(async (): Promise<NativeRuntimeStatus> => ({ ...readyStatus, state: 'uninitialized' })),
    });
    const result = await generateQuestVariation({ quest, step }, { runtime });
    expect(runtime.initialize).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('ai');
  });

  it.each([
    ['runtime unavailable', createRuntime({ getStatus: jest.fn(async (): Promise<NativeRuntimeStatus> => ({ ...readyStatus, supported: false, state: 'unsupported' })) })],
    ['invalid JSON', createRuntime({ generate: jest.fn(async () => ({ requestId: 'x', text: 'not json', latencyMs: 1 })) })],
    ['policy rejection', createRuntime({ generate: jest.fn(async () => ({ requestId: 'x', text: '{"situation":"버스가 왔어요.","instruction":"99번을 타세요."}', latencyMs: 1 })) })],
    ['runtime timeout', createRuntime({ generate: jest.fn(async () => { throw Object.assign(new Error('timeout'), { code: 'TIMEOUT' }); }) })],
  ])('uses the untouched original step on %s', async (_name, runtime) => {
    const result = await generateQuestVariation({ quest, step }, { runtime });
    expect(result.source).toBe('original');
    expect(result.metadata.fallbackUsed).toBe(true);
    expect(result.metadata.failureCode).not.toBeNull();
    expect(result.step).toEqual(step);
  });
});
