import { useSyncExternalStore } from 'react';
import { createPhishingSession, reducePhishingSession, type PhishingAction, type PhishingScenarioId, type PhishingSession } from './phishingSession';

// Shared between the village and phone during this app run. This is not a cloud or restart save.
let session: PhishingSession | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const emit = () => listeners.forEach(listener => listener());

export function getPhishingSession(): PhishingSession | null { return session; }
export function usePhishingSession(): PhishingSession | null {
  return useSyncExternalStore(subscribe, getPhishingSession, getPhishingSession);
}
/** Call only for an explicit choice of a new episode; opening the phone resumes the existing one. */
export function startPhishingEpisode(scenarioId: PhishingScenarioId): PhishingSession {
  session = createPhishingSession(scenarioId);
  emit();
  return session;
}
export function dispatchPhishingAction(action: PhishingAction): PhishingSession | null {
  if (!session) return null;
  const next = reducePhishingSession(session, action);
  if (next !== session) { session = next; emit(); }
  return session;
}
export function clearPhishingSession(): void {
  if (!session) return;
  session = null;
  emit();
}
