import { randomUUID } from 'expo-crypto';

import {
  type BehaviorSimulationContext,
  type BehaviorEvidenceContext,
  type BehaviorLogRequest,
  type BehaviorStepOutcome,
  type ShoppingBehaviorPayload,
} from '../api/behaviorLog';
import {
  getCartQuantity,
  getMarketProduct,
  MarketCart,
  MarketEvaluation,
  MarketMission,
  marketMission,
} from '../game/scenarios';

export const MARKET_TASK_ID = '30000000-0000-0000-0000-000000000003';
const CONTENT_VERSION = 'market-basic-shopping-v1';
const APP_VERSION = '1.0.0';

export type MarketBehaviorSession = {
  sessionId: string;
  evidenceContext: BehaviorEvidenceContext;
  startedAt: string;
  mission?: MarketMission;
  difficulty?: number;
  simulation: BehaviorSimulationContext;
};

export type MarketQuantityInteraction = {
  productId: string;
  selectedQuantity: number;
  occurredAt: string;
};

type EventInput = {
  eventCode: string;
  microActionId: string;
  outcome: BehaviorStepOutcome;
  occurredAt: string;
  payload: ShoppingBehaviorPayload;
  error?: BehaviorLogRequest['error'];
};

export function createMarketBehaviorSession(
  evidenceContext: BehaviorEvidenceContext = 'ASSESSMENT_TASK',
  now = new Date(),
  mission: MarketMission = marketMission,
  difficulty = 2,
  simulation?: Omit<BehaviorSimulationContext, 'simulationStarted'>,
): MarketBehaviorSession {
  return {
    difficulty,
    evidenceContext,
    mission,
    simulation: {
      contentSource: simulation?.contentSource ?? 'STATIC',
      questInstanceId: simulation?.questInstanceId ?? randomUUID(),
      simulationStarted: true,
    },
    sessionId: randomUUID(),
    startedAt: now.toISOString(),
  };
}

function completionQuality(cart: MarketCart, evaluation: MarketEvaluation, mission: MarketMission) {
  const exactObjectives = mission.objectives.filter(
    (objective) => getCartQuantity(cart, objective.productId) === objective.quantity,
  ).length;
  const criteria = mission.objectives.length + 2;
  const achieved = exactObjectives
    + (evaluation.extra.length === 0 ? 1 : 0)
    + (evaluation.overBudget === 0 ? 1 : 0);
  return Math.round((achieved / criteria) * 1000) / 10;
}

function eventRequest(
  session: MarketBehaviorSession,
  input: EventInput,
  sequence: number,
  finalContext?: Pick<BehaviorLogRequest, 'sessionEnd' | 'taskResult'>,
): BehaviorLogRequest {
  const mission = session.mission ?? marketMission;
  return {
    metadata: {
      appVersion: APP_VERSION,
      clientEventId: randomUUID(),
      contentVersion: CONTENT_VERSION,
      eventSchemaVersion: 'behavior-event-v1',
      eventSequence: sequence,
      occurredAt: input.occurredAt,
      offlineQueued: false,
    },
    identity: { sessionId: session.sessionId },
    task: {
      difficulty: session.difficulty ?? 2,
      evidenceContext: session.evidenceContext,
      gameId: 'MARKET_SIMULATION',
      scenarioVariant: 'BASELINE',
      taskId: MARKET_TASK_ID,
      taskVersion: CONTENT_VERSION,
    },
    action: {
      eventCode: input.eventCode,
      firstAction: sequence === 2 ? input.microActionId : undefined,
      microActionId: input.microActionId,
      startLatencyMs: sequence === 2
        ? Math.max(0, Date.parse(input.occurredAt) - Date.parse(session.startedAt))
        : undefined,
      stepOrder: sequence,
      stepOutcome: input.outcome,
    },
    accessibility: {
      audioEnabled: false,
      controllerMode: 'TOUCH',
      instructionMode: 'TEXT',
      symbolSupport: true,
      textLevel: 'STANDARD',
    },
    presentation: {
      foregroundDurationMs: Math.max(
        0,
        Date.parse(input.occurredAt) - Date.parse(session.startedAt),
      ),
      instructionContentId: mission.id,
      screenId: 'MARKET_SIMULATION',
    },
    simulation: session.simulation,
    error: input.error,
    payload: input.payload,
    ...finalContext,
  };
}

