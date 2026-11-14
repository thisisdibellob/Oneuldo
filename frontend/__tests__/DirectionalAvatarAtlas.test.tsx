import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, Image, PixelRatio, StyleSheet } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { DirectionalAvatar } from '../src/components/game/DirectionalAvatar';
import { AVATAR_FACINGS, createAvatarWalkCycle, type AvatarAnimationManifest, type AvatarAtlasSheet, type AvatarFacing } from '../src/game/avatarAnimation';
import { avatarAtlasCache, AVATAR_ATLAS_LOAD_TIMEOUT_MS, type AvatarAtlasLoad } from '../src/game/avatarAtlasCache';
import * as avatarAnimation from '../src/game/avatarAnimation';

jest.mock('../src/game/avatarAtlasCache', () => ({ avatarAtlasCache: { subscribe: jest.fn() }, AVATAR_ATLAS_LOAD_TIMEOUT_MS: 8000 }));
const sheet = (id: string, count: number): AvatarAtlasSheet => ({ id, source: { uri: `${id}.png` }, highResolutionSource: { uri: `${id}_hd.png` }, columns: count > 16 ? 8 : 4, rows: Math.ceil(count / (count > 16 ? 8 : 4)), frameCount: count, frameWidth: 128, frameHeight: 192 });
const frontIdle = sheet('front-idle', 36), backIdle = sheet('back-idle', 36);
const manifest = {
  ...Object.fromEntries(AVATAR_FACINGS.map(facing => [facing, { idle: [{ uri: `${facing.startsWith('back') ? 'back' : 'front'}-fallback.png` }], walk: [{ uri: 'fallback' }] }])),
  atlases: Object.fromEntries(AVATAR_FACINGS.map(facing => [facing, { idle: facing.startsWith('back') ? backIdle : frontIdle, walk: sheet(`${facing}-walk`, 16), sprint: sheet(`${facing}-sprint`, 10) }])),
} as unknown as AvatarAnimationManifest;
type View = ReturnType<typeof render>;
const style = (view: View, id: string) => StyleSheet.flatten(view.getByTestId(id).props.style);
const uri = (source: ImageSourcePropType) => (source as { uri: string }).uri;
const subscribers: { uri: string; callback: (value: AvatarAtlasLoad) => void; leave: jest.Mock }[] = [];
const downloaded = (name: string) => act(() => subscribers.findLast(item => item.uri === name)!.callback({ status: 'ready', source: { uri: `file://${name}` } }));
const load = (view: View, name: string) => { downloaded(name); fireEvent(view.getByTestId('avatar-atlas-pending'), 'load'); };

