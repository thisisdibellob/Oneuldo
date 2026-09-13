import {
  clampWorldZoom,
  getWorldCameraFrame,
  MARKET_DEFAULT_ZOOM,
  screenPointToWorld,
  zoomFromPinch,
  zoomFromWheel,
} from '../src/game/worldZoom';

describe('worldZoom', () => {
  test('keeps the player at the viewport centre at every zoom', () => {
    const player = { x: 420, y: 260 };
    const viewport = { height: 800, width: 400 };
    expect(screenPointToWorld({ x: 200, y: 400 }, player, viewport, 1)).toEqual(player);
    expect(screenPointToWorld({ x: 200, y: 400 }, player, viewport, 2)).toEqual(player);
  });

  test('converts screen offsets through the active zoom', () => {
    expect(
      screenPointToWorld(
        { x: 300, y: 450 },
        { x: 420, y: 260 },
        { height: 800, width: 400 },
        2,
      ),
    ).toEqual({ x: 470, y: 285 });
  });

  test('keeps market taps aligned with the enlarged 1.3x view', () => {
    expect(screenPointToWorld(
      { x: 330, y: 465 }, { x: 450, y: 820 }, { width: 400, height: 800 }, MARKET_DEFAULT_ZOOM,
    )).toEqual({ x: 550, y: 870 });
  });

  test('clamps wheel and pinch zoom between one and two', () => {
    expect(clampWorldZoom(0.5)).toBe(1);
    expect(clampWorldZoom(2.5)).toBe(2);
    expect(zoomFromWheel(1, -100)).toBeGreaterThan(1);
    expect(zoomFromWheel(1, 100)).toBe(1);
    expect(zoomFromPinch(1.25, 100, 160)).toBe(2);
    expect(zoomFromPinch(1.25, 100, 50)).toBe(1);
  });

  test('never zooms the market out below its default, even after repeated wheel or pinch input', () => {
    let zoom = 2;
    for (let step = 0; step < 100; step += 1) zoom = zoomFromWheel(zoom, 120, MARKET_DEFAULT_ZOOM);
    expect(zoom).toBe(MARKET_DEFAULT_ZOOM);
    expect(zoomFromPinch(2, 200, 20, MARKET_DEFAULT_ZOOM)).toBe(MARKET_DEFAULT_ZOOM);
    expect(zoomFromWheel(MARKET_DEFAULT_ZOOM, -120, MARKET_DEFAULT_ZOOM)).toBeGreaterThan(MARKET_DEFAULT_ZOOM);
  });
});

describe('bounded market camera', () => {
  const world = { width: 1100, height: 1500 };
  test('fills a desktop viewport at the right checkout while keeping the avatar at its actual world point', () => {
    const viewport = { width: 1280, height: 720 }, player = { x: 807, y: 889 }, zoom = 1.3;
    const frame = getWorldCameraFrame(player, viewport, zoom, world);
    expect(frame.center.x).toBeCloseTo(1100 - 1280 / zoom / 2);
    expect(frame.center.y).toBe(player.y);
    const rightEdge = viewport.width / 2 + zoom * (world.width - frame.center.x);
    expect(rightEdge).toBeCloseTo(viewport.width);
    const screenPlayer = { x: viewport.width / 2 + frame.playerOffset.x * zoom,
      y: viewport.height / 2 + frame.playerOffset.y * zoom };
    expect(screenPlayer.x).toBeGreaterThan(viewport.width / 2);
    const picked = screenPointToWorld(screenPlayer, frame.center, viewport, zoom);
    expect(picked.x).toBeCloseTo(player.x);
    expect(picked.y).toBeCloseTo(player.y);
  });

  test('clamps all four world edges and keeps floor picking aligned at both market zoom limits', () => {
    for (const viewport of [{ width: 400, height: 800 }, { width: 1280, height: 720 }]) {
      for (const zoom of [1.3, 2]) {
        for (const player of [{ x: 12, y: 12 }, { x: 1088, y: 1488 }, { x: 807, y: 889 }, { x: 470, y: 1100 }]) {
          const frame = getWorldCameraFrame(player, viewport, zoom, world);
          const topLeft = screenPointToWorld({ x: 0, y: 0 }, frame.center, viewport, zoom);
          const bottomRight = screenPointToWorld({ x: viewport.width, y: viewport.height }, frame.center, viewport, zoom);
          expect(topLeft.x).toBeGreaterThanOrEqual(-0.000001);
          expect(topLeft.y).toBeGreaterThanOrEqual(-0.000001);
          expect(bottomRight.x).toBeLessThanOrEqual(world.width + 0.000001);
          expect(bottomRight.y).toBeLessThanOrEqual(world.height + 0.000001);
          const target = { x: 500, y: 800 };
          const projected = { x: viewport.width / 2 + (target.x - frame.center.x) * zoom,
            y: viewport.height / 2 + (target.y - frame.center.y) * zoom };
          const picked = screenPointToWorld(projected, frame.center, viewport, zoom);
          expect(picked.x).toBeCloseTo(target.x);
          expect(picked.y).toBeCloseTo(target.y);
        }
      }
    }
  });

  test('recomputes the boundary when zoom changes without moving the player', () => {
    const viewport = { width: 1280, height: 720 }, player = { x: 807, y: 889 };
    const wide = getWorldCameraFrame(player, viewport, 1.3, world);
    const close = getWorldCameraFrame(player, viewport, 2, world);
    expect(close.center.x).toBe(780);
    expect(close.center.x).toBeGreaterThan(wide.center.x);
    expect(close.playerOffset.x).toBe(27);
    expect(close.translation.x + close.center.x).toBe(viewport.width / 2);
  });

  test('centres a world smaller than the viewport and leaves village/home camera behaviour unchanged', () => {
    const viewport = { width: 3000, height: 2400 }, player = { x: 807, y: 889 };
    const market = getWorldCameraFrame(player, viewport, 1.3, world);
    expect(market.center).toEqual({ x: 550, y: 750 });
    expect(market.translation).toEqual({ x: 950, y: 450 });
    const village = getWorldCameraFrame(player, viewport, 1.3);
    expect(village.center).toEqual(player);
    expect(village.playerOffset).toEqual({ x: 0, y: 0 });
  });
});
