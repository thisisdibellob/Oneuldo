const CATEGORY_LABELS = {
  fresh: '냉장 식품',
  produce: '과일/채소',
  household: '생활용품',
  meal: '간편 식품',
  drink: '음료',
};

function stationLabel(station) {
  if (CATEGORY_LABELS[station.id]) return CATEGORY_LABELS[station.id];
  if (station.id === 'checkout') return '1번 계산대';
  if (station.id === 'checkout-2') return '2번 계산대';
  if (station.id === 'entrance') return '매장 입구';
  if (station.id === 'exit') return '매장 출구';
  if (station.id === 'common-door') return '외부 공동문';
  if (station.id.startsWith('staff:')) return '마트 직원';
  return station.id;
}

function distance(from, to) {
  return Math.round(Math.hypot(from.x - to.x, from.y - to.y) * 100) / 100;
}

function availableActions(observation, isNearMarketStation) {
  if (observation.phase === 'finished') {
    return [
      { type: 'rate', parameters: { difficulty: '1~5 정수', interest: '1~5 정수' } },
      { type: 'skipRating' },
      { type: 'exportEpisode', tool: 'market_export_episode' },
    ];
  }

  if (observation.phase === 'feedback') {
    return [{ type: 'retry' }, { type: 'giveUp' }];
  }

  const actions = [{ type: 'giveUp' }];
  if (observation.view !== 'world') {
    actions.unshift({ type: 'closeView' });
  } else {
    actions.unshift({ type: 'viewCart' }, { type: 'viewHelp' });
  }

  if (observation.view === 'world' && !observation.activeStation && observation.phase === 'shopping') {
    actions.unshift({
      type: 'move',
      tool: 'market_move',
      parameters: { dx: '유한한 수', dy: '유한한 수', maximumDistance: 32 },
    });
    const near = observation.environment.stationDetails
      .filter((station) => station.available !== false)
      .filter((station) => isNearMarketStation(
        observation.environment,
        station.id,
        observation.playerPosition,
        undefined,
        observation.cashierAvailability,
      ));
    if (near.length) actions.unshift({ type: 'interact', stationIds: near.map((station) => station.id) });
  }

  if (observation.activeStation) actions.unshift({ type: 'closeStation' });
  const activeShelf = observation.environment.stationDetails.find(
    (station) => station.id === observation.activeStation && station.kind === 'shelf',
  );
  if (activeShelf) {
    actions.unshift({ type: 'add', productIds: observation.products.map((product) => product.id), quantity: '1~99 정수' });
    if (observation.cart) actions.unshift({ type: 'remove', productIds: Object.keys(observation.cart), quantity: '1~99 정수' });
  }
  if (observation.activeStation?.startsWith('staff:')) {
    actions.unshift({ type: 'requestCashier', checkoutIds: ['checkout', 'checkout-2'] });
    if (observation.cart) actions.unshift({ type: 'requestReturn', productIds: Object.keys(observation.cart), quantity: '1~99 정수' });
  }
  if (observation.phase === 'checkout') actions.unshift({ type: 'submit' });
  return actions;
}

function buildObservation(engineObservation, runtimeState, isNearMarketStation) {
  const environment = engineObservation.environment;
  const stations = environment.stationDetails.map((station) => ({
    ...station,
    label: stationLabel(station),
    distanceFromPlayer: distance(engineObservation.playerPosition, station.point),
    interactableNow: station.available !== false && isNearMarketStation(
      environment,
      station.id,
      engineObservation.playerPosition,
      undefined,
      engineObservation.cashierAvailability,
    ),
  }));
  const activeStation = stations.find((station) => station.id === engineObservation.activeStation) ?? null;

  return {
    schemaVersion: 'oneuldo.market.agent-observation.v1',
    sessionId: runtimeState.sessionId,
    revision: runtimeState.revision,
    stepCount: runtimeState.stepCount,
    limits: { maxSteps: runtimeState.maxSteps, remainingSteps: Math.max(0, runtimeState.maxSteps - runtimeState.stepCount) },
    screen: {
      screenId: 'MARKET_SIMULATION',
      title: '마트에서 장보기',
      phase: engineObservation.phase,
      visibleView: engineObservation.view,
      mission: {
        objectives: engineObservation.objectives,
        instruction: '목록에 맞는 상품과 수량을 골라 계산하세요. 필요하면 직원에게 도움을 요청할 수 있습니다.',
      },
      hud: {
        score: engineObservation.score,
        penaltyPoints: engineObservation.penaltyPoints,
        alarmCount: engineObservation.alarmCount,
        paid: engineObservation.paid,
        attempts: engineObservation.attempts,
      },
      player: { position: engineObservation.playerPosition },
      world: {
        dimensions: environment.world,
        layoutVersion: environment.layoutVersion,
        layoutId: environment.config.layoutId ?? 'classic',
        spawn: environment.spawn,
        exit: environment.exit,
        stations,
        shelves: environment.shelves,
        employees: environment.employees,
        customers: environment.customers,
        objects: environment.objects,
        checkouts: environment.checkouts,
        walkableAreas: environment.walkableAreas,
        walls: environment.walls,
        obstacles: environment.obstacles,
        entrance: environment.entrance,
        commonDoor: environment.commonDoor,
        alarmGates: environment.alarmGates,
        constructionZones: environment.constructionZones,
      },
      visiblePanel: {
        type: engineObservation.phase === 'feedback' ? 'feedback'
          : engineObservation.phase === 'checkout' ? 'checkout'
            : engineObservation.view !== 'world' ? engineObservation.view
              : activeStation?.kind ?? null,
        activeStation,
        products: engineObservation.products,
        shelfSlots: engineObservation.shelfSlots,
        stock: engineObservation.stock,
        cart: engineObservation.cart,
        cashierAvailability: engineObservation.cashierAvailability,
        selectedCheckoutId: engineObservation.selectedCheckoutId,
        feedback: engineObservation.feedback,
        outcome: engineObservation.outcome,
        ratings: engineObservation.ratings,
        ratingSkipped: engineObservation.ratingSkipped,
        lastActionError: engineObservation.lastActionError,
      },
    },
    availableActions: availableActions(engineObservation, isNearMarketStation),
  };
}

module.exports = { buildObservation };
