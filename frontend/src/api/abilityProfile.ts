const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export type AbilityConfidence = 'INSUFFICIENT' | 'LOW' | 'MEDIUM' | 'HIGH';

export type ObservedBehaviorEvidence = {
  eventCode: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'NEUTRAL' | 'INCOMPLETE';
  independenceLevel:
    | 'INDEPENDENT'
    | 'SUPPORTED_LEVEL_1'
    | 'SUPPORTED_LEVEL_2'
    | 'SUPPORTED_LEVEL_3'
    | 'ASSISTED';
  errorType: string;
  observationCount: number;
};

export type AbilitySkillProfile = {
  skillCode: string;
  independentSuccessRate: number | null;
  supportedSuccessRate: number | null;
  independentEvaluableEvidenceCount: number;
  supportedEvaluableEvidenceCount: number;
  distinctTaskCount: number;
  distinctSessionCount: number;
  confidence: AbilityConfidence;
  observedStrengths: ObservedBehaviorEvidence[];
  observedDifficulties: ObservedBehaviorEvidence[];
  interpretationLimits: string[];
};

export type AbilityProfileResponse = {
  profileId: string;
  inputEventCount: number;
  generatedAt: string;
  profileData: {
    skills: Record<string, AbilitySkillProfile>;
    needsMoreAssessment: string[];
    generatedAt: string;
  };
};

export async function getLatestAbilityProfile(accessToken: string) {
  if (!API_BASE_URL) throw new Error('EXPO_PUBLIC_API_URL이 설정되지 않았습니다.');
  const response = await fetch(`${API_BASE_URL}/api/behavior-profiles/latest`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`능력 분석 조회 실패: ${response.status}`);
  return response.json() as Promise<AbilityProfileResponse>;
}
