import { useEffect, useMemo, useState } from 'react';
import { Image, Platform } from 'react-native';
import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';

import {
  AVATAR_FACINGS,
  AVATAR_MOTIONS,
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
    // React Native Web does not guarantee the native Image prefetch API shape.
    // Browser assets are already cached by the mounted, opacity-switched frames.
    if (Platform.OS === 'web') return undefined;

    const sources = AVATAR_FACINGS.flatMap((manifestFacing) =>
      AVATAR_MOTIONS.flatMap((manifestMotion) => manifest[manifestFacing][manifestMotion]),
    );
    const uris = new Set(
      sources
        .map((source) => Image.resolveAssetSource(source)?.uri)
        .filter((uri): uri is string => Boolean(uri)),
    );
    uris.forEach((uri) => {
      const request = Image.prefetch(uri) as Promise<boolean> | undefined;
      void request?.catch(() => undefined);
    });

    return undefined;
  }, [manifest]);

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

  const layers = useMemo(() => {
    const activeIndex = reduceMotion || frameCount === 0 ? 0 : frameIndex % frameCount;
    return AVATAR_FACINGS.flatMap((layerFacing) =>
      AVATAR_MOTIONS.flatMap((layerMotion) => {
        const requestedFrames = manifest[layerFacing][layerMotion];
        const frames = requestedFrames.length > 0 ? requestedFrames : manifest.front[layerMotion];
        return frames.map((source: ImageSourcePropType, index) => ({
          id: `${layerFacing}-${layerMotion}-${index}`,
          opacity:
            layerFacing === facing && layerMotion === motion && index === activeIndex ? 1 : 0,
          slot: 'bodySkin' as const,
          source,
        }));
      }),
    );
  }, [facing, frameCount, frameIndex, manifest, motion, reduceMotion]);

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
