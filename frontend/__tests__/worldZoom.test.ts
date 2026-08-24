import {
  clampWorldZoom,
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

  test('clamps wheel and pinch zoom between one and two', () => {
    expect(clampWorldZoom(0.5)).toBe(1);
    expect(clampWorldZoom(2.5)).toBe(2);
    expect(zoomFromWheel(1, -100)).toBeGreaterThan(1);
    expect(zoomFromWheel(1, 100)).toBe(1);
    expect(zoomFromPinch(1.25, 100, 160)).toBe(2);
    expect(zoomFromPinch(1.25, 100, 50)).toBe(1);
  });
});
