import { render, fireEvent } from '@testing-library/react-native';

import type { AiVariationSettings } from '../src/ai/useAiVariationSettings';
import { AppShell } from '../src/screens/AppShell';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-haptics', () => ({ ImpactFeedbackStyle: { Light: 'light' }, impactAsync: () => Promise.resolve() }));
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

const shell = () => render(<AppShell accessToken={null} aiVariation={{ enabled: false } as AiVariationSettings}
  onRefreshQuests={jest.fn()} quests={[]} questsLoading={false} questsError="Failed to fetch" />);

it('서버에서 퀘스트를 못 받으면 오류 문구 대신 회색 "불러올 수 없어요." 칸을 보여 준다', () => {
  const screen = shell();
  expect(screen.queryByText('Failed to fetch')).toBeNull();
  expect(screen.getByTestId('practice-unavailable')).toBeTruthy();
  expect(screen.getByText('불러올 수 없어요.')).toBeTruthy();
});

it('퀘스트 탭 목록에도 같은 칸이 나온다', () => {
  const screen = shell();
  fireEvent.press(screen.getByRole('tab', { name: '퀘스트 탭' }));
  expect(screen.queryByText('Failed to fetch')).toBeNull();
  expect(screen.getByTestId('quest-unavailable')).toBeTruthy();
});
