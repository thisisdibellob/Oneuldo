const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export type AiBehaviorAnalysis = {
  usedEvidenceCardIds?: string[];
  summary: string;
  findings: Array<{
    id: string;
    skill: string;
    observation: string;
    interpretation: string;
    alternativeExplanations: string[];
    evidenceEventIds: string[];
    suggestedSupport: string;
  }>;
  sessionAssessments: Array<{
    sessionId: string;
    judgment: 'SUCCESS' | 'FAILURE' | 'UNDETERMINED';
    explanation: string;
    evidenceEventIds: string[];
  }>;
  uncertainties: string[];
  practicePlan: {
    targetFindingIds: string[];
    goal: string;
    rationale: string;
    recommendedDifficulty: 1 | 2 | 3;
    itemCount: 2 | 3 | 4;
    quantityComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
    budgetPressure: 'LOW' | 'MEDIUM' | 'HIGH';
    textSupport: 'SIMPLIFIED' | 'STANDARD' | 'REDUCED';
    reasonCodes: string[];
  };
};

export type AiBehaviorAnalysisResponse = {
  analysisId: string;
  datasetId: string;
  status: 'READY' | 'NO_HISTORY' | 'FAILED' | 'INPUT_TOO_LARGE';
  model: string | null;
  promptVersion: string;
  evidenceVersion: string;
  eventCount: number;
  latencyMs: number;
  createdAt: string;
  errorCode: string | null;
  analysis: AiBehaviorAnalysis | null;
};

export type AiUserProfileResponse = {
  profileId: string;
  profileVersion: number;
  previousProfileId: string | null;
  sourceAnalysisId: string;
  sourceDatasetId: string;
  sourceSessionId: string;
  status: 'READY' | 'FAILED';
  model: string | null;
  promptVersion: string;
  latencyMs: number;
  createdAt: string;
  errorCode: string | null;
  profile: AiBehaviorAnalysis | null;
};

async function request(accessToken: string, method: 'GET' | 'POST') {
  if (!API_BASE_URL) throw new Error('EXPO_PUBLIC_API_URL이 설정되지 않았습니다.');
  const response = await fetch(`${API_BASE_URL}/api/behavior-analyses${method === 'GET' ? '/latest' : ''}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`AI 분석 요청 실패: ${response.status}`);
  return response.json() as Promise<AiBehaviorAnalysisResponse>;
}

export const getLatestBehaviorAnalysis = (accessToken: string) => request(accessToken, 'GET');
export const createBehaviorAnalysis = (accessToken: string) => request(accessToken, 'POST');

export async function getCurrentUserProfile(accessToken: string): Promise<AiUserProfileResponse | null> {
  if (!API_BASE_URL) throw new Error('EXPO_PUBLIC_API_URL이 설정되지 않았습니다.');
  const response = await fetch(`${API_BASE_URL}/api/user-profiles/current`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`사용자 프로필 조회 실패: ${response.status}`);
  return response.json() as Promise<AiUserProfileResponse>;
}

export async function refreshCurrentUserProfile(accessToken: string): Promise<AiUserProfileResponse | null> {
  if (!API_BASE_URL) throw new Error('EXPO_PUBLIC_API_URL이 설정되지 않았습니다.');
  const response = await fetch(`${API_BASE_URL}/api/user-profiles/current/refresh`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`사용자 프로필 갱신 실패: ${response.status}`);
  return response.json() as Promise<AiUserProfileResponse>;
}

export async function createSessionBehaviorAnalysis(accessToken: string, sessionId: string): Promise<AiBehaviorAnalysisResponse> {
  if (!API_BASE_URL) throw new Error('EXPO_PUBLIC_API_URL이 설정되지 않았습니다.');
  const response = await fetch(API_BASE_URL + '/api/behavior-analyses/sessions/' + encodeURIComponent(sessionId), {
    method: 'POST', headers: { Authorization: 'Bearer ' + accessToken },
  });
  if (!response.ok) throw new Error('AI 수행 검토 요청 실패: ' + response.status);
  return response.json();
}
