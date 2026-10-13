import { LIBRARY_KDC_DIRECTORY, type LibraryCategoryId } from './libraryClassification';

/** State and event order depend only on the seed and actions. */
export type { LibraryCategoryId } from './libraryClassification';
export type LibrarySupportMode = 'guided' | 'independent';
export type LibrarySupportKind = 'notebook' | 'repeat-instructions' | 'label-zoom';
export type LibraryCategory = {
  id: LibraryCategoryId;
  label: string;
  callRange: string;
  color: string;
  icon: 'book' | 'leaf' | 'home' | 'library' | 'bulb' | 'globe' | 'people' | 'color-palette' | 'chatbubbles' | 'map';
};

const CATEGORY_APPEARANCE: Record<LibraryCategoryId, Pick<LibraryCategory, 'color' | 'icon'>> = {
  general: { color: '#728C9D', icon: 'library' },
  philosophy: { color: '#9A86A0', icon: 'bulb' },
  religion: { color: '#A69171', icon: 'globe' },
  social: { color: '#79968F', icon: 'people' },
  nature: { color: '#78927A', icon: 'leaf' },
  life: { color: '#B39A65', icon: 'home' },
  arts: { color: '#B67E88', icon: 'color-palette' },
  language: { color: '#728EAB', icon: 'chatbubbles' },
  story: { color: '#B68470', icon: 'book' },
  history: { color: '#A28C67', icon: 'map' },
};
export const LIBRARY_CATEGORIES: readonly LibraryCategory[] = LIBRARY_KDC_DIRECTORY.map(category => ({
  id: category.id, label: category.label, callRange: `${category.code} ${category.label}`, ...CATEGORY_APPEARANCE[category.id],
}));

export const LIBRARY_SHIFT_BOOK_COUNT = 12;
export const LIBRARY_CART_BATCH_SIZE = 6;

export type LibraryBook = {
  id: string;
  title: string;
  categoryId: LibraryCategoryId;
  callNumber: string;
  coverColor: string;
  coverSymbol: string;
};

/** Fictional training books and author marks, arranged like KDC spine labels.
 * This shift practices the main class, not assigning classification/author codes.
 */
