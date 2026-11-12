import type { ActorObservation, ActorDirection } from './types';
import { createHash } from 'node:crypto';
import { canonicalMarketReplayJson } from '../../frontend/src/game/marketReplayTrace';
import type { WholeTraceBundle } from './wholeTraceContracts';
import type { WholeTraceAcceptedFrame } from './wholeTraceChoices';
import type { Observation } from './types';

/** Opt-in only; absent in all original bundles and validation calls. */
export type WholeTraceMovementVersion = 'directional-v1' | 'directional-v2';
export function wholeTraceHasDirectionalMovement(version?: WholeTraceMovementVersion): boolean {
  return version === 'directional-v1' || version === 'directional-v2';
}
export const WHOLE_TRACE_DIRECTIONS: readonly ActorDirection[] = [
  'north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest',
];
export const WHOLE_TRACE_DIRECTION_LABELS: Record<ActorDirection, string> = {
  north: '북쪽', northeast: '북동쪽', east: '동쪽', southeast: '남동쪽',
  south: '남쪽', southwest: '남서쪽', west: '서쪽', northwest: '북서쪽',
};
/** Motor controls depend on UI operability, never visibility or a predicted destination. */
export function wholeTraceCanMove(o: Pick<ActorObservation, 'phase' | 'view' | 'activeStation'>): boolean {
  return o.phase === 'shopping' && o.view === 'world' && o.activeStation === null;
}
export function wholeTraceDirectionalLocation(location: string): boolean { return /^D[1-9][0-9]*$/.test(location); }
/** Phase-two integration boundary. The producer owns execution/prediction; this consumer never estimates displacement. */
export type WholeTraceMovementPosition = { decisionCount: number; position: { x: number; y: number } };

/** Continuous positions are never rounded or snapped to a grid. Only these
 * opaque identities cross the authoring boundary, never coordinates/cashier maps. */
export function wholeTraceContinuousFrame(bundle: Pick<WholeTraceBundle, 'inputHash' | 'worldReference'>,
  position: Observation['playerPosition'], cashiers: Observation['cashierAvailability']): WholeTraceAcceptedFrame {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error('Invalid applied position');
  const digest = (value: unknown) => createHash('sha256').update(canonicalMarketReplayJson(value)).digest('hex');
  const location = `P${digest({ version: 'continuous-position-v1', inputHash: bundle.inputHash, position })}`;
  return { location, navigationStateId: `nav-v2-${digest({ version: 'continuous-navigation-v1',
    inputHash: bundle.inputHash, location, cashiers, presentationKey: bundle.worldReference.navigation.presentationKey })}` };
}
export function wholeTraceIsContinuousFrame(frame: WholeTraceAcceptedFrame): boolean {
  return /^P[a-f0-9]{64}$/.test(frame.location) && /^nav-v2-[a-f0-9]{64}$/.test(frame.navigationStateId);
}
export type WholeTracePublicMovementResult = {
  actualDirection: ActorDirection | null; progress: 'full' | 'partial' | 'blocked'; blocked: boolean;
};
/** Actual displacement supplies direction, not the requested joystick heading.
 * Numeric motion metrics remain server-internal; a collision may cause a slide. */
export function wholeTracePublicMovement(o: ActorObservation): WholeTracePublicMovementResult | undefined {
  const movement = o.result?.movement;
  if (!movement) return;
  const { dx, dy } = movement.actualDelta;
  const actualDirection = Math.hypot(dx, dy) < 1e-7 ? null
    : WHOLE_TRACE_DIRECTIONS[(Math.round(Math.atan2(dx, -dy) / (Math.PI / 4)) + 8) % 8];
  return { actualDirection, progress: movement.outcome === 'blocked' ? 'blocked'
    : movement.outcome === 'partially-blocked' ? 'partial' : 'full', blocked: movement.outcome !== 'moved' };
}
export function wholeTracePublicObservation(o: ActorObservation): ActorObservation {
  const observation = structuredClone(o);
  // Movement's numeric delta/distance is useful only to the server's integration
  // and bounded experience. Never expose it through menus, audits or failures.
  if (observation.result) delete observation.result.movement;
  return observation;
}
