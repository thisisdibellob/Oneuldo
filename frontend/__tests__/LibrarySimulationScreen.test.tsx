import { act, fireEvent, render, within } from '@testing-library/react-native';
import { AccessibilityInfo, ScrollView } from 'react-native';
import { LibrarySimulationScreen } from '../src/screens/LibrarySimulationScreen';
import { createLibrarySession, getLibraryBook, getLibraryCategory, isLibraryShelfSlotCorrect, LIBRARY_CATEGORIES, type LibrarySession, type LibrarySessionBook } from '../src/game/librarySession';
import { rateLibraryEpisode, saveLibraryEpisode } from '../src/game/libraryEpisodeStore';
import type { LibraryStation } from '../src/game/libraryWorld';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  },
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native');
  return { GlassView: View, isLiquidGlassAvailable: () => false };
});
// Exercise the real work panels and dialogue; only replace world movement with station buttons.
jest.mock('../src/components/game/LibraryRoom', () => {
  const { View, Pressable, Text } = jest.requireActual('react-native');
  const { LIBRARY_CATEGORIES } = jest.requireActual('../src/game/librarySession');
  return { LibraryRoom: ({ locked, visitors, visitorInteractionEnabled, onInteract }: { locked: boolean; visitors: { id: string }[]; visitorInteractionEnabled: boolean; onInteract: (station: string) => void }) => <View testID="library-test-room">
    {['librarian', 'cart', ...LIBRARY_CATEGORIES.map((category: { id: string }) => category.id), 'handoff', 'catalog', 'exit', ...visitors.map(visitor => visitor.id)].map(station =>
      <Pressable key={station} accessibilityRole="button" accessibilityLabel={`이동 ${station}`} disabled={locked || (station.startsWith('visitor') && !visitorInteractionEnabled)} onPress={() => onInteract(station)}><Text>{station}</Text></Pressable>)}
  </View> };
});
jest.mock('../src/game/libraryEpisodeStore', () => ({
  saveLibraryEpisode: jest.fn(() => ({ storage: 'memory', persisted: false, duplicate: false })),
  rateLibraryEpisode: jest.fn(() => ({ updated: true, storage: 'memory', persisted: false })),
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

type Screen = ReturnType<typeof render>;
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
async function press(screen: Screen, label: string) {
  fireEvent.press(screen.getByRole('button', { name: label }));
  await flush();
}
const visit = (screen: Screen, station: LibraryStation) => press(screen, `이동 ${station}`);
const close = (screen: Screen) => press(screen, '닫기');

async function start(screen: Screen) {
  await visit(screen, 'librarian');
  await press(screen, '시작할게요');
}

async function place(screen: Screen, book: LibrarySessionBook, categoryId = getLibraryBook(book.bookId)!.categoryId) {
  await visit(screen, categoryId);
  if (!screen.queryByRole('button', { name: `${getLibraryBook(book.bookId)!.title} 선택` })) {
    await close(screen);
    await visit(screen, 'cart');
    await press(screen, '책 가져오기');
    await visit(screen, categoryId);
  }
  // The shelf's accessible tap is the same one-tap selection alternative offered alongside dragging.
  fireEvent(screen.getByRole('button', { name: `${getLibraryBook(book.bookId)!.title} 선택` }), 'accessibilityTap');
  await flush();
  // Keep the selected number and action together immediately beneath the shelf,
  // instead of putting them after every carried book on narrow screens.
  expect(within(screen.getByTestId('library-shelf-selection')).getByRole('button', { name: '이 서가에 꽂기' })).toBeTruthy();
  expect(within(screen.getByTestId('library-shelf-selection')).getByText(getLibraryBook(book.bookId)!.callNumber.split('\n')[0])).toBeTruthy();
  expect(screen.getByRole('button', { name: '이 서가에 꽂기' }).props.accessibilityState.disabled).toBe(true);
  const slot = ([0, 1, 2] as const).find(value => isLibraryShelfSlotCorrect(book.bookId, categoryId, value)) ?? 0;
  await press(screen, `책 꽂을 자리 ${slot + 1}`);
  await press(screen, '이 서가에 꽂기');
  await close(screen);
}

async function handleDamagedBook(screen: Screen, damaged: LibrarySessionBook) {
  await press(screen, '수첩 열기');
  await press(screen, `${getLibraryBook(damaged.bookId)!.title} 확인`);
  expect(screen.getByText('라벨 훼손')).toBeTruthy();
  await close(screen);
  await visit(screen, 'librarian');
  await press(screen, '이 책의 라벨이 안 보여요');
  await press(screen, '네, 알겠습니다');
  await visit(screen, 'handoff');
  await press(screen, '확인함에 놓기');
}

async function report(screen: Screen, shelved: number, handedOff: number) {
  await visit(screen, 'librarian');
  await press(screen, '정리를 마쳤어요');
  await press(screen, `서가에 꽂은 책 ${shelved}권`);
  await press(screen, `확인함에 놓은 책 ${handedOff}권`);
  await press(screen, '이렇게 보고하기');
}

it('서가에서 직접 번호를 비교하고 틀린 자리에서 책을 잃지 않은 채 고쳐 꽂는다', async () => {
  const config = { seed: 'screen-order', visitorCount: 0 as const, damagedBookCount: 0 as const };
  const initial = createLibrarySession(config);
  const book = initial.books.slice(0, 6).find(item => getLibraryBook(item.bookId)!.categoryId !== 'story')!;
  const shelfId = getLibraryBook(book.bookId)!.categoryId;
  const wrong = ([0, 1, 2] as const).find(slot => !isLibraryShelfSlotCorrect(book.bookId, shelfId, slot))!;
  const right = ([0, 1, 2] as const).find(slot => isLibraryShelfSlotCorrect(book.bookId, shelfId, slot))!;
  const screen = render(<LibrarySimulationScreen initialConfig={config} onExit={jest.fn()} />);
  await flush(); await start(screen); await visit(screen, 'cart'); await press(screen, '책 가져오기'); await visit(screen, shelfId);
  expect(screen.getByTestId('library-order-help')).toBeTruthy();
  const selectedLabel = `${getLibraryBook(book.bookId)!.title} 선택`;
  fireEvent(screen.getByRole('button', { name: selectedLabel }), 'accessibilityTap'); await flush();
  expect(screen.getByRole('button', { name: '이 서가에 꽂기' }).props.accessibilityState.disabled).toBe(true);
  await press(screen, `책 꽂을 자리 ${wrong + 1}`); await press(screen, '이 서가에 꽂기');
  expect(screen.getByTestId('library-shelf-feedback')).toBeTruthy();
  expect(screen.getByRole('button', { name: selectedLabel })).toBeTruthy();
  await press(screen, `책 꽂을 자리 ${right + 1}`); await press(screen, '이 서가에 꽂기');
  expect(screen.queryByRole('button', { name: selectedLabel })).toBeNull();
  expect(screen.queryByTestId('library-order-help')).toBeNull();
  expect(screen.getByRole('button', { name: `${getLibraryBook(book.bookId)!.title} 다시 꺼내기` })).toBeTruthy();
  screen.unmount();
});

it('책 확인부터 사서 인계, 이용자 검색과 보고까지 완료하고 결과를 한 번 저장하며 재근무한다', async () => {
  const config = { seed: 'ui-complete', startedAt: 100, sessionId: 'ui-complete', requestMode: 'find' as const };
  const initial = createLibrarySession(config);
  const damaged = initial.books.find(book => book.damagedLabel)!;
  const screen = render(<LibrarySimulationScreen initialConfig={config} onExit={jest.fn()} />);
  await flush();
  await start(screen);
  await visit(screen, 'cart');
  expect(screen.getByText('반납 처리 완료')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: / 확인$/ })).toHaveLength(6);
  await press(screen, `${getLibraryBook(damaged.bookId)!.title} 확인`);
  await press(screen, '책등 라벨 확대');
  expect(screen.getByText('라벨 훼손')).toBeTruthy();
  await press(screen, '책 가져오기');
  await visit(screen, 'handoff');
  expect(screen.getByRole('button', { name: '확인함에 놓기' }).props.accessibilityState.disabled).toBe(true);
  await close(screen);
  await visit(screen, 'librarian');
  await press(screen, '이 책의 라벨이 안 보여요');
  expect(screen.getByTestId('market-staff-response-text').props.children).toContain('확인함');
  await press(screen, '네, 알겠습니다');
  await visit(screen, 'handoff');
  await press(screen, '확인함에 놓기');
  for (const book of initial.books.filter(book => !book.damagedLabel)) await place(screen, book);

  await visit(screen, 'visitor');
  await press(screen, '책 위치를 확인해 볼게요');
  const visitorBook = getLibraryBook(initial.visitors[0].bookId)!;
  expect(screen.getByText(visitorBook.callNumber)).toBeTruthy();
  const wrongCategory = LIBRARY_CATEGORIES.find(category => category.id !== visitorBook.categoryId)!;
  await press(screen, `${wrongCategory.callRange} 서가에 있어요`);
  expect(screen.getByText('책의 위치를 다시 확인해 주세요.')).toBeTruthy();
  await press(screen, `${getLibraryCategory(visitorBook.categoryId).callRange} 서가에 있어요`);
  await press(screen, '같이 가요');
  expect(screen.getByText(`손님과 ${getLibraryCategory(visitorBook.categoryId).callRange} 서가로 가기`)).toBeTruthy();
  expect(saveLibraryEpisode).not.toHaveBeenCalled();
  await visit(screen, visitorBook.categoryId);
  await press(screen, '여기에서 찾으실 수 있어요');
  await press(screen, '네, 편하게 둘러보세요');

  await report(screen, 12, 0);
  expect(screen.queryByTestId('library-result')).toBeNull();
  expect(screen.getByText('서가와 확인함의 책 수를 다시 확인해 주세요.')).toBeTruthy();
  await press(screen, '서가에 꽂은 책 11권');
  await press(screen, '확인함에 놓은 책 1권');
  await press(screen, '이렇게 보고하기');
  expect(screen.getByTestId('library-result')).toBeTruthy();
  expect(screen.getByRole('button', { name: '밖으로 나가기' })).toBeTruthy();
  expect(screen.getByText('맡은 책 12권, 정리 끝!')).toBeTruthy();
  expect(screen.getByText('이용자에게 책 위치를 안내했어요.')).toBeTruthy();
  expect(saveLibraryEpisode).toHaveBeenCalledTimes(1);
  const saved = jest.mocked(saveLibraryEpisode).mock.calls[0][0];
  expect(saved).toMatchObject({ phase: 'finished', sessionId: 'ui-complete', reportAttempts: 2,
    visitors: [{ resolution: 'guided', lookupUsed: true, wrongAttempts: 1 }] });
  expect(saved.books.filter(book => book.location === 'shelf')).toHaveLength(11);
  expect(saved.books.filter(book => book.location === 'handoff')).toHaveLength(1);
  expect(saved.supportUses).toContainEqual({ kind: 'label-zoom', bookId: damaged.bookId });
  // Ratings stay with the exit/retry controls, outside the scrolling results.
  let ratingAncestor = screen.getByTestId('library-result-rating').parent;
  while (ratingAncestor) { expect(ratingAncestor.type).not.toBe(ScrollView); ratingAncestor = ratingAncestor.parent; }
  expect(within(screen.getByTestId('library-result-rating')).getAllByRole('button')).toHaveLength(5);
  await press(screen, '만족도 4점');
  expect(screen.getByRole('button', { name: '만족도 4점' }).props.accessibilityState.selected).toBe(true);
  expect(rateLibraryEpisode).toHaveBeenCalledWith('ui-complete', 4);
  expect(saveLibraryEpisode).toHaveBeenCalledTimes(1);
  await press(screen, '한 번 더 근무하기');
  expect(screen.queryByTestId('library-result')).toBeNull();
  expect(screen.getByText('사서에게 업무 받기')).toBeTruthy();
  await start(screen);
  await visit(screen, 'cart');
  expect(screen.getAllByRole('button', { name: / 확인$/ })).toHaveLength(6);
  expect(saveLibraryEpisode).toHaveBeenCalledTimes(1);
  screen.unmount();
});

it('잘못 꽂은 책을 다시 꺼내 고치고 이용자를 사서에게 안내하며 미완료 보고 후 작업을 이어간다', async () => {
  const config = { seed: 'ui-correction', sessionId: 'ui-correction' };
  const initial = createLibrarySession(config);
  const normal = initial.books.filter(book => !book.damagedLabel);
  const damaged = initial.books.find(book => book.damagedLabel)!;
  const screen = render(<LibrarySimulationScreen initialConfig={config} onExit={jest.fn()} />);
  await flush();
  await start(screen);
  await visit(screen, 'cart');
  await press(screen, '책 가져오기');
  const correct = getLibraryBook(normal[0].bookId)!.categoryId;
  const incorrect = LIBRARY_CATEGORIES.find(category => category.id !== correct)!.id;
  await place(screen, normal[0], incorrect);
  await visit(screen, incorrect);
  await press(screen, `${getLibraryBook(normal[0].bookId)!.title} 다시 꺼내기`);
  await close(screen);
  await place(screen, normal[0]);
  for (const book of normal.slice(1, 4)) await place(screen, book);
  await handleDamagedBook(screen, damaged);
  await visit(screen, 'visitor');
  await press(screen, '사서 선생님께 안내해 드릴게요');
  await press(screen, '네, 편하게 둘러보세요');
  await report(screen, 10, 1);
  expect(screen.queryByTestId('library-result')).toBeNull();
  expect(screen.getByText('서가와 확인함의 책 수를 다시 확인해 주세요.')).toBeTruthy();
  expect(saveLibraryEpisode).not.toHaveBeenCalled();
  await press(screen, '업무 수첩 확인');
  expect(screen.getByTestId('library-notebook')).toBeTruthy();
  await close(screen);
  expect(screen.getByTestId('library-report')).toBeTruthy();
  expect(screen.getByRole('button', { name: '서가에 꽂은 책 10권' }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByRole('button', { name: '확인함에 놓은 책 1권' }).props.accessibilityState.selected).toBe(true);
  await close(screen);
  for (const book of normal.slice(4)) await place(screen, book);
  await report(screen, 11, 1);
  expect(screen.getByText('잘못 꽂은 책을 1번 고쳤어요.')).toBeTruthy();
  expect(screen.getByText('이용자를 사서에게 안내했어요.')).toBeTruthy();
  const saved: LibrarySession = jest.mocked(saveLibraryEpisode).mock.calls[0][0];
  expect(saved.books.find(book => book.bookId === normal[0].bookId)).toMatchObject({ firstShelfId: incorrect, shelfId: correct, wrongAttempts: 1, corrections: 1 });
  expect(saved.supportUses.some(support => support.kind === 'notebook')).toBe(true);
  expect(saved.visitors[0]).toMatchObject({ resolution: 'referred', lookupUsed: false });
  screen.unmount();
});

it('업무 전 작업을 막고 안내 방식을 선택하며 나가기 확인에서 계속 근무하거나 도서관 밖으로 나간다', async () => {
  const onExit = jest.fn();
  const screen = render(<LibrarySimulationScreen initialConfig={{ seed: 'ui-exit' }} onExit={onExit} />);
  await flush();
  await visit(screen, 'cart');
  expect(screen.getByText('사서에게 먼저 업무를 받아 주세요.')).toBeTruthy();
  expect(screen.queryByTestId('library-book-panel')).toBeNull();
  await visit(screen, 'librarian');
  await press(screen, '혼자 해보기');
  await press(screen, '시작할게요');
  await visit(screen, 'cart');
  await press(screen, '책 가져오기');
  await visit(screen, 'exit');
  expect(screen.getByText('도서관에서 나갈까요?')).toBeTruthy();
  expect(screen.getByText('지금 나가면 이번 근무를 마쳐요.\n다음에는 새 책으로 시작해요.')).toBeTruthy();
  await press(screen, '계속 근무하기');
  expect(onExit).not.toHaveBeenCalled();
  await press(screen, '수첩 열기');
  expect(screen.getByTestId('library-notebook')).toBeTruthy();
  expect(screen.getAllByText('가지고 있음')).toHaveLength(6);
  await close(screen);
  await visit(screen, 'librarian');
  await press(screen, '할 일을 다시 알려 주세요');
  expect(screen.getByTestId('market-staff-response-text').props.children).toContain('라벨이 없는 책');
  await press(screen, '네, 알겠습니다');
  await visit(screen, 'exit');
  await press(screen, '밖으로 나가기');
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(saveLibraryEpisode).not.toHaveBeenCalled();
  screen.unmount();
});

it('돌아와 이어할 수 있는 일정에서는 퇴장 안내도 진행 유지 사실을 알려준다', async () => {
  const screen = render(<LibrarySimulationScreen initialConfig={{ seed: 'resume-exit' }} resumeOnReturn onExit={jest.fn()} />);
  await flush(); await start(screen); await visit(screen, 'exit');
  expect(screen.getByText('잠시 나갔다 와도 지금 정리하던 책부터 이어서 할 수 있어요.')).toBeTruthy();
  expect(screen.queryByText('지금 나가면 이번 근무를 마쳐요.\n다음에는 새 책으로 시작해요.')).toBeNull();
  screen.unmount();
});

it('10개 분류 서가를 모두 열고 새 분류의 책을 정리하며 업무 수첩에서 전체 번호를 확인한다', async () => {
  const config = { seed: 'ui-all-class-shelves' };
  const initial = createLibrarySession(config);
  const screen = render(<LibrarySimulationScreen initialConfig={config} onExit={jest.fn()} />);
  await flush();
  await start(screen);
  await visit(screen, 'cart');
  await press(screen, '책 가져오기');
  for (const category of LIBRARY_CATEGORIES) {
    await visit(screen, category.id);
    expect(screen.getByTestId('library-shelf-panel')).toBeTruthy();
    expect(screen.getByRole('header', { name: `${category.label} 서가` })).toBeTruthy();
    expect(screen.getByText(category.callRange)).toBeTruthy();
    await close(screen);
  }
  const newClassBooks = initial.books.slice(0, 6).filter(book => !book.damagedLabel && !['story', 'nature', 'life'].includes(getLibraryBook(book.bookId)!.categoryId));
  expect(newClassBooks.length).toBeGreaterThan(0);
  for (const book of newClassBooks) {
    await place(screen, book);
    await visit(screen, getLibraryBook(book.bookId)!.categoryId);
    expect(screen.getByRole('button', { name: `${getLibraryBook(book.bookId)!.title} 다시 꺼내기` })).toBeTruthy();
    await close(screen);
  }
  await press(screen, '수첩 열기');
  await press(screen, '서가 번호 확인하기');
  for (const category of LIBRARY_CATEGORIES) {
    expect(screen.getByText(category.callRange.slice(0, 3))).toBeTruthy();
    expect(screen.getByText(category.label)).toBeTruthy();
  }
  expect(screen.getByText(/000부터 900까지 모든 서가를 이용할 수 있어요/)).toBeTruthy();
  expect(screen.queryByText(/이번 업무는 400·500·800/)).toBeNull();
  screen.unmount();
});

it('작은 휴대폰에서 10개 이용자 안내 선택지는 한 스크롤 안에 있고 마지막 역사 서가도 안내할 수 있다', async () => {
  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 375, height: 600, scale: 1, fontScale: 1 });
  const config = Array.from({ length: 200 }, (_, index) => ({ seed: `ui-history-visitor-${index}`, requestMode: 'find' as const }))
    .find(value => getLibraryBook(createLibrarySession(value).visitors[0].bookId)!.categoryId === 'history')!;
  expect(config).toBeDefined();
  const initial = createLibrarySession(config);
  const screen = render(<LibrarySimulationScreen initialConfig={config} onExit={jest.fn()} />);
  await flush();
  await start(screen);
  await visit(screen, 'cart');
  await press(screen, '책 가져오기');
  for (const book of initial.books.filter(book => !book.damagedLabel).slice(0, 2)) await place(screen, book);
  await visit(screen, 'visitor');
  await press(screen, '책 위치를 확인해 볼게요');
  expect(screen.getByTestId('library-visitor-search')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /서가에 있어요$/ })).toHaveLength(10);
  const scrolls = new Set();
  for (const category of LIBRARY_CATEGORIES) {
    let ancestor = screen.getByRole('button', { name: `${category.callRange} 서가에 있어요` }).parent;
    while (ancestor && ancestor.type !== ScrollView) ancestor = ancestor.parent;
    expect(ancestor).not.toBeNull();
    expect(ancestor!.props.scrollEnabled).toBe(true);
    scrolls.add(ancestor);
  }
  expect(scrolls.size).toBe(1);
  let closeAncestor = screen.getByRole('button', { name: '닫기' }).parent;
  while (closeAncestor) { expect(closeAncestor.type).not.toBe(ScrollView); closeAncestor = closeAncestor.parent; }
  await press(screen, '900 역사 서가에 있어요');
  await press(screen, '같이 가요');
  await visit(screen, 'history');
  await press(screen, '여기에서 찾으실 수 있어요');
  expect(screen.getByTestId('market-staff-response-text').props.children).toContain('고맙습니다');
  await press(screen, '네, 편하게 둘러보세요');
  expect(screen.queryByTestId('library-visitor-search')).toBeNull();
  screen.unmount();
});