export const LIBRARY_BOOKS: readonly LibraryBook[] = [
  { id: 'moon-mail', title: '달빛 우체국', categoryId: 'story', callNumber: '813.8\n김14ㄷ', coverColor: '#708C9A', coverSymbol: 'moon' },
  { id: 'cloud-cat', title: '언덕 위 작은 집', categoryId: 'story', callNumber: '813.8\n박38ㅇ', coverColor: '#C58F79', coverSymbol: 'house' },
  { id: 'little-train', title: '작은 배의 여행', categoryId: 'story', callNumber: '813.8\n이82ㅈ', coverColor: '#9BA791', coverSymbol: 'boat' },
  { id: 'our-neighbor', title: '숲속 여우의 하루', categoryId: 'story', callNumber: '813.8\n최58ㅅ', coverColor: '#C7AF78', coverSymbol: 'fox' },
  { id: 'forest-leaves', title: '새싹을 찾아서', categoryId: 'nature', callNumber: '480\n김14ㅅ', coverColor: '#85997A', coverSymbol: 'sprout' },
  { id: 'sea-friends', title: '해바라기의 계절', categoryId: 'nature', callNumber: '480\n박38ㅎ', coverColor: '#779AAB', coverSymbol: 'sunflower' },
  { id: 'night-stars', title: '바닷속 고래', categoryId: 'nature', callNumber: '490\n이82ㅂ', coverColor: '#8583A0', coverSymbol: 'whale' },
  { id: 'garden-bugs', title: '산과 들의 식물', categoryId: 'nature', callNumber: '480\n최58ㅅ', coverColor: '#C5A070', coverSymbol: 'mountain' },
  { id: 'easy-cooking', title: '자전거의 구조', categoryId: 'life', callNumber: '556\n김14ㅈ', coverColor: '#C58F79', coverSymbol: 'bicycle' },
  { id: 'balcony-garden', title: '함께 만드는 간식', categoryId: 'life', callNumber: '594\n박38ㅎ', coverColor: '#85997A', coverSymbol: 'cooking' },
  { id: 'tidy-room', title: '우리 집 작은 텃밭', categoryId: 'life', callNumber: '525\n이82ㅇ', coverColor: '#93A6B1', coverSymbol: 'watering-can' },
  { id: 'healthy-day', title: '도시 버스의 구조', categoryId: 'life', callNumber: '556\n최58ㄷ', coverColor: '#C4AA78', coverSymbol: 'bus' },
  { id: 'computer-first', title: '처음 만나는 컴퓨터', categoryId: 'general', callNumber: '004\n김14ㅊ', coverColor: '#809BAD', coverSymbol: 'computer' },
  { id: 'library-guide', title: '도서관 사용 설명서', categoryId: 'general', callNumber: '020\n박38ㄷ', coverColor: '#AF9A75', coverSymbol: 'library' },
  { id: 'feeling-colors', title: '내 마음의 색깔', categoryId: 'philosophy', callNumber: '180\n이82ㄴ', coverColor: '#B98E9E', coverSymbol: 'heart' },
  { id: 'question-tree', title: '생각이 자라는 질문', categoryId: 'philosophy', callNumber: '100\n최58ㅅ', coverColor: '#8F9F82', coverSymbol: 'thought-tree' },
  { id: 'world-religions', title: '세계의 종교 이야기', categoryId: 'religion', callNumber: '200\n김14ㅅ', coverColor: '#ADA2BA', coverSymbol: 'world' },
  { id: 'temple-bell', title: '산사의 풍경 소리', categoryId: 'religion', callNumber: '220\n박38ㅅ', coverColor: '#A59B75', coverSymbol: 'temple-bell' },
  { id: 'neighborhood-jobs', title: '우리 동네 일하는 사람들', categoryId: 'social', callNumber: '321.55\n이82ㅇ', coverColor: '#C2987A', coverSymbol: 'jobs' },
  { id: 'money-story', title: '돈은 어디로 갈까', categoryId: 'social', callNumber: '320\n최58ㄷ', coverColor: '#A6AD80', coverSymbol: 'piggy-bank' },
  { id: 'color-sketchbook', title: '색연필로 그리는 하루', categoryId: 'arts', callNumber: '650\n김14ㅅ', coverColor: '#C7A383', coverSymbol: 'pencils' },
  { id: 'music-friends', title: '악기들의 작은 음악회', categoryId: 'arts', callNumber: '670\n박38ㅇ', coverColor: '#A28AA9', coverSymbol: 'instruments' },
  { id: 'korean-words', title: '우리말 낱말 여행', categoryId: 'language', callNumber: '710\n이82ㅇ', coverColor: '#8FAFA5', coverSymbol: 'korean' },
  { id: 'english-hello', title: '영어로 인사해요', categoryId: 'language', callNumber: '740\n최58ㅇ', coverColor: '#D0AF7F', coverSymbol: 'hello' },
  { id: 'korea-history', title: '처음 읽는 한국사', categoryId: 'history', callNumber: '911\n김14ㅊ', coverColor: '#A18C78', coverSymbol: 'palace' },
  { id: 'world-map', title: '지도로 만나는 세계', categoryId: 'history', callNumber: '980\n박38ㅈ', coverColor: '#86A4AD', coverSymbol: 'map' },
  { id: 'knowledge-shelf', title: '작은 지식 백과', categoryId: 'general', callNumber: '030\n강12ㅈ', coverColor: '#829673', coverSymbol: 'encyclopedia' },
  { id: 'safe-internet', title: '인터넷을 안전하게', categoryId: 'general', callNumber: '004\n윤46ㅇ', coverColor: '#B5A383', coverSymbol: 'internet' },
  { id: 'reading-habit', title: '책 읽는 시간', categoryId: 'general', callNumber: '029\n정64ㅊ', coverColor: '#7E93A1', coverSymbol: 'lamp' },
  { id: 'kind-heart', title: '친절한 마음 연습', categoryId: 'philosophy', callNumber: '190\n강12ㅊ', coverColor: '#BF8C85', coverSymbol: 'heart' },
  { id: 'my-choice', title: '내가 고르는 길', categoryId: 'philosophy', callNumber: '180\n윤46ㄴ', coverColor: '#A9A57C', coverSymbol: 'choices' },
  { id: 'thinking-together', title: '함께 생각해요', categoryId: 'philosophy', callNumber: '100\n정64ㅎ', coverColor: '#8C9AAD', coverSymbol: 'thought' },
  { id: 'lotus-story', title: '연꽃에 담긴 이야기', categoryId: 'religion', callNumber: '220\n강12ㅇ', coverColor: '#AF9A87', coverSymbol: 'lotus' },
  { id: 'church-bell', title: '교회 종소리 이야기', categoryId: 'religion', callNumber: '230\n윤46ㄱ', coverColor: '#C19A7E', coverSymbol: 'church' },
  { id: 'religions-and-peace', title: '종교와 평화', categoryId: 'religion', callNumber: '200\n정64ㅈ', coverColor: '#8FA6A1', coverSymbol: 'dove' },
  { id: 'our-community', title: '함께 사는 동네', categoryId: 'social', callNumber: '331\n강12ㅎ', coverColor: '#AF9479', coverSymbol: 'town' },
  { id: 'recycling-city', title: '지구를 위한 시민의 약속', categoryId: 'social', callNumber: '330\n윤46ㅈ', coverColor: '#9DAE90', coverSymbol: 'recycling' },
  { id: 'world-neighbors', title: '세계의 이웃들', categoryId: 'social', callNumber: '331\n정64ㅅ', coverColor: '#A7A982', coverSymbol: 'neighbors' },
  { id: 'moon-observation', title: '달을 관찰해요', categoryId: 'nature', callNumber: '443\n강12ㄷ', coverColor: '#7F91A7', coverSymbol: 'telescope' },
  { id: 'forest-animals', title: '숲속 동물의 겨울', categoryId: 'nature', callNumber: '490\n윤46ㅅ', coverColor: '#AE9277', coverSymbol: 'fox' },
  { id: 'warm-tea', title: '따뜻한 차 한 잔', categoryId: 'life', callNumber: '594\n강12ㄸ', coverColor: '#B28D75', coverSymbol: 'tea' },
  { id: 'herb-garden', title: '허브를 키워요', categoryId: 'life', callNumber: '525\n윤46ㅎ', coverColor: '#8D9C7B', coverSymbol: 'herbs' },
  { id: 'dance-step', title: '처음 배우는 춤', categoryId: 'arts', callNumber: '685\n강12ㅊ', coverColor: '#B79691', coverSymbol: 'dance' },
  { id: 'photo-walk', title: '사진으로 남긴 산책', categoryId: 'arts', callNumber: '660\n윤46ㅅ', coverColor: '#91A0AA', coverSymbol: 'camera' },
  { id: 'sports-day', title: '공놀이하는 날', categoryId: 'arts', callNumber: '692\n정64ㄱ', coverColor: '#A8AB88', coverSymbol: 'sport' },
  { id: 'conversation-words', title: '마음을 전하는 우리말', categoryId: 'language', callNumber: '710\n강12ㅁ', coverColor: '#9DA5B2', coverSymbol: 'speech' },
  { id: 'writing-diary', title: '또박또박 문장 쓰기', categoryId: 'language', callNumber: '710\n윤46ㄸ', coverColor: '#B5A285', coverSymbol: 'writing' },
  { id: 'travel-english', title: '여행에서 만나는 영어', categoryId: 'language', callNumber: '740\n정64ㅇ', coverColor: '#98ADBA', coverSymbol: 'airplane' },
  { id: 'owl-night', title: '부엉이의 밤 산책', categoryId: 'story', callNumber: '813.8\n강12ㅂ', coverColor: '#899BAE', coverSymbol: 'owl' },
  { id: 'red-door', title: '빨간 문 너머', categoryId: 'story', callNumber: '813.8\n윤46ㅃ', coverColor: '#B0987B', coverSymbol: 'door' },
  { id: 'old-pottery', title: '옛 그릇이 들려주는 역사', categoryId: 'history', callNumber: '911\n강12ㅇ', coverColor: '#C1A080', coverSymbol: 'pottery' },
  { id: 'mountain-journey', title: '산과 강을 따라 여행', categoryId: 'history', callNumber: '981.1\n윤46ㅅ', coverColor: '#91A595', coverSymbol: 'compass' },
];

