/** Text rendered by MarketSimulationScreen's aiAssessment checkout modal.
 * Kept separate from actor advice: no goal comparison or suggested decision is added.
 * A source-parity test protects this copy until the UI shares a text module.
 */
export const FEEDBACK_CHECKOUT_SCREEN_TEXT = Object.freeze({
  readyTitle: '이대로 구매할까요?',
  confirmation: '구매를 확정하면 이번 시도가 기록되고 결과가 나와요.',
  emptyTitle: '계산원이 자리를 비웠어요',
  emptyGuidance: '다른 계산대나 무인 계산대를 살펴보세요. 유인 계산대가 모두 비었다면 직원에게 부탁해요.',
});

export function feedbackCheckoutScreenLines(dialogue: readonly string[], ready: boolean): string[] {
  return ready
    ? [FEEDBACK_CHECKOUT_SCREEN_TEXT.readyTitle, ...dialogue, FEEDBACK_CHECKOUT_SCREEN_TEXT.confirmation]
    : [FEEDBACK_CHECKOUT_SCREEN_TEXT.emptyTitle, FEEDBACK_CHECKOUT_SCREEN_TEXT.emptyGuidance];
}
