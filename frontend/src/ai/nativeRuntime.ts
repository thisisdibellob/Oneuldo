import { Platform } from 'react-native';
import OneuldoLlamaRuntimeModule from 'oneuldo-llama-runtime';

import type {
  CancellationResult,
  GenerateRequest,
  GenerateResult,
  ModelPreparationResult,
  NativeRuntimeModule,
  NativeRuntimePlatform,
  NativeRuntimeStatus,
  ReleaseResult,
  RuntimeErrorCode,
} from './nativeRuntime.types';

const runtimeErrorCodes = new Set<RuntimeErrorCode>([
  'UNSUPPORTED',
  'MODEL_MISSING',
  'MODEL_CORRUPTED',
  'NETWORK_UNAVAILABLE',
  'MODEL_DOWNLOAD_FAILED',
  'INSUFFICIENT_STORAGE',
  'INITIALIZATION_FAILED',
  'NOT_INITIALIZED',
  'BUSY',
  'CANCELLED',
  'TIMEOUT',
  'GENERATION_FAILED',
]);

export class NativeRuntimeError extends Error {
  constructor(
    public readonly code: RuntimeErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'NativeRuntimeError';
  }
}

function normalizeRuntimeError(
  error: unknown,
  fallbackCode: RuntimeErrorCode,
): NativeRuntimeError {
  if (error instanceof NativeRuntimeError) return error;
  const candidate = error as { code?: unknown; message?: unknown };
  const rawCode = typeof candidate?.code === 'string' ? candidate.code : fallbackCode;
  const code = runtimeErrorCodes.has(rawCode as RuntimeErrorCode)
    ? (rawCode as RuntimeErrorCode)
    : fallbackCode;
  const message = typeof candidate?.message === 'string'
    ? candidate.message
    : '네이티브 AI 런타임 작업에 실패했습니다.';
  return new NativeRuntimeError(code, message, { cause: error });
}

const unsupportedStatus = (platform: NativeRuntimePlatform): NativeRuntimeStatus => ({
  supported: false,
  platform,
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

export async function queryNativeRuntimeStatus(
  nativeModule: NativeRuntimeModule | null,
  platform: string,
): Promise<NativeRuntimeStatus> {
  if (platform !== 'android' || nativeModule === null) {
    return unsupportedStatus('unsupported');
  }

  return nativeModule.getRuntimeStatus();
}

export function getNativeRuntimeStatus(): Promise<NativeRuntimeStatus> {
  return queryNativeRuntimeStatus(OneuldoLlamaRuntimeModule, Platform.OS);
}

const unsupportedModelPreparation = (): ModelPreparationResult => ({
  supported: false,
  ready: false,
  modelPath: null,
  revision: null,
  fileCount: 0,
  totalBytes: 0,
  reused: false,
});

export async function queryNativeModelPreparation(
  nativeModule: NativeRuntimeModule | null,
  platform: string,
): Promise<ModelPreparationResult> {
  if (platform !== 'android' || nativeModule === null) {
    return unsupportedModelPreparation();
  }

  return nativeModule.prepareModel();
}

export function prepareNativeModel(): Promise<ModelPreparationResult> {
  return queryNativeModelPreparation(OneuldoLlamaRuntimeModule, Platform.OS);
}

export async function queryNativeModelInitialization(
  nativeModule: NativeRuntimeModule | null,
  platform: string,
): Promise<NativeRuntimeStatus> {
  if (platform !== 'android' || nativeModule === null) {
    return unsupportedStatus('unsupported');
  }

  return nativeModule.initializeModel();
}

export function initializeNativeModel(): Promise<NativeRuntimeStatus> {
  return queryNativeModelInitialization(OneuldoLlamaRuntimeModule, Platform.OS);
}

export async function queryNativeTextGeneration(
  nativeModule: NativeRuntimeModule | null,
  platform: string,
  request: GenerateRequest,
): Promise<GenerateResult> {
  if (platform !== 'android' || nativeModule === null) {
    throw new NativeRuntimeError(
      'UNSUPPORTED',
      '이 환경에서는 네이티브 텍스트 생성을 사용할 수 없습니다.',
    );
  }

  try {
    // Expo 비동기 큐에 들어가기 전에 중복·동시 요청을 즉시 차단한다.
    nativeModule.reserveGeneration(
      request.requestId,
      request.prompt,
      request.maxTokens,
      request.timeoutMs,
    );
    return await nativeModule.generateText(
      request.requestId,
      request.prompt,
      request.maxTokens,
      request.timeoutMs,
    );
  } catch (error) {
    throw normalizeRuntimeError(error, 'GENERATION_FAILED');
  }
}

export function generateNativeText(request: GenerateRequest): Promise<GenerateResult> {
  return queryNativeTextGeneration(OneuldoLlamaRuntimeModule, Platform.OS, request);
}

export async function queryNativeGenerationCancellation(
  nativeModule: NativeRuntimeModule | null,
  platform: string,
  requestId: string,
): Promise<CancellationResult> {
  if (platform !== 'android' || nativeModule === null) {
    throw new NativeRuntimeError('UNSUPPORTED', '이 환경에서는 생성을 취소할 수 없습니다.');
  }
  try {
    return await Promise.resolve(nativeModule.cancelGeneration(requestId));
  } catch (error) {
    throw normalizeRuntimeError(error, 'GENERATION_FAILED');
  }
}

export function cancelNativeGeneration(requestId: string): Promise<CancellationResult> {
  return queryNativeGenerationCancellation(OneuldoLlamaRuntimeModule, Platform.OS, requestId);
}

export async function queryNativeModelRelease(
  nativeModule: NativeRuntimeModule | null,
  platform: string,
): Promise<ReleaseResult> {
  if (platform !== 'android' || nativeModule === null) {
    throw new NativeRuntimeError('UNSUPPORTED', '이 환경에서는 모델을 해제할 수 없습니다.');
  }
  try {
    return await nativeModule.releaseModel();
  } catch (error) {
    throw normalizeRuntimeError(error, 'INITIALIZATION_FAILED');
  }
}

export function releaseNativeModel(): Promise<ReleaseResult> {
  return queryNativeModelRelease(OneuldoLlamaRuntimeModule, Platform.OS);
}
