import { useSyncExternalStore } from 'react';
import { createShoppingErrand, reduceShoppingErrand, type ShoppingErrand, type ShoppingErrandAction } from './shoppingErrand';

// An optional request stays available while visiting scenes. This is not a saved game.
let current: ShoppingErrand | null = null;
const offeredSources = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
export const getShoppingErrand = () => current;
export function offerShoppingErrand(source: string, at = Date.now()) {
  if (offeredSources.has(source)) return current;
  offeredSources.add(source);
  if (current && current.phase !== 'delivered') return current;
  current = createShoppingErrand({ id: `minsu-${source}`, offeredAt: at });
  emit();
  return current;
}
export function dispatchShoppingErrand(action: ShoppingErrandAction) {
  if (!current) return null;
  const next = reduceShoppingErrand(current, action);
  if (next !== current) { current = next; emit(); }
  return current;
}
export function useShoppingErrand() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getShoppingErrand, () => null);
}
export function getShoppingErrandStatus(errand: ShoppingErrand) {
  return ({ offered: '민수의 새 부탁', deferred: '나중에 받기로 한 부탁', accepted: '하늘마트에서 목록대로 사기', 'budget-review': '추가 금액 확인하기', ready: '민수에게 물건 전달하기', delivered: '전달 완료' })[errand.phase];
}
export function resetShoppingErrandForTests() { current = null; offeredSources.clear(); emit(); }
