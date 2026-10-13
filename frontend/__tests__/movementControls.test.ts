import { getJoystickMovement, JOYSTICK_RADIUS } from '../src/game/movementControls';

it('a resting or invalid stick cannot move or run', () => {
  for (const [x, y] of [[0, 0], [2, -2], [NaN, 0], [0, Infinity]]) {
    expect(getJoystickMovement(x, y, 'distance', true)).toEqual({ x: 0, y: 0, running: false });
  }
});

it('a small push walks and a full diagonal push runs at the same maximum speed as a straight push', () => {
  const walk = getJoystickMovement(18, 0, 'distance', false);
  const straight = getJoystickMovement(360, 0, 'distance', false);
  const diagonal = getJoystickMovement(360, -360, 'distance', false);
  expect(walk.running).toBe(false);
  expect(walk.x).toBeGreaterThan(0);
  expect(walk.x).toBeLessThan(straight.x);
  expect(straight).toEqual({ x: 1, y: 0, running: true });
  expect(diagonal.running).toBe(true);
  expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
  expect(diagonal.y).toBeLessThan(0);
});

it('run hysteresis avoids repeated gait changes when the finger shakes near the threshold', () => {
  expect(getJoystickMovement(JOYSTICK_RADIUS * 0.8, 0, 'distance', false).running).toBe(true);
  expect(getJoystickMovement(JOYSTICK_RADIUS * 0.7, 0, 'distance', false, true).running).toBe(true);
  expect(getJoystickMovement(JOYSTICK_RADIUS * 0.7, 0, 'distance', false, false).running).toBe(false);
  expect(getJoystickMovement(JOYSTICK_RADIUS * 0.6, 0, 'distance', false, true).running).toBe(false);
});

it('button mode obeys the toggle at either short or long stick distances', () => {
  expect(getJoystickMovement(18, 0, 'toggle', true).running).toBe(true);
  expect(getJoystickMovement(100, 0, 'toggle', false, true).running).toBe(false);
});
