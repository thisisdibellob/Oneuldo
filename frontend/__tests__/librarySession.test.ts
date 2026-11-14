import {
  applyLibraryAction,
  createLibrarySession,
  getLibraryBook,
  getLibraryProgress,
  getLibraryResult,
  getLibraryShelfReferenceBooks,
  isLibraryShelfSlotCorrect,
  LIBRARY_BOOKS,
  LIBRARY_CATEGORIES,
  type LibraryAction,
  type LibraryCategoryId,
  type LibrarySession,
  type LibraryGameConfig,
  normalizeLibraryConfig,
} from '../src/game/librarySession';

it('offers valid numeric shelf positions for every book and accepts equal classification numbers in any adjacent gap', () => {
  for (const book of LIBRARY_BOOKS) {
    const references = getLibraryShelfReferenceBooks(book.categoryId);
    expect(references.every(reference => reference.categoryId === book.categoryId)).toBe(true);
    expect(([0, 1, 2] as const).some(slot => isLibraryShelfSlotCorrect(book.id, book.categoryId, slot))).toBe(true);
  }
  // The exercise intentionally does not pretend to assess author-mark ordering.
  for (const slot of [0, 1, 2] as const) expect(isLibraryShelfSlotCorrect('moon-mail', 'story', slot)).toBe(true);
  expect(isLibraryShelfSlotCorrect('neighborhood-jobs', 'social', 1)).toBe(true); // 321.55 alongside 321.55 and before 330
  expect(isLibraryShelfSlotCorrect('computer-first', 'general', 0)).toBe(true); // 004 before 020
  expect(isLibraryShelfSlotCorrect('computer-first', 'general', 2)).toBe(false);
  expect(isLibraryShelfSlotCorrect('computer-first', 'nature', 0)).toBe(false);
  const allowed = (bookId: string) => ([0, 1, 2] as const).filter(slot => isLibraryShelfSlotCorrect(bookId, getLibraryBook(bookId)!.categoryId, slot));
  expect(allowed('computer-first')).toEqual([0]);
  expect(allowed('knowledge-shelf')).toEqual([2]);
  expect(allowed('money-story')).toEqual([0]);
  expect(allowed('world-neighbors')).toEqual([2]);
  // There is no universal middle-gap solution to the activity.
  expect(LIBRARY_BOOKS.filter(book => !isLibraryShelfSlotCorrect(book.id, book.categoryId, 1)).length).toBeGreaterThan(10);
});

it('keeps a book in hand after an incorrect gap, then permits correcting it without losing shift progress', () => {
  let game = start('order-retry');
  const book = game.books.find(item => item.location === 'carried' && !item.damagedLabel
    && ([0, 1, 2] as const).some(slot => !isLibraryShelfSlotCorrect(item.bookId, getLibraryBook(item.bookId)!.categoryId, slot)))!;
  const shelfId = getLibraryBook(book.bookId)!.categoryId;
  const wrong = ([0, 1, 2] as const).find(slot => !isLibraryShelfSlotCorrect(book.bookId, shelfId, slot))!;
  const right = ([0, 1, 2] as const).find(slot => isLibraryShelfSlotCorrect(book.bookId, shelfId, slot))!;
  const originalBooks = game.books;
  game = applyLibraryAction(game, { type: 'placeBook', bookId: book.bookId, shelfId, slot: wrong });
  expect(game.lastActionError).toContain('작은 책부터');
  expect(game.books).toEqual(originalBooks);
  expect(getLibraryProgress(game).correctlyShelved).toBe(0);
  game = apply(game, { type: 'placeBook', bookId: book.bookId, shelfId, slot: right });
  expect(getLibraryProgress(game).correctlyShelved).toBe(1);
  expect(game.events.filter(event => event.type === 'shelf_order_checked').map(event => event.payload.correct)).toEqual([false, true]);
  expect(game.books.find(item => item.bookId === book.bookId)?.location).toBe('shelf');
});

function apply(session: LibrarySession, action: LibraryAction) {
  const next = applyLibraryAction(session, action);
  expect(next.lastActionError).toBeNull();
  return next;
}

function start(seed = 'library-shift') {
  return apply(apply(createLibrarySession({ requestMode: 'find', seed }), { type: 'acceptTask' }), { type: 'collectAll' });
}

function finishBooks(session: LibrarySession) {
  let game = session;
  for (const book of game.books) {
    if (book.location === 'return-cart') game = apply(game, { type: 'collectBook', bookId: book.bookId });
    if (book.damagedLabel) {
      game = apply(game, { type: 'inspectBook', bookId: book.bookId });
      game = apply(game, { type: 'askLibrarian', bookId: book.bookId });
      game = apply(game, { type: 'handoffBook', bookId: book.bookId });
    } else {
      game = apply(game, { type: 'placeBook', bookId: book.bookId, shelfId: getLibraryBook(book.bookId)!.categoryId });
    }
  }
  return game;
}