it('손님은 업무 전부터 있지만 대화는 시작 후 열리고 수첩 확인 후 실제 서가에서 안내를 마친다', async () => {
  const config = { seed: 'early-visitor-escort', requestMode: 'find' as const };
  const initial = createLibrarySession(config);
  const requested = getLibraryBook(initial.visitors[0].bookId)!;
  const category = getLibraryCategory(requested.categoryId);
  const screen = render(<LibrarySimulationScreen initialConfig={config} onExit={jest.fn()} />);
  await flush();
  expect(screen.getByRole('button', { name: '이동 visitor' })).toBeDisabled();
  await visit(screen, 'visitor');
  expect(screen.queryByText('책 위치를 확인해 볼게요')).toBeNull();
  await start(screen);
  expect(screen.getByRole('button', { name: '이동 visitor' })).toBeEnabled();
  await visit(screen, 'cart');
  await press(screen, '책 가져오기');
  await visit(screen, 'visitor');
  await press(screen, '잠시만 기다려 주세요');
  await visit(screen, 'visitor');
  await press(screen, '책 위치를 확인해 볼게요');
  const bookDetails = within(screen.getByTestId('library-visitor-book-details'));
  expect(bookDetails.getByText(requested.title)).toBeTruthy();
  expect(bookDetails.getByText(requested.callNumber)).toBeTruthy();
  expect(bookDetails.queryByText(new RegExp(category.label))).toBeNull();
  for (const shelf of LIBRARY_CATEGORIES) {
    expect(screen.getByRole('button', { name: `${shelf.callRange} 서가에 있어요` })).toBeTruthy();
  }
  // Looking up the call number must not reveal the answer through the notebook either.
  await close(screen);
  await press(screen, '잠시만 기다려 주세요');
  await press(screen, '수첩 열기');
  const noteBeforeChoice = within(screen.getByTestId('library-visitor-note'));
  expect(noteBeforeChoice.getByText(`청구기호 ${requested.callNumber.replace('\n', ' ')}`)).toBeTruthy();
  expect(noteBeforeChoice.queryByText(new RegExp(category.label))).toBeNull();
  await close(screen);
  await visit(screen, 'visitor');
  await press(screen, '책 위치를 확인해 볼게요');
  await press(screen, `${category.callRange} 서가에 있어요`);
  await press(screen, '같이 가요');
  await press(screen, '수첩 열기');
  expect(screen.getByTestId('library-visitor-note')).toBeTruthy();
  expect(screen.getByText(requested.title)).toBeTruthy();
  expect(screen.getByText(`${category.callRange} 서가로 안내 중`)).toBeTruthy();
  expect(screen.getByText('서가 앞에서 이용하기를 눌러 안내해요.')).toBeTruthy();
  await close(screen);
  const other = LIBRARY_CATEGORIES.find(item => item.id !== requested.categoryId)!;
  await visit(screen, other.id);
  expect(screen.queryByRole('button', { name: '여기에서 찾으실 수 있어요' })).toBeNull();
  await close(screen);
  await visit(screen, requested.categoryId);
  await press(screen, '잠시만요');
  expect(screen.getByText(`손님과 ${category.callRange} 서가로 가기`)).toBeTruthy();
  await visit(screen, requested.categoryId);
  await press(screen, '여기에서 찾으실 수 있어요');
  await press(screen, '네, 편하게 둘러보세요');
  expect(screen.queryByText(`손님과 ${category.callRange} 서가로 가기`)).toBeNull();
  await visit(screen, requested.categoryId);
  expect(screen.getByTestId('library-shelf-panel')).toBeTruthy();
  expect(saveLibraryEpisode).not.toHaveBeenCalled();
  screen.unmount();
});

