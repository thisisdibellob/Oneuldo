// Furniture, its ground footprint, and all facings share the original art scale.
// A category owns two adjacent fixtures but keeps one station and inventory.
export const MARKET_SHELF_SCALE = 0.575;
export const MARKET_SHELF_ART_WIDTH = 282 * MARKET_SHELF_SCALE;
export const MARKET_SHELF_ART_HEIGHT = 188 * MARKET_SHELF_SCALE;
export const MARKET_SHELF_ART_BOTTOM = -8 * MARKET_SHELF_SCALE;
// Measured feet on the retail-v4 PNGs span up to 240.5 px in the original
// 282px furniture frame (produce is the widest). Include that base, not only
// the narrower shelf body, while keeping the art and pair centers unchanged.
export const MARKET_SHELF_UNIT_WIDTH = 242 * MARKET_SHELF_SCALE;
export const MARKET_SHELF_UNIT_HEIGHT = 128 * MARKET_SHELF_SCALE;
// Transparent sprite padding overlaps slightly so the furniture edges sit together.
export const MARKET_SHELF_ART_GAP = -18 * MARKET_SHELF_SCALE;
export const MARKET_SHELF_UNIT_STEP = MARKET_SHELF_ART_WIDTH + MARKET_SHELF_ART_GAP;
// Preserve the walkable aisle instead of scaling it together with the fixtures.
export const MARKET_SHELF_VERTICAL_AISLE = 40;
export const MARKET_SHELF_VERTICAL_STEP = MARKET_SHELF_UNIT_HEIGHT + MARKET_SHELF_VERTICAL_AISLE;
export const MARKET_SHELF_PAIR_WIDTH = MARKET_SHELF_UNIT_WIDTH + MARKET_SHELF_UNIT_STEP;
export const MARKET_SHELF_PAIR_HEIGHT = MARKET_SHELF_UNIT_HEIGHT;
export const MARKET_SHELF_VERTICAL_HEIGHT = MARKET_SHELF_UNIT_HEIGHT + MARKET_SHELF_VERTICAL_STEP;
export const MARKET_SHELF_PAIR_HIT_SLOP = { bottom: 30, left: 20, right: 20, top: 32 };

/** Ground footprints belong to each visible unit; the aisle between units is not furniture. */
export function getMarketShelfUnitRects(shelf: { x: number; y: number; orientation: 'horizontal' | 'vertical' }) {
  return [0, 1].map(index => ({
    x: shelf.x + (shelf.orientation === 'horizontal' ? index * MARKET_SHELF_UNIT_STEP : 0),
    y: shelf.y + (shelf.orientation === 'vertical' ? index * MARKET_SHELF_VERTICAL_STEP : 0),
    width: MARKET_SHELF_UNIT_WIDTH, height: MARKET_SHELF_UNIT_HEIGHT,
  }));
}
