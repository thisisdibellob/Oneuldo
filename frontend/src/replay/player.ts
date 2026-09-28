import { validateMarketReplayTrace, type MarketReplayStep, type MarketReplayTrace } from '../game/marketReplayTrace';
import { assertReplayActive, replayAwait, replayDelay, replayStep, replayUntil, type ReplayMotionPort, type ReplayUiPort } from './ports';
import { createMotionReport, dragProduct, walkToAnchor, walkToStation, walkToVisibleStation } from './motor';
import { replayPresentationKey, validateReplayPresentation } from '../game/marketReplayPerception';

export type ReplayProgress = {
  status: 'running' | 'completed' | 'failed' | 'stopped'; stepIndex: number; stepId?: string;
  error?: string; report: ReturnType<typeof createMotionReport> & { startedAt: string; endedAt?: string; acknowledged: boolean; completedSteps: { id: string; type: string; startedAt: string; finishedAt: string; reason: string }[] };
};
export async function playMarketTrace(trace: MarketReplayTrace, getUi: () => ReplayUiPort | null,
  motion: ReplayMotionPort, signal: AbortSignal, onProgress: (progress: ReplayProgress) => void): Promise<void> {
  const ui = () => { const port = getUi(); if (!port) throw new Error('The shopping screen is no longer mounted'); return port; };
  const snapshot = ui().snapshot();
  const validation = validateMarketReplayTrace(trace, snapshot);
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  const strict = trace.traceSchemaVersion === '2', presentation = snapshot.presentation;
  if (strict && (!presentation || !validateReplayPresentation(presentation))) throw new Error('Attention replay requires the actual bound app presentation');
  const checkPresentation = () => {
    if (strict && replayPresentationKey(ui().presentation?.() ?? motion.read().presentation) !== replayPresentationKey(presentation)) {
      throw new Error('Replay viewport, zoom or accessibility presentation changed');
    }
  };
  checkPresentation();
  if (!ui().read().briefing || ui().read().briefingStep !== 0) throw new Error('Replay must start on the first page of an untouched mission briefing');
  const report: ReplayProgress['report'] = { ...createMotionReport(), startedAt: new Date().toISOString(), acknowledged: false, completedSteps: [] };
  let index = 0;
  const progress = (status: ReplayProgress['status'], error?: string) => onProgress({ status, stepIndex: index,
    stepId: trace.steps[index]?.id, ...(error ? { error } : {}), report: JSON.parse(JSON.stringify(report)) });
  const shelf = () => { const port = ui().shelf(); if (!port) throw new Error('No open shelf'); return port; };
  const interact = async (station: Parameters<ReplayUiPort['interact']>[0], signal: AbortSignal) => {
    await replayUntil(() => !motion.read().locked, signal);
    ui().interact(station);
    await replayDelay(40, signal);
  };
  async function execute(step: MarketReplayStep, signal: AbortSignal): Promise<void> {
    assertReplayActive(signal);
    checkPresentation();
    switch (step.type) {
      case 'start': {
        let pages = 0;
        while (ui().read().briefing) {
          if (++pages > 30) throw new Error('Briefing did not advance');
          const before = ui().read().briefingStep;
          ui().advanceBriefing();
          await replayUntil(() => !ui().read().briefing || ui().read().briefingStep !== before, signal);
          if (ui().read().briefing) await replayDelay(step.reactionDelayMs, signal);
        }
        await replayUntil(() => !motion.read().locked, signal); return;
      }
      case 'walkTo':
        if (strict) await walkToVisibleStation(motion, step.target.stationId, presentation!, step.movement, signal, report, step.timeoutMs);
        else await walkToStation(motion, step.target.stationId, step.movement, signal, report, step.timeoutMs);
        return;
      case 'walkToAnchor': await walkToAnchor(motion, step.target.anchorId, presentation!, step.movement, signal, report, step.timeoutMs); return;
      case 'readList':
        if (ui().read().briefing || ui().read().phase !== 'shopping' || ui().read().shelf || ui().read().cartOpen || ui().read().helpOpen || ui().read().staffOpen || motion.read().locked) {
          throw new Error('Shopping list is not visible on the world HUD');
        }
        if (!ui().scrollList) throw new Error('Shopping list reading input is unavailable');
        for (const fraction of [0, .25, .5, .75, 1]) {
          assertReplayActive(signal); checkPresentation();
          ui().scrollList!(fraction);
          await replayDelay(step.durationMs / 5, signal);
        }
        return;
      case 'pause': case 'lookAround': await replayDelay(step.durationMs, signal); return;
      case 'openShelf':
        await interact(step.stationId, signal);
        await replayUntil(() => ui().read().shelf === step.stationId && !!ui().shelf(), signal); return;
      case 'browse': shelf().scroll(step.scrollFraction); await replayDelay(step.durationMs, signal); return;
      case 'dragProduct':
        for (let quantity = 0; quantity < step.quantity; quantity++) {
          const before = ui().read().cart[step.productId] ?? 0;
          await dragProduct(shelf(), step.productId, step.gesture, signal, report, strict, strict ? checkPresentation : undefined);
          const after = ui().read().cart[step.productId] ?? 0;
          if (after !== before + (step.gesture.outcome === 'drop' ? 1 : 0)) throw new Error(`Drag outcome did not match for ${step.productId}`);
        }
        return;
      case 'removeProduct':
        shelf().viewCart(true); await replayDelay(260, signal);
        for (let quantity = 0; quantity < step.quantity; quantity++) {
          const before = ui().read().cart[step.productId] ?? 0;
          shelf().remove(step.productId); await replayDelay(80, signal);
          if ((ui().read().cart[step.productId] ?? 0) !== before - 1) throw new Error('Product return was rejected');
        }
        shelf().viewCart(false); await replayDelay(260, signal); return;
      case 'viewCart':
        if (ui().read().helpOpen || ui().read().cartOpen || ui().read().staffOpen || ui().read().phase !== 'shopping') throw new Error('Cart button is not visible; close the current panel first');
        if (ui().shelf()) shelf().viewCart(true); else ui().viewCart();
        await replayDelay(260, signal); return;
      case 'viewHelp':
        if (ui().read().shelf || ui().read().cartOpen || ui().read().staffOpen || ui().read().phase !== 'shopping') throw new Error('Help button is not visible; close the current panel first');
        ui().viewHelp(); await replayDelay(260, signal); return;
      case 'closeView': ui().closeView(); await replayDelay(280, signal); return;
      case 'closeStation':
        ui().closeStation(); await replayUntil(() => !ui().read().shelf && !ui().read().staffOpen && ui().read().phase !== 'checkout', signal);
        await replayUntil(() => !motion.read().locked, signal); return;
      case 'talkToStaff':
        if (!ui().read().staffOpen) await interact(step.stationId, signal);
        await replayUntil(() => ui().read().staffOpen, signal);
        if (step.choice === 'requestCashier') {
          if (!step.checkoutId) throw new Error('A cashier request must select a visible checkout choice');
          if (ui().read().staffReturnHelp) { ui().backToStaff(); await replayDelay(250, signal); }
          ui().requestCashier(step.checkoutId);
        }
        if (step.choice === 'returnProduct') {
          if (!ui().read().staffReturnHelp) { ui().openReturnHelp(); await replayDelay(250, signal); }
          const productId = step.productId!, quantity = step.quantity!;
          const before = ui().read().cart[productId] ?? 0;
          if (quantity < 1 || quantity > before) throw new Error('The requested return quantity is unavailable');
          // The dialogue offers exactly one item or all items. A partial quantity
          // therefore presses the one-item choice repeatedly, never an invisible choice.
          let remaining = quantity;
          while (remaining > 0) {
            const count = ui().read().cart[productId] ?? 0;
            const amount = remaining === count ? remaining : 1;
            ui().requestReturn(productId, amount);
            await replayUntil(() => (ui().read().cart[productId] ?? 0) === count - amount, signal);
            remaining -= amount;
            await replayDelay(250, signal);
          }
        }
        await replayDelay(100, signal); return;
      case 'checkout':
        await interact(step.checkoutId, signal); await replayUntil(() => ui().read().phase === 'checkout', signal); return;
      case 'submitForReview':
        if (ui().read().phase !== 'checkout') throw new Error('Purchase confirmation is not visible');
        // Existing app handlers own their HTTP calls. Stop waiting without issuing a next input.
        await replayAwait(() => ui().submit(), signal);
        if (ui().read().reviewError) throw new Error(ui().read().reviewError!);
        return;
      case 'awaitReviewAccepted':
        await replayUntil(() => {
          if (ui().read().reviewError) throw new Error(ui().read().reviewError!);
          return ui().read().reviewAccepted;
        }, signal, step.timeoutMs); return;
      case 'giveUp': ui().giveUp(); await replayUntil(() => ui().read().phase === 'finished', signal); return;
      case 'skipRating':
        if (ui().read().phase !== 'finished') throw new Error('Rating is not available');
        ui().skipRating(); await replayDelay(80, signal); return;
      case 'leave':
        if (!ui().read().reviewAccepted && ui().read().phase !== 'finished') throw new Error('The exit button is not available');
        await replayAwait(() => ui().leave(), signal); report.acknowledged = true; return;
      default: throw new Error(`Unsupported replay step: ${(step as { type: string }).type}`);
    }
  }
  try {
    for (index = 0; index < trace.steps.length; index++) {
      const step = trace.steps[index];
      progress('running');
      await replayDelay(step.reactionDelayMs, signal);
      const startedAt = new Date().toISOString();
      await replayStep(stepSignal => execute(step, stepSignal), signal, step.timeoutMs);
      assertReplayActive(signal);
      // Acknowledged leave deliberately unmounts this UI and restores the village camera.
      if (step.type !== 'leave') checkPresentation();
      report.completedSteps.push({ id: step.id, type: step.type, reason: step.reason, startedAt, finishedAt: new Date().toISOString() });
      progress('running');
    }
    report.endedAt = new Date().toISOString(); progress('completed');
  } catch (error) {
    report.endedAt = new Date().toISOString(); progress(signal.aborted ? 'stopped' : 'failed', error instanceof Error ? error.message : String(error));
  } finally { motion.stop(); }
}