it('업무를 받기 전에도 내 자리에서 52권을 검색하고 분류를 좁힌 뒤 닫을 수 있다', async () => {
  const screen = render(<LibrarySimulationScreen initialConfig={{ seed: 'catalog-ui' }} onExit={jest.fn()} />);
  await flush();
  await visit(screen, 'catalog');
  expect(screen.getByTestId('library-catalog')).toBeTruthy();
  expect(screen.getByText('52권')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('도서 제목 또는 분류번호 검색'), '321.55');
  await flush();
  expect(screen.getByText('1권')).toBeTruthy();
  expect(screen.getByTestId('catalog-neighborhood-jobs')).toBeTruthy();
  await press(screen, '자연과학 도서만 보기');
  expect(screen.getByText('찾는 책이 없어요.')).toBeTruthy();
  await press(screen, '검색어 지우기');
  expect(screen.getByText('6권')).toBeTruthy();
  expect(screen.queryByTestId('catalog-neighborhood-jobs')).toBeNull();
  await close(screen);
  expect(screen.queryByTestId('library-catalog')).toBeNull();
  expect(screen.getByText('사서에게 업무 받기')).toBeTruthy();
  screen.unmount();
});

it('가이드북을 업무 전후에 열고 분류표에서 돌아오며 업무 상태를 유지한다', async () => {
  const screen = render(<LibrarySimulationScreen initialConfig={{ seed: 'guide-ui' }} onExit={jest.fn()} />);
  await flush();
  await press(screen, '수첩 열기');
  await press(screen, '도서 알바 가이드북');
  expect(screen.getByTestId('library-guidebook')).toBeTruthy();
  await press(screen, '다음 안내');
  expect(screen.getByText('윗줄은 분류번호, 아랫줄은 도서기호예요.')).toBeTruthy();
  await press(screen, '000–900 서가 번호 보기');
  expect(screen.getByText('한국십진분류법 · KDC')).toBeTruthy();
  await close(screen);
  expect(screen.getByTestId('library-guidebook')).toBeTruthy();
  expect(screen.getByText('2 / 6')).toBeTruthy();
  await press(screen, '완료 보고 안내');
  expect(screen.getByText('6 / 6')).toBeTruthy();
  await close(screen);
  expect(screen.getByTestId('library-notebook')).toBeTruthy();
  await close(screen);
  await start(screen);
  await visit(screen, 'cart');
  await press(screen, '책 가져오기');
  await press(screen, '수첩 열기');
  await press(screen, '도서 알바 가이드북');
  await close(screen);
  expect(screen.getAllByText('가지고 있음')).toHaveLength(6);
  screen.unmount();
});