export function getLibraryBook(bookId: string): LibraryBook | undefined {
  return LIBRARY_BOOKS.find(book => book.id === bookId);
}

export function getLibraryCategory(categoryId: LibraryCategoryId): LibraryCategory {
  return LIBRARY_CATEGORIES.find(category => category.id === categoryId)!;
}

export type LibraryShelfSlot = 0 | 1 | 2;
/** This activity compares the classification number only; equal numbers may sit
 * together. Author-mark ordering is deliberately outside this first exercise. */
export function getLibraryShelfReferenceBooks(categoryId: LibraryCategoryId): readonly [LibraryBook, LibraryBook] {
  const books = LIBRARY_BOOKS.filter(book => book.categoryId === categoryId)
    .sort((a, b) => Number(a.callNumber.split('\n')[0]) - Number(b.callNumber.split('\n')[0]));
  const distinct = books.filter((book, index) => index === 0 || book.callNumber.split('\n')[0] !== books[index - 1].callNumber.split('\n')[0]);
  // Interior reference numbers keep the shelf stable while ensuring "always
  // choose the middle" is not a shortcut for every book in this category.
  return [distinct[Math.floor(distinct.length / 3)], distinct[Math.min(distinct.length - 1, Math.floor(distinct.length * 2 / 3))]];
}
export function isLibraryShelfSlotCorrect(bookId: string, categoryId: LibraryCategoryId, slot: LibraryShelfSlot): boolean {
  const book = getLibraryBook(bookId);
  if (!book || book.categoryId !== categoryId || ![0, 1, 2].includes(slot)) return false;
  const number = Number(book.callNumber.split('\n')[0]);
  const [left, right] = getLibraryShelfReferenceBooks(categoryId).map(item => Number(item.callNumber.split('\n')[0]));
  return slot === 0 ? number <= left : slot === 1 ? number >= left && number <= right : number >= right;
}