function guideVisitor(session: LibrarySession) {
  let game = apply(session, { type: 'talkVisitor' });
  game = apply(game, { type: 'lookupVisitor' });
  const shelfId = getLibraryBook(game.visitors[0].bookId)!.categoryId;
  game = apply(game, { type: 'guideVisitor', shelfId });
  return apply(game, { type: 'finishVisitorGuide', shelfId });
}

function wrongShelf(shelfId: LibraryCategoryId): LibraryCategoryId {
  return LIBRARY_CATEGORIES.find(category => category.id !== shelfId)!.id;
}

it('assigns twelve books across ten classes per shift and makes every catalogue book available for work and visitor requests', () => {
  expect(LIBRARY_BOOKS).toHaveLength(52);
  expect(new Set(LIBRARY_BOOKS.map(book => book.id)).size).toBe(52);
  const selections = new Set<string>();
  const assignedBooks = new Set<string>();
  const visitorBooks = new Set<string>();
  for (let seed = 0; seed < 1000; seed++) {
    const session = createLibrarySession({ requestMode: 'find', seed });
    expect(session).toEqual(createLibrarySession({ requestMode: 'find', seed }));
    expect(session.books).toHaveLength(12);
    expect(new Set(session.books.map(book => book.bookId)).size).toBe(12);
    expect(session.books.filter(book => book.damagedLabel)).toHaveLength(1);
    expect(new Set(session.books.map(book => getLibraryBook(book.bookId)!.categoryId)).size).toBe(10);
    expect(session.books.some(book => book.bookId === session.visitors[0].bookId)).toBe(false);
    expect(getLibraryBook(session.visitors[0].bookId)).toBeDefined();
    selections.add(session.books.map(book => book.bookId).join(','));
    session.books.filter(book => !book.damagedLabel).forEach(book => assignedBooks.add(book.bookId));
    visitorBooks.add(session.visitors[0].bookId);
  }
  expect(selections.size).toBeGreaterThan(20);
  expect([...assignedBooks].sort()).toEqual(LIBRARY_BOOKS.map(book => book.id).sort());
  expect([...visitorBooks].sort()).toEqual(LIBRARY_BOOKS.map(book => book.id).sort());
});

it('completes work, corrects mistakes and guides visitors across all ten classes', () => {
  const shelvedClasses = new Set<LibraryCategoryId>();
  const visitorClasses = new Set<LibraryCategoryId>();
  for (let seed = 0; seed < 200; seed++) {
    let game = start(`all-classes-${seed}`);
    const ordinary = game.books.find(book => !book.damagedLabel)!;
    const shelfId = getLibraryBook(ordinary.bookId)!.categoryId;
    game = apply(game, { type: 'placeBook', bookId: ordinary.bookId, shelfId: wrongShelf(shelfId) });
    expect(getLibraryProgress(game).misplaced).toBe(1);
    game = apply(game, { type: 'takeBook', bookId: ordinary.bookId });
    game = finishBooks(game);
    game.books.filter(book => book.location === 'shelf').forEach(book => shelvedClasses.add(book.shelfId!));
    game = guideVisitor(game);
    visitorClasses.add(getLibraryBook(game.visitors[0].bookId)!.categoryId);
    game = apply(game, { type: 'report', shelvedCount: 11, handedOffCount: 1 });
    expect(game.phase).toBe('finished');
    expect(getLibraryResult(game)).toMatchObject({ correctlyShelved: 11, handedOff: 1, corrections: 1, visitorResolution: 'guided' });
  }
  const allClasses = LIBRARY_CATEGORIES.map(category => category.id).sort();
  expect([...shelvedClasses].sort()).toEqual(allClasses);
  expect([...visitorClasses].sort()).toEqual(allClasses);
});

it('completes a shift with eleven shelved books and one librarian-approved handoff', () => {
  const initial = createLibrarySession({ requestMode: 'find', seed: 'full-shift', startedAt: 1000, sessionId: 'attempt-one' });
  expect(getLibraryResult(initial)).toBeNull();
  let game = apply(initial, { type: 'acceptTask' });
  game = apply(game, { type: 'collectAll' });
  expect(game.books.every(book => book.inspected === false)).toBe(true);
  game = finishBooks(game);
  game = guideVisitor(game);
  expect(getLibraryProgress(game)).toEqual({ total: 12, cartTotal: 12, visitorBookCount: 0, visitorsTotal: 1, visitorsResolved: 1, correctlyShelved: 11, handedOff: 1, misplaced: 0,
    onCart: 0, carried: 0, remaining: 0, visitorResolved: true, canReport: true });
  game = apply(game, { type: 'report', shelvedCount: 11, handedOffCount: 1 });
  expect(game).toMatchObject({ phase: 'finished', sessionId: 'attempt-one', startedAt: 1000 });
  expect(getLibraryResult(game)).toEqual({ total: 12, cartTotal: 12, visitorBookCount: 0, visitorsTotal: 1, visitorsResolved: 1, visitorsGuided: 1, visitorsShelved: 0, visitorsReferred: 0, correctlyShelved: 11, handedOff: 1, firstAttemptCorrect: 11,
    wrongPlacementAttempts: 0, corrections: 0, librarianQuestions: 1, supportUseCount: 0, supportKinds: [],
    visitorResolution: 'guided', visitorLookupUsed: true, visitorWrongAttempts: 0, reportAttempts: 1 });
  expect(game.events.at(-1)).toMatchObject({ type: 'shift_completed', payload: { correctlyShelved: 11, handedOff: 1 } });
  expect(game.events.map(event => event.sequence)).toEqual(game.events.map((_, index) => index + 1));
  expect(initial).toEqual(createLibrarySession({ requestMode: 'find', seed: 'full-shift', startedAt: 1000, sessionId: 'attempt-one' }));
});