it('업무 전 설정에서 손님을 0명으로 바꾸고 훼손 없는 6권만 정리해 완료하며 재시작에도 설정을 유지한다', async () => {
  const initialConfig = { seed: 'setup-no-visitors', sessionId: 'no-visitor-shift', startedAt: 500 };
  const screen = render(<LibrarySimulationScreen initialConfig={initialConfig} onExit={jest.fn()} />);
  await flush();
  await visit(screen, 'librarian');
  await press(screen, '근무 설정 바꾸기');
  for (const name of ['손님 0명', '정리할 책 6권', '라벨 훼손 0권']) {
    fireEvent.press(screen.getByRole('radio', { name })); await flush();
  }
  expect(screen.queryByRole('button', { name: '이동 visitor' })).toBeNull();
  await close(screen);
  expect(screen.getByRole('button', { name: '시작할게요' })).toBeTruthy();
  await press(screen, '근무 설정 바꾸기');
  expect(screen.getByRole('radio', { name: '손님 0명' })).toBeChecked();
  await press(screen, '이 설정으로 시작');
  const config = { ...initialConfig, visitorCount: 0 as const, bookCount: 6 as const, damagedBookCount: 0 as const };
  const initial = createLibrarySession(config);
  await visit(screen, 'cart');
  await press(screen, '책 가져오기');
  for (const book of initial.books) await place(screen, book);
  await report(screen, 6, 0);
  expect(screen.getByTestId('library-result')).toBeTruthy();
  expect(screen.queryByText('이용자를 사서에게 안내했어요.')).toBeNull();
  expect(screen.queryByText(/라벨이 없는 책 .*권을 사서에게 확인/)).toBeNull();
  expect(jest.mocked(saveLibraryEpisode).mock.calls[0][0]).toMatchObject({
    visitors: [], config: { visitorCount: 0, bookCount: 6, damagedBookCount: 0 }, phase: 'finished',
  });
  await press(screen, '한 번 더 근무하기');
  await visit(screen, 'librarian');
  await press(screen, '근무 설정 바꾸기');
  for (const name of ['손님 0명', '정리할 책 6권', '라벨 훼손 0권']) expect(screen.getByRole('radio', { name })).toBeChecked();
  screen.unmount();
});

