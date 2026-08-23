import {
  generateCloudQuestText,
  type CloudQuestGenerationInput,
} from '../api/cloudQuestGeneration';
import {
  generateNativeText,
  getNativeRuntimeStatus,
  initializeNativeModel,
} from './nativeRuntime';
import type { GenerateRequest, NativeRuntimeStatus } from './nativeRuntime.types';

export type CloudCapableGenerateRequest = GenerateRequest & {
  cloudInput?: Omit<CloudQuestGenerationInput, 'requestId'>;
};

const cloudReadyStatus: NativeRuntimeStatus = {
  supported: true,
  platform: 'android',
  state: 'ready',
  runtimeVersion: 'groq-cloud',
  abi: null,
  modelPath: null,
  initializationMs: 0,
  alreadyInitialized: true,
  activeRequestId: null,
  errorCode: null,
  errorMessage: null,
};

async function generateWithNativeFallback(request: GenerateRequest) {
  let status = await getNativeRuntimeStatus();
  if (!status.supported) throw new Error('RUNTIME_UNAVAILABLE');
  if (status.state !== 'ready') status = await initializeNativeModel();
  if (status.state !== 'ready') throw new Error('RUNTIME_ERROR');
  return generateNativeText(request);
}

export function createCloudFirstQuestRuntime(accessToken: string) {
  return {
    getStatus: async () => cloudReadyStatus,
    initialize: async () => cloudReadyStatus,
    generate: async (request: CloudCapableGenerateRequest) => {
      if (request.cloudInput) {
        try {
          const result = await generateCloudQuestText(accessToken, {
            ...request.cloudInput,
            requestId: request.requestId,
          });
          if (__DEV__) {
            console.info('[CloudQuestGeneration]', {
              requestId: request.requestId,
              model: result.model,
              latencyMs: result.latencyMs,
            });
          }
          return {
            requestId: result.requestId,
            text: result.text,
            latencyMs: result.latencyMs,
          };
        } catch (error) {
          if (__DEV__) {
            console.warn('[CloudQuestGeneration] Falling back to device runtime.', {
              requestId: request.requestId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
      return generateWithNativeFallback(request);
    },
  };
}
