jest.mock('oneuldo-mnn-runtime', () => ({
  __esModule: true,
  default: null,
}));

import {
  NativeRuntimeError,
  queryNativeGenerationCancellation,
  queryNativeModelInitialization,
  queryNativeModelPreparation,
  queryNativeModelRelease,
  queryNativeRuntimeStatus,
  queryNativeTextGeneration,
} from '../src/ai/nativeRuntime';

const createNativeModule = () => ({
  getRuntimeStatus: jest.fn(),
  prepareModel: jest.fn(),
  initializeModel: jest.fn(),
  reserveGeneration: jest.fn(),
  generateText: jest.fn(),
  cancelGeneration: jest.fn(),
  releaseModel: jest.fn(),
});

describe('native runtime adapter', () => {
  it('returns unsupported without throwing when the native module is absent', async () => {
    await expect(queryNativeRuntimeStatus(null, 'android')).resolves.toEqual({
      supported: false,
      platform: 'unsupported',
      state: 'unsupported',
      runtimeVersion: null,
      abi: null,
      modelPath: null,
      initializationMs: null,
      alreadyInitialized: false,
      activeRequestId: null,
      errorCode: 'UNSUPPORTED',
      errorMessage: null,
    });
  });

  it('returns unsupported on a non-Android platform', async () => {
    const nativeModule = createNativeModule();

    await expect(
      queryNativeRuntimeStatus(nativeModule, 'web'),
    ).resolves.toMatchObject({ supported: false, state: 'unsupported' });
    expect(nativeModule.getRuntimeStatus).not.toHaveBeenCalled();
  });

  it('calls the Android native module asynchronously', async () => {
    const expected = {
      supported: true,
      platform: 'android' as const,
      state: 'uninitialized' as const,
      runtimeVersion: '3.6.1',
      abi: 'x86_64',
      modelPath: null,
      initializationMs: null,
      alreadyInitialized: false,
      errorCode: null,
      errorMessage: null,
    };
    const nativeModule = createNativeModule();
    nativeModule.getRuntimeStatus.mockResolvedValue(expected);

    await expect(
      queryNativeRuntimeStatus(nativeModule, 'android'),
    ).resolves.toEqual(expected);
    expect(nativeModule.getRuntimeStatus).toHaveBeenCalledTimes(1);
  });

  it('returns unsupported model preparation without a native module', async () => {
    await expect(queryNativeModelPreparation(null, 'android')).resolves.toMatchObject({
      supported: false,
      ready: false,
      modelPath: null,
    });
  });

  it('calls native model preparation on Android', async () => {
    const expected = {
      supported: true as const,
      ready: true as const,
      modelPath: '/data/user/0/com.oneuldo.app/no_backup/models/qwen3.5-0.8b-mnn',
      revision: '3208b55b2e3c948016c9d380a697be881a1f12f8',
      fileCount: 6,
      totalBytes: 484349697,
      reused: false,
    };
    const nativeModule = createNativeModule();
    nativeModule.prepareModel.mockResolvedValue(expected);

    await expect(
      queryNativeModelPreparation(nativeModule, 'android'),
    ).resolves.toEqual(expected);
    expect(nativeModule.prepareModel).toHaveBeenCalledTimes(1);
  });

  it('returns unsupported initialization without a native module', async () => {
    await expect(queryNativeModelInitialization(null, 'android')).resolves.toMatchObject({
      supported: false,
      state: 'unsupported',
      errorCode: 'UNSUPPORTED',
    });
  });

  it('calls native model initialization on Android', async () => {
    const expected = {
      supported: true,
      platform: 'android' as const,
      state: 'ready' as const,
      runtimeVersion: '3.6.1',
      abi: 'x86_64',
      modelPath: '/data/user/0/com.oneuldo.app/no_backup/models/qwen3.5-0.8b-mnn',
      initializationMs: 1820,
      alreadyInitialized: false,
      errorCode: null,
      errorMessage: null,
    };
    const nativeModule = createNativeModule();
    nativeModule.initializeModel.mockResolvedValue(expected);

    await expect(
      queryNativeModelInitialization(nativeModule, 'android'),
    ).resolves.toEqual(expected);
    expect(nativeModule.initializeModel).toHaveBeenCalledTimes(1);
  });

  it('rejects text generation when the native module is unavailable', async () => {
    await expect(
      queryNativeTextGeneration(null, 'web', {
        requestId: 'ko-unsupported',
        prompt: '안녕하세요',
        maxTokens: 16,
        timeoutMs: 30_000,
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  });

  it('passes a Korean generation request to the Android module', async () => {
    const nativeModule = createNativeModule();
    const expected = {
      requestId: 'ko-001',
      text: '오늘도 천천히 시작해 봐요.',
      latencyMs: 4200,
    };
    nativeModule.generateText.mockResolvedValue(expected);

    await expect(
      queryNativeTextGeneration(nativeModule, 'android', {
        requestId: 'ko-001',
        prompt: '짧은 응원 문장을 만들어 줘.',
        maxTokens: 32,
        timeoutMs: 30_000,
      }),
    ).resolves.toEqual(expected);
    expect(nativeModule.generateText).toHaveBeenCalledWith(
      'ko-001',
      '짧은 응원 문장을 만들어 줘.',
      32,
      30_000,
    );
    expect(nativeModule.reserveGeneration).toHaveBeenCalledWith(
      'ko-001',
      '짧은 응원 문장을 만들어 줘.',
      32,
      30_000,
    );
  });

  it('normalizes a native busy error into the public error contract', async () => {
    const nativeModule = createNativeModule();
    nativeModule.reserveGeneration.mockImplementation(() => {
      throw Object.assign(new Error('다른 요청이 실행 중입니다.'), { code: 'BUSY' });
    });
    nativeModule.generateText.mockRejectedValue(
      Object.assign(new Error('다른 요청이 실행 중입니다.'), { code: 'BUSY' }),
    );

    await expect(
      queryNativeTextGeneration(nativeModule, 'android', {
        requestId: 'busy-002',
        prompt: '동시에 실행해 줘.',
        maxTokens: 32,
        timeoutMs: 30_000,
      }),
    ).rejects.toMatchObject({ name: 'NativeRuntimeError', code: 'BUSY' });
  });

  it('sends cancellation through the synchronous native flag API', async () => {
    const nativeModule = createNativeModule();
    nativeModule.cancelGeneration.mockReturnValue({ requestId: 'cancel-001', cancelled: true });

    await expect(
      queryNativeGenerationCancellation(nativeModule, 'android', 'cancel-001'),
    ).resolves.toEqual({ requestId: 'cancel-001', cancelled: true });
    expect(nativeModule.cancelGeneration).toHaveBeenCalledWith('cancel-001');
  });

  it('releases the Android model and rejects unsupported release', async () => {
    const nativeModule = createNativeModule();
    nativeModule.releaseModel.mockResolvedValue({ released: true });

    await expect(queryNativeModelRelease(nativeModule, 'android')).resolves.toEqual({
      released: true,
    });
    await expect(queryNativeModelRelease(null, 'web')).rejects.toEqual(
      expect.objectContaining<Partial<NativeRuntimeError>>({ code: 'UNSUPPORTED' }),
    );
  });
});
