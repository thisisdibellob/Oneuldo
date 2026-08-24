const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export type CloudQuestGenerationInput = {
  questId: string;
  stepId: string;
  requestId: string;
  incidentType: string;
  retryFailureCode?: string;
};

export type CloudQuestGenerationResult = {
  requestId: string;
  text: string;
  model: string;
  latencyMs: number;
};

export class CloudQuestGenerationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CloudQuestGenerationError';
  }
}

export async function generateCloudQuestText(
  accessToken: string,
  input: CloudQuestGenerationInput,
): Promise<CloudQuestGenerationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${API_BASE_URL}/api/ai/quest-step/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { code?: unknown; message?: unknown } | null;
      throw new CloudQuestGenerationError(
        response.status,
        typeof body?.code === 'string' ? body.code : 'CLOUD_AI_ERROR',
        typeof body?.message === 'string' ? body.message : `클라우드 AI 요청 실패: ${response.status}`,
      );
    }
    const body = await response.json() as Partial<CloudQuestGenerationResult>;
    if (
      typeof body.requestId !== 'string'
      || typeof body.text !== 'string'
      || body.text.trim().length === 0
      || typeof body.model !== 'string'
      || typeof body.latencyMs !== 'number'
    ) {
      throw new CloudQuestGenerationError(502, 'INVALID_CLOUD_RESPONSE', '클라우드 AI 응답 구조가 올바르지 않습니다.');
    }
    return body as CloudQuestGenerationResult;
  } catch (error) {
    if (error instanceof CloudQuestGenerationError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CloudQuestGenerationError(408, 'CLOUD_AI_TIMEOUT', '클라우드 AI 응답 시간이 초과되었습니다.');
    }
    throw new CloudQuestGenerationError(0, 'CLOUD_AI_NETWORK_ERROR', '클라우드 AI에 연결할 수 없습니다.');
  } finally {
    clearTimeout(timeout);
  }
}
