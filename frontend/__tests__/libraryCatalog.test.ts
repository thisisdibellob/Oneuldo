import { getLibraryCatalogEntries, LIBRARY_WORK_GUIDE } from '../src/game/libraryCatalog';
import { applyLibraryAction, createLibrarySession, getLibraryBook, LIBRARY_BOOKS, LIBRARY_CATEGORIES } from '../src/game/librarySession';

it('searches the 52 actual titles, full decimal classification numbers and all ten classes', () => {
  const session = createLibrarySession({ seed: 'catalog' });
  expect(getLibraryCatalogEntries(session)).toHaveLength(52);
  expect(getLibraryCatalogEntries(session, '  우리동네일하는사람들  ').map(item => item.book.id)).toEqual(['neighborhood-jobs']);
  expect(getLibraryCatalogEntries(session, '321.55').map(item => item.book.id)).toEqual(['neighborhood-jobs']);
  for (const category of LIBRARY_CATEGORIES) {
    expect(getLibraryCatalogEntries(session, '', category.id).map(item => item.book.id).sort()).toEqual(LIBRARY_BOOKS.filter(book => book.categoryId === category.id).map(book => book.id).sort());
  }
  expect(getLibraryCatalogEntries(session, '없는 제목')).toEqual([]);
});

it('shows cart, carried, actual shelf and librarian handoff locations instead of claiming everything is available', () => {
  let session = createLibrarySession({ seed: 'catalog' });
  const book = session.books.find(item => !item.damagedLabel)!;
  const damaged = session.books.find(item => item.damagedLabel)!;
  const entry = (id: string) => getLibraryCatalogEntries(session).find(item => item.book.id === id)!;
  expect(entry(book.bookId)).toMatchObject({ location: '반납 카트', available: false });
  session = applyLibraryAction(session, { type: 'acceptTask' });
  session = applyLibraryAction(session, { type: 'collectAll' });
  expect(entry(book.bookId)).toMatchObject({ location: '내가 가지고 있음', available: false });
  session = applyLibraryAction(session, { type: 'placeBook', bookId: book.bookId, shelfId: getLibraryBook(book.bookId)!.categoryId });
  expect(entry(book.bookId).available).toBe(true);
  session = applyLibraryAction(session, { type: 'inspectBook', bookId: damaged.bookId });
  session = applyLibraryAction(session, { type: 'askLibrarian', bookId: damaged.bookId });
  session = applyLibraryAction(session, { type: 'handoffBook', bookId: damaged.bookId });
  expect(entry(damaged.bookId)).toMatchObject({ location: '사서 확인함', available: false });
});

it('limits carried books to six while allowing the second six and guarding removal from a shelf at capacity', () => {
  let session = applyLibraryAction(createLibrarySession({ seed: 'capacity' }), { type: 'acceptTask' });
  session = applyLibraryAction(session, { type: 'collectAll' });
  expect(session.books.filter(item => item.location === 'carried')).toHaveLength(6);
  expect(session.books.filter(item => item.location === 'return-cart')).toHaveLength(6);
  expect(applyLibraryAction(session, { type: 'collectAll' }).lastActionError).toContain('먼저 정리');
  const book = session.books.find(item => item.location === 'carried' && !item.damagedLabel)!;
  session = applyLibraryAction(session, { type: 'placeBook', bookId: book.bookId, shelfId: getLibraryBook(book.bookId)!.categoryId });
  session = applyLibraryAction(session, { type: 'collectAll' });
  expect(session.books.filter(item => item.location === 'carried')).toHaveLength(6);
  expect(applyLibraryAction(session, { type: 'takeBook', bookId: book.bookId }).lastActionError).toContain('먼저 정리');
});

it('guidebook covers the whole work sequence with classification and author-mark distinction', () => {
  expect(LIBRARY_WORK_GUIDE.map(item => item.title)).toEqual(['업무 받기', '책등 라벨 읽기', '서가에 꽂기', '라벨·책 상태 확인', '이용자 안내', '완료 보고']);
  expect(LIBRARY_WORK_GUIDE[1].steps.join(' ')).toContain('윗줄은 분류번호, 아랫줄은 도서기호');
});

it('tracks a reading visitor book from their hands through wrong and corrected shelving', () => {
  let session = createLibrarySession({seed:'catalog-visitor',visitorCount:2,requestMode:'mixed'});
  const visitor = session.visitors.find(item=>item.requestType==='shelve')!;
  const findVisitor = session.visitors.find(item=>item.requestType==='find')!;
  const shelfId = getLibraryBook(visitor.bookId)!.categoryId;
  const entry = () => getLibraryCatalogEntries(session).find(item=>item.book.id===visitor.bookId)!;
  expect(entry()).toMatchObject({location:'이용자가 읽고 있는 책',available:false});
  expect(getLibraryCatalogEntries(session).find(item=>item.book.id===findVisitor.bookId)?.available).toBe(true);
  session = applyLibraryAction(session,{type:'acceptTask'});
  session = applyLibraryAction(session,{type:'talkVisitor',visitorId:visitor.id});
  session = applyLibraryAction(session,{type:'acceptVisitorBook',visitorId:visitor.id});
  expect(entry()).toMatchObject({location:'내가 가지고 있음',available:false});
  const wrong = LIBRARY_CATEGORIES.find(category=>category.id!==shelfId)!;
  session = applyLibraryAction(session,{type:'placeBook',bookId:visitor.bookId,shelfId:wrong.id});
  expect(entry()).toMatchObject({location:`${wrong.label} 서가`,available:false});
  session = applyLibraryAction(session,{type:'takeBook',bookId:visitor.bookId});
  session = applyLibraryAction(session,{type:'placeBook',bookId:visitor.bookId,shelfId});
  expect(entry().available).toBe(true);
  expect(session.visitors.find(item=>item.id===visitor.id)?.status).toBe('awaiting-report');
});
