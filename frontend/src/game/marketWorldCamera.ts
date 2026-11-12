import { getMarketHudOcclusionRect } from './marketHudLayout';
import type { ReplayPresentation } from './marketReplayPerception';
import type { Point } from './prototypeWorld';
import { getWorldCameraFrame, type ViewportSize } from './worldZoom';

/**
 * Compact phone windows reserve the shopping note's upper band when composing
 * the market. The avatar's focus is the centre of the remaining visible area;
 * the real HUD mask, world bounds, and player coordinates remain unchanged.
 * Larger windows retain their existing camera composition.
 */
export function getMarketWorldCameraFrame(
  playerPoint: Point,
  presentation: ReplayPresentation,
  bounds: ViewportSize,
) {
  const { viewport, zoom } = presentation;
  // A 390x600 viewport has the same short world area as narrower phones. Leaving
  // it player-centred hides the northward return passages under the note even
  // though the southward entry was visible. Keep app and replay composition equal.
  if (viewport.width <= 0 || viewport.height <= 0 || viewport.width > 390 || viewport.height > 640)
    return getWorldCameraFrame(playerPoint, viewport, zoom, bounds);

  const hud = getMarketHudOcclusionRect(presentation);
  const visibleBottom = Math.max(0, viewport.height - 12);
  // Extremely large accessibility text can cover the remaining world. Keep the
  // focus inside the viewport even then; this does not make covered cues visible.
  const focusY = Math.max(viewport.height / 2,
    Math.min(visibleBottom, (hud.bottom + visibleBottom) / 2));
  const frame = getWorldCameraFrame({ x: playerPoint.x,
    y: playerPoint.y - (focusY - viewport.height / 2) / zoom }, viewport, zoom, bounds);
  return { ...frame, playerOffset: { x: playerPoint.x - frame.center.x, y: playerPoint.y - frame.center.y } };
}
