import { FeedbackExperience } from './feedbackExperience';
import { markRecentPassageVisit, recentMovementNotes } from './feedbackActor';
import type { ActorObservation, Decision } from './types';
import type { WholeTraceChoiceFrame } from './wholeTraceChoices';

export const WHOLE_TRACE_MOVEMENT_FEEDBACK_VERSION = 'recent-movement-v1' as const;
export const WHOLE_TRACE_ANCHOR_MOVEMENT_FEEDBACK_VERSION = 'recent-movement-anchor-v1' as const;
export const WHOLE_TRACE_ANCHOR_CAPACITY_MOVEMENT_FEEDBACK_VERSION = 'recent-movement-anchor-capacity-v1' as const;
export type WholeTraceMovementFeedbackVersion = typeof WHOLE_TRACE_MOVEMENT_FEEDBACK_VERSION | typeof WHOLE_TRACE_ANCHOR_MOVEMENT_FEEDBACK_VERSION
  | typeof WHOLE_TRACE_ANCHOR_CAPACITY_MOVEMENT_FEEDBACK_VERSION;

export function wholeTraceHasAnchorMovementFeedback(version: unknown): boolean {
  return version === WHOLE_TRACE_ANCHOR_MOVEMENT_FEEDBACK_VERSION || version === WHOLE_TRACE_ANCHOR_CAPACITY_MOVEMENT_FEEDBACK_VERSION;
}

export function validWholeTraceMovementFeedback(version: unknown, movementVersion: unknown, observationVersion: unknown): boolean {
  return version === undefined || version === WHOLE_TRACE_MOVEMENT_FEEDBACK_VERSION && movementVersion === 'directional-v2'
    || wholeTraceHasAnchorMovementFeedback(version) && movementVersion === undefined && observationVersion === 'anchor-visible-structures-v1';
}

/** Bounded applied experience only. Keep its private passage IDs and displacement totals out of actor menus. */
export function createWholeTraceMovementFeedback(options: { spatialMemoryCapacity?: number } = {}) {
  const experience = new FeedbackExperience({ version: 'bounded-observed-experience-v2',
    movementHistory: true, passageHistory: true, passageCapacity: options.spatialMemoryCapacity });
  return {
    record(decision: Decision, before: ActorObservation, after: ActorObservation): void {
      experience.record(decision, before, after);
    },
    decorate(frame: WholeTraceChoiceFrame, observation: ActorObservation): {
      movementNotes: string[]; choiceFrame: WholeTraceChoiceFrame;
    } {
      const snapshot = experience.snapshot(observation);
      const visibleAnchorRefs = new Set(observation.anchors.map(anchor => `anchor:${anchor.id}`));
      const choiceFrame = structuredClone(frame);
      choiceFrame.availableChoices = choiceFrame.availableChoices.map(choice => {
        if (choice.action.type !== 'walk') return choice;
        const anchorRef = choice.cueRefs.find(ref => visibleAnchorRefs.has(ref));
        return markRecentPassageVisit(choice, anchorRef?.slice('anchor:'.length), snapshot);
      });
      return { movementNotes: recentMovementNotes(snapshot), choiceFrame };
    },
  };
}
