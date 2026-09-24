import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import { Image } from 'react-native';
import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';

import {
  AVATAR_FACINGS,
  resolveAvatarFrames,
  type AvatarAnimationManifest,
  type AvatarFacing,
  type AvatarMotion,
  type AvatarWalkCycle,
} from '../../game/avatarAnimation';
import { ModularCharacter } from './ModularCharacter';

const FRAME_INTERVAL_MS: Readonly<Record<AvatarMotion, number>> = {
  idle: 62.5, // 36 breathing frames form a 2.25-second cycle (16 FPS).
  walk: 96,
  sprint: 96, // Timer fallback only; player locomotion follows its distance clock.
};

type DirectionalAvatarProps = {
  accessibilityLabel?: string;
  facing: AvatarFacing;
  manifest: AvatarAnimationManifest;
  motion: AvatarMotion;
  walkCycle?: AvatarWalkCycle;
  reduceMotion?: boolean;
  scale?: number;
  showShadow?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

type SpriteTarget = { source: ImageSourcePropType; key: string; context: string };
type BufferedSprite = SpriteTarget & {
  id: number;
  loaded: boolean;
  onLoad: () => void;
  onError: () => void;
};
type SpriteBuffers = {
  visible: BufferedSprite;
  staging: BufferedSprite | null;
  failedKey: string | null;
};

function assetUri(source: ImageSourcePropType): string | undefined {
  // React Native Web does not expose Image.resolveAssetSource.
  if (typeof source === 'number') {
    try { return Asset.fromModule(source).uri; } catch { return undefined; }
  }
  return (Array.isArray(source) ? source[0] : source)?.uri;
}

export function DirectionalAvatar({
  accessibilityLabel,
  facing,
  manifest,
  motion,
  walkCycle,
  reduceMotion = false,
  scale = 0.5,
  showShadow = true,
  style,
  testID,
}: DirectionalAvatarProps) {
  const [animationFrame, setAnimationFrame] = useState({ motion, index: 0 });
  const frameSet = resolveAvatarFrames(manifest, facing, motion);
  const frameCount = frameSet.length;
  const frameIndex = reduceMotion
    ? 0
    : motion !== 'idle' && walkCycle ? walkCycle.frameIndex(frameCount)
      : animationFrame.motion === motion ? animationFrame.index : 0;
  const source = frameSet[frameCount ? frameIndex % frameCount : 0];
  const target: SpriteTarget = {
    source,
    key: JSON.stringify(source),
    context: `${facing}:${motion}:${reduceMotion ? 'still' : 'moving'}`,
  };
  const targetRef = useRef(target);
  targetRef.current = target;
  const nextId = useRef(0);
  const settleRef = useRef<(id: number, loaded: boolean) => void>(() => undefined);
  const createBuffer = useCallback((next: SpriteTarget): BufferedSprite => {
    const id = ++nextId.current;
    return {
      ...next, id, loaded: false,
      // Keep handler identities stable. RN Web restarts its request if these change.
      onLoad: () => settleRef.current(id, true),
      onError: () => settleRef.current(id, false),
    };
  }, []);
  const [buffers, setBuffers] = useState<SpriteBuffers>(() => ({
    visible: createBuffer(target), staging: null, failedKey: null,
  }));

  settleRef.current = (id, loaded) => {
    setBuffers(current => {
      if (current.visible.id === id) {
        return loaded && !current.visible.loaded
          ? { ...current, visible: { ...current.visible, loaded: true } } : current;
      }
      const pending = current.staging;
      // Requests for replaced/unmounted buffers cannot overwrite a newer pose.
      if (!pending || pending.id !== id || pending.loaded) return current;
      if (!loaded) return { ...current, staging: null, failedKey: pending.key };
      const ready = { ...pending, loaded: true };
      const latest = targetRef.current;
      if (latest.key !== current.visible.key &&
          (latest.key === ready.key || latest.context === ready.context)) {
        return { visible: ready, staging: current.visible, failedKey: null };
      }
      return { ...current, staging: ready };
    });
  };

  useEffect(() => {
    setBuffers(current => {
      const latest = targetRef.current;
      if (latest.key === current.visible.key) {
        return current.failedKey ? { ...current, failedKey: null } : current;
      }
      const pending = current.staging;
      if (pending?.key === latest.key) {
        return pending.loaded
          ? { visible: pending, staging: current.visible, failedKey: null } : current;
      }
      // Let an in-flight animation frame finish, then consume the latest phase.
      // Replacing it on every movement tick would starve loading on slow devices.
      if (pending && !pending.loaded && pending.context === latest.context) return current;
      if (current.failedKey === latest.key) return current;
      return { ...current, staging: createBuffer(latest), failedKey: null };
    });
  }, [target.key, target.context, buffers, createBuffer]);

  const prefetched = useRef(new Set<string>());
  const idleSources = useMemo(() => AVATAR_FACINGS.map(direction =>
    manifest[direction].idle[0] ?? manifest.front.idle[0]), [manifest]);
  useEffect(() => {
    // Warm only the first idle pose per direction and the active animation, on both
    // platforms. Prefetch completion never replaces the visible Image's onLoad.
    const activeSources = !reduceMotion ? frameSet : [frameSet[0]];
    [...idleSources, ...activeSources].forEach(item => {
      if (!item) return;
      const uri = assetUri(item);
      if (!uri || prefetched.current.has(uri)) return;
      prefetched.current.add(uri);
      try {
        const request = Image.prefetch(uri) as Promise<boolean> | undefined;
        void request?.catch(() => { prefetched.current.delete(uri); });
      } catch { prefetched.current.delete(uri); }
    });
  }, [frameSet, idleSources, motion, reduceMotion]);

  useEffect(() => {
    if (reduceMotion || frameCount <= 1) {
      setAnimationFrame({ motion, index: 0 });
      return undefined;
    }
    if (motion !== 'idle' && walkCycle) {
      let lastFrame = walkCycle.frameIndex(frameCount);
      setAnimationFrame({ motion, index: lastFrame });
      return walkCycle.subscribe(() => {
        const nextFrame = walkCycle.frameIndex(frameCount);
        if (nextFrame !== lastFrame) {
          lastFrame = nextFrame;
          setAnimationFrame({ motion, index: nextFrame });
        }
      });
    }
    setAnimationFrame({ motion, index: 0 });
    const timer = setInterval(() => {
      setAnimationFrame(current => ({
        motion,
        index: ((current.motion === motion ? current.index : 0) + 1) % frameCount,
      }));
    }, FRAME_INTERVAL_MS[motion]);
    return () => clearInterval(timer);
  }, [frameCount, motion, reduceMotion, walkCycle]);

  const layers = [buffers.visible, buffers.staging].filter((frame): frame is BufferedSprite => Boolean(frame))
    .map(frame => ({
      id: `avatar-buffer-${frame.id}`,
      slot: 'bodySkin' as const,
      source: frame.source,
      opacity: frame.id === buffers.visible.id ? 1 : 0,
      onLoad: frame.onLoad,
      onError: frame.onError,
      fadeDuration: 0,
    }));

  return (
    <ModularCharacter
      accessibilityLabel={accessibilityLabel}
      layers={layers}
      scale={scale}
      showShadow={showShadow}
      style={style}
      testID={testID}
    />
  );
}
