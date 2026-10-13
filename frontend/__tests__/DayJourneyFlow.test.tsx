import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { GamePrototypeScreen } from '../src/screens/GamePrototypeScreen';
import { getDayJourney, resetDayJourneyForTests } from '../src/game/dayJourney';
import { getShoppingErrand, resetShoppingErrandForTests } from '../src/game/shoppingErrandStore';
import { getActivityAlbum, resetActivityAlbumForTests } from '../src/game/activityAlbum';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn(() => Promise.resolve()), useAudioPlayer: () => ({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn() }), useAudioPlayerStatus: () => ({ isLoaded: true }) }));
jest.mock('expo-glass-effect', () => ({ GlassView: jest.requireActual('react-native').View, isLiquidGlassAvailable: () => false }));
jest.mock('../src/game/prototypeWorld', () => ({ ...jest.requireActual('../src/game/prototypeWorld'), INITIAL_PLAYER_POINT: { x: 500, y: 500 }, BUS_STOP_POINT: { x: 500, y: 500 }, HOUSE_ENTRANCE_POINT: { x: 500, y: 680 }, VILLAGE_NPCS: [] }));
jest.mock('../src/game/villageNavigation', () => ({ ...jest.requireActual('../src/game/villageNavigation'), isVillageNavigationBlocked: () => false, isVillageNavigationSegmentClear: () => true }));
jest.mock('../src/screens/BusSimulationScreen', () => {
  const { View, Pressable } = jest.requireActual('react-native');
  const { createBusSession, reduceBusSession } = jest.requireActual('../src/game/busSession');
  return { BusSimulationScreen: ({ onJourneyComplete, onStartLibrary, onExit, entryPoint }: any) => <View testID="day-bus-scene">
    <Pressable accessibilityRole="button" accessibilityLabel="실제 이동 완료 전달" onPress={() => {
      const destination = entryPoint === 'library-exterior' ? 'village' : 'library';
      let s = createBusSession({ destination, phase: 'waiting', cardPacked: true });
      const actions = [{ type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' }, { type: 'TAP_BOARDING_CARD' }, { type: 'HOLD_HANDRAIL' }, { type: 'DEPART' }, { type: 'REACH_NEXT_STOP' }, { type: 'REQUEST_STOP' }, { type: 'REACH_NEXT_STOP' }, { type: 'STAND_UP' }, { type: 'TAP_ALIGHTING_CARD' }, { type: 'ALIGHT' }, ...(destination === 'library' ? [{ type: 'CROSS_ROAD' }, { type: 'REPORT_ARRIVAL' }] : [{ type: 'COMPLETE_JOURNEY' }])];
      for (const action of actions) s = reduceBusSession(s, action);
      expect(s.phase).toBe('completed');
      onJourneyComplete(s); if (destination === 'library') onStartLibrary(); else onExit();
    }} />
  </View> };
});
jest.mock('../src/screens/LibrarySimulationScreen', () => {
  const { View, Pressable } = jest.requireActual('react-native');
  const { createLibrarySession, applyLibraryAction, getLibraryBook } = jest.requireActual('../src/game/librarySession');
  return { LibrarySimulationScreen: ({ onShiftComplete, onExit }: any) => <View testID="day-library-scene"><Pressable accessibilityRole="button" accessibilityLabel="실제 도서 정리와 보고 전달" onPress={() => {
    let s = applyLibraryAction(createLibrarySession({ visitorCount: 0, bookCount: 6, damagedBookCount: 0 }), { type: 'acceptTask' });
    for (const b of s.books) { s = applyLibraryAction(s, { type: 'collectBook', bookId: b.bookId }); s = applyLibraryAction(s, { type: 'placeBook', bookId: b.bookId, shelfId: getLibraryBook(b.bookId).categoryId }); }
    s = applyLibraryAction(s, { type: 'report', shelvedCount: 6, handedOffCount: 0 });
    expect(s.phase).toBe('finished'); onShiftComplete(s); onExit();
  }} /></View> };
});
beforeEach(() => { resetDayJourneyForTests(); resetShoppingErrandForTests(); resetActivityAlbumForTests(); jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true); });
afterEach(() => jest.restoreAllMocks());

it('connects the quest acceptance, bus, shift and return callbacks, finishing only after entering home', async () => {
  let screen = render(<GamePrototypeScreen initialActivity="day" onExit={jest.fn()} />);
  await act(async () => { await Promise.resolve(); });
  fireEvent.press(screen.getByRole('button', { name: '부탁받기' }));
  expect(getDayJourney().stage).toBe('outbound');
  fireEvent.press(screen.getByRole('button', { name: '버스 목적지 고르기' }));
  fireEvent.press(screen.getByRole('button', { name: '하늘도서관으로 가기' }));
  fireEvent.press(screen.getByRole('button', { name: '201번 버스 타기' }));
  fireEvent.press(screen.getByRole('button', { name: '실제 이동 완료 전달' }));
  expect(getDayJourney().stage).toBe('working'); expect(screen.getByTestId('day-library-scene')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '실제 도서 정리와 보고 전달' }));
  expect(getDayJourney().stage).toBe('returning'); expect(screen.getByTestId('day-bus-scene')).toBeTruthy();
  expect(getShoppingErrand()?.phase).toBe('offered');
  expect(screen.getByTestId('shopping-errand-panel')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '나중에 할게' }));
  expect(getShoppingErrand()?.phase).toBe('deferred');
  screen.unmount();
  screen = render(<GamePrototypeScreen initialActivity="errand" onExit={jest.fn()} />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByTestId('day-bus-scene')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '나중에 할게' }));
  fireEvent.press(screen.getByRole('button', { name: '실제 이동 완료 전달' }));
  expect(getDayJourney().stage).toBe('home'); expect(screen.queryByTestId('day-journey-panel')).toBeNull();
  fireEvent(screen.getByLabelText('쿼터뷰 마을'), 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
  fireEvent(screen.getByLabelText('쿼터뷰 마을'), 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
  fireEvent(screen.getByLabelText('쿼터뷰 마을'), 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
  fireEvent.press(screen.getByRole('button', { name: '집으로 들어가기' }));
  expect(getDayJourney().stage).toBe('completed');
  expect(screen.getByTestId('day-journey-panel')).toBeTruthy(); expect(screen.getByText('도서관 다녀왔어요')).toBeTruthy();
  expect(getActivityAlbum().map(record => record.kind).sort()).toEqual(['bus', 'bus', 'library']);
});
