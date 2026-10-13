import { createBusSession, reduceBusSession, type BusAction, type BusSession } from '../src/game/busSession';
import { applyLibraryAction, createLibrarySession, getLibraryBook, getLibraryProgress, type LibrarySession } from '../src/game/librarySession';
import { EMPTY_DAY_JOURNEY, reduceDayJourney, dispatchDayJourney, getDayJourney, keepDayBusDraft, getDayBusDraft, getDayLibraryDraft, keepDayLibraryDraft, resetDayJourneyForTests } from '../src/game/dayJourney';

function busActions(session: BusSession, actions: BusAction[]) {
  return actions.reduce((state, action) => { const next = reduceBusSession(state, action); expect(next.lastActionError).toBeNull(); return next; }, session);
}
export function finishedTrip(destination: 'library' | 'village', startedAt = 200): BusSession {
  let session = createBusSession({ destination, startedAt, phase: 'waiting', cardPacked: true, routeOpened: true });
  session = busActions(session, [{ type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' }, { type: 'TAP_BOARDING_CARD' }, { type: 'HOLD_HANDRAIL' }, { type: 'DEPART' }, { type: 'REACH_NEXT_STOP' }, { type: 'REQUEST_STOP' }, { type: 'REACH_NEXT_STOP' }, { type: 'STAND_UP' }, { type: 'TAP_ALIGHTING_CARD' }, { type: 'ALIGHT' }]);
  return busActions(session, destination === 'library' ? [{ type: 'CROSS_ROAD' }, { type: 'REPORT_ARRIVAL', at: 500 }] : [{ type: 'COMPLETE_JOURNEY', at: 900 }]);
}
export function finishedShift(startedAt = 550): LibrarySession {
  let session = applyLibraryAction(createLibrarySession({ startedAt, seed: 'day-journey', visitorCount: 1, requestMode: 'find', bookCount: 6 }), { type: 'acceptTask' });
  for (const item of session.books) {
    session = applyLibraryAction(session, { type: 'collectBook', bookId: item.bookId });
    if (item.damagedLabel) {
      session = applyLibraryAction(session, { type: 'inspectBook', bookId: item.bookId });
      session = applyLibraryAction(session, { type: 'askLibrarian', bookId: item.bookId });
      session = applyLibraryAction(session, { type: 'handoffBook', bookId: item.bookId });
    } else session = applyLibraryAction(session, { type: 'placeBook', bookId: item.bookId, shelfId: getLibraryBook(item.bookId)!.categoryId });
  }
  session = applyLibraryAction(session, { type: 'talkVisitor' });
  session = applyLibraryAction(session, { type: 'lookupVisitor' });
  const shelfId = getLibraryBook(session.visitors[0].bookId)!.categoryId;
  session = applyLibraryAction(session, { type: 'guideVisitor', shelfId });
  session = applyLibraryAction(session, { type: 'finishVisitorGuide', shelfId });
  const progress = getLibraryProgress(session);
  session = applyLibraryAction(session, { type: 'report', shelvedCount: progress.correctlyShelved, handedOffCount: progress.handedOff });
  expect(session.phase).toBe('finished');
  return session;
}
beforeEach(resetDayJourneyForTests);

it('requires actual outbound ride, completed library work, return ride and home in order', () => {
  let day = reduceDayJourney(EMPTY_DAY_JOURNEY, { type: 'start', at: 100 });
  expect(reduceDayJourney(day, { type: 'arrive-home', at: 101 })).toBe(day);
  expect(reduceDayJourney(day, { type: 'work-completed', session: finishedShift() })).toBe(day);
  day = reduceDayJourney(day, { type: 'bus-completed', session: finishedTrip('library') });
  expect(day.stage).toBe('working');
  day = reduceDayJourney(day, { type: 'work-completed', session: finishedShift() });
  expect(day).toMatchObject({ stage: 'returning', booksSorted: 5, visitorsHelped: 1, askedForHelp: 1 });
  expect(reduceDayJourney(day, { type: 'arrive-home', at: 700 })).toBe(day);
  day = reduceDayJourney(day, { type: 'bus-completed', session: finishedTrip('village', 800) });
  expect(day.stage).toBe('home');
  day = reduceDayJourney(day, { type: 'arrive-home', at: 1000 });
  expect(day).toMatchObject({ stage: 'completed', completedAt: 1000 });
});

it('does not advance on shortcuts, old records, wrong buses or duplicate completion callbacks', () => {
  const started = reduceDayJourney(EMPTY_DAY_JOURNEY, { type: 'start', at: 100 });
  expect(reduceDayJourney(started, { type: 'bus-completed', session: finishedTrip('library', 50) })).toBe(started);
  let wrong = createBusSession({ startedAt: 150, phase: 'waiting', cardPacked: true });
  wrong = busActions(wrong, [{ type: 'ARRIVE_VEHICLE', route: '305' }, { type: 'BOARD' }, { type: 'TAP_BOARDING_CARD' }, { type: 'HOLD_HANDRAIL' }, { type: 'DEPART' }, { type: 'REACH_NEXT_STOP' }]);
  expect(reduceDayJourney(started, { type: 'bus-completed', session: wrong })).toBe(started);
  const shortcut = { ...createBusSession({ startedAt: 160, stop: 'library', direction: 'inbound', cardPacked: true }), phase: 'completed', completedAt: 200 } as BusSession;
  expect(reduceDayJourney(started, { type: 'bus-completed', session: shortcut })).toBe(started);
  const arrived = reduceDayJourney(started, { type: 'bus-completed', session: finishedTrip('library') });
  expect(reduceDayJourney(arrived, { type: 'bus-completed', session: finishedTrip('library') })).toBe(arrived);
  expect(reduceDayJourney(arrived, { type: 'work-completed', session: finishedShift(20) })).toBe(arrived);
});

it('keeps the current bus and library work across screen visits and clears them for a new day', () => {
  dispatchDayJourney({ type: 'start', at: 100 });
  const trip = createBusSession({ startedAt: 200 }); keepDayBusDraft(trip);
  expect(getDayBusDraft()).toBe(trip);
  dispatchDayJourney({ type: 'bus-completed', session: finishedTrip('library') });
  expect(getDayBusDraft()).toBeUndefined();
  const shift = createLibrarySession({ startedAt: 550 }); keepDayLibraryDraft(shift);
  expect(getDayLibraryDraft()).toBe(shift);
  expect(getDayJourney().stage).toBe('working');
  expect(dispatchDayJourney({ type: 'start', at: 600 }).stage).toBe('working');
  expect(getDayLibraryDraft()).toBe(shift);
});
