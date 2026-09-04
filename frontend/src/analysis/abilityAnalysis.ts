import type { AbilitySkillProfile, ObservedBehaviorEvidence } from '../api/abilityProfile';

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

const BEHAVIOR_COPY: Record<string, { difficulty: string; strength: string }> = {
  'SHOP.ITEM_SELECTED': {
    difficulty: '목록에 필요한 상품을 고르지 못했어요.',
    strength: '목록에 필요한 상품을 골랐어요.',
  },
  'SHOP.ITEM_MISSING': {
    difficulty: '목록에 있는 상품을 빠뜨렸어요.',
    strength: '목록에 있는 상품을 빠뜨리지 않았어요.',
  },
  'SHOP.WRONG_ITEM_SELECTED': {
    difficulty: '목록에 없는 상품을 골랐어요.',
    strength: '목록에 없는 상품을 피했어요.',
  },
  'SHOP.QUANTITY_CHANGED': {
    difficulty: '필요한 수량과 다르게 담았어요.',
    strength: '필요한 수량을 정확히 맞췄어요.',
  },
  'SHOP.PRICE_CHECKED': {
    difficulty: '가격과 예산을 정확히 확인하지 못했어요.',
    strength: '가격과 예산을 확인했어요.',
  },
  'SHOP.BUDGET_EXCEEDED': {
    difficulty: '장바구니 금액이 예산을 넘었어요.',
    strength: '예산을 넘지 않게 장보기를 마쳤어요.',
  },
};

export function behaviorEvidenceCopy(
  evidence: ObservedBehaviorEvidence,
  kind: 'strength' | 'difficulty',
) {
  const copy = BEHAVIOR_COPY[evidence.eventCode];
  if (copy) return copy[kind];
  return kind === 'strength' ? '과제를 올바르게 수행했어요.' : '과제 수행 중 어려움이 관찰됐어요.';
}

export function independenceLabel(level: ObservedBehaviorEvidence['independenceLevel']) {
  return {
    ASSISTED: '직접 도움',
    INDEPENDENT: '독립 수행',
    SUPPORTED_LEVEL_1: '힌트 1단계',
    SUPPORTED_LEVEL_2: '힌트 2단계',
    SUPPORTED_LEVEL_3: '힌트 3단계',
  }[level];
}
