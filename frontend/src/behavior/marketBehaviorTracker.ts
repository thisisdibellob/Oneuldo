import { randomUUID } from 'expo-crypto';

import type { BehaviorSimulationContext } from '../api/behaviorLog';
import type { MarketMission } from '../game/scenarios';
import type { MarketTelemetryStation } from './marketMovementDetector';
import { MarketBehaviorTrackerCore } from './marketBehaviorTrackerCore';
import { enqueueBehaviorEvents, flushBehaviorEventQueue, assertBehaviorEventsAcknowledged } from './behaviorEventQueue';

/** Native/UI adapter. Event mapping itself is shared with the offline simulator. */
export class MarketBehaviorTracker extends MarketBehaviorTrackerCore {
  constructor(
    accessToken: string,
    mission: MarketMission,
    difficulty = 2,
    simulation?: Omit<BehaviorSimulationContext, 'simulationStarted'>,
    stations?: Partial<Record<MarketTelemetryStation, { x: number; y: number }>>,
  ) {
    super({
      now: () => Date.now(),
      randomUUID,
      setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
      persist: events => enqueueBehaviorEvents(accessToken, events),
      flush: () => flushBehaviorEventQueue(accessToken),
      assertAcknowledged: (sessionId, sequence) => assertBehaviorEventsAcknowledged(accessToken, sessionId, sequence),
    }, mission, difficulty, simulation, stations);
  }
}
