import { useSyncExternalStore } from 'react';
import type { BusSession } from './busSession';
import { getBusResult } from './busSession';
import { getLibraryResult, type LibrarySession } from './librarySession';

export type DayJourneyStage = 'available' | 'outbound' | 'working' | 'returning' | 'home' | 'completed';
export type DayJourney = {
  stage: DayJourneyStage;
  startedAt: number | null;
  completedAt: number | null;
  outwardTrip: string | null;
  returnTrip: string | null;
  booksSorted: number;
  visitorsHelped: number;
  askedForHelp: number;
  recoveredTrips: number;
};
export const EMPTY_DAY_JOURNEY: DayJourney = Object.freeze({ stage: 'available', startedAt: null, completedAt: null,
  outwardTrip: null, returnTrip: null, booksSorted: 0, visitorsHelped: 0, askedForHelp: 0, recoveredTrips: 0 });
export const DAY_JOURNEY_STEPS = ['도서관 가는 버스 타기', '사서에게 업무 받고 마치기', '버스로 마을에 돌아오기', '우리 집에 도착하기'] as const;
export const DAY_JOURNEY_GUIDANCE: Record<DayJourneyStage, string> = {
  available: '하늘도서관에서 반납 도서 정리를 부탁했어요.',
  outbound: '마을 동쪽 정류장 → 하늘도서관. 버스 번호와 노선을 확인해요.',
  working: '도서관 안 사서에게 업무를 받아요. 끝나면 정리한 책을 보고해요.',
  returning: '도서관 밖 정류장에서 마을앞으로 돌아가는 버스를 타요.',
  home: '마을 오른쪽 우리 집으로 돌아가요.',
  completed: '출근부터 귀가까지 마쳤어요.',
};
export function dayJourneyStep(stage: DayJourneyStage): number {
  return ({ available: 0, outbound: 0, working: 1, returning: 2, home: 3, completed: 4 })[stage];
}
export type DayJourneyAction = { type: 'start'; at: number } | { type: 'bus-completed'; session: BusSession }
  | { type: 'work-completed'; session: LibrarySession } | { type: 'arrive-home'; at: number };
export function reduceDayJourney(state: DayJourney, action: DayJourneyAction): DayJourney {
  if (action.type === 'start') return state.stage === 'available' || state.stage === 'completed'
    ? { ...EMPTY_DAY_JOURNEY, stage: 'outbound', startedAt: action.at } : state;
  if (action.type === 'bus-completed') {
    const trip = action.session;
    if (trip.phase !== 'completed' || !trip.completedAt || state.startedAt === null || trip.startedAt < state.startedAt || !trip.events.some(event => event.type === 'boarded')) return state;
    const help = trip.events.filter(event => event.type === 'help_requested').length;
    if (state.stage === 'outbound' && trip.destination === 'library' && trip.stop === 'library')
      return { ...state, stage: 'working', outwardTrip: trip.id, askedForHelp: state.askedForHelp + help, recoveredTrips: state.recoveredTrips + Number(getBusResult(trip).recovered) };
    if (state.stage === 'returning' && trip.destination === 'village' && trip.stop === 'village')
      return { ...state, stage: 'home', returnTrip: trip.id, askedForHelp: state.askedForHelp + help, recoveredTrips: state.recoveredTrips + Number(getBusResult(trip).recovered) };
    return state;
  }
  if (action.type === 'work-completed') {
    const result = getLibraryResult(action.session);
    if (state.stage !== 'working' || !result || action.session.phase !== 'finished' || state.startedAt === null || action.session.startedAt < state.startedAt
      || result.correctlyShelved + result.handedOff !== result.total || result.visitorsResolved !== result.visitorsTotal) return state;
    return { ...state, stage: 'returning', booksSorted: action.session.books.filter(book => book.location === 'shelf').length,
      visitorsHelped: action.session.visitors.filter(visitor => visitor.status === 'resolved').length,
      askedForHelp: state.askedForHelp + action.session.events.filter(event => event.type === 'librarian_asked').length };
  }
  return state.stage === 'home' ? { ...state, stage: 'completed', completedAt: action.at } : state;
}

// Keep a single journey across screens and map visits. Native snapshots last for this
// app session, matching the local episode stores; no server/account progress is inferred.
let current: DayJourney = EMPTY_DAY_JOURNEY;
let libraryDraft: LibrarySession | undefined;
let busDraft: BusSession | undefined;
const listeners = new Set<() => void>();
export function getDayJourney() { return current; }
export function dispatchDayJourney(action: DayJourneyAction) {
  const next = reduceDayJourney(current, action);
  if (next !== current) {
    if (action.type === 'start') { libraryDraft = undefined; busDraft = undefined; }
    if (action.type === 'bus-completed') busDraft = undefined;
    current = next;
    listeners.forEach(listener => listener());
  }
  return current;
}
export function keepDayLibraryDraft(session: LibrarySession) {
  if (current.stage === 'working' || current.stage === 'returning') libraryDraft = session;
}
export function getDayLibraryDraft() { return libraryDraft; }
export function keepDayBusDraft(session: BusSession) {
  if ((current.stage === 'outbound' && session.destination === 'library') || (current.stage === 'returning' && session.destination === 'village'))
    busDraft = session.phase === 'completed' ? undefined : session;
}
export function getDayBusDraft() { return busDraft; }
export function clearDayBusDraft() { busDraft = undefined; }
export function resetDayJourneyForTests() { current = EMPTY_DAY_JOURNEY; libraryDraft = undefined; busDraft = undefined; listeners.forEach(listener => listener()); }
export function useDayJourney() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getDayJourney, () => EMPTY_DAY_JOURNEY);
}
