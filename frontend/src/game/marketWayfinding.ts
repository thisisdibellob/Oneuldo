import type { MarketEnvironment } from './marketEnvironment';
import type { Point } from './prototypeWorld';

export type MarketViewFrame = { width: number; height: number; zoom: number; center: Point };
export const MARKET_CONSTRUCTION_NOTICE = '공사 중입니다. 출구가 아닌 측면 통로를 이용해주세요.';

/** The arrow orbits the body, while its direction comes from player→goal. */
export function getMarketPlayerGuidePose(frame: MarketViewFrame, player: Point, target: Point) {
  const dx = target.x - player.x, dy = target.y - player.y, length = Math.hypot(dx, dy);
  const ux = length > .01 ? dx / length : 0, uy = length > .01 ? dy / length : -1;
  const body = { x: frame.width / 2 + (player.x - frame.center.x) * frame.zoom,
    y: frame.height / 2 + (player.y - frame.center.y - 43) * frame.zoom };
  return {
    x: Math.max(20, Math.min(frame.width - 20, body.x + ux * Math.min(110, 32 * frame.zoom + 24))),
    y: Math.max(20, Math.min(frame.height - 20, body.y + uy * Math.min(130, 43 * frame.zoom + 24))),
    // Ionicons' filled navigate glyph points northeast before rotation.
    rotation: Math.atan2(uy, ux) * 180 / Math.PI + 45,
  };
}
export function isNearMarketConstruction(environment: MarketEnvironment, point: Point, alreadyNear = false) {
  return (environment.constructionZones ?? []).some(({ rect }) => {
    const dx = Math.max(rect.x - point.x, 0, point.x - rect.x - rect.width);
    const dy = Math.max(rect.y - point.y, 0, point.y - rect.y - rect.height);
    return Math.hypot(dx, dy) <= (alreadyNear ? 130 : 100);
  });
}
