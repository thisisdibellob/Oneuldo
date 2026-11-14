import { act, fireEvent, render } from '@testing-library/react-native';
import { PanResponder, ScrollView, StyleSheet, View, type GestureResponderEvent, type PanResponderGestureState } from 'react-native';
import { LibraryPanel, LibraryShelfWork } from '../src/components/game/LibraryWorkPanel';
import { createLibrarySession, getLibraryBook } from '../src/game/librarySession';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('../src/components/game/MarketPanelTransition', () => ({ useMarketReducedMotion: () => true }));

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

const event = (x = 50, y = 450) => ({ nativeEvent: { pageX: x, pageY: y } }) as GestureResponderEvent;
const gesture = (dx = 0, dy = 0, moveX = 50, moveY = 450) => ({ dx, dy, moveX, moveY }) as PanResponderGestureState;

function shelf() {
  let responder: Parameters<typeof PanResponder.create>[0] | undefined;
  const originalCreate = PanResponder.create;
  jest.spyOn(PanResponder, 'create').mockImplementation(config => { responder ??= config; return originalCreate(config); });
  let top = 100;
  const measured = jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(function (this: View, callback) {
    if (this.props.testID === 'library-shelf-drop-zone') callback(100, top, 200, 145);
    else callback(0, 0, 375, 812);
  });
  const book = { ...createLibrarySession({ seed: 'drag-test' }).books.find(item => !item.damagedLabel)!, location: 'carried' as const };
  const onSelect = jest.fn(), onPlace = jest.fn();
  const screen = render(<LibraryPanel title="서가" onClose={jest.fn()}>
    <LibraryShelfWork categoryId={getLibraryBook(book.bookId)!.categoryId} carried={[book]} shelved={[]} selectedId={null}
      onSelect={onSelect} onPlace={onPlace} onTake={jest.fn()} />
  </LibraryPanel>);
  const handlers = responder!;
  return { screen, handlers, onSelect, onPlace, book, measured,
    scrollEnabled: () => screen.UNSAFE_getByType(ScrollView).props.scrollEnabled,
    moveShelf: (nextTop: number) => { top = nextTop; },
  };
}

it('짧게 누르면 책을 선택하고 길게 누르기 전 스와이프는 스크롤에 응답을 넘길 수 있다', () => {
  const { screen, handlers, onSelect, onPlace, book, scrollEnabled } = shelf();
  act(() => handlers.onPanResponderGrant?.(event(), gesture()));
  act(() => jest.advanceTimersByTime(100));
  expect(scrollEnabled()).toBe(true);
  act(() => handlers.onPanResponderRelease?.(event(), gesture()));
  expect(onSelect).toHaveBeenCalledWith(book.bookId);
  expect(onPlace).not.toHaveBeenCalled();
  onSelect.mockClear();

  act(() => handlers.onPanResponderGrant?.(event(), gesture()));
  act(() => handlers.onPanResponderMove?.(event(50, 490), gesture(0, 40, 50, 490)));
  act(() => jest.advanceTimersByTime(400));
  expect(handlers.onPanResponderTerminationRequest?.(event(), gesture())).toBe(true);
  expect(scrollEnabled()).toBe(true);
  act(() => handlers.onPanResponderTerminate?.(event(), gesture()));
  expect(onSelect).not.toHaveBeenCalled();
  expect(onPlace).not.toHaveBeenCalled();
  screen.unmount();
});

