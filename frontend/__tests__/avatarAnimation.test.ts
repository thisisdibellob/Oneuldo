import { createElement } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Image, StyleSheet } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { DirectionalAvatar } from '../src/components/game/DirectionalAvatar';
import {
  AVATAR_WALK_CYCLE_DISTANCE,
  createAvatarWalkCycle,
  getAvatarMovement,
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

  test('uses dedicated sprint frames and falls back to directional walk for legacy manifests', () => {
    expect(resolveAvatarFrame(manifest, 'right', 'sprint', 1)).toBe(42);
    const running = { ...manifest, right: { ...manifest.right, sprint: [frame(101), frame(102)] } };
    expect(resolveAvatarFrame(running, 'right', 'sprint', 1)).toBe(102);
    const emptySprint = { ...manifest, right: { ...manifest.right, sprint: [] } };
    expect(resolveAvatarFrame(emptySprint, 'right', 'sprint', 0)).toBe(41);
  });

  test('uses the front animation when a directional frame list is empty', () => {
    const withFallback: AvatarAnimationManifest = {
      ...manifest,
      left: { ...manifest.left, walk: [] },
    };

    expect(resolveAvatarFrame(withFallback, 'left', 'walk', 2)).toBe(13);
  });

  test('keeps the loaded pose until the new diagonal image is ready', () => {
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
    fireEvent(screen.UNSAFE_getAllByType(Image)[0], 'load');

    screen.rerender(
      createElement(DirectionalAvatar, {
        facing: 'backRight',
        manifest,
        motion: 'walk',
        reduceMotion: true,
      }),
    );

    expect(before).toEqual([11]);
    expect(mountedSources()).toEqual([11, 61]);
    const visible = () => screen.UNSAFE_getAllByType(Image)
      .filter(image => StyleSheet.flatten(image.props.style).opacity === 1)
      .map(image => image.props.source);
    expect(visible()).toEqual([11]);
    fireEvent(screen.UNSAFE_getAllByType(Image)[1], 'load');
    expect(visible()).toEqual([61]);
    expect(mountedSources()).toHaveLength(2);
    screen.unmount();
  });
});

describe('distance-driven avatar gait', () => {
  it('follows resolved displacement and stops completely at a wall', () => {
    expect(getAvatarMovement({ x: 3, y: 4 }, { x: 3, y: 4 }, 'right'))
      .toEqual({ distance: 0, facing: 'right', motion: 'idle' });
    // A diagonal request can resolve to a vertical slide after collision.
    expect(getAvatarMovement({ x: 3, y: 4 }, { x: 3, y: 7 }, 'right'))
      .toEqual({ distance: 3, facing: 'front', motion: 'walk' });
    // Very slow joystick movement still receives the correct facing.
    expect(getAvatarMovement({ x: 0, y: 0 }, { x: -0.01, y: 0 }, 'front'))
      .toEqual({ distance: 0.01, facing: 'left', motion: 'walk' });
  });

  it('uses sprint only for resolved movement and still settles to idle at a wall', () => {
    expect(getAvatarMovement({ x: 0, y: 0 }, { x: 4, y: 0 }, 'front', 'sprint'))
      .toEqual({ distance: 4, facing: 'right', motion: 'sprint' });
    expect(getAvatarMovement({ x: 4, y: 0 }, { x: 4, y: 0 }, 'right', 'sprint'))
      .toEqual({ distance: 0, facing: 'right', motion: 'idle' });
  });

  it('covers the same cycle for the same travel distance regardless of update rate', () => {
    const slow = createAvatarWalkCycle(), fast = createAvatarWalkCycle();
    for (let index = 0; index < 24; index++) slow.advance(AVATAR_WALK_CYCLE_DISTANCE / 32);
    fast.advance(AVATAR_WALK_CYCLE_DISTANCE * 0.75);
    expect(slow.frameIndex(8)).toBe(6);
    expect(fast.frameIndex(8)).toBe(6);
    fast.advance(AVATAR_WALK_CYCLE_DISTANCE / 4);
    expect(fast.frameIndex(8)).toBe(0);
  });

  it('does not count blocked or invalid travel and releases listeners', () => {
    const clock = createAvatarWalkCycle();
    const listener = jest.fn(), unsubscribe = clock.subscribe(listener);
    [0, -5, NaN, Infinity].forEach(clock.advance);
    expect(listener).not.toHaveBeenCalled();
    clock.advance(36);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(clock.frameIndex(8)).toBe(2);
    unsubscribe(); clock.advance(36);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