export type LibraryVisitorId = 'visitor' | 'visitor-2';
export type LibraryVisitorRequest = 'find' | 'shelve';
export type LibraryGameConfig = {
  visitorCount: 0 | 1 | 2;
  requestMode: 'mixed' | 'find' | 'shelve';
  bookCount: 6 | 12 | 18;
  damagedBookCount: 0 | 1 | 2;
};
export type LibrarySessionBook = {
  bookId: string;
  source: 'cart' | 'visitor';
  visitorId?: LibraryVisitorId;
  damagedLabel: boolean;
  location: 'return-cart' | 'carried' | 'shelf' | 'handoff';
  shelfId: LibraryCategoryId | null;
  inspected: boolean;
  librarianAsked: boolean;
  placementAttempts: number;
  firstShelfId: LibraryCategoryId | null;
  wrongAttempts: number;
  corrections: number;
  needsCorrection: boolean;
};
export type LibraryVisitor = {
  id: LibraryVisitorId;
  requestType: LibraryVisitorRequest;
  status: 'waiting' | 'active' | 'escorting' | 'awaiting-shelve' | 'awaiting-report' | 'resolved';
  bookId: string;
  lookupUsed: boolean;
  attempts: number;
  wrongAttempts: number;
  resolution: 'guided' | 'shelved' | 'referred' | null;
};
export type LibraryEvent = {
  sequence: number;
  type: string;
  payload: Record<string, string | number | boolean | null>;
};
export type LibrarySession = {
  sessionId: string;
  startedAt: number;
  seed: string;
  supportMode: LibrarySupportMode;
  config: LibraryGameConfig;
  phase: 'briefing' | 'working' | 'finished';
  books: LibrarySessionBook[];
  visitors: LibraryVisitor[];
  supportUses: { kind: LibrarySupportKind; bookId: string | null }[];
  reportAttempts: number;
  events: LibraryEvent[];
  lastActionError: string | null;
};
export type LibrarySessionConfig = Partial<LibraryGameConfig> & {
  seed?: string | number;
  supportMode?: LibrarySupportMode;
  sessionId?: string;
  startedAt?: number;
};
export function normalizeLibraryConfig(config: Partial<LibraryGameConfig> = {}): LibraryGameConfig {
  const normalized: LibraryGameConfig = {
    visitorCount: config.visitorCount ?? 1,
    requestMode: config.requestMode ?? 'mixed',
    bookCount: config.bookCount ?? 12,
    damagedBookCount: config.damagedBookCount ?? 1,
  };
  if (![0, 1, 2].includes(normalized.visitorCount)
    || !['mixed', 'find', 'shelve'].includes(normalized.requestMode)
    || ![6, 12, 18].includes(normalized.bookCount)
    || ![0, 1, 2].includes(normalized.damagedBookCount)) throw new Error('도서관 근무 설정을 확인해 주세요.');
  return normalized;
}
const cartCarriedCount = (session: LibrarySession) =>
  session.books.filter(book => book.source !== 'visitor' && book.location === 'carried').length;
/** Visitor requests use separate capacity; six normal returns can still be carried. */
export function getLibraryCartBatch(session: LibrarySession): LibrarySessionBook[] {
  const capacity = Math.max(0, LIBRARY_CART_BATCH_SIZE - cartCarriedCount(session));
  return session.books.filter(book => book.location === 'return-cart' && book.source !== 'visitor').slice(0, capacity);
}
export type LibraryAction =
  | { type: 'acceptTask' }
  | { type: 'inspectBook'; bookId: string }
  | { type: 'collectBook'; bookId: string }
  | { type: 'collectAll' }
  | { type: 'placeBook'; bookId: string; shelfId: LibraryCategoryId; slot?: LibraryShelfSlot }
  | { type: 'takeBook'; bookId: string }
  | { type: 'askLibrarian'; bookId: string }
  | { type: 'handoffBook'; bookId: string }
  | { type: 'talkVisitor'; visitorId?: LibraryVisitorId }
  | { type: 'lookupVisitor'; visitorId?: LibraryVisitorId }
  | { type: 'guideVisitor'; visitorId?: LibraryVisitorId; shelfId: LibraryCategoryId }
  | { type: 'finishVisitorGuide'; visitorId?: LibraryVisitorId; shelfId: LibraryCategoryId }
  | { type: 'acceptVisitorBook'; visitorId?: LibraryVisitorId }
  | { type: 'finishVisitorShelving'; visitorId?: LibraryVisitorId }
  | { type: 'referVisitor'; visitorId?: LibraryVisitorId }
  | { type: 'useSupport'; support: LibrarySupportKind; bookId?: string }
  | { type: 'report'; shelvedCount: number; handedOffCount: number }
  | { type: 'reset'; seed?: string | number; startedAt?: number; sessionId?: string };

function randomFor(seed: string) {
  let state = 2166136261;
  for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}
