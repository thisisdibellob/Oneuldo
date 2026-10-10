import type { MarketReplaySnapshot, MarketReplaySystemCompletion } from '../game/marketReplayTrace';
import type { MarketCashierAvailability, MarketEnvironment, MarketEnvironmentStationId } from '../game/marketEnvironment';
import type { Point } from '../game/prototypeWorld';
import type { ReplayPresentation } from '../game/marketReplayPerception';

/** Input-only ports. There deliberately is no position setter or add-product command. */
export interface ReplayMotionPort {
  read(): { position: Point; environment: MarketEnvironment; cashiers: Partial<MarketCashierAvailability>; locked: boolean; presentation?: ReplayPresentation };
  drive(frame: (timestamp: number, dt: number) => Point): void;
  stop(): void;
}
export type ReplayBounds = Point & { width: number; height: number };
export interface ReplayShelfPort {
  measure(productId: string, options?: { visibleOnly?: boolean }): Promise<{ product: ReplayBounds; basket: ReplayBounds }>;
  scroll(fraction: number): void;
  start(productId: string, point: Point): void;
  move(point: Point): void;
  finish(point: Point, cancelled?: boolean): void;
  close(): void;
  viewCart(open: boolean): void;
  remove(productId: string): void;
}
export interface ReplayUiState {
  briefing: boolean; briefingStep: number; phase: string; shelf: string | null;
  cartOpen: boolean; helpOpen: boolean; staffOpen: boolean; staffReturnHelp: boolean; panelTransition: boolean;
  reviewing: boolean; reviewAccepted: boolean; reviewError: string | null;
  cart: Record<string, number>;
}
export interface ReplayUiPort {
  snapshot(): MarketReplaySnapshot;
  presentation?(): ReplayPresentation | undefined;
  scrollList?(fraction: number): void;
  sessionId(): string | null;
  read(): ReplayUiState;
  shelf(): ReplayShelfPort | null;
  advanceBriefing(): void;
  interact(station: MarketEnvironmentStationId): void;
  viewCart(): void;
  viewHelp(): void;
  closeView(): void;
  closeStation(): void;
  requestCashier(checkoutId: 'checkout' | 'checkout-2'): void;
  requestReturn(productId: string, quantity: number): void;
  openReturnHelp(): void;
  backToStaff(): void;
  beginSystemCompletion?(metadata: MarketReplaySystemCompletion): void;
  submit(): Promise<void>;
  giveUp(): void;
  skipRating(): void;
  leave(): Promise<void>;
}

export function replayDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error(String(signal.reason ?? 'Replay stopped'))); return; }
    const cancel = () => { clearTimeout(timer); reject(new Error(String(signal.reason ?? 'Replay stopped'))); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, ms);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

export function assertReplayActive(signal: AbortSignal): void {
  if (signal.aborted) throw new Error(String(signal.reason instanceof Error ? signal.reason.message : signal.reason ?? 'Replay stopped'));
}

/** Stop waiting immediately. An already dispatched app HTTP request remains app-owned. */
export function replayAwait<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  let cancel: () => void;
  const waiting = new Promise<T>((resolve, reject) => {
    cancel = () => {
      try { assertReplayActive(signal); } catch (error) { reject(error); }
    };
    signal.addEventListener('abort', cancel, { once: true });
    try { assertReplayActive(signal); Promise.resolve(operation()).then(resolve, reject); }
    catch (error) { reject(error); }
  });
  return waiting.finally(() => signal.removeEventListener('abort', cancel));
}

/** One deadline and abort signal reach every loop and async wait within the step. */
export async function replayStep<T>(operation: (signal: AbortSignal) => Promise<T>, parent: AbortSignal, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const stop = () => controller.abort(parent.reason ?? 'Replay stopped');
  parent.addEventListener('abort', stop, { once: true });
  if (parent.aborted) stop();
  const deadline = setTimeout(() => controller.abort(`Replay step timed out after ${timeoutMs}ms`), timeoutMs);
  try { return await replayAwait(() => operation(controller.signal), controller.signal); }
  finally { clearTimeout(deadline); parent.removeEventListener('abort', stop); }
}

export async function replayUntil(check: () => boolean, signal: AbortSignal, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    assertReplayActive(signal);
    if (check()) { assertReplayActive(signal); return; }
    if (Date.now() > deadline) throw new Error('The expected game screen did not become available.');
    await replayDelay(32, signal);
  }
}
