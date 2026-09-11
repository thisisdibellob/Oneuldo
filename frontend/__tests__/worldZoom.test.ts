import {
  clampWorldZoom,
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
