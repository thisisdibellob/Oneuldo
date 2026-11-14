import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, PixelRatio, StyleSheet } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { DirectionalAvatar } from '../src/components/game/DirectionalAvatar';
import {
  AVATAR_FACINGS,
  createAvatarWalkCycle,
  getAvatarAtlasOffset,
  type AvatarAnimationManifest,
  type AvatarAtlasSheet,
} from '../src/game/avatarAnimation';
import { avatarAtlasCache, type AvatarAtlasLoad } from '../src/game/avatarAtlasCache';

// Observe the actual Animated graph, before React's test-only scheduled render
// can combine two native updates into one final style assertion.
const AnimatedProps = require('react-native/Libraries/Animated/nodes/AnimatedProps').default;

jest.mock('../src/game/avatarAtlasCache', () => ({
  avatarAtlasCache: { subscribe: jest.fn() },
  AVATAR_ATLAS_LOAD_TIMEOUT_MS: 8000,
}));

const sheet: AvatarAtlasSheet = {
  id: 'atomic-walk', source: { uri: 'atomic-walk.png' },
  columns: 4, rows: 4, frameCount: 15, frameWidth: 128, frameHeight: 192,
};
const idleSheet: AvatarAtlasSheet = {
  ...sheet, id: 'atomic-idle', source: { uri: 'atomic-idle.png' },
  columns: 8, rows: 5, frameCount: 36,
};
const manifest = {
  ...Object.fromEntries(AVATAR_FACINGS.map(facing => [facing, {
    idle: [{ uri: 'fallback.png' }], walk: [{ uri: 'fallback.png' }],
  }])),
  atlases: Object.fromEntries(AVATAR_FACINGS.map(facing => [facing, {
    idle: idleSheet, walk: sheet, sprint: sheet,
  }])),
} as unknown as AvatarAnimationManifest;

type Transform = [{ translateX: number }, { translateY: number }];

describe('native atlas crop updates', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(PixelRatio, 'get').mockReturnValue(2);
    (avatarAtlasCache.subscribe as jest.Mock).mockImplementation((
      _source: ImageSourcePropType, callback: (result: AvatarAtlasLoad) => void,
    ) => {
      callback({ status: 'ready', source: { uri: 'file://atomic-walk.png' } });
      return jest.fn();
    });
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });

  it.each([
    { motion: 'walk', scale: 0.5 }, { motion: 'walk', scale: 0.55 },
    { motion: 'sprint', scale: 0.5 }, { motion: 'sprint', scale: 0.55 },
  ] as const)('emits only one complete $motion crop at scale $scale across rows and cycle wraps', ({ motion, scale }) => {
    const clock = createAvatarWalkCycle(150);
    const view = render(<DirectionalAvatar facing="right" manifest={manifest}
      motion={motion} walkCycle={clock} scale={scale} />);
    fireEvent(view.getByTestId('avatar-atlas-pending'), 'load');
    act(() => clock.advance(30)); // Begin at the final cell of the first row.
    const atlas = view.UNSAFE_getAllByType(Animated.Image).find(image => image.props.testID === 'avatar-atlas-visible')!;
    expect(atlas).toBeDefined();
    const { transform } = StyleSheet.flatten(atlas.props.style);
    const updates: Transform[] = [];
    const nativeProps = new AnimatedProps({ style: { transform } }, () => {
      const [x, y] = nativeProps.__getAnimatedValue().style.transform as Transform;
      // Native transforms treat -0 and 0 identically.
      updates.push([{ translateX: x.translateX || 0 }, { translateY: y.translateY || 0 }]);
    });
    nativeProps.__attach();
    try {
      // Nontrivial steps cover every row boundary, wrap, and skipped frames.
      for (const step of [...Array(32).fill(10), 40, 20, 70]) {
        updates.length = 0;
        act(() => clock.advance(step));
        const offset = getAvatarAtlasOffset(sheet, clock.frameIndex(sheet.frameCount), scale);
        expect(updates).toEqual([[
          { translateX: offset.x || 0 }, { translateY: offset.y || 0 },
        ]]);
      }
    } finally {
      nativeProps.__detach();
      view.unmount();
    }
  });

  it.each([0.5, 0.55])('emits each idle pose once through row changes and wraps at scale %s', scale => {
    const view = render(<DirectionalAvatar facing="front" manifest={manifest} motion="idle" scale={scale} />);
    fireEvent(view.getByTestId('avatar-atlas-pending'), 'load');
    const atlas = view.UNSAFE_getAllByType(Animated.Image).find(image => image.props.testID === 'avatar-atlas-visible')!;
    const { transform } = StyleSheet.flatten(atlas.props.style);
    const updates: Transform[] = [];
    const nativeProps = new AnimatedProps({ style: { transform } }, () => {
      const [x, y] = nativeProps.__getAnimatedValue().style.transform as Transform;
      updates.push([{ translateX: x.translateX || 0 }, { translateY: y.translateY || 0 }]);
    });
    nativeProps.__attach();
    try {
      act(() => jest.advanceTimersByTime(2250 * 2));
      expect(updates.length).toBeGreaterThanOrEqual(idleSheet.frameCount * 2);
      for (const [index, transformUpdate] of updates.entries()) {
        const offset = getAvatarAtlasOffset(idleSheet, index + 1, scale);
        expect(transformUpdate).toEqual([
          { translateX: offset.x || 0 }, { translateY: offset.y || 0 },
        ]);
      }
    } finally {
      nativeProps.__detach();
      view.unmount();
    }
  });
});