describe('packed player sprite renderer', () => {
  beforeEach(() => {
    jest.useFakeTimers(); subscribers.length = 0;
    jest.spyOn(PixelRatio, 'get').mockReturnValue(2);
    jest.spyOn(Image, 'prefetch').mockResolvedValue(true);
    (avatarAtlasCache.subscribe as jest.Mock).mockReset().mockImplementation((source: ImageSourcePropType, callback: (value: AvatarAtlasLoad) => void) => {
      const leave = jest.fn(); subscribers.push({ uri: uri(source), callback, leave }); return leave;
    });
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });

  it('shows an immediate pose, requests one correctly sized sheet and animates it without swapping native sources', () => {
    const clock = createAvatarWalkCycle();
    const view = render(<DirectionalAvatar facing="right" manifest={manifest} motion="walk" walkCycle={clock} />);
    expect(view.UNSAFE_getAllByType(Image)).toHaveLength(1);
    expect(style(view, 'avatar-atlas-fallback').opacity).toBe(1);
    expect(subscribers.map(item => item.uri)).toEqual(['right-walk.png']);
    expect(Image.prefetch).not.toHaveBeenCalled();
    downloaded('right-walk.png');
    const pending = view.getByTestId('avatar-atlas-pending');
    expect(style(view, 'avatar-atlas-pending').opacity).toBe(0);
    fireEvent(pending, 'load');
    const nativeImage = view.getByTestId('avatar-atlas-visible'), source = nativeImage.props.source, handler = nativeImage.props.onLoad;
    act(() => clock.advance(9));
    expect(style(view, 'avatar-atlas-visible').transform).toEqual([{ translateX: -64 }, { translateY: 0 }]);
    for (let i = 0; i < 32; i++) act(() => clock.advance(9));
    expect(view.getByTestId('avatar-atlas-visible')).toBe(nativeImage);
    expect(nativeImage.props.source).toBe(source);
    expect(nativeImage.props.onLoad).toBe(handler);
    expect(view.UNSAFE_getAllByType(Image)).toHaveLength(2);
    expect(subscribers).toHaveLength(1);
    view.unmount(); expect(subscribers[0].leave).toHaveBeenCalledTimes(1);
  });

  it('preserves the 16 FPS idle cycle, uses only front/back idle and honors reduced motion', () => {
    const element = (facing: AvatarFacing, reduceMotion = false) => <DirectionalAvatar facing={facing} manifest={manifest} motion="idle" reduceMotion={reduceMotion} />;
    const view = render(element('front')); load(view, 'front-idle.png');
    act(() => jest.advanceTimersByTime(63));
    expect(style(view, 'avatar-atlas-visible').transform[0]).toEqual({ translateX: -64 });
    view.rerender(element('frontRight'));
    expect(subscribers).toHaveLength(1);
    view.rerender(element('backLeft')); load(view, 'back-idle.png');
    expect(uri(view.getByTestId('avatar-atlas-visible').props.source)).toBe('file://back-idle.png');
    view.rerender(element('backRight', true));
    act(() => jest.advanceTimersByTime(5000));
    expect(style(view, 'avatar-atlas-visible').transform).toEqual([{ translateX: 0 }, { translateY: 0 }]);
    expect(subscribers).toHaveLength(2);
    view.unmount();
  });

  it('holds the visible sheet during direction loading and ignores abandoned late native events', () => {
    const element = (facing: AvatarFacing) => <DirectionalAvatar facing={facing} manifest={manifest} motion="sprint" />;
    const view = render(element('front')); load(view, 'front-sprint.png');
    view.rerender(element('backLeft')); downloaded('backLeft-sprint.png');
    const stale = view.getByTestId('avatar-atlas-pending').props;
    view.rerender(element('backRight'));
    act(() => { stale.onLoad(); stale.onError(); });
    expect(uri(view.getByTestId('avatar-atlas-visible').props.source)).toBe('file://front-sprint.png');
    load(view, 'backRight-sprint.png');
    act(() => { stale.onLoad(); stale.onError(); });
    expect(uri(view.getByTestId('avatar-atlas-visible').props.source)).toBe('file://backRight-sprint.png');
    expect(view.UNSAFE_getAllByType(Image).length).toBeLessThanOrEqual(3);
    view.unmount();
  });

  it('falls back after decode timeout and never resurrects an abandoned image from its late onLoad', () => {
    const view = render(<DirectionalAvatar facing="front" manifest={manifest} motion="walk" />);
    load(view, 'front-walk.png');
    view.rerender(<DirectionalAvatar facing="back" manifest={manifest} motion="walk" />);
    downloaded('back-walk.png');
    const timedOut = view.getByTestId('avatar-atlas-pending').props;
    act(() => jest.advanceTimersByTime(AVATAR_ATLAS_LOAD_TIMEOUT_MS));
    expect(view.queryByTestId('avatar-atlas-pending')).toBeNull();
    expect(style(view, 'avatar-atlas-fallback').opacity).toBe(1);
    act(() => { timedOut.onLoad(); timedOut.onError(); });
    expect(style(view, 'avatar-atlas-fallback').opacity).toBe(1);
    expect(style(view, 'avatar-atlas-visible').opacity).toBe(0);
    view.unmount();
  });

  it('uses HD when the physical display needs it and can recover from a slow download', () => {
    (PixelRatio.get as jest.Mock).mockReturnValue(3);
    const view = render(<DirectionalAvatar facing="front" manifest={manifest} motion="idle" scale={0.5} />);
    expect(subscribers[0].uri).toBe('front-idle_hd.png');
    act(() => subscribers[0].callback({ status: 'timeout' }));
    expect(style(view, 'avatar-atlas-fallback').opacity).toBe(1);
    load(view, 'front-idle_hd.png');
    expect(style(view, 'avatar-atlas-visible').opacity).toBe(1);
    view.unmount();
    act(() => subscribers[0].callback({ status: 'failed' }));
    expect(subscribers[0].leave).toHaveBeenCalledTimes(1);
  });

  it.each(['walk', 'sprint'] as const)('advances %s crops without rerendering atlas selection or rebuilding animation nodes', motion => {
    const clock = createAvatarWalkCycle();
    // RN's test Animated.Image deliberately renders on value updates. Check that
    // atlas selection stays stable and crop interpolation nodes are reused.
    const atlasRenders = jest.spyOn(avatarAnimation, 'selectAvatarAtlasSource');
    const interpolations = jest.spyOn(Animated.Value.prototype, 'interpolate');
    const view = render(<DirectionalAvatar facing="right" manifest={manifest} motion={motion} walkCycle={clock} />);
    load(view, `right-${motion}.png`);
    const atlasCount = atlasRenders.mock.calls.length, interpolationCount = interpolations.mock.calls.length;
    expect(interpolationCount).toBeGreaterThan(0);
    const source = view.getByTestId('avatar-atlas-visible').props.source;
    const activeSheet = manifest.atlases!.right[motion]!;
    for (let moved = 1; moved <= 144 * 3; moved++) {
      act(() => clock.advance(1));
      const offset = avatarAnimation.getAvatarAtlasOffset(activeSheet, clock.frameIndex(activeSheet.frameCount), 0.5);
      expect(style(view, 'avatar-atlas-visible').transform).toEqual([{ translateX: offset.x || 0 }, { translateY: offset.y || 0 }]);
    }
    expect(atlasRenders).toHaveBeenCalledTimes(atlasCount);
    expect(interpolations).toHaveBeenCalledTimes(interpolationCount);
    expect(view.getByTestId('avatar-atlas-visible').props.source).toBe(source);
    expect(subscribers).toHaveLength(1);
    view.unmount();
  });

  it('keeps the outgoing gait moving and reveals a changed direction/motion at the current distance phase', () => {
    const clock = createAvatarWalkCycle();
    const element = (facing: AvatarFacing, motion: 'walk' | 'sprint') => <DirectionalAvatar facing={facing} manifest={manifest} motion={motion} walkCycle={clock} />;
    const view = render(element('front', 'walk')); load(view, 'front-walk.png');
    act(() => clock.advance(45)); // Walk frame 5, already past the first atlas row.
    const previousPose = style(view, 'avatar-atlas-visible').transform;
    expect(previousPose).toEqual([{ translateX: -64 }, { translateY: -96 }]);
    view.rerender(element('backLeft', 'sprint'));
    expect(style(view, 'avatar-atlas-visible').transform).toEqual(previousPose);
    downloaded('backLeft-sprint.png');
    act(() => clock.advance(27)); // Half a cycle: sprint frame 5, regardless of download delay.
    expect(style(view, 'avatar-atlas-visible').transform).toEqual([{ translateX: 0 }, { translateY: -192 }]);
    fireEvent(view.getByTestId('avatar-atlas-pending'), 'load');
    expect(uri(view.getByTestId('avatar-atlas-visible').props.source)).toBe('file://backLeft-sprint.png');
    expect(style(view, 'avatar-atlas-visible').transform).toEqual([{ translateX: -64 }, { translateY: -96 }]);
    act(() => clock.advance(14.4));
    expect(style(view, 'avatar-atlas-visible').transform).toEqual([{ translateX: -128 }, { translateY: -96 }]);
    view.unmount();
  });

  it('returns to a recently decoded pose without another source request or native load event', () => {
    const clock = createAvatarWalkCycle();
    const element = (motion: 'idle' | 'walk' | 'sprint') => <DirectionalAvatar facing="front" manifest={manifest} motion={motion} walkCycle={clock} />;
    const view = render(element('idle')); load(view, 'front-idle.png');
    const idle = view.getByTestId('avatar-atlas-visible');
    view.rerender(element('walk')); load(view, 'front-walk.png');
    view.rerender(element('sprint')); load(view, 'front-sprint.png');
    const calls = subscribers.length;
    view.rerender(element('idle'));
    expect(view.getByTestId('avatar-atlas-visible')).toBe(idle);
    expect(view.queryByTestId('avatar-atlas-pending')).toBeNull();
    expect(subscribers).toHaveLength(calls);
    view.unmount();
  });

  it('bounds decoded native images while turning through every direction', () => {
    const element = (facing: AvatarFacing) => <DirectionalAvatar facing={facing} manifest={manifest} motion="walk" />;
    const view = render(element('front')); load(view, 'front-walk.png');
    for (const facing of AVATAR_FACINGS.slice(1)) {
      view.rerender(element(facing)); load(view, `${facing}-walk.png`);
      expect(view.getAllByTestId('avatar-atlas-retained').length).toBeLessThanOrEqual(3);
      expect(view.UNSAFE_getAllByType(Image).length).toBeLessThanOrEqual(5);
    }
    view.unmount();
  });

  it('keeps the idle timer off the avatar render path and stops timers/subscriptions when inactive', () => {
    const clock = createAvatarWalkCycle();
    const subscribe = clock.subscribe;
    const leave = jest.fn();
    jest.spyOn(clock, 'subscribe').mockImplementation(listener => {
      const unsubscribe = subscribe(listener);
      return () => { leave(); unsubscribe(); };
    });
    const atlasRenders = jest.spyOn(avatarAnimation, 'selectAvatarAtlasSource');
    const interpolations = jest.spyOn(Animated.Value.prototype, 'interpolate');
    const view = render(<DirectionalAvatar facing="front" manifest={manifest} motion="idle" walkCycle={clock} />);
    load(view, 'front-idle.png');
    const atlasCount = atlasRenders.mock.calls.length, interpolationCount = interpolations.mock.calls.length;
    expect(interpolationCount).toBeGreaterThan(0);
    act(() => jest.advanceTimersByTime(2250));
    expect(style(view, 'avatar-atlas-visible').transform).toEqual([{ translateX: 0 }, { translateY: 0 }]);
    expect(atlasRenders).toHaveBeenCalledTimes(atlasCount);
    expect(interpolations).toHaveBeenCalledTimes(interpolationCount);
    expect(clock.subscribe).not.toHaveBeenCalled();
    view.rerender(<DirectionalAvatar facing="front" manifest={manifest} motion="walk" walkCycle={clock} />);
    load(view, 'front-walk.png');
    expect(clock.subscribe).toHaveBeenCalledTimes(1);
    act(() => clock.advance(36));
    view.rerender(<DirectionalAvatar facing="front" manifest={manifest} motion="walk" walkCycle={clock} reduceMotion />);
    expect(leave).toHaveBeenCalledTimes(1);
    act(() => { clock.advance(36); jest.advanceTimersByTime(5000); });
    expect(style(view, 'avatar-atlas-visible').transform).toEqual([{ translateX: 0 }, { translateY: 0 }]);
    expect(jest.getTimerCount()).toBe(0);
    view.rerender(<DirectionalAvatar facing="front" manifest={manifest} motion="walk" walkCycle={clock} />);
    expect(clock.subscribe).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(leave).toHaveBeenCalledTimes(2);
    act(() => { clock.advance(36); jest.runAllTicks(); });
    expect(jest.getTimerCount()).toBe(0);
  });
});
