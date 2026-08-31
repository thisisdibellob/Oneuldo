import { abilityLevel, classifyAbility } from '../src/analysis/abilityAnalysis';
import type { AbilitySkillProfile } from '../src/api/abilityProfile';

function skill(rate: number | null, confidence: AbilitySkillProfile['confidence'] = 'MEDIUM') {
  return {
    confidence,
    distinctSessionCount: 2,
    distinctTaskCount: 1,
    independentEvaluableEvidenceCount: 5,
    independentSuccessRate: rate,
    interpretationLimits: [],
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
});
