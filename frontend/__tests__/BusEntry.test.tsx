import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import App from '../App';
import { AppShell } from '../src/screens/AppShell';
import { GamePrototypeScreen } from '../src/screens/GamePrototypeScreen';
import { BUS_STOP_POINT } from '../src/game/prototypeWorld';
import { getQuests } from '../src/api/quest';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('../src/useAppFonts', () => ({ useAppFonts: () => ({ startupReady: true, allReady: true, error: null, retry: jest.fn() }) }));
jest.mock('../src/api/quest', () => ({ getQuests: jest.fn(() => Promise.resolve([])), getQuest: jest.fn() }));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => ({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn() }),
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native');
  return { GlassView: View, isLiquidGlassAvailable: () => false };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { ...jest.requireActual('react-native-safe-area-context'), SafeAreaProvider: View, SafeAreaView: View };
});
jest.mock('../src/game/prototypeWorld', () => {
  const world = jest.requireActual('../src/game/prototypeWorld');
  return { ...world, INITIAL_PLAYER_POINT: { ...world.BUS_STOP_POINT } };
});
jest.mock('../src/screens/BusSimulationScreen', () => {
  const { View, Text, Pressable } = jest.requireActual('react-native');
  return { BusSimulationScreen: ({ onExit, onStartLibrary, onComplete, controlMode, onControlModeChange, entryPoint, initialSession, onTravel }: {
    onExit: () => void; onStartLibrary: () => void; onComplete: () => void;
    onTravel: (destination: 'village' | 'library') => void;
    controlMode: string; onControlModeChange: (mode: 'touch') => void; entryPoint: 'village-stop' | 'library-exterior'; initialSession?: { route: string; phase: string; cardPacked: boolean };
  }) => <View testID="bus-activity">
    <Text>{'bus-control:' + controlMode}</Text><Text>{'journey-entry:' + entryPoint}</Text><Text>{'boarding-route:' + initialSession?.route}</Text><Text>{'boarding-phase:' + initialSession?.phase}</Text><Text>{'boarding-card:' + initialSession?.cardPacked}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="버스에서 터치 이동 선택" onPress={() => onControlModeChange('touch')} />
    <Pressable accessibilityRole="button" accessibilityLabel="출근 보고 완료" onPress={onComplete} />
    <Pressable accessibilityRole="button" accessibilityLabel="도서관 안으로 들어가기" onPress={() => { if (entryPoint === 'village-stop') onComplete(); onStartLibrary(); }} />
    <Pressable accessibilityRole="button" accessibilityLabel="마을 정류장으로 돌아오기" onPress={onExit} />
    <Pressable accessibilityRole="button" accessibilityLabel="버스에서 도서관 마을로 바로 이동" onPress={() => onTravel('library')} />
    <Pressable accessibilityRole="button" accessibilityLabel="버스에서 우리 마을로 바로 이동" onPress={() => onTravel('village')} />
  </View> };
});
jest.mock('../src/screens/LibrarySimulationScreen', () => {
  const { View, Text, Pressable } = jest.requireActual('react-native');
  return { LibrarySimulationScreen: ({ onExit, controlMode, onTravel }: { onExit: () => void; controlMode: string; onTravel: (destination: 'village' | 'library') => void }) =>
    <View testID="library-activity"><Text>{'library-control:' + controlMode}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="도서관 나가기" onPress={onExit} />
      <Pressable accessibilityRole="button" accessibilityLabel="도서관에서 우리 마을로 바로 이동" onPress={() => onTravel('village')} />
    </View> };
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(getQuests).mockClear();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});
async function settle(ms = 0) {
  await act(async () => { if (ms) jest.advanceTimersByTime(ms); await Promise.resolve(); });
}
function position(screen: ReturnType<typeof render>) {
  const style = StyleSheet.flatten(screen.getByTestId('village-world-player').props.style);
  const value = (item: number | { __getValue: () => number }) => typeof item === 'number' ? item : item.__getValue();
  return {
    x: value(style.transform.find((item: { translateX?: number }) => item.translateX !== undefined).translateX),
    y: value(style.transform.find((item: { translateY?: number }) => item.translateY !== undefined).translateY),
  };
}
function webQuery(search: string) {
  const os = Platform.OS;
  const location = window.location;
  const addListener = window.addEventListener;
  const removeListener = window.removeEventListener;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  Object.defineProperty(window, 'location', { configurable: true, value: { search } });
  Object.defineProperty(window, 'addEventListener', { configurable: true, value: jest.fn() });
  Object.defineProperty(window, 'removeEventListener', { configurable: true, value: jest.fn() });
  return () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    Object.defineProperty(window, 'location', { configurable: true, value: location });
    Object.defineProperty(window, 'addEventListener', { configurable: true, value: addListener });
    Object.defineProperty(window, 'removeEventListener', { configurable: true, value: removeListener });
  };
}

