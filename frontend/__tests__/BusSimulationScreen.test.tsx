import { act, fireEvent, render, within } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import * as Speech from 'expo-speech';
import { BusSimulationScreen } from '../src/screens/BusSimulationScreen';
import type { BusWorldProps } from '../src/components/game/BusWorld';
import { LibraryToast } from '../src/components/game/LibraryWorkPanel';
import { getBusDriverQuiz } from '../src/game/busDriverQuiz';
import { createBusSession, reduceBusSession, type BusAction, type BusSession } from '../src/game/busSession';
import { saveBusEpisode } from '../src/game/busEpisodeStore';
import { resetGamePreferencesForTests } from '../src/game/gamePreferences';
import type { BusWorldStation } from '../src/game/busWorld';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-speech', () => ({ speak: jest.fn((_text, options) => options?.onDone?.()), stop: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  },
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));
jest.mock('../src/game/busEpisodeStore', () => ({
  saveBusEpisode: jest.fn(() => ({ storage: 'memory', persisted: false, duplicate: false })),
}));

let mockWorld: BusWorldProps;
// Replace navigation geometry with explicit station arrivals. The reducer, timers, shared controls,
// route/card panels, transition presence, dialogue and local-save integration remain real.
jest.mock('../src/components/game/BusWorld', () => {
  const React = jest.requireActual('react');
  const { View, Pressable, Text } = jest.requireActual('react-native');
  const { busWorldStations } = jest.requireActual('../src/game/busWorld');
  return { BusWorld: React.forwardRef((props: BusWorldProps, ref: unknown) => {
    mockWorld = props;
    React.useImperativeHandle(ref, () => ({ stop: jest.fn(), move: jest.fn(), nudge: jest.fn(), navigate: jest.fn(), interact: jest.fn(), tapPassengerPlace: jest.fn() }));
    const stations = Object.keys(busWorldStations({ scene: props.scene, direction: props.direction, busPresent: !!props.bus }));
    return <View testID="bus-test-world">
      {stations.map(station => <Pressable key={station} accessibilityRole="button" accessibilityLabel={`장소 ${station}`}
        disabled={props.locked || props.travelling || props.seated}
        onPress={() => { props.onNearbyChange?.(station as BusWorldStation); props.onInteract(station as BusWorldStation); }}><Text>{station}</Text></Pressable>)}
      {(['inbound', 'outbound'] as const).map(direction => <Pressable key={direction} accessibilityRole="button" accessibilityLabel={`횡단 완료 ${direction}`}
        disabled={props.locked || !props.crossingAllowed || direction === props.direction}
        onPress={() => props.onSideChange?.(direction)}><Text>{direction}</Text></Pressable>)}
    </View>;
  }) };
});
jest.mock('../src/components/game/LibraryRoom', () => {
  const { View, Pressable, Text } = jest.requireActual('react-native');
  return { LibraryRoom: ({ locked, onInteract }: { locked: boolean; onInteract: (station: string) => void }) => <View testID="bus-report-room">
    <Pressable accessibilityRole="button" accessibilityLabel="사서에게 이동" disabled={locked} onPress={() => onInteract('librarian')}><Text>사서</Text></Pressable>
  </View> };
});
jest.mock('../src/components/game/GameHud', () => {
  const { View, Pressable, Text } = jest.requireActual('react-native');
  return { GameHud: (props: { onMenuVisibilityChange: (open: boolean) => void; onOpenNotebook: () => void; onOpenInventory: () => void; onEmergencyExit: () => void; onExit: () => void }) => <View>
    <Pressable accessibilityRole="button" accessibilityLabel="폰 열기" onPress={() => props.onMenuVisibilityChange(true)}><Text>폰 열기</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="폰 닫기" onPress={() => props.onMenuVisibilityChange(false)}><Text>폰 닫기</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="수첩 열기" onPress={props.onOpenNotebook}><Text>수첩</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="가방 열기" onPress={props.onOpenInventory}><Text>가방</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="정류장 복귀 메뉴" onPress={props.onEmergencyExit}><Text>복귀</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="게임 나가기 메뉴" onPress={props.onExit}><Text>나가기</Text></Pressable>
  </View> };
});

beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(1000); jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  resetGamePreferencesForTests({ effectsVolume: 1 });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
type Screen = ReturnType<typeof render>;
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
async function press(screen: Screen, label: string) { fireEvent.press(screen.getByRole('button', { name: label })); await flush(); }
async function advance(time: number) { await act(async () => { jest.advanceTimersByTime(time); await Promise.resolve(); }); await flush(); }
const visit = (screen: Screen, station: BusWorldStation) => press(screen, `장소 ${station}`);
const close = async (screen: Screen) => { fireEvent.press(screen.getAllByRole('button', { name: '닫기' })[0]); await flush(); };
const apply = (session: BusSession, ...actions: BusAction[]) => actions.reduce(reduceBusSession, session);
function waiting(card = true) {
  let session = apply(createBusSession({ id: 'screen-test', startedAt: 100 }), { type: 'OPEN_ROUTE' });
  if (card) session = apply(session, { type: 'PACK_CARD' });
  return apply(session, { type: 'GO_TO_STOP' });
}
function riding(guidance: 'guided' | 'independent' = 'guided') {
  return apply(waiting(), { type: 'SET_GUIDANCE', guidance }, { type: 'ARRIVE_VEHICLE', route: '201' },
    { type: 'BOARD' }, { type: 'TAP_BOARDING_CARD' }, { type: 'TAKE_SEAT' }, { type: 'DEPART' });
}
async function tapCard(screen: Screen, reader: 'reader-front' | 'reader-rear') {
  await visit(screen, reader); await press(screen, '카드 찍기');
  expect(screen.getByText(`${reader === 'reader-front' ? '승차' : '하차'} 처리되었습니다`)).toBeTruthy();
  await press(screen, '확인했어요');
  if (screen.queryByTestId('bus-driver-quiz')) await press(screen, '이번엔 그냥 갈게요');
}

it('안내 방송의 완료 콜백이 오지 않아도 정류장까지 운행하고 하차 요청한 곳에 정차한다', async () => {
  jest.mocked(Speech.speak).mockImplementationOnce(() => {});
  const screen = render(<BusSimulationScreen initialSession={riding()} onExit={jest.fn()} onStartLibrary={jest.fn()} />);
  await flush(); await press(screen, '하차벨');
  await advance(19000);
  expect(mockWorld).toMatchObject({ stopId: 'village', travelling: true });
  await advance(1000);
  expect(mockWorld).toMatchObject({ stopId: 'park', travelling: false });
  screen.unmount();
});

