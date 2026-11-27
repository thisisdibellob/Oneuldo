import { act, render } from '@testing-library/react-native';

import type { AiVariationSettings } from '../src/ai/useAiVariationSettings';
import { LevelUpCelebration } from '../src/components/LevelUpCelebration';
import { AppShell } from '../src/screens/AppShell';

let mockLevel = 1;
jest.mock('../src/progress/userProgress', () => ({
  ...jest.requireActual('../src/progress/userProgress'),
  syncUserProgress: jest.fn(),
  useUserProgress: () => ({ ...jest.requireActual('../src/progress/userProgress').summarizeProgress({ entries: [], totalXp: 0, activeDays: [], bestStreak: 0 }), level: mockLevel }),
}));
jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve(), useFonts: () => [true, null] }));
jest.mock('expo-haptics', () => ({ ImpactFeedbackStyle: { Light: 'light' }, impactAsync: () => Promise.resolve() }));
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

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('레벨 업 문구와 새 레벨을 보여 주고, 끝나면 스스로 사라진다', () => {
  const onDone = jest.fn();
  const screen = render(<LevelUpCelebration level={3} onDone={onDone} />);
  expect(screen.getByText('레벨 업!')).toBeTruthy();
  expect(screen.getByText('Lv.3')).toBeTruthy();
  expect(screen.getByTestId('level-up-celebration').props.pointerEvents).toBe('none');
  act(() => { jest.advanceTimersByTime(5000); });
  expect(onDone).toHaveBeenCalledTimes(1);
});

it('앱을 열 때의 저장된 레벨은 축하하지 않고, 레벨이 오를 때만 축하한다', () => {
  mockLevel = 2;
  const props = { accessToken: null, aiVariation: { enabled: false } as AiVariationSettings, onRefreshQuests: jest.fn(), quests: [], questsLoading: false, questsError: null };
  const screen = render(<AppShell {...props} />);
  expect(screen.queryByTestId('level-up-celebration')).toBeNull();

  mockLevel = 3;
  screen.rerender(<AppShell {...props} />);
  expect(screen.getByText('Lv.3')).toBeTruthy();
  act(() => { jest.advanceTimersByTime(5000); });
  expect(screen.queryByTestId('level-up-celebration')).toBeNull();
  screen.unmount();
});
