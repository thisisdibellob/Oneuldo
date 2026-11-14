import { getBusDriverQuiz, selectBusDriverQuiz } from './busDriverQuiz';
import { getBusPassengerPlace, type BusPassengerPlaceId } from './busWorld';

/** Fictional city routes. The UI owns clocks, motion, doors and pause handling. */
export type BusStopId = 'village' | 'park' | 'library' | 'civic' | 'gym' | 'neuti';
export type BusDirection = 'outbound' | 'inbound';
export type BusRouteId = '201' | '305';
export type BusPhase = 'prepare' | 'waiting' | 'boarding' | 'riding' | 'stopped' | 'alighting' | 'arrived' | 'completed';
export type BusGuidance = 'guided' | 'independent';
export type BusDestination = 'library' | 'village';
export type BusCheckpoint = { stop: BusStopId; direction: BusDirection };
export type BusEvent = { sequence: number; type: string; payload: Record<string, string | number | boolean | null> };
export type BusSession = {
  id: string;
  startedAt: number;
  completedAt: number | null;
  phase: BusPhase;
  destination: BusDestination;
  stop: BusStopId;
  direction: BusDirection;
  cardPacked: boolean;
  routeOpened: boolean;
  route: BusRouteId | null;
  nextStop: BusStopId | null;
  bellRequested: boolean;
  boardingApproved: boolean;
  alightingApproved: boolean;
  seatSecured: boolean;
  securedAt?: 'seat' | 'handrail' | null;
  passengerPlaceId?: BusPassengerPlaceId | null;
  guidance: BusGuidance;
  events: BusEvent[];
  checkpoint: BusCheckpoint | null;
  offeredRoute: BusRouteId | null;
  rideId: string | null;
  rideNumber: number;
  lastActionError: string | null;
};
export type BusSessionConfig = {
  id?: string; startedAt?: number; guidance?: BusGuidance;
  destination?: BusDestination; stop?: BusStopId; direction?: BusDirection;
  cardPacked?: boolean; routeOpened?: boolean; phase?: 'prepare' | 'waiting';
};
export type BusAction =
  | { type: 'OPEN_ROUTE' }
  | { type: 'PACK_CARD' }
  | { type: 'GO_TO_STOP' }
  | { type: 'RETURN_HOME' }
  | { type: 'ARRIVE_VEHICLE'; route: BusRouteId }
  | { type: 'VEHICLE_LEAVE' }
  | { type: 'BOARD' }
  | { type: 'OPEN_DRIVER_QUIZ' }
  | { type: 'ANSWER_DRIVER_QUIZ'; quizId: string; choiceId: string }
  | { type: 'DISMISS_DRIVER_QUIZ' }
  | { type: 'TAP_BOARDING_CARD' }
  | { type: 'TAKE_SEAT'; placeId?: BusPassengerPlaceId }
  | { type: 'HOLD_HANDRAIL'; placeId?: BusPassengerPlaceId }
  | { type: 'DEPART' }
  | { type: 'REQUEST_STOP' }
  | { type: 'REACH_NEXT_STOP'; expectedStop?: BusStopId }
  | { type: 'CONTINUE_RIDE' }
  | { type: 'STAND_UP' }
  | { type: 'TAP_ALIGHTING_CARD' }
  | { type: 'ALIGHT' }
  | { type: 'LEAVE_BEFORE_DEPARTURE' }
  | { type: 'CROSS_ROAD' }
  | { type: 'RESTORE_CHECKPOINT' }
  | { type: 'REPORT_ARRIVAL'; at?: number }
  | { type: 'COMPLETE_JOURNEY'; at?: number }
  | { type: 'SET_GUIDANCE'; guidance: BusGuidance }
  | { type: 'ASK_HELP'; source: 'phone' | 'minsu' | 'jiyoung' | 'driver' }
  | { type: 'CHECK_LOCATION' }
  | { type: 'REPLAY_ANNOUNCEMENT' };

