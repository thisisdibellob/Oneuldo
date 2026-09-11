/** Stable appearance order: recorded numeric indexes remain replayable. No image imports in the agent engine. */
export const MARKET_EMPLOYEE_APPEARANCES = [
  { id: 'employee-male-01', label: '남성 종업원 1', age: 'adult', gender: 'male', heightScale: 1 },
  { id: 'employee-male-02', label: '남성 종업원 2', age: 'adult', gender: 'male', heightScale: 1 },
  { id: 'employee-female-01', label: '여성 종업원 1', age: 'adult', gender: 'female', heightScale: 1 },
  { id: 'employee-female-02', label: '여성 종업원 2', age: 'adult', gender: 'female', heightScale: 1 },
] as const;

export const MARKET_CUSTOMER_APPEARANCES = [
  { id: 'customer-adult-male-01', label: '성인 남성 손님 1', age: 'adult', gender: 'male', heightScale: 1 },
  { id: 'customer-adult-male-02', label: '성인 남성 손님 2', age: 'adult', gender: 'male', heightScale: 1 },
  { id: 'customer-adult-female-01', label: '성인 여성 손님 1', age: 'adult', gender: 'female', heightScale: 1 },
  { id: 'customer-adult-female-02', label: '성인 여성 손님 2', age: 'adult', gender: 'female', heightScale: 1 },
  { id: 'customer-senior-male-01', label: '노년 남성 손님 1', age: 'senior', gender: 'male', heightScale: 1 },
  { id: 'customer-senior-male-02', label: '노년 남성 손님 2', age: 'senior', gender: 'male', heightScale: 1 },
  { id: 'customer-senior-female-01', label: '노년 여성 손님 1', age: 'senior', gender: 'female', heightScale: 1 },
  { id: 'customer-senior-female-02', label: '노년 여성 손님 2', age: 'senior', gender: 'female', heightScale: 1 },
  { id: 'customer-child-male-01', label: '어린이 남성 손님 1', age: 'child', gender: 'male', heightScale: 0.76 },
  { id: 'customer-child-male-02', label: '어린이 남성 손님 2', age: 'child', gender: 'male', heightScale: 0.76 },
  { id: 'customer-child-female-01', label: '어린이 여성 손님 1', age: 'child', gender: 'female', heightScale: 0.76 },
  { id: 'customer-child-female-02', label: '어린이 여성 손님 2', age: 'child', gender: 'female', heightScale: 0.76 },
] as const;

export type MarketPersonKind = 'employee' | 'customer';
export type MarketPersonAppearance =
  | (typeof MARKET_EMPLOYEE_APPEARANCES)[number]
  | (typeof MARKET_CUSTOMER_APPEARANCES)[number];
export type MarketPersonAppearanceId = MarketPersonAppearance['id'];

export function getMarketPersonAppearance(kind: MarketPersonKind, appearance: number): MarketPersonAppearance {
  const pool = kind === 'employee' ? MARKET_EMPLOYEE_APPEARANCES : MARKET_CUSTOMER_APPEARANCES;
  const index = Number.isInteger(appearance) ? ((appearance % pool.length) + pool.length) % pool.length : 0;
  return pool[index];
}
