import { getMarketPersonAppearance, type MarketPersonAppearanceId, type MarketPersonKind } from './marketPeople';
import type { Point, Rect } from './prototypeWorld';

// Match the SD player's ~86px visible height with slightly taller 92px adults.
// Chibi v2 art is uniformly fitted to 344 rows on a 256 x 384 transparent canvas.
export const MARKET_PERSON_SOURCE_WIDTH = 256;
export const MARKET_PERSON_SOURCE_HEIGHT = 384;
export const MARKET_PERSON_OPAQUE_SOURCE_HEIGHT = 344;
export const MARKET_PERSON_VISIBLE_HEIGHT = 92;
export const MARKET_PERSON_SCALE = MARKET_PERSON_VISIBLE_HEIGHT / MARKET_PERSON_OPAQUE_SOURCE_HEIGHT;
export const MARKET_PERSON_HEIGHT = MARKET_PERSON_SOURCE_HEIGHT * MARKET_PERSON_SCALE;
// This is the accessible press frame, never the physical collision rectangle.
export const MARKET_PERSON_WIDTH = Math.max(44, Math.ceil(MARKET_PERSON_SOURCE_WIDTH * MARKET_PERSON_SCALE));
// Keep the established v1 ground footprint independent of illustration changes.
// This preserves recorded layouts, navigation, and staff interaction distances.
const COLLISION_SOURCE_SCALE = 104 / 504;
const COLLISION_SOURCE_WIDTH = 256;
const COLLISION_SOURCE_FOOT_PADDING = 12;

/** Canonical v1 shoe bounds, retained as the game's physical footprint contract.
 * Chibi v2 display dimensions do not resize these collision rectangles.
 * Keep this pure metadata available to both the headless agent and renderers.
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
  const collisionScale = COLLISION_SOURCE_SCALE * variant.heightScale;
  const footprintWidth = (shoes.right - shoes.left + 1 + COLLISION_SOURCE_FOOT_PADDING) * collisionScale;
  return {
    imageWidth: MARKET_PERSON_SOURCE_WIDTH * sourceScale,
    imageHeight: MARKET_PERSON_SOURCE_HEIGHT * sourceScale,
    visibleHeight: MARKET_PERSON_OPAQUE_SOURCE_HEIGHT * sourceScale,
    footprintWidth,
    footprintHeight: footprintWidth * 0.6,
    footprintOffsetX: ((shoes.left + shoes.right + 1) / 2 - COLLISION_SOURCE_WIDTH / 2) * collisionScale,
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
