const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export type BehaviorStepOutcome = 'SUCCESS' | 'FAILURE' | 'INCOMPLETE' | 'INVALID';
export type BehaviorPriority = 'critical' | 'high' | 'normal' | 'low';

export type ShoppingBehaviorPayload = {
  type: 'SHOPPING';
  [key: string]: unknown;
};

export type BehaviorLogRequest = {
  metadata: {
    clientEventId: string;
    eventSequence: number;
    eventSchemaVersion: 'behavior-event-v1';
    appVersion: string;
    contentVersion: string;
    offlineQueued: boolean;
    occurredAt: string;
    devicePerformanceClass?: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  };
  identity: { sessionId: string };
  task: {
    gameId: string;
    taskId: string;
    taskVersion: string;
    difficulty: number;
    scenarioVariant: string;
    evidenceContext: 'ASSESSMENT_TASK' | 'TRAINING_TASK';
  };
  action: {
    eventCode: string;
    microActionId: string;
    stepOutcome?: BehaviorStepOutcome;
    stepOrder: number;
    startLatencyMs?: number;
    firstAction?: string;
  };
  accessibility: {
    instructionMode: 'TEXT' | 'PICTURE' | 'AUDIO' | 'PICTURE_AND_AUDIO';
    textLevel: 'EASY' | 'STANDARD' | 'LARGE_EASY' | 'LARGE_STANDARD';
    audioEnabled: boolean;
    symbolSupport: boolean;
    controllerMode: 'KEYBOARD_MOUSE' | 'TOUCH' | 'GAMEPAD' | 'SWITCH' | 'OTHER';
  };
  presentation?: {
    screenId: string;
    instructionContentId?: string;
    foregroundDurationMs?: number;
    appBackgrounded?: boolean;
  };
  taskResult?: {
    taskCompleted: boolean;
    completionQuality: number;
    completionTimeMs: number;
  };
  error?: {
    omissionCount?: number;
    repetitionCount?: number;
    wrongActionCount?: number;
    sequenceErrorCount?: number;
    retryCount?: number;
    selfCorrected?: boolean;
    selfCorrectionLatencyMs?: number;
    idleCount?: number;
    idleTimeMs?: number;
    postErrorAction?: 'SELF_CORRECT' | 'REPEAT_SAME_ERROR' | 'HELP_REQUEST' | 'ABORT_AFTER_ERROR';
  };
  support?: {
    promptLevel?: number;
    supportType?: 'PICTURE_HINT' | 'SHORT_VERBAL_CUE' | 'STEP_BY_STEP' | 'CHECKLIST' | 'MAP' | 'TIMER' | 'DEMONSTRATION';
    supportCount?: number;
    helpRequested?: boolean;
    helpRequestTarget?: string;
    helpRequestLatencyMs?: number;
  };
  validity?: {
    invalidReason?: 'CONTROLLER_ERROR' | 'SENSORY_ACCESS' | 'LANGUAGE_ACCESS' | 'TECHNICAL_ERROR' | 'ASSISTANT_INTERVENTION' | 'OTHER';
    technicalError?: boolean;
    assistantIntervention?: boolean;
  };
  simulation: {
    questInstanceId: string;
    contentSource: 'STATIC' | 'GENERATED' | 'REVIEWED_VARIANT' | 'FALLBACK';
    simulationStarted: boolean;
  };
  sessionEnd?: {
    reason: 'COMPLETED' | 'USER_ABORTED' | 'APP_BACKGROUNDED' | 'APP_TERMINATED' | 'NETWORK_ERROR' | 'TECHNICAL_ERROR' | 'TIMEOUT' | 'OTHER';
    interruptionCount: number;
    interruptionTimeMs: number;
  };
  payload: ShoppingBehaviorPayload;
};

export type BehaviorLogBatchResponse = {
  batchId: string;
  events: Array<{
    id: string;
    clientEventId: string;
    eventSequence: number;
    status: 'ACCEPTED' | 'DUPLICATE';
    receivedAt: string;
  }>;
};

export class BehaviorLogApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function recordBehaviorLogBatch(
  batchId: string,
  events: BehaviorLogRequest[],
  accessToken: string,
): Promise<BehaviorLogBatchResponse> {
  if (!API_BASE_URL) throw new Error('EXPO_PUBLIC_API_URL이 설정되지 않았습니다.');
  const response = await fetch(`${API_BASE_URL}/api/behavior-logs/batches`, {
    body: JSON.stringify({ batchId, events }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  if (!response.ok) {
    throw new BehaviorLogApiError(response.status, `행동 로그 배치 저장 실패: ${response.status}`);
  }
  return response.json() as Promise<BehaviorLogBatchResponse>;
}
