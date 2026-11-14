import {
  PHISHING_SCENARIOS, canCompletePhishingSession, createPhishingSession,
  getPhishingFacts, getPhishingGoal, reducePhishingSession,
  type PhishingAction, type PhishingScenarioId, type PhishingSession,
} from '../src/game/phishingSession';
import { clearPhishingSession, dispatchPhishingAction, getPhishingSession, startPhishingEpisode } from '../src/game/phishingStore';

const make = (id: PhishingScenarioId = 'friend-scam') => createPhishingSession(id, 'test-episode', 100);
const apply = (state: PhishingSession, ...actions: PhishingAction[]) => actions.reduce(reducePhishingSession, state);
const stopAndVerify = (state: PhishingSession) => apply(state,
  { type: 'STOP' }, { type: 'VERIFY', method: PHISHING_SCENARIOS[state.scenarioId].verificationMethods[0] });

describe('phishing episode safety and recovery', () => {
  it.each<PhishingScenarioId>(['friend-scam', 'authority', 'parcel'])('%s finishes only after an independent check and ending the contact', scenarioId => {
    const start = make(scenarioId);
    expect(reducePhishingSession(start, { type: 'FINISH', now: 200 })).toBe(start);
    const verified = stopAndVerify(start);
    expect(canCompletePhishingSession(verified)).toBe(false);
    const ready = reducePhishingSession(verified, { type: 'BLOCK' });
    expect(canCompletePhishingSession(ready)).toBe(true);
    const completed = reducePhishingSession(ready, { type: 'FINISH', now: 200 });
    expect(completed).toMatchObject({ status: 'completed', completedAt: 200, exposure: 'none' });
    expect(getPhishingFacts(completed)).not.toContain('112에 상황과 연락 내용을 알리는 연습을 했어요.');
  });

  it('does not reward blocking every unfamiliar contact without checking', () => {
    const blocked = reducePhishingSession(make(), { type: 'BLOCK' });
    expect(blocked).toMatchObject({ blocked: true, contactEnded: true });
    expect(reducePhishingSession(blocked, { type: 'FINISH', now: 200 })).toBe(blocked);
    expect(canCompletePhishingSession(blocked)).toBe(false);
    expect(canCompletePhishingSession(stopAndVerify(blocked))).toBe(true);
  });

  it('only accepts checks outside the ongoing contact and appropriate to the scenario', () => {
    const start = make();
    expect(reducePhishingSession(start, { type: 'VERIFY', method: 'saved-contact' })).toBe(start);
    const stopped = reducePhishingSession(start, { type: 'STOP' });
    expect(reducePhishingSession(stopped, { type: 'VERIFY', method: 'order-history' })).toBe(stopped);
    const verified = reducePhishingSession(stopped, { type: 'VERIFY', method: 'in-person' });
    expect(verified.verification).toEqual({ method: 'in-person', verdict: 'scam', text: PHISHING_SCENARIOS['friend-scam'].verificationText });
    expect(reducePhishingSession(verified, { type: 'VERIFY', method: 'saved-contact' })).toBe(verified);
  });

  it.each(['accept', 'decline'] as const)('accepts a verified genuine contact with personal choice: %s', decision => {
    const start = make('friend-real');
    expect(reducePhishingSession(start, { type: 'GENUINE_DECISION', decision })).toBe(start);
    expect(reducePhishingSession(start, { type: 'SIMULATE_EXPOSURE', exposure: 'money' })).toBe(start);
    const verified = stopAndVerify(start);
    expect(canCompletePhishingSession(verified)).toBe(false);
    const completed = apply(verified, { type: 'GENUINE_DECISION', decision }, { type: 'FINISH', now: 200 });
    expect(completed).toMatchObject({ status: 'completed', genuineDecision: decision, blocked: false, reported: false });
    expect(getPhishingFacts(completed).at(-1)).toBe(decision === 'accept'
      ? '민수의 연락임을 확인한 뒤 약속을 정했어요.' : '민수의 연락임을 확인한 뒤 이번 약속은 사양했어요.');
  });

  it('does not present indiscriminate blocking of a genuine contact as a successful action', () => {
    const blocked = reducePhishingSession(make('friend-real'), { type: 'BLOCK' });
    expect(canCompletePhishingSession(blocked)).toBe(false);
    expect(getPhishingFacts(blocked).some(fact => fact.includes('차단'))).toBe(false);
    const completed = apply(stopAndVerify(blocked), { type: 'GENUINE_DECISION', decision: 'decline' }, { type: 'FINISH', now: 200 });
    expect(completed.status).toBe('completed');
    expect(getPhishingFacts(completed).some(fact => fact.includes('차단'))).toBe(false);
    const verifiedScam = reducePhishingSession(stopAndVerify(make()), { type: 'BLOCK' });
    expect(getPhishingFacts(verifiedScam)).toContain('확인한 사칭 연락을 차단했어요.');
  });

  it('does not penalize replying or help seeking before choosing to stop', () => {
    const state = apply(make(), { type: 'REPLY' }, { type: 'ASK_HELP' });
    expect(state).toMatchObject({ replied: true, askedForHelp: true, exposure: 'none', verification: null });
    const completed = apply(stopAndVerify(state), { type: 'BLOCK' }, { type: 'FINISH', now: 200 });
    expect(completed.status).toBe('completed');
    expect(getPhishingFacts(completed)).toContain('지영에게 도움을 요청했어요.');
    const stopped = reducePhishingSession(make(), { type: 'STOP' });
    expect(reducePhishingSession(stopped, { type: 'ASK_HELP' }).askedForHelp).toBe(true);
    expect(reducePhishingSession(stopped, { type: 'REPLY' })).toBe(stopped);
  });

  it.each(['information', 'money'] as const)('supports recovery from %s without waiting to verify before seeking urgent help', exposure => {
    const exposed = reducePhishingSession(make('authority'), { type: 'SIMULATE_EXPOSURE', exposure });
    expect(exposed.exposure).toBe(exposure);
    expect(reducePhishingSession(exposed, { type: 'REPORT' })).toBe(exposed);
    expect(reducePhishingSession(exposed, { type: 'CONTACT_BANK' })).toBe(exposed);
    const stopped = reducePhishingSession(exposed, { type: 'STOP' });
    expect(getPhishingGoal(stopped)).toBe('112에 상황을 알리기');
    const reported = reducePhishingSession(stopped, { type: 'REPORT' });
    expect(reported.reported).toBe(true);
    expect(getPhishingGoal(reported)).toBe(exposure === 'money' ? '금융회사에 지급정지 요청하기' : '금융회사에 정보 노출을 알리기');
    const supported = reducePhishingSession(reported, { type: 'CONTACT_BANK' });
    expect(supported.bankContacted).toBe(true);
    expect(canCompletePhishingSession(supported)).toBe(false);
    const ready = apply(supported, { type: 'VERIFY', method: 'official-contact' }, { type: 'BLOCK' });
    expect(canCompletePhishingSession(ready)).toBe(true);
    expect(canCompletePhishingSession({ ...ready, reported: false })).toBe(false);
    expect(canCompletePhishingSession({ ...ready, bankContacted: false })).toBe(false);
    const completed = reducePhishingSession(ready, { type: 'FINISH', now: 200 });
    expect(completed.status).toBe('completed');
    expect(getPhishingFacts(completed).join(' ')).toContain('연습');
    expect(getPhishingFacts(completed).join(' ')).not.toContain('돌려받았어요');
  });

  it('allows simulated escalation while open but never clears an exposure or creates one after stopping', () => {
    const information = reducePhishingSession(make('parcel'), { type: 'SIMULATE_EXPOSURE', exposure: 'information' });
    const money = reducePhishingSession(information, { type: 'SIMULATE_EXPOSURE', exposure: 'money' });
    expect(money.exposure).toBe('money');
    expect(reducePhishingSession(money, { type: 'SIMULATE_EXPOSURE', exposure: 'information' })).toBe(money);
    const stopped = reducePhishingSession(make(), { type: 'STOP' });
    expect(reducePhishingSession(stopped, { type: 'SIMULATE_EXPOSURE', exposure: 'money' })).toBe(stopped);
  });

  it('does not invent recovery or reporting actions for genuine contacts or unexposed sessions', () => {
    const genuine = stopAndVerify(make('friend-real'));
    expect(reducePhishingSession(genuine, { type: 'REPORT' })).toBe(genuine);
    expect(reducePhishingSession(genuine, { type: 'CONTACT_BANK' })).toBe(genuine);
    const stopped = reducePhishingSession(make(), { type: 'STOP' });
    expect(reducePhishingSession(stopped, { type: 'REPORT' })).toBe(stopped);
    expect(reducePhishingSession(stopAndVerify(make()), { type: 'CONTACT_BANK' }).bankContacted).toBe(false);
  });

  it('does not accept fabricated verification methods or a mismatched verdict as complete', () => {
    const ready = reducePhishingSession(stopAndVerify(make()), { type: 'BLOCK' });
    expect(canCompletePhishingSession({ ...ready, verification: { method: 'official-contact', verdict: 'scam', text: '' } })).toBe(false);
    expect(canCompletePhishingSession({ ...ready, verification: { method: 'saved-contact', verdict: 'genuine', text: '' } })).toBe(false);
  });

  it('uses valid completion times and does not change a completed episode', () => {
    const ready = reducePhishingSession(stopAndVerify(make()), { type: 'BLOCK' });
    expect(reducePhishingSession(ready, { type: 'FINISH', now: 99 })).toBe(ready);
    expect(reducePhishingSession(ready, { type: 'FINISH', now: Number.NaN })).toBe(ready);
    const complete = reducePhishingSession(ready, { type: 'FINISH', now: 200 });
    const laterActions: PhishingAction[] = [
      { type: 'ASK_HELP' }, { type: 'REPLY' }, { type: 'STOP' }, { type: 'BLOCK' }, { type: 'REPORT' },
      { type: 'CONTACT_BANK' }, { type: 'VERIFY', method: 'in-person' },
      { type: 'SIMULATE_EXPOSURE', exposure: 'money' }, { type: 'GENUINE_DECISION', decision: 'accept' }, { type: 'FINISH', now: 300 },
    ];
    laterActions.forEach(action => expect(reducePhishingSession(complete, action)).toBe(complete));
  });

  it('allows both independent parcel checks and creates unique IDs even in the same millisecond', () => {
    for (const method of ['official-contact', 'order-history'] as const) {
      const state = apply(make('parcel'), { type: 'STOP' }, { type: 'VERIFY', method });
      expect(state.verification?.method).toBe(method);
    }
    expect(createPhishingSession('parcel', undefined, 100).id).not.toBe(createPhishingSession('parcel', undefined, 100).id);
  });
});

describe('shared in-memory phishing episode', () => {
  afterEach(clearPhishingSession);

  it('keeps the same episode and progress across reads until a new case is explicitly chosen', () => {
    clearPhishingSession();
    expect(getPhishingSession()).toBeNull();
    expect(dispatchPhishingAction({ type: 'STOP' })).toBeNull();
    const initial = startPhishingEpisode('friend-scam');
    const stopped = dispatchPhishingAction({ type: 'STOP' });
    expect(getPhishingSession()).toBe(stopped);
    expect(stopped).toMatchObject({ id: initial.id, contactEnded: true });
    const next = startPhishingEpisode('parcel');
    expect(next.id).not.toBe(initial.id);
    expect(getPhishingSession()).toMatchObject({ scenarioId: 'parcel', contactEnded: false });
    clearPhishingSession();
    expect(getPhishingSession()).toBeNull();
  });
});