it('keeps an incorrect placement physically on the shelf until the player retrieves and corrects it', () => {
  let game = start();
  const book = game.books.find(item => !item.damagedLabel)!;
  const correctShelf = getLibraryBook(book.bookId)!.categoryId;
  const incorrectShelf = wrongShelf(correctShelf);
  game = apply(game, { type: 'placeBook', bookId: book.bookId, shelfId: incorrectShelf });
  expect(game.books.find(item => item.bookId === book.bookId)).toMatchObject({ location: 'shelf', shelfId: incorrectShelf,
    firstShelfId: incorrectShelf, wrongAttempts: 1, corrections: 0 });
  expect(getLibraryProgress(game)).toMatchObject({ correctlyShelved: 0, misplaced: 1, remaining: 12 });
  expect(applyLibraryAction(game, { type: 'placeBook', bookId: book.bookId, shelfId: correctShelf }).lastActionError).toBeTruthy();
  game = apply(game, { type: 'takeBook', bookId: book.bookId });
  game = apply(game, { type: 'placeBook', bookId: book.bookId, shelfId: correctShelf });
  expect(game.books.find(item => item.bookId === book.bookId)).toMatchObject({ location: 'shelf', shelfId: correctShelf,
    firstShelfId: incorrectShelf, placementAttempts: 2, wrongAttempts: 1, corrections: 1 });
  expect(game.events.filter(event => event.type === 'book_placed').map(event => event.payload.correct)).toEqual([false, true]);
  expect(getLibraryProgress(game)).toMatchObject({ correctlyShelved: 1, misplaced: 0, remaining: 11 });
});

it('does not count repeated correct re-shelving as more corrections after several wrong attempts', () => {
  let game = start();
  const book = game.books.find(item => !item.damagedLabel)!;
  const correctShelf = getLibraryBook(book.bookId)!.categoryId;
  for (let index = 0; index < 3; index++) {
    game = apply(game, { type: 'placeBook', bookId: book.bookId, shelfId: wrongShelf(correctShelf) });
    game = apply(game, { type: 'takeBook', bookId: book.bookId });
  }
  game = apply(game, { type: 'placeBook', bookId: book.bookId, shelfId: correctShelf });
  game = apply(game, { type: 'takeBook', bookId: book.bookId });
  game = apply(game, { type: 'placeBook', bookId: book.bookId, shelfId: correctShelf });
  expect(game.books.find(item => item.bookId === book.bookId)).toMatchObject({ wrongAttempts: 3, corrections: 1, needsCorrection: false });
});

it('requires inspection, a librarian question and possession for a damaged-book handoff', () => {
  let game = apply(createLibrarySession({ requestMode: 'find', seed: 'handoff' }), { type: 'acceptTask' });
  const bookId = game.books.find(book => book.damagedLabel)!.bookId;
  const rejected = (action: LibraryAction) => {
    const next = applyLibraryAction(game, action);
    expect(next.lastActionError).toBeTruthy();
    expect(next.books).toEqual(game.books);
    expect(next.events).toEqual(game.events);
  };
  rejected({ type: 'askLibrarian', bookId });
  rejected({ type: 'handoffBook', bookId });
  game = apply(game, { type: 'inspectBook', bookId });
  rejected({ type: 'handoffBook', bookId });
  game = apply(game, { type: 'askLibrarian', bookId });
  rejected({ type: 'handoffBook', bookId });
  game = apply(game, { type: 'collectBook', bookId });
  rejected({ type: 'placeBook', bookId, shelfId: getLibraryBook(bookId)!.categoryId });
  game = apply(game, { type: 'handoffBook', bookId });
  expect(game.books.find(book => book.bookId === bookId)).toMatchObject({ location: 'handoff', inspected: true, librarianAsked: true });
  rejected({ type: 'handoffBook', bookId });
  rejected({ type: 'takeBook', bookId });
});

it('keeps ordinary books out of the exception box even after asking for help', () => {
  let game = start();
  const bookId = game.books.find(book => !book.damagedLabel)!.bookId;
  game = apply(game, { type: 'inspectBook', bookId });
  game = apply(game, { type: 'askLibrarian', bookId });
  expect(applyLibraryAction(game, { type: 'handoffBook', bookId }).lastActionError).toBeTruthy();
  expect(getLibraryProgress(game).handedOff).toBe(0);
});

