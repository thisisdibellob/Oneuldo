import { createElement } from 'react';
import { render } from '@testing-library/react-native';
import { Image } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { DirectionalAvatar } from '../src/components/game/DirectionalAvatar';
import {
  facingFromVector,
  resolveAvatarFrame,
  type AvatarAnimationManifest,
} from '../src/game/avatarAnimation';

const frame = (id: number) => id as ImageSourcePropType;

const manifest: AvatarAnimationManifest = {
  back: { idle: [frame(20)], walk: [frame(21), frame(22)] },
  backLeft: { idle: [frame(50)], walk: [frame(51), frame(52)] },
  backRight: { idle: [frame(60)], walk: [frame(61), frame(62)] },
  front: { idle: [frame(10)], walk: [frame(11), frame(12), frame(13)] },
  frontLeft: { idle: [frame(70)], walk: [frame(71), frame(72)] },
  frontRight: { idle: [frame(80)], walk: [frame(81), frame(82)] },
  left: { idle: [frame(30)], walk: [frame(31), frame(32)] },
  right: { idle: [frame(40)], walk: [frame(41), frame(42)] },
};

describe('avatarAnimation', () => {
  test('keeps the previous facing inside the movement dead zone', () => {
    expect(facingFromVector(0, 0, 'left')).toBe('left');
    expect(facingFromVector(0.01, -0.01, 'right')).toBe('right');
  });

  test.each([
    [0, 1, 'front'],
    [0, -1, 'back'],
    [-1, 0, 'left'],
    [1, 0, 'right'],
    [1, 1, 'frontRight'],
    [-1, 1, 'frontLeft'],
    [-1, -1, 'backLeft'],
    [1, -1, 'backRight'],
  ] as const)('maps vector (%s, %s) to %s', (x, y, expected) => {
    expect(facingFromVector(x, y)).toBe(expected);
  });

  test('keeps the previous direction briefly near an eight-way sector boundary', () => {
    const justPastFrontBoundary = (28 * Math.PI) / 180;
    expect(
      facingFromVector(
        Math.cos(justPastFrontBoundary),
        Math.sin(justPastFrontBoundary),
        'right',
      ),
    ).toBe('right');

    const beyondHysteresis = (32 * Math.PI) / 180;
    expect(
      facingFromVector(
        Math.cos(beyondHysteresis),
        Math.sin(beyondHysteresis),
        'right',
      ),
    ).toBe('frontRight');
  });

  test('wraps positive and negative animation frame indexes', () => {
    expect(resolveAvatarFrame(manifest, 'front', 'walk', 4)).toBe(12);
    expect(resolveAvatarFrame(manifest, 'front', 'walk', -1)).toBe(13);
  });

  test('uses the front animation when a directional frame list is empty', () => {
    const withFallback: AvatarAnimationManifest = {
      ...manifest,
      left: { ...manifest.left, walk: [] },
    };

    expect(resolveAvatarFrame(withFallback, 'left', 'walk', 2)).toBe(13);
  });

  test('keeps every facing mounted while the active direction changes', () => {
    const screen = render(
      createElement(DirectionalAvatar, {
        facing: 'front',
        manifest,
        motion: 'walk',
        reduceMotion: true,
      }),
    );
    const mountedSources = () =>
      screen.UNSAFE_getAllByType(Image).map((image) => image.props.source);
    const before = mountedSources();

    screen.rerender(
      createElement(DirectionalAvatar, {
        facing: 'backRight',
        manifest,
        motion: 'walk',
        reduceMotion: true,
      }),
    );

    expect(before).toHaveLength(25);
    expect(mountedSources()).toEqual(before);
  });
});