function chooseLibraryAndBoard(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByRole('button', { name: '하늘도서관으로 가기' }));
  expect(screen.getByTestId('game-viewport')).toBeTruthy();
  expect(screen.getByTestId('village-bus-boarding')).toBeTruthy();
  expect(screen.queryByTestId('bus-activity')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '201번 버스 타기' }));
  expect(screen.getByText('boarding-phase:boarding')).toBeTruthy();
  expect(screen.getByText('boarding-card:true')).toBeTruthy();
}

it('휴대폰 바로 이동은 도서관 문 앞을 열고 버스와 업무를 완료 처리하지 않고 정리한다', async () => {
  const screen = render(<GamePrototypeScreen onExit={jest.fn()} />);
  await settle();
  fireEvent.press(screen.getByRole('button', { name: '휴대폰 열기' }));
  await settle(300);
  fireEvent.press(screen.getByRole('button', { name: '바로 이동' }));
  fireEvent.press(screen.getByRole('button', { name: '하늘도서관 마을로 바로 이동' }));
  await settle(300);
  expect(screen.getByText('journey-entry:library-exterior')).toBeTruthy();
  expect(screen.getByText('boarding-phase:undefined')).toBeTruthy();
  expect(screen.queryByTestId('library-activity')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '도서관 안으로 들어가기' }));
  fireEvent.press(screen.getByRole('button', { name: '도서관에서 우리 마을로 바로 이동' }));
  await settle();
  expect(position(screen)).toEqual(BUS_STOP_POINT);

  fireEvent.press(screen.getByRole('button', { name: '버스 목적지 고르기' }));
  chooseLibraryAndBoard(screen);
  expect(screen.getByText('boarding-phase:boarding')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '버스에서 도서관 마을로 바로 이동' }));
  expect(screen.getByText('journey-entry:library-exterior')).toBeTruthy();
  expect(screen.getByText('boarding-phase:undefined')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '버스에서 우리 마을로 바로 이동' }));
  await settle();
  expect(screen.queryByTestId('bus-activity')).toBeNull();
  expect(screen.queryByTestId('village-bus-boarding')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
  expect(screen.getByLabelText('오늘 0/4 완료')).toBeTruthy();
  screen.unmount();
});

