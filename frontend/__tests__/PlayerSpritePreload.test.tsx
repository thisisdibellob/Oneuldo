import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { AiVariationSettings } from '../src/ai/useAiVariationSettings';
import { chibiPlayerAvatar } from '../src/game/chibiPlayerAvatar';
import { playerSpriteSources, resetPlayerSpritePreloadForTests } from '../src/game/playerSpritePreload';
import { AppShell } from '../src/screens/AppShell';

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

afterEach(() => resetPlayerSpritePreloadForTests(true));

it('플레이어가 쓸 수 있는 모든 방향·동작 스프라이트 시트를 미리 불러올 목록에 넣는다', () => {
  const sheetIds = new Set(Object.values(chibiPlayerAvatar.atlases ?? {}).flatMap((direction) =>
    direction ? [direction.idle, direction.walk, direction.sprint].filter(Boolean).map((sheet) => sheet!.id) : []));
  expect(sheetIds.size).toBe(18);
  expect(playerSpriteSources(chibiPlayerAvatar, 1).length).toBe(18 + 2);
  expect(playerSpriteSources(chibiPlayerAvatar, 3).length).toBe(18 + 2);
});

it('처음 게임에 들어가면 캐릭터 준비 화면을 보여준 뒤 마을로 들어간다', async () => {
  resetPlayerSpritePreloadForTests(false);
  const screen = render(<AppShell accessToken={null} aiVariation={{ enabled: false } as AiVariationSettings}
    onRefreshQuests={jest.fn()} quests={[]} questsLoading={false} questsError={null} />);
  fireEvent.press(screen.getByRole('tab', { name: '게임 탭' }));
  fireEvent.press(screen.getByRole('button', { name: '오늘도 마을 들어가기' }));

  expect(screen.getByLabelText('캐릭터를 준비하고 있어요')).toBeTruthy();
  expect(screen.queryByTestId('game-viewport')).toBeNull();
  await waitFor(() => expect(screen.getByTestId('game-viewport')).toBeTruthy(), { timeout: 10_000 });
  screen.unmount();
}, 20_000);
