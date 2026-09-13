import type { Point } from './prototypeWorld';

export const WORLD_ZOOM_MIN = 1;
export const WORLD_ZOOM_MAX = 2;
export const MARKET_DEFAULT_ZOOM = 1.3;
export const WORLD_ZOOM_WHEEL_FACTOR = 0.0015;

export type ViewportSize = Readonly<{ height: number; width: number }>;

export function clampWorldZoom(value: number, minimum = WORLD_ZOOM_MIN): number {
  return Math.max(minimum, Math.min(value, WORLD_ZOOM_MAX));
}

export function zoomFromWheel(targetZoom: number, deltaPixels: number, minimum = WORLD_ZOOM_MIN): number {
  return clampWorldZoom(targetZoom * Math.exp(-deltaPixels * WORLD_ZOOM_WHEEL_FACTOR), minimum);
}

export function zoomFromPinch(
  startZoom: number,
  startDistance: number,
  currentDistance: number,
  minimum = WORLD_ZOOM_MIN,
): number {
  if (startDistance <= 0 || currentDistance <= 0) return clampWorldZoom(startZoom, minimum);
  return clampWorldZoom(startZoom * (currentDistance / startDistance), minimum);
}

/** The translation is applied inside a viewport-centred zoom layer. If bounds
 * are omitted, the existing village/home player-centred camera is unchanged.
 * A clamped camera lets the player move away from the centre near world edges;
 * use the same centre for picking and playerOffset for the separate avatar layer.
 */
export function getWorldCameraFrame(
  playerPoint: Point,
  viewport: ViewportSize,
  zoom: number,
  bounds?: ViewportSize,
) {
  const safeZoom = clampWorldZoom(zoom);
  const clampAxis = (point: number, viewportExtent: number, worldExtent: number) => {
    const halfView = Math.max(0, viewportExtent) / safeZoom / 2;
    return worldExtent <= halfView * 2
      ? worldExtent / 2
      : Math.max(halfView, Math.min(point, worldExtent - halfView));
  };
  const center = bounds ? {
    x: clampAxis(playerPoint.x, viewport.width, bounds.width),
    y: clampAxis(playerPoint.y, viewport.height, bounds.height),
  } : { ...playerPoint };
  return {
    center,
    translation: { x: viewport.width / 2 - center.x, y: viewport.height / 2 - center.y },
    playerOffset: { x: playerPoint.x - center.x, y: playerPoint.y - center.y },
  };
}

export function screenPointToWorld(
  localPoint: Point,
  cameraCenter: Point,
  viewport: ViewportSize,
  zoom: number,
): Point {
  const safeZoom = clampWorldZoom(zoom);
  return {
    x: cameraCenter.x + (localPoint.x - viewport.width / 2) / safeZoom,
    y: cameraCenter.y + (localPoint.y - viewport.height / 2) / safeZoom,
  };
}
