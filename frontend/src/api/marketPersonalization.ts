import { resolveMarketAiMission } from '../game/scenarios';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export type MarketDifficultyRecommendation = {
  recommendationId: string;
  analysisInputSnapshotId: string | null;
  analysisId: string;
  gameId: 'MARKET_SIMULATION';
  recommendedDifficulty: 1 | 2 | 3;
  personalizationMode: 'AI_ANALYSIS';
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
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`장보기 개인화 추천 조회 실패: ${response.status}`);
  }
  return response.json() as Promise<MarketDifficultyRecommendation>;
}

export type MarketAiQuestResponse = {
  generationId: string;
  analysisId: string;
  source: 'AI';
  model: string | null;
  latencyMs: number;
  personalizationMode: 'AI_ANALYSIS';
  promptVersion: string;
  quest: {
    id: string;
    scenarioId: string;
    catalogVersion: string;
    scenarioVersion: string;
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
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`AI 맞춤 장보기 퀘스트 생성 실패: ${response.status}`);
  const result = await response.json() as MarketAiQuestResponse;
  return { ...result, quest: { ...result.quest, ...resolveMarketAiMission(result.quest) } };
}