export function buildMarketCheckoutEvents(
  session: MarketBehaviorSession,
  cart: MarketCart,
  evaluation: MarketEvaluation,
  now = new Date(),
  interactions: MarketQuantityInteraction[] = [],
): BehaviorLogRequest[] {
  const mission = session.mission ?? marketMission;
  const checkoutOccurredAt = now.toISOString();
  const interactionsFor = (productId: string) => interactions
    .filter((interaction) => interaction.productId === productId);
  const selectedAt = (productId: string) => interactionsFor(productId)
    .find((interaction) => interaction.selectedQuantity > 0)?.occurredAt ?? checkoutOccurredAt;
  const quantityCheckedAt = (productId: string) => interactionsFor(productId).at(-1)?.occurredAt
    ?? checkoutOccurredAt;
  const inputs: EventInput[] = [
    {
      eventCode: 'SHOP.LIST_OPENED',
      microActionId: 'OPEN_SHOPPING_LIST',
      occurredAt: session.startedAt,
      outcome: 'INCOMPLETE',
      payload: { listOpenCount: 1, type: 'SHOPPING' },
    },
  ];

  mission.objectives.forEach((objective) => {
    const selectedQuantity = getCartQuantity(cart, objective.productId);
    const product = getMarketProduct(objective.productId);
    if (selectedQuantity === 0) {
      inputs.push({
        error: { omissionCount: 1 },
        eventCode: 'SHOP.ITEM_MISSING',
        microActionId: `CHECK_ITEM_${objective.productId}`,
        occurredAt: checkoutOccurredAt,
        outcome: 'FAILURE',
        payload: {
          itemId: objective.productId,
          requiredQuantity: objective.quantity,
          selectedQuantity,
          type: 'SHOPPING',
        },
      });
    } else {
      inputs.push({
        eventCode: 'SHOP.ITEM_SELECTED',
        microActionId: `CHECK_ITEM_${objective.productId}`,
        occurredAt: selectedAt(objective.productId),
        outcome: 'SUCCESS',
        payload: {
          itemId: objective.productId,
          priceAmount: product ? product.price * selectedQuantity : undefined,
          requiredQuantity: objective.quantity,
          selectedQuantity,
          type: 'SHOPPING',
        },
      });
    }
    inputs.push({
      eventCode: 'SHOP.QUANTITY_CHANGED',
      microActionId: `CHECK_QUANTITY_${objective.productId}`,
      occurredAt: quantityCheckedAt(objective.productId),
      outcome: selectedQuantity === objective.quantity ? 'SUCCESS' : 'FAILURE',
      payload: {
        itemId: objective.productId,
        requiredQuantity: objective.quantity,
        selectedQuantity,
        type: 'SHOPPING',
      },
    });
  });

  evaluation.extra.forEach((extra) => {
    inputs.push({
      error: { wrongActionCount: 1 },
      eventCode: 'SHOP.WRONG_ITEM_SELECTED',
      microActionId: `CHECK_EXTRA_${extra.productId}`,
      occurredAt: selectedAt(extra.productId),
      outcome: 'FAILURE',
      payload: {
        itemId: extra.productId,
        requiredQuantity: 0,
        selectedQuantity: extra.quantity,
        type: 'SHOPPING',
      },
    });
  });

  inputs.push({
    eventCode: evaluation.overBudget > 0 ? 'SHOP.BUDGET_EXCEEDED' : 'SHOP.PRICE_CHECKED',
    microActionId: 'CHECK_BUDGET',
    occurredAt: checkoutOccurredAt,
    outcome: evaluation.overBudget > 0 ? 'FAILURE' : 'SUCCESS',
    payload: {
      budgetAmount: mission.budget,
      priceAmount: evaluation.total,
      type: 'SHOPPING',
    },
  });

  const completionTimeMs = Math.max(0, now.getTime() - Date.parse(session.startedAt));
  return inputs.map((input, index) => {
    const sequence = index + 1;
    const isLast = sequence === inputs.length;
    return eventRequest(session, input, sequence, isLast ? {
      sessionEnd: { interruptionCount: 0, interruptionTimeMs: 0, reason: 'COMPLETED' },
      taskResult: {
        completionQuality: completionQuality(cart, evaluation, mission),
        completionTimeMs,
        taskCompleted: evaluation.success,
      },
    } : undefined);
  });
}

export function buildMarketAbortEvents(
  session: MarketBehaviorSession,
  now = new Date(),
): BehaviorLogRequest[] {
  const occurredAt = now.toISOString();
  const list = eventRequest(session, {
    eventCode: 'SHOP.LIST_OPENED',
    microActionId: 'OPEN_SHOPPING_LIST',
    occurredAt: session.startedAt,
    outcome: 'INCOMPLETE',
    payload: { listOpenCount: 1, type: 'SHOPPING' },
  }, 1);
  const abort = eventRequest(session, {
    eventCode: 'COMMON.ABORT',
    microActionId: 'EXIT_MARKET',
    occurredAt,
    outcome: 'INCOMPLETE',
    payload: { type: 'SHOPPING' },
  }, 2, {
    sessionEnd: { interruptionCount: 0, interruptionTimeMs: 0, reason: 'USER_ABORTED' },
    taskResult: {
      completionQuality: 0,
      completionTimeMs: Math.max(0, now.getTime() - Date.parse(session.startedAt)),
      taskCompleted: false,
    },
  });
  return [list, abort];
}
