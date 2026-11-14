import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import { Animated, Image, PixelRatio, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';

import {
  AVATAR_FACINGS,
  getAvatarAtlasOffset,
  resolveAvatarAtlas,
  resolveAvatarFrames,
  selectAvatarAtlasSource,
  type AvatarAtlasSheet,
  type AvatarAnimationManifest,
  type AvatarFacing,
  type AvatarMotion,
  type AvatarWalkCycle,
} from '../../game/avatarAnimation';
import { avatarAtlasCache, AVATAR_ATLAS_LOAD_TIMEOUT_MS } from '../../game/avatarAtlasCache';
import { ModularCharacter, MODULAR_CHARACTER_CANVAS } from './ModularCharacter';

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

export function DirectionalAvatar(props: DirectionalAvatarProps) {
  const sheet = resolveAvatarAtlas(props.manifest, props.facing, props.motion);
  return sheet ? <AtlasDirectionalAvatar {...props} sheet={sheet} /> : <BufferedDirectionalAvatar {...props} />;
}

type AtlasLayer = { key: string; settled: boolean; sheet: AvatarAtlasSheet; motion: AvatarMotion; source: ImageSourcePropType; onLoad: () => void; onError: () => void };
type AtlasLayers = { visible: AtlasLayer | null; pending: AtlasLayer | null; retained: AtlasLayer[] };
const RETAINED_ATLAS_LIMIT = 3;
function showAtlasLayer(current: AtlasLayers, incoming: AtlasLayer): AtlasLayers {
  const retained = [...current.retained, ...(current.visible ? [current.visible] : [])]
    .filter(layer => layer.key !== incoming.key).slice(-RETAINED_ATLAS_LIMIT);
  return { visible: incoming, pending: null, retained };
}

function AtlasSprite({ layer, current, visible, hidden, motion, walkCycle, reduceMotion, scale }: {
  layer: AtlasLayer; current: boolean; visible: boolean; hidden: boolean; motion: AvatarMotion;
  walkCycle?: AvatarWalkCycle; reduceMotion: boolean; scale: number;
}) {
  const initialFrame = !reduceMotion && motion !== 'idle' && walkCycle ? walkCycle.frameIndex(layer.sheet.frameCount) : 0;
  const frame = useRef(initialFrame);
  const [animatedFrame] = useState(() => new Animated.Value(initialFrame));
  const transform = useMemo(() => {
    // One frame value drives both axes in a single AnimatedProps update. ValueXY
    // flushes X and Y separately, briefly selecting the wrong cell at row changes.
    const inputRange = Array.from({ length: Math.max(2, layer.sheet.frameCount) }, (_, index) => index);
    const offsets = inputRange.map(index => getAvatarAtlasOffset(layer.sheet, index, scale));
    return [
      { translateX: animatedFrame.interpolate({ inputRange, outputRange: offsets.map(offset => offset.x || 0), extrapolate: 'clamp' }) },
      { translateY: animatedFrame.interpolate({ inputRange, outputRange: offsets.map(offset => offset.y || 0), extrapolate: 'clamp' }) },
    ];
  }, [animatedFrame, layer.sheet, scale]);
  const updateFrame = useCallback((index: number) => {
    frame.current = index;
    animatedFrame.setValue(index);
  }, [animatedFrame]);
  const latest = useRef({ current, motion, walkCycle, reduceMotion, updateFrame });
  latest.current = { current, motion, walkCycle, reduceMotion, updateFrame };
  const onLoad = useCallback(() => {
    const active = latest.current;
    // Position the incoming sheet before revealing it, even if decoding took several steps.
    if (!layer.settled && active.current) active.updateFrame(!active.reduceMotion && active.motion !== 'idle' && active.walkCycle
      ? active.walkCycle.frameIndex(layer.sheet.frameCount) : 0);
    layer.onLoad();
  }, [layer]);

  useLayoutEffect(() => {
    // Continue the outgoing gait until its replacement is decoded. Freezing it made
    // even a short local decode look like a stalled animation during every turn.
    if (!visible || hidden) { updateFrame(frame.current); return; }
    if (reduceMotion || layer.sheet.frameCount <= 1) { updateFrame(0); return; }
    if (motion !== 'idle' && walkCycle) {
      updateFrame(walkCycle.frameIndex(layer.sheet.frameCount));
      // The movement clock updates this crop in the same tick as actor/camera positions.
      // No React state/render is needed for each gait frame. This remains JS-driven Animated.
      return walkCycle.subscribe(() => {
        const next = walkCycle.frameIndex(layer.sheet.frameCount);
        if (next !== frame.current) updateFrame(next);
      });
    }
    updateFrame(0);
    const timer = setInterval(() => updateFrame((frame.current + 1) % layer.sheet.frameCount), FRAME_INTERVAL_MS[motion]);
    return () => clearInterval(timer);
  }, [visible, hidden, layer.sheet.frameCount, motion, walkCycle, reduceMotion, updateFrame]);

  return <Animated.Image accessibilityIgnoresInvertColors testID={visible ? 'avatar-atlas-visible' : current && !layer.settled ? 'avatar-atlas-pending' : 'avatar-atlas-retained'}
    source={layer.source} resizeMode="stretch" fadeDuration={0} onLoad={onLoad} onError={layer.onError}
    style={{ position: 'absolute', left: 0, top: 0,
      width: layer.sheet.columns * MODULAR_CHARACTER_CANVAS.width * scale,
      height: layer.sheet.rows * MODULAR_CHARACTER_CANVAS.height * scale,
      opacity: visible && !hidden ? 1 : 0, transform }} />;
}

function AtlasDirectionalAvatar({
  accessibilityLabel, facing, manifest, motion, walkCycle, sheet, reduceMotion = false, scale = 0.5, showShadow = true, style, testID,
}: DirectionalAvatarProps & { sheet: AvatarAtlasSheet }) {
  const source = selectAvatarAtlasSource(sheet, scale, PixelRatio.get());
  const key = JSON.stringify(source);
  const latestKey = useRef(key); latestKey.current = key;
  const [layers, setLayers] = useState<AtlasLayers>({ visible: null, pending: null, retained: [] });
  const latestLayers = useRef(layers); latestLayers.current = layers;
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useLayoutEffect(() => {
    // Reuse the same decoded native Image on common idle/walk/sprint switches.
    setLayers(current => {
      const resident = current.retained.find(layer => layer.key === key);
      return resident ? showAtlasLayer(current, resident) : current;
    });
  }, [key]);

  useEffect(() => {
    let active = true;
    setFailedKey(null);
    if (latestLayers.current.visible?.key === key || latestLayers.current.retained.some(layer => layer.key === key)) return;
    // A downloaded atlas is shared by every map, and no individual frame is prefetched.
    const unsubscribe = avatarAtlasCache.subscribe(source, result => {
      if (!active || latestKey.current !== key) return;
      if (result.status !== 'ready') { setFailedKey(key); return; }
      setFailedKey(null);
      const next: AtlasLayer = {
        key, settled: false, sheet, motion, source: result.source,
        onLoad: () => {
          if (!active || latestKey.current !== key || next.settled) return;
          next.settled = true;
          setFailedKey(null);
          setLayers(current => current.pending === next ? showAtlasLayer(current, next) : current);
        },
        onError: () => {
          if (!active || latestKey.current !== key || next.settled) return;
          next.settled = true;
          setFailedKey(key);
          setLayers(current => current.pending === next ? { ...current, pending: null } : current);
        },
      };
      setLayers(current => current.visible?.key === key ? current : { ...current, pending: next });
    });
    // Each callback additionally checks latestKey: late image events cannot replace a new direction.
    return () => { active = false; unsubscribe(); };
  }, [key, sheet, source]);

  useEffect(() => {
    if (!layers.pending) return;
    const pending = layers.pending;
    const timer = setTimeout(() => {
      pending.settled = true;
      setLayers(current => current.pending === pending ? { ...current, pending: null } : current);
      if (latestKey.current === pending.key) setFailedKey(pending.key);
    }, AVATAR_ATLAS_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [layers.pending]);

  useEffect(() => {
    if (!manifest.preloadAdjacentMotions || layers.visible?.key !== key) return;
    const direction = manifest.atlases?.[facing];
    const nextSheet = motion === 'idle' ? direction?.walk : motion === 'walk' ? direction?.sprint : direction?.walk;
    if (!nextSheet) return;
    const nextSource = selectAvatarAtlasSource(nextSheet, scale, PixelRatio.get());
    if (JSON.stringify(nextSource) === key) return;
    let leave: (() => void) | undefined;
    const timer = setTimeout(() => {
      leave = avatarAtlasCache.subscribe(nextSource, result => {
        if (result.status !== 'ready') return;
        const uri = assetUri(result.source);
        if (uri) void Image.prefetch(uri).catch(() => {});
      }, 'background');
    }, 500);
    return () => { clearTimeout(timer); leave?.(); };
  }, [manifest, facing, motion, scale, key, layers.visible?.key]);

  const width = MODULAR_CHARACTER_CANVAS.width * scale, height = MODULAR_CHARACTER_CANVAS.height * scale;
  const showAtlas = layers.visible !== null && failedKey !== key;
  const fallback = manifest[facing].idle[0] ?? manifest.front.idle[0];
  return <View accessibilityLabel={accessibilityLabel} accessibilityRole={accessibilityLabel ? 'image' : undefined}
    accessible={Boolean(accessibilityLabel)} pointerEvents="none" testID={testID}
    style={[atlasStyles.root, { width, height }, style]}>
    {showShadow ? <View style={[atlasStyles.shadow, { bottom: Math.max(1, 2 * scale), height: Math.max(6, 24 * scale), width: width * 0.68 }]} /> : null}
    <View style={{ width, height, overflow: 'hidden' }}>
      <Image testID="avatar-atlas-fallback" source={fallback} resizeMode="contain" fadeDuration={0}
        style={{ width, height, opacity: showAtlas ? 0 : 1, position: 'absolute', left: 0, top: 0 }} />
      {[...layers.retained, layers.visible, layers.pending].filter((layer): layer is AtlasLayer => Boolean(layer)).map(layer =>
        <AtlasSprite key={layer.key} layer={layer} current={layer.key === key}
          visible={layer === layers.visible} hidden={!showAtlas} motion={layer.key === key ? motion : layer.motion} walkCycle={walkCycle} reduceMotion={reduceMotion} scale={scale} />)}
    </View>
  </View>;
}

const atlasStyles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'flex-end', position: 'relative' },
  shadow: { backgroundColor: 'rgba(53,72,90,0.16)', borderRadius: 999, position: 'absolute' },
});

function BufferedDirectionalAvatar({
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
