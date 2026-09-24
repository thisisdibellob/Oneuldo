import { act, fireEvent, render } from '@testing-library/react-native';
import { Image, Platform, StyleSheet } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { DirectionalAvatar } from '../src/components/game/DirectionalAvatar';
import { AVATAR_WALK_CYCLE_DISTANCE, createAvatarWalkCycle, AVATAR_FACINGS, type AvatarAnimationManifest, type AvatarFacing, type AvatarMotion } from '../src/game/avatarAnimation';

const manifest = Object.fromEntries(AVATAR_FACINGS.map(facing => [facing, {
  // Short idle sequence verifies time-based breathing independently of travel.
  idle: Array.from({ length: 2 }, (_, index) => ({ uri: `https://assets.test/${facing}-idle-${index}.png` })),
  walk: Array.from({ length: 16 }, (_, index) => ({ uri: `https://assets.test/${facing}-walk-${index}.png` })),
}])) as unknown as AvatarAnimationManifest;

const sourceUri = (source: ImageSourcePropType) => (source as { uri: string }).uri;
type AvatarView = ReturnType<typeof render>;
const images = (view: AvatarView) => view.UNSAFE_getAllByType(Image);
const visible = (view: AvatarView) => images(view)
  .filter(image => StyleSheet.flatten(image.props.style).opacity === 1)
  .map(image => sourceUri(image.props.source));
const imageFor = (view: AvatarView, source: ImageSourcePropType) => {
  const image = images(view).find(item => sourceUri(item.props.source) === sourceUri(source));
  if (!image) throw new Error(`Image is not mounted: ${sourceUri(source)}`);
  return image;
};
const load = (view: AvatarView, source: ImageSourcePropType) => fireEvent(imageFor(view, source), 'load');

