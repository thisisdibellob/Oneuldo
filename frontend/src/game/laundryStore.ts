import { useSyncExternalStore } from 'react';
import type { LaundrySession } from './laundrySession';

// Shared during the current app run so walking through the village keeps the basket.
// This is not a restart save, cloud save or backend inventory.
let draft: LaundrySession | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function getLaundryDraft(): LaundrySession | null { return draft; }
export function keepLaundryDraft(session: LaundrySession | null): LaundrySession | null {
  if (session === draft) return draft;
  draft = session;
  listeners.forEach(listener => listener());
  return draft;
}
export function useLaundryDraft(): LaundrySession | null {
  return useSyncExternalStore(subscribe, getLaundryDraft, getLaundryDraft);
}
export function clearLaundryDraft(): void { keepLaundryDraft(null); }
