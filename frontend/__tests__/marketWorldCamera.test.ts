import { getMarketHudOcclusionRect } from '../src/game/marketHudLayout';
import { createMarketSession } from '../src/game/marketSession';
import { visibleStations, type ReplayPresentation } from '../src/game/marketReplayPerception';
import { getMarketWorldCameraFrame } from '../src/game/marketWorldCamera';
import { getWorldCameraFrame, screenPointToWorld } from '../src/game/worldZoom';

const world = { width: 1100, height: 1500 };
const player = { x: 550, y: 700 };
const presentation = (width: number, height: number, fontScale = 1, top = 0): ReplayPresentation => ({
  viewport: { width, height }, zoom: 1.3, fontScale, safeArea: { top, bottom: 0 },
});

test.each([[320, 568], [360, 640], [375, 640], [390, 600], [390, 640]])(
  'compact %ix%i camera puts the avatar below the real shopping note', (width, height) => {
    for (const fontScale of [1, 1.3, 2]) for (const top of [0, 47, 59]) {
      const p = presentation(width, height, fontScale, top);
      const hud = getMarketHudOcclusionRect(p), frame = getMarketWorldCameraFrame(player, p, world);
      const projected = { x: width / 2 + frame.playerOffset.x * p.zoom,
        y: height / 2 + frame.playerOffset.y * p.zoom };
      expect(projected.y).toBeCloseTo((hud.bottom + height - 12) / 2);
      expect(projected.y).toBeGreaterThan(hud.bottom);
      expect(projected.x).toBe(width / 2);
      const picked = screenPointToWorld(projected, frame.center, p.viewport, p.zoom);
      expect(picked.x).toBeCloseTo(player.x);
      expect(picked.y).toBeCloseTo(player.y);
    }
  },
);

test('market composition retains world clamps and picking at edges and zoom limits', () => {
  for (const zoom of [1.3, 2]) for (const point of [
    { x: 12, y: 12 }, { x: 1088, y: 1488 }, { x: 710, y: 1350 }, player,
  ]) {
    const p = { ...presentation(360, 640, 2, 59), zoom };
    const frame = getMarketWorldCameraFrame(point, p, world);
    const corner = screenPointToWorld({ x: 0, y: 0 }, frame.center, p.viewport, zoom);
    const opposite = screenPointToWorld({ x: p.viewport.width, y: p.viewport.height }, frame.center, p.viewport, zoom);
    expect(corner.x).toBeGreaterThanOrEqual(-1e-7);
    expect(corner.y).toBeGreaterThanOrEqual(-1e-7);
    expect(opposite.x).toBeLessThanOrEqual(world.width + 1e-7);
    expect(opposite.y).toBeLessThanOrEqual(world.height + 1e-7);
    const projected = { x: p.viewport.width / 2 + frame.playerOffset.x * zoom,
      y: p.viewport.height / 2 + frame.playerOffset.y * zoom };
    const picked = screenPointToWorld(projected, frame.center, p.viewport, zoom);
    expect(picked.x).toBeCloseTo(point.x);
    expect(picked.y).toBeCloseTo(point.y);
  }
});

test.each([[391, 600], [390, 641], [390, 844], [430, 932], [768, 1024], [375, 641]])(
  'existing %ix%i composition remains byte-identical', (width, height) => {
    for (const fontScale of [1, 1.3, 2]) for (const top of [0, 47, 59]) for (const point of [player, { x: 710, y: 1350 }]) {
      const p = presentation(width, height, fontScale, top);
      expect(JSON.stringify(getMarketWorldCameraFrame(point, p, world)))
        .toBe(JSON.stringify(getWorldCameraFrame(point, p.viewport, p.zoom, world)));
    }
  },
);

test('compact composition still hides shelf signs behind the unchanged HUD', () => {
  const p = presentation(360, 640, 2, 59), environment = createMarketSession().environment;
  const hud = getMarketHudOcclusionRect(p), frame = getMarketWorldCameraFrame(player, p, world);
  const marker = screenPointToWorld({ x: p.viewport.width / 2, y: (hud.top + hud.bottom) / 2 },
    frame.center, p.viewport, p.zoom);
  environment.stationDetails = environment.stationDetails.filter(station => station.id === 'fresh');
  const shelf = environment.shelves.fresh;
  environment.shelves.fresh = { ...shelf, x: marker.x - shelf.width / 2, y: marker.y - shelf.height - 10 };
  expect(visibleStations(environment, player, p).some(station => station.id === 'fresh')).toBe(false);
  // This changes the displayed sign's world position, without changing the mask.
  environment.shelves.fresh.y += (hud.bottom + 20 - (hud.top + hud.bottom) / 2) / p.zoom;
  expect(visibleStations(environment, player, p).some(station => station.id === 'fresh')).toBe(true);
  expect(getMarketHudOcclusionRect(p)).toEqual(hud);
});

test('oversized accessibility text cannot push the camera focus beyond the viewport', () => {
  const p = presentation(320, 568, 4, 200);
  const frame = getMarketWorldCameraFrame(player, p, world);
  expect(p.viewport.height / 2 + frame.playerOffset.y * p.zoom).toBeCloseTo(p.viewport.height - 12);
});