describe('DirectionalAvatar buffered image loading', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Image, 'prefetch').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('warms first idle poses and the active animation while mounting at most two images', () => {
    const view = render(<DirectionalAvatar facing="front" manifest={manifest} motion="idle" />);
    expect(images(view)).toHaveLength(1);
    expect(visible(view)).toEqual([sourceUri(manifest.front.idle[0])]);
    expect(Image.prefetch).toHaveBeenCalledTimes(9);
    expect((Image.prefetch as jest.Mock).mock.calls.map(call => call[0]))
      .toEqual([...AVATAR_FACINGS.map(facing => sourceUri(manifest[facing].idle[0])), sourceUri(manifest.front.idle[1])]);
    load(view, manifest.front.idle[0]);
    view.rerender(<DirectionalAvatar facing="right" manifest={manifest} motion="walk" />);
    expect(images(view)).toHaveLength(2);
    expect(Image.prefetch).toHaveBeenCalledTimes(25);
    expect(images(view).every(image => image.props.fadeDuration === 0)).toBe(true);
    expect(visible(view)).toEqual([sourceUri(manifest.front.idle[0])]);
    view.unmount();
  });

  it.each(['ios', 'web'] as const)('keeps the previous %s image until the actual replacement loads', async os => {
    const originalOS = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    const view = render(<DirectionalAvatar facing="front" manifest={manifest} motion="idle" />);
    try {
      load(view, manifest.front.idle[0]);
      view.rerender(<DirectionalAvatar facing="left" manifest={manifest} motion="idle" />);
      const replacement = imageFor(view, manifest.left.idle[0]);
      // Prefetch resolving is insufficient: the mounted Image has not loaded yet.
      await act(async () => { await Promise.resolve(); });
      expect(visible(view)).toEqual([sourceUri(manifest.front.idle[0])]);
      expect(StyleSheet.flatten(replacement.props.style).opacity).toBe(0);
      fireEvent(replacement, 'load');
      expect(visible(view)).toEqual([sourceUri(manifest.left.idle[0])]);
      expect(imageFor(view, manifest.left.idle[0])).toBe(replacement);
      expect(images(view)).toHaveLength(2);
    } finally {
      view.unmount();
      if (originalOS) Object.defineProperty(Platform, 'OS', originalOS);
    }
  });

  it('finishes a slow walking request before consuming the latest phase without starving loading', () => {
    const clock = createAvatarWalkCycle();
    const view = render(<DirectionalAvatar facing="right" manifest={manifest} motion="walk" walkCycle={clock} />);
    load(view, manifest.right.walk[0]);
    act(() => clock.advance(9));
    const pending = imageFor(view, manifest.right.walk[1]);
    const onLoad = pending.props.onLoad;
    const onError = pending.props.onError;
    for (let frame = 0; frame < 3; frame++) act(() => clock.advance(9));
    expect(images(view)).toHaveLength(2);
    expect(imageFor(view, manifest.right.walk[1])).toBe(pending);
    expect(pending.props.onLoad).toBe(onLoad);
    expect(pending.props.onError).toBe(onError);
    expect(visible(view)).toEqual([sourceUri(manifest.right.walk[0])]);
    fireEvent(pending, 'load');
    expect(visible(view)).toEqual([sourceUri(manifest.right.walk[1])]);
    expect(imageFor(view, manifest.right.walk[4])).toBeTruthy();
    load(view, manifest.right.walk[4]);
    expect(visible(view)).toEqual([sourceUri(manifest.right.walk[4])]);
    expect(images(view)).toHaveLength(2);
    view.unmount();
  });

  it('ignores late load and error events after rapid direction changes', () => {
    const element = (facing: AvatarFacing) => <DirectionalAvatar facing={facing} manifest={manifest} motion="idle" />;
    const view = render(element('front'));
    load(view, manifest.front.idle[0]);
    view.rerender(element('left'));
    const stale = imageFor(view, manifest.left.idle[0]).props;
    view.rerender(element('right'));
    act(() => { stale.onLoad(); stale.onError(); });
    expect(visible(view)).toEqual([sourceUri(manifest.front.idle[0])]);
    expect(images(view)).toHaveLength(2);
    load(view, manifest.right.idle[0]);
    act(() => { stale.onLoad(); stale.onError(); });
    expect(visible(view)).toEqual([sourceUri(manifest.right.idle[0])]);
    view.unmount();
  });

  it('does not flash the abandoned direction when the player returns before loading finishes', () => {
    const element = (facing: AvatarFacing) => <DirectionalAvatar facing={facing} manifest={manifest} motion="idle" />;
    const view = render(element('front'));
    load(view, manifest.front.idle[0]);
    view.rerender(element('left'));
    const pending = imageFor(view, manifest.left.idle[0]);
    view.rerender(element('front'));
    fireEvent(pending, 'load');
    expect(visible(view)).toEqual([sourceUri(manifest.front.idle[0])]);
    view.rerender(element('left'));
    expect(visible(view)).toEqual([sourceUri(manifest.left.idle[0])]);
    expect(imageFor(view, manifest.left.idle[0])).toBe(pending);
    view.unmount();
  });

  it('keeps the last loaded pose after failure and retries only after a new target is requested', () => {
    const element = (facing: AvatarFacing) => <DirectionalAvatar facing={facing} manifest={manifest} motion="idle" />;
    const view = render(element('front'));
    load(view, manifest.front.idle[0]);
    view.rerender(element('left'));
    const failed = imageFor(view, manifest.left.idle[0]).props;
    act(() => failed.onError());
    expect(visible(view)).toEqual([sourceUri(manifest.front.idle[0])]);
    expect(images(view)).toHaveLength(1);
    view.rerender(element('left'));
    expect(images(view)).toHaveLength(1);
    // Returning to the already visible pose must clear the failed request too.
    view.rerender(element('front'));
    expect(images(view)).toHaveLength(1);
    view.rerender(element('left'));
    const retry = imageFor(view, manifest.left.idle[0]);
    act(() => { failed.onLoad(); failed.onError(); });
    expect(visible(view)).toEqual([sourceUri(manifest.front.idle[0])]);
    fireEvent(retry, 'load');
    expect(visible(view)).toEqual([sourceUri(manifest.left.idle[0])]);
    view.unmount();
  });

  it('starts idle at zero, breathes with time, and resumes the retained movement phase', () => {
    const clock = createAvatarWalkCycle();
    clock.advance(AVATAR_WALK_CYCLE_DISTANCE * 15 / 16);
    const element = (motion: AvatarMotion) =>
      <DirectionalAvatar facing="right" manifest={manifest} motion={motion} walkCycle={clock} />;
    const view = render(element('walk'));
    load(view, manifest.right.walk[15]);
    view.rerender(element('idle'));
    expect(imageFor(view, manifest.right.idle[0])).toBeTruthy();
    expect(visible(view)).toEqual([sourceUri(manifest.right.walk[15])]);
    load(view, manifest.right.idle[0]);
    act(() => jest.advanceTimersByTime(62.5));
    load(view, manifest.right.idle[1]);
    expect(visible(view)).toEqual([sourceUri(manifest.right.idle[1])]);
    expect(clock.frameIndex(16)).toBe(15);
    act(() => jest.advanceTimersByTime(62.5));
    expect(visible(view)).toEqual([sourceUri(manifest.right.idle[0])]);
    view.rerender(element('walk'));
    load(view, manifest.right.walk[15]);
    expect(visible(view)).toEqual([sourceUri(manifest.right.walk[15])]);
    act(() => clock.advance(9));
    load(view, manifest.right.walk[0]);
    expect(visible(view)).toEqual([sourceUri(manifest.right.walk[0])]);
    view.unmount();
  });

  it('prioritizes stopping over an in-flight walk frame and ignores that frame arriving late', () => {
    const clock = createAvatarWalkCycle();
    const element = (motion: AvatarMotion) =>
      <DirectionalAvatar facing="right" manifest={manifest} motion={motion} walkCycle={clock} />;
    const view = render(element('walk'));
    load(view, manifest.right.walk[0]);
    act(() => clock.advance(9));
    const stale = imageFor(view, manifest.right.walk[1]).props;
    view.rerender(element('idle'));
    act(() => stale.onLoad());
    expect(visible(view)).toEqual([sourceUri(manifest.right.walk[0])]);
    load(view, manifest.right.idle[0]);
    act(() => { stale.onLoad(); stale.onError(); });
    expect(visible(view)).toEqual([sourceUri(manifest.right.idle[0])]);
    expect(clock.frameIndex(16)).toBe(1);
    view.unmount();
  });

  it('keeps phase through turns and reduced motion without advancing from elapsed time', () => {
    const clock = createAvatarWalkCycle();
    const element = (facing: AvatarFacing, reduceMotion = false) =>
      <DirectionalAvatar facing={facing} manifest={manifest} motion="walk" walkCycle={clock} reduceMotion={reduceMotion} />;
    const view = render(element('right'));
    load(view, manifest.right.walk[0]);
    act(() => jest.advanceTimersByTime(2000));
    expect(visible(view)).toEqual([sourceUri(manifest.right.walk[0])]);
    act(() => clock.advance(27));
    load(view, manifest.right.walk[3]);
    view.rerender(element('back'));
    load(view, manifest.back.walk[3]);
    expect(visible(view)).toEqual([sourceUri(manifest.back.walk[3])]);
    view.rerender(element('back', true));
    load(view, manifest.back.walk[0]);
    act(() => clock.advance(9));
    expect(visible(view)).toEqual([sourceUri(manifest.back.walk[0])]);
    view.rerender(element('back'));
    load(view, manifest.back.walk[4]);
    expect(visible(view)).toEqual([sourceUri(manifest.back.walk[4])]);
    view.unmount();
  });

  it('preserves timer-based walking for callers without a distance clock', () => {
    const view = render(<DirectionalAvatar facing="right" manifest={manifest} motion="walk" />);
    load(view, manifest.right.walk[0]);
    act(() => jest.advanceTimersByTime(96));
    expect(visible(view)).toEqual([sourceUri(manifest.right.walk[0])]);
    load(view, manifest.right.walk[1]);
    expect(visible(view)).toEqual([sourceUri(manifest.right.walk[1])]);
    expect(images(view)).toHaveLength(2);
    view.unmount();
  });

  it('finishes slow idle loads without restarting the request on each breathing tick', () => {
    const idle = Array.from({ length: 36 }, (_, i) => ({ uri: `https://assets.test/breath-${i}.png` }));
    const breathing = { ...manifest, backLeft: { ...manifest.backLeft, idle } };
    const clock = createAvatarWalkCycle();
    const view = render(<DirectionalAvatar facing="backLeft" manifest={breathing} motion="idle" walkCycle={clock} />);
    load(view, idle[0]);
    act(() => clock.advance(72));
    expect(visible(view)).toEqual([sourceUri(idle[0])]);
    act(() => jest.advanceTimersByTime(62.5));
    const pending = imageFor(view, idle[1]);
    const handler = pending.props.onLoad;
    act(() => jest.advanceTimersByTime(187.5));
    expect(imageFor(view, idle[1])).toBe(pending);
    expect(pending.props.onLoad).toBe(handler);
    fireEvent(pending, 'load');
    expect(visible(view)).toEqual([sourceUri(idle[1])]);
    load(view, idle[4]);
    expect(visible(view)).toEqual([sourceUri(idle[4])]);
    expect(images(view)).toHaveLength(2);
    view.unmount();
  });

  it('switches to dedicated sprint art at the same distance phase and freezes it for reduced motion', () => {
    const sprint = Array.from({ length: 12 }, (_, i) => ({ uri: `https://assets.test/sprint-${i}.png` }));
    const running = { ...manifest, right: { ...manifest.right, sprint } };
    const clock = createAvatarWalkCycle();
    clock.advance(36);
    const element = (motion: AvatarMotion, reduceMotion = false) =>
      <DirectionalAvatar facing="right" manifest={running} motion={motion} walkCycle={clock} reduceMotion={reduceMotion} />;
    const view = render(element('walk'));
    load(view, manifest.right.walk[4]);
    view.rerender(element('sprint'));
    load(view, sprint[3]);
    expect(visible(view)).toEqual([sourceUri(sprint[3])]);
    act(() => jest.advanceTimersByTime(2000));
    expect(visible(view)).toEqual([sourceUri(sprint[3])]);
    act(() => clock.advance(12));
    load(view, sprint[4]);
    view.rerender(element('sprint', true));
    load(view, sprint[0]);
    act(() => { clock.advance(12); jest.advanceTimersByTime(500); });
    expect(visible(view)).toEqual([sourceUri(sprint[0])]);
    view.rerender(element('sprint'));
    load(view, sprint[5]);
    expect(visible(view)).toEqual([sourceUri(sprint[5])]);
    view.rerender(element('idle', true));
    load(view, manifest.right.idle[0]);
    act(() => jest.advanceTimersByTime(500));
    expect(visible(view)).toEqual([sourceUri(manifest.right.idle[0])]);
    view.unmount();
  });

  it('uses the first front idle pose for a missing directional idle', () => {
    const fallbackManifest = { ...manifest, left: { ...manifest.left, idle: [] } };
    const view = render(<DirectionalAvatar facing="left" manifest={fallbackManifest} motion="idle" reduceMotion />);
    act(() => jest.advanceTimersByTime(720 * 3));
    expect(images(view)).toHaveLength(1);
    expect(visible(view)).toEqual([sourceUri(manifest.front.idle[0])]);
    view.unmount();
  });
});
