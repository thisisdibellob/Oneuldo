import { getMarketPersonAppearance, type MarketPersonAppearanceId, type MarketPersonKind } from './marketPeople';
import type { Point, Rect } from './prototypeWorld';

// The SD player stands about 86 world px tall with a wider head and body.
// Give the slimmer adult NPC art 104 world px of height to balance its presence.
// NPC images have 504 opaque rows on a 256 x 512 canvas (8 clear rows above).
export const MARKET_PERSON_SOURCE_WIDTH = 256;
export const MARKET_PERSON_SOURCE_HEIGHT = 512;
export const MARKET_PERSON_OPAQUE_SOURCE_HEIGHT = 504;
export const MARKET_PERSON_VISIBLE_HEIGHT = 104;
export const MARKET_PERSON_SCALE = MARKET_PERSON_VISIBLE_HEIGHT / MARKET_PERSON_OPAQUE_SOURCE_HEIGHT;
export const MARKET_PERSON_HEIGHT = MARKET_PERSON_SOURCE_HEIGHT * MARKET_PERSON_SCALE;
// This is the accessible press frame, never the physical collision rectangle.
export const MARKET_PERSON_WIDTH = Math.max(44, Math.ceil(MARKET_PERSON_SOURCE_WIDTH * MARKET_PERSON_SCALE));
// Include a small shoe-edge margin in source pixels so it grows with the art.
const MARKET_PERSON_SOURCE_FOOT_PADDING = 12;

/** Alpha >= 32 bounds of the lowest 10% of each runtime PNG, including both shoes.
 * Keep this pure metadata available to the headless agent and native/web renderers.
 * Re-measure these values when replacing any of the matching v1 PNG assets.
 */
const SHOE_BOUNDS: Record<MarketPersonAppearanceId, { left: number; right: number }> = {
  'employee-male-01': { left: 76, right: 180 },
  'employee-male-02': { left: 71, right: 187 },
  'employee-female-01': { left: 83, right: 177 },
  'employee-female-02': { left: 82, right: 177 },
  'customer-adult-male-01': { left: 67, right: 189 },
  'customer-adult-male-02': { left: 70, right: 186 },
  'customer-adult-female-01': { left: 80, right: 177 },
  'customer-adult-female-02': { left: 85, right: 174 },
  'customer-senior-male-01': { left: 72, right: 183 },
  'customer-senior-male-02': { left: 75, right: 183 },
  'customer-senior-female-01': { left: 78, right: 179 },
  'customer-senior-female-02': { left: 75, right: 181 },
  'customer-child-male-01': { left: 72, right: 183 },
  'customer-child-male-02': { left: 71, right: 185 },
  'customer-child-female-01': { left: 82, right: 173 },
  'customer-child-female-02': { left: 76, right: 179 },
};

export function getMarketPersonGeometry(kind: MarketPersonKind, appearance: number) {
  const variant = getMarketPersonAppearance(kind, appearance);
  const sourceScale = MARKET_PERSON_SCALE * variant.heightScale;
  const shoes = SHOE_BOUNDS[variant.id];
  const footprintWidth = (shoes.right - shoes.left + 1 + MARKET_PERSON_SOURCE_FOOT_PADDING) * sourceScale;
  return {
    imageWidth: MARKET_PERSON_SOURCE_WIDTH * sourceScale,
    imageHeight: MARKET_PERSON_SOURCE_HEIGHT * sourceScale,
    visibleHeight: MARKET_PERSON_OPAQUE_SOURCE_HEIGHT * sourceScale,
    footprintWidth,
    footprintHeight: footprintWidth * 0.6,
    footprintOffsetX: ((shoes.left + shoes.right + 1) / 2 - MARKET_PERSON_SOURCE_WIDTH / 2) * sourceScale,
  };
}

/** The point is the floor anchor, directly beneath the person's feet. */
export function getMarketPersonFrame(point: Point) {
  return {
    left: point.x - MARKET_PERSON_WIDTH / 2,
    top: point.y - MARKET_PERSON_HEIGHT,
    width: MARKET_PERSON_WIDTH,
    height: MARKET_PERSON_HEIGHT,
  };
}

/** Only the shoe-sized ground footprint blocks walking; the upright artwork
 * does not become a tall wall. The same rectangle also positions the shadow.
 */
export function getMarketPersonCollider(point: Point, kind: MarketPersonKind, appearance: number): Rect {
  const geometry = getMarketPersonGeometry(kind, appearance);
  return {
    x: point.x + geometry.footprintOffsetX - geometry.footprintWidth / 2,
    y: point.y - geometry.footprintHeight * 0.75,
    width: geometry.footprintWidth,
    height: geometry.footprintHeight,
  };
}