it('asks one friendly quiz after a boarding card, accepts a wrong answer and never asks again on this ride', async () => {
  const initial = apply(waiting(), { type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' });
  const onSessionChange = jest.fn();
  const screen = render(<BusSimulationScreen initialSession={initial} onSessionChange={onSessionChange} onExit={jest.fn()} onStartLibrary={jest.fn()} />);
  await flush();
  expect(screen.queryByTestId('bus-driver-quiz')).toBeNull();
  await visit(screen, 'reader-front'); await press(screen, '카드 찍기');
  expect(screen.queryByTestId('bus-driver-quiz')).toBeNull();
  await press(screen, '확인했어요');
  expect(screen.getByTestId('bus-driver-quiz')).toBeTruthy();
  await advance(5000); expect(mockWorld.travelling).toBe(false);
  await press(screen, '305번이요');
  expect(screen.getByTestId('market-staff-response-text').props.children).toContain('201번이에요');
  await press(screen, '네, 고마워요');
  await visit(screen, 'reader-front'); await press(screen, '확인했어요');
  expect(screen.queryByTestId('bus-driver-quiz')).toBeNull();
  await visit(screen, 'driver'); await press(screen, '이 버스 하늘도서관에 가나요?');
  await press(screen, '감사합니다');
  await visit(screen, 'handrail'); await press(screen, '출발하기');
  expect(mockWorld.travelling).toBe(true);
  const latest = onSessionChange.mock.calls.at(-1)![0] as BusSession;
  expect(latest.events.filter(event => event.type === 'driver_quiz_opened')).toHaveLength(1);
  expect(getBusDriverQuiz(latest)).toMatchObject({ status: 'answered', correct: false });
  screen.unmount();
});

it('continues one outing from the actual village stop through library work entry and a return bus to the village without a result interruption', async () => {
  const onExit = jest.fn(); const onComplete = jest.fn(); const onStartLibrary = jest.fn(); const onJourneyComplete = jest.fn();
  let screen = render(<BusSimulationScreen onExit={onExit} onComplete={onComplete} onStartLibrary={onStartLibrary} onJourneyComplete={onJourneyComplete} />);
  await flush();
  expect(screen.getByText('가는 길')).toBeTruthy();
  expect(screen.queryByText('사서의 메시지')).toBeNull();
  expect(mockWorld).toMatchObject({ scene: 'village', direction: 'outbound', stopId: 'village' });
  expect(mockWorld.locked).toBe(true);
  await advance(60000); expect(mockWorld.bus).toBeNull();
  await press(screen, '확인했어요');
  expect(screen.getByTestId('game-controls')).toBeTruthy();
  await press(screen, '가방 열기'); expect(screen.getByText('교통카드 · 챙겼어요')).toBeTruthy();
  await press(screen, '확인했어요'); await advance(4200);
  expect(mockWorld.bus?.number).toBe('201');
  await visit(screen, 'board');
  await advance(60000); expect(mockWorld.bus?.number).toBe('201');
  await press(screen, '다음 버스 기다리기'); await advance(4200);
  expect(mockWorld.bus?.number).toBe('305');
  await close(screen);
  await visit(screen, 'driver'); await press(screen, '이 버스 하늘도서관에 가나요?');
  expect(screen.getByTestId('market-staff-response-text').props.children).toContain('체육관');
  await advance(60000); expect(mockWorld.bus?.number).toBe('305');
  await press(screen, '감사합니다'); await advance(18000); expect(mockWorld.bus).toBeNull();
  await advance(4200); expect(mockWorld.bus?.number).toBe('201');
  expect(mockWorld.target).toBe('board');
  expect(screen.getByText('201번 · 늘봄주민센터 방면 버스에 타요')).toBeTruthy();
  await visit(screen, 'board'); await press(screen, '버스 타기');
  expect(mockWorld.scene).toBe('bus');
  await tapCard(screen, 'reader-front'); await visit(screen, 'seat'); await press(screen, '출발하기');
  expect(mockWorld.travelling).toBe(true);
  expect(screen.getByLabelText('이동 조이스틱').props.accessibilityState.disabled).toBe(true);
  await advance(20000);
  expect(mockWorld.stopId).toBe('park');
  expect(screen.getByLabelText('중앙공원에서 하늘도서관으로 이동 중')).toBeTruthy();
  await press(screen, '하차벨'); await advance(20000);
  expect(mockWorld).toMatchObject({ travelling: false, stopId: 'library', seated: true });
  await press(screen, '일어나기'); await tapCard(screen, 'reader-rear'); await visit(screen, 'door-rear');
  expect(mockWorld).toMatchObject({ scene: 'district', direction: 'outbound', seated: false });
  await visit(screen, 'library');
  expect(screen.queryByTestId('bus-report-room')).toBeNull();
  await visit(screen, 'crossing');
  expect(screen.getByRole('button', { name: '초록불 기다리기' }).props.accessibilityState.disabled).toBe(true);
  await press(screen, '초록불 기다리기'); expect(mockWorld.crossingAllowed).toBe(false);
  await advance(3000); await press(screen, '살폈어요'); await press(screen, '횡단 완료 inbound');
  await visit(screen, 'library'); expect(screen.getByTestId('bus-report-room')).toBeTruthy();
  await press(screen, '사서에게 이동'); await press(screen, '안녕하세요. 도서관 업무를 하러 왔어요.');
  expect(screen.queryByTestId('bus-result')).toBeNull();
  expect(screen.queryByRole('button', { name: '만족도 4점' })).toBeNull();
  expect(saveBusEpisode).toHaveBeenCalledTimes(1); expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onStartLibrary).toHaveBeenCalledTimes(1); expect(onExit).not.toHaveBeenCalled();
  expect(onJourneyComplete).toHaveBeenCalledWith(expect.objectContaining({ destination: 'library', phase: 'completed' }));
  const saved = jest.mocked(saveBusEpisode).mock.calls[0][0];
  expect(saved).toMatchObject({ phase: 'completed', stop: 'library', direction: 'inbound', cardPacked: true, rideNumber: 1 });
  expect(saved.events.filter(event => event.type === 'stop_requested')).toHaveLength(1);
  expect(saved.events.some(event => event.type === 'help_requested' && event.payload.source === 'driver')).toBe(true);
  await advance(60000); expect(onStartLibrary).toHaveBeenCalledTimes(1); expect(saveBusEpisode).toHaveBeenCalledTimes(1);
  screen.unmount();

  // AppShell opens library work through the callback; finishing work returns to
  // this same district entrance, where transport remains optional until chosen.
  screen = render(<BusSimulationScreen entryPoint="library-exterior" onExit={onExit} onComplete={onComplete} onStartLibrary={onStartLibrary} onJourneyComplete={onJourneyComplete} />);
  await flush();
  expect(mockWorld).toMatchObject({ scene: 'district', stopId: 'library', direction: 'inbound', locked: false, spawn: { x: 620, y: 397 } });
  expect(screen.queryByText('가는 길')).toBeNull();
  await advance(120000); expect(mockWorld.bus).toBeNull();
  await visit(screen, 'library'); expect(onStartLibrary).toHaveBeenCalledTimes(2);
  expect(saveBusEpisode).toHaveBeenCalledTimes(1);
  await visit(screen, 'stop-inbound'); await close(screen); await advance(4200);
  expect(mockWorld.bus?.number).toBe('201');
  await visit(screen, 'board'); await press(screen, '버스 타기');
  await tapCard(screen, 'reader-front'); await visit(screen, 'handrail'); await press(screen, '출발하기');
  expect(mockWorld).toMatchObject({ scene: 'bus', travelling: true, securedAt: 'handrail' });
  await advance(20000); expect(mockWorld.stopId).toBe('park');
  await press(screen, '하차벨'); await advance(20000);
  expect(mockWorld).toMatchObject({ stopId: 'village', travelling: false, seated: true });
  await press(screen, '손잡이 놓기'); await tapCard(screen, 'reader-rear'); await visit(screen, 'door-rear');
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledTimes(1); expect(onStartLibrary).toHaveBeenCalledTimes(2);
  expect(saveBusEpisode).toHaveBeenCalledTimes(2);
  expect(onJourneyComplete).toHaveBeenCalledTimes(2);
  expect(onJourneyComplete).toHaveBeenLastCalledWith(expect.objectContaining({ destination: 'village', phase: 'completed' }));
  const returned = jest.mocked(saveBusEpisode).mock.calls[1][0];
  expect(returned).toMatchObject({ destination: 'village', phase: 'completed', stop: 'village', direction: 'inbound' });
  expect(returned.events.at(-1)?.type).toBe('journey_completed');
  expect(screen.queryByTestId('bus-result')).toBeNull();
  await advance(60000); expect(onExit).toHaveBeenCalledTimes(1); expect(saveBusEpisode).toHaveBeenCalledTimes(2);
  screen.unmount();
});

it('brings another bus after leaving before departure to fetch the missing card', async () => {
  const screen = render(<BusSimulationScreen initialSession={waiting(false)} onExit={jest.fn()} onStartLibrary={jest.fn()} />);
  await flush(); await advance(4200); expect(mockWorld.bus?.number).toBe('201');
  await visit(screen, 'board'); await press(screen, '버스 타기'); await visit(screen, 'reader-front');
  expect(screen.getByText('가방에 교통카드가 없어요.')).toBeTruthy();
  await press(screen, '앞문으로 돌아가기'); await visit(screen, 'door-front');
  expect(mockWorld).toMatchObject({ scene: 'village', bus: null });
  await visit(screen, 'card'); await press(screen, '가방에 넣기');
  await visit(screen, 'stop-outbound'); await close(screen); await advance(4200);
  expect(mockWorld.bus?.number).toBe('305');
  await visit(screen, 'board'); await press(screen, '버스 타기'); await tapCard(screen, 'reader-front');
  await visit(screen, 'handrail'); await press(screen, '출발하기');
  expect(mockWorld.travelling).toBe(true);
  expect(saveBusEpisode).not.toHaveBeenCalled(); screen.unmount();
});

it('uses an information notice for a rejected action and a success notice only after securing a safe place', async () => {
  const initial = apply(waiting(), { type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' });
  const screen = render(<BusSimulationScreen initialSession={initial} onExit={jest.fn()} onStartLibrary={jest.fn()} />);
  await flush(); await visit(screen, 'handrail');
  expect(screen.getByText('교통카드를 먼저 찍어 주세요.')).toBeTruthy();
  expect(screen.UNSAFE_getByType(LibraryToast).props.positive).toBe(false);
  expect(mockWorld.seated).toBe(false);
  await tapCard(screen, 'reader-front'); await visit(screen, 'handrail');
  expect(screen.getByText('손잡이를 잡았어요.')).toBeTruthy();
  expect(screen.UNSAFE_getByType(LibraryToast).props.positive).toBe(true);
  expect(mockWorld.seated).toBe(true);
  screen.unmount();
});

it('lets the player choose a place before leaving and waits for the physical seat transition', async () => {
  const initial = apply(waiting(), { type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' });
  const screen = render(<BusSimulationScreen initialSession={initial} onExit={jest.fn()} onStartLibrary={jest.fn()} />);
  await flush(); await tapCard(screen, 'reader-front');
  expect(mockWorld.target).toBeNull();
  act(() => mockWorld.onInteract('seat', 'seat-rear-left')); await flush();
  expect(mockWorld.passengerPlaceId).toBe('seat-rear-left');
  act(() => mockWorld.onPassengerTransitionChange?.(true)); await flush();
  expect(screen.getByRole('button', { name: '출발하기' }).props.accessibilityState.disabled).toBe(true);
  await advance(60000); expect(mockWorld.travelling).toBe(false);
  act(() => mockWorld.onPassengerTransitionChange?.(false)); await flush();
  expect(screen.getByRole('button', { name: '출발하기' }).props.accessibilityState.disabled).toBe(false);
  await press(screen, '일어나기');
  expect(mockWorld).toMatchObject({ seated: false, passengerPlaceId: null });
  act(() => mockWorld.onInteract('handrail', 'handrail-rear')); await flush();
  expect(mockWorld).toMatchObject({ securedAt: 'handrail', passengerPlaceId: 'handrail-rear' });
  await press(screen, '출발하기'); expect(mockWorld.travelling).toBe(true);
  screen.unmount();
});

it('keeps an early stop optional, forces a terminal stop and restores a fresh service to the last sidewalk', async () => {
  const screen = render(<BusSimulationScreen initialSession={riding()} onExit={jest.fn()} onStartLibrary={jest.fn()} />);
  await flush();
  expect(screen.getByLabelText('마을앞에서 중앙공원으로 이동 중')).toBeTruthy();
  await press(screen, '하차벨');
  expect(screen.getByText('중앙공원에 내려요. 멈출 때까지 기다려요.')).toBeTruthy();
  await advance(20000);
  expect(mockWorld).toMatchObject({ stopId: 'park', travelling: false });
  expect(screen.getByText('여기는 중앙공원이에요. 계속 타기를 눌러요')).toBeTruthy();
  expect(screen.getByRole('button', { name: '계속 타기' })).toBeTruthy();
  expect(within(screen.getByTestId('game-controls')).getByRole('button', { name: '계속 타기' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '일어나기' })).toBeTruthy();
  expect(screen.getByLabelText('중앙공원 정차 중')).toBeTruthy();
  await press(screen, '계속 타기'); expect(mockWorld.travelling).toBe(true);
  await advance(20000); expect(mockWorld).toMatchObject({ stopId: 'library', travelling: true });
  await advance(20000); expect(mockWorld).toMatchObject({ stopId: 'civic', travelling: false });
  expect(screen.queryByRole('button', { name: '계속 타기' })).toBeNull();
  await advance(60000); expect(mockWorld.stopId).toBe('civic');
  await press(screen, '정류장 복귀 메뉴'); await press(screen, '정류장으로 돌아가기');
  expect(mockWorld).toMatchObject({ scene: 'village', stopId: 'village', direction: 'outbound', bus: null, seated: false });
  await advance(4200); expect(mockWorld.bus?.number).toBe('305');
  await press(screen, '가방 열기'); expect(screen.getByText('교통카드 · 챙겼어요')).toBeTruthy();
  expect(saveBusEpisode).not.toHaveBeenCalled(); screen.unmount();
});

it('pauses bus departure for the phone and background state together, then leaves at least five seconds to act', async () => {
  let listener: ((state: AppStateStatus) => void) | null = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { listener = callback; return { remove: jest.fn() }; });
  const initial = apply(waiting(), { type: 'ARRIVE_VEHICLE', route: '201' });
  const screen = render(<BusSimulationScreen initialSession={initial} onExit={jest.fn()} onStartLibrary={jest.fn()} />);
  await flush(); await advance(16000); await press(screen, '폰 열기');
  expect(mockWorld.locked).toBe(true);
  act(() => listener!('background')); await press(screen, '폰 닫기'); await advance(60000);
  expect(mockWorld.bus?.number).toBe('201'); expect(mockWorld.locked).toBe(true);
  act(() => listener!('active')); await flush(); await advance(4999);
  expect(mockWorld.bus?.number).toBe('201'); await advance(1); expect(mockWorld.bus).toBeNull();
  screen.unmount();
});

it('keeps independent-mode destination neutral while requested support and standard controls remain usable', async () => {
  const screen = render(<BusSimulationScreen initialSession={riding('independent')} onExit={jest.fn()} onStartLibrary={jest.fn()} />);
  await flush(); await advance(20000);
  expect(screen.getByText('목적지 · 하늘도서관')).toBeTruthy();
  expect(screen.queryByText('하늘도서관에서 내려요. 하차벨을 눌러요')).toBeNull();
  expect(mockWorld.target).toBeNull();
  expect(screen.getByRole('button', { name: '하차벨' })).toBeTruthy();
  await press(screen, '이동 도움 보기');
  expect(screen.getByRole('button', { name: '혼자 해보기' }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByText('하늘도서관 안내가 나오면 하차벨을 눌러요.')).toBeTruthy();
  await advance(60000); expect(mockWorld.stopId).toBe('park');
  await close(screen); await press(screen, '하차벨'); await advance(20000);
  expect(mockWorld).toMatchObject({ stopId: 'library', travelling: false });
  expect(saveBusEpisode).not.toHaveBeenCalled(); screen.unmount();
});

it('lets a passenger returning from the civic terminal enter the library on the same sidewalk', async () => {
  let initial = apply(riding(), { type: 'REACH_NEXT_STOP' }, { type: 'REACH_NEXT_STOP' }, { type: 'REACH_NEXT_STOP' },
    { type: 'STAND_UP' }, { type: 'TAP_ALIGHTING_CARD' }, { type: 'ALIGHT' }, { type: 'CROSS_ROAD' });
  initial = apply(initial, { type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' }, { type: 'TAP_BOARDING_CARD' }, { type: 'TAKE_SEAT' }, { type: 'DEPART' });
  const screen = render(<BusSimulationScreen initialSession={initial} onExit={jest.fn()} onStartLibrary={jest.fn()} />);
  await flush(); await press(screen, '하차벨'); await advance(20000);
  await press(screen, '일어나기'); await tapCard(screen, 'reader-rear'); await visit(screen, 'door-rear');
  expect(mockWorld).toMatchObject({ scene: 'district', direction: 'inbound', stopId: 'library' });
  await visit(screen, 'library'); expect(screen.getByTestId('bus-report-room')).toBeTruthy();
  await press(screen, '사서에게 이동'); await press(screen, '안녕하세요. 도서관 업무를 하러 왔어요.');
  expect(saveBusEpisode).toHaveBeenCalledTimes(1);
  const saved = jest.mocked(saveBusEpisode).mock.calls[0][0];
  expect(saved.rideNumber).toBe(2);
  expect(saved.events.filter(event => event.type === 'crossed_road' && event.payload.stop === 'library')).toHaveLength(0);
  screen.unmount();
});

it('pauses in place, resumes with time to act and opens help without teleporting to the village', async () => {
  const onExit = jest.fn();
  const screen = render(<BusSimulationScreen initialSession={riding()} onExit={onExit} onStartLibrary={jest.fn()} />);
  await flush(); await advance(19000); await press(screen, '게임 나가기 메뉴'); await advance(60000);
  expect(mockWorld.stopId).toBe('village'); expect(onExit).not.toHaveBeenCalled();
  await press(screen, '계속하기'); await advance(4999); expect(mockWorld.stopId).toBe('village');
  await advance(1); expect(mockWorld.stopId).toBe('park');
  await press(screen, '게임 나가기 메뉴');
  expect(screen.queryByRole('button', { name: '마을로 돌아가기' })).toBeNull();
  await press(screen, '다음 행동 확인하기');
  expect(screen.getByRole('button', { name: '혼자 해보기' })).toBeTruthy();
  await advance(60000); expect(mockWorld.stopId).toBe('park');
  expect(onExit).not.toHaveBeenCalled(); expect(saveBusEpisode).not.toHaveBeenCalled(); screen.unmount();
});

it('keeps the library district explorable until a stop is deliberately selected', async () => {
  const screen = render(<BusSimulationScreen entryPoint="library-exterior" onExit={jest.fn()} onStartLibrary={jest.fn()} />);
  await flush();
  const initialSpawn = mockWorld.spawn;
  expect(mockWorld.target).toBe('stop-inbound');
  expect(screen.getByText('도서관에 들어가거나 정류장에서 버스를 탈 수 있어요')).toBeTruthy();
  act(() => mockWorld.onNearbyChange('stop-inbound'));
  await advance(60000);
  expect(mockWorld).toMatchObject({ scene: 'district', bus: null, spawn: initialSpawn });
  expect(screen.queryByText('버스 도착 안내')).toBeNull();
  await visit(screen, 'stop-inbound');
  expect(screen.getByText('버스 도착 안내')).toBeTruthy();
  await advance(4199); expect(mockWorld.bus).toBeNull();
  await advance(1); expect(mockWorld.bus?.number).toBe('201');
  await advance(60000); expect(mockWorld.bus?.number).toBe('201');
  await close(screen);
  expect(mockWorld.target).toBe('board');
  expect(screen.getByText('201번 · 느티광장 방면 버스에 타요')).toBeTruthy();
  expect(saveBusEpisode).not.toHaveBeenCalled(); screen.unmount();
});

it('only guides boarding when the offered bus matches the route on the current sidewalk', async () => {
  let screen = render(<BusSimulationScreen initialSession={apply(waiting(), { type: 'ARRIVE_VEHICLE', route: '305' })} onExit={jest.fn()} onStartLibrary={jest.fn()} />);
  await flush();
  expect(mockWorld.target).toBeNull();
  expect(screen.getByText('201번 · 늘봄주민센터 방면을 기다려요')).toBeTruthy();
  expect(screen.queryByText(/버스에 타요/)).toBeNull();
  screen.unmount();

  const oppositeSide = apply(waiting(), { type: 'CROSS_ROAD' }, { type: 'ARRIVE_VEHICLE', route: '201' });
  screen = render(<BusSimulationScreen initialSession={oppositeSide} onExit={jest.fn()} onStartLibrary={jest.fn()} />);
  await flush();
  expect(mockWorld.target).toBe('crossing');
  expect(screen.getByText('횡단보도를 건너 반대편 정류장으로 가요')).toBeTruthy();
  expect(screen.queryByText(/버스에 타요/)).toBeNull();
  screen.unmount();

  const independent = apply(waiting(), { type: 'SET_GUIDANCE', guidance: 'independent' }, { type: 'ARRIVE_VEHICLE', route: '201' });
  screen = render(<BusSimulationScreen initialSession={independent} onExit={jest.fn()} onStartLibrary={jest.fn()} />);
  await flush();
  expect(mockWorld.target).toBeNull();
  expect(screen.getByText('하늘도서관 가기')).toBeTruthy();
  expect(screen.queryByText(/버스에 타요/)).toBeNull();
  screen.unmount();
});

it('enters a bus directly from the real village stop and returns there once when leaving before departure', async () => {
  const onExit = jest.fn(); const onComplete = jest.fn(); const onStartLibrary = jest.fn();
  const initial = apply(waiting(), { type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' });
  const screen = render(<BusSimulationScreen initialSession={initial} onExit={onExit} onComplete={onComplete} onStartLibrary={onStartLibrary} />);
  await flush();
  expect(mockWorld).toMatchObject({ scene: 'bus', stopId: 'village', locked: false, travelling: false });
  expect(screen.queryByText('가는 길')).toBeNull();
  expect(screen.queryByRole('button', { name: '버스 타기' })).toBeNull();
  await visit(screen, 'door-front');
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('bus-test-world')).toBeNull();
  expect(saveBusEpisode).not.toHaveBeenCalled();
  expect(onComplete).not.toHaveBeenCalled(); expect(onStartLibrary).not.toHaveBeenCalled();
  await advance(60000); expect(onExit).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('bus-test-world')).toBeNull();
  screen.unmount();
});

it('restores a journey boarded in the real village to its original stop without a duplicate village or result', async () => {
  const onExit = jest.fn(); const onComplete = jest.fn(); const onStartLibrary = jest.fn();
  const initial = apply(waiting(), { type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' });
  const screen = render(<BusSimulationScreen initialSession={initial} onExit={onExit} onComplete={onComplete} onStartLibrary={onStartLibrary} />);
  await flush(); await tapCard(screen, 'reader-front'); await visit(screen, 'seat'); await press(screen, '출발하기');
  expect(mockWorld.travelling).toBe(true);
  await advance(20000); expect(mockWorld.stopId).toBe('park');
  await press(screen, '정류장 복귀 메뉴'); await press(screen, '정류장으로 돌아가기');
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('bus-test-world')).toBeNull();
  expect(screen.queryByTestId('bus-result')).toBeNull();
  expect(saveBusEpisode).not.toHaveBeenCalled();
  expect(onComplete).not.toHaveBeenCalled(); expect(onStartLibrary).not.toHaveBeenCalled();
  await advance(60000); expect(onExit).toHaveBeenCalledTimes(1);
  screen.unmount();
});

it('points to the front door before a wrong bus departs, then guides a real transfer after departure', async () => {
  const initial = apply(waiting(), { type: 'ARRIVE_VEHICLE', route: '305' }, { type: 'BOARD' });
  const onJourneyComplete = jest.fn(); const onStartLibrary = jest.fn();
  const screen = render(<BusSimulationScreen initialSession={initial} onExit={jest.fn()} onStartLibrary={onStartLibrary} onJourneyComplete={onJourneyComplete} />);
  await flush();
  expect(mockWorld.target).toBe('door-front');
  expect(screen.getByText('출발 전에 앞문으로 내려 다른 버스를 기다려요')).toBeTruthy();
  await tapCard(screen, 'reader-front'); await visit(screen, 'handrail'); await press(screen, '출발하기');
  expect(screen.getByLabelText('마을앞에서 중앙공원으로 이동 중')).toBeTruthy();
  expect(mockWorld.target).toBe('bell');
  await press(screen, '하차벨'); await advance(20000);
  await press(screen, '손잡이 놓기'); await tapCard(screen, 'reader-rear'); await visit(screen, 'door-rear');
  expect(mockWorld).toMatchObject({ scene: 'stop', stopId: 'park', direction: 'outbound' });
  expect(screen.getByText('201번 · 늘봄주민센터 방면을 기다려요')).toBeTruthy();
  await advance(4200); expect(mockWorld.bus?.number).toBe('201');
  await visit(screen, 'board'); await press(screen, '버스 타기');
  await tapCard(screen, 'reader-front'); await visit(screen, 'handrail'); await press(screen, '출발하기');
  expect(screen.getByLabelText('중앙공원에서 하늘도서관으로 이동 중')).toBeTruthy();
  await press(screen, '하차벨'); await advance(20000);
  await press(screen, '손잡이 놓기'); await tapCard(screen, 'reader-rear'); await visit(screen, 'door-rear');
  await visit(screen, 'crossing'); await advance(3000); await press(screen, '살폈어요'); await press(screen, '횡단 완료 inbound');
  await visit(screen, 'library'); await press(screen, '사서에게 이동'); await press(screen, '안녕하세요. 도서관 업무를 하러 왔어요.');
  expect(onStartLibrary).toHaveBeenCalledTimes(1);
  expect(onJourneyComplete).toHaveBeenCalledWith(expect.objectContaining({ phase: 'completed', rideNumber: 2 }));
  screen.unmount();
});

it('records resumable bus progress only after choosing a stop, not while exploring outside the library', async () => {
  const onSessionChange = jest.fn(); const onExit = jest.fn(); const onStartLibrary = jest.fn();
  const screen = render(<BusSimulationScreen entryPoint="library-exterior" onExit={onExit} onStartLibrary={onStartLibrary} onSessionChange={onSessionChange} />);
  await flush(); await advance(30000); expect(onSessionChange).not.toHaveBeenCalled();
  await visit(screen, 'stop-inbound');
  expect(onSessionChange).toHaveBeenLastCalledWith(expect.objectContaining({ destination: 'village', phase: 'waiting', stop: 'library' }));
  await close(screen); await advance(4200); await visit(screen, 'board'); await press(screen, '버스 타기');
  await tapCard(screen, 'reader-front'); await visit(screen, 'handrail'); await press(screen, '출발하기');
  const saved = onSessionChange.mock.calls.at(-1)?.[0] as BusSession;
  expect(saved).toMatchObject({ phase: 'riding', stop: 'library', nextStop: 'park', securedAt: 'handrail' });
  screen.unmount();
  const resumed = render(<BusSimulationScreen initialSession={saved} entryPoint="library-exterior" onExit={onExit} onStartLibrary={onStartLibrary} />);
  await flush();
  expect(mockWorld).toMatchObject({ scene: 'bus', travelling: true, stopId: 'library', securedAt: 'handrail' });
  await advance(20000); expect(mockWorld.stopId).toBe('park');
  resumed.unmount();
});

it('pauses the actual journey while the shared day checklist is open', async () => {
  const initial = riding(); const onExit = jest.fn(); const onStartLibrary = jest.fn();
  const screen = render(<BusSimulationScreen initialSession={initial} onExit={onExit} onStartLibrary={onStartLibrary} />);
  await flush(); await advance(19000);
  screen.rerender(<BusSimulationScreen initialSession={initial} onExit={onExit} onStartLibrary={onStartLibrary} journeyOpen />);
  await flush(); await advance(60000);
  expect(mockWorld).toMatchObject({ stopId: 'village', locked: true });
  screen.rerender(<BusSimulationScreen initialSession={initial} onExit={onExit} onStartLibrary={onStartLibrary} journeyOpen={false} />);
  await flush(); await advance(4999); expect(mockWorld.stopId).toBe('village');
  await advance(1); expect(mockWorld.stopId).toBe('park');
  screen.unmount();
});
