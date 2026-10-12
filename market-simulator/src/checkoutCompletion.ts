import type { MarketReplayStep, MarketReplaySystemCompletion } from '../../frontend/src/game/marketReplayTrace';
import { getMarketStationApproachPoint, type MarketEnvironmentStationId } from '../../frontend/src/game/marketEnvironment';
import { getMarketNavigationPath } from '../../frontend/src/game/marketNavigation';
import { planWalk } from './navigation';
import { Random } from './random';
import type { TraceGuard } from './traceValidation';
import type { Observation } from './types';

type Intent = MarketReplayStep extends infer S ? S extends MarketReplayStep ? Omit<S, 'id' | 'reactionDelayMs' | 'reason' | 'timeoutMs'> : never : never;

/** Controller-owned ending only. Never selects, removes or corrects a product. */
export function appendCheckoutCompletion(guard: TraceGuard, firstStepId: string, seed: string | number,
  append: (intent: Intent, reason: string, timeoutMs?: number) => void): MarketReplaySystemCompletion {
  const reason = '시스템 마무리: 100회 행동 이후 현재 장바구니를 그대로 계산한다. 페르소나의 자발적 선택이 아니다.';
  if (guard.observe().view !== 'world') append({ type: 'closeView' }, `${reason} 열린 보기 화면을 닫는다.`);
  if (guard.observe().activeStation) append({ type: 'closeStation' }, `${reason} 열린 대화를 닫는다.`);
  // Read through the existing adapter instead of reconstructing inventory rules.
  append({ type: 'viewCart' }, `${reason} 현재 담긴 수량을 확인한다.`);
  const cartAtStart = { ...guard.observe().cart! };
  append({ type: 'closeView' }, `${reason} 장바구니를 변경하지 않고 닫는다.`);
  const movement = (station: MarketEnvironmentStationId) => ({ style: 'steady' as const, speedMultiplier: .65,
    running: false as const, motorSeed: `system-checkout:${String(seed).slice(0,120)}:${station}`, accelerationMs: 220 });
  // The offline guard samples an approach; the app motor uses the nearest approach.
  // Require both routes instead of treating either planner's success as proof of the other.
  const routes = (observation: Observation, station: MarketEnvironmentStationId) => {
    const offline = planWalk(observation, station, new Random(movement(station).motorSeed), 190 * .65);
    if (!offline) return null;
    const actual = getMarketStationApproachPoint(observation.environment, station, observation.playerPosition, observation.cashierAvailability);
    if (!actual || !getMarketNavigationPath(observation.environment, observation.playerPosition, actual, observation.cashierAvailability)) return null;
    const planned = { ...observation.playerPosition };
    for (const decision of offline) if (decision.action.type === 'move') {
      planned.x += decision.action.dx; planned.y += decision.action.dy;
    }
    return [planned, actual];
  };
  const walk = (station: MarketEnvironmentStationId) => append({ type: 'walkTo', target: { stationId: station },
    movement: movement(station) }, `${reason} ${station}까지 통로를 따라 걸어간다.`);
  const start = guard.observe();
  const staffedCounters = start.environment.checkouts.filter(counter => counter.kind !== 'kiosk');
  let checkout = staffedCounters.find(counter => start.cashierAvailability[counter.id] && routes(start, counter.id));
  if (!checkout) {
    // Current game rules recruit the first staffed counter, ignoring a legacy
    // requested ID, and decline requests when any staffed counter is occupied.
    // Plan only that actual state transition; never assume staff can be sent to
    // a more convenient empty lane or change the game's placement/penalty rules.
    const recruited = staffedCounters.every(counter => !start.cashierAvailability[counter.id]) ? staffedCounters[0] : undefined;
    let candidate: { employee: MarketEnvironmentStationId; checkout: typeof start.environment.checkouts[number] } | undefined;
    for (const employee of recruited ? start.environment.stationDetails.filter(station => station.kind === 'employee') : []) {
      const departures = routes(start, employee.id);
      if (!departures) continue;
      const cashierAvailability = { ...start.cashierAvailability, [recruited!.id]: true };
      // Staffing adds an obstacle. Check the onward route after that change, from
      // both possible employee approaches, before dispatching any staff input.
      if (departures.every(playerPosition => routes({ ...start, playerPosition, cashierAvailability }, recruited!.id))) {
        candidate = { employee: employee.id, checkout: recruited! }; break;
      }
    }
    if (!candidate) throw new Error('SYSTEM_CHECKOUT_UNAVAILABLE: no reachable staffed checkout or employee-to-checkout route');
    walk(candidate.employee);
    append({ type: 'talkToStaff', stationId: candidate.employee, choice: 'open' }, `${reason} 직원에게 말을 건다.`);
    append({ type: 'talkToStaff', stationId: candidate.employee, choice: 'requestCashier', checkoutId: candidate.checkout.id }, `${reason} 계산원을 요청한다.`);
    append({ type: 'closeStation' }, `${reason} 직원 대화를 마친다.`);
    checkout = candidate.checkout;
  }
  if (!routes(guard.observe(), checkout.id)) throw new Error('SYSTEM_CHECKOUT_UNAVAILABLE: checkout route is blocked');
  walk(checkout.id);
  append({ type: 'checkout', checkoutId: checkout.id }, `${reason} 계산대를 연다.`);
  append({ type: 'submitForReview' }, `${reason} 빈 장바구니도 포함해 현재 담긴 물건만 구매 확정·분석 요청한다.`);
  append({ type: 'awaitReviewAccepted' }, `${reason} 실제 앱의 로그 저장·분석 접수를 기다린다.`, 180000);
  append({ type: 'leave' }, `${reason} 접수 확인 후 정상적으로 게임을 나간다.`);
  return { reason: 'action-limit', afterDecisions: 100, actionLimit: 100, firstStepId, checkoutId: checkout.id, cartAtStart };
}