it('두 손님의 위치 안내와 책 꽂기 부탁을 따로 처리하고 오배가를 고쳐 완료 보고까지 연결한다', async () => {
  const config = { seed: 'two-request-ui', visitorCount: 2 as const, requestMode: 'mixed' as const, bookCount: 6 as const, damagedBookCount: 0 as const };
  const initial = createLibrarySession(config);
  const findGuest = initial.visitors.find(item => item.requestType === 'find')!;
  const shelfGuest = initial.visitors.find(item => item.requestType === 'shelve')!;
  const findBook = getLibraryBook(findGuest.bookId)!;
  const shelfBook = getLibraryBook(shelfGuest.bookId)!;
  const screen = render(<LibrarySimulationScreen initialConfig={config} onExit={jest.fn()} />);
  await flush();
  expect(screen.getByRole('button', { name: '이동 visitor' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '이동 visitor-2' })).toBeDisabled();
  await start(screen);
  await visit(screen, shelfGuest.id);
  await press(screen, '네, 책을 확인해 볼게요');
  const requestCard = within(screen.getByTestId('library-visitor-book'));
  expect(requestCard.getByText(shelfBook.callNumber)).toBeTruthy();
  expect(requestCard.queryByText(new RegExp(getLibraryCategory(shelfBook.categoryId).label))).toBeNull();
  await press(screen, '책 받아서 꽂아드리기');
  await visit(screen, 'cart');
  // Guest books have their own slot: the regular six-book batch remains available.
  expect(screen.getAllByRole('button', { name: / 확인$/ })).toHaveLength(6);
  await press(screen, '책 가져오기');
  await visit(screen, findGuest.id);
  await press(screen, '책 위치를 확인해 볼게요');
  await press(screen, `${getLibraryCategory(findBook.categoryId).callRange} 서가에 있어요`);
  await press(screen, '같이 가요');
  await visit(screen, findBook.categoryId);
  await press(screen, '여기에서 찾으실 수 있어요');
  await press(screen, '네, 편하게 둘러보세요');
  const receivedBook: LibrarySessionBook = { ...initial.books[0], bookId: shelfBook.id, source: 'visitor', visitorId: shelfGuest.id };
  const wrong = LIBRARY_CATEGORIES.find(item => item.id !== shelfBook.categoryId)!;
  await place(screen, receivedBook, wrong.id);
  await visit(screen, shelfGuest.id);
  expect(screen.queryByRole('button', { name: '책을 제자리에 꽂았어요' })).toBeNull();
  await press(screen, '정리하고 다시 알려드릴게요');
  await visit(screen, wrong.id);
  await press(screen, `${shelfBook.title} 다시 꺼내기`);
  await close(screen);
  await place(screen, receivedBook);
  for (const book of initial.books) await place(screen, book);
  await report(screen, 7, 0);
  expect(screen.queryByTestId('library-result')).toBeNull();
  expect(saveLibraryEpisode).not.toHaveBeenCalled();
  await close(screen);
  await visit(screen, shelfGuest.id);
  await press(screen, '책을 제자리에 꽂았어요');
  await press(screen, '네, 편하게 둘러보세요');
  await visit(screen, shelfBook.categoryId);
  await press(screen, `${shelfBook.title} 다시 꺼내기`);
  expect(screen.getByText('이미 손님께 정리 완료를 알려 드린 책이에요.')).toBeTruthy();
  expect(screen.queryByText('책을 다시 꺼냈어요.')).toBeNull();
  await close(screen);
  await report(screen, 7, 0);
  expect(screen.getByText('손님이 맡긴 책 1권을 정리하고 알려드렸어요.')).toBeTruthy();
  expect(screen.getByText('이용자에게 책 위치를 안내했어요.')).toBeTruthy();
  expect(screen.getByText('잘못 꽂은 책을 1번 고쳤어요.')).toBeTruthy();
  const saved = jest.mocked(saveLibraryEpisode).mock.calls[0][0];
  expect(saved.visitors.every(item => item.status === 'resolved')).toBe(true);
  expect(saved.books).toHaveLength(7);
  expect(saved.books.find(item => item.bookId === shelfBook.id)).toMatchObject({ source: 'visitor', corrections: 1, shelfId: shelfBook.categoryId });
  expect(saveLibraryEpisode).toHaveBeenCalledTimes(1);
  screen.unmount();
});