it.each(['collectBook', 'collectAll'] as const)('keeps an already waiting visitor present when collecting with %s', type => {
  const fresh = createLibrarySession({ requestMode: 'find', seed: `arrival-${type}` });
  expect(fresh.visitors[0].status).toBe('waiting');
  const action: LibraryAction = type === 'collectAll' ? {type} : {type,bookId:fresh.books[0].bookId};
  const beforeTask = applyLibraryAction(fresh,action);
  expect(beforeTask.lastActionError).toBeTruthy();
  expect(beforeTask.visitors).toEqual(fresh.visitors);
  const accepted = apply(fresh,{type:'acceptTask'});
  expect(accepted.visitors[0].status).toBe('waiting');
  const received = apply(accepted,action);
  expect(received.visitors[0].status).toBe('waiting');
  expect(getLibraryProgress(received).correctlyShelved).toBe(0);
  expect(received.events.some(event => event.type === 'visitor_arrived')).toBe(false);
});

it('preserves current work while hearing, checking and completing the waiting visitor request', () => {
  let game = start();
  const books = game.books.filter(book => !book.damagedLabel);
  expect(game.visitors[0].status).toBe('waiting');
  game = apply(game, { type: 'placeBook', bookId: books[0].bookId, shelfId: getLibraryBook(books[0].bookId)!.categoryId });
  game = apply(game, { type: 'placeBook', bookId: books[1].bookId, shelfId: getLibraryBook(books[1].bookId)!.categoryId });
  expect(game.visitors[0].status).toBe('waiting');
  const workBefore = game.books;
  game = apply(game, { type: 'talkVisitor' });
  game = apply(game, { type: 'useSupport', support: 'notebook' });
  game = guideVisitor(game);
  expect(game.books).toEqual(workBefore);
  game = apply(game, { type: 'placeBook', bookId: books[2].bookId, shelfId: getLibraryBook(books[2].bookId)!.categoryId });
  expect(game.visitors[0].status).toBe('resolved');
  expect(game.events.filter(event => event.type === 'visitor_request_heard')).toHaveLength(1);
});

it('blocks every visitor action before work starts even though both visitors are present', () => {
  const game = createLibrarySession({seed: 'before-work', visitorCount: 2, requestMode: 'mixed'});
  const shelfId = getLibraryBook(game.visitors[0].bookId)!.categoryId;
  const actions: LibraryAction[] = [{type:'talkVisitor'}, {type:'lookupVisitor'}, {type:'guideVisitor',shelfId},
    {type:'finishVisitorGuide',shelfId}, {type:'acceptVisitorBook'}, {type:'finishVisitorShelving'}, {type:'referVisitor'}];
  for (const action of actions) {
    const rejected = applyLibraryAction(game, action);
    expect(rejected.lastActionError).toContain('업무');
    expect(rejected.visitors).toEqual(game.visitors);
    expect(rejected.books).toEqual(game.books);
    expect(rejected.events).toEqual(game.events);
  }
  const working = apply(game, {type:'acceptTask'});
  expect(apply(working, {type:'talkVisitor',visitorId:'visitor-2'}).visitors[1].status).toBe('active');
});

it('records incorrect visitor guidance, allows lookup and a corrected answer without losing books', () => {
  let game = finishBooks(start());
  game = apply(game, { type: 'talkVisitor' });
  const booksBefore = game.books;
  const correctShelf = getLibraryBook(game.visitors[0].bookId)!.categoryId;
  game = applyLibraryAction(game, { type: 'guideVisitor', shelfId: wrongShelf(correctShelf) });
  expect(game.lastActionError).toBeTruthy();
  expect(game.visitors[0]).toMatchObject({ status: 'active', attempts: 1, wrongAttempts: 1, resolution: null });
  game = apply(game, { type: 'lookupVisitor' });
  game = apply(game, { type: 'guideVisitor', shelfId: correctShelf });
  expect(game.visitors[0]).toMatchObject({status:'escorting',resolution:null,attempts:2,wrongAttempts:1});
  expect(getLibraryProgress(game).canReport).toBe(false);
  game = apply(game, { type: 'finishVisitorGuide', shelfId: correctShelf });
  expect(game.books).toEqual(booksBefore);
  game = apply(game, { type: 'report', shelvedCount: 11, handedOffCount: 1 });
  expect(getLibraryResult(game)).toMatchObject({ visitorResolution: 'guided', visitorLookupUsed: true, visitorWrongAttempts: 1 });
});