export const STOP_NAMES: Record<BusStopId, string> = {
  village: '마을앞', park: '중앙공원', library: '하늘도서관', civic: '늘봄주민센터', gym: '체육관', neuti: '느티광장',
};
const ROUTES: Record<BusRouteId, readonly BusStopId[]> = {
  '201': ['neuti', 'village', 'park', 'library', 'civic'],
  '305': ['neuti', 'village', 'park', 'gym'],
};
const opposite = (direction: BusDirection): BusDirection => direction === 'outbound' ? 'inbound' : 'outbound';
export function getBusRouteStops(route: BusRouteId, direction: BusDirection): readonly BusStopId[] {
  return direction === 'outbound' ? [...ROUTES[route]] : [...ROUTES[route]].reverse();
}
export function getNextBusStop(route: BusRouteId, stop: BusStopId, direction: BusDirection): BusStopId | null {
  const stops = getBusRouteStops(route, direction);
  const index = stops.indexOf(stop);
  return index < 0 ? null : stops[index + 1] ?? null;
}
export function isTerminalStop(route: BusRouteId, stop: BusStopId, direction: BusDirection): boolean {
  return getBusRouteStops(route, direction).at(-1) === stop;
}
export function getAvailableBusRoutes(stop: BusStopId, direction: BusDirection): BusRouteId[] {
  return (['201', '305'] as const).filter(route => getNextBusStop(route, stop, direction) !== null);
}
export function getBusDestination(route: BusRouteId, direction: BusDirection): string {
  return `${STOP_NAMES[getBusRouteStops(route, direction).at(-1)!]} 방면`;
}

let sessionNumber = 0;
export function createBusSession(config: BusSessionConfig = {}): BusSession {
  const startedAt = config.startedAt ?? Date.now();
  const guidance = config.guidance ?? 'guided';
  const destination = config.destination ?? 'library';
  const stop = config.stop ?? (destination === 'village' ? 'library' : 'village');
  const direction = config.direction ?? (destination === 'village' ? 'inbound' : 'outbound');
  const phase = config.phase ?? (stop === 'village' ? 'prepare' : 'waiting');
  const cardPacked = config.cardPacked ?? stop !== 'village';
  if (!Number.isFinite(startedAt) || !['guided', 'independent'].includes(guidance)
    || !['library', 'village'].includes(destination) || !(stop in STOP_NAMES)
    || !['outbound', 'inbound'].includes(direction) || !['prepare', 'waiting'].includes(phase)
    || (phase === 'prepare' && stop !== 'village') || (!cardPacked && stop !== 'village')) throw new Error('버스 이동 설정을 확인해 주세요.');
  return {
    id: config.id ?? `bus:${startedAt}:${++sessionNumber}`, startedAt, completedAt: null,
    phase, destination, stop, direction, cardPacked, routeOpened: config.routeOpened ?? phase === 'waiting',
    route: null, nextStop: null, bellRequested: false, boardingApproved: false, alightingApproved: false,
    seatSecured: false, securedAt: null, passengerPlaceId: null, guidance, events: [], checkpoint: phase === 'waiting' ? { stop, direction } : null, offeredRoute: null,
    rideId: null, rideNumber: 0, lastActionError: null,
  };
}

function record(session: BusSession, type: string, payload: BusEvent['payload'] = {}): BusSession {
  return { ...session, lastActionError: null, events: [...session.events, {
    sequence: session.events.length + 1, type,
    payload: { stop: session.stop, direction: session.direction, destination: session.destination, rideId: session.rideId, guidance: session.guidance, ...payload },
  }] };
}
const reject = (session: BusSession, message: string): BusSession => ({ ...session, lastActionError: message });
function clearVehicle(session: BusSession): BusSession {
  return { ...session, route: null, nextStop: null, bellRequested: false, boardingApproved: false,
    alightingApproved: false, seatSecured: false, securedAt: null, passengerPlaceId: null, offeredRoute: null, rideId: null };
}
const isOutside = (session: BusSession) => session.phase === 'waiting' || session.phase === 'arrived';