function workBook(bookId: string, damagedLabel: boolean, visitorId?: LibraryVisitorId): LibrarySessionBook {
  return { bookId, source: visitorId ? 'visitor' : 'cart', ...(visitorId ? { visitorId } : {}),
    damagedLabel, location: visitorId ? 'carried' : 'return-cart', shelfId: null,
    inspected: false, librarianAsked: false, placementAttempts: 0, firstShelfId: null,
    wrongAttempts: 0, corrections: 0, needsCorrection: false };
}
export function createLibrarySession(options: LibrarySessionConfig = {}): LibrarySession {
  const startedAt = options.startedAt ?? (options.seed === undefined ? Date.now() : 0);
  const seed = String(options.seed ?? startedAt);
  const supportMode = options.supportMode ?? 'guided';
  if (supportMode !== 'guided' && supportMode !== 'independent') throw new Error('도서관 안내 방식을 확인해 주세요.');
  const config = normalizeLibraryConfig(options);
  const random = randomFor('library:v4:' + seed);
  const categories = shuffle(LIBRARY_CATEGORIES, random);
  const selectedCategories = [...categories, ...shuffle(categories, random)].slice(0, config.bookCount);
  const pools = new Map(categories.map(category => [category.id, shuffle(LIBRARY_BOOKS.filter(book => book.categoryId === category.id), random)]));
  const assigned = selectedCategories.map(category => pools.get(category.id)!.shift()!);
  // Keep exceptional books in the first batch so support can be learned early.
  const damagedIndices = shuffle(Array.from({length:Math.min(config.bookCount,LIBRARY_CART_BATCH_SIZE)},(_,i)=>i),random).slice(0,config.damagedBookCount);
  const available = shuffle(LIBRARY_BOOKS.filter(book=>!assigned.some(item=>item.id===book.id)),random);
  const firstMixed: LibraryVisitorRequest = random() < 0.5 ? 'find' : 'shelve';
  const visitors: LibraryVisitor[] = Array.from({length:config.visitorCount},(_,index)=>({
    id: index === 0 ? 'visitor' : 'visitor-2',
    requestType: config.requestMode === 'mixed' ? (index === 0 ? firstMixed : firstMixed === 'find' ? 'shelve' : 'find') : config.requestMode,
    status:'waiting', bookId:available[index].id, lookupUsed:false, attempts:0, wrongAttempts:0, resolution:null,
  }));
  return {
    sessionId: options.sessionId ?? 'library:' + seed + ':' + startedAt, startedAt, seed, supportMode, config, phase:'briefing',
    books:assigned.map((book,index)=>workBook(book.id,damagedIndices.includes(index))),
    visitors,supportUses:[],reportAttempts:0,events:[],lastActionError:null,
  };
}
export type LibraryProgress = {
  total: number;
  cartTotal: number;
  visitorBookCount: number;
  correctlyShelved: number;
  handedOff: number;
  misplaced: number;
  onCart: number;
  carried: number;
  remaining: number;
  visitorsTotal: number;
  visitorsResolved: number;
  visitorResolved: boolean;
  canReport: boolean;
};
export function getLibraryProgress(session: LibrarySession): LibraryProgress {
  const correctlyShelved = session.books.filter(book => book.location === 'shelf' && !book.damagedLabel
    && getLibraryBook(book.bookId)?.categoryId === book.shelfId).length;
  const handedOff = session.books.filter(book => book.location === 'handoff' && book.damagedLabel && book.librarianAsked).length;
  const misplaced = session.books.filter(book => book.location === 'shelf'
    && (book.damagedLabel || getLibraryBook(book.bookId)?.categoryId !== book.shelfId)).length;
  const remaining = session.books.length - correctlyShelved - handedOff;
  const visitorsResolved = session.visitors.filter(visitor=>visitor.status==='resolved').length;
  const visitorResolved = visitorsResolved === session.visitors.length;
  return {
    total:session.books.length,cartTotal:session.books.filter(book=>book.source!=='visitor').length,
    visitorBookCount:session.books.filter(book=>book.source==='visitor').length,
    correctlyShelved,handedOff,misplaced,
    onCart:session.books.filter(book=>book.location==='return-cart').length,
    carried:session.books.filter(book=>book.location==='carried').length,
    remaining,visitorsTotal:session.visitors.length,visitorsResolved,visitorResolved,
    canReport:session.phase==='working'&&remaining===0&&visitorResolved,
  };
}
function record(session: LibrarySession, type: string, payload: LibraryEvent['payload'] = {}): LibrarySession {
  return {...session,events:[...session.events,{sequence:session.events.length+1,type,payload}]};
}
function reject(session: LibrarySession,message: string): LibrarySession {
  return {...session,lastActionError:message};
}
function updateBook(session: LibrarySession,bookId: string,update: Partial<LibrarySessionBook>): LibrarySession {
  return {...session,books:session.books.map(book=>book.bookId===bookId?{...book,...update}:book)};
}
function updateVisitor(session: LibrarySession,id: LibraryVisitorId,update: Partial<LibraryVisitor>): LibrarySession {
  return {...session,visitors:session.visitors.map(visitor=>visitor.id===id?{...visitor,...update}:visitor)};
}
const visitorActionTypes = ['talkVisitor','lookupVisitor','guideVisitor','finishVisitorGuide','acceptVisitorBook','finishVisitorShelving','referVisitor'] as const;

