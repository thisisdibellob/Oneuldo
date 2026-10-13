import {
  createBusSession, getAvailableBusRoutes, getBusDestination, getBusHelpPlan, getBusResult,
  getBusRouteStops, getBusRideGuide, getBusTravelStamps, getDriverReply, getNextBusStop, isTerminalStop, reduceBusSession, STOP_NAMES,
  type BusAction, type BusDirection, type BusRouteId, type BusSession, type BusStopId,
} from '../src/game/busSession';

function act(state: BusSession, ...actions: BusAction[]): BusSession {
  return actions.reduce((session, action) => {
    const next = reduceBusSession(session, action);
    expect(next.lastActionError).toBeNull();
    return next;
  }, state);
}
function waiting(id = 'test'): BusSession {
  return act(createBusSession({ id, startedAt: 100 }), { type: 'OPEN_ROUTE' }, { type: 'PACK_CARD' }, { type: 'GO_TO_STOP' });
}

it('earns four factual travel stamps with no duplicates for repeated actions and no destination stamp for an early stop', () => {
  let session = waiting('travel-stamps');
  const earned = () => getBusTravelStamps(session).filter(stamp => stamp.earned).map(stamp => stamp.id);
  expect(earned()).toEqual([]);
  session = board(session, '201'); expect(earned()).toEqual(['card', 'safe']);
  session = act(session, { type: 'REQUEST_STOP' }, { type: 'REQUEST_STOP' }, { type: 'REACH_NEXT_STOP' });
  expect(earned()).toEqual(['card', 'safe']);
  session = act(session, { type: 'CONTINUE_RIDE' }, { type: 'REQUEST_STOP' });
  expect(earned()).toEqual(['card', 'safe', 'bell']);
  session = act(session, { type: 'REACH_NEXT_STOP' });
  expect(earned()).not.toContain('arrival');
  session = alight(session); expect(earned()).toEqual(['card', 'safe', 'bell', 'arrival']);
  expect(getBusTravelStamps(session)).toHaveLength(4);
});
function board(state: BusSession, route: BusRouteId): BusSession {
  return act(state, { type: 'ARRIVE_VEHICLE', route }, { type: 'BOARD' }, { type: 'TAP_BOARDING_CARD' }, { type: 'TAKE_SEAT' }, { type: 'DEPART' });
}

