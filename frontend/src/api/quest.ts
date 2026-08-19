export type QuestSummary = {
  id: string;
  categoryCode: string;
  categoryName: string;
  title: string;
  summary: string;
  difficulty: string;
  rewardPoints: number;
};

export type QuestChoice = {
  id: string;
  choiceOrder: number;
  label: string;
  correct: boolean;
  feedback: string;
};

export type QuestStep = {
  id: string;
  stepOrder: number;
  instruction: string;
  situation: string;
  hint: string | null;
  choices: QuestChoice[];
};

export type QuestDetail = QuestSummary & {
  code: string;
  goal: string;
  steps: QuestStep[];
};

export type QuestSession = {
  id: string;
  questId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  questDifficulty: string;
  totalSteps: number;
  completedSteps: number;
  rewardPoints: number;
  startedAt: string;
  completedAt: string | null;
  abandonedAt: string | null;
  abandonReason: string | null;
};

export type QuestEventRequest = {
  stepId: string;
  choiceId: string;
  attemptNumber: number;
  hintUsed: boolean;
  responseTimeMs: number;
};

export type QuestEventResult = {
  eventId: number;
  attemptNumber: number;
  correct: boolean;
  feedback: string;
  completedSteps: number;
  totalSteps: number;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export class QuestApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new QuestApiError(response.status, `API 요청 실패: ${response.status}`);
  }

  return response.json();
}

export async function getQuests(): Promise<QuestSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/quest`);
  return parseResponse<QuestSummary[]>(response);
}

// 로그인한 사용자의 현재 난이도와 가까운 퀘스트부터 받는다.
export async function getRecommendedQuests(accessToken: string): Promise<QuestSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/quest/recommended`, {
    headers: authHeaders(accessToken),
  });
  return parseResponse<QuestSummary[]>(response);
}

export async function getQuest(uuid: string): Promise<QuestSummary> {
  const response = await fetch(`${API_BASE_URL}/api/quest/${uuid}`);
  return parseResponse<QuestSummary>(response);
}

export async function getQuestDetail(uuid: string): Promise<QuestDetail> {
  const response = await fetch(`${API_BASE_URL}/api/quest/${uuid}/detail`);
  return parseResponse<QuestDetail>(response);
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export async function startQuestSession(
  questId: string,
  accessToken: string,
): Promise<QuestSession> {
  const response = await fetch(`${API_BASE_URL}/api/quest/${questId}/sessions`, {
    headers: authHeaders(accessToken),
    method: 'POST',
  });
  return parseResponse<QuestSession>(response);
}

export async function recordQuestEvent(
  sessionId: string,
  request: QuestEventRequest,
  accessToken: string,
): Promise<QuestEventResult> {
  const response = await fetch(`${API_BASE_URL}/api/quest/sessions/${sessionId}/events`, {
    body: JSON.stringify(request),
    headers: authHeaders(accessToken),
    method: 'POST',
  });
  return parseResponse<QuestEventResult>(response);
}

export async function completeQuestSession(
  sessionId: string,
  accessToken: string,
): Promise<QuestSession> {
  const response = await fetch(`${API_BASE_URL}/api/quest/sessions/${sessionId}/complete`, {
    headers: authHeaders(accessToken),
    method: 'POST',
  });
  return parseResponse<QuestSession>(response);
}

export async function abandonQuestSession(
  sessionId: string,
  accessToken: string,
  reason = 'USER_EXIT',
): Promise<QuestSession> {
  const response = await fetch(`${API_BASE_URL}/api/quest/sessions/${sessionId}/abandon`, {
    body: JSON.stringify({ reason }),
    headers: authHeaders(accessToken),
    method: 'POST',
  });
  return parseResponse<QuestSession>(response);
}
