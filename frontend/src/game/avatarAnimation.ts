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
export const AVATAR_MOTIONS = ['idle', 'walk'] as const;

export type AvatarFacing = (typeof AVATAR_FACINGS)[number];
export type AvatarMotion = (typeof AVATAR_MOTIONS)[number];

export type AvatarFrameSet = Readonly<Record<AvatarMotion, readonly ImageSourcePropType[]>>;
export type AvatarAnimationManifest = Readonly<Record<AvatarFacing, AvatarFrameSet>>;

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

export function resolveAvatarFrame(
  manifest: AvatarAnimationManifest,
  facing: AvatarFacing,
  motion: AvatarMotion,
  frameIndex: number,
): ImageSourcePropType {
  const requestedFrames = manifest[facing][motion];
  const fallbackFrames = manifest.front[motion];
  const frames = requestedFrames.length > 0 ? requestedFrames : fallbackFrames;

  if (frames.length === 0) {
    throw new Error(`Avatar manifest has no ${motion} frames for ${facing} or front`);
  }

  const safeIndex = ((Math.trunc(frameIndex) % frames.length) + frames.length) % frames.length;
  return frames[safeIndex];
}