it('버스가 정차하기 전에는 탈 수 없고 다음 버스도 도착 애니메이션 후에만 선택한다', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  const screen = render(<GamePrototypeScreen onExit={jest.fn()} />);
  await settle();
  fireEvent.press(screen.getByRole('button', { name: '버스 목적지 고르기' }));
  fireEvent.press(screen.getByRole('button', { name: '하늘도서관으로 가기' }));
  expect(screen.getByRole('button', { name: '201번 도착 중' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: '201번 도착 중' }));
  expect(screen.queryByTestId('bus-activity')).toBeNull();
  await settle(1300);
  expect(screen.getByRole('button', { name: '201번 버스 타기' }).props.accessibilityState.disabled).toBe(false);
  fireEvent.press(screen.getByRole('button', { name: '다음 버스 기다리기' }));
  expect(screen.getByRole('button', { name: '다음 버스 기다리기' }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByTestId('bus-arrival-vehicle')).toBeTruthy();
  await settle(2300);
  expect(screen.getByRole('button', { name: '305번 도착 중' }).props.accessibilityState.disabled).toBe(true);
  await settle(1300);
  fireEvent.press(screen.getByRole('button', { name: '305번 버스 타기' }));
  expect(screen.getByText('boarding-route:305')).toBeTruthy();
  screen.unmount();
});
it('게임 탭은 마을 한 곳으로 들어가며 정류장, 버스, 도서관 안팎과 귀가가 같은 플레이로 이어진다', async () => {
  const screen = render(<AppShell quests={[]} questsLoading={false} questsError={null} />);
  await settle();
  fireEvent.press(screen.getByRole('tab', { name: '게임 탭' }));
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: '버스 타고 도서관 가기' })).toBeNull();
  expect(screen.queryByRole('button', { name: '도서관 업무만 시작' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '오늘도 마을 들어가기' }));
  await settle();
  expect(screen.getByTestId('game-viewport')).toBeTruthy();
  expect(screen.queryByTestId('bus-activity')).toBeNull();

  fireEvent.press(screen.getByRole('button', { name: '버스 목적지 고르기' }));
  expect(screen.getByTestId('village-bus-destination')).toBeTruthy();
  expect(screen.queryByTestId('bus-activity')).toBeNull();
  chooseLibraryAndBoard(screen);
  expect(screen.getByText('journey-entry:village-stop')).toBeTruthy();
  expect(screen.queryByTestId('game-viewport')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '버스에서 터치 이동 선택' }));
  fireEvent.press(screen.getByRole('button', { name: '도서관 안으로 들어가기' }));
  expect(screen.getByText('library-control:touch')).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: '도서관 나가기' }));
  expect(screen.getByText('journey-entry:library-exterior')).toBeTruthy();
  expect(screen.getByText('bus-control:touch')).toBeTruthy();
  expect(screen.queryByTestId('game-viewport')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '도서관 안으로 들어가기' }));
  expect(screen.getByTestId('library-activity')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '도서관 나가기' }));
  fireEvent.press(screen.getByRole('button', { name: '마을 정류장으로 돌아오기' }));
  await settle();
  expect(position(screen)).toEqual(BUS_STOP_POINT);
  fireEvent.press(screen.getByRole('button', { name: '설정 열기' }));
  expect(screen.getByRole('radio', { name: '터치 이동' }).props.accessibilityState.checked).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: '설정 열기' }));
  await settle(300);
  fireEvent.press(screen.getByRole('button', { name: '휴대폰 열기' }));
  await settle(300);
  fireEvent.press(screen.getByRole('button', { name: '게임 나가기' }));
  fireEvent.press(screen.getByTestId('game-exit'));
  expect(screen.getByRole('button', { name: '오늘도 마을 들어가기' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: '게임 탭' }).props.accessibilityState.selected).toBe(true);
  screen.unmount();
});

it('목적지를 고르는 동안 마을 이동을 잠그고 취소하면 같은 정류장에 머문다', async () => {
  const screen = render(<GamePrototypeScreen onExit={jest.fn()} />);
  await settle();
  const original = position(screen);
  fireEvent.press(screen.getByRole('button', { name: '버스 목적지 고르기' }));
  fireEvent(screen.getByLabelText('쿼터뷰 마을'), 'accessibilityAction', { nativeEvent: { actionName: 'moveRight' } });
  expect(position(screen)).toEqual(original);
  fireEvent.press(screen.getByRole('button', { name: '마을에 머물기' }));
  await settle(300);
  expect(position(screen)).toEqual(original);
  expect(screen.queryByTestId('bus-activity')).toBeNull();
  expect(screen.queryByTestId('village-bus-destination')).toBeNull();
  expect(screen.getByRole('button', { name: '버스 목적지 고르기' })).toBeTruthy();
  screen.unmount();
});

it('마을 정류장에서 기사 NPC 없이 버스 연습을 시작하고 출근을 완료할 수 있다', async () => {
  const screen = render(<GamePrototypeScreen onExit={jest.fn()} />);
  await settle();
  fireEvent.press(screen.getByRole('button', { name: '버스 목적지 고르기' }));
  chooseLibraryAndBoard(screen);
  expect(screen.getByText('journey-entry:village-stop')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '출근 보고 완료' }));
  fireEvent.press(screen.getByRole('button', { name: '마을 정류장으로 돌아오기' }));
  await settle();
  expect(position(screen)).toEqual(BUS_STOP_POINT);
  fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
  expect(screen.getByLabelText('오늘 1/4 완료')).toBeTruthy();
  expect(screen.getByLabelText(/목적지 버스 찾기, 완료/)).toBeTruthy();
  expect(screen.queryByTestId('village-npc-driver')).toBeNull();
  screen.unmount();
});

