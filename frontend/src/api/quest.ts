import { Platform } from 'react-native';

export type QuestSummary = {
  id: string;
  categoryCode: string;
  categoryName: string;
  title: string;
  summary: string;
  difficulty: string;
  rewardPoints: number;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.status}`);
  }

  return response.json();
}

export async function getQuests(): Promise<QuestSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/quest`);
  return parseResponse<QuestSummary[]>(response);
}

export async function getQuest(uuid: string): Promise<QuestSummary> {
  const response = await fetch(`${API_BASE_URL}/api/quest/${uuid}`);
  return parseResponse<QuestSummary>(response);
}