/** Invalid/stale inputs cannot skip a safety step. Timers dispatch only after all UI pauses have ended. */
export function reduceBusSession(previous: BusSession, action: BusAction): BusSession {
  if (previous.phase === 'completed') return previous;
  const session = previous.lastActionError ? { ...previous, lastActionError: null } : previous;
  switch (action.type) {
    case 'SET_GUIDANCE':
      if (!['guided', 'independent'].includes(action.guidance)) return reject(session, '안내 방식을 확인해 주세요.');
      return action.guidance === session.guidance ? session : record({ ...session, guidance: action.guidance }, 'guidance_changed');
    case 'OPEN_ROUTE':
      return record({ ...session, routeOpened: true }, 'route_opened');
    case 'CHECK_LOCATION':
      return record(session, 'location_checked', { nextStop: session.nextStop });
    case 'ASK_HELP':
      if (action.source === 'driver' && session.phase === 'riding') return reject(session, '정차하면 물어볼 수 있어요.');
      if (action.source === 'driver' && !session.route && !session.offeredRoute) return reject(session, '버스가 정차하면 물어볼 수 있어요.');
      return record(session, 'help_requested', { source: action.source, route: session.route ?? session.offeredRoute });
    case 'REPLAY_ANNOUNCEMENT':
      if (!session.route) return session;
      return record(session, 'announcement_replayed', { announcedStop: session.phase === 'riding' ? session.nextStop : session.stop });
    case 'PACK_CARD':
      if (session.cardPacked) return session;
      if (session.phase !== 'prepare' || session.stop !== 'village') return reject(session, '집 앞에서 교통카드를 챙겨 주세요.');
      return record({ ...session, cardPacked: true }, 'card_packed');
    case 'GO_TO_STOP':
      if (session.phase !== 'prepare') return session;
      if (!session.routeOpened) return reject(session, '휴대폰에서 가는 길을 확인해 주세요.');
      return record({ ...session, phase: 'waiting', checkpoint: { stop: session.stop, direction: session.direction } }, 'stop_reached');
    case 'RETURN_HOME':
      if (session.phase !== 'waiting' || session.stop !== 'village') return reject(session, '마을앞 정류장에서 집으로 돌아갈 수 있어요.');
      return record({ ...clearVehicle(session), phase: 'prepare' }, 'returned_home');
    case 'ARRIVE_VEHICLE':
      if (!isOutside(session) || session.offeredRoute) return session;
      if (!getAvailableBusRoutes(session.stop, session.direction).includes(action.route)) return session;
      return record({ ...session, offeredRoute: action.route }, 'vehicle_arrived', { route: action.route });
    case 'VEHICLE_LEAVE':
      if (!isOutside(session) || !session.offeredRoute) return session;
      return record({ ...session, offeredRoute: null }, 'vehicle_waited_for', { route: session.offeredRoute });
    case 'BOARD': {
      if (!isOutside(session) || !session.offeredRoute) return session;
      const route = session.offeredRoute;
      const nextStop = getNextBusStop(route, session.stop, session.direction);
      if (!nextStop) return session;
      const rideNumber = session.rideNumber + 1;
      const suggested = outsidePlan(session.stop, session.direction, session.destination).steps[0];
      const destinationAhead = getBusRouteStops(route, session.direction).slice(getBusRouteStops(route, session.direction).indexOf(session.stop) + 1).includes(session.destination);
      return record({ ...clearVehicle(session), route, nextStop, phase: 'boarding', rideNumber,
        rideId: `${session.id}:ride:${rideNumber}` }, 'boarded', { route,
        quizId: selectBusDriverQuiz(session, rideNumber),
        destinationAhead,
        onHelpfulRoute: destinationAhead || (suggested?.kind === 'board' && suggested.route === route),
      });
    }
    case 'OPEN_DRIVER_QUIZ': {
      const quiz = getBusDriverQuiz(session);
      if (session.phase !== 'boarding' || !session.boardingApproved || !quiz || quiz.status !== 'available') return session;
      return record(session, 'driver_quiz_opened', { quizId: quiz.quiz.id });
    }
    case 'ANSWER_DRIVER_QUIZ': {
      const quiz = getBusDriverQuiz(session);
      if (session.phase !== 'boarding' || !quiz || quiz.status !== 'asked' || quiz.quiz.id !== action.quizId
        || !quiz.quiz.choices.some(choice => choice.id === action.choiceId)) return session;
      return record(session, 'driver_quiz_answered', { quizId: quiz.quiz.id, choiceId: action.choiceId, correct: action.choiceId === quiz.quiz.correctChoiceId });
    }
    case 'DISMISS_DRIVER_QUIZ': {
      const quiz = getBusDriverQuiz(session);
      if (session.phase !== 'boarding' || !quiz || !['available', 'asked'].includes(quiz.status)) return session;
      return record(session, 'driver_quiz_skipped', { quizId: quiz.quiz.id });
    }
    case 'TAP_BOARDING_CARD':
      if (session.phase !== 'boarding' || session.boardingApproved) return session;
      if (!session.cardPacked) return reject(session, '가방에 교통카드가 없어요. 출발 전에 내려 집에서 챙길 수 있어요.');
      return record({ ...session, boardingApproved: true }, 'boarding_card_approved');
    case 'TAKE_SEAT':
    case 'HOLD_HANDRAIL': {
      if (session.phase !== 'boarding' && session.phase !== 'stopped') return session;
      if (session.alightingApproved) return session;
      if (!session.boardingApproved) return reject(session, '교통카드를 먼저 찍어 주세요.');
      const kind = action.type === 'HOLD_HANDRAIL' ? 'handrail' : 'seat';
      const placeId = action.placeId ?? (kind === 'handrail' ? 'handrail-middle' : 'seat-front-left');
      const place = getBusPassengerPlace(placeId);
      if (!place || place.kind !== kind) return reject(session, '빈 좌석이나 손잡이를 골라 주세요.');
      if (session.seatSecured && (session.passengerPlaceId === placeId || (!action.placeId && session.securedAt === kind))) return session;
      return record({ ...session, seatSecured: true, securedAt: kind, passengerPlaceId: placeId }, session.seatSecured ? 'safe_place_changed' : 'safe_place_secured', { position: kind, placeId });
    }
    case 'DEPART':
      if (session.phase !== 'boarding' || !session.route || !session.nextStop) return session;
      if (!session.boardingApproved || !session.seatSecured) return reject(session, '카드를 찍고 앉거나 손잡이를 잡아 주세요.');
      return record({ ...session, phase: 'riding' }, 'departed', { route: session.route, nextStop: session.nextStop });
    case 'REQUEST_STOP':
      if (session.phase !== 'riding' || !session.nextStop || session.bellRequested) return session;
      return record({ ...session, bellRequested: true }, 'stop_requested', { target: session.nextStop });
    case 'REACH_NEXT_STOP': {
      if (session.phase !== 'riding' || !session.route || !session.nextStop) return session;
      if (action.expectedStop && action.expectedStop !== session.nextStop) return session;
      const stop = session.nextStop;
      const nextStop = getNextBusStop(session.route, stop, session.direction);
      const terminal = isTerminalStop(session.route, stop, session.direction);
      const shouldStop = session.bellRequested || terminal;
      return record({ ...session, stop, nextStop, bellRequested: false, phase: shouldStop ? 'stopped' : 'riding' },
        shouldStop ? 'vehicle_stopped' : 'stop_passed', { route: session.route, requested: session.bellRequested, terminal });
    }
    case 'CONTINUE_RIDE':
      if (session.phase !== 'stopped' || !session.route || !session.nextStop) return session;
      if (isTerminalStop(session.route, session.stop, session.direction)) return reject(session, '종점이에요. 내린 뒤 돌아오는 버스를 이용해 주세요.');
      if (!session.seatSecured || session.alightingApproved) return reject(session, '계속 타려면 다시 앉거나 손잡이를 잡아 주세요.');
      return record({ ...session, phase: 'riding', bellRequested: false }, 'ride_continued', { route: session.route, nextStop: session.nextStop });
    case 'STAND_UP':
      if ((session.phase !== 'stopped' && session.phase !== 'boarding') || !session.seatSecured) return session;
      return record({ ...session, seatSecured: false, securedAt: null, passengerPlaceId: null }, 'stood_up');
    case 'TAP_ALIGHTING_CARD':
      if (session.phase !== 'stopped' || session.alightingApproved) return session;
      if (session.seatSecured) return reject(session, session.securedAt === 'handrail' ? '버스가 멈췄어요. 손잡이를 놓고 하차 단말기로 가 주세요.' : '버스가 멈췄어요. 자리에서 일어나 하차 단말기로 가 주세요.');
      if (!session.cardPacked || !session.boardingApproved) return reject(session, '카드 사용 상태를 확인해 주세요.');
      return record({ ...session, phase: 'alighting', alightingApproved: true }, 'alighting_card_approved');
    case 'ALIGHT': {
      if (session.phase !== 'alighting' || !session.alightingApproved || !session.route) return session;
      const recorded = record(session, 'alighted', { route: session.route });
      return { ...clearVehicle(recorded), phase: session.stop === session.destination ? 'arrived' : 'waiting',
        checkpoint: { stop: session.stop, direction: session.direction } };
    }
    case 'LEAVE_BEFORE_DEPARTURE': {
      if (session.phase !== 'boarding') return session;
      const recorded = record(session, 'left_before_departure', { route: session.route, cardApproved: session.boardingApproved });
      return { ...clearVehicle(recorded), phase: session.stop === session.destination ? 'arrived' : 'waiting',
        checkpoint: { stop: session.stop, direction: session.direction } };
    }
    case 'CROSS_ROAD':
      if (!isOutside(session)) return session;
      return record({ ...session, direction: opposite(session.direction), offeredRoute: null,
        checkpoint: { stop: session.stop, direction: opposite(session.direction) } }, 'crossed_road');
    case 'RESTORE_CHECKPOINT': {
      if (!session.checkpoint) return session;
      const { stop, direction } = session.checkpoint;
      return record({ ...clearVehicle(session), stop, direction, phase: stop === session.destination ? 'arrived' : 'waiting' },
        'checkpoint_restored', { previousStop: session.stop, previousDirection: session.direction, previousRideId: session.rideId });
    }
    case 'REPORT_ARRIVAL': {
      if (session.destination !== 'library' || session.phase !== 'arrived' || session.stop !== 'library' || session.direction !== 'inbound') {
        return reject(session, '도서관 안내 데스크에 도착한 뒤 출근을 알려 주세요.');
      }
      if (!session.events.some(event => event.type === 'alighted' && event.payload.stop === 'library')) return session;
      const at = action.at ?? session.startedAt;
      if (!Number.isFinite(at) || at < session.startedAt) return reject(session, '완료 시간을 확인해 주세요.');
      return record({ ...session, phase: 'completed', completedAt: at, offeredRoute: null }, 'arrival_reported');
    }
    case 'COMPLETE_JOURNEY': {
      if (session.destination !== 'village' || session.phase !== 'arrived' || session.stop !== 'village') return session;
      if (!session.events.some(event => event.type === 'alighted' && event.payload.stop === 'village')) return session;
      const at = action.at ?? session.startedAt;
      if (!Number.isFinite(at) || at < session.startedAt) return reject(session, '도착 시간을 확인해 주세요.');
      return record({ ...session, phase: 'completed', completedAt: at, offeredRoute: null }, 'journey_completed');
    }
  }
}