/** UI owns movement. Only the reducer can accept work or finish a visitor request. */
export function applyLibraryAction(previous: LibrarySession,action: LibraryAction): LibrarySession {
  if(action.type==='reset') return createLibrarySession({
    ...previous.config,seed:action.seed??previous.seed,supportMode:previous.supportMode,
    startedAt:action.startedAt??previous.startedAt,sessionId:action.sessionId??previous.sessionId+':retry',
  });
  let session: LibrarySession = {...previous,lastActionError:null};
  if(session.phase==='finished') return reject(session,'이번 근무를 마쳤어요.');
  if(action.type==='acceptTask') {
    if(session.phase!=='briefing') return reject(session,'이미 업무를 받았어요.');
    return record({...session,phase:'working'},'task_accepted',{
      bookCount:session.config.bookCount,damagedBookCount:session.config.damagedBookCount,
      visitorCount:session.config.visitorCount,requestMode:session.config.requestMode,supportMode:session.supportMode,
    });
  }
  if(action.type==='useSupport') {
    if(!['notebook','repeat-instructions','label-zoom'].includes(action.support)) return reject(session,'도움 종류를 확인해 주세요.');
    if(action.support==='label-zoom'&&(!action.bookId||!session.books.some(book=>book.bookId===action.bookId))) return reject(session,'확인할 책을 골라 주세요.');
    const bookId=action.support==='label-zoom'?action.bookId!:null;
    if(bookId) session=updateBook(session,bookId,{inspected:true});
    return record({...session,supportUses:[...session.supportUses,{kind:action.support,bookId}]},'support_used',{support:action.support,bookId});
  }
  if(session.phase!=='working') return reject(session,'사서에게 먼저 업무를 받아 주세요.');
  if('bookId' in action) {
    const book=session.books.find(item=>item.bookId===action.bookId);
    if(!book) return reject(session,'이번에 맡은 책이 아니에요.');
    switch(action.type) {
      case 'inspectBook':
        return record(updateBook(session,book.bookId,{inspected:true}),'book_inspected',{bookId:book.bookId,damagedLabel:book.damagedLabel});
      case 'collectBook':
        if(book.location!=='return-cart'||book.source==='visitor') return reject(session,'북카트에 있는 책을 골라 주세요.');
        if(cartCarriedCount(session)>=LIBRARY_CART_BATCH_SIZE) return reject(session,'가지고 있는 책을 먼저 정리해 주세요.');
        return record(updateBook(session,book.bookId,{location:'carried'}),'book_collected',{bookId:book.bookId});
      case 'placeBook': {
        if(!LIBRARY_CATEGORIES.some(category=>category.id===action.shelfId)) return reject(session,'책을 꽂을 서가를 확인해 주세요.');
        if(book.location!=='carried') return reject(session,'책을 먼저 가져와 주세요.');
        if(book.damagedLabel) return reject(session,book.librarianAsked?'이 책은 확인함에 놓아 주세요.':'라벨을 확인한 뒤 사서에게 물어봐 주세요.');
        const correct=getLibraryBook(book.bookId)!.categoryId===action.shelfId;
        if (action.slot !== undefined) {
          if (![0, 1, 2].includes(action.slot)) return reject(session, '책을 꽂을 자리를 골라 주세요.');
          const ordered = isLibraryShelfSlotCorrect(book.bookId, action.shelfId, action.slot);
          session = record(session, 'shelf_order_checked', { bookId: book.bookId, shelfId: action.shelfId, slot: action.slot, correct: ordered });
          if (correct && !ordered) return reject(session, '맨 윗줄 번호가 작은 책부터 왼쪽에 놓아요. 양옆 번호를 다시 비교해 보세요.');
        }
        const corrected=correct&&book.needsCorrection;
        session=record(updateBook(session,book.bookId,{
          location:'shelf',shelfId:action.shelfId,placementAttempts:book.placementAttempts+1,
          firstShelfId:book.firstShelfId??action.shelfId,wrongAttempts:book.wrongAttempts+Number(!correct),
          corrections:book.corrections+Number(corrected),needsCorrection:!correct,
        }),'book_placed',{bookId:book.bookId,shelfId:action.shelfId,correct,firstAttempt:book.placementAttempts===0,corrected});
        return book.visitorId?updateVisitor(session,book.visitorId,{status:correct?'awaiting-report':'awaiting-shelve'}):session;
      }
      case 'takeBook': {
        if(book.location!=='shelf') return reject(session,'서가에 꽂힌 책을 골라 주세요.');
        if(book.source!=='visitor'&&cartCarriedCount(session)>=LIBRARY_CART_BATCH_SIZE) return reject(session,'가지고 있는 책을 먼저 정리해 주세요.');
        if(book.visitorId&&session.visitors.find(visitor=>visitor.id===book.visitorId)?.status==='resolved') return reject(session,'이미 손님께 정리 완료를 알려 드린 책이에요.');
        session=record(updateBook(session,book.bookId,{location:'carried',shelfId:null}),'book_taken',{bookId:book.bookId,fromShelfId:book.shelfId});
        return book.visitorId?updateVisitor(session,book.visitorId,{status:'awaiting-shelve',resolution:null}):session;
      }
      case 'askLibrarian':
        if(!book.inspected) return reject(session,'책의 라벨을 먼저 확인해 주세요.');
        if(book.location==='handoff') return reject(session,'이미 확인함에 놓은 책이에요.');
        return record(updateBook(session,book.bookId,{librarianAsked:true}),'librarian_asked',{bookId:book.bookId,damagedLabel:book.damagedLabel});
      case 'handoffBook':
        if(!book.damagedLabel) return reject(session,'이 책은 라벨에 맞는 서가에 꽂아 주세요.');
        if(!book.inspected||!book.librarianAsked) return reject(session,'사서에게 먼저 확인해 주세요.');
        if(book.location!=='carried') return reject(session,'확인할 책을 먼저 가져와 주세요.');
        return record(updateBook(session,book.bookId,{location:'handoff',shelfId:null}),'book_handed_off',{bookId:book.bookId});
    }
  }
  if(visitorActionTypes.includes(action.type as typeof visitorActionTypes[number])) {
    const visitorId=('visitorId' in action?action.visitorId:undefined)??'visitor';
    const visitor=session.visitors.find(item=>item.id===visitorId);
    if(!visitor) return reject(session,'안내할 이용자를 확인해 주세요.');
    const payload={visitorId,bookId:visitor.bookId,requestType:visitor.requestType};
    switch(action.type) {
      case 'talkVisitor':
        if(visitor.status==='resolved') return reject(session,'이용자 안내를 마쳤어요.');
        if(visitor.status!=='waiting') return session;
        return record(updateVisitor(session,visitorId,{status:'active'}),'visitor_request_heard',payload);
      case 'lookupVisitor':
        if(!['active','awaiting-shelve','awaiting-report'].includes(visitor.status)) return reject(session,'이용자가 찾는 책을 먼저 들어 주세요.');
        if(visitor.lookupUsed) return session;
        return record(updateVisitor(session,visitorId,{lookupUsed:true}),'visitor_location_checked',payload);
      case 'guideVisitor': {
        if(visitor.requestType!=='find'||visitor.status!=='active') return reject(session,'이용자가 찾는 책을 먼저 들어 주세요.');
        if(session.visitors.some(other=>other.id!==visitorId&&other.status==='escorting')) return reject(session,'함께 이동 중인 손님을 먼저 안내해 주세요.');
        if(!LIBRARY_CATEGORIES.some(category=>category.id===action.shelfId)) return reject(session,'안내할 서가를 확인해 주세요.');
        const correct=getLibraryBook(visitor.bookId)!.categoryId===action.shelfId;
        session=record(updateVisitor(session,visitorId,{
          status:correct?'escorting':'active',resolution:null,attempts:visitor.attempts+1,wrongAttempts:visitor.wrongAttempts+Number(!correct),
        }),'visitor_guided',{...payload,shelfId:action.shelfId,correct,lookupUsed:visitor.lookupUsed});
        return correct?session:reject(session,'책의 위치를 다시 확인해 주세요.');
      }
      case 'finishVisitorGuide':
        if(visitor.requestType!=='find'||visitor.status!=='escorting') return reject(session,'먼저 이용자에게 안내할 서가를 알려 주세요.');
        if(getLibraryBook(visitor.bookId)!.categoryId!==action.shelfId) return reject(session,'안내한 서가에서 책 위치를 확인해 주세요.');
        return record(updateVisitor(session,visitorId,{status:'resolved',resolution:'guided'}),'visitor_guide_completed',{...payload,shelfId:action.shelfId});
      case 'acceptVisitorBook':
        if(visitor.requestType!=='shelve'||visitor.status!=='active') return reject(session,'책 정리를 부탁하는 이용자에게 먼저 말해 주세요.');
        if(session.books.some(book=>book.bookId===visitor.bookId)) return reject(session,'이미 받은 책이에요.');
        session={...session,books:[...session.books,workBook(visitor.bookId,false,visitorId)]};
        return record(updateVisitor(session,visitorId,{status:'awaiting-shelve'}),'visitor_book_accepted',payload);
      case 'finishVisitorShelving': {
        const book=session.books.find(item=>item.bookId===visitor.bookId&&item.visitorId===visitorId&&item.source==='visitor');
        if(visitor.requestType!=='shelve'||visitor.status!=='awaiting-report'||!book||book.location!=='shelf'
          ||book.shelfId!==getLibraryBook(book.bookId)!.categoryId||book.damagedLabel) return reject(session,'부탁받은 책을 알맞은 서가에 꽂은 뒤 알려 주세요.');
        return record(updateVisitor(session,visitorId,{status:'resolved',resolution:'shelved'}),'visitor_shelving_completed',payload);
      }
      case 'referVisitor':
        if(visitor.status!=='active') return reject(session,'이용자의 부탁을 먼저 들어 주세요.');
        return record(updateVisitor(session,visitorId,{status:'resolved',resolution:'referred'}),'visitor_referred',payload);
    }
  }
  switch(action.type) {
    case 'collectAll': {
      const batch=getLibraryCartBatch(session);
      if(!batch.length) return reject(session,session.books.some(book=>book.location==='return-cart')?'가지고 있는 책을 먼저 정리해 주세요.':'북카트에 남은 책이 없어요.');
      for(const book of batch) session=record(updateBook(session,book.bookId,{location:'carried'}),'book_collected',{bookId:book.bookId});
      return session;
    }
    case 'report': {
      if(!Number.isInteger(action.shelvedCount)||!Number.isInteger(action.handedOffCount)||action.shelvedCount<0||action.handedOffCount<0
        ||action.shelvedCount>session.books.length||action.handedOffCount>session.books.length) return reject(session,'보고할 책의 권수를 확인해 주세요.');
      const progress=getLibraryProgress(session);
      const actualShelved=session.books.filter(book=>book.location==='shelf').length;
      const matches=action.shelvedCount===actualShelved&&action.handedOffCount===progress.handedOff;
      session=record({...session,reportAttempts:session.reportAttempts+1},'work_reported',{
        shelvedCount:action.shelvedCount,handedOffCount:action.handedOffCount,matchesActual:matches,
        correctlyShelved:progress.correctlyShelved,misplaced:progress.misplaced,remaining:progress.remaining,
        visitorResolved:progress.visitorResolved,success:progress.canReport&&matches,
      });
      if(!matches) return reject(session,'서가와 확인함의 책 수를 다시 확인해 주세요.');
      if(progress.misplaced) return reject(session,'다른 서가에 꽂힌 책이 있어요. 라벨을 다시 확인해 주세요.');
      if(progress.remaining) return reject(session,'아직 정리할 책이 '+progress.remaining+'권 남아 있어요.');
      if(!progress.visitorResolved) return reject(session,'기다리는 이용자의 부탁을 마친 뒤 보고해 주세요.');
      return record({...session,phase:'finished'},'shift_completed',{correctlyShelved:progress.correctlyShelved,handedOff:progress.handedOff,visitorsResolved:progress.visitorsResolved});
    }
    default:return reject(session,'이 행동을 다시 확인해 주세요.');
  }
}
export type LibraryResult = {
  total: number; cartTotal: number; visitorBookCount: number;
  correctlyShelved: number; handedOff: number; firstAttemptCorrect: number;
  wrongPlacementAttempts: number; corrections: number; librarianQuestions: number;
  supportUseCount: number; supportKinds: LibrarySupportKind[];
  visitorsTotal: number; visitorsResolved: number; visitorsGuided: number; visitorsShelved: number; visitorsReferred: number;
  visitorResolution: 'guided' | 'shelved' | 'referred' | 'none' | 'mixed';
  visitorLookupUsed: boolean; visitorWrongAttempts: number; reportAttempts: number;
};
export function getLibraryResult(session: LibrarySession): LibraryResult | null {
  if(session.phase!=='finished') return null;
  const progress=getLibraryProgress(session);
  const resolutions=new Set(session.visitors.map(visitor=>visitor.resolution!));
  return {
    total:progress.total,cartTotal:progress.cartTotal,visitorBookCount:progress.visitorBookCount,
    correctlyShelved:progress.correctlyShelved,handedOff:progress.handedOff,
    firstAttemptCorrect:session.books.filter(book=>!book.damagedLabel&&book.firstShelfId===getLibraryBook(book.bookId)!.categoryId).length,
    wrongPlacementAttempts:session.books.reduce((sum,book)=>sum+book.wrongAttempts,0),
    corrections:session.books.reduce((sum,book)=>sum+book.corrections,0),
    librarianQuestions:session.events.filter(event=>event.type==='librarian_asked').length,
    supportUseCount:session.supportUses.length,supportKinds:[...new Set(session.supportUses.map(support=>support.kind))],
    visitorsTotal:progress.visitorsTotal,visitorsResolved:progress.visitorsResolved,
    visitorsGuided:session.visitors.filter(visitor=>visitor.resolution==='guided').length,
    visitorsShelved:session.visitors.filter(visitor=>visitor.resolution==='shelved').length,
    visitorsReferred:session.visitors.filter(visitor=>visitor.resolution==='referred').length,
    visitorResolution:resolutions.size===0?'none':resolutions.size>1?'mixed':[...resolutions][0],
    visitorLookupUsed:session.visitors.some(visitor=>visitor.lookupUsed),
    visitorWrongAttempts:session.visitors.reduce((sum,visitor)=>sum+visitor.wrongAttempts,0),reportAttempts:session.reportAttempts,
  };
}
