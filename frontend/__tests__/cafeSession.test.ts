import {
  CAFE_GUESTS, CAFE_RECIPES, applyCafeAction, canReportCafeShift, createCafeSession,
  getCafeObjective, getCafeRecipe, getCafeResult, getCurrentCafeGuest,
  type CafeAction, type CafeSession,
} from '../src/game/cafeSession';

const make = () => createCafeSession({ id: 'test-cafe', now: 100 });
const apply = (session: CafeSession, ...actions: CafeAction[]) => actions.reduce(applyCafeAction, session);
const start = () => applyCafeAction(make(), { type: 'START' });
function takeOrder(session: CafeSession): CafeSession {
  const ordered = applyCafeAction(session, { type: 'TAKE_ORDER' });
  return getCurrentCafeGuest(ordered)!.stage === 'order-change'
    ? applyCafeAction(ordered, { type: 'ACKNOWLEDGE_CHANGE' }) : ordered;
}
function prepare(session: CafeSession): CafeSession {
  const recipe = getCafeRecipe(session)!;
  const cup = applyCafeAction(session, { type: 'CHOOSE_CUP', cup: recipe.cup });
  return applyCafeAction(recipe.ingredients.reduce((state, ingredient) => applyCafeAction(state, { type: 'ADD_INGREDIENT', ingredient }), cup), { type: 'FINISH_DRINK' });
}
function serveAndClean(session: CafeSession): CafeSession {
  return apply(session, { type: 'PICK_UP_TRAY' }, { type: 'SERVE', guestId: getCurrentCafeGuest(session)!.guestId }, { type: 'CLEAN_TABLE' });
}
function readyToReport(session = start()): CafeSession {
  for (let index = 0; index < CAFE_GUESTS.length; index++) {
    session = serveAndClean(prepare(takeOrder(session)));
    if (index < CAFE_GUESTS.length - 1) session = applyCafeAction(session, { type: 'NEXT_GUEST' });
  }
  return session;
}

