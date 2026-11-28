import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { getMarketPlayerGuidePose, isNearMarketConstruction } from '../src/game/marketWayfinding';

test('direction arrow follows the player body and rotates toward the requested goal rather than the camera centre', () => {
  const frame = { width: 1000, height: 900, zoom: 1, center: { x: 500, y: 500 } };
  const north = getMarketPlayerGuidePose(frame, { x: 600, y: 600 }, { x: 600, y: 100 });
  const south = getMarketPlayerGuidePose(frame, { x: 600, y: 600 }, { x: 600, y: 1100 });
  expect(north.x).toBe(600); expect(north.y).toBeLessThan(507);
  expect(north.rotation).toBe(-45); expect(south.rotation).toBe(135);
  const moved = getMarketPlayerGuidePose(frame, { x: 650, y: 600 }, { x: 650, y: 100 });
  expect(moved.x - north.x).toBe(50);
  const camera = getMarketPlayerGuidePose({ ...frame, center: { x: 550, y: 500 } }, { x: 650, y: 600 }, { x: 650, y: 100 });
  expect(camera.x).toBe(north.x);
});
test('construction notice works on either side of the rail, has an exit buffer, and disappears when construction is disabled', () => {
  const env = createMarketEnvironment({ entranceConstruction: true }), r = env.constructionZones[0].rect;
  const above = { x: r.x + r.width / 2, y: r.y - 90 }, below = { x: r.x + r.width / 2, y: r.y + r.height + 90 };
  expect(isNearMarketConstruction(env, above)).toBe(true);
  expect(isNearMarketConstruction(env, below)).toBe(true);
  expect(isNearMarketConstruction(env, { ...above, y: r.y - 115 })).toBe(false);
  expect(isNearMarketConstruction(env, { ...above, y: r.y - 115 }, true)).toBe(true);
  expect(isNearMarketConstruction(env, { ...above, y: r.y - 150 }, true)).toBe(false);
  expect(isNearMarketConstruction({ ...env, constructionZones: [] }, above, true)).toBe(false);
});
