import { useEffect, useMemo, useState } from 'react';
import { Image, Platform } from 'react-native';
import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';

import {
  type AvatarAnimationManifest,
  type AvatarFacing,
  type AvatarMotion,
} from '../../game/avatarAnimation';
import { ModularCharacter } from './ModularCharacter';

const FRAME_INTERVAL_MS: Readonly<Record<AvatarMotion, number>> = {
  idle: 720,
  walk: 96,
};

type DirectionalAvatarProps = {
  accessibilityLabel?: string;
  facing: AvatarFacing;
  manifest: AvatarAnimationManifest;
  motion: AvatarMotion;
  reduceMotion?: boolean;
  scale?: number;
  showShadow?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function DirectionalAvatar({
  accessibilityLabel,
  facing,
  manifest,
  motion,
  reduceMotion = false,
  scale = 0.5,
  showShadow = true,
  style,
  testID,
}: DirectionalAvatarProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const frameSet = manifest[facing][motion].length
    ? manifest[facing][motion]
    : manifest.front[motion];
  const frameCount = frameSet.length;

  useEffect(() => {
    // Mounting the active set warms the web image cache. Native prefetch is
    // limited to this same set instead of competing for all 80 animation frames.
    if (Platform.OS === 'web') return undefined;

    const uris = new Set(
      frameSet
        .map((source) => Image.resolveAssetSource(source)?.uri)
        .filter((uri): uri is string => Boolean(uri)),
    );
    uris.forEach((uri) => {
      const request = Image.prefetch(uri) as Promise<boolean> | undefined;
      void request?.catch(() => undefined);
    });

    return undefined;
  }, [frameSet]);

  useEffect(() => {
    setFrameIndex(0);
  }, [motion]);

  useEffect(() => {
    if (reduceMotion || frameCount <= 1) return undefined;
    const timer = setInterval(() => {
      setFrameIndex((current) => (current + 1) % frameCount);
    }, FRAME_INTERVAL_MS[motion]);
    return () => clearInterval(timer);
  }, [frameCount, motion, reduceMotion]);

  // Keep all frames of the current animation mounted for opacity swaps, but
  // leave other directions/motions out of the initial render and request burst.
  const frameLayers = useMemo(() => frameSet.map((source: ImageSourcePropType, index) => ({
    id: `${facing}-${motion}-${index}`,
    slot: 'bodySkin' as const,
    source,
  })), [facing, frameSet, motion]);

  const layers = useMemo(() => {
    const activeIndex = reduceMotion || frameCount === 0 ? 0 : frameIndex % frameCount;
    return frameLayers.map((layer, index) => ({
      ...layer,
      opacity: index === activeIndex ? 1 : 0,
    }));
  }, [frameCount, frameIndex, frameLayers, reduceMotion]);

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