describe('cafe shift', () => {
  it('connects taking three orders, assembling, carrying, serving, cleaning and reporting', () => {
    const ready = readyToReport();
    expect(ready.guests.map(guest => guest.guestId)).toEqual(['minsu', 'jiyoung', 'sujin']);
    expect(ready.guests.map(guest => guest.recipeId)).toEqual(['iced-latte', 'iced-americano', 'iced-peach-tea']);
    expect(ready.guests.every(guest => guest.stage === 'cleaned')).toBe(true);
    expect(canReportCafeShift(ready)).toBe(true);
    expect(getCafeResult(ready)).toBeNull();
    expect(getCafeObjective(ready)).toBe('동료에게 근무 완료 알리기');
    const finished = applyCafeAction(ready, { type: 'REPORT', now: 200 });
    expect(finished).toMatchObject({ id: 'test-cafe', phase: 'finished', completedAt: 200 });
    expect(getCafeResult(finished)).toMatchObject({ sessionId: 'test-cafe', guestsServed: 3, tablesCleaned: 3,
      orderChangeConfirmed: true, askedAgain: 0, helpUsed: 0, remakes: 0 });
    expect(getCafeResult(finished)!.facts).toEqual([
      '손님 3명에게 주문한 음료를 건넸어요.', '사용한 자리 3곳을 정리했어요.', '지영의 변경된 주문을 확인했어요.',
    ]);
  });

  it('requires accepting work before starting an order and reporting all work after it is complete', () => {
    const briefing = make();
    expect(applyCafeAction(briefing, { type: 'TAKE_ORDER' })).toMatchObject({ phase: 'briefing', lastActionError: expect.any(String) });
    expect(applyCafeAction(start(), { type: 'REPORT', now: 200 }).phase).toBe('working');
    expect(getCafeObjective(briefing)).toBe('동료에게 업무 받기');
    expect(getCafeObjective(start())).toBe('민수에게 주문 받기');
  });

  it('requires acknowledging the one changed order before preparation and uses the changed drink', () => {
    const firstCleaned = serveAndClean(prepare(takeOrder(start())));
    const second = apply(firstCleaned, { type: 'NEXT_GUEST' }, { type: 'TAKE_ORDER' });
    expect(getCurrentCafeGuest(second)).toMatchObject({ guestId: 'jiyoung', recipeId: 'hot-americano', stage: 'order-change', orderConfirmed: false });
    const premature = apply(second, { type: 'CHOOSE_CUP', cup: 'mug' }, { type: 'ADD_INGREDIENT', ingredient: 'water' }, { type: 'FINISH_DRINK' });
    expect(getCurrentCafeGuest(premature)).toMatchObject({ stage: 'order-change', cup: null, ingredients: [] });
    const asked = applyCafeAction(second, { type: 'ASK_AGAIN' });
    expect(getCurrentCafeGuest(asked)!.stage).toBe('order-change');
    const confirmed = applyCafeAction(asked, { type: 'ACKNOWLEDGE_CHANGE' });
    expect(getCurrentCafeGuest(confirmed)).toMatchObject({ recipeId: 'iced-americano', orderConfirmed: true, stage: 'preparing', askedAgain: true });
    expect(getCafeRecipe(confirmed)!.ingredients).toContain('ice');
    expect(CAFE_GUESTS.filter(guest => guest.changedOrder)).toHaveLength(1);
  });

  it('never changes the first or last order through an accidental acknowledgement', () => {
    const ordered = takeOrder(start());
    const unchanged = applyCafeAction(ordered, { type: 'ACKNOWLEDGE_CHANGE' });
    expect(unchanged.guests).toBe(ordered.guests);
    expect(getCurrentCafeGuest(unchanged)!.recipeId).toBe('iced-latte');
  });

  it('does not advance by skipping a completed drink, tray or table cleanup', () => {
    const ordered = takeOrder(start());
    for (const action of [{ type: 'PICK_UP_TRAY' }, { type: 'SERVE', guestId: 'minsu' }, { type: 'CLEAN_TABLE' }, { type: 'NEXT_GUEST' }] as CafeAction[]) {
      const rejected = applyCafeAction(ordered, action);
      expect(rejected.guestIndex).toBe(0);
      expect(rejected.guests).toBe(ordered.guests);
      expect(rejected.lastActionError).toBeTruthy();
    }
    const ready = prepare(ordered);
    expect(getCurrentCafeGuest(applyCafeAction(ready, { type: 'SERVE', guestId: 'minsu' }))!.stage).toBe('ready');
    const served = apply(ready, { type: 'PICK_UP_TRAY' }, { type: 'SERVE', guestId: 'minsu' });
    expect(applyCafeAction(served, { type: 'NEXT_GUEST' }).guestIndex).toBe(0);
  });

  it('keeps the tray after choosing the wrong guest and allows the correct delivery', () => {
    const carried = applyCafeAction(prepare(takeOrder(start())), { type: 'PICK_UP_TRAY' });
    const wrong = applyCafeAction(carried, { type: 'SERVE', guestId: 'sujin' });
    expect(wrong.lastActionError).toContain('민수');
    expect(getCurrentCafeGuest(wrong)!.stage).toBe('carrying');
    const right = applyCafeAction(wrong, { type: 'SERVE', guestId: 'minsu' });
    expect(getCurrentCafeGuest(right)!.stage).toBe('served');
    expect(right.lastActionError).toBeNull();
  });

  it('gives recoverable feedback for missing ingredients without losing the drink', () => {
    const milk = apply(takeOrder(start()), { type: 'CHOOSE_CUP', cup: 'glass' }, { type: 'ADD_INGREDIENT', ingredient: 'milk' });
    const incomplete = applyCafeAction(milk, { type: 'FINISH_DRINK' });
    expect(incomplete.lastActionError).toContain('얼음');
    expect(incomplete.lastActionError).toContain('에스프레소');
    expect(getCurrentCafeGuest(incomplete)!.ingredients).toEqual(['milk']);
    const complete = apply(incomplete, { type: 'ADD_INGREDIENT', ingredient: 'espresso' }, { type: 'ADD_INGREDIENT', ingredient: 'ice' }, { type: 'FINISH_DRINK' });
    expect(getCurrentCafeGuest(complete)!.stage).toBe('ready');
  });

  it('lets a wrong cup or unwanted ingredient be remade with no failure or score loss', () => {
    const wrongCup = apply(takeOrder(start()), { type: 'CHOOSE_CUP', cup: 'mug' }, { type: 'ADD_INGREDIENT', ingredient: 'milk' }, { type: 'FINISH_DRINK' });
    expect(wrongCup.lastActionError).toContain('차가운 음료 컵');
    const cupSwitch = applyCafeAction(wrongCup, { type: 'CHOOSE_CUP', cup: 'glass' });
    expect(getCurrentCafeGuest(cupSwitch)!.cup).toBe('mug');
    const reset = applyCafeAction(cupSwitch, { type: 'REMAKE' });
    expect(getCurrentCafeGuest(reset)).toMatchObject({ stage: 'preparing', cup: null, ingredients: [], remakes: 1 });
    const extra = apply(reset, { type: 'CHOOSE_CUP', cup: 'glass' }, { type: 'ADD_INGREDIENT', ingredient: 'peach' }, { type: 'FINISH_DRINK' });
    expect(extra.lastActionError).toContain('복숭아 베이스');
    const ready = prepare(applyCafeAction(extra, { type: 'REMAKE' }));
    expect(getCurrentCafeGuest(ready)).toMatchObject({ stage: 'ready', remakes: 2 });
    expect(ready.phase).toBe('working');
  });

  it('allows equivalent assembly orders and cup changes before ingredients have been added', () => {
    const selected = apply(takeOrder(start()), { type: 'CHOOSE_CUP', cup: 'mug' }, { type: 'CHOOSE_CUP', cup: 'glass' });
    const made = apply(selected, { type: 'ADD_INGREDIENT', ingredient: 'espresso' }, { type: 'ADD_INGREDIENT', ingredient: 'milk' }, { type: 'ADD_INGREDIENT', ingredient: 'ice' }, { type: 'FINISH_DRINK' });
    expect(getCurrentCafeGuest(made)).toMatchObject({ cup: 'glass', stage: 'ready', remakes: 0 });
  });

  it('does not add ingredients before a cup and does not add a second portion on repeated taps', () => {
    const ordered = takeOrder(start());
    expect(getCurrentCafeGuest(applyCafeAction(ordered, { type: 'ADD_INGREDIENT', ingredient: 'milk' }))!.ingredients).toEqual([]);
    const added = apply(ordered, { type: 'CHOOSE_CUP', cup: 'glass' }, { type: 'ADD_INGREDIENT', ingredient: 'milk' }, { type: 'ADD_INGREDIENT', ingredient: 'milk' });
    expect(getCurrentCafeGuest(added)!.ingredients).toEqual(['milk']);
    expect(added.lastActionError).toContain('이미');
  });

  it('permits help and repeat questions without auto-preparing or penalizing the guest', () => {
    const asked = apply(takeOrder(start()), { type: 'ASK_AGAIN' }, { type: 'ASK_HELP' });
    expect(getCurrentCafeGuest(asked)).toMatchObject({ stage: 'preparing', askedAgain: true, helpUsed: true, cup: null });
    const completed = applyCafeAction(readyToReport(asked), { type: 'REPORT', now: 200 });
    expect(getCafeResult(completed)!.facts).toContain('손님에게 주문을 다시 물어봤어요.');
    expect(getCafeResult(completed)!.facts).toContain('동료에게 도움을 요청했어요.');
  });

  it('does not count the same delivery, cleaning or finish twice', () => {
    const served = apply(prepare(takeOrder(start())), { type: 'PICK_UP_TRAY' }, { type: 'SERVE', guestId: 'minsu' });
    expect(applyCafeAction(served, { type: 'SERVE', guestId: 'minsu' }).guests).toBe(served.guests);
    const cleaned = applyCafeAction(served, { type: 'CLEAN_TABLE' });
    expect(applyCafeAction(cleaned, { type: 'CLEAN_TABLE' }).guests).toBe(cleaned.guests);
    const complete = applyCafeAction(readyToReport(), { type: 'REPORT', now: 200 });
    for (const action of [{ type: 'REPORT', now: 300 }, { type: 'NEXT_GUEST' }, { type: 'ASK_HELP' }, { type: 'REMAKE' }, { type: 'START' }] as CafeAction[]) {
      expect(applyCafeAction(complete, action)).toBe(complete);
    }
  });

  it('does not produce completed results from unfinished or forged work', () => {
    const ready = readyToReport();
    const malformed = { ...ready, guests: ready.guests.map((guest, index) => index === 1 ? { ...guest, recipeId: 'hot-americano' as const } : guest) };
    expect(canReportCafeShift(malformed)).toBe(false);
    expect(getCafeResult({ ...malformed, phase: 'finished', completedAt: 200 })).toBeNull();
    expect(getCafeResult({ ...make(), phase: 'finished', completedAt: 200 })).toBeNull();
    expect(canReportCafeShift({ ...ready, guests: [] })).toBe(false);
  });

  it('rejects invalid completion times and keeps a stable session identity', () => {
    const ready = readyToReport();
    for (const now of [99, NaN, Infinity]) {
      expect(applyCafeAction(ready, { type: 'REPORT', now }).phase).toBe('working');
    }
    expect(ready.id).toBe(make().id);
    expect(getCafeResult({ ...ready, phase: 'finished', completedAt: NaN })).toBeNull();
  });

  it('resets explicitly with a new session ID and fresh order state', () => {
    const old = applyCafeAction(readyToReport(), { type: 'REPORT', now: 200 });
    const reset = applyCafeAction(old, { type: 'RESET', id: 'next-cafe', now: 300 });
    expect(reset).toMatchObject({ id: 'next-cafe', startedAt: 300, phase: 'briefing', guestIndex: 0, completedAt: null });
    expect(reset.guests.every(guest => guest.stage === 'waiting' && !guest.orderConfirmed)).toBe(true);
    expect(createCafeSession({ now: 100 }).id).not.toBe(createCafeSession({ now: 100 }).id);
  });

  it('replays the same explicit inputs deterministically without mutating the previous state', () => {
    const previous = make();
    Object.freeze(previous);
    Object.freeze(previous.guests);
    previous.guests.forEach(guest => { Object.freeze(guest); Object.freeze(guest.ingredients); });
    const first = apply(previous, { type: 'START' }, { type: 'TAKE_ORDER' }, { type: 'CHOOSE_CUP', cup: 'glass' });
    const second = apply(make(), { type: 'START' }, { type: 'TAKE_ORDER' }, { type: 'CHOOSE_CUP', cup: 'glass' });
    expect(first).toEqual(second);
    expect(previous.phase).toBe('briefing');
    expect(previous.guests[0].cup).toBeNull();
    expect(readyToReport()).toEqual(readyToReport());
  });

  it('keeps the hot recipe available for recipe-book reference, separate from the changed order', () => {
    expect(CAFE_RECIPES['hot-americano']).toMatchObject({ cup: 'mug', ingredients: ['water', 'espresso'] });
    expect(CAFE_RECIPES['iced-americano']).toMatchObject({ cup: 'glass', ingredients: ['ice', 'water', 'espresso'] });
  });
});
