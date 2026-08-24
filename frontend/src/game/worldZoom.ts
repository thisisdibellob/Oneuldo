import type { Point } from './prototypeWorld';

export const WORLD_ZOOM_MIN = 1;
export const WORLD_ZOOM_MAX = 2;
export const WORLD_ZOOM_WHEEL_FACTOR = 0.0015;

export type ViewportSize = Readonly<{ height: number; width: number }>;

export function clampWorldZoom(value: number): number {
  return Math.max(WORLD_ZOOM_MIN, Math.min(value, WORLD_ZOOM_MAX));
}

export function zoomFromWheel(targetZoom: number, deltaPixels: number): number {
  return clampWorldZoom(targetZoom * Math.exp(-deltaPixels * WORLD_ZOOM_WHEEL_FACTOR));
}

export function zoomFromPinch(
  startZoom: number,
  startDistance: number,
  currentDistance: number,
): number {
  if (startDistance <= 0 || currentDistance <= 0) return clampWorldZoom(startZoom);
  return clampWorldZoom(startZoom * (currentDistance / startDistance));
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
