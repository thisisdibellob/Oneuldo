import { marketReplayTraceId, type MarketReplayStep, type MarketReplayTrace } from '../../frontend/src/game/marketReplayTrace';

const walking = (step?: MarketReplayStep) => step?.type === 'walkToAnchor' || step?.type === 'walkTo';

/** Post-process only execution timing; never drop actions or alter the actor's decisions. */
export function compactTraceTiming(trace: MarketReplayTrace): MarketReplayTrace {
  if (trace.generation?.timingProfile === 'compact-v1') return trace;
  const { traceId, ...body } = trace;
  const steps = trace.steps.map((step, index): MarketReplayStep => {
    const reactionDelayMs = walking(step) && walking(trace.steps[index - 1]) ? 0
      : Math.min(step.reactionDelayMs, walking(step) ? 350 : 1500);
    if (step.type === 'walkToAnchor' || step.type === 'walkTo') {
      return { ...step, reactionDelayMs, movement: { ...step.movement,
        speedMultiplier: Math.max(step.movement.speedMultiplier, .75) } };
    }
    return { ...step, reactionDelayMs };
  });
  const updated: Omit<MarketReplayTrace, 'traceId'> = { ...body, steps,
    generation: { ...(trace.generation ?? { model: 'captured-trace', reproducibility: 'captured-trace' }),
      timingProfile: 'compact-v1', sourceTraceId: traceId } };
  return { ...updated, traceId: marketReplayTraceId(updated) };
}
