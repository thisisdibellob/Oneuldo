import { useSyncExternalStore } from 'react';
import type { CafeSession } from './cafeSession';

// Current app run only: leaving the café does not discard the active order.
// Completed album records are stored separately; this is not a restart/cloud save.
let draft: CafeSession | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function getCafeDraft(): CafeSession | null { return draft; }
export function keepCafeDraft(session: CafeSession | null): CafeSession | null {
  if (session === draft) return draft;
  draft = session;
  listeners.forEach(listener => listener());
  return draft;
}
export function useCafeDraft(): CafeSession | null {
  return useSyncExternalStore(subscribe, getCafeDraft, getCafeDraft);
}
export function clearCafeDraft(): void { keepCafeDraft(null); }
