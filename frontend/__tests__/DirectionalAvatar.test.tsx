import { act, render } from '@testing-library/react-native';
import { Image, StyleSheet } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { DirectionalAvatar } from '../src/components/game/DirectionalAvatar';
import { AVATAR_FACINGS, type AvatarAnimationManifest } from '../src/game/avatarAnimation';

const manifest = Object.fromEntries(AVATAR_FACINGS.map(facing => [facing, {
  idle: Array.from({ length: 2 }, (_, index) => ({ uri: `https://assets.test/${facing}-idle-${index}.png` })),
  walk: Array.from({ length: 8 }, (_, index) => ({ uri: `https://assets.test/${facing}-walk-${index}.png` })),
}])) as unknown as AvatarAnimationManifest;

function sourceUri(source: ImageSourcePropType) {
  return (source as { uri: string }).uri;
}

describe('DirectionalAvatar resource loading', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Image, 'prefetch').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('mounts and prefetches only the current animation instead of all 80 frames', () => {
    const view = render(<DirectionalAvatar facing="front" manifest={manifest} motion="idle" />);
    const images = view.UNSAFE_getAllByType(Image);

    expect(images).toHaveLength(2);
    expect(images.map(image => sourceUri(image.props.source))).toEqual(manifest.front.idle.map(sourceUri));
    expect(Image.prefetch).toHaveBeenCalledTimes(2);
    expect(Image.prefetch).toHaveBeenNthCalledWith(1, sourceUri(manifest.front.idle[0]));
    expect(Image.prefetch).toHaveBeenNthCalledWith(2, sourceUri(manifest.front.idle[1]));
  });

  it('keeps the eight walking resources mounted while opacity advances at the original timing', () => {
    const view = render(<DirectionalAvatar facing="right" manifest={manifest} motion="walk" />);
    const visibleSources = () => view.UNSAFE_getAllByType(Image)
      .filter(image => StyleSheet.flatten(image.props.style).opacity === 1)
      .map(image => sourceUri(image.props.source));

    expect(view.UNSAFE_getAllByType(Image)).toHaveLength(8);
    expect(visibleSources()).toEqual([sourceUri(manifest.right.walk[0])]);
    act(() => jest.advanceTimersByTime(96));
    expect(visibleSources()).toEqual([sourceUri(manifest.right.walk[1])]);
    act(() => jest.advanceTimersByTime(96 * 7));
    expect(visibleSources()).toEqual([sourceUri(manifest.right.walk[0])]);
    expect(view.UNSAFE_getAllByType(Image)).toHaveLength(8);
    expect(Image.prefetch).toHaveBeenCalledTimes(8);
  });

  it('loads the new facing and motion without retaining invisible frames from the previous set', () => {
    const view = render(<DirectionalAvatar facing="front" manifest={manifest} motion="idle" />);
    view.rerender(<DirectionalAvatar facing="left" manifest={manifest} motion="walk" />);
    let images = view.UNSAFE_getAllByType(Image);
    expect(images).toHaveLength(8);
    expect(images.map(image => sourceUri(image.props.source))).toEqual(manifest.left.walk.map(sourceUri));
    expect(StyleSheet.flatten(images[0].props.style).opacity).toBe(1);

    act(() => jest.advanceTimersByTime(96 * 3));
    view.rerender(<DirectionalAvatar facing="back" manifest={manifest} motion="idle" />);
    images = view.UNSAFE_getAllByType(Image);
    expect(images).toHaveLength(2);
    expect(images.map(image => sourceUri(image.props.source))).toEqual(manifest.back.idle.map(sourceUri));
    expect(StyleSheet.flatten(images[0].props.style).opacity).toBe(1);
  });

  it('preserves front-frame fallback and reduced motion for a missing directional animation', () => {
    const fallbackManifest = { ...manifest, left: { ...manifest.left, idle: [] } };
    const view = render(<DirectionalAvatar facing="left" manifest={fallbackManifest} motion="idle" reduceMotion />);
    act(() => jest.advanceTimersByTime(720 * 3));
    const images = view.UNSAFE_getAllByType(Image);
    expect(images.map(image => sourceUri(image.props.source))).toEqual(manifest.front.idle.map(sourceUri));
    expect(images.map(image => StyleSheet.flatten(image.props.style).opacity)).toEqual([1, 0]);
  });
});