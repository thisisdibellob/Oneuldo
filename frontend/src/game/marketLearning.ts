import type { MarketCategoryId } from './scenarios';

export type MarketLearningConfig = {
  stockoutEnabled: boolean;
  allowSubstitution: boolean;
  budgetChoiceEnabled: boolean;
  /** Spending limit for the additional self-chosen drink, not for the fixed shopping list. */
  choiceBudget: number;
};

export const DEFAULT_MARKET_LEARNING_CONFIG: MarketLearningConfig = {
  stockoutEnabled: true,
  allowSubstitution: true,
  budgetChoiceEnabled: true,
  choiceBudget: 3000,
};

export type MarketUnavailableReason = 'no-substitute-in-stock' | 'replacement-not-allowed';
export type MarketStockoutState = {
  objectiveId: string;
  requestedProductId: string;
  requestedQuantity: number;
  shelfVisited: boolean;
  staffChecked: boolean;
  status: 'unresolved' | 'replacement-approved' | 'waived';
  approvedProductId: string | null;
  resolutionReason: MarketUnavailableReason | 'requester-approved-substitute' | null;
};
export type MarketChoiceTask = {
  id: 'choice-drink';
  categoryId: 'drink';
  label: string;
  quantity: 1;
  budget: number;
};
export type MarketLearningState = {
  stockout: MarketStockoutState | null;
  choiceTask: MarketChoiceTask | null;
  visitedCategoryIds: MarketCategoryId[];
};

/** Old presets can omit learning; explicit false preserves the original fixed-list exercise. */
export function normalizeMarketLearningConfig(input?: Partial<MarketLearningConfig>): MarketLearningConfig {
  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) {
    throw new Error('장보기 학습 설정은 JSON 객체여야 합니다.');
  }
  for (const key of Object.keys(input ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_MARKET_LEARNING_CONFIG, key)) throw new Error('지원하지 않는 장보기 학습 설정입니다: ' + key);
  }
  const config = { ...DEFAULT_MARKET_LEARNING_CONFIG, ...input };
  for (const key of ['stockoutEnabled', 'allowSubstitution', 'budgetChoiceEnabled'] as const) {
    if (typeof config[key] !== 'boolean') throw new Error(key + '는 true 또는 false여야 합니다.');
  }
  if (!Number.isInteger(config.choiceBudget) || config.choiceBudget < 1 || config.choiceBudget > 1000000) {
    throw new Error('선택 구매 예산은 1~1000000원 사이 정수여야 합니다.');
  }
  return config;
}
