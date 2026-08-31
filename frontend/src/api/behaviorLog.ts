const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export type BehaviorStepOutcome = 'SUCCESS' | 'FAILURE' | 'INCOMPLETE' | 'INVALID';
export type BehaviorEvidenceContext = 'ASSESSMENT_TASK' | 'TRAINING_TASK';
export type BehaviorContentSource = 'STATIC' | 'GENERATED' | 'REVIEWED_VARIANT' | 'FALLBACK';

export type BehaviorSimulationContext = {
  questInstanceId: string;
  contentSource: BehaviorContentSource;
  simulationStarted: boolean;
};

export type ShoppingBehaviorPayload = {
  type: 'SHOPPING';
  listOpenCount?: number;
  requiredQuantity?: number;
  selectedQuantity?: number;
  priceAmount?: number;
  budgetAmount?: number;
  itemId?: string;
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
  };
  identity: { sessionId: string };
  task: {
    gameId: string;
    taskId: string;
    taskVersion: string;
    difficulty: number;
    scenarioVariant: string;
    evidenceContext: BehaviorEvidenceContext;
  };
  action: {
    eventCode: string;
    microActionId: string;
    stepOutcome: BehaviorStepOutcome;
    stepOrder: number;
    startLatencyMs?: number;
    firstAction?: string;
  };
  accessibility: {
    instructionMode: 'TEXT';
    textLevel: 'STANDARD';
    audioEnabled: boolean;
    symbolSupport: boolean;
    controllerMode: 'TOUCH';
  };
  presentation: {
    screenId: string;
    instructionContentId: string;
    foregroundDurationMs?: number;
  };
  simulation: BehaviorSimulationContext;
  taskResult?: {
    taskCompleted: boolean;
    completionQuality: number;
    completionTimeMs: number;
  };
  error?: {
    omissionCount?: number;
    wrongActionCount?: number;
  };
  sessionEnd?: {
    reason: 'COMPLETED' | 'USER_ABORTED';
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
