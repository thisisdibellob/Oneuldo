import { generateCloudQuestText } from '../src/api/cloudQuestGeneration';
import { createCloudFirstQuestRuntime } from '../src/ai/cloudFirstQuestRuntime';
import {
  generateNativeText,
  getNativeRuntimeStatus,
  initializeNativeModel,
} from '../src/ai/nativeRuntime';

jest.mock('../src/api/cloudQuestGeneration', () => ({
  generateCloudQuestText: jest.fn(),
}));

jest.mock('../src/ai/nativeRuntime', () => ({
  generateNativeText: jest.fn(),
  getNativeRuntimeStatus: jest.fn(),
  initializeNativeModel: jest.fn(),
}));

const request = {
  requestId: 'cloud-request',
  prompt: 'local prompt',
  maxTokens: 256,
  timeoutMs: 120_000,
  cloudInput: {
    questId: 'quest-id',
    stepId: 'step-id',
    incidentType: 'BUS_WEATHER_VISIBILITY',
  },
};

const nativeReady = {
  supported: true as const,
  platform: 'android' as const,
  state: 'ready' as const,
  runtimeVersion: 'native',
  abi: 'x86_64',
  modelPath: '/model.gguf',
  initializationMs: 1,
  alreadyInitialized: true,
  activeRequestId: null,
  errorCode: null,
  errorMessage: null,
};

describe('클라우드 우선 퀘스트 런타임', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Groq 성공 시 온디바이스 모델을 준비하지 않는다', async () => {
    jest.mocked(generateCloudQuestText).mockResolvedValue({
      requestId: request.requestId,
      text: '클라우드 결과',
      model: 'qwen/qwen3.6-27b',
      latencyMs: 120,
    });

    const runtime = createCloudFirstQuestRuntime('access-token');
    const result = await runtime.generate(request);

    expect(result.text).toBe('클라우드 결과');
    expect(generateCloudQuestText).toHaveBeenCalledWith('access-token', {
      ...request.cloudInput,
      requestId: request.requestId,
    });
    expect(getNativeRuntimeStatus).not.toHaveBeenCalled();
    expect(initializeNativeModel).not.toHaveBeenCalled();
  });

  it('Groq 실패 시 준비된 온디바이스 모델로 자동 전환한다', async () => {
    jest.mocked(generateCloudQuestText).mockRejectedValue(new Error('429'));
    jest.mocked(getNativeRuntimeStatus).mockResolvedValue(nativeReady);
    jest.mocked(generateNativeText).mockResolvedValue({
      requestId: request.requestId,
      text: '기기 결과',
      latencyMs: 500,
    });

    const runtime = createCloudFirstQuestRuntime('access-token');
    const result = await runtime.generate(request);

    expect(result.text).toBe('기기 결과');
    expect(generateNativeText).toHaveBeenCalledWith(request);
    expect(initializeNativeModel).not.toHaveBeenCalled();
  });

  it('기기 모델이 준비되지 않았으면 초기화한 뒤 fallback한다', async () => {
    jest.mocked(generateCloudQuestText).mockRejectedValue(new Error('network'));
    jest.mocked(getNativeRuntimeStatus).mockResolvedValue({ ...nativeReady, state: 'uninitialized' });
    jest.mocked(initializeNativeModel).mockResolvedValue(nativeReady);
    jest.mocked(generateNativeText).mockResolvedValue({
      requestId: request.requestId,
      text: '초기화 후 결과',
      latencyMs: 500,
    });

    const runtime = createCloudFirstQuestRuntime('access-token');
    const result = await runtime.generate(request);

    expect(result.text).toBe('초기화 후 결과');
    expect(initializeNativeModel).toHaveBeenCalledTimes(1);
  });
});
