import type { MarketEnvironmentConfig } from '../game/marketEnvironment';
import type { MarketSessionConfig } from '../game/marketSession';

export const HARD_SHARED_ENVIRONMENT_ID = 'hard-shared-v1';
export const TAILORED_SHARED_ENVIRONMENT_ID = 'tailored-shared-v1';

const hardSharedEnvironment: MarketEnvironmentConfig = {
  layoutId: 'classic',
  entranceConstruction: false,
  seed: HARD_SHARED_ENVIRONMENT_ID,
  shelfOrder: ['produce', 'fresh', 'household', 'meal', 'drink'],
  employeeCount: 1,
  employeeSlotIds: ['staff-east-aisle'],
  customerCount: 1,
  customerSlotIds: ['customer-east'],
  pillarCount: 1,
  pillarSlotIds: ['pillar-northwest'],
  chairCount: 0,
  cashierCount: 2,
  kioskPresent: false,
  kioskLane: 'none',
};
Object.freeze(hardSharedEnvironment.shelfOrder);
Object.freeze(hardSharedEnvironment.employeeSlotIds);
Object.freeze(hardSharedEnvironment.customerSlotIds);
Object.freeze(hardSharedEnvironment.pillarSlotIds);
Object.freeze(hardSharedEnvironment);

function selected(enabled: boolean, environmentId?: string): boolean {
  if (!enabled || !environmentId) return false;
  if (![HARD_SHARED_ENVIRONMENT_ID, TAILORED_SHARED_ENVIRONMENT_ID].includes(environmentId)) throw new Error('알 수 없는 개발 재생 매장 조건입니다.');
  return true;
}

/** Each visit begins with the same physical conditions, before an AI shelf plan. */
export function pilotEnvironment(enabled: boolean, environmentId?: string): MarketEnvironmentConfig | null {
  if (!selected(enabled, environmentId)) return null;
  const environment = JSON.parse(JSON.stringify(hardSharedEnvironment)) as MarketEnvironmentConfig;
  if (environmentId === TAILORED_SHARED_ENVIRONMENT_ID) {
    environment.seed = TAILORED_SHARED_ENVIRONMENT_ID;
    environment.shelfOrder = ['drink', 'meal', 'household', 'fresh', 'produce'];
  }
  return environment;
}

/** Purchase conditions are shared by baseline and AI practice rounds. */
export function pilotSessionConfig(enabled: boolean, environmentId?: string): Partial<MarketSessionConfig> | undefined {
  if (!selected(enabled, environmentId)) return undefined;
  return {
    stockPerProduct: 6,
    stockOverrides: {},
    learning: { stockoutEnabled: false, budgetChoiceEnabled: false, checkoutReviewMode: 'normal' },
  };
}
