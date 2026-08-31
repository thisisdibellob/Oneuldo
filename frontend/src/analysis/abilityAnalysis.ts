import type { AbilitySkillProfile } from '../api/abilityProfile';

export type AbilityStatus = 'STRENGTH' | 'DEVELOPING' | 'NEEDS_PRACTICE' | 'INSUFFICIENT';

const SKILL_COPY: Record<string, { label: string; description: string }> = {
  LANGUAGE_COMPREHENSION: {
    label: '언어 이해',
    description: '목록과 안내 문장을 이해하고 필요한 행동을 고르는 능력이에요.',
  },
  NUMERACY: {
    label: '수 개념',
    description: '수량을 맞추고 숫자를 비교하는 능력이에요.',
  },
  MONEY_MANAGEMENT: {
    label: '돈 관리',
    description: '가격과 예산을 확인해 알맞게 사용하는 능력이에요.',
  },
  EXECUTIVE_FUNCTION: {
    label: '계획과 순서',
    description: '해야 할 일을 기억하고 순서대로 마치는 능력이에요.',
  },
};

export function abilityCopy(skillCode: string) {
  return SKILL_COPY[skillCode] ?? {
    description: '퀘스트 수행 과정에서 관찰한 생활 기술이에요.',
    label: skillCode.replaceAll('_', ' '),
  };
}

export function classifyAbility(skill: AbilitySkillProfile): AbilityStatus {
  if (skill.independentSuccessRate === null || skill.confidence === 'INSUFFICIENT') {
    return 'INSUFFICIENT';
  }
  if (skill.independentSuccessRate < 50) return 'NEEDS_PRACTICE';
  if (skill.independentSuccessRate >= 80) return 'STRENGTH';
  return 'DEVELOPING';
}

export function abilityLevel(skill: AbilitySkillProfile) {
  const status = classifyAbility(skill);
  if (status === 'INSUFFICIENT') return null;
  if (status === 'NEEDS_PRACTICE') return 1;
  if (status === 'STRENGTH') return 3;
  return 2;
}

export function confidenceLabel(confidence: AbilitySkillProfile['confidence']) {
  return {
    HIGH: '근거 충분',
    MEDIUM: '근거 보통',
    LOW: '근거 적음',
    INSUFFICIENT: '추가 관찰 필요',
  }[confidence];
}