it('requires guidance to start and the correct shelf to be reached before completing the visitor task', () => {
  let game = finishBooks(start('escort-guards'));
  const shelfId = getLibraryBook(game.visitors[0].bookId)!.categoryId;
  const assertRejected = (action: LibraryAction) => {
    const next = applyLibraryAction(game,action);
    expect(next.lastActionError).toBeTruthy();
    expect(next.visitors[0]).toEqual(game.visitors[0]);
    expect(next.events).toEqual(game.events);
    expect(next.books).toEqual(game.books);
  };
  assertRejected({type:'finishVisitorGuide',shelfId});
  game = apply(game,{type:'talkVisitor'});
  assertRejected({type:'finishVisitorGuide',shelfId});
  game = apply(game,{type:'guideVisitor',shelfId});
  expect(game.visitors[0]).toMatchObject({status:'escorting',resolution:null,attempts:1});
  assertRejected({type:'finishVisitorGuide',shelfId:wrongShelf(shelfId)});
  assertRejected({type:'finishVisitorGuide',shelfId:'unknown' as LibraryCategoryId});
  const report = applyLibraryAction(game,{type:'report',shelvedCount:11,handedOffCount:1});
  expect(report.phase).toBe('working');
  expect(report.lastActionError).toContain('이용자');
  game = apply(game,{type:'finishVisitorGuide',shelfId});
  expect(game.visitors[0]).toMatchObject({status:'resolved',resolution:'guided',attempts:1});
  expect(getLibraryProgress(game).canReport).toBe(true);
  expect(game.events.at(-1)).toMatchObject({type:'visitor_guide_completed',payload:{bookId:game.visitors[0].bookId,shelfId}});
});

it('does not duplicate hearing, lookup, guide attempts or completion when a control fires again', () => {
  let game = start('visitor-double-tap');
  game = apply(game,{type:'talkVisitor'});
  game = apply(game,{type:'talkVisitor'});
  game = apply(game,{type:'lookupVisitor'});
  game = apply(game,{type:'lookupVisitor'});
  expect(game.events.filter(event=>event.type==='visitor_request_heard')).toHaveLength(1);
  expect(game.events.filter(event=>event.type==='visitor_location_checked')).toHaveLength(1);
  const shelfId = getLibraryBook(game.visitors[0].bookId)!.categoryId;
  game = apply(game,{type:'guideVisitor',shelfId});
  const repeatedGuide = applyLibraryAction(game,{type:'guideVisitor',shelfId});
  expect(repeatedGuide.lastActionError).toBeTruthy();
  expect(repeatedGuide.visitors[0]).toEqual(game.visitors[0]);
  expect(repeatedGuide.events).toEqual(game.events);
  game = apply(game,{type:'finishVisitorGuide',shelfId});
  for(const action of [{type:'finishVisitorGuide',shelfId},{type:'guideVisitor',shelfId},{type:'talkVisitor'},{type:'referVisitor'}] as LibraryAction[]) {
    const next = applyLibraryAction(game,action);
    expect(next.lastActionError).toBeTruthy();
    expect(next.visitors[0]).toEqual(game.visitors[0]);
    expect(next.events).toEqual(game.events);
  }
  expect(game.events.filter(event=>event.type==='visitor_guide_completed')).toHaveLength(1);
  expect(game.visitors[0].attempts).toBe(1);
});

it('accepts referring an unfamiliar request to the librarian as a completed visitor task', () => {
  let game = finishBooks(start());
  expect(applyLibraryAction(game, { type: 'referVisitor' }).lastActionError).toBeTruthy();
  game = apply(game, { type: 'talkVisitor' });
  game = apply(game, { type: 'referVisitor' });
  expect(getLibraryProgress(game).canReport).toBe(true);
  game = apply(game, { type: 'report', shelvedCount: 11, handedOffCount: 1 });
  expect(getLibraryResult(game)).toMatchObject({ visitorResolution: 'referred', visitorWrongAttempts: 0 });
});

it('does not complete incomplete work, an unresolved visitor or an inaccurate final report', () => {
  let game = start();
  game = applyLibraryAction(game, { type: 'report', shelvedCount: 0, handedOffCount: 0 });
  expect(game).toMatchObject({ phase: 'working', reportAttempts: 1 });
  expect(game.lastActionError).toContain('12권');
  game = finishBooks(game);
  game = applyLibraryAction(game, { type: 'report', shelvedCount: 11, handedOffCount: 1 });
  expect(game.lastActionError).toContain('이용자');
  expect(game.phase).toBe('working');
  game = guideVisitor(game);
  game = applyLibraryAction(game, { type: 'report', shelvedCount: 6, handedOffCount: 0 });
  expect(game.lastActionError).toContain('책 수');
  expect(game.phase).toBe('working');
  game = apply(game, { type: 'report', shelvedCount: 11, handedOffCount: 1 });
  expect(getLibraryResult(game)?.reportAttempts).toBe(4);
});

it('rejects a report that physically accounts for every book but includes a misplaced book', () => {
  let game = guideVisitor(finishBooks(start()));
  const book = game.books.find(item => !item.damagedLabel)!;
  game = apply(game, { type: 'takeBook', bookId: book.bookId });
  game = apply(game, { type: 'placeBook', bookId: book.bookId, shelfId: wrongShelf(getLibraryBook(book.bookId)!.categoryId) });
  game = applyLibraryAction(game, { type: 'report', shelvedCount: 11, handedOffCount: 1 });
  expect(game.phase).toBe('working');
  expect(game.lastActionError).toContain('다른 서가');
  expect(game.events.at(-1)?.payload).toMatchObject({ matchesActual: true, misplaced: 1, success: false });
});

