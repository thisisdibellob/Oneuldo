export type RunMode = 'distance' | 'toggle';
export type GameMovementInput = { x: number; y: number; running: boolean };

export const RUN_SPEED_MULTIPLIER = 1.55;
export const JOYSTICK_RADIUS = 36;
export const JOYSTICK_DEAD_ZONE = 0.12;
export const JOYSTICK_RUN_START = 0.78;
export const JOYSTICK_RUN_STOP = 0.64;

/** Keep a small rest zone and hysteresis so an unsteady finger does not flicker between gaits. */
export function getJoystickMovement(
  dx: number, dy: number, runMode: RunMode, runEnabled: boolean, previouslyRunning = false,
): GameMovementInput {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { x: 0, y: 0, running: false };
  const distance = Math.hypot(dx, dy);
  const strength = Math.min(1, distance / JOYSTICK_RADIUS);
  if (strength <= JOYSTICK_DEAD_ZONE) return { x: 0, y: 0, running: false };
  const running = runMode === 'toggle' ? runEnabled : strength >= (previouslyRunning ? JOYSTICK_RUN_STOP : JOYSTICK_RUN_START);
  const magnitude = (strength - JOYSTICK_DEAD_ZONE) / (1 - JOYSTICK_DEAD_ZONE);
  return { x: dx / distance * magnitude, y: dy / distance * magnitude, running };
}
