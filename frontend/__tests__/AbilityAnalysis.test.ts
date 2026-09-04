import {
  abilityLevel,
  behaviorEvidenceCopy,
  classifyAbility,
  independenceLabel,
} from '../src/analysis/abilityAnalysis';
import type { AbilitySkillProfile } from '../src/api/abilityProfile';

function skill(rate: number | null, confidence: AbilitySkillProfile['confidence'] = 'MEDIUM') {
  return {
    confidence,
    distinctSessionCount: 2,
    distinctTaskCount: 1,
    independentEvaluableEvidenceCount: 5,
    independentSuccessRate: rate,
    interpretationLimits: [],
    observedDifficulties: [],
    observedStrengths: [],
    skillCode: 'NUMERACY',
    supportedEvaluableEvidenceCount: 0,
    supportedSuccessRate: null,
  } satisfies AbilitySkillProfile;
}

describe('능력별 분석 표시', () => {
  it('독립 성공률 기준을 난이도 단계와 동일하게 분류한다', () => {
    expect(classifyAbility(skill(40))).toBe('NEEDS_PRACTICE');
    expect(abilityLevel(skill(40))).toBe(1);
    expect(classifyAbility(skill(65))).toBe('DEVELOPING');
    expect(abilityLevel(skill(65))).toBe(2);
    expect(classifyAbility(skill(80))).toBe('STRENGTH');
    expect(abilityLevel(skill(80))).toBe(3);
  });

  it('성공률이 있어도 근거가 불충분하면 단정하지 않는다', () => {
    expect(classifyAbility(skill(100, 'INSUFFICIENT'))).toBe('INSUFFICIENT');
    expect(abilityLevel(skill(100, 'INSUFFICIENT'))).toBeNull();
    expect(classifyAbility(skill(null))).toBe('INSUFFICIENT');
  });

  it('수집한 행동 근거를 사용자에게 읽기 쉬운 문장으로 바꾼다', () => {
    const evidence = {
      errorType: 'QUANTITY_ERROR',
      eventCode: 'SHOP.QUANTITY_CHANGED',
      independenceLevel: 'INDEPENDENT' as const,
      observationCount: 2,
      outcome: 'FAILURE' as const,
    };
    expect(behaviorEvidenceCopy(evidence, 'difficulty')).toBe('필요한 수량과 다르게 담았어요.');
    expect(independenceLabel(evidence.independenceLevel)).toBe('독립 수행');
  });
});