it('records optional support without reducing a completed outcome and marks enlarged labels inspected', () => {
  let game = start();
  const bookId = game.books.find(book => book.damagedLabel)!.bookId;
  game = apply(game, { type: 'useSupport', support: 'label-zoom', bookId });
  expect(game.books.find(book => book.bookId === bookId)?.inspected).toBe(true);
  game = apply(game, { type: 'useSupport', support: 'notebook' });
  game = apply(game, { type: 'useSupport', support: 'repeat-instructions' });
  game = guideVisitor(finishBooks(game));
  game = apply(game, { type: 'report', shelvedCount: 11, handedOffCount: 1 });
  expect(getLibraryResult(game)).toMatchObject({ supportUseCount: 3, supportKinds: ['label-zoom', 'notebook', 'repeat-instructions'], correctlyShelved: 11, handedOff: 1 });
});

it.each([NaN, Infinity, -1, 1.5, 13])('rejects malformed report count %s without recording a gameplay attempt', count => {
  const game = guideVisitor(finishBooks(start()));
  const rejected = applyLibraryAction(game, { type: 'report', shelvedCount: count, handedOffCount: 1 });
  expect(rejected.lastActionError).toBeTruthy();
  expect(rejected.events).toEqual(game.events);
  expect(rejected.reportAttempts).toBe(0);
});

it('guards task acceptance, ownership, shelf ids and duplicate collection', () => {
  const fresh = createLibrarySession({ requestMode: 'find', seed: 'guards' });
  expect(applyLibraryAction(fresh, { type: 'collectAll' }).lastActionError).toBeTruthy();
  let game = apply(fresh, { type: 'acceptTask' });
  expect(applyLibraryAction(game, { type: 'acceptTask' }).lastActionError).toBeTruthy();
  expect(applyLibraryAction(game, { type: 'inspectBook', bookId: 'not-a-book' }).lastActionError).toBeTruthy();
  const bookId = game.books.find(book => !book.damagedLabel)!.bookId;
  game = apply(game, { type: 'collectBook', bookId });
  expect(applyLibraryAction(game, { type: 'collectBook', bookId }).lastActionError).toBeTruthy();
  expect(applyLibraryAction(game, { type: 'placeBook', bookId, shelfId: 'missing' as LibraryCategoryId }).lastActionError).toBeTruthy();
  expect(applyLibraryAction(game, { type: 'useSupport', support: 'label-zoom', bookId: 'missing' }).lastActionError).toBeTruthy();
  expect(applyLibraryAction(game, { type: 'useSupport', support: 'label-zoom' }).lastActionError).toBeTruthy();
});

it('locks a completed shift and resets work, metrics and logs with a fresh attempt identity', () => {
  let game = createLibrarySession({ requestMode: 'find', seed: 'reset', supportMode: 'independent', startedAt: 20, sessionId: 'first' });
  game = apply(game, { type: 'acceptTask' });
  game = guideVisitor(finishBooks(game));
  game = apply(game, { type: 'report', shelvedCount: 11, handedOffCount: 1 });
  const repeated = applyLibraryAction(game, { type: 'report', shelvedCount: 11, handedOffCount: 1 });
  expect(repeated.lastActionError).toBeTruthy();
  expect(repeated.events).toEqual(game.events);
  const reset = apply(game, { type: 'reset', startedAt: 30 });
  expect(reset).toEqual(createLibrarySession({ requestMode: 'find', seed: 'reset', supportMode: 'independent', startedAt: 30, sessionId: 'first:retry' }));
  expect(reset.books.map(book => book.bookId)).toEqual(game.books.map(book => book.bookId));
  expect(getLibraryResult(reset)).toBeNull();
  expect(getLibraryProgress(reset)).toMatchObject({ remaining: 12, onCart: 12, correctlyShelved: 0, handedOff: 0 });
});

it('replays the same actions without mutating their input state', () => {
  const initial = createLibrarySession({ requestMode: 'find', seed: 'replay' });
  const firstBookId = initial.books.find(book => !book.damagedLabel)!.bookId;
  const actions: LibraryAction[] = [{ type: 'acceptTask' }, { type: 'collectAll' },
    { type: 'inspectBook', bookId: firstBookId },
    { type: 'placeBook', bookId: firstBookId, shelfId: getLibraryBook(firstBookId)!.categoryId },
    { type: 'useSupport', support: 'notebook' }];
  const snapshot = JSON.stringify(initial);
  expect(actions.reduce(applyLibraryAction, initial)).toEqual(actions.reduce(applyLibraryAction, createLibrarySession({ requestMode: 'find', seed: 'replay' })));
  expect(JSON.stringify(initial)).toBe(snapshot);
});