it('260ms 후에만 스크롤을 잠그고 드롭 시 다시 측정한 현재 서가 좌표에서만 책을 놓는다', () => {
  const { screen, handlers, onSelect, onPlace, book, measured, moveShelf, scrollEnabled } = shelf();
  fireEvent(screen.getByTestId('library-shelf-drop-zone'), 'layout', { nativeEvent: { layout: { x: 100, y: 100, width: 200, height: 145 } } });
  act(() => handlers.onPanResponderGrant?.(event(), gesture()));
  act(() => jest.advanceTimersByTime(259));
  expect(scrollEnabled()).toBe(true);
  act(() => jest.advanceTimersByTime(1));
  expect(scrollEnabled()).toBe(false);
  expect(handlers.onPanResponderTerminationRequest?.(event(), gesture())).toBe(false);
  // Arming should not select a card or open a footer that moves the drag target mid-gesture.
  expect(onSelect).not.toHaveBeenCalled();
  moveShelf(280);
  act(() => handlers.onPanResponderMove?.(event(170, 310), gesture(120, -140, 170, 310)));
  act(() => handlers.onPanResponderRelease?.(event(170, 310), gesture(120, -140, 170, 310)));
  expect(onPlace.mock.calls).toEqual([[book.bookId]]);
  expect(measured).toHaveBeenCalledTimes(3); // Initial layout, hold activation, current drop bounds.
  expect(scrollEnabled()).toBe(true);

  act(() => handlers.onPanResponderGrant?.(event(), gesture()));
  act(() => jest.advanceTimersByTime(260));
  act(() => handlers.onPanResponderMove?.(event(170, 160), gesture(120, -290, 170, 160)));
  // These coordinates were inside the old shelf but outside its current position.
  act(() => handlers.onPanResponderRelease?.(event(170, 160), gesture(120, -290, 170, 160)));
  expect(onPlace).toHaveBeenCalledTimes(1);
  expect(scrollEnabled()).toBe(true);
  screen.unmount();
});

it('드래그 취소는 책을 놓지 않고 스크롤을 즉시 복원하며 해제된 화면의 누르기 타이머를 정리한다', () => {
  const { screen, handlers, onSelect, onPlace, scrollEnabled } = shelf();
  act(() => handlers.onPanResponderGrant?.(event(), gesture()));
  act(() => jest.advanceTimersByTime(260));
  expect(scrollEnabled()).toBe(false);
  act(() => handlers.onPanResponderMove?.(event(150, 150), gesture(100, -300, 150, 150)));
  act(() => handlers.onPanResponderTerminate?.(event(), gesture()));
  expect(scrollEnabled()).toBe(true);
  expect(onSelect).not.toHaveBeenCalled();
  expect(onPlace).not.toHaveBeenCalled();
  act(() => handlers.onPanResponderGrant?.(event(), gesture()));
  screen.unmount();
  act(() => jest.advanceTimersByTime(1000));
  expect(onSelect).not.toHaveBeenCalled();
  expect(onPlace).not.toHaveBeenCalled();
});

it('책 넣기가 거절되면 성공 색을 표시하지 않고 실제로 받아들여졌을 때만 반짝인다', () => {
  const book = { ...createLibrarySession({ seed: 'pulse' }).books.find(item => !item.damagedLabel)!, location: 'carried' as const };
  const onPlace = jest.fn(() => false);
  const screen = render(<LibraryShelfWork categoryId={getLibraryBook(book.bookId)!.categoryId} carried={[book]} shelved={[]} selectedId={book.bookId} onSelect={jest.fn()} onPlace={onPlace} onTake={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '선택한 책을 이 서가에 꽂기' }));
  expect(StyleSheet.flatten(screen.getByTestId('library-shelf-drop-zone').props.style).backgroundColor).toBe('#E7D4B5');
  onPlace.mockReturnValue(true);
  fireEvent.press(screen.getByRole('button', { name: '선택한 책을 이 서가에 꽂기' }));
  expect(StyleSheet.flatten(screen.getByTestId('library-shelf-drop-zone').props.style).backgroundColor).toBe('#DCE6CA');
  act(() => jest.advanceTimersByTime(600));
  expect(StyleSheet.flatten(screen.getByTestId('library-shelf-drop-zone').props.style).backgroundColor).toBe('#E7D4B5');
  screen.unmount();
});