it('손잡이를 잡고 서서 도서관까지 이동하고 정차한 뒤 손잡이를 놓아 내릴 수 있다', () => {
  let session = act(waiting('standing'), { type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' });
  expect(reduceBusSession(session, { type: 'HOLD_HANDRAIL' }).lastActionError).toContain('교통카드');
  session = act(session, { type: 'TAP_BOARDING_CARD' }, { type: 'HOLD_HANDRAIL' }, { type: 'DEPART' });
  expect(session).toMatchObject({ phase: 'riding', seatSecured: true, securedAt: 'handrail' });
  expect(reduceBusSession(session, { type: 'STAND_UP' })).toBe(session);
  session = travel(session, 'library');
  expect(session.securedAt).toBe('handrail');
  expect(reduceBusSession(session, { type: 'TAP_ALIGHTING_CARD' }).lastActionError).toContain('손잡이');
  session = alight(session);
  expect(session).toMatchObject({ phase: 'arrived', stop: 'library', seatSecured: false, securedAt: null });
  expect(session.events.find(event => event.type === 'safe_place_secured')?.payload.position).toBe('handrail');
});

it('keeps each chosen seat or handrail, allows changing at a stop, and rejects stale or mismatched selections', () => {
  let session = act(waiting('places'), { type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' }, { type: 'TAP_BOARDING_CARD' });
  session = act(session, { type: 'TAKE_SEAT', placeId: 'seat-rear-left' });
  expect(session).toMatchObject({ securedAt: 'seat', passengerPlaceId: 'seat-rear-left' });
  expect(reduceBusSession(session, { type: 'TAKE_SEAT', placeId: 'seat-rear-left' })).toBe(session);
  const mismatch = reduceBusSession(session, { type: 'TAKE_SEAT', placeId: 'handrail-rear' });
  expect(mismatch.passengerPlaceId).toBe('seat-rear-left'); expect(mismatch.lastActionError).toBeTruthy();
  session = act(session, { type: 'HOLD_HANDRAIL', placeId: 'handrail-rear' });
  expect(session.events.at(-1)?.type).toBe('safe_place_changed');
  session = act(session, { type: 'DEPART' });
  expect(reduceBusSession(session, { type: 'TAKE_SEAT', placeId: 'seat-front-right' })).toBe(session);
  session = act(session, { type: 'REQUEST_STOP' }, { type: 'REACH_NEXT_STOP' }, { type: 'TAKE_SEAT', placeId: 'seat-front-right' });
  expect(session).toMatchObject({ phase: 'stopped', securedAt: 'seat', passengerPlaceId: 'seat-front-right' });
  session = act(session, { type: 'STAND_UP' });
  expect(session.passengerPlaceId).toBeNull();
});
function travel(state: BusSession, stop: BusStopId): BusSession {
  let session = state;
  for (let limit = 0; limit < 8; limit++) {
    expect(session.phase).toBe('riding');
    if (session.nextStop === stop) return act(session, { type: 'REQUEST_STOP' }, { type: 'REACH_NEXT_STOP', expectedStop: stop });
    session = act(session, { type: 'REACH_NEXT_STOP', expectedStop: session.nextStop! });
  }
  throw new Error('Unreachable destination');
}
function alight(state: BusSession): BusSession {
  return act(state, { type: 'STAND_UP' }, { type: 'TAP_ALIGHTING_CARD' }, { type: 'ALIGHT' });
}
function toStop(stop: BusStopId, direction: BusDirection): BusSession {
  let session = waiting(`${stop}:${direction}`);
  if (stop === 'neuti') {
    session = act(session, { type: 'CROSS_ROAD' });
    session = alight(travel(board(session, '201'), stop));
  } else if (stop !== 'village') session = alight(travel(board(session, stop === 'gym' ? '305' : '201'), stop));
  if (session.direction !== direction) session = act(session, { type: 'CROSS_ROAD' });
  return session;
}
function complete(state = waiting()): BusSession {
  const plan = getBusHelpPlan(state);
  let session = state;
  for (const step of plan.steps) {
    if (step.kind === 'cross') session = act(session, { type: 'CROSS_ROAD' });
    if (step.kind === 'board') session = board(session, step.route!);
    if (step.kind === 'ride') session = travel(session, step.stop);
    if (step.kind === 'alight') session = alight(session);
    if (step.kind === 'report') session = act(session, { type: 'REPORT_ARRIVAL', at: 500 });
  }
  if (session.destination === 'village') session = act(session, { type: 'COMPLETE_JOURNEY', at: 500 });
  expect(session.phase).toBe('completed');
  return session;
}

it('guides an early bell, a wrong bus and a missed destination toward their actual next safe action', () => {
  let early = act(board(waiting('early-guide'), '201'), { type: 'REQUEST_STOP' }, { type: 'REACH_NEXT_STOP' });
  expect(getBusRideGuide(early)).toMatchObject({ alightHere: false, alightStop: 'library', transfer: false });
  expect(getBusRideGuide(early).objective).toContain('계속 타기');
  early = act(early, { type: 'STAND_UP' });
  expect(getBusRideGuide(early).objective).toContain('빈자리나 손잡이');

  let wrong = act(waiting('wrong-guide'), { type: 'ARRIVE_VEHICLE', route: '305' }, { type: 'BOARD' });
  expect(getBusRideGuide(wrong).leaveBeforeDeparture).toBe(true);
  wrong = act(wrong, { type: 'TAP_BOARDING_CARD' }, { type: 'HOLD_HANDRAIL' }, { type: 'DEPART' });
  expect(getBusRideGuide(wrong)).toMatchObject({ alightStop: 'park', transfer: true, leaveBeforeDeparture: false });
  expect(getBusRideGuide(wrong).objective).toBe('중앙공원에서 갈아타요. 하차벨을 눌러요');

  let missed = act(board(waiting('missed-guide'), '201'), { type: 'REACH_NEXT_STOP' }, { type: 'REACH_NEXT_STOP' });
  expect(getBusRideGuide(missed)).toMatchObject({ alightStop: 'civic', transfer: true });
  missed = act(missed, { type: 'REACH_NEXT_STOP' });
  expect(getBusRideGuide(missed).alightHere).toBe(true);
  expect(getBusRideGuide(missed).objective).toContain('일어나서 내려요');
});

it('completes the full prepared 201 commute only after boarding, requesting, alighting and crossing', () => {
  let session = waiting();
  session = act(session, { type: 'ARRIVE_VEHICLE', route: '305' }, { type: 'ASK_HELP', source: 'driver' }, { type: 'VEHICLE_LEAVE' });
  session = board(session, '201');
  expect(session.nextStop).toBe('park');
  session = act(session, { type: 'REACH_NEXT_STOP', expectedStop: 'park' });
  expect(session).toMatchObject({ stop: 'park', nextStop: 'library', phase: 'riding', direction: 'outbound' });
  session = alight(travel(session, 'library'));
  expect(session).toMatchObject({ phase: 'arrived', route: null, offeredRoute: null, rideId: null, direction: 'outbound' });
  const premature = reduceBusSession(session, { type: 'REPORT_ARRIVAL' });
  expect(premature.phase).toBe('arrived');
  expect(premature.lastActionError).toContain('안내 데스크');
  session = act(session, { type: 'CROSS_ROAD' }, { type: 'REPORT_ARRIVAL', at: 500 });
  expect(getBusResult(session)).toMatchObject({ completed: true, rides: 1, cardApprovals: 2,
    wrongDepartures: 0, helpRequests: 1, destinationRequestedAndAlighted: true, recovered: false });
  expect(session.events.filter(event => event.type === 'stop_requested')).toHaveLength(1);
});

it('does not create a destination success from opening a route, looking up location or using help', () => {
  const session = act(waiting(), { type: 'OPEN_ROUTE' }, { type: 'CHECK_LOCATION' }, { type: 'ASK_HELP', source: 'phone' });
  expect(getBusResult(session)).toMatchObject({ completed: false, destinationRequestedAndAlighted: false, rides: 0 });
  expect(getBusResult(session).facts).not.toContain('도서관 안내에 하차벨을 누르고 내렸어요.');
  expect(reduceBusSession(session, { type: 'REPORT_ARRIVAL' }).phase).toBe('waiting');
});

it('recovers a missing card by leaving before departure, returning home and reboarding a fresh ride', () => {
  let session = act(createBusSession({ id: 'missing', startedAt: 100 }), { type: 'OPEN_ROUTE' }, { type: 'GO_TO_STOP' },
    { type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' });
  const rideId = session.rideId;
  expect(reduceBusSession(session, { type: 'TAP_BOARDING_CARD' }).lastActionError).toContain('교통카드가 없어요');
  expect(reduceBusSession(session, { type: 'DEPART' }).phase).toBe('boarding');
  expect(reduceBusSession(session, { type: 'PACK_CARD' }).cardPacked).toBe(false);
  session = act(session, { type: 'LEAVE_BEFORE_DEPARTURE' }, { type: 'RETURN_HOME' }, { type: 'PACK_CARD' }, { type: 'GO_TO_STOP' });
  session = board(session, '201');
  expect(session.rideId).not.toBe(rideId);
  expect(session.rideNumber).toBe(2);
  expect(session.phase).toBe('riding');
});

it('gates departure, walking and alighting on card, secure place and stopped vehicle', () => {
  let session = act(waiting(), { type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' });
  expect(reduceBusSession(session, { type: 'TAKE_SEAT' }).seatSecured).toBe(false);
  expect(reduceBusSession(session, { type: 'DEPART' }).phase).toBe('boarding');
  session = act(session, { type: 'TAP_BOARDING_CARD' });
  expect(reduceBusSession(session, { type: 'DEPART' }).phase).toBe('boarding');
  session = act(session, { type: 'TAKE_SEAT' }, { type: 'DEPART' });
  for (const type of ['STAND_UP', 'TAP_ALIGHTING_CARD', 'ALIGHT', 'CROSS_ROAD', 'LEAVE_BEFORE_DEPARTURE'] as const) {
    expect(reduceBusSession(session, { type })).toBe(session);
  }
  expect(reduceBusSession(session, { type: 'ASK_HELP', source: 'driver' }).lastActionError).toContain('정차');
});

it('consumes an early bell once, allows reseating/continuing, and requires another request for the next stop', () => {
  let session = travel(board(waiting(), '201'), 'park');
  expect(session).toMatchObject({ phase: 'stopped', stop: 'park', nextStop: 'library', bellRequested: false });
  expect(reduceBusSession(session, { type: 'REQUEST_STOP' })).toBe(session);
  session = act(session, { type: 'STAND_UP' });
  expect(reduceBusSession(session, { type: 'CONTINUE_RIDE' }).phase).toBe('stopped');
  session = act(session, { type: 'TAKE_SEAT' }, { type: 'CONTINUE_RIDE' });
  session = act(session, { type: 'REACH_NEXT_STOP', expectedStop: 'library' });
  expect(session).toMatchObject({ phase: 'riding', stop: 'library', nextStop: 'civic' });
  session = act(session, { type: 'REACH_NEXT_STOP', expectedStop: 'civic' });
  expect(session).toMatchObject({ phase: 'stopped', stop: 'civic', nextStop: null });
  expect(reduceBusSession(session, { type: 'CONTINUE_RIDE' }).phase).toBe('stopped');
  expect(getDriverReply(session)).toContain('종점');
});

it('cannot depart after approving an alighting card, including stale UI inputs', () => {
  let session = travel(board(waiting(), '201'), 'park');
  expect(reduceBusSession(session, { type: 'TAP_ALIGHTING_CARD' }).phase).toBe('stopped');
  session = act(session, { type: 'STAND_UP' }, { type: 'TAP_ALIGHTING_CARD' });
  for (const type of ['CONTINUE_RIDE', 'TAKE_SEAT', 'DEPART', 'TAP_ALIGHTING_CARD'] as const) expect(reduceBusSession(session, { type })).toBe(session);
  expect(session.phase).toBe('alighting');
  session = act(session, { type: 'ALIGHT' });
  expect(session.phase).toBe('waiting');
  expect(session.checkpoint).toEqual({ stop: 'park', direction: 'outbound' });
});

it('makes approvals, boarding, bell, alighting and report idempotent while fresh rides approve again', () => {
  let session = act(waiting(), { type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' });
  expect(reduceBusSession(session, { type: 'BOARD' })).toBe(session);
  session = act(session, { type: 'TAP_BOARDING_CARD' });
  expect(reduceBusSession(session, { type: 'TAP_BOARDING_CARD' })).toBe(session);
  session = act(session, { type: 'TAKE_SEAT' }, { type: 'DEPART' }, { type: 'REQUEST_STOP' });
  expect(reduceBusSession(session, { type: 'REQUEST_STOP' })).toBe(session);
  session = act(session, { type: 'REACH_NEXT_STOP' });
  session = alight(session);
  expect(reduceBusSession(session, { type: 'ALIGHT' })).toBe(session);
  const firstRideCount = session.events.filter(event => event.type === 'boarding_card_approved').length;
  session = board(session, '201');
  expect(session.events.filter(event => event.type === 'boarding_card_approved')).toHaveLength(firstRideCount + 1);
  session = alight(travel(session, 'library'));
  session = act(session, { type: 'CROSS_ROAD' }, { type: 'REPORT_ARRIVAL', at: 300 });
  expect(reduceBusSession(session, { type: 'REPORT_ARRIVAL', at: 400 })).toBe(session);
});

it('ignores an expired arrival timer targeting the prior stop', () => {
  let session = board(waiting(), '201');
  session = act(session, { type: 'REACH_NEXT_STOP', expectedStop: 'park' });
  expect(reduceBusSession(session, { type: 'REACH_NEXT_STOP', expectedStop: 'park' })).toBe(session);
  expect(session.nextStop).toBe('library');
});

it('recovers naturally from 305 through gym and the opposite Central Park stop', () => {
  let session = board(waiting(), '305');
  session = act(session, { type: 'REACH_NEXT_STOP' }, { type: 'REACH_NEXT_STOP' });
  expect(session).toMatchObject({ stop: 'gym', phase: 'stopped', direction: 'outbound' });
  session = alight(session);
  expect(getAvailableBusRoutes(session.stop, session.direction)).toEqual([]);
  session = act(session, { type: 'CROSS_ROAD' });
  session = alight(travel(board(session, '305'), 'park'));
  expect(session.direction).toBe('inbound');
  const help = getBusHelpPlan(session);
  expect(help.steps[0]).toMatchObject({ kind: 'cross', direction: 'outbound' });
  session = complete(session);
  expect(getBusResult(session)).toMatchObject({ recovered: true, wrongDepartures: 1, restores: 0, rides: 3 });
});

it('recovers after missing the library twice and reaching the opposite terminal', () => {
  let session = board(waiting(), '201');
  session = act(session, { type: 'REACH_NEXT_STOP' }, { type: 'REACH_NEXT_STOP' }, { type: 'REACH_NEXT_STOP' });
  session = alight(session);
  session = act(session, { type: 'CROSS_ROAD' });
  session = board(session, '201');
  for (let index = 0; index < 4; index++) session = act(session, { type: 'REACH_NEXT_STOP' });
  expect(session).toMatchObject({ stop: 'neuti', phase: 'stopped', direction: 'inbound' });
  session = alight(session);
  session = complete(session);
  expect(getBusResult(session)).toMatchObject({ completed: true, recovered: true, rides: 3 });
  expect(session.events.filter(event => event.type === 'stop_passed' && event.payload.stop === 'library')).toHaveLength(2);
});

it.each(Object.keys(STOP_NAMES).flatMap(stop => (['outbound', 'inbound'] as const).map(direction => [stop as BusStopId, direction] as const)))
('finds an executable return plan from %s %s, including all terminal sides', (stop, direction) => {
  const session = toStop(stop, direction);
  const completed = complete(session);
  expect(completed).toMatchObject({ stop: 'library', direction: 'inbound', phase: 'completed' });
});

it('restores the last actual sidewalk, preserving possessions, help mode and past events but clearing vehicle state', () => {
  let session = act(waiting(), { type: 'SET_GUIDANCE', guidance: 'independent' });
  session = board(session, '201');
  session = act(session, { type: 'REACH_NEXT_STOP' }, { type: 'REQUEST_STOP' });
  expect(session.stop).toBe('park');
  expect(session.checkpoint).toEqual({ stop: 'village', direction: 'outbound' });
  const events = session.events;
  const rideId = session.rideId;
  session = act(session, { type: 'RESTORE_CHECKPOINT' });
  expect(session).toMatchObject({ stop: 'village', phase: 'waiting', direction: 'outbound', cardPacked: true, guidance: 'independent',
    route: null, offeredRoute: null, nextStop: null, rideId: null, bellRequested: false, boardingApproved: false, alightingApproved: false, seatSecured: false });
  expect(session.events.slice(0, -1)).toEqual(events);
  session = board(session, '201');
  expect(session.rideId).not.toBe(rideId);
  expect(reduceBusSession(createBusSession(), { type: 'RESTORE_CHECKPOINT' }).checkpoint).toBeNull();
});

it('updates checkpoints after crossing and restores a terminal without silently reversing direction', () => {
  let session = toStop('gym', 'outbound');
  session = act(session, { type: 'RESTORE_CHECKPOINT' });
  expect(session.direction).toBe('outbound');
  expect(act(session, { type: 'ARRIVE_VEHICLE', route: '305' }).offeredRoute).toBeNull();
  session = act(session, { type: 'CROSS_ROAD' });
  expect(session.checkpoint).toEqual({ stop: 'gym', direction: 'inbound' });
  session = board(session, '305');
  session = act(session, { type: 'RESTORE_CHECKPOINT' });
  expect(session).toMatchObject({ stop: 'gym', direction: 'inbound' });
});

it('does not misreport checkpoint assistance as naturally finding a return route', () => {
  let session = alight(travel(board(waiting(), '305'), 'park'));
  session = act(session, { type: 'RESTORE_CHECKPOINT' });
  session = complete(session);
  expect(getBusResult(session)).toMatchObject({ restores: 1, recovered: false });
  expect(getBusResult(session).facts).toContain('정류장으로 돌아가기 도움을 사용했어요.');
});

it('answers drivers by actual route suffix rather than bus number alone', () => {
  const offered = (stop: BusStopId, direction: BusDirection, route: BusRouteId) => act(toStop(stop, direction), { type: 'ARRIVE_VEHICLE', route });
  expect(getDriverReply(offered('village', 'outbound', '201'))).toContain('중앙공원');
  expect(getDriverReply(offered('village', 'inbound', '201'))).toContain('길 건너');
  expect(getDriverReply(offered('civic', 'inbound', '201'))).toBe('네, 다음 정류장이 하늘도서관이에요.');
  expect(getDriverReply(offered('library', 'inbound', '201'))).toContain('여기가 하늘도서관');
  expect(getDriverReply(offered('neuti', 'outbound', '305'))).not.toContain('횡단보도를 건너');
  expect(getDriverReply(offered('gym', 'inbound', '305'))).toContain('중앙공원');
});

it('offers only physically reachable routes and exposes consistent destination/next-stop metadata', () => {
  expect(getBusRouteStops('201', 'inbound')).toEqual(['civic', 'library', 'park', 'village', 'neuti']);
  expect(getBusRouteStops('305', 'outbound')).toEqual(['neuti', 'village', 'park', 'gym']);
  expect(getAvailableBusRoutes('library', 'outbound')).toEqual(['201']);
  expect(getAvailableBusRoutes('civic', 'outbound')).toEqual([]);
  expect(getNextBusStop('305', 'library', 'outbound')).toBeNull();
  expect(getNextBusStop('305', 'park', 'outbound')).toBe('gym');
  expect(isTerminalStop('305', 'neuti', 'inbound')).toBe(true);
  expect(isTerminalStop('305', 'library', 'inbound')).toBe(false);
  expect(getBusDestination('201', 'outbound')).toBe('늘봄주민센터 방면');
  expect(getBusRouteStops('201', 'outbound')).toEqual(['neuti', 'village', 'park', 'library', 'civic']);
});

it('keeps independent-mode help available and records guidance changes without resetting progress', () => {
  let session = board(waiting(), '201');
  const rideId = session.rideId;
  session = act(session, { type: 'SET_GUIDANCE', guidance: 'independent' }, { type: 'ASK_HELP', source: 'jiyoung' }, { type: 'REPLAY_ANNOUNCEMENT' });
  expect(session.rideId).toBe(rideId);
  expect(getBusHelpPlan(session).steps.some(step => step.stop === 'library')).toBe(true);
  expect(getBusResult(session)).toMatchObject({ guidanceModesUsed: ['guided', 'independent'], helpRequests: 1 });
});

it('keeps the passenger on a correct bus instead of asking them to get off and board it again', () => {
  let session = act(waiting(), { type: 'ARRIVE_VEHICLE', route: '201' }, { type: 'BOARD' });
  expect(getBusHelpPlan(session).steps[0].kind).toBe('prepare');
  expect(getBusHelpPlan(session).steps.filter(step => step.kind === 'alight')).toHaveLength(1);
  expect(getBusHelpPlan(session).steps.find(step => step.kind === 'alight')?.stop).toBe('library');
  session = act(session, { type: 'TAP_BOARDING_CARD' }, { type: 'TAKE_SEAT' }, { type: 'DEPART' });
  session = travel(session, 'park');
  expect(getBusHelpPlan(session).steps[0].text).toContain('계속 타기');
  expect(getBusHelpPlan(session).steps.find(step => step.kind === 'alight')?.stop).toBe('library');
});

it('never mutates the prior state, events or shared route arrays', () => {
  const session = waiting();
  const snapshot = JSON.parse(JSON.stringify(session));
  const next = board(session, '201');
  expect(next).not.toBe(session);
  expect(session).toEqual(snapshot);
  const route = getBusRouteStops('201', 'outbound') as BusStopId[];
  route.splice(0);
  expect(getBusRouteStops('201', 'outbound')).toHaveLength(5);
  expect(next.events.map(event => event.sequence)).toEqual(next.events.map((_, index) => index + 1));
});

function returning(id = 'return'): BusSession {
  return createBusSession({ id, startedAt: 100, destination: 'village', stop: 'library', direction: 'inbound',
    cardPacked: true, routeOpened: true, phase: 'waiting' });
}
function returnAt(stop: BusStopId, direction: BusDirection): BusSession {
  let session = returning(`return:${stop}:${direction}`);
  if (stop === 'civic') session = alight(travel(board(act(session, { type: 'CROSS_ROAD' }), '201'), 'civic'));
  else if (stop === 'gym') {
    session = alight(travel(board(session, '201'), 'park'));
    session = act(session, { type: 'CROSS_ROAD' });
    session = alight(travel(board(session, '305'), 'gym'));
  } else if (stop !== 'library') session = alight(travel(board(session, '201'), stop));
  if (session.direction !== direction) session = act(session, { type: 'CROSS_ROAD' });
  return session;
}

it('connects a completed commute with a separate real return trip after library work', () => {
  const outbound = complete(waiting('outbound-day'));
  const back = complete(returning('return-day'));
  expect(outbound).toMatchObject({ phase: 'completed', destination: 'library', stop: 'library' });
  expect(back).toMatchObject({ phase: 'completed', destination: 'village', stop: 'village', direction: 'inbound' });
  expect(outbound.events.at(-1)?.type).toBe('arrival_reported');
  expect(back.events.at(-1)?.type).toBe('journey_completed');
  expect(back.events.some(event => event.type === 'arrival_reported')).toBe(false);
  expect(getBusResult(back)).toMatchObject({ destination: 'village', destinationRequestedAndAlighted: true, wrongDepartures: 0, rides: 1 });
  expect(getBusResult(back).facts).toContain('버스를 타고 마을에 돌아왔어요.');
  expect(getBusResult(back).facts.join(' ')).not.toContain('출근');
});

it('initializes a return at the library with the retained transit card and a real sidewalk checkpoint', () => {
  const session = createBusSession({ destination: 'village' });
  expect(session).toMatchObject({ stop: 'library', direction: 'inbound', cardPacked: true, routeOpened: true,
    phase: 'waiting', checkpoint: { stop: 'library', direction: 'inbound' } });
  expect(getBusHelpPlan(session).steps[0]).toMatchObject({ kind: 'board', route: '201', direction: 'inbound' });
  expect(getBusHelpPlan(session).steps.some(step => step.kind === 'report')).toBe(false);
});

it('does not complete a return from a location lookup, departure or merely passing the home stop', () => {
  let session = returning();
  expect(reduceBusSession(session, { type: 'COMPLETE_JOURNEY' })).toBe(session);
  session = act(board(session, '201'), { type: 'REACH_NEXT_STOP' }, { type: 'REACH_NEXT_STOP' });
  expect(session).toMatchObject({ phase: 'riding', stop: 'village' });
  expect(reduceBusSession(session, { type: 'COMPLETE_JOURNEY' })).toBe(session);
  expect(getBusResult(session).completed).toBe(false);
});

it('keeps the library reporting action restricted to the outbound commute', () => {
  const beforeReport = alight(travel(board(waiting(), '201'), 'library'));
  expect(reduceBusSession(beforeReport, { type: 'COMPLETE_JOURNEY' })).toBe(beforeReport);
  const home = alight(travel(board(returning(), '201'), 'village'));
  const wrongReport = reduceBusSession(home, { type: 'REPORT_ARRIVAL' });
  expect(wrongReport.phase).toBe('arrived');
  const finished = act(home, { type: 'COMPLETE_JOURNEY', at: 500 });
  expect(reduceBusSession(finished, { type: 'COMPLETE_JOURNEY', at: 1000 })).toBe(finished);
});

it('allows both 201 and 305 when returning from Central Park toward the village', () => {
  for (const route of ['201', '305'] as const) {
    let session = returnAt('park', 'inbound');
    session = act(session, { type: 'ARRIVE_VEHICLE', route });
    expect(getDriverReply(session)).toBe('네, 다음 정류장이 마을앞이에요.');
    session = alight(travel(boardAfterOffer(session), 'village'));
    session = act(session, { type: 'COMPLETE_JOURNEY', at: 500 });
    expect(getBusResult(session).wrongDepartures).toBe(0);
  }
});
function boardAfterOffer(session: BusSession): BusSession {
  return act(session, { type: 'BOARD' }, { type: 'TAP_BOARDING_CARD' }, { type: 'TAKE_SEAT' }, { type: 'DEPART' });
}

it.each(Object.keys(STOP_NAMES).flatMap(stop => (['outbound', 'inbound'] as const).map(direction => [stop as BusStopId, direction] as const)))
('executes a return-to-village plan from %s %s, even after another wrong turn', (stop, direction) => {
  const session = complete(returnAt(stop, direction));
  expect(session).toMatchObject({ destination: 'village', stop: 'village', phase: 'completed' });
});

it('does not report the origin library as the destination during a return, and recovers from the wrong direction', () => {
  let session = act(returning(), { type: 'CROSS_ROAD' }, { type: 'ARRIVE_VEHICLE', route: '201' });
  expect(getDriverReply(session)).toContain('늘봄주민센터');
  expect(getDriverReply(session)).toContain('길 건너');
  expect(getDriverReply(session)).not.toContain('목적지에 도착');
  session = boardAfterOffer(session);
  session = act(session, { type: 'REACH_NEXT_STOP' });
  expect(session.phase).toBe('stopped');
  session = complete(alight(session));
  expect(getBusResult(session)).toMatchObject({ destination: 'village', recovered: true, wrongDepartures: 1 });
});

it('recovers a missed village stop at Neuti and can finish on the outbound-side pavement', () => {
  let session = board(returning(), '201');
  session = act(session, { type: 'REACH_NEXT_STOP' }, { type: 'REACH_NEXT_STOP' }, { type: 'REACH_NEXT_STOP' });
  expect(session).toMatchObject({ phase: 'stopped', stop: 'neuti' });
  session = complete(alight(session));
  expect(session.direction).toBe('outbound');
  expect(getBusResult(session)).toMatchObject({ recovered: true, destination: 'village' });
});

it('preserves return destination through checkpoint recovery and forbids a stranded remote start without a card', () => {
  let session = act(board(returning(), '201'), { type: 'REACH_NEXT_STOP' }, { type: 'REQUEST_STOP' });
  session = act(session, { type: 'RESTORE_CHECKPOINT' });
  expect(session).toMatchObject({ destination: 'village', phase: 'waiting', stop: 'library', direction: 'inbound', cardPacked: true });
  expect(() => createBusSession({ destination: 'village', stop: 'library', cardPacked: false })).toThrow('이동 설정');
});