it('defaults to one present visitor and varies the mixed request reproducibly across seeds', () => {
  expect(normalizeLibraryConfig()).toEqual({visitorCount:1,requestMode:'mixed',bookCount:12,damagedBookCount:1});
  const modes = new Set<string>();
  for (let seed = 0; seed < 50; seed++) {
    const game = createLibrarySession({seed});
    expect(game.visitors).toHaveLength(1);
    expect(game.visitors[0].status).toBe('waiting');
    modes.add(game.visitors[0].requestType);
    expect(createLibrarySession({seed}).visitors).toEqual(game.visitors);
  }
  expect([...modes].sort()).toEqual(['find','shelve']);
});

it.each([
  {visitorCount:3}, {requestMode:'unknown'}, {bookCount:9}, {damagedBookCount:3},
] as unknown as Partial<LibraryGameConfig>[])('rejects unsupported game settings %j', config => {
  expect(() => createLibrarySession(config)).toThrow('설정');
});

it('finishes every valid count/request combination with unique assignments and exact result counts', () => {
  for (const visitorCount of [0,1,2] as const) for (const requestMode of ['mixed','find','shelve'] as const)
    for (const bookCount of [6,12,18] as const) for (const damagedBookCount of [0,1,2] as const) {
      const config = {visitorCount,requestMode,bookCount,damagedBookCount};
      let game = createLibrarySession({...config,seed:JSON.stringify(config)});
      expect(game.config).toEqual(config);
      expect(game.visitors).toHaveLength(visitorCount);
      expect(game.books.filter(book=>book.damagedLabel)).toHaveLength(damagedBookCount);
      const allIds = [...game.books.map(book=>book.bookId),...game.visitors.map(visitor=>visitor.bookId)];
      expect(new Set(allIds).size).toBe(bookCount+visitorCount);
      if (visitorCount === 2 && requestMode === 'mixed') expect(new Set(game.visitors.map(visitor=>visitor.requestType)).size).toBe(2);
      game = finishBooks(apply(game,{type:'acceptTask'}));
      expect(getLibraryProgress(game).canReport).toBe(visitorCount===0);
      for (const visitor of game.visitors) {
        const visitorId = visitor.id;
        const shelfId = getLibraryBook(visitor.bookId)!.categoryId;
        game = apply(game,{type:'talkVisitor',visitorId});
        if (visitor.requestType === 'find') {
          game = apply(game,{type:'guideVisitor',visitorId,shelfId});
          game = apply(game,{type:'finishVisitorGuide',visitorId,shelfId});
        } else {
          game = apply(game,{type:'acceptVisitorBook',visitorId});
          game = apply(game,{type:'placeBook',bookId:visitor.bookId,shelfId});
          expect(getLibraryProgress(game).canReport).toBe(false);
          game = apply(game,{type:'finishVisitorShelving',visitorId});
        }
      }
      const visitorsShelved = game.visitors.filter(visitor=>visitor.requestType==='shelve').length;
      const visitorsGuided = visitorCount-visitorsShelved;
      const shelvedCount = bookCount+visitorsShelved-damagedBookCount;
      expect(getLibraryProgress(game).canReport).toBe(true);
      game = apply(game,{type:'report',shelvedCount,handedOffCount:damagedBookCount});
      expect(getLibraryResult(game)).toMatchObject({total:bookCount+visitorsShelved,cartTotal:bookCount,
        visitorBookCount:visitorsShelved,correctlyShelved:shelvedCount,handedOff:damagedBookCount,
        visitorsTotal:visitorCount,visitorsResolved:visitorCount,visitorsGuided,visitorsShelved,visitorsReferred:0});
    }
});

