import { isNearMarketStation } from './marketEnvironment';
import { getMarketObservation, type MarketSession } from './marketSession';

export type MarketAgentUiState = {
  briefing: boolean;
  briefingStep: number;
  briefingText: string | null;
  cartOpen: boolean;
  helpOpen: boolean;
  staffMessage: boolean;
  staffReturnHelp: boolean;
  staffResponse: string;
  settingsOpen: boolean;
  historyOpen: boolean;
  reviewMessage: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  fresh: '냉장 식품', produce: '과일/채소', household: '생활용품', meal: '간편 식품', drink: '음료',
};

function stationLabel(id: string) {
  if (CATEGORY_LABELS[id]) return CATEGORY_LABELS[id];
  if (id === 'checkout') return '1번 계산대';
  if (id === 'checkout-2') return '2번 계산대';
  if (id === 'entrance') return '매장 입구';
  if (id === 'exit') return '매장 출구';
  if (id === 'common-door') return '외부 공동문';
  if (id.startsWith('staff:')) return '마트 직원';
  return id;
}

function availableActions(engine: ReturnType<typeof getMarketObservation>, ui: MarketAgentUiState) {
  if (ui.briefing) return [{ type: 'continueBriefing' }];
  if (ui.settingsOpen || ui.historyOpen || ui.reviewMessage !== null) return [];
  if (engine.phase === 'finished') return [
    { type: 'rate', parameters: { difficulty: '1~5 정수', interest: '1~5 정수' } },
    { type: 'skipRating' },
    { type: 'exportEpisode', tool: 'market_export_episode' },
  ];
  if (engine.phase === 'feedback') return [{ type: 'retry' }, { type: 'giveUp' }];
  const actions: Array<Record<string, unknown>> = [{ type: 'giveUp' }];
  if (engine.view !== 'world') actions.unshift({ type: 'closeView' });
  else actions.unshift({ type: 'viewCart' }, { type: 'viewHelp' });
  if (engine.view === 'world' && !engine.activeStation && engine.phase === 'shopping') {
    actions.unshift({ type: 'move', tool: 'market_move', parameters: { dx: '유한한 수', dy: '유한한 수', maximumDistance: 32 } });
    const near = engine.environment.stationDetails.filter(station => station.available !== false
      && isNearMarketStation(engine.environment, station.id, engine.playerPosition, undefined, engine.cashierAvailability));
    if (near.length) actions.unshift({ type: 'interact', stationIds: near.map(station => station.id) });
  }
  if (engine.activeStation) actions.unshift({ type: 'closeStation' });
  const activeShelf = engine.environment.stationDetails.find(station => station.id === engine.activeStation && station.kind === 'shelf');
  if (activeShelf) {
    actions.unshift({ type: 'add', productIds: engine.products.map(product => product.id), quantity: '1~99 정수' });
    if (engine.cart) actions.unshift({ type: 'remove', productIds: Object.keys(engine.cart), quantity: '1~99 정수' });
  }
  if (engine.activeStation?.startsWith('staff:')) {
    actions.unshift({ type: 'requestCashier', checkoutIds: ['checkout', 'checkout-2'] });
    if (engine.cart) actions.unshift({ type: 'requestReturn', productIds: Object.keys(engine.cart), quantity: '1~99 정수' });
  }
  if (engine.phase === 'checkout') actions.unshift({ type: 'submit' });
  return actions;
}

export function buildMarketAgentObservation(
  session: MarketSession,
  revision: number,
  stepCount: number,
  maxSteps: number,
  ui: MarketAgentUiState,
) {
  const engine = getMarketObservation(session);
  const stations = engine.environment.stationDetails.map(station => ({
    ...station,
    label: stationLabel(station.id),
    distanceFromPlayer: Math.round(Math.hypot(engine.playerPosition.x - station.point.x, engine.playerPosition.y - station.point.y) * 100) / 100,
    interactableNow: station.available !== false
      && isNearMarketStation(engine.environment, station.id, engine.playerPosition, undefined, engine.cashierAvailability),
  }));
  const activeStation = stations.find(station => station.id === engine.activeStation) ?? null;
  const explicitPanel = ui.briefing ? 'briefing' : ui.settingsOpen ? 'settings' : ui.historyOpen ? 'history'
    : ui.reviewMessage !== null ? 'review' : ui.cartOpen ? 'cart' : ui.helpOpen ? 'help'
      : ui.staffMessage ? 'staff' : null;
  return {
    schemaVersion: 'oneuldo.market.agent-observation.v1', sessionId: session.id, revision, stepCount,
    limits: { maxSteps, remainingSteps: Math.max(0, maxSteps - stepCount) },
    screen: {
      screenId: 'MARKET_SIMULATION', title: '마트에서 장보기', phase: engine.phase, visibleView: engine.view,
      mission: { objectives: engine.objectives, instruction: ui.briefingText ?? '목록에 맞는 상품과 수량을 골라 계산하세요. 필요하면 직원에게 도움을 요청할 수 있습니다.' },
      hud: { score: engine.score, penaltyPoints: engine.penaltyPoints, alarmCount: engine.alarmCount, paid: engine.paid, attempts: engine.attempts },
      player: { position: engine.playerPosition },
      world: {
        dimensions: engine.environment.world, layoutVersion: engine.environment.layoutVersion,
        layoutId: engine.environment.config.layoutId ?? 'classic', spawn: engine.environment.spawn, exit: engine.environment.exit,
        stations, shelves: engine.environment.shelves, employees: engine.environment.employees, customers: engine.environment.customers,
        objects: engine.environment.objects, checkouts: engine.environment.checkouts, walkableAreas: engine.environment.walkableAreas,
        walls: engine.environment.walls, obstacles: engine.environment.obstacles, entrance: engine.environment.entrance,
        commonDoor: engine.environment.commonDoor, alarmGates: engine.environment.alarmGates,
        constructionZones: engine.environment.constructionZones,
      },
      visiblePanel: {
        type: explicitPanel ?? (engine.phase === 'feedback' ? 'feedback' : engine.phase === 'checkout' ? 'checkout'
          : engine.view !== 'world' ? engine.view : activeStation?.kind ?? null),
        briefingStep: ui.briefing ? ui.briefingStep : null, activeStation, products: engine.products,
        shelfSlots: engine.shelfSlots, stock: engine.stock, cart: engine.cart,
        cashierAvailability: engine.cashierAvailability, selectedCheckoutId: engine.selectedCheckoutId,
        feedback: engine.feedback, outcome: engine.outcome, ratings: engine.ratings, ratingSkipped: engine.ratingSkipped,
        staffReturnHelp: ui.staffReturnHelp, staffResponse: ui.staffResponse, reviewMessage: ui.reviewMessage,
        lastActionError: engine.lastActionError,
      },
    },
    availableActions: availableActions(engine, ui),
  };
}
