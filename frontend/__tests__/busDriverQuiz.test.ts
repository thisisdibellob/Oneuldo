import { BUS_DRIVER_QUIZ_IDS, getBusDriverQuiz } from '../src/game/busDriverQuiz';
import { createBusSession, getBusResult, reduceBusSession, type BusAction, type BusSession } from '../src/game/busSession';

const apply = (session: BusSession, ...actions: BusAction[]) => actions.reduce(reduceBusSession, session);
const begin = (destination: 'library' | 'village' = 'library') => apply(createBusSession({ id: 'quiz-test', startedAt: 100, phase: 'waiting', cardPacked: true, destination }), { type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' });

it('offers one quiz per boarding, with unique questions on subsequent boardings and a different return question', () => {
  let session = begin();
  const first = getBusDriverQuiz(session)!.quiz.id;
  const ids = new Set<string>();
  for (let index = 0; index < BUS_DRIVER_QUIZ_IDS.length; index++) {
    const quiz = getBusDriverQuiz(session)!;
    expect(quiz.status).toBe('available'); expect(ids.has(quiz.quiz.id)).toBe(false); ids.add(quiz.quiz.id);
    session = apply(session, { type: 'LEAVE_BEFORE_DEPARTURE' }, { type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' });
  }
  expect(ids.size).toBe(BUS_DRIVER_QUIZ_IDS.length);
  expect(getBusDriverQuiz(begin('village'))!.quiz.id).not.toBe(first);
});

it('does not open during travel or before card approval, and a wrong answer never prevents departure', () => {
  let session = begin();
  expect(reduceBusSession(session, { type: 'OPEN_DRIVER_QUIZ' })).toBe(session);
  session = apply(session, { type: 'TAP_BOARDING_CARD' }, { type: 'OPEN_DRIVER_QUIZ' });
  const quiz = getBusDriverQuiz(session)!;
  const wrong = quiz.quiz.choices.find(choice => choice.id !== quiz.quiz.correctChoiceId)!;
  session = apply(session, { type: 'ANSWER_DRIVER_QUIZ', quizId: quiz.quiz.id, choiceId: wrong.id });
  expect(getBusDriverQuiz(session)).toMatchObject({ status: 'answered', correct: false });
  const answered = session;
  expect(reduceBusSession(session, { type: 'ANSWER_DRIVER_QUIZ', quizId: quiz.quiz.id, choiceId: quiz.quiz.correctChoiceId })).toBe(answered);
  expect(reduceBusSession(session, { type: 'OPEN_DRIVER_QUIZ' })).toBe(answered);
  session = apply(session, { type: 'HOLD_HANDRAIL' }, { type: 'DEPART' });
  expect(session.phase).toBe('riding'); expect(session.lastActionError).toBeNull();
  expect(getBusResult(session).wrongDepartures).toBe(0);
  expect(reduceBusSession(session, { type: 'OPEN_DRIVER_QUIZ' })).toBe(session);
});

it('skips once without requiring a correct answer and persists this choice across a JSON round trip', () => {
  let session = apply(begin(), { type: 'TAP_BOARDING_CARD' }, { type: 'OPEN_DRIVER_QUIZ' }, { type: 'DISMISS_DRIVER_QUIZ' });
  session = JSON.parse(JSON.stringify(session)) as BusSession;
  expect(getBusDriverQuiz(session)?.status).toBe('skipped');
  expect(reduceBusSession(session, { type: 'OPEN_DRIVER_QUIZ' })).toBe(session);
  const quiz = getBusDriverQuiz(session)!;
  expect(reduceBusSession(session, { type: 'ANSWER_DRIVER_QUIZ', quizId: quiz.quiz.id, choiceId: quiz.quiz.correctChoiceId })).toBe(session);
  session = apply(session, { type: 'TAKE_SEAT' }, { type: 'DEPART' });
  expect(session.phase).toBe('riding');
});

it('ignores stale quiz IDs and choice IDs and keeps old sessions without quiz metadata playable', () => {
  const session = apply(begin(), { type: 'TAP_BOARDING_CARD' }, { type: 'OPEN_DRIVER_QUIZ' });
  const quiz = getBusDriverQuiz(session)!;
  expect(reduceBusSession(session, { type: 'ANSWER_DRIVER_QUIZ', quizId: 'stale', choiceId: quiz.quiz.correctChoiceId })).toBe(session);
  expect(reduceBusSession(session, { type: 'ANSWER_DRIVER_QUIZ', quizId: quiz.quiz.id, choiceId: 'unknown' })).toBe(session);
  const legacy = begin();
  legacy.events.forEach(event => { delete event.payload.quizId; });
  expect(getBusDriverQuiz(legacy)).toBeNull();
  expect(apply(legacy, { type: 'TAP_BOARDING_CARD' }, { type: 'TAKE_SEAT' }, { type: 'DEPART' }).phase).toBe('riding');
});