it('버스 연습은 목적지 선택이나 중단 대신 실제 출근 완료 때만 한 번 완료된다', async () => {
  const screen = render(<GamePrototypeScreen onExit={jest.fn()} />);
  await settle();
  fireEvent.press(screen.getByRole('button', { name: '버스 목적지 고르기' }));
  chooseLibraryAndBoard(screen);
  fireEvent.press(screen.getByRole('button', { name: '마을 정류장으로 돌아오기' }));
  await settle();
  fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
  expect(screen.getByLabelText('오늘 0/4 완료')).toBeTruthy();
  expect(screen.getByLabelText(/목적지 버스 찾기, 진행 중/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
  await settle(300);
  fireEvent.press(screen.getByRole('button', { name: '버스 목적지 고르기' }));
  chooseLibraryAndBoard(screen);
  fireEvent.press(screen.getByRole('button', { name: '출근 보고 완료' }));
  fireEvent.press(screen.getByRole('button', { name: '출근 보고 완료' }));
  fireEvent.press(screen.getByRole('button', { name: '마을 정류장으로 돌아오기' }));
  await settle();
  fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
  expect(screen.getByLabelText('오늘 1/4 완료')).toBeTruthy();
  expect(screen.getByLabelText(/목적지 버스 찾기, 완료/)).toBeTruthy();
  screen.unmount();
});

it('개발용 busPreview는 실제 마을 정류장에서 시작하고 목적지를 고르기 전 버스 씬을 열지 않는다', async () => {
  const restore = webQuery('?busPreview=1&muteAudio=1');
  try {
    const screen = render(<App />);
    await settle();
    expect(screen.getByTestId('game-viewport')).toBeTruthy();
    expect(position(screen)).toEqual(BUS_STOP_POINT);
    expect(screen.queryByTestId('bus-activity')).toBeNull();
    expect(getQuests).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: '버스 목적지 고르기' }));
    chooseLibraryAndBoard(screen);
    expect(screen.getByText('journey-entry:village-stop')).toBeTruthy();
    screen.unmount();
  } finally { restore(); }
});

it('프로덕션에서는 busPreview 쿼리로 앱 진입이나 퀘스트 요청을 건너뛸 수 없다', async () => {
  const restore = webQuery('?busPreview=1');
  const previousDev = __DEV__;
  Object.defineProperty(globalThis, '__DEV__', { configurable: true, writable: true, value: false });
  try {
    const screen = render(<App />);
    await settle();
    expect(screen.queryByTestId('bus-activity')).toBeNull();
    expect(screen.getByRole('button', { name: 'Google로 시작하기' })).toBeTruthy();
    expect(getQuests).toHaveBeenCalledTimes(1);
    screen.unmount();
  } finally {
    Object.defineProperty(globalThis, '__DEV__', { configurable: true, writable: true, value: previousDev });
    restore();
  }
});
it('원래 마을에서 첫 201의 행선지를 확인하고 다음 305를 기다려 실제 선택한 차량에 탄다', async () => {
  const screen = render(<GamePrototypeScreen onExit={jest.fn()} />);
  await settle();
  fireEvent.press(screen.getByRole('button', { name: '버스 목적지 고르기' }));
  fireEvent.press(screen.getByRole('button', { name: '하늘도서관으로 가기' }));
  expect(screen.getByTestId('game-viewport')).toBeTruthy();
  expect(screen.getByText('늘봄주민센터 방면')).toBeTruthy();
  expect(screen.queryByTestId('bus-activity')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '기사님께 물어보기' }));
  expect(screen.getByText(/네, 하늘도서관에 가요/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '다음 버스 기다리기' }));
  expect(screen.getByRole('button', { name: '다음 버스를 기다리고 있어요' }).props.accessibilityState.disabled).toBe(true);
  await settle(2200);
  expect(screen.getByText('체육관 방면')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '기사님께 물어보기' }));
  expect(screen.getByText(/이 버스는 체육관으로 가요/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '305번 버스 타기' }));
  expect(screen.getByText('boarding-route:305')).toBeTruthy();
  expect(screen.getByText('boarding-phase:boarding')).toBeTruthy();
  expect(screen.getByText('boarding-card:true')).toBeTruthy();
  expect(screen.queryByTestId('game-viewport')).toBeNull();
  screen.unmount();
});
