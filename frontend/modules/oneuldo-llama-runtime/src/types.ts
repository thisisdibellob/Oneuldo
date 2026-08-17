export type NativeRuntimePlatform = 'android' | 'unsupported';
export type NativeRuntimeState =
  | 'uninitialized' | 'initializing' | 'ready' | 'generating'
  | 'releasing' | 'error' | 'unsupported';

export type NativeRuntimeStatus = {
  supported: boolean;
  platform: NativeRuntimePlatform;
  state: NativeRuntimeState;
  runtimeVersion: string | null;
  abi: string | null;
  modelPath: string | null;
  initializationMs: number | null;
  alreadyInitialized: boolean;
  activeRequestId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type ModelPreparationResult =
  | { supported: true; ready: true; modelPath: string; revision: string; fileCount: number; totalBytes: number; reused: boolean }
  | { supported: false; ready: false; modelPath: null; revision: null; fileCount: 0; totalBytes: 0; reused: false };

export type GenerateRequest = { requestId: string; prompt: string; maxTokens: number; timeoutMs: number };
export type GenerateResult = { requestId: string; text: string; latencyMs: number };
export type RuntimeErrorCode =
  | 'UNSUPPORTED' | 'MODEL_MISSING' | 'MODEL_CORRUPTED' | 'NETWORK_UNAVAILABLE'
  | 'MODEL_DOWNLOAD_FAILED' | 'INSUFFICIENT_STORAGE' | 'INITIALIZATION_FAILED'
  | 'NOT_INITIALIZED' | 'BUSY' | 'CANCELLED' | 'TIMEOUT' | 'GENERATION_FAILED';
export type CancellationResult = { requestId: string; cancelled: boolean };
export type ReleaseResult = { released: boolean };

export type NativeRuntimeModule = {
  getRuntimeStatus(): Promise<NativeRuntimeStatus>;
  prepareModel(): Promise<ModelPreparationResult>;
  initializeModel(): Promise<NativeRuntimeStatus>;
  reserveGeneration(requestId: string, prompt: string, maxTokens: number, timeoutMs: number): void;
  generateText(requestId: string, prompt: string, maxTokens: number, timeoutMs: number): Promise<GenerateResult>;
  cancelGeneration(requestId: string): CancellationResult;
  releaseModel(): Promise<ReleaseResult>;
};