export type BusHelpStep = {
  kind: 'prepare' | 'cross' | 'board' | 'ride' | 'alight' | 'walk' | 'report';
  text: string;
  stop: BusStopId;
  direction: BusDirection;
  route: BusRouteId | null;
};
export type BusHelpPlan = { summary: string; steps: BusHelpStep[] };

type Connection = { stop: BusStopId; direction: BusDirection; cost: number; steps: BusHelpStep[] };
const helpStep = (kind: BusHelpStep['kind'], text: string, stop: BusStopId, direction: BusDirection, route: BusRouteId | null = null): BusHelpStep => ({ kind, text, stop, direction, route });

/** Route search includes sidewalk direction, transfers and every terminal; no location-specific fallback teleport. */
function outsidePlan(stop: BusStopId, direction: BusDirection, destination: BusDestination): Connection {
  const pending: Connection[] = [{ stop, direction, cost: 0, steps: [] }];
  const visited = new Set<string>();
  while (pending.length) {
    pending.sort((a, b) => a.cost - b.cost);
    const current = pending.shift()!;
    const key = `${current.stop}:${current.direction}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (current.stop === destination && (destination === 'village' || current.direction === 'inbound')) return current;
    const crossed = opposite(current.direction);
    pending.push({ stop: current.stop, direction: crossed, cost: current.cost + 1,
      steps: [...current.steps, helpStep('cross', '횡단보도로 반대편 인도에 건너가요.', current.stop, crossed)] });
    for (const route of getAvailableBusRoutes(current.stop, current.direction)) {
      const routeStops = getBusRouteStops(route, current.direction);
      const startIndex = routeStops.indexOf(current.stop);
      routeStops.slice(startIndex + 1).forEach((destination, index) => {
        pending.push({ stop: destination, direction: current.direction, cost: current.cost + 3 + index,
          steps: [...current.steps,
            helpStep('board', `${getBusDestination(route, current.direction)} ${route}번을 타요.`, current.stop, current.direction, route),
            helpStep('ride', `${STOP_NAMES[destination]} 안내가 나오면 하차벨을 눌러요.`, destination, current.direction, route),
            helpStep('alight', `${STOP_NAMES[destination]}에 정차하면 카드를 찍고 내려요.`, destination, current.direction, route),
          ],
        });
      });
    }
  }
  throw new Error('모든 정류장에는 목적지로 돌아가는 길이 있어야 합니다.');
}

export function getBusHelpPlan(session: BusSession): BusHelpPlan {
  const destination = session.destination;
  const finish = (direction: BusDirection) => destination === 'library'
    ? [helpStep('walk', '도서관 입구로 걸어가요.', 'library', 'inbound'), helpStep('report', '안내 데스크에서 출근을 알려요.', 'library', 'inbound')]
    : [helpStep('walk', '마을에 도착했어요. 인도를 따라 이동해요.', 'village', direction)];
  const remaining = (stop: BusStopId, direction: BusDirection) => {
    const plan = outsidePlan(stop, direction, destination);
    return [...plan.steps, ...finish(plan.direction)];
  };
  if (session.phase === 'completed') return { summary: destination === 'library' ? '도서관에 도착해 출근을 알렸어요.' : '버스를 타고 마을에 돌아왔어요.', steps: [] };
  if (session.phase === 'prepare') {
    const steps = [
      ...(!session.cardPacked ? [helpStep('prepare', '집에서 교통카드를 가방에 넣어요.', 'village', session.direction)] : []),
      helpStep('walk', '마을앞 정류장으로 걸어가요.', 'village', session.direction),
      ...remaining(session.stop, session.direction),
    ];
    return { summary: steps[0].text, steps };
  }
  if (!session.route) {
    if (!session.cardPacked && session.stop === 'village') return {
      summary: '집에서 교통카드를 챙긴 뒤 정류장으로 돌아와요.',
      steps: [helpStep('prepare', '집에서 교통카드를 챙긴 뒤 정류장으로 돌아와요.', session.stop, session.direction), ...remaining(session.stop, session.direction)],
    };
    const steps = remaining(session.stop, session.direction);
    return { summary: steps[0].text, steps };
  }
  const route = session.route;
  if (session.phase === 'boarding' && !session.cardPacked) {
    const steps = [helpStep('alight', '출발 전에 앞문으로 내려 집에서 카드를 챙겨요.', session.stop, session.direction, route)];
    return { summary: steps[0].text, steps };
  }
  if (session.phase === 'alighting') {
    const steps = [helpStep('alight', '열린 뒷문으로 내려 인도에 서요.', session.stop, session.direction, route), ...remaining(session.stop, session.direction)];
    return { summary: steps[0].text, steps };
  }
  const routeStops = getBusRouteStops(route, session.direction);
  const currentIndex = routeStops.indexOf(session.stop);
  // Before departure/at a stop the current sidewalk is reachable; while moving only future stops are reachable.
  const choices = routeStops.slice(currentIndex + (session.phase === 'riding' ? 1 : 0)).map((destination, index) => {
    const plan = outsidePlan(destination, session.direction, session.destination);
    const immediate = destination === session.stop;
    const steps: BusHelpStep[] = immediate ? [helpStep('alight', session.phase === 'boarding'
      ? '출발 전에 앞문으로 내려요.' : `${STOP_NAMES[destination]}에 도착했어요. 카드를 찍고 내려요.`, destination, session.direction, route)] : [
      helpStep('ride', `${STOP_NAMES[destination]} 안내가 나오면 하차벨을 눌러요.`, destination, session.direction, route),
      helpStep('alight', `${STOP_NAMES[destination]}에 정차하면 카드를 찍고 내려요.`, destination, session.direction, route),
    ];
    return { cost: plan.cost + index + (immediate ? 0 : 1), steps: [...steps, ...plan.steps, ...finish(plan.direction)] };
  });
  choices.sort((a, b) => a.cost - b.cost);
  const steps = choices[0].steps;
  if (session.phase === 'stopped' && steps[0].kind === 'ride') {
    steps.unshift(helpStep('ride', '자리를 확보하고 계속 타기를 눌러요.', session.stop, session.direction, route));
  }
  if (session.phase === 'boarding' && steps[0].kind === 'ride') {
    steps.unshift(helpStep('prepare', session.boardingApproved ? '빈자리나 손잡이를 고른 뒤 출발하기를 눌러요.' : '승차 단말기에 교통카드를 찍고 자리를 골라요.', session.stop, session.direction, route));
  }
  return { summary: steps[0].text, steps };
}

export function getDriverReply(session: BusSession): string {
  if (session.phase === 'riding') return '지금은 운전 중이에요. 정차하면 물어봐 주세요.';
  const destinationName = STOP_NAMES[session.destination];
  if (session.stop === session.destination) return `여기가 ${destinationName} 정류장이에요. 목적지에 도착했어요.`;
  const route = session.route ?? session.offeredRoute;
  if (!route) return '버스가 정차하면 기사님에게 물어볼 수 있어요.';
  const stops = getBusRouteStops(route, session.direction);
  const remaining = stops.slice(stops.indexOf(session.stop) + 1);
  const destinationIndex = remaining.indexOf(session.destination);
  if (destinationIndex === 0) return `네, 다음 정류장이 ${destinationName}이에요.`;
  if (destinationIndex > 0) return `네, ${destinationName}에 가요. ${remaining.slice(0, destinationIndex).map(stop => STOP_NAMES[stop]).join(', ')}을 지나 ${destinationName}에서 내리세요.`;
  if (session.destination === 'village') {
    const plan = outsidePlan(session.stop, session.direction, 'village');
    const boarding = plan.steps.find(step => step.kind === 'board');
    if (isTerminalStop(route, session.stop, session.direction)) return `${STOP_NAMES[session.stop]} 종점이에요. 내린 뒤 횡단보도를 건너 ${boarding?.route ?? '201'}번을 타면 마을앞에 갈 수 있어요.`;
    return `지금은 ${STOP_NAMES[stops.at(-1)!]}으로 가요. 길 건너에서 느티광장 방면 ${boarding?.route ?? '201'}번을 타세요.`;
  }
  if (session.stop === 'gym') return session.direction === 'inbound'
    ? '중앙공원에서 내린 뒤 횡단보도를 건너 늘봄주민센터 방면 201번으로 갈아타세요.'
    : '체육관 종점이에요. 내려서 횡단보도를 건너 느티광장 방면 305번을 타세요. 중앙공원에서 201번으로 갈아탈 수 있어요.';
  if (session.stop === 'neuti' && session.direction === 'inbound') return '느티광장 종점이에요. 내려서 횡단보도를 건너 늘봄주민센터 방면 201번을 타세요.';
  if (session.stop === 'civic') return '늘봄주민센터 종점이에요. 내려서 횡단보도를 건너 느티광장 방면 201번을 타세요.';
  if (session.direction === 'inbound') return '지금은 느티광장으로 가요. 길 건너에서 늘봄주민센터 방면 201번을 타세요.';
  return '이 버스는 체육관으로 가요. 하늘도서관은 늘봄주민센터 방면 201번을 타세요.';
}

/** The next physical action follows the recovery route as well as the normal commute. */
export function getBusRideGuide(session: BusSession) {
  const plan = getBusHelpPlan(session);
  const alight = plan.steps.find(step => step.kind === 'alight' && step.route === session.route);
  const alightStop = alight?.stop ?? session.destination;
  const leaveBeforeDeparture = session.phase === 'boarding' && plan.steps[0]?.kind === 'alight';
  const alightHere = session.phase === 'stopped' && alightStop === session.stop;
  const transfer = alightStop !== session.destination;
  let objective = '';
  if (session.phase === 'boarding') objective = leaveBeforeDeparture
    ? !session.cardPacked ? '앞문으로 내려 교통카드를 챙겨요' : '출발 전에 앞문으로 내려 다른 버스를 기다려요'
    : session.boardingApproved ? session.seatSecured ? '자리를 골랐어요. 출발하기를 눌러요' : '빈자리나 손잡이를 편하게 골라요' : '앞문 옆 단말기에 카드를 찍어요';
  if (session.phase === 'riding') objective = session.bellRequested
    ? '하차 요청했어요. 멈출 때까지 기다려요'
    : session.nextStop === alightStop
      ? `${STOP_NAMES[alightStop]}에서 ${transfer ? '갈아타요' : '내려요'}. 하차벨을 눌러요`
      : `${STOP_NAMES[alightStop]} 안내가 나올 때까지 기다려요`;
  if (session.phase === 'stopped') objective = !alightHere
    ? session.seatSecured ? `여기는 ${STOP_NAMES[session.stop]}이에요. 계속 타기를 눌러요` : '빈자리나 손잡이를 고르고 계속 타요'
    : session.seatSecured ? session.securedAt === 'handrail' ? '멈췄어요. 손잡이를 놓고 내려요' : '멈췄어요. 일어나서 내려요'
      : '뒷문 옆 단말기에 카드를 찍어요';
  if (session.phase === 'alighting') objective = '뒷문으로 내려요';
  return { objective, alightStop, transfer, leaveBeforeDeparture, alightHere };
}

export type BusResult = {
  completed: boolean;
  destination: BusDestination;
  facts: string[];
  rides: number;
  cardApprovals: number;
  helpRequests: number;
  restores: number;
  wrongDepartures: number;
  recovered: boolean;
  destinationRequestedAndAlighted: boolean;
  guidance: BusGuidance;
  guidanceModesUsed: BusGuidance[];
  suggestion: string | null;
};
export function getBusResult(session: BusSession): BusResult {
  const eventCount = (type: string) => session.events.filter(event => event.type === type).length;
  const departedRides = new Set(session.events.filter(event => event.type === 'departed').map(event => event.payload.rideId));
  const wrongDepartures = session.events.filter(event => event.type === 'boarded' && event.payload.onHelpfulRoute === false && departedRides.has(event.payload.rideId)).length;
  const destinationArrival = session.events.findLast(event => event.type === 'alighted' && event.payload.stop === session.destination);
  const destinationRequestedAndAlighted = !!destinationArrival && session.events.some(event => event.type === 'stop_requested'
    && event.payload.target === session.destination && event.payload.rideId === destinationArrival.payload.rideId);
  const lastRestore = session.events.findLastIndex(event => event.type === 'checkpoint_restored');
  const lastDeparture = session.events.findLastIndex(event => event.type === 'departed');
  const hadDetour = session.events.some(event => event.type === 'stop_passed' && event.payload.stop === session.destination) || wrongDepartures > 0;
  const recovered = session.phase === 'completed' && hadDetour && lastDeparture > lastRestore
    && session.events.some((event, index) => index > lastRestore && index < lastDeparture && event.type === 'alighted' && event.payload.stop !== session.destination);
  const facts: string[] = [];
  if (session.phase === 'completed') facts.push(session.destination === 'library' ? '도서관에 도착해 출근을 알렸어요.' : '버스를 타고 마을에 돌아왔어요.');
  if (session.events.some(event => event.type === 'alighting_card_approved')) facts.push('승차와 하차 때 교통카드를 사용했어요.');
  const shortName = session.destination === 'library' ? '도서관' : '마을';
  if (recovered) facts.push(`다른 정류장에서 버스를 갈아타 ${shortName}에 도착했어요.`);
  else if (destinationRequestedAndAlighted) facts.push(`${session.destination === 'library' ? '도서관' : '마을앞'} 안내에 하차벨을 누르고 내렸어요.`);
  if (eventCount('checkpoint_restored')) facts.push('정류장으로 돌아가기 도움을 사용했어요.');
  else if (session.events.some(event => event.type === 'help_requested' && event.payload.source === 'driver')) facts.push('기사에게 버스의 목적지를 물어봤어요.');
  else if (eventCount('help_requested')) facts.push('도움으로 이동 경로를 확인했어요.');
  return { completed: session.phase === 'completed', destination: session.destination, facts: facts.slice(0, 4), rides: departedRides.size,
    cardApprovals: eventCount('boarding_card_approved') + eventCount('alighting_card_approved'),
    helpRequests: eventCount('help_requested'), restores: eventCount('checkpoint_restored'), wrongDepartures, recovered,
    destinationRequestedAndAlighted, guidance: session.guidance,
    guidanceModesUsed: [...new Set(session.events.map(event => event.payload.guidance).filter((mode): mode is BusGuidance => mode === 'guided' || mode === 'independent'))],
    suggestion: hadDetour ? '다음에는 타기 전에 번호와 행선지를 함께 확인해 봐요.' : null,
  };
}
export function getBusResultFacts(session: BusSession): string[] { return getBusResult(session).facts; }

/** Small, factual travel stamps. Repeated taps and checkpoint resets never create extra rewards. */
export function getBusTravelStamps(session: BusSession) {
  const has = (type: string) => session.events.some(event => event.type === type);
  const arrival = session.events.findLast(event => event.type === 'alighted' && event.payload.stop === session.destination);
  return [
    { id: 'card', label: '카드 찍기', icon: 'card-outline' as const, earned: has('boarding_card_approved') },
    { id: 'safe', label: '안전한 자리', icon: 'hand-left-outline' as const, earned: has('safe_place_secured') },
    { id: 'bell', label: '목적지 하차벨', icon: 'notifications-outline' as const, earned: session.events.some(event => event.type === 'stop_requested' && event.payload.target === session.destination) },
    { id: 'arrival', label: '목적지 도착', icon: 'flag-outline' as const, earned: !!arrival },
  ];
}
