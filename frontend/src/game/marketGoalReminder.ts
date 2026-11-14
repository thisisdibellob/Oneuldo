import type { MarketMission } from './scenarios';

export const MARKET_GOAL_REMINDER_CONTRACT = 'goal-reminder-v1' as const;
export const MARKET_GOAL_REMINDER_TITLE = '퀘스트 안내 다시 보기';

/** goal-reminder-v1: once every listed product is in the cart in at least the listed quantity, the open cart
 * re-shows the quest's own entry text (description + briefing). It repeats existing quest wording only:
 * no new instruction, no exact-quantity or budget judgement, and nothing is shown before the items are in the cart. */
export function marketGoalReminderLines(cart: Record<string, number> | null | undefined,
  mission: Pick<MarketMission, 'description' | 'briefing' | 'objectives'> | null | undefined): string[] | null {
  if (!cart || !mission?.objectives?.length) return null;
  const reached = mission.objectives.every(objective => (cart[objective.productId] ?? 0) >= objective.quantity);
  return reached ? [mission.description, ...mission.briefing] : null;
}
