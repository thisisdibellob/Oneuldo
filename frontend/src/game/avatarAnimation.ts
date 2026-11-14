import type { ImageSourcePropType } from 'react-native';

export const AVATAR_FACINGS = [
  'front',
  'frontLeft',
  'left',
  'backLeft',
  'back',
  'backRight',
  'right',
  'frontRight',
] as const;
export const AVATAR_MOTIONS = ['idle', 'walk', 'sprint'] as const;

export type AvatarFacing = (typeof AVATAR_FACINGS)[number];
export type AvatarMotion = (typeof AVATAR_MOTIONS)[number];

export type AvatarFrameSet = Readonly<{
  idle: readonly ImageSourcePropType[];
  walk: readonly ImageSourcePropType[];
  sprint?: readonly ImageSourcePropType[];
}>;
export type AvatarAtlasSheet = Readonly<{
  id: string;
  source: ImageSourcePropType;
  highResolutionSource?: ImageSourcePropType;
  columns: number;
  rows: number;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
}>;
export type AvatarAtlasManifest = Readonly<Record<AvatarFacing, Readonly<{
  idle: AvatarAtlasSheet;
  walk: AvatarAtlasSheet;
  sprint?: AvatarAtlasSheet;
}>>>;
export type AvatarAnimationManifest = Readonly<Record<AvatarFacing, AvatarFrameSet>> & Readonly<{
  /** Packed animations keep a single native Image source stable through the entire cycle. */
  atlases?: AvatarAtlasManifest;
  /** Warm only the likely next motion, with lower priority than visible artwork. */
  preloadAdjacentMotions?: boolean;
}>;

export function resolveAvatarAtlas(manifest: AvatarAnimationManifest, facing: AvatarFacing, motion: AvatarMotion): AvatarAtlasSheet | undefined {
  const direction = manifest.atlases?.[facing];
  if (!direction) return undefined;
  return motion === 'sprint' ? direction.sprint ?? direction.walk : direction[motion];
}

/** Request only the density needed for the sprite's actual on-screen pixel size. */
export function selectAvatarAtlasSource(sheet: AvatarAtlasSheet, scale: number, pixelRatio: number): ImageSourcePropType {
  return scale * pixelRatio > 1 && sheet.highResolutionSource ? sheet.highResolutionSource : sheet.source;
}

export function getAvatarAtlasOffset(sheet: AvatarAtlasSheet, frameIndex: number, scale: number) {
  const index = ((Math.trunc(frameIndex) % sheet.frameCount) + sheet.frameCount) % sheet.frameCount;
  return { x: -(index % sheet.columns) * sheet.frameWidth * scale, y: -Math.floor(index / sheet.columns) * sheet.frameHeight * scale };
}

// World distance covered by one complete left/right gait cycle. Keeping this
// independent of elapsed time makes slow joystick motion and running stay in step.
export const AVATAR_WALK_CYCLE_DISTANCE = 144;

export type AvatarWalkCycle = {
  advance: (distance: number) => void;
  frameIndex: (frameCount: number) => number;
  subscribe: (listener: () => void) => () => void;
};

export function createAvatarWalkCycle(cycleDistance = AVATAR_WALK_CYCLE_DISTANCE): AvatarWalkCycle {
  if (!Number.isFinite(cycleDistance) || cycleDistance <= 0) {
    throw new Error('Avatar gait cycle distance must be positive');
  }
  let distance = 0;
  const listeners = new Set<() => void>();
  return {
    advance(moved) {
      if (!Number.isFinite(moved) || moved <= 0) return;
      distance = (distance + moved) % cycleDistance;
      listeners.forEach(listener => listener());
    },
    frameIndex(frameCount) {
      return frameCount > 0 ? Math.min(frameCount - 1, Math.floor(distance / cycleDistance * frameCount)) : 0;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/** Measure the resolved collision movement, including sliding along a wall. */
export function getAvatarMovement(
  previous: { x: number; y: number },
  next: { x: number; y: number },
  previousFacing: AvatarFacing,
  movingMotion: Exclude<AvatarMotion, 'idle'> = 'walk',
): { distance: number; facing: AvatarFacing; motion: AvatarMotion } {
  const dx = next.x - previous.x, dy = next.y - previous.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < 0.001) {
    return { distance: 0, facing: previousFacing, motion: 'idle' };
  }
  return { distance, facing: facingFromVector(dx / distance, dy / distance, previousFacing), motion: movingMotion };
}

const DIRECTION_DEAD_ZONE = 0.04;
const DIRECTION_SECTOR_DEGREES = 45;
const DIRECTION_HYSTERESIS_DEGREES = 7.5;

const FACINGS_BY_CLOCKWISE_ANGLE: readonly AvatarFacing[] = [
  'right',
  'frontRight',
  'front',
  'frontLeft',
  'left',
  'backLeft',
  'back',
  'backRight',
];

const FACING_ANGLE_DEGREES: Readonly<Record<AvatarFacing, number>> = {
  back: 270,
  backLeft: 225,
  backRight: 315,
  front: 90,
  frontLeft: 135,
  frontRight: 45,
  left: 180,
  right: 0,
};

function normalizedDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function angularDistanceDegrees(a: number, b: number): number {
  const distance = Math.abs(normalizedDegrees(a) - normalizedDegrees(b));
  return Math.min(distance, 360 - distance);
}

export function facingFromVector(
  x: number,
  y: number,
  previous: AvatarFacing = 'front',
): AvatarFacing {
  if (Math.hypot(x, y) < DIRECTION_DEAD_ZONE) return previous;

  const angle = normalizedDegrees((Math.atan2(y, x) * 180) / Math.PI);
  const previousAngle = FACING_ANGLE_DEGREES[previous];
  const retentionAngle = DIRECTION_SECTOR_DEGREES / 2 + DIRECTION_HYSTERESIS_DEGREES;
  if (angularDistanceDegrees(angle, previousAngle) <= retentionAngle) return previous;

  const sector =
    Math.floor(
      normalizedDegrees(angle + DIRECTION_SECTOR_DEGREES / 2) /
        DIRECTION_SECTOR_DEGREES,
    ) % FACINGS_BY_CLOCKWISE_ANGLE.length;
  return FACINGS_BY_CLOCKWISE_ANGLE[sector];
}

/** Older manifests without sprint artwork retain their directional walk frames. */
export function resolveAvatarFrames(
  manifest: AvatarAnimationManifest,
  facing: AvatarFacing,
  motion: AvatarMotion,
): readonly ImageSourcePropType[] {
  const framesFor = (frames: AvatarFrameSet) => motion === 'sprint'
    ? (frames.sprint?.length ? frames.sprint : frames.walk)
    : frames[motion];
  const requested = framesFor(manifest[facing]);
  return requested.length ? requested : framesFor(manifest.front);
}

export function resolveAvatarFrame(
  manifest: AvatarAnimationManifest,
  facing: AvatarFacing,
  motion: AvatarMotion,
  frameIndex: number,
): ImageSourcePropType {
  const frames = resolveAvatarFrames(manifest, facing, motion);

  if (frames.length === 0) {
    throw new Error(`Avatar manifest has no ${motion} frames for ${facing} or front`);
  }

  const safeIndex = ((Math.trunc(frameIndex) % frames.length) + frames.length) % frames.length;
  return frames[safeIndex];
}
