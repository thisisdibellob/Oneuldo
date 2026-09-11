import type { Point } from './prototypeWorld';

// Random shoppers and staff use the same world scale in both market renderers.
// Keep the target wide enough to press while the illustrated body is smaller.
export const MARKET_PERSON_SCALE = 0.68;
export const MARKET_PERSON_SOURCE_WIDTH = 62;
export const MARKET_PERSON_SOURCE_HEIGHT = 104;
export const MARKET_PERSON_WIDTH = 44;
export const MARKET_PERSON_HEIGHT = MARKET_PERSON_SOURCE_HEIGHT * MARKET_PERSON_SCALE;

/** The point is the floor anchor, directly beneath the person's feet. */
export function getMarketPersonFrame(point: Point) {
  return {
    left: point.x - MARKET_PERSON_WIDTH / 2,
    top: point.y - MARKET_PERSON_HEIGHT,
    width: MARKET_PERSON_WIDTH,
    height: MARKET_PERSON_HEIGHT,
  };
}
