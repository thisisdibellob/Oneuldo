const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export type MarketDifficultyRecommendation = {
  recommendationId: string;
  analysisInputSnapshotId: string | null;
  gameId: 'MARKET_SIMULATION';
  recommendedDifficulty: 1 | 2 | 3;
  personalizationMode: 'NO_PROFILE' | 'INSUFFICIENT_EVIDENCE' | 'BEHAVIOR_INFORMED';
  adjustments: {
    itemCount: 2 | 3 | 4;
    quantityComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
    budgetPressure: 'LOW' | 'MEDIUM' | 'HIGH';
    textSupport: 'SIMPLIFIED' | 'STANDARD' | 'REDUCED';
  };
  reasonCodes: string[];
  policyVersion: string;
  generatedAt: string;
};

export async function getMarketDifficultyRecommendation(accessToken: string) {
  if (!API_BASE_URL) throw new Error('EXPO_PUBLIC_API_URL이 설정되지 않았습니다.');
  const response = await fetch(`${API_BASE_URL}/api/market-personalization/recommendation`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`장보기 개인화 추천 조회 실패: ${response.status}`);
  }
  return response.json() as Promise<MarketDifficultyRecommendation>;
}

export type MarketAiQuestResponse = {
  generationId: string;
  source: 'AI' | 'RULE_FALLBACK';
  model: string | null;
  latencyMs: number;
  personalizationMode: 'NO_PROFILE' | 'STALE_PROFILE' | 'INSUFFICIENT_EVIDENCE' | 'BEHAVIOR_INFORMED';
  promptVersion: string;
  quest: {
    id: string;
    difficulty: 1 | 2 | 3;
    title: string;
    description: string;
    budget: number;
    objectives: Array<{ productId: string; quantity: number }>;
    briefing: string[];
    checkoutDialogue: string[];
    successMessage: string;
  };
  adaptationSummary: string;
  reasonCodes: string[];
};

export async function getMarketAiQuest(accessToken: string) {
  if (!API_BASE_URL) throw new Error('EXPO_PUBLIC_API_URL이 설정되지 않았습니다.');
  const response = await fetch(`${API_BASE_URL}/api/market-personalization/quest`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`AI 맞춤 장보기 퀘스트 생성 실패: ${response.status}`);
  return response.json() as Promise<MarketAiQuestResponse>;
}