it('carries two requested books separately from six cart books, and corrects their placement before reporting to each owner', () => {
  let game = apply(createLibrarySession({seed:'guest-capacity',visitorCount:2,requestMode:'shelve'}),{type:'acceptTask'});
  game = apply(game,{type:'collectAll'});
  for (const visitor of game.visitors) {
    game = apply(game,{type:'talkVisitor',visitorId:visitor.id});
    game = apply(game,{type:'acceptVisitorBook',visitorId:visitor.id});
  }
  expect(game.books.filter(book=>book.location==='carried')).toHaveLength(8);
  expect(game.books.filter(book=>book.location==='carried'&&book.source==='cart')).toHaveLength(6);
  expect(applyLibraryAction(game,{type:'collectAll'}).lastActionError).toBeTruthy();
  const [visitor,second] = game.visitors;
  const shelfId = getLibraryBook(visitor.bookId)!.categoryId;
  const rejected = (action:LibraryAction) => {
    const next = applyLibraryAction(game,action);
    expect(next.lastActionError).toBeTruthy();
    expect(next.events).toEqual(game.events);
    expect(next.visitors).toEqual(game.visitors);
    expect(next.books).toEqual(game.books);
  };
  rejected({type:'acceptVisitorBook',visitorId:visitor.id});
  rejected({type:'finishVisitorShelving',visitorId:visitor.id});
  rejected({type:'guideVisitor',visitorId:visitor.id,shelfId});
  rejected({type:'referVisitor',visitorId:visitor.id});
  game = apply(game,{type:'placeBook',bookId:visitor.bookId,shelfId:wrongShelf(shelfId)});
  expect(game.visitors[0].status).toBe('awaiting-shelve');
  rejected({type:'finishVisitorShelving',visitorId:visitor.id});
  game = apply(game,{type:'takeBook',bookId:visitor.bookId});
  game = apply(game,{type:'placeBook',bookId:visitor.bookId,shelfId});
  expect(game.visitors[0].status).toBe('awaiting-report');
  expect(game.visitors[1]).toEqual(second);
  rejected({type:'finishVisitorShelving',visitorId:second.id});
  game = apply(game,{type:'takeBook',bookId:visitor.bookId});
  expect(game.visitors[0].status).toBe('awaiting-shelve');
  rejected({type:'finishVisitorShelving',visitorId:visitor.id});
  game = apply(game,{type:'placeBook',bookId:visitor.bookId,shelfId});
  game = apply(game,{type:'finishVisitorShelving',visitorId:visitor.id});
  expect(game.visitors[0]).toMatchObject({status:'resolved',resolution:'shelved'});
  expect(game.books.find(book=>book.bookId===visitor.bookId)).toMatchObject({source:'visitor',visitorId:visitor.id,
    damagedLabel:false,wrongAttempts:1,corrections:1});
  rejected({type:'finishVisitorShelving',visitorId:visitor.id});
  rejected({type:'takeBook',bookId:visitor.bookId});
  expect(game.events.filter(event=>event.type==='visitor_shelving_completed')).toHaveLength(1);
});

it('can refer either request without adding a guest book, and refuses requests belonging to an absent visitor', () => {
  let game = apply(createLibrarySession({seed:'refer-mixed',visitorCount:2}),{type:'acceptTask'});
  const initialBooks = game.books;
  for (const visitor of game.visitors) {
    game = apply(game,{type:'talkVisitor',visitorId:visitor.id});
    game = apply(game,{type:'referVisitor',visitorId:visitor.id});
  }
  expect(game.books).toEqual(initialBooks);
  expect(getLibraryProgress(game).visitorsResolved).toBe(2);
  const empty = apply(createLibrarySession({seed:'empty',visitorCount:0}),{type:'acceptTask'});
  const rejected = applyLibraryAction(empty,{type:'talkVisitor',visitorId:'visitor-2'});
  expect(rejected.lastActionError).toBeTruthy();
  expect(rejected.events).toEqual(empty.events);
});

it('preserves all selected settings on retry while clearing accepted guest books and visitor progress', () => {
  const config:LibraryGameConfig = {visitorCount:2,requestMode:'shelve',bookCount:18,damagedBookCount:2};
  let game = apply(createLibrarySession({...config,seed:'retry-config',supportMode:'independent'}),{type:'acceptTask'});
  game = apply(game,{type:'talkVisitor',visitorId:'visitor-2'});
  game = apply(game,{type:'acceptVisitorBook',visitorId:'visitor-2'});
  const reset = apply(game,{type:'reset',seed:'another-attempt'});
  expect(reset.config).toEqual(config);
  expect(reset.supportMode).toBe('independent');
  expect(reset.books).toHaveLength(18);
  expect(reset.books.every(book=>book.source==='cart')).toBe(true);
  expect(reset.visitors.every(visitor=>visitor.status==='waiting'&&visitor.resolution===null)).toBe(true);
  expect(reset.events).toEqual([]);
});

it('escorts only one visitor at a time and resumes the other request after the first arrival', () => {
  let game = apply(createLibrarySession({seed:'one-follower',visitorCount:2,requestMode:'find'}),{type:'acceptTask'});
  const [first,second] = game.visitors;
  const firstShelf = getLibraryBook(first.bookId)!.categoryId;
  const secondShelf = getLibraryBook(second.bookId)!.categoryId;
  game = apply(game,{type:'talkVisitor',visitorId:first.id});
  game = apply(game,{type:'talkVisitor',visitorId:second.id});
  game = apply(game,{type:'guideVisitor',visitorId:first.id,shelfId:firstShelf});
  const beforeSecond = game;
  game = applyLibraryAction(game,{type:'guideVisitor',visitorId:second.id,shelfId:secondShelf});
  expect(game.lastActionError).toContain('함께 이동 중인 손님');
  expect(game.visitors).toEqual(beforeSecond.visitors);
  expect(game.events).toEqual(beforeSecond.events);
  game = apply(game,{type:'finishVisitorGuide',visitorId:first.id,shelfId:firstShelf});
  game = apply(game,{type:'guideVisitor',visitorId:second.id,shelfId:secondShelf});
  game = apply(game,{type:'finishVisitorGuide',visitorId:second.id,shelfId:secondShelf});
  expect(getLibraryProgress(game).visitorsResolved).toBe(2);
  expect(game.events.filter(event=>event.type==='visitor_guide_completed').map(event=>event.payload.visitorId)).toEqual([first.id,second.id]);
});
