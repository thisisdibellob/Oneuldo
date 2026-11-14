import { act, fireEvent, render, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { GamePrototypeScreen } from '../src/screens/GamePrototypeScreen';
import type { CafeSession } from '../src/game/cafeSession';
import { clearCafeDraft, getCafeDraft } from '../src/game/cafeStore';
import { CAFE_ENTRANCE_POINT, CAFE_RETURN_POINT } from '../src/game/prototypeWorld';
import { isVillageNavigationBlocked, isVillageNavigationSegmentClear } from '../src/game/villageNavigation';

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
// The café's actual work flow is covered separately. These callbacks verify the
// real village owns travel, control preferences, and the resumable draft.
jest.mock('../src/screens/CafeSimulationScreen', () => {
  const { View, Pressable, Text } = jest.requireActual('react-native');
  const { createCafeSession, applyCafeAction } = jest.requireActual('../src/game/cafeSession');
  return { CafeSimulationScreen: ({ initialSession, controlMode, onControlModeChange, onSessionChange, onExit, onTravel }: {
    initialSession?: CafeSession; controlMode: string; onControlModeChange: (mode: 'touch') => void;
    onSessionChange: (session: CafeSession) => void; onExit: () => void; onTravel: (destination: 'village' | 'library') => void;
  }) => <View testID="cafe-interior-entry">
    <Text>{controlMode}</Text><Text testID="resumed-order">{initialSession ? `${initialSession.id}:${initialSession.guests[0].ingredients.join(',')}` : 'new-shift'}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="터치 이동으로 바꾸기" onPress={() => onControlModeChange('touch')} />
    <Pressable accessibilityRole="button" accessibilityLabel="주문받고 얼음 넣기" onPress={() => {
      let draft = createCafeSession({ id: 'world-resume-cafe', now: 100 });
      for (const action of [{ type: 'START' }, { type: 'TAKE_ORDER' }, { type: 'CHOOSE_CUP', cup: 'glass' }, { type: 'ADD_INGREDIENT', ingredient: 'ice' }] as const) draft = applyCafeAction(draft, action);
      onSessionChange(draft);
    }} />
    <Pressable accessibilityRole="button" accessibilityLabel="카페 밖으로 나가기" onPress={onExit} />
    <Pressable accessibilityRole="button" accessibilityLabel="카페 휴대폰으로 도서관 이동" onPress={() => onTravel('library')} />
  </View> };
});
jest.mock('../src/screens/BusSimulationScreen', () => {
  const { View, Pressable, Text } = jest.requireActual('react-native');
  return { BusSimulationScreen: ({ entryPoint, onExit }: { entryPoint: string; onExit: () => void }) => <View testID="cafe-travel-destination"><Text>{entryPoint}</Text><Pressable accessibilityRole="button" accessibilityLabel="도서관 구역에서 마을로" onPress={onExit} /></View> };
});

beforeEach(() => { clearCafeDraft(); jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true); });
afterEach(() => { clearCafeDraft(); jest.restoreAllMocks(); });
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

it('퀘스트에서 카페로 들어가면 마을 조작을 감추고, 나간 뒤 실제 문으로 다시 들어가 주문과 조작 설정을 이어간다', async () => {
  const exitGame = jest.fn(); const screen = render(<GamePrototypeScreen initialActivity="cafe" onExit={exitGame} />);
  await flush();
  expect(screen.getByTestId('cafe-interior-entry')).toBeTruthy();
  expect(screen.queryByTestId('game-viewport')).toBeNull();
  expect(screen.queryByTestId('village-world-player')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '터치 이동으로 바꾸기' }));
  fireEvent.press(screen.getByRole('button', { name: '주문받고 얼음 넣기' }));
  fireEvent.press(screen.getByRole('button', { name: '카페 밖으로 나가기' }));
  await flush();
  expect(screen.getByTestId('game-viewport')).toBeTruthy();
  expect(within(screen.getByTestId('game-controls')).getByRole('button', { name: '카페 들어가기' })).toBeTruthy();
  expect(exitGame).not.toHaveBeenCalled();
  fireEvent.press(within(screen.getByTestId('game-controls')).getByRole('button', { name: '카페 들어가기' }));
  await flush();
  expect(screen.getByTestId('cafe-interior-entry')).toBeTruthy();
  expect(screen.getByText('touch')).toBeTruthy();
  expect(screen.getByTestId('resumed-order').props.children).toBe('world-resume-cafe:ice');
  expect(screen.queryByTestId('game-viewport')).toBeNull();
  screen.unmount();
});

it('카페 휴대폰의 도서관 이동은 카페를 닫고 도서관 외부로 연결하며, 근무 중 주문은 지우지 않는다', async () => {
  const exitGame = jest.fn(); const screen = render(<GamePrototypeScreen initialActivity="cafe" onExit={exitGame} />);
  await flush();
  fireEvent.press(screen.getByRole('button', { name: '주문받고 얼음 넣기' }));
  const draft = getCafeDraft();
  fireEvent.press(screen.getByRole('button', { name: '카페 휴대폰으로 도서관 이동' }));
  await flush();
  expect(screen.queryByTestId('cafe-interior-entry')).toBeNull();
  expect(screen.getByTestId('cafe-travel-destination')).toBeTruthy();
  expect(screen.getByText('library-exterior')).toBeTruthy();
  expect(getCafeDraft()).toBe(draft);
  fireEvent.press(screen.getByRole('button', { name: '도서관 구역에서 마을로' }));
  await flush();
  expect(screen.getByTestId('game-viewport')).toBeTruthy();
  expect(screen.queryByTestId('cafe-interior-entry')).toBeNull();
  expect(screen.queryByTestId('cafe-travel-destination')).toBeNull();
  expect(exitGame).not.toHaveBeenCalled();
  screen.unmount();
});

it('카페 출입문과 복귀 위치는 캐릭터 충돌 크기를 포함해 자유롭게 오갈 수 있다', () => {
  expect(isVillageNavigationBlocked(CAFE_RETURN_POINT)).toBe(false);
  expect(isVillageNavigationBlocked(CAFE_ENTRANCE_POINT)).toBe(false);
  expect(isVillageNavigationSegmentClear(CAFE_RETURN_POINT, CAFE_ENTRANCE_POINT)).toBe(true);
});
