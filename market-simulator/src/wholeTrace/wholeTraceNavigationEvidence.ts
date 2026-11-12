import { REPLAY_ARRIVAL_MARGIN } from '../../../frontend/src/game/marketReplayPerception';
import { createMarketSession } from '../../../frontend/src/game/marketSession';
import type { ActorAppliedState, ActorObservation, PolicyAction } from '../types';
import type { WholeTraceBundle, WholeTraceSettings } from './wholeTraceContracts';
import type { WholeTraceAcceptedFrame, WholeTraceChoiceFrame } from './wholeTraceChoices';
import { wholeTraceContinuousFrame } from './wholeTraceMovement';

export type WholeTraceNavigationEvidence = {
  version: 'continuous-route-v1'; decisionIndex: number;
  from: WholeTraceAcceptedFrame; to: WholeTraceAcceptedFrame;
  fromPositionId: string; toPositionId: string;
  allowedAnchors: { choiceId: string; anchorId: string }[];
  movement: null | {
    actionType: 'walkToAnchor' | 'moveDirection'; accepted: boolean;
    outcome: 'moved' | 'partially-blocked' | 'blocked';
    targetAnchorId?: string; arrivedAnchorIds: string[];
  };
};

/** Post-execution evaluation evidence, never an actor observation or an input to
 * action selection. Exact coordinates stay inside this recorder. Only anchors
 * that actually appeared as legal choices can subsequently count as arrivals.
 */
export function createWholeTraceNavigationRecorder(settings: WholeTraceSettings, bundle: WholeTraceBundle) {
  const initial = createMarketSession(settings.snapshot.config, settings.snapshot.environment);
  let position = initial.playerPosition, cashiers = initial.cashierAvailability;
  const observedAnchors = new Map<string, { x: number; y: number }>();
  const byWaypoint = new Map(bundle.worldReference.waypoints.map(waypoint => [waypoint.waypointId, waypoint]));
  const positionId = () => wholeTraceContinuousFrame(bundle, position, cashiers).location;
  return {
    before(frame: WholeTraceChoiceFrame, decisionIndex: number): WholeTraceNavigationEvidence {
      const allowedAnchors = frame.availableChoices.flatMap(choice => {
        if (choice.action.type !== 'walk') return [];
        const waypoint = byWaypoint.get(choice.action.waypointId);
        if (!waypoint) throw new Error('Observed navigation choice has no bound waypoint');
        observedAnchors.set(waypoint.anchorId, waypoint.point);
        return [{ choiceId: choice.choiceId, anchorId: waypoint.anchorId }];
      });
      const from = { location: frame.source.location, navigationStateId: frame.source.navigationStateId };
      const id = positionId();
      return { version: 'continuous-route-v1', decisionIndex, from, to: { ...from },
        fromPositionId: id, toPositionId: id, allowedAnchors, movement: null };
    },
    applied(evidence: WholeTraceNavigationEvidence, action: PolicyAction, applied: ActorAppliedState,
      after: ActorObservation, to: WholeTraceAcceptedFrame) {
      position = { ...applied.position }; cashiers = { ...applied.cashierAvailability };
      evidence.to = { location: to.location, navigationStateId: to.navigationStateId };
      evidence.toPositionId = positionId();
      if (action.type !== 'walkToAnchor' && action.type !== 'moveDirection') return;
      const result = after.result;
      if (result?.accepted !== true || result.actionType !== action.type)
        throw new Error('Navigation evidence requires the actually applied movement result');
      // Legacy anchors are guaranteed arrivals; directional and fixed-anchor
      // execution already report the exact canonical-slice collision outcome.
      const outcome = result.movement?.outcome ?? (action.type === 'walkToAnchor' ? 'moved' : undefined);
      if (!outcome) throw new Error('Directional navigation evidence is missing its collision outcome');
      const arrivedAnchorIds = [...observedAnchors].filter(([, point]) =>
        Math.hypot(position.x - point.x, position.y - point.y) <= REPLAY_ARRIVAL_MARGIN).map(([id]) => id).sort();
      evidence.movement = { actionType: action.type, accepted: true, outcome,
        ...(action.type === 'walkToAnchor' ? { targetAnchorId: action.anchorId } : {}), arrivedAnchorIds };
    },
  };
}