it('훼손된 라벨 2권을 모두 사서에게 확인하고 확인함에 놓아 4권·2권으로 보고한다', async () => {
  const config = { seed: 'two-label-ui', visitorCount: 0 as const, bookCount: 6 as const, damagedBookCount: 2 as const };
  const initial = createLibrarySession(config);
  const screen = render(<LibrarySimulationScreen initialConfig={config} onExit={jest.fn()} />);
  await flush(); await start(screen); await visit(screen, 'cart');
  for (const book of initial.books.filter(item => item.damagedLabel)) await press(screen, `${getLibraryBook(book.bookId)!.title} 확인`);
  await press(screen, '책 가져오기');
  await visit(screen, 'librarian');
  await press(screen, '이 책의 라벨이 안 보여요');
  await press(screen, '네, 알겠습니다');
  await visit(screen, 'handoff');
  await press(screen, '확인함에 놓기');
  for (const book of initial.books.filter(item => !item.damagedLabel)) await place(screen, book);
  await report(screen, 4, 2);
  expect(screen.getByTestId('library-result')).toBeTruthy();
  expect(screen.getByText('라벨이 없는 책 2권을 사서에게 확인했어요.')).toBeTruthy();
  expect(jest.mocked(saveLibraryEpisode).mock.calls[0][0].books.filter(item => item.location === 'handoff')).toHaveLength(2);
  screen.unmount();
});
