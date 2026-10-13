import { act, fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { GamePrototypeScreen } from '../src/screens/GamePrototypeScreen';
import { INITIAL_PLAYER_POINT } from '../src/game/prototypeWorld';
import { getVillageRenderDepth } from '../src/game/villageStreets';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => ({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn() }),
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native');
  return { GlassView: View, isLiquidGlassAvailable: () => false };
});

it('마을 플레이어는 건물·NPC와 같은 월드 레이어에서 발 Y에 따라 깊이가 바뀐다', async () => {
  const screen = render(<GamePrototypeScreen onExit={jest.fn()} />);
  await act(async () => { await Promise.resolve(); });
  const layer = screen.getByTestId('expanded-village-layer');
  const player = () => within(layer).getByTestId('village-world-player');
  const style = () => StyleSheet.flatten(player().props.style);
  const value = (entry: number | { __getValue: () => number }) => typeof entry === 'number' ? entry : entry.__getValue();
  const position = () => ({
    x: value(style().transform.find((item: { translateX?: number }) => item.translateX !== undefined).translateX),
    y: value(style().transform.find((item: { translateY?: number }) => item.translateY !== undefined).translateY),
  });
  expect(screen.getAllByLabelText('내 캐릭터')).toHaveLength(1);
  expect(position()).toEqual(INITIAL_PLAYER_POINT);
  expect(style().left).toBe(0);
  expect(style().top).toBe(0);
  expect(value(style().zIndex)).toBe(getVillageRenderDepth(INITIAL_PLAYER_POINT.y));

  fireEvent(screen.getByLabelText('쿼터뷰 마을'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 667 } },
  });
  // Camera positioning must not be added to the player's world coordinates a second time.
  expect(position()).toEqual(INITIAL_PLAYER_POINT);
  fireEvent(screen.getByLabelText('쿼터뷰 마을'), 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
  const moved = position();
  expect(moved.x).toBe(INITIAL_PLAYER_POINT.x);
  expect(moved.y).toBeLessThan(INITIAL_PLAYER_POINT.y);
  expect(value(style().zIndex)).toBe(getVillageRenderDepth(moved.y));
  expect(style().marginTop).toBe(-93);
  screen.unmount();
});
