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

export function screenPointToWorld(
  localPoint: Point,
  playerPoint: Point,
  viewport: ViewportSize,
  zoom: number,
): Point {
  const safeZoom = clampWorldZoom(zoom);
  return {
    x: playerPoint.x + (localPoint.x - viewport.width / 2) / safeZoom,
    y: playerPoint.y + (localPoint.y - viewport.height / 2) / safeZoom,
  };
}
