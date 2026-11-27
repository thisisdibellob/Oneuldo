import { MarketRouteReview, MarketMiniMap } from '../components/game/MarketRouteReview';
import { MarketPurchaseResult, type MarketResultKind } from '../components/game/MarketPurchaseResult';
import { activityRecordId } from '../game/activityAlbum';
import { GameActionButton, GameControlShortcut, GAME_ACTION_BUTTON_LAYOUT } from '../components/game/GameControls';
import { MarketWorldGuidance, type MarketViewFrame } from '../components/game/MarketWorldGuidance';
import { normalizeMarketTraining, marketTrainingInstruction, marketIncidentPlan, type MarketIncident } from '../game/marketTraining';
import { buildMarketTrajectory } from '../game/marketTrajectory';
import { MarketEntryScreen } from '../components/game/MarketEntryScreen';
import { marketLocationResponse } from '../game/marketHelp';
import { randomUUID } from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Image, Platform, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { PressScale } from '../components/PressScale';
import { MarketRequesterCall } from '../components/game/MarketRequesterCall';
import { MarketKioskCheckout } from '../components/game/MarketKioskCheckout';
import { MarketStaffedCheckout } from '../components/game/MarketStaffedCheckout';
import { MarketMap } from '../components/game/MarketMap';
import { MarketHud, type MarketHudControlMode } from '../components/game/MarketHud';
import { getMarketHudControlLift, getMarketHudTopInset } from '../game/marketHudLayout';
import { MarketStaffDialogue, MarketStaffDialogueChoice } from '../components/game/MarketStaffDialogue';
import { MarketPanelTransition } from '../components/game/MarketPanelTransition';
import { MarketShelfScene } from '../components/game/MarketShelfScene';
import { MarketSetupPanel, type MarketSetupChanges } from '../components/game/MarketSetupPanel';
import { runtimeSettingLocks } from '../game/marketAdaptivePlan';
import { getMarketWrongWayRearm, MarketEnvironment, MarketEnvironmentStationId, MarketCashierAvailability } from '../game/marketEnvironment';
import {
  applyMarketAction,
  createMarketSession,
  exportMarketEpisode,
  getMarketPurchaseVerdict,
  replaceMarketSessionTilemap,
  MarketAction,
  MarketSessionConfig
} from '../game/marketSession';
import { getMarketProductImage } from '../game/marketProductImages';
import { getMarketCartTotal, getMarketProduct, marketCategories, MarketCart } from '../game/scenarios';
import type { BehaviorSimulationContext } from '../api/behaviorLog';
import { startSessionAnalysisJob } from '../api/behaviorAnalysis';
import { MarketBehaviorTracker } from '../behavior/marketBehaviorTracker';
import type { MarketTelemetryControlMode, MarketTelemetryPoint } from '../behavior/marketMovementDetector';
import type { MarketMission, MarketCategoryId } from '../game/scenarios';
import { marketMission, marketProducts } from '../game/scenarios';
import { MARKET_CATALOG_VERSION, MARKET_SCENARIO_VERSION } from '../game/marketContent';
import { getMarketCheckoutReview } from '../game/marketCheckoutReview';
import { fonts } from '../theme';
import { listMarketEpisodes, saveMarketEpisode, MarketStoredEpisode } from '../game/marketEpisodeStore';
import type { ReplayUiPort, ReplayShelfPort } from '../replay/ports';
import type { ReplayPresentation } from '../game/marketReplayPerception';
import type { MarketReplaySnapshot } from '../game/marketReplayTrace';
import { createMissionSession } from '../game/marketMissionSession';
import { MARKET_GOAL_REMINDER_TITLE, marketGoalReminderLines } from '../game/marketGoalReminder';
import { getMarketEnvironmentContext } from '../game/marketEnvironmentPlan';
import { MarketQuestClock, formatMarketTime, resolveMarketTimeLimitSeconds, type MarketQuestTiming } from '../game/marketQuestTime';
import { buildMarketAgentObservation, type MarketAgentUiState } from '../game/marketAgentObservation';
import type { MarketAgentAction, MarketAgentActionInput, MarketAgentController } from '../agent/marketAgentProtocol';

export type MarketStationId = MarketEnvironmentStationId;
export type MarketInteractionRequest = {
  id: number;
  station: MarketStationId | 'give-up' | 'contact-requester' | 'edit-layout';
};
export type MarketProductDropDecision = {
  accepted: boolean;
  reason?: 'unavailable';
};
export function evaluateMarketProductDrop(_cart: MarketCart, productId: string, _mode?: 'practice' | 'challenge'): MarketProductDropDecision {
  return getMarketProduct(productId) ? { accepted: true } : { accepted: false, reason: 'unavailable' };
}
type Point = {
  x: number;
  y: number;
};
export type MarketTelemetrySink = {
  movementStopped: (mode: MarketTelemetryControlMode) => void;
  observeMovement: (point: MarketTelemetryPoint, mode: MarketTelemetryControlMode, blocked?: boolean) => void;
};
export type MarketSimulationScreenProps = {
  viewFrameRef?: {current:MarketViewFrame|null};
  accessToken?: string | null;
  mission?: MarketMission;
  difficulty?: number;
  simulation?: Omit<BehaviorSimulationContext, 'simulationStarted'>;
  onTelemetryReady?: (sink: MarketTelemetrySink | null) => void;

  embedded?: boolean;
  externalMenuOpen?: boolean;
  hudTopInset?: number;
  controlMode?: MarketHudControlMode;
  onControlModeChange?: (mode: MarketHudControlMode) => void;
  interactionRequest?: MarketInteractionRequest | null;
  environment?: MarketEnvironment;
  initialConfig?: Partial<MarketSessionConfig>;
  playerPositionRef?: { current: Point; };
  playerMovementListenerRef?: { current: ((previous: Point, next: Point) => void) | null; };
  onEnvironmentChange?: (environment: MarketEnvironment, changes?: MarketSetupChanges) => void;
  onCashierCalled?: (availability: MarketCashierAvailability) => void;
  onEpisodeComplete?: (episode: ReturnType<typeof exportMarketEpisode>) => void;
  /** AI 검토로 넘기는 장보기에서 계산을 마친 순간, 개인 활동 기록용으로만 알린다. AI 분석·로그·미션 흐름에는 영향이 없다. */
  /** 게임 안 마트에서만 켜는 새 플레이어 화면(간단 HUD·시나리오 버튼·바로 시작·별점 없음). */
  playerUi?: boolean;
  onShoppingFinished?: (info: { sessionId: string; completedAt: number; cart: Record<string, number>; kiosk: boolean; success?: boolean }) => void;
  requesterName?: string;
  spendingLimit?: number;
  onBudgetRequest?: (amount: number) => void;
  onExit: () => void;
  onOpenAnalysis?: () => void;
  onLockChange?: (locked: boolean) => void;
  onMissionComplete?: () => void;
  /** Only supplied by the development web replay gate. */
  replayUiRef?: { current: ReplayUiPort | null };
  replayPresentation?: () => ReplayPresentation;
  agentControl?: {
    maxSteps: number;
    onReady: (controller: MarketAgentController | null) => void;
    provenance: { agentModel: string; personaId: string; personaVersion?: string };
    sessionId: string;
  };
};
const price = (value: number) => value.toLocaleString('ko-KR') + '원';
const CASHIER_REQUEST_TEXT = '계산대에 사람이 없어요,\n계산 부탁드릴게요';

export function MarketSimulationScreen({
  viewFrameRef,
  accessToken = null, mission: sourceMission, difficulty = 2, simulation, onTelemetryReady,
  embedded = false,
  externalMenuOpen = false,
  hudTopInset,
  controlMode,
  onControlModeChange,
  interactionRequest = null,
  environment,
  initialConfig,
  playerPositionRef,
  playerMovementListenerRef,
  onEnvironmentChange,
  onCashierCalled,
  onEpisodeComplete,
  onShoppingFinished,
  playerUi = false,
  requesterName = '지영',
  spendingLimit,
  onBudgetRequest,
  onExit,
  onOpenAnalysis,
  onLockChange,
  onMissionComplete, replayUiRef, replayPresentation, agentControl,
}: MarketSimulationScreenProps) {
  const [customMission,setCustomMission]=useState<MarketMission|null>(null);
  const mission=customMission??sourceMission;
  const insets = useContext(SafeAreaInsetsContext);
  const controlWindow = useWindowDimensions();
  const controlLift = getMarketHudControlLift(controlWindow.width);
  const [session, setSession] = useState(() => createMissionSession({
    seed: environment?.seed ?? 'market-' + Date.now(),
    ...initialConfig,
    // New interactive games mix normal/error bills; imported presets retain their explicit/default mode.
    learning: initialConfig ? initialConfig.learning : { checkoutReviewMode: mission ? 'normal' : 'random' },
    startedAt: new Date().toISOString()
  }, mission, environment));
  // Missions from the application always use AI assessment. The standalone marketLab
  // keeps the incoming deterministic research preview, never used as an AI verdict.
  const aiAssessment = !!mission;
  /** 사람이 직접 플레이하는 경우. 에이전트·페르소나 재생은 화면 흐름을 바꾸지 않는다. */
  const humanPlay = !agentControl && !replayUiRef;
  /** 게임 안 마트의 새 플레이어 화면(간단 HUD·시나리오 버튼·바로 시작·별점 없음). 게임 화면이 켜고, 직접 렌더·재생·에이전트는 기존 화면. */
  const playerUiOn = !!playerUi && humanPlay;
  const [scenarioInfoOpen, setScenarioInfoOpen] = useState(false);
  const adaptiveAssessment = aiAssessment && !!mission.runtimePlan;
  const briefingPages = mission?.briefing.length ? mission.briefing : null;
  const lastBriefingStep = (briefingPages?.length ?? (aiAssessment?2:1)) - 1;
  const [review, setReview] = useState<string | null>(null);
  const [purchaseVerdict, setPurchaseVerdict] = useState<{ kind: MarketResultKind; details: string[]; note?: string } | null>(null);
  const questClock = useRef(new MarketQuestClock(resolveMarketTimeLimitSeconds(mission?.timeLimitSeconds)));
  const [timing, setTiming] = useState<MarketQuestTiming>(() => questClock.current.snapshot());
  const [expiredTiming, setExpiredTiming] = useState<MarketQuestTiming | null>(null);
  const expireRef = useRef<(() => void) | null>(null);
  const timeGuard = useRef<() => boolean>(() => false);
  const reviewing = useRef(false);
  const reviewAccepted = useRef(false);
  const reviewError = useRef<string | null>(null);
  const replayShelf = useRef<ReplayShelfPort | null>(null);
  const replayList = useRef<((fraction: number) => void) | null>(null);
  const replayListVisibility = useRef<((open: boolean) => void) | null>(null);
  const replaySnapshot = useRef<MarketReplaySnapshot | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const tracker = useRef<MarketBehaviorTracker | null>(null);
  const trackerFinalized = useRef(false);
  const finalization = useRef<Promise<void> | null>(null);
  const analysisRequest = useRef<Promise<void> | null>(null);
  const shelfOpenedAt = useRef(Date.now());
  const cartOpenedAt = useRef(Date.now());
  const briefingShownAt = useRef(Date.now());
  const live = useRef(session);
  live.current = session;
  const trackedMission = useMemo<MarketMission>(() => {
    const original = mission ?? marketMission;
    const { scene: ignored, ...originalBase } = original;
    const base = { ...originalBase, timeLimitSeconds: resolveMarketTimeLimitSeconds(originalBase.timeLimitSeconds) };
    const products = Object.values(session.shelfSlots).flat().map(id => ({ ...getMarketProduct(id)!, initialStock: session.initialStock[id] }));
    const actualShelfOrder = getMarketEnvironmentContext(session.environment).shelfSlots.map(slot => slot.categoryId);
    return { ...base, objectives: mission?.objectives ?? session.config.objectives, scene: {
      schemaVersion: 'market-scene-v1', questInstanceId: simulation?.questInstanceId ?? mission?.scene?.questInstanceId ?? randomUUID(),
      seed: session.config.seed,
      layoutVersion: 'market-retail-layout-v3', catalogVersion: base.catalogVersion ?? MARKET_CATALOG_VERSION,
      ...(base.environmentPlan ? { environmentPlanApplication: {
        requestedShelfOrder: [...base.environmentPlan.shelfOrder], actualShelfOrder,
        applied: actualShelfOrder.every((categoryId, index) => categoryId === base.environmentPlan!.shelfOrder[index]),
      } } : {}),
      scenarioVersion: base.scenarioVersion ?? MARKET_SCENARIO_VERSION, mission: { ...base, objectives: mission?.objectives ?? session.config.objectives }, products,
      slots: Object.entries(session.shelfSlots).flatMap(([stationId, ids]) => ids.map((productId, index) => ({ slotId: stationId+'-'+index, stationId, productId, storage: getMarketProduct(productId)!.storage }))),
      startingConditions: { cart: {}, player: session.environment.spawn, supportOptions: ['목록 다시 보기','직원 도움','거절/중단'],
        ...(mission?.runtimePlan?{displayedRuntimePreview:{stockoutAnnounced:!!session.learning.stockout,substitutionAnnounced:!!session.config.learning?.allowSubstitution,checkoutReviewAnnounced:session.config.learning?.checkoutReviewMode,layoutAnnounced:session.environment.config.layoutId,staffCountAnnounced:session.environment.employees.length}}:{}),
        runtimeConfig: {difficulty:session.config.difficulty,learning:session.config.learning,training:session.config.training,provenance:session.config.provenance,stockPerProduct:session.config.stockPerProduct,initialStock:session.initialStock,
          alarmPenaltyPoints:session.config.alarmPenaltyPoints,wrongWayPenaltyPoints:session.config.wrongWayPenaltyPoints,cashierRequestPenaltyPoints:session.config.cashierRequestPenaltyPoints},
        geometry: JSON.stringify(session.environment), exposureMeaning: '진열 목록과 실제 배치이며 열람·이해를 뜻하지 않는다.' },
    } };
  }, [session.id, mission, simulation?.questInstanceId]);
  useEffect(() => {
    if (!accessToken) return;
    const activeClock = questClock.current;
    const current = new MarketBehaviorTracker(accessToken, trackedMission, difficulty, simulation, session.environment.stations,
      {
        timingSnapshot: () => activeClock.snapshot(),
        ...(agentControl ? {
        sessionId: agentControl.sessionId,
        initialControlMode: 'agent',
        agentContext: agentControl.provenance,
        } : session.config.provenance.source === 'synthetic' ? {
          agentContext: {agentModel:session.config.provenance.agentModel!,personaId:session.config.provenance.personaId!,personaVersion:session.config.provenance.personaVersion},
        } : {}),
      });
    trackerFinalized.current = false;
    finalization.current = null;
    tracker.current = current;
    const initialTiming = activeClock.snapshot();
    if (initialTiming.startedAt) current.startTimeLimit({ ...initialTiming, elapsedMs: 0,
      remainingMs: initialTiming.timeLimitSeconds * 1000, expired: false });
    void current.flushNow().catch(() => undefined);
    return () => { void current.abort(live.current.cart).catch(() => undefined); tracker.current = null; };
  }, [accessToken, trackedMission, difficulty, simulation?.questInstanceId, simulation?.contentSource, agentControl?.sessionId]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') { tracker.current?.appForegrounded(); timeGuard.current(); }
      else tracker.current?.appBackgrounded();
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    onTelemetryReady?.({ movementStopped: mode => { if (!timeGuard.current()) tracker.current?.movementStopped(mode); },
      observeMovement: (point, mode, blocked) => { if (!timeGuard.current()) tracker.current?.observeMovement({ point, controlMode: mode, blocked, targetZoneIds: new Set() }); } });
    return () => onTelemetryReady?.(null);
  }, [onTelemetryReady]);
  const localPosition = useRef(session.environment.spawn);
  const ownViewFrame = useRef<MarketViewFrame|null>(null);
  const viewFrame = viewFrameRef ?? ownViewFrame;
  const onViewFrame = useCallback((frame:MarketViewFrame)=>{ownViewFrame.current=frame},[]);
  const [mapOpen,setMapOpen]=useState(false);
  const training=normalizeMarketTraining(session.config.training);
  const trainingStart=useRef<number|null>(null);
  const [trainingSeconds,setTrainingSeconds]=useState(0);
  const lastTurn=useRef({angle:0,at:0});
  const checkoutBackHandler = useRef<(() => boolean) | null>(null);
  const setCheckoutBackHandler = useCallback((handler: (() => boolean) | null) => { checkoutBackHandler.current = handler; }, []);
  const [briefing, setBriefing] = useState(true);
  const [briefingStep, setBriefingStep] = useState(0);
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [settings, setSettings] = useState(false),
    [cartOpen, setCartOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false);
  const [shoppingListOpen, setShoppingListOpen] = useState(false);
  const [nearby, setNearby] = useState<MarketStationId | null>(null);
  const [difficultyRating, setDifficultyRating] = useState(0),
    [interestRating, setInterestRating] = useState(0);
  const [exportMessage, setExportMessage] = useState(''),
    [staffMessage, setStaffMessage] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [staffReturnHelp, setStaffReturnHelp] = useState(false);
  const [staffLocationHelp, setStaffLocationHelp] = useState(false);
  const [staffResponse, setStaffResponse] = useState('');
  const [cashierAnswered, setCashierAnswered] = useState(false);
  const [staffRequestPenalty, setStaffRequestPenalty] = useState<number | null>(null);
  const cashierRequestHandled = useRef(false);
  const resetStaffReply = useCallback(() => {
    setStaffResponse('');
    setCashierAnswered(false);
    setStaffRequestPenalty(null);
    cashierRequestHandled.current = false;
  }, []);
  const [alarmNotice, setAlarmNotice] = useState<number | null>(null);
  const [wrongWayNotice, setWrongWayNotice] = useState<{ delta: number; message: string } | null>(null);
  const [panelPresent, setPanelPresent] = useState(true);
  const handled = useRef<number | null>(null),
    completed = useRef(false),
    emitted = useRef(false);
  const agentRevision = useRef(0);
  const agentStepCount = useRef(0);
  const agentActionResults = useRef(new Map<string, unknown>());
  const position = playerPositionRef ?? localPosition;
  const shelf = marketCategories.find(category => category.id === session.activeStation);
  const requesterOpen = session.view === 'requester';
  const [budgetReviewTotal, setBudgetReviewTotal] = useState<number | null>(null);
  const panelVisible = mapOpen || expiredTiming !== null || review !== null || requesterOpen || briefing || settings || layoutEditing || historyOpen || session.phase !== 'shopping' || cartOpen || helpOpen || staffMessage;
  const locked = panelVisible || panelPresent || !!shelf || shoppingListOpen;
  const briefingText = !mission ? marketTrainingInstruction(session.config.training) : briefingPages ? briefingPages[briefingStep] : briefingStep === 0
    ? mission?.description ?? '목록을 보고 필요한 물건을 골라 보세요. 물건의 이름과 종류를 천천히 살펴봐요.'
    : aiAssessment ? '다 골랐다면 계산대로 가서 AI 검토를 요청해 주세요. 언제든 그만둘 수 있어요.'
      : `다 골랐다면 출구 옆 계산대로 가요. 계산하지 않은 물건을 담고 입구·출구·측면 출입문의 빨간 경보기를 지나 매장 밖으로 나가면 ${session.config.alarmPenaltyPoints}점이 줄어요. 원하면 다시 해보거나 언제든 그만둘 수 있어요.`;
  const agentUi = useRef<MarketAgentUiState>({} as MarketAgentUiState);
  agentUi.current = {
    briefing, briefingStep, briefingText: briefing ? briefingText : null, cartOpen, helpOpen, staffMessage,
    staffReturnHelp, staffResponse, settingsOpen: settings, historyOpen, reviewMessage: review,
  };
  const requestExpiredAnalysis = useCallback(async () => {
    if (reviewing.current || reviewAccepted.current) return;
    const current = tracker.current;
    const activeClock = questClock.current;
    if (!current || !accessToken) {
      setReview('기록은 이 기기에 저장했어요. AI 분석은 로그인 후 사용할 수 있어요.');
      return;
    }
    reviewing.current = true;
    reviewError.current = null;
    setReview('시간 종료 기록을 전송하고 분석을 접수하고 있어요.');
    try {
      await finalization.current?.catch(() => undefined);
      await current.flushConfirmed();
      await startSessionAnalysisJob(accessToken, current.sessionId);
      if (questClock.current !== activeClock) return;
      reviewAccepted.current = true;
      if (mounted.current) setReview('분석을 접수했어요. 분석 탭에서 진행 상태와 결과를 확인해 주세요.');
    } catch (error) {
      if (questClock.current !== activeClock) return;
      reviewError.current = error instanceof Error ? error.message : '분석을 접수하지 못했어요.';
      if (mounted.current) setReview(reviewError.current);
    } finally { if (questClock.current === activeClock) reviewing.current = false; }
  }, [accessToken]);
  const expireTimeLimit = useCallback(() => {
    if (live.current.phase === 'finished' || trackerFinalized.current || !questClock.current.snapshot().expired) return;
    const snapshot = questClock.current.freeze();
    const next = applyMarketAction(live.current, { type: 'expireTimeLimit', timing: snapshot, at: new Date().toISOString() });
    live.current = next;
    setSession(next);
    setTiming(snapshot);
    setExpiredTiming(snapshot);
    setBriefing(false); setSettings(false); setHistoryOpen(false); setCartOpen(false); setHelpOpen(false);
    setStaffMessage(false); setStaffReturnHelp(false); setStaffLocationHelp(false);
    trackerFinalized.current = true;
    if (tracker.current) finalization.current = tracker.current.expireTimeLimit(next.cart, snapshot);
    if (aiAssessment) analysisRequest.current = requestExpiredAnalysis();
  }, [aiAssessment, requestExpiredAnalysis]);
  expireRef.current = expireTimeLimit;
  timeGuard.current = () => {
    if (!questClock.current.snapshot().expired) return false;
    expireRef.current?.();
    return true;
  };
  useEffect(() => {
    if (briefing || expiredTiming || session.phase === 'finished' || trackerFinalized.current) return;
    const update = () => {
      const snapshot = questClock.current.snapshot();
      setTiming(snapshot);
      if (snapshot.expired) expireRef.current?.();
    };
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [briefing, expiredTiming, session.phase, review]);
  const dispatch = useCallback((action: MarketAction, sync = false) => {
    if (!['rate', 'skipRating'].includes(action.type) && timeGuard.current()) {
      return { ...live.current, lastActionError: '장보기 시간이 종료됐어요.' };
    }
    let current = live.current;
    if ((action.type === 'submit' || action.type === 'submitKiosk') && spendingLimit !== undefined) {
      const total = action.type === 'submitKiosk' ? getMarketCartTotal(action.scannedCart) : getMarketCheckoutReview(current)?.total ?? getMarketCartTotal(current.cart);
      if (total > spendingLimit) { setBudgetReviewTotal(total); return current; }
    }
    const at = new Date().toISOString();
    if (sync) current = applyMarketAction(current, { type: 'setPosition', point: { ...position.current }, at });
    const next = applyMarketAction(current, { ...action, at });
    if (!next.lastActionError) {
      const logger = tracker.current;
      if(mission?.runtimePlan)logger?.runtimeState({effectiveObjectives:next.objectives,learning:next.learning,checkoutReview:next.checkoutReview,paid:next.paid});
      if(['startTraining','endTraining','trainingTick','finishShelfTask','askLocation','checkStock','viewRequester','requestSubstitution','reportUnavailable','requestCheckoutCorrection','submitKiosk'].includes(action.type))
        logger?.track({eventCode:'SHOP.RUNTIME_ACTION_RECORDED',microActionId:action.type.toUpperCase(),priority:'high',payload:{marketContent:{action,
          runtimeState:{effectiveObjectives:next.objectives,learning:next.learning,checkoutReview:next.checkoutReview,paid:next.paid},
          outcomeEvents:next.events.slice(current.events.length)}}});
      if (action.type === 'add' || action.type === 'remove' || action.type === 'requestReturn') {
        logger?.updateCart(next.cart);
        logger?.quantityChanged(action.productId, current.cart[action.productId] ?? 0, next.cart[action.productId] ?? 0, next.cart, next.playerPosition);
      }
      if (next.activeStation !== current.activeStation) {
        if (marketCategories.some(c => c.id === current.activeStation)) logger?.shelfClosed(current.activeStation as MarketCategoryId, next.cart, shelfOpenedAt.current, next.playerPosition);
        if (marketCategories.some(c => c.id === next.activeStation)) { shelfOpenedAt.current = Date.now(); logger?.shelfOpened(next.activeStation as MarketCategoryId, next.playerPosition); }
      }
      if (next.phase === 'checkout' && current.phase !== 'checkout') logger?.checkoutEntered(next.cart);
      if (action.type === 'viewCart') { cartOpenedAt.current=Date.now(); logger?.cartOpened(next.cart); }
      if (action.type === 'closeView' && current.view === 'cart') logger?.cartClosed(next.cart, Date.now()-cartOpenedAt.current);
      if (action.type === 'retry') logger?.correctionStarted(next.cart);
      if (action.type === 'viewHelp') logger?.track({ eventCode:'SHOP.GENERAL_HELP_OPENED', microActionId:'VIEWHELP', payload:{marketContent:{action}} });
      else if (action.type === 'requestReturn' || action.type === 'requestCashier' || (action.type === 'interact' && action.station.startsWith('staff:'))) logger?.track({ eventCode:'SHOP.STAFF_HELP_REQUESTED', microActionId:action.type.toUpperCase(), payload:{x:next.playerPosition.x,y:next.playerPosition.y,stationId:action.type==='interact'?action.station:current.activeStation??undefined,marketContent:{action}} });
    }
    live.current = next;
    if (next.phase === 'finished') { setTiming(questClock.current.freeze()); }
    setSession(next);
    return next;
  }, [position, mission?.runtimePlan, spendingLimit]);
  const contactRequester = useCallback(() => {
    const next = dispatch({ type: 'viewRequester' }, true);
    if (next.lastActionError) return;
    setStaffMessage(false);
    setStaffReturnHelp(false);
    setStaffLocationHelp(false);
    setCartOpen(false);
    setHelpOpen(false);
    resetStaffReply();
  }, [dispatch, resetStaffReply]);
  const syncMovementSegment = useCallback((previous: Point, next: Point) => {
    if (briefing || live.current.phase !== 'shopping') return;
    const angle=Math.atan2(next.y-previous.y,next.x-previous.x),now=Date.now();
    const turning=Math.abs(angle-lastTurn.current.angle)>0.25&&now-lastTurn.current.at>150;
    if(turning) lastTurn.current={angle,at:now};
    if (!embedded) tracker.current?.observeMovement({point:next, controlMode:controlMode ?? 'joystick', targetZoneIds:new Set()});
    const env = live.current.environment;
    const gates = env.alarmGates ?? [{ axis: 'y' as const, boundary: env.entrance.alarmBoundaryY, rearm: env.entrance.rearmY }];
    const exitGate = env.alarmGates?.find(gate => gate.id === 'exit');
    const crossesGate = gates.some(gate => {
      const from = previous[gate.axis], to = next[gate.axis];
      const lines = [gate.boundary, gate.rearm];
      if (exitGate && gate === exitGate) lines.push(getMarketWrongWayRearm(exitGate));
      return from !== to && lines.some(line =>
        Math.min(from, to) <= line && Math.max(from, to) >= line);
    });
    if (!crossesGate && !turning) return;
    // Keep both ends of a gate crossing even when an out-and-back trip falls between log samples.
    dispatch({ type: 'setPosition', point: { ...previous } });
    dispatch({ type: 'setPosition', point: { ...next } });
  }, [briefing, dispatch]);
  useEffect(() => {
    if (!playerMovementListenerRef) return;
    playerMovementListenerRef.current = syncMovementSegment;
    return () => { playerMovementListenerRef.current = null; };
  }, [playerMovementListenerRef, syncMovementSegment]);
  const giveUp = useCallback(() => {
    setBriefing(false);
    setSettings(false);
    setLayoutEditing(false);
    setHistoryOpen(false);
    setCartOpen(false);
    setHelpOpen(false);
    setStaffMessage(false);
    setStaffReturnHelp(false);
    resetStaffReply();
    dispatch({ type: 'giveUp' }, live.current.phase === 'shopping');
  }, [dispatch, resetStaffReply]);
  const interact = useCallback((station: MarketStationId) => {
    if (externalMenuOpen) return;
    const next = dispatch({ type: 'interact', station }, true);
    if (station.startsWith('staff:') && !next.lastActionError) {
      setStaffMessage(true);
      setStaffReturnHelp(false);
      setStaffLocationHelp(false);
      resetStaffReply();
    }
    setCartOpen(false);
    setHelpOpen(false);
  }, [dispatch, resetStaffReply, externalMenuOpen]);
  useEffect(() => {
    if (!interactionRequest || handled.current === interactionRequest.id || session.phase === 'finished') return;
    if (externalMenuOpen && interactionRequest.station !== 'give-up') {
      // The settings panel finishes closing before the editor takes over input.
      if (interactionRequest.station === 'edit-layout') return;
      handled.current = interactionRequest.id;
      return;
    }
    if (interactionRequest.station !== 'give-up' && (briefing || session.phase !== 'shopping')) return;
    handled.current = interactionRequest.id;
    if (interactionRequest.station === 'give-up') giveUp();
    else if (interactionRequest.station === 'edit-layout') {
      if (session.view === 'world' && session.activeStation === null && !session.paid) {
        setLayoutEditing(true);
      }
    }
    else if (interactionRequest.station === 'contact-requester') contactRequester();
    else interact(interactionRequest.station);
  }, [briefing, interactionRequest, interact, giveUp, contactRequester, session.phase, session.view, session.activeStation, session.paid, externalMenuOpen]);
  useEffect(() => {
    onLockChange?.(locked);
  }, [locked, onLockChange]);
  useEffect(() => () => onLockChange?.(false), [onLockChange]);
  useEffect(() => {
    if (session.environment.checkouts.some(counter => session.cashierAvailability[counter.id] && !counter.cashierPresent)) {
      onCashierCalled?.({ ...session.cashierAvailability });
    }
  }, [session.cashierAvailability.checkout, session.cashierAvailability['checkout-2'], onCashierCalled]);
  useEffect(() => {
    if (!session.alarmCount) return;
    const alarm = [...live.current.events].reverse().find(event => event.type === 'entrance_alarm');
    setAlarmNotice(Math.abs(Number(alarm?.payload.delta ?? 0)));
    const timer = setTimeout(() => setAlarmNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [session.alarmCount]);
  useEffect(() => {
    if (!session.wrongWayEntryCount) return;
    const event = [...live.current.events].reverse().find(item => item.type === 'wrong_way_entry');
    if (!event) return;
    setWrongWayNotice({ delta: Math.abs(Number(event.payload.delta ?? 0)), message: String(event.payload.message ?? '입구를 이용해 주세요.') });
    const timer = setTimeout(() => setWrongWayNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [session.wrongWayEntryCount]);
  useEffect(() => {
    if (!aiAssessment && session.outcome === 'success' && !completed.current) {
      completed.current = true;
      onMissionComplete?.();
    }
  }, [session.outcome, onMissionComplete]);
  useEffect(() => {
    if (session.phase !== 'finished') return;
    const saved = saveMarketEpisode(exportMarketEpisode(session));
    setExportMessage(saved.persisted ? '이 브라우저에 기록을 저장했어요. 시작 화면에서 다시 내보낼 수 있어요.' : '앱을 닫기 전에 게임 기록 저장을 눌러 보관해 주세요.');
  }, [session.outcome, session.ratings, session.ratingSkipped]);
  useEffect(() => {
    if (session.phase !== 'finished' || !tracker.current || trackerFinalized.current) return;
    trackerFinalized.current = true;
    const current = tracker.current;
    finalization.current = (session.outcome === 'success' ? current.complete(session.cart) : current.abort(session.cart))
      .then(() => current.flushConfirmed());
    void finalization.current.catch(() => undefined);
  }, [session.phase, session.outcome]);
  useEffect(() => {
    if (briefing || session.phase === 'finished' || review!==null) return;
    const timer = setInterval(() => {
      const old = live.current.playerPosition,
        point = position.current;
      if (Math.hypot(old.x - point.x, old.y - point.y) >= 3 || Date.now()-Date.parse(live.current.events.at(-1)?.timestamp??'')>=2000) dispatch({ type: 'setPosition', point: { ...point } });
    }, 500);
    return () => clearInterval(timer);
  }, [briefing, session.phase, dispatch, position, review]);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (externalMenuOpen) return false;
      if (mapOpen) { dispatch({type:'closeView'}); setMapOpen(false); return true; }
      if (layoutEditing) { setLayoutEditing(false); return true; }
      if (panelPresent && !panelVisible) return true;
      if (live.current.phase === 'checkout' && checkoutBackHandler.current?.()) return true;
      if (historyOpen) {
        setHistoryOpen(false);
        return true;
      }
      if (requesterOpen) { dispatch({ type: 'closeView' }); return true; }
      if (shelf) return false;
      if (settings) setSettings(false);
      else if (cartOpen) {
        dispatch({ type: 'closeView' });
        setCartOpen(false);
      } else if (helpOpen) {
        dispatch({ type: 'closeView' });
        setHelpOpen(false);
      } else if (staffMessage) {
        resetStaffReply();
        if (staffLocationHelp) setStaffLocationHelp(false);
        else if (staffReturnHelp) setStaffReturnHelp(false);
        else {
          dispatch({ type: 'closeStation' });
          setStaffMessage(false);
          setStaffReturnHelp(false);
        }
      }
      else if (briefing) onExit();
      else if (session.phase === 'checkout') { setBudgetReviewTotal(null); dispatch({ type: 'closeStation' }); }
      else if (session.phase !== 'finished') giveUp();
      else return false;
      return true;
    });
    return () => back.remove();
  }, [shelf, settings, historyOpen, cartOpen, helpOpen, staffMessage, staffReturnHelp, staffLocationHelp, requesterOpen, session.phase, giveUp, dispatch, resetStaffReply, panelPresent, panelVisible, externalMenuOpen, mapOpen, layoutEditing, briefing, onExit]);
  const configure = (config: Partial<MarketSessionConfig>, changes?: MarketSetupChanges) => {
    trainingStart.current=null; setTrainingSeconds(0); setMapOpen(false);
    replaySnapshot.current = null;
    questClock.current.freeze();
    questClock.current = new MarketQuestClock(resolveMarketTimeLimitSeconds(mission?.timeLimitSeconds));
    setTiming(questClock.current.snapshot());
    setExpiredTiming(null); setReview(null); setPurchaseVerdict(null); reviewing.current = false; reviewAccepted.current = false; reviewError.current = null;
    completed.current = false; emitted.current = false; trackerFinalized.current = false; finalization.current = null;
    analysisRequest.current = null;
    const selectedMission=changes?.trainingTestTouched&&mission?{...mission,scenarioId:'CUSTOM',title:normalizeMarketTraining(config.training).task==='mother-request'?'어머니의 부탁':'직접 만든 장보기 테스트',objectives:config.objectives??mission.objectives,briefing:[marketTrainingInstruction(config.training)]}:mission;
    if(changes?.trainingTestTouched&&selectedMission)setCustomMission(selectedMission);
    const next = createMissionSession({ ...config, startedAt: new Date().toISOString() }, selectedMission,undefined,true);
    const shelfOrderTouched = changes?.shelfOrderTouched
      ?? JSON.stringify(next.environment.config.shelfOrder) !== JSON.stringify(live.current.environment.config.shelfOrder);
    live.current = next;
    setSession(next);
    localPosition.current = next.environment.spawn;
    onEnvironmentChange?.(next.environment, { shelfOrderTouched, trainingTestTouched:changes?.trainingTestTouched, lockedSettings:runtimeSettingLocks(next.config,next.environment,changes?.changedConfigPaths??[]) });
    setSettings(false);
    setBriefing(true);
    setBriefingStep(0);
  };
  const submitForReview = async (scannedCart?: Record<string,number>) => {
    if (timeGuard.current()) return;
    if (!aiAssessment) { dispatch({ type: 'submit' }); return; }
    if (reviewing.current) return;
    reviewing.current = true;
    dispatch({type:'endTraining'},true);
    // 계산을 마친 순간 '끝까지 한 장보기'로 개인 활동 기록에만 알린다. 로그인·AI 접수 성공과 무관하고,
    // 에이전트·재생 실행은 제외한다. 이 알림은 AI 검토·행동 로그·미션 흐름에 아무것도 돌려주지 않는다.
    if (!agentControl && !replayUiRef) {
      const emptyCart = !Object.values(live.current.cart).some((quantity) => quantity > 0);
      if (emptyCart) {
        // 아무것도 담지 않고 계산만 한 경우: 화면·개인 기록에서는 '장보기 포기'로 보고 경험치·활동 기록을 남기지 않는다.
        // AI 분석 접수와 행동 로그는 아래에서 그대로 진행된다.
        setPurchaseVerdict({ kind: 'gave-up', details: [], note: '물건을 하나도 담지 않고 계산해서 포기로 기록했어요.' });
      } else {
        // 플레이어에게 보여 줄 간단한 목록 비교 결과. 이벤트를 남기지 않고 세션도 바꾸지 않는다.
        let verdict: { success: boolean; details: string[] } | null = null;
        try { verdict = getMarketPurchaseVerdict(live.current); } catch { verdict = null; }
        setPurchaseVerdict(verdict ? { kind: verdict.success ? 'success' : 'complete', details: verdict.details } : null);
        try { onShoppingFinished?.({ sessionId: live.current.id, completedAt: Date.now(), cart: { ...live.current.cart }, kiosk: !!scannedCart, success: verdict?.success }); } catch { /* record only */ }
      }
    }
    reviewAccepted.current = false;
    reviewError.current = null;
    setReview('기록을 전송하고 AI가 검토하고 있어요.');
    try {
      const current = tracker.current;
      if (!current || !accessToken) throw new Error('로그인 후 AI 검토를 사용할 수 있어요.');
      const snapshot = questClock.current.freeze();
      setTiming(snapshot);
      if(adaptiveAssessment){
        const runtimeState={effectiveObjectives:live.current.objectives,learning:live.current.learning,checkoutReview:live.current.checkoutReview,paid:live.current.paid};
        current.runtimeState(runtimeState);
        current.track({eventCode:'SHOP.RUNTIME_ACTION_RECORDED',microActionId:scannedCart?'CONFIRM_KIOSK':'CONFIRM_STAFFED_CHECKOUT',priority:'high',payload:{marketContent:{action:{type:scannedCart?'confirmKiosk':'confirmStaffedCheckout',...(scannedCart?{scannedCart}: {})},runtimeState}}});
      }
      current.checkoutSubmitted(live.current.cart);
      trackerFinalized.current = true;
      finalization.current = current.complete(live.current.cart);
      await finalization.current;
      await current.flushConfirmed();
      await startSessionAnalysisJob(accessToken, current.sessionId);
      reviewAccepted.current = true;
      if (mounted.current) setReview('분석을 접수했어요. 다른 화면으로 이동해도 계속 진행됩니다. 분석 탭에서 진행 상태와 결과를 확인해 주세요.');
    } catch (error) { reviewError.current = error instanceof Error ? error.message : '검토를 접수하지 못했어요.'; if (mounted.current) setReview(reviewError.current); }
    finally { reviewing.current = false; }
  };
  const leave = () => {
    timeGuard.current();
    questClock.current.freeze();
    if (!tracker.current) { onExit(); return Promise.resolve(); }
    return tracker.current.abort(live.current.cart).then(() => finalization.current)
      .then(() => analysisRequest.current).catch(() => undefined).finally(onExit);
  };
  const restartExpiredQuest = async () => {
    if (reviewing.current) return;
    reviewing.current = true;
    try {
      await tracker.current?.persistLocal();
      configure({ ...live.current.config, sessionId: undefined });
    } catch (error) {
      reviewError.current = error instanceof Error ? error.message : '종료 기록을 저장하지 못했어요.';
      if (mounted.current) setReview('종료 기록을 저장하지 못했어요. 다시 시도해 주세요.');
    } finally { reviewing.current = false; }
  };
  const selectDifficulty = (difficulty: 'family' | 'exact') => configure({
    ...session.config,
    difficulty,
    objectives: session.config.objectives.map(({ productId, quantity }) => ({ productId, quantity }))
  });
  const start = () => {
    trainingStart.current=Date.now();setTrainingSeconds(0);
    if (aiAssessment) {
      const snapshot = questClock.current.start();
      setTiming(snapshot); tracker.current?.startTimeLimit(snapshot);
      dispatch({type:'startTraining'});setBriefing(false); return;
    }
    const next = createMarketSession({ ...session.config, startedAt: new Date().toISOString() }, session.environment);
    live.current = next;
    setSession(next);
    const snapshot = questClock.current.start();
    setTiming(snapshot);
    dispatch({type:'startTraining'});
    setBriefing(false);
  };
  // 사람이 플레이할 때는 '다음' 없이 바로 시작한다. 실제로 본 안내 화면 한 장만 기록하고(꾸민 체류 시간을 남기지 않음),
  // 나머지 안내 문구는 시나리오 상세 창에서 볼 수 있다. 에이전트·페르소나 재생은 기존 단계별 진행을 그대로 쓴다.
  const startNow = () => {
    tracker.current?.briefingAdvanced(briefingStep, Date.now() - briefingShownAt.current);
    agentUi.current = { ...agentUi.current, briefing: false, briefingText: null };
    start();
  };
  const briefingRuleText = `다 골랐다면 출구 옆 계산대로 가요. 계산하지 않은 물건을 담고 입구·출구·측면 출입문의 빨간 경보기를 지나 매장 밖으로 나가면 ${session.config.alarmPenaltyPoints}점이 줄어요. 원하면 다시 해보거나 언제든 그만둘 수 있어요.`;
  const advanceBriefing = () => {
    tracker.current?.briefingAdvanced(briefingStep, Date.now() - briefingShownAt.current);
    briefingShownAt.current = Date.now();
    if (briefingStep < lastBriefingStep) {
      const nextStep = briefingStep + 1;
      agentUi.current = { ...agentUi.current, briefingStep: nextStep,
        briefingText: briefingPages?.[nextStep] ?? (nextStep === 0 ? briefingText : briefingRuleText) };
      setBriefingStep(nextStep);
    } else {
      agentUi.current = { ...agentUi.current, briefing: false, briefingText: null };
      start();
    }
  };
  const finishRating = (rate: boolean) => {
    const next = rate
      ? dispatch({ type: 'rate', difficulty: difficultyRating, interest: interestRating })
      : dispatch({ type: 'skipRating' });
    if (next.lastActionError) return;
    if (!emitted.current) {
      emitted.current = true;
      onEpisodeComplete?.(exportMarketEpisode(next));
    }
  };
  const exportData = async (episode: MarketStoredEpisode = exportMarketEpisode(live.current)) => {
    const json = JSON.stringify(episode, null, 2);
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = episode.sessionId + '.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage('게임 기록을 JSON 파일로 저장했어요.');
    } else {
      await Share.share({ title: '장보기 게임 기록', message: json });
      setExportMessage('공유 창에서 기록을 저장할 수 있어요.');
    }
  };
  const closeStation = () => {
    setBudgetReviewTotal(null);
    dispatch({ type: 'closeStation' });
    setStaffMessage(false);
    setStaffReturnHelp(false);
    setStaffLocationHelp(false);
    resetStaffReply();
  };
  const requestCashier = () => {
    // A quick second tap must not turn a successful request into a new penalty.
    if (cashierRequestHandled.current) return;
    cashierRequestHandled.current = true;
    const next = dispatch({ type: 'requestCashier' }, true);
    if (next.lastActionError) {
      cashierRequestHandled.current = false;
      return;
    }
    const reply = next.events[next.events.length - 1];
    if (reply?.type === 'cashier_request_declined') {
      setStaffResponse(String(reply.payload.message));
      setStaffRequestPenalty(Math.abs(Number(reply.payload.delta ?? 0)));
      setCashierAnswered(true);
    } else if (reply?.type === 'cashier_requested') {
      setStaffResponse(String(reply.payload.message));
      setStaffRequestPenalty(null);
      setCashierAnswered(true);
    } else cashierRequestHandled.current = false;
  };
  const requestProductReturn = (productId: string, quantity: number) => {
    const next = dispatch({ type: 'requestReturn', productId, quantity }, true);
    if (!next.lastActionError) setStaffResponse(`${getMarketProduct(productId)?.name} ${quantity}개를 제자리에 놓아드렸어요.`);
  };
  // These handlers are shared by the visible buttons and the development input port.
  const openCart = () => { if (!dispatch({ type: 'viewCart' }).lastActionError) setCartOpen(true); };
  const openHelp = () => { if (!dispatch({ type: 'viewHelp' }).lastActionError) setHelpOpen(true); };
  const closeCart = () => { dispatch({ type: 'closeView' }); setCartOpen(false); };
  const closeHelp = () => { dispatch({ type: 'closeView' }); setHelpOpen(false); };
  const requestSpecificCashier = (checkoutId: 'checkout' | 'checkout-2') => {
    const next = dispatch({ type: 'requestCashier', checkoutId }, true);
    if (!next.lastActionError) setStaffResponse(String(next.events.at(-1)?.payload.message ?? '계산대 상태를 다시 확인해 주세요.'));
  };
  const openReturnHelp = () => { if (timeGuard.current()) return; setStaffReturnHelp(true); setStaffResponse(''); };
  const backToStaff = () => { setStaffReturnHelp(false); setStaffLocationHelp(false); resetStaffReply(); };
  const openLocationHelp = () => { if (timeGuard.current()) return; setStaffLocationHelp(true); setStaffReturnHelp(false); resetStaffReply(); };
  if (__DEV__ && replayUiRef && aiAssessment) {
    replayUiRef.current = {
      recordExecutionContext:context=>tracker.current?.recordReplayExecutionContext(context),
      snapshot: () => {
        const presentation = replayPresentation?.();
        if (briefing && briefingStep === 0 && JSON.stringify(replaySnapshot.current?.presentation) !== JSON.stringify(presentation)) replaySnapshot.current = null;
        if (!replaySnapshot.current) {
          const { createMarketReplaySnapshot } = require('../game/marketReplayTrace') as typeof import('../game/marketReplayTrace');
          replaySnapshot.current = createMarketReplaySnapshot(live.current, mission, presentation);
        }
        return replaySnapshot.current!;
      },
      presentation: () => replayPresentation?.(),
      scrollList: fraction => {
        if (!replayList.current) throw new Error('Shopping list is not visible');
        replayList.current(fraction);
      },
      viewShoppingList: open => {
        if (open && !replayListVisibility.current) throw new Error('Shopping list button is not visible');
        replayListVisibility.current?.(open);
      },
      sessionId: () => tracker.current?.sessionId ?? null,
      read: () => ({ briefing, briefingStep, phase: live.current.phase, shelf: shelf?.id ?? null,
        cartOpen, helpOpen, staffOpen: staffMessage, staffReturnHelp, staffLocationHelp, panelTransition: panelPresent && !panelVisible,
        reviewing: reviewing.current, reviewAccepted: reviewAccepted.current, reviewError: reviewError.current,
        cart: { ...live.current.cart } }),
      shelf: () => replayShelf.current,
      advanceBriefing, interact, viewCart: openCart, viewHelp: openHelp,
      closeView: () => { if (mapOpen) {dispatch({type:'closeView'});setMapOpen(false);} else if (helpOpen) closeHelp(); else if (cartOpen) closeCart(); else if (replayShelf.current) replayShelf.current.viewCart(false); },
      closeStation: () => replayShelf.current ? replayShelf.current.close() : closeStation(),
      openLocationHelp, askLocation, requestCashier: requestSpecificCashier, requestReturn: requestProductReturn, openReturnHelp, backToStaff, submit: submitForReview, giveUp,
      skipRating: () => finishRating(false),
      leave: async () => { const current = tracker.current; await leave(); await current?.flushConfirmed(); },
    };
  }
  useEffect(() => () => { if (replayUiRef) replayUiRef.current = null; }, [replayUiRef]);
  const observeForAgent = useCallback(() => buildMarketAgentObservation(
    live.current,
    agentRevision.current,
    agentStepCount.current,
    agentControl?.maxSteps ?? 2000,
    agentUi.current,
  ), [agentControl?.maxSteps]);
  const executeAgentAction = useCallback(async (input: MarketAgentActionInput) => {
    if (!agentControl || input.sessionId !== agentControl.sessionId) throw Object.assign(new Error('AI 세션을 찾을 수 없습니다.'), { code: 'SESSION_NOT_FOUND' });
    const duplicate = agentActionResults.current.get(input.actionId);
    if (duplicate) return duplicate;
    if (input.expectedRevision !== agentRevision.current) throw Object.assign(new Error(`expectedRevision=${input.expectedRevision}, currentRevision=${agentRevision.current}`), { code: 'STALE_REVISION' });
    if (agentStepCount.current >= agentControl.maxSteps) throw Object.assign(new Error('최대 행동 수에 도달했습니다.'), { code: 'STEP_LIMIT_REACHED' });
    const action: MarketAgentAction = input.action;
    const allowed = new Set(['move', 'interact', 'add', 'remove', 'requestReturn', 'checkout', 'requestCashier', 'submit', 'retry',
      'giveUp', 'skipRating', 'closeStation', 'viewCart', 'viewHelp', 'closeView', 'rate', 'continueBriefing', 'askLocation', 'checkStock', 'finishShelfTask']);
    if (!action || !allowed.has(action.type) || (action as { type: string }).type === 'setPosition') {
      throw Object.assign(new Error('AI에게 허용되지 않은 행동입니다.'), { code: 'ACTION_NOT_ALLOWED' });
    }
    if (!['rate', 'skipRating'].includes(action.type) && timeGuard.current()) {
      throw Object.assign(new Error('장보기 시간이 종료됐어요.'), { code: 'TIME_LIMIT_EXPIRED' });
    }
    let next = live.current;
    if (action.type === 'continueBriefing') {
      if (!agentUi.current.briefing) throw Object.assign(new Error('현재 브리핑 화면이 아닙니다.'), { code: 'ACTION_REJECTED' });
      advanceBriefing();
    } else {
      if (action.type === 'submit') tracker.current?.checkoutSubmitted(live.current.cart);
      next = dispatch(action);
      if (!next.lastActionError) {
        if (action.type === 'move') {
          position.current = { ...next.playerPosition };
          tracker.current?.observeMovement({ point: next.playerPosition, controlMode: 'agent', targetZoneIds: new Set() });
        }
        if (action.type === 'interact') {
          setCartOpen(false); setHelpOpen(false);
          if (action.station.startsWith('staff:')) { setStaffMessage(true); setStaffReturnHelp(false); setStaffResponse(''); }
        }
        if (action.type === 'viewCart') setCartOpen(true);
        if (action.type === 'viewHelp') setHelpOpen(true);
        if (action.type === 'closeView') { setCartOpen(false); setHelpOpen(false); setMapOpen(false); }
        if (action.type === 'closeStation') { setStaffMessage(false); setStaffReturnHelp(false); setStaffResponse(''); }
        if (action.type === 'requestReturn') setStaffResponse(`${getMarketProduct(action.productId)?.name} ${action.quantity ?? 1}개를 제자리에 놓아드렸어요.`);
        if (action.type === 'requestCashier') setStaffResponse(String(next.events.at(-1)?.payload.message ?? '계산대 상태를 다시 확인해 주세요.'));
        if (action.type === 'giveUp') { setBriefing(false); setSettings(false); setHistoryOpen(false); setCartOpen(false); setHelpOpen(false); setStaffMessage(false); }
      }
    }
    agentStepCount.current += 1;
    agentRevision.current += 1;
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const result = {
      schemaVersion: 'oneuldo.market.agent-action-response.v1', sessionId: agentControl.sessionId,
      actionId: input.actionId, revision: agentRevision.current, accepted: !next.lastActionError, action,
      error: next.lastActionError ? { code: 'ACTION_REJECTED', message: next.lastActionError, recoverable: true } : null,
      requestedAt: new Date().toISOString(), appliedAt: new Date().toISOString(), observation: observeForAgent(),
    };
    agentActionResults.current.set(input.actionId, result);
    return result;
  }, [agentControl, dispatch, observeForAgent, position, briefingStep, lastBriefingStep]);
  useEffect(() => {
    if (!agentControl) return;
    const controller: MarketAgentController = {
      sessionId: agentControl.sessionId,
      observe: () => ({
        schemaVersion: 'oneuldo.market.agent-action-response.v1', sessionId: agentControl.sessionId,
        actionId: null, revision: agentRevision.current, accepted: true, action: null, error: null,
        requestedAt: null, appliedAt: new Date().toISOString(), observation: observeForAgent(),
      }),
      execute: executeAgentAction,
      exportEpisode: async () => {
        if (live.current.phase !== 'finished') throw Object.assign(new Error('게임이 종료된 후 행동 기록을 내보낼 수 있습니다.'), { code: 'SESSION_NOT_FINISHED' });
        await finalization.current;
        const episode = exportMarketEpisode(live.current);
        return { schemaVersion: 'oneuldo.market.agent-episode-response.v1', sessionId: agentControl.sessionId,
          revision: agentRevision.current, stepCount: agentStepCount.current, episode };
      },
      stop: async (reason?: string) => {
        let stopped = live.current;
        if (stopped.phase !== 'finished') {
          stopped = dispatch({ type: 'giveUp' }, stopped.phase === 'shopping');
          setBriefing(false); setSettings(false); setHistoryOpen(false); setCartOpen(false); setHelpOpen(false); setStaffMessage(false);
        }
        const currentTracker = tracker.current;
        if (currentTracker && !trackerFinalized.current) {
          trackerFinalized.current = true;
          finalization.current = currentTracker.abort(stopped.cart).then(() => currentTracker.flushConfirmed());
        }
        await finalization.current;
        return {
          schemaVersion: 'oneuldo.market.agent-stop-response.v1', sessionId: agentControl.sessionId,
          stopped: true, outcome: stopped.outcome, reason: reason ?? null,
        };
      },
    };
    agentControl.onReady(controller);
    return () => agentControl.onReady(null);
  }, [agentControl, dispatch, executeAgentAction, observeForAgent]);
  function askLocation(objectiveId: string) {
    const next = dispatch({ type: 'askLocation', objectiveId }, true);
    if (next.lastActionError) return;
    const event = next.events[next.events.length - 1];
    const categoryId = String(event?.payload.categoryId ?? '');
    const category = marketCategories.find(item => item.id === categoryId);
    if (!category) return;
    setStaffResponse(marketLocationResponse(next.environment, category.id));
  };
  const checkStock = () => {
    const stockout = live.current.learning.stockout;
    if (!stockout) return;
    const next = dispatch({ type: 'checkStock', productId: stockout.requestedProductId }, true);
    if (!next.lastActionError) setStaffResponse(`${getMarketProduct(stockout.requestedProductId)?.name}는 창고에도 남아 있지 않아요.`);
  };
  const shoppingObjectives = [...session.objectives, ...(session.learning.choiceTask ? [{
    id: session.learning.choiceTask.id,
    label: `${session.learning.choiceTask.label} · ${price(session.learning.choiceTask.budget)} 이내`,
    quantity: session.learning.choiceTask.quantity,
    quantityUnit: '개',
  }] : [])];
  useEffect(()=>{
    if(briefing||session.phase==='finished'||review!==null||trainingStart.current===null)return;
    const timer=setInterval(()=>{if(AppState.currentState!=='active')return;
      const elapsed=Math.floor((Date.now()-trainingStart.current!)/1000);setTrainingSeconds(elapsed);
      const due=marketIncidentPlan(live.current.environment,live.current.config.training).some(i=>elapsed>=i.elapsedSeconds&&!live.current.events.some(e=>e.type==='incident_started'&&e.payload.id===i.id));
      if(due)dispatch({type:'trainingTick'});
    },500);return()=>clearInterval(timer);
  },[briefing,session.phase,dispatch,review]);
  const route=useMemo(()=>buildMarketTrajectory(session.events,session.environment.spawn,training.routeIntervalSeconds),[session.events,session.environment.spawn,training.routeIntervalSeconds]);
  const hintEvent=session.events.findLast(e=>e.type==='product_location_requested');
  const activeIncidents=session.events.filter(e=>e.type==='incident_started').map(e=>({...e.payload,elapsedSeconds:Number(e.payload.actualElapsedSeconds??e.payload.elapsedSeconds)}) as MarketIncident).filter(i=>trainingSeconds>=i.elapsedSeconds&&trainingSeconds<i.elapsedSeconds+i.durationSeconds);
  const cartCount = Object.values(session.cart).reduce((a, b) => a + b, 0);
  const checkoutReview = getMarketCheckoutReview(session);
  const isFinished = session.phase === 'finished',
    ratingDone = !!session.ratings || session.ratingSkipped;
  const cashierPenaltyTotal = isFinished ? session.events.reduce((total, event) =>
    total + (event.type === 'cashier_request_declined' ? Math.abs(Number(event.payload.delta ?? 0)) : 0), 0) : 0;
  const wrongWayPenaltyTotal = isFinished ? session.events.reduce((total, event) =>
    total + (event.type === 'wrong_way_entry' ? Math.abs(Number(event.payload.delta ?? 0)) : 0), 0) : 0;
  const constructionActive = !!session.environment.constructionZones?.length;
  const panelKey = expiredTiming ? 'time-limit-expired' : review !== null ? 'ai-review' : layoutEditing ? 'layout-editor' : settings ? 'settings' : historyOpen ? 'history' : briefing ? 'briefing-' + briefingStep
    : requesterOpen ? 'requester' : cartOpen ? 'cart' : helpOpen ? 'help' : staffMessage ? 'staff-' + staffReturnHelp + '-' + staffLocationHelp
      : isFinished ? 'finished-' + ratingDone : session.phase + '-' + session.attempts;
  const modal = (
    title: string,
    children: React.ReactNode,
    eyebrow?: string,
    onClose?: () => void
  ) =>
    <ModalCard
      title={title}
      eyebrow={eyebrow}
      onClose={onClose}
    >
      {children}
    </ModalCard>;
  // goal-reminder-v1: the open cart repeats the quest's own text once the listed items are in it.
  const goalReminder = session.phase === 'shopping' ? marketGoalReminderLines(session.cart, mission) : null;
  const quit = <Button
    text="그만두기"
    label="장보기 포기"
    quiet
    onPress={giveUp}
  />;

  // 게임 안 플레이어 화면에서는 별점을 없앴으므로 결과가 뜨는 즉시 '평가 건너뛰기'와 같은 처리를 한다(기존 완료 신호 유지).
  // 에이전트·페르소나 재생은 기존 계약대로 skipRating 단계를 직접 보낸다.
  const autoSkipRating = playerUiOn && isFinished && !expiredTiming && !ratingDone;
  useEffect(() => {
    if (autoSkipRating) finishRating(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSkipRating]);
  // 별점(기존 화면 전용)과 마트 나가기. 게임 안 플레이어 화면에서는 2026-11-27 사용자 요청으로 별점을 보여 주지 않는다.
  const ratingControls = !ratingDone ? (playerUiOn ? null : <>
            <Text style={s.body}>오늘 장보기는 어땠나요? 평가를 건너뛰어도 괜찮아요.</Text>
            <Stars title="난이도" hint="1 쉬웠어요 · 5 어려웠어요" value={difficultyRating} onChange={setDifficultyRating} />
            <Stars title="흥미" hint="1 재미없었어요 · 5 재미있었어요" value={interestRating} onChange={setInterestRating} />
            <Button text="별점 남기기" disabled={!difficultyRating || !interestRating} onPress={() => finishRating(true)} />
            <Button text="평가 건너뛰기" quiet onPress={() => finishRating(false)} />
          </>)
          : <>
            {!playerUiOn ? <Text style={s.body}>
              {session.ratings
                ? '난이도 ' + session.ratings.difficulty + '점 · 흥미 ' + session.ratings.interest + '점'
                : '평가를 건너뛰었어요.'}
            </Text> : null}
            <Button
              text="게임 기록 저장"
              quiet
              onPress={() => {
                void exportData().catch(() => setExportMessage('저장하지 못했어요. 다시 눌러 주세요.'));
              }}
            />
            {exportMessage
              ? <Text accessibilityLiveRegion="polite" style={s.small}>
                {exportMessage}
              </Text>
              : null}
            <Button text="마트 나가기" onPress={leave} />
          </>;
  return <View pointerEvents={agentControl ? 'none' : embedded ? 'box-none' : 'auto'} style={embedded ? s.embeddedRoot : s.root}>
    {!embedded
      ? <MarketMap
        controlBottomOffset={controlLift}
        onViewFrame={onViewFrame}
        key={JSON.stringify(session.environment.config)}
        environment={session.environment}
        cashierCalled={session.cashierAvailability}
        controlledPlayerPosition={agentControl ? session.playerPosition : undefined}
        hintedStation={null}
        interactive={!agentControl && !locked && !externalMenuOpen}
        nearbyStation={nearby}
        onNearbyStationChange={setNearby}
        onPositionChange={point => {
          const previous = localPosition.current;
          localPosition.current = point;
          syncMovementSegment(previous, point);
        }}
      />
      : null}
    {!briefing && !isFinished ? <MarketWorldGuidance key={session.id} visible={!panelVisible&&!externalMenuOpen&&!shelf&&!shoppingListOpen} frameRef={viewFrame} playerPositionRef={position} environment={session.environment} target={training.directionHint ? hintEvent?.payload.categoryId as MarketCategoryId??null:null} requestKey={String(hintEvent?.sequence??'')} incidents={activeIncidents} elapsedSeconds={trainingSeconds} /> : null}
    {!briefing && !panelVisible && !externalMenuOpen ? <>
      {training.mapHint ? <GameControlShortcut label="지도" accessibilityLabel="매장 지도" bottomOffset={controlLift} onPress={()=>{dispatch({type:'viewHelp'});setMapOpen(true)}} />:null}
      {training.task==='shelf-finder'?<View style={{position:'absolute',bottom:110,left:16,zIndex:40}}><Button text="위치 찾기 완료" onPress={()=>dispatch({type:'finishShelfTask'},true)}/></View>:null}
    </> : null}
    {!externalMenuOpen && !layoutEditing && !mapOpen && !briefing && session.phase === 'shopping' && !shelf && !cartOpen && !helpOpen && !staffMessage && !requesterOpen
      ? <MarketHud
        compact={playerUiOn}
        replayListRef={__DEV__ && replayUiRef ? replayList : undefined}
        replayListVisibilityRef={__DEV__ && replayUiRef ? replayListVisibility : undefined}
        onListVisibilityChange={open => {
          setShoppingListOpen(open);
          tracker.current?.track({ eventCode: open ? 'SHOP.SHOPPING_LIST_OPENED' : 'SHOP.SHOPPING_LIST_CLOSED',
            microActionId: open ? 'VIEW_SHOPPING_LIST' : 'CLOSE_SHOPPING_LIST',
            payload: { marketContent: { action: { type: open ? 'viewShoppingList' : 'closeShoppingList' },
              displayedObjectives: shoppingObjectives, exposureMeaning: '목록 표시·닫기 기록이며 읽기·이해·도움 의존 판정이 아니다.' } } });
        }}
        objectives={shoppingObjectives}
        budget={mission?.budget}
        onContactRequester={!embedded ? contactRequester : undefined}
        score={aiAssessment ? undefined : session.score}
        topInset={hudTopInset ?? getMarketHudTopInset(insets?.top, embedded)}
        bottomSafeArea={insets?.bottom ?? 0}
        controlMode={embedded ? undefined : controlMode}
        onControlModeChange={embedded ? undefined : onControlModeChange}
        onGiveUp={giveUp}
        onOpenHelp={openHelp}
        onOpenCart={openCart}
      />
      : null}
    {!briefing && timing.startedAt && !isFinished && review === null ? <View pointerEvents="none"
      testID="market-time-limit" style={[s.timeLimit, { top: Math.max(12, hudTopInset ?? (embedded ? Math.max(112, (insets?.top ?? 0) + 64) : insets?.top ?? 0)) + 116 }]}>
      <Ionicons name="timer-outline" size={18} color="#4E6658" />
      <Text accessibilityLabel={`남은 장보기 시간 ${Math.ceil(timing.remainingMs / 1000)}초`} style={s.timeLimitText}>
        남은 시간 {formatMarketTime(timing.remainingMs)}
      </Text>
    </View> : null}
    {!embedded && !externalMenuOpen && !locked
      ? <View style={[s.stationAction, { bottom: GAME_ACTION_BUTTON_LAYOUT.bottom + controlLift }]}>
        <GameActionButton action={{
          label: nearby?.startsWith('staff:') ? '말 걸기' : '행동',
          icon: nearby?.startsWith('staff:') ? 'chatbubble-outline' : 'hand-left-outline',
          available: !!nearby,
          accessibilityLabel: !nearby ? '행동할 대상 없음' : nearby === 'checkout' || nearby === 'checkout-2'
            ? '계산대 살펴보기'
            : nearby.startsWith('kiosk:') ? '무인 계산하기' : nearby === 'common-door' ? '마을로 나가기' : nearby.startsWith('staff:') ? '직원에게 말 걸기' : (marketCategories.find(category => category.id === nearby)?.label ?? '진열대') + ' 살펴보기',
          onPress: () => { if (nearby) interact(nearby); },
        }} />
      </View>
      : null}
    {shelf && !briefing && session.phase === 'shopping'
      ? <MarketShelfScene
        goalReminder={goalReminder}
        replayPortRef={__DEV__ && replayUiRef ? replayShelf : undefined}
        category={shelf}
        cart={session.cart}
        slots={session.shelfSlots[shelf.id]}
        stock={session.initialStock}
        onChangeQuantity={(productId, change) => dispatch({ type: change > 0 ? 'add' : 'remove', productId })}
        onDropProduct={productId => !dispatch({ type: 'add', productId }).lastActionError}
        onClose={closeStation}
        onGiveUp={giveUp}
        onCartVisibilityChange={open => dispatch({ type: open ? 'viewCart' : 'closeView' })}
      />
      : null}
    <MarketPanelTransition visible={panelVisible} transitionKey={panelKey} onPresenceChange={setPanelPresent}>
    {expiredTiming ? modal('장보기 시간이 종료됐어요', <>
      <MarketRouteReview environment={session.environment} trajectory={route}/><Text testID="market-time-expired-message" accessibilityRole="alert" style={s.body}>이번 장보기의 제한 시간이 끝났어요. 종료 시점의 장바구니와 진행 상태를 기록했어요.</Text>
      <Text style={s.body}>제한 시간 {formatMarketTime(expiredTiming.timeLimitSeconds * 1000)} · 남은 시간 0:00</Text>
      <CartContents cart={session.cart} />
      <Text style={s.small}>합계 {price(getMarketCartTotal(session.cart))} · 예산 {price(mission?.budget ?? trackedMission.budget)}</Text>
      {review ? <Text accessibilityLiveRegion="polite" style={s.body}>{review}</Text> : null}
      {aiAssessment && reviewError.current ? <Button text="분석 접수 다시 시도" disabled={reviewing.current} onPress={() => { analysisRequest.current = requestExpiredAnalysis(); }} /> : null}
      {onOpenAnalysis ? <Button text="분석 탭에서 확인" onPress={() => { void leave().then(onOpenAnalysis); }} /> : null}
      <Button text="다시 연습하기" disabled={reviewing.current} onPress={() => { void restartExpiredQuest(); }} />
      <Button text="마트 나가기" quiet onPress={leave} />
    </>, '시간 종료') : null}
    {!expiredTiming && review !== null && purchaseVerdict ? <MarketPurchaseResult kind={purchaseVerdict.kind} details={purchaseVerdict.details} note={purchaseVerdict.note}
      cart={session.cart} budget={mission?.budget} analysisStatus={review} xpRecordId={activityRecordId('shopping', session.id)}>
      <Button text="마을로 돌아가기" onPress={leave} />
      {onOpenAnalysis ? <Button text="분석 탭에서 자세히 보기" quiet onPress={() => { void leave().then(onOpenAnalysis); }} /> : null}
      {reviewError.current ? <Button text="분석 접수 다시 시도" quiet disabled={reviewing.current} onPress={() => { void submitForReview(); }} /> : null}
    </MarketPurchaseResult> : null}
    {!expiredTiming && review !== null && !purchaseVerdict ? modal('AI 수행 검토', <><MarketRouteReview environment={session.environment} trajectory={route}/><Text style={s.body}>{review}</Text>
      {reviewError.current ? <Button text="분석 접수 다시 시도" disabled={reviewing.current} onPress={() => { void submitForReview(); }} /> : null}
      {onOpenAnalysis ? <Button text="분석 탭에서 확인" onPress={() => { void leave().then(onOpenAnalysis); }} /> : null}
      <Button text="마을로 돌아가기" onPress={leave} /></>) : null}
    {layoutEditing ? <MarketSetupPanel layoutOnly config={session.config} onClose={() => setLayoutEditing(false)} onApply={config => {
      if (!config.environment.tilemap) return;
      const next = replaceMarketSessionTilemap(live.current, config.environment.tilemap, new Date().toISOString());
      live.current = next; setSession(next); position.current = {...next.playerPosition}; localPosition.current = {...next.playerPosition};
      onEnvironmentChange?.(next.environment); onCashierCalled?.({...next.cashierAvailability}); setLayoutEditing(false);
    }} /> : null}
    {review === null && briefing && !settings && !historyOpen && !layoutEditing ? <MarketEntryScreen
      difficulty={session.config.difficulty}
      details={mission && playerUiOn ? undefined : mission ? <>
        <Text style={s.entryDetail}>{mission.title}</Text>
        <Text style={s.entryDetail}>예산 {price(mission.budget)}</Text>
        <Text testID="market-time-limit-briefing" style={s.entryDetail}>제한 시간 {formatMarketTime(resolveMarketTimeLimitSeconds(mission.timeLimitSeconds)*1000)} · 시작 후부터 측정해요</Text>
        {session.objectives.map(o=><View key={o.id} style={{flexDirection:'row',gap:8,flexWrap:'wrap',justifyContent:'center'}}><Text style={s.entryDetail}>{o.label}</Text><Text style={s.entryDetail}>{o.quantity}{o.quantityUnit??'개'}</Text></View>)}
        {session.learning.choiceTask ? <Text style={s.entryDetail}>{session.learning.choiceTask.label} · {price(session.learning.choiceTask.budget)} 이내</Text> : null}
      </> : undefined}
      scenarioChip={mission && playerUiOn ? { label: `${mission.scenarioId ? mission.scenarioId + ' ' : ''}${mission.title}`, onPress: () => setScenarioInfoOpen(true) } : undefined}
      requester={spendingLimit === undefined ? undefined : requesterName+'의 부탁 · 예산 '+price(spendingLimit)}
      instructions={mission ? briefingText : marketTrainingInstruction(session.config.training)}
      startLabel={aiAssessment && !playerUiOn && briefingStep < lastBriefingStep ? '다음' : '도전 시작'}
      onDifficultyChange={selectDifficulty} onStart={aiAssessment ? (playerUiOn ? startNow : advanceBriefing) : start}
      onHistory={() => setHistoryOpen(true)} onSettings={spendingLimit === undefined ? () => setSettings(true) : undefined} onExit={() => { void leave(); }}
    /> : null}
    {scenarioInfoOpen && mission && briefing ? modal(mission.title, <>
      <View style={s.requirements}>
        <Text style={s.body}>예산 {price(mission.budget)}</Text>
        <Text testID="market-time-limit-briefing" style={s.small}>제한 시간 {formatMarketTime(resolveMarketTimeLimitSeconds(mission.timeLimitSeconds)*1000)} · 시작 후부터 측정해요</Text>
      </View>
      <View style={s.requirements}>
        <Text style={s.body}>사야 할 물건</Text>
        {session.objectives.map(o => <View key={o.id} style={s.row}><Text style={s.body}>{o.label}</Text><Text style={s.quantity}>{o.quantity}{o.quantityUnit ?? '개'}</Text></View>)}
        {session.learning.choiceTask ? <Text style={s.small}>{session.learning.choiceTask.label} · {price(session.learning.choiceTask.budget)} 이내</Text> : null}
      </View>
      {(briefingPages ?? [mission.description ?? '목록을 보고 필요한 물건을 골라 보세요. 물건의 이름과 종류를 천천히 살펴봐요.', '다 골랐다면 계산대로 가서 계산해요. 언제든 그만둘 수 있어요.'])
        .filter(Boolean).map((page, index) => <Text key={index} style={s.body}>{page}</Text>)}
      <Button text="닫기" onPress={() => setScenarioInfoOpen(false)} />
    </>, mission.scenarioId ? `시나리오 ${mission.scenarioId}` : '시나리오', () => setScenarioInfoOpen(false)) : null}
    {mapOpen ? modal('매장 안 지도', <><MarketMiniMap environment={session.environment} player={position.current}/><Button text="지도 닫기" onPress={()=>{dispatch({type:'closeView'});setMapOpen(false)}}/></>, undefined, ()=>{dispatch({type:'closeView'});setMapOpen(false)}) : null}
    {settings
      ? <MarketSetupPanel
        config={session.config}
        onApply={configure}
        onClose={() => setSettings(false)}
      />
      : null}
    {historyOpen
      ? modal('이전 게임 기록', <>
        <Text style={s.small}>이 브라우저의 최근 20회 기록을 보관합니다. 네이티브 앱에서는 앱을 실행한 동안의 기록이며, JSON 공유로 따로 저장할 수 있어요.</Text>
        {listMarketEpisodes().map(episode => <View key={episode.sessionId} style={s.requirements}>
          <MarketRouteReview environment={episode.environment} trajectory={episode.trajectory?.actionSchemaVersion===2 ? episode.trajectory : buildMarketTrajectory(episode.events,episode.environment.spawn,episode.trajectory?.intervalSeconds ?? 5)}/>
          <Text style={s.body}>{episode.outcome === 'success' ? '성공' : '실패 (포기)'} · {episode.attempts}회 시도</Text>
          <Text style={s.small}>{episode.config.startedAt} · 시드 {String(episode.seed)}</Text>
          <Button
            text="기록 JSON 저장"
            quiet
            onPress={() => {
              void exportData(episode).catch(() => setExportMessage('저장하지 못했어요. 다시 눌러 주세요.'));
            }}
          />
        </View>)}
        {!listMarketEpisodes().length
          ? <Text style={s.body}>아직 저장된 기록이 없어요.</Text>
          : null}
        {exportMessage
          ? <Text accessibilityLiveRegion="polite" style={s.small}>
            {exportMessage}
          </Text>
          : null}
        <Button text="시작 화면으로" onPress={() => setHistoryOpen(false)} />
      </>, undefined, () => setHistoryOpen(false))
      : null}
    {cartOpen && !isFinished
      ? modal('장바구니', <>
        <CartContents cart={session.cart} showReturnLocation />
        <Text style={s.body}>담은 물건 {cartCount}개</Text>
        {goalReminder ? <View testID="market-goal-reminder">
          <Text style={s.body}>{MARKET_GOAL_REMINDER_TITLE}</Text>
          {goalReminder.map((line, index) => <Text key={'goal-reminder-' + index} style={s.small}>{line}</Text>)}
        </View> : null}
        <Text style={s.small}>물건을 내려놓으려면 그 물건의 진열대로 돌아가요. 어렵다면 매장 종업원에게 도움을 청할 수 있어요.</Text>
        <Button text="계속 고르기" onPress={closeCart} />
      </>, '내가 담은 물품', closeCart)
      : null}
    {helpOpen
      ? modal('이렇게 이용해요', <>
        <Text style={s.body}>{marketTrainingInstruction(session.config.training)}</Text>
        <Text style={s.body}>{session.config.difficulty==='family'?'종류가 같으면 괜찮아요. 예: 우유는 맛과 지방 함량에 관계없이 골라요.':'목록에 적힌 상품과 수량을 정확히 골라요.'}</Text>
        {mission?.briefing.map((line, index) => <Text key={'mission-help-' + index} style={s.body}>{line}</Text>)}
        <Text style={s.body}>상품 위치는 직원에게 물어볼 수 있어요.</Text>
        {aiAssessment && !adaptiveAssessment ? (
        <Text style={s.body}>1. 사야 할 물품과 개수를 읽어요.{'\n\n'}2. 진열대 가까이 가서 물건을 살펴봐요.{'\n\n'}3. 장바구니를 눌러 담은 물건을 확인해요.{'\n\n'}4. 내려놓을 물건은 그 물건의 진열대로 돌아가 장바구니를 펼쳐 내려놓아요. 어렵다면 종업원에게 제자리에 놓아 달라고 부탁해요.{'\n\n'}5. 출구 옆 두 계산대 중 하나에서 구매를 확정해요. 계산원이 없으면 매장 직원을 찾아 말을 걸어요.{'\n\n'}6. 계산하지 않은 물건을 담고 입구·출구·측면 출입문의 빨간 경보기를 지나 매장 밖으로 나가면 {session.config.alarmPenaltyPoints}점이 줄어요. 입구와 출구는 공용 복도로 이어져요. 복도 끝 공동 출입문에서 마을로 나갈 수 있어요.</Text>
        ) : <>
        <Text style={s.body}>1. 사야 할 물품과 개수를 읽어요.{'\n\n'}2. 진열대 가까이 가서 물건을 살펴봐요.{'\n\n'}3. 장바구니를 눌러 담은 물건을 확인해요.{'\n\n'}4. 내려놓을 물건은 그 물건의 진열대로 돌아가 장바구니를 펼쳐 내려놓아요. 어렵다면 종업원에게 제자리에 놓아 달라고 부탁해요.{'\n\n'}5. 유인 계산대에서 구매를 확정하거나, 무인 계산대에 물건을 끌어 스캔한 뒤 화면 확인 → 결제로 마무리해요. 유인 계산대가 모두 비어 있으면 매장 직원에게 부탁해요. 계산원이 있는 상태에서 없다고 요청하면 {session.config.cashierRequestPenaltyPoints}점이 줄어요.{'\n\n'}6. 계산하지 않은 물건을 담고 입구·출구·측면 출입문의 빨간 경보기를 지나 매장 밖으로 나가면 {session.config.alarmPenaltyPoints}점이 줄어요. 입구와 출구는 공용 복도로 이어져요. 복도 끝 공동 출입문에서 마을로 나갈 수 있어요.</Text>
        <Text style={s.body}>출구로 들어가면 {session.config.wrongWayPenaltyPoints}점이 줄어요. {constructionActive ? '바깥 입구는 공사 중이에요. 안쪽 입구를 이용해 주세요.' : '들어갈 때는 입구를 이용해요.'}</Text>
        <Text style={s.body}>상품 위치는 직원에게 물어볼 수 있어요. 품절을 확인하면 재고를 물어보고 휴대폰에서 {requesterName}에게 전화해요. 계산기는 휴대폰 메뉴에 있어요.</Text>
        </>}
        <Button text="알겠어요" onPress={closeHelp} />
      </>, undefined, closeHelp)
      : null}
    {staffMessage
      ? <MarketStaffDialogue
        name={session.environment.employees.find(employee => `staff:${employee.id}` === session.activeStation)?.label ?? '매장 직원'}
        message={staffLocationHelp ? '어떤 물건을 찾고 계세요?' : staffReturnHelp ? '어떤 물건을 제자리에 놓아드릴까요? 내려놓고 싶은 물건과 개수를 골라 주세요.' : '무엇을 도와드릴까요?'}
        response={staffResponse}
        bottomInset={embedded ? Math.max(132, (insets?.bottom ?? 0) + 112) : Math.max(24, insets?.bottom ?? 0)}
      >
        {staffLocationHelp ? <>
          {shoppingObjectives.map(objective => <MarketStaffDialogueChoice key={objective.id} text={objective.label} onPress={() => askLocation(objective.id)} />)}
          <MarketStaffDialogueChoice text="뒤로가기" onPress={backToStaff} />
        </> : staffReturnHelp ? <>
          <CartContents cart={session.cart} onRequestReturn={requestProductReturn} dialogue />
          <MarketStaffDialogueChoice text="직원 대화로 돌아가기" onPress={() => { setStaffReturnHelp(false); resetStaffReply(); }} />
        </> : <>
          <MarketStaffDialogueChoice text="이 물건은 어디에 있나요?" onPress={openLocationHelp} />
          {session.learning.stockout?.shelfVisited && session.learning.stockout.status === 'unresolved' ? <MarketStaffDialogueChoice text="재고 있나요?" onPress={checkStock} /> : null}
          {aiAssessment && session.environment.checkouts.filter(counter => !session.cashierAvailability[counter.id]).map(counter =>
            <MarketStaffDialogueChoice key={counter.id} text={`${counter.id === 'checkout' ? 1 : 2}번 계산대 계산을 부탁드려요`}
              onPress={() => requestSpecificCashier(counter.id)} />)}
          {!aiAssessment && !cashierAnswered ? <MarketStaffDialogueChoice text={CASHIER_REQUEST_TEXT} onPress={requestCashier} /> : null}
          {!aiAssessment && staffRequestPenalty !== null ? <Text accessibilityLiveRegion="polite"
            testID="market-staff-request-penalty" style={s.staffPenaltyNotice}>
            {staffRequestPenalty > 0 ? `계산원 확인 −${staffRequestPenalty}점` : '계산원 확인 · 감점 없음'}
          </Text> : null}
          {cartCount > 0 ? <MarketStaffDialogueChoice text="물건 제자리에 놓기 도움 요청" onPress={() => { setStaffReturnHelp(true); resetStaffReply(); }} /> : null}
        </>}
        {!staffLocationHelp ? <MarketStaffDialogueChoice text="아니에요, 감사합니다." onPress={closeStation} /> : null}
      </MarketStaffDialogue>
      : null}
    {aiAssessment && !adaptiveAssessment && review === null && !briefing && session.phase === 'checkout'
      ? modal((session.cashierAvailable || session.selectedKioskId) ? '이대로 구매할까요?' : '계산원이 자리를 비웠어요', <>
        <CartContents cart={session.cart} />
        <Text style={s.body}>합계 {price(getMarketCartTotal(session.cart))}</Text>
        {(session.cashierAvailable || session.selectedKioskId)
          ? <>
            {mission?.checkoutDialogue.map((line, index) => <Text key={index} style={s.body}>{line}</Text>)}
            <Text style={s.small}>구매를 확정하면 이번 시도가 기록되고 결과가 나와요.</Text>
            <Button text="구매 확정" onPress={() => { void submitForReview(); }} />
          </>
          : <>
            <Text style={s.body}>다른 계산대나 무인 계산대를 살펴보세요. 유인 계산대가 모두 비었다면 직원에게 부탁해요.</Text>
            <Button text="직원 찾아 계산 요청하기" onPress={closeStation} />
          </>}
        <Button text="다시 고르기" quiet onPress={closeStation} />
        {quit}
      </>, session.selectedKioskId ? '무인 계산대 · 최종 결정' : `${session.selectedCheckoutId === 'checkout-2' ? 2 : 1}번 계산대 · 최종 결정`)
      : null}
    {requesterOpen ? <MarketRequesterCall session={session} onAction={dispatch} onClose={() => dispatch({ type: 'closeView' })}
      requesterName={requesterName} spendingLimit={spendingLimit} onBudgetRequest={onBudgetRequest}
      bottomInset={embedded ? Math.max(132, (insets?.bottom ?? 0) + 112) : Math.max(24, insets?.bottom ?? 0)} /> : null}
    {(!aiAssessment || adaptiveAssessment) && review === null && !briefing && budgetReviewTotal === null && session.phase === 'checkout' && session.selectedKioskId ? <MarketKioskCheckout
      key={session.selectedKioskId + '-' + session.attempts}
      cart={session.cart} kioskLabel="무인 계산대"
      onConfirm={scannedCart => {if(adaptiveAssessment){void submitForReview(scannedCart);}else dispatch({ type:'submitKiosk',scannedCart });}}
      onCancel={closeStation} /> : null}
    {(!aiAssessment || adaptiveAssessment) && review === null && !briefing && budgetReviewTotal === null && session.phase === 'checkout' && !session.selectedKioskId && checkoutReview
      ? <MarketStaffedCheckout key={`${session.selectedCheckoutId}-${session.attempts}`}
        review={checkoutReview} cart={session.cart} counterNumber={session.selectedCheckoutId === 'checkout-2' ? 2 : 1}
        dialogueBottomInset={Math.max(24, insets?.bottom ?? 0)}
        onCorrect={(productId, quantity) => {
          const next = dispatch({ type: 'requestCheckoutCorrection', productId, quantity });
          return next.lastActionError ?? getMarketCheckoutReview(next)?.response ?? '계산 내역을 다시 확인해 주세요.';
        }}
        onSubmit={() => {if(adaptiveAssessment){void submitForReview();}else dispatch({type:'submit'});}} onCancel={closeStation}
        onInspectCart={() => dispatch({ type: 'viewCheckoutCart' })}
        onBackHandlerChange={setCheckoutBackHandler} /> : null}
    {(!aiAssessment || adaptiveAssessment) && review === null && !briefing && session.phase === 'checkout' && !session.selectedKioskId && !session.cashierAvailable
      ? modal('계산원이 자리를 비웠어요', <>
            <Text style={s.body}>계산원이 있는 계산대나 무인 계산대를 이용해 주세요. 유인 계산대가 모두 비어 있으면 직원에게 부탁해요.</Text>
            <Button text="계산대 다시 살펴보기" onPress={closeStation} />
        <Button
          text="다시 고르기"
          quiet
          onPress={closeStation}
        />
        {quit}
      </>, `${session.selectedCheckoutId === 'checkout-2' ? 2 : 1}번 계산대 · 최종 결정`)
      : null}
    {budgetReviewTotal !== null && session.phase === 'checkout' ? modal('예산을 다시 확인해요', <>
      <Text style={s.body}>계산 금액은 {price(budgetReviewTotal)}이에요. {requesterName}와 정한 예산 {price(spendingLimit ?? 0)}보다 많아요.</Text>
      <Text style={s.small}>아직 결제하지 않았어요. 물건을 다시 고르거나 예산을 물어봐요.</Text>
      <Button text="다시 고르기" onPress={() => { setBudgetReviewTotal(null); closeStation(); }} />
      {onBudgetRequest ? <Button text={`${requesterName}에게 예산 확인하기`} onPress={() => {
        setBudgetReviewTotal(null); closeStation(); contactRequester();
      }} /> : null}
    </>, '결제 전 확인') : null}
    {session.phase === 'feedback'
      ? modal('이번 구매는 맞지 않았어요', <>
        {session.feedback?.details?.length
          ? <View testID="market-detailed-feedback">
            {session.feedback.details.map((detail, i) => <Text key={i} style={s.body}>• {detail}</Text>)}
          </View>
          : <Text testID="market-general-feedback" style={s.body}>구매 목록, 장바구니, 계산 내역을 다시 확인해 보세요.</Text>}
        <Button
          text={session.attempts === 1 ? '1차 재시도' : session.attempts + '차 재시도'}
          onPress={() => dispatch({ type: 'retry' })}
        />
        {quit}
      </>, session.attempts + '번째 시도 결과')
      : null}
    {isFinished && !expiredTiming && aiAssessment && session.outcome === 'gave-up' && !agentControl && !replayUiRef
      ? <MarketPurchaseResult kind="gave-up" cart={session.cart} budget={mission?.budget}>{ratingControls}</MarketPurchaseResult>
      : isFinished && !expiredTiming
      ? modal(aiAssessment ? '장보기를 마쳤어요' : session.outcome === 'success' ? '장보기에 성공했어요!' : '장보기를 마쳤어요', <>
        <View style={s.resultBadge}>
          <Ionicons
            name={session.outcome === 'success' ? 'checkmark-circle-outline' : 'flag-outline'}
            size={42}
            color="#517660"
          />
          <Text style={s.resultText}>
            {aiAssessment ? '수행 판단은 AI 분석에서 확인해 주세요.' : session.outcome === 'success' ? '성공' : '실패 (포기)'}
          </Text>
          <Text style={s.body}>구매 시도 {session.attempts}회</Text>
          {!aiAssessment && <>
          {session.learning.stockout?.status === 'replacement-approved' ? <Text style={s.small}>{requesterName}에게 확인하고 대체 상품을 골랐어요.</Text> : null}
          {session.learning.stockout?.status === 'waived' ? <Text style={s.small}>구매하지 못한 이유를 {requesterName}에게 전달했어요.</Text> : null}
          <Text testID="market-final-score" style={s.body}>최종 점수 {session.score}점 · 총 감점 {session.penaltyPoints}점</Text>
          <Text style={s.small}>경보기 {session.penaltyPoints - cashierPenaltyTotal - wrongWayPenaltyTotal}점 ({session.alarmCount}회) · 출구 역진입 {wrongWayPenaltyTotal}점 ({session.wrongWayEntryCount}회) · 계산원 확인 {cashierPenaltyTotal}점</Text>
          </>}
        </View>
        <MarketRouteReview environment={session.environment} trajectory={route}/>
        {ratingControls}
      </>, '최종 결과')
      : null}
    </MarketPanelTransition>
    {alarmNotice !== null ? <View pointerEvents="none" style={[s.notice, s.alarmNotice]}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={s.alarmNoticeText}>
        경보기가 울렸어요. 계산하지 않은 물건이 있어요.{!aiAssessment && ` −${alarmNotice}점`}
      </Text>
    </View> : null}
    {wrongWayNotice !== null ? <View pointerEvents="none" style={[s.notice, s.alarmNotice]}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={s.alarmNoticeText}>
        출구로 들어왔어요.{!aiAssessment && ` −${wrongWayNotice.delta}점`}{'\n'}{wrongWayNotice.message}
      </Text>
    </View> : null}
    {session.lastActionError
      ? <View pointerEvents="none" style={s.notice}>
        <Text accessibilityLiveRegion="polite" style={s.noticeText}>
          {session.lastActionError}
        </Text>
      </View>
      : null}
  </View>;
}
function CartContents({ cart, onRequestReturn, showReturnLocation = false, dialogue = false }: {
  cart: MarketCart;
  onRequestReturn?: (productId: string, quantity: number) => void;
  showReturnLocation?: boolean;
  dialogue?: boolean;
}) {
  return <View testID="market-cart-contents">
    {Object.entries(cart).filter(([, q]) => q > 0).map(([id, quantity]) => {
      const product = getMarketProduct(id);
      if (!product) return null;
      return <View key={id} style={dialogue ? s.staffReturnProduct : undefined}>
      <View style={s.cartRow}>
        <Image
          source={getMarketProductImage(id)}
          style={s.productArt}
          resizeMode="contain"
        />
        <View style={s.cartName}>
          <Text style={s.body}>
            {product.name}
          </Text>
          <Text style={s.small}>
            {product.detail}
          </Text>
          {showReturnLocation ? <Text style={s.small}>{marketCategories.find(category => category.id === product.categoryId)?.label} 진열대에서 내려놓기</Text> : null}
        </View>
        <Text style={s.quantity}>{quantity}개</Text>
      </View>
      {onRequestReturn ? <View style={dialogue ? s.staffReturnChoices : s.returnChoices}>
        {dialogue ? <>
          <MarketStaffDialogueChoice text="1개 부탁하기" label={`${product.name} 1개 반납 부탁하기`} onPress={() => onRequestReturn(id, 1)} />
          {quantity > 1 ? <MarketStaffDialogueChoice text={`${quantity}개 모두 부탁하기`} label={`${product.name} 전부 반납 부탁하기`} onPress={() => onRequestReturn(id, quantity)} /> : null}
        </> : <>
          <Button text="1개 부탁하기" label={`${product.name} 1개 반납 부탁하기`} quiet onPress={() => onRequestReturn(id, 1)} />
          {quantity > 1 ? <Button text={`${quantity}개 모두 부탁하기`} label={`${product.name} 전부 반납 부탁하기`} quiet onPress={() => onRequestReturn(id, quantity)} /> : null}
        </>}
      </View> : null}
      </View>;
    })}
    {!Object.values(cart).some(q => q > 0)
      ? <Text style={[s.body, dialogue && s.staffEmptyCart]}>아직 담은 물건이 없어요.</Text>
      : null}
  </View>;
}
export function Button({
  text,
  label,
  onPress,
  quiet = false,
  selected = false,
  disabled = false
}: {
  text: string;
  label?: string;
  onPress: () => void;
  quiet?: boolean;
  selected?: boolean;
  disabled?: boolean;
}) {
  return <PressScale
    accessibilityRole="button"
    accessibilityLabel={label ?? text}
    accessibilityState={{ disabled, selected }}
    disabled={disabled}
    onPress={onPress}
    style={[s.button, quiet && s.quiet, selected && s.selected, disabled && s.disabled]}
  >
    <Text style={[s.buttonText, quiet && s.quietText]}>
      {text}
    </Text>
  </PressScale>;
}
export function ModalCard({ title, eyebrow, children, onClose }: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const insets = useContext(SafeAreaInsetsContext);
  return <View
    accessibilityViewIsModal
    style={[s.overlay, { paddingTop: Math.max(16, insets?.top ?? 0), paddingBottom: Math.max(16, insets?.bottom ?? 0) }]}
  >
    <ScrollView
      style={s.modal}
      contentContainerStyle={s.modalContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.modalHeader}>
        <View style={[s.modalHeading, onClose ? s.modalHeadingWithClose : undefined]}>
          {eyebrow
            ? <Text style={s.eyebrow}>
              {eyebrow}
            </Text>
            : null}
          <Text accessibilityRole="header" style={s.title}>
            {title}
          </Text>
        </View>
        {onClose
          ? <PressScale
            accessibilityRole="button"
            accessibilityLabel={title + ' 닫기'}
            onPress={onClose}
            style={[s.remove, s.modalClose]}
          >
            <Ionicons
              name="close"
              size={24}
              color="#536253"
            />
          </PressScale>
          : null}
      </View>
      {children}
    </ScrollView>
  </View>;
}
function Stars({ title, hint, value, onChange }: {
  title: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return <View style={s.stars}>
    <Text style={[s.body, s.ratingCaption]}>
      {title}
    </Text>
    <View style={s.starRow}>
      {[1, 2, 3, 4, 5].map(star => <PressScale
        key={star}
        accessibilityRole="button"
        accessibilityLabel={title + ' ' + star + '점'}
        accessibilityState={{ selected: value === star }}
        onPress={() => onChange(star)}
        style={s.star}
      >
        <Ionicons
          name="star"
          color={star <= value ? '#B58331' : '#DDD8CC'}
          size={28}
        />
      </PressScale>)}
    </View>
    <Text style={[s.small, s.ratingCaption]}>
      {hint}
    </Text>
  </View>;
}
const s = StyleSheet.create({
  entryDetail: { fontFamily:fonts.medium,fontSize:13,lineHeight:19,color:'#FFFFFF',textAlign:'center' },
  timeLimit: { position: 'absolute', right: 16, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7,
    flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#F9F7F0', borderColor: '#DFE2D7', borderWidth: 1, zIndex: 38 },
  timeLimitText: { color: '#4E6658', fontFamily: fonts.semibold, fontSize: 13, fontVariant: ['tabular-nums'] },
  root: { flex: 1, backgroundColor: '#F7F4EC' },
  embeddedRoot: { ...StyleSheet.absoluteFill, zIndex: 28 },
  stationAction: {
    position: 'absolute',
    bottom: GAME_ACTION_BUTTON_LAYOUT.bottom,
    right: GAME_ACTION_BUTTON_LAYOUT.right,
    zIndex: 40
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(29,45,51,0.58)',
    justifyContent: 'center',
    padding: 16,
    zIndex: 80
  },
  modal: {
    flexGrow: 0,
    maxHeight: '100%',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderRadius: 24,
    backgroundColor: '#F7F4EC',
    borderWidth: 1,
    borderColor: '#DCD7C8',
    ...Platform.select({ web: { boxShadow: '0 18px 60px rgba(22,39,44,0.22)' }, default: { elevation: 10 } })
  },
  modalContent: { padding: 22, gap: 14 },
  modalHeader: { position: 'relative', justifyContent: 'center', minHeight: 44 },
  modalHeading: { alignItems: 'center' },
  modalHeadingWithClose: { paddingHorizontal: 44 },
  modalClose: { position: 'absolute', right: 0, top: 0 },
  staffPenaltyNotice: { alignSelf: 'center', color: '#8C5344', backgroundColor: '#FFF5EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, fontFamily: fonts.cafe24Ssurround, fontSize: 14, textAlign: 'center' },
  staffReturnProduct: { backgroundColor: '#F7F4EC', padding: 12, borderRadius: 20, marginBottom: 10 },
  staffReturnChoices: { gap: 8, paddingTop: 10 },
  staffEmptyCart: { backgroundColor: '#F7F4EC', borderRadius: 20, padding: 16, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10
  },
  title: {
    textAlign: 'center',
    fontFamily: fonts.laundryBold,
    fontSize: 25,
    lineHeight: 34,
    color: '#304B54'
  },
  eyebrow: {
    textAlign: 'center',
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: '#93673F',
    marginBottom: 4
  },
  body: {
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 23,
    color: '#3E5158'
  },
  small: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 19,
    color: '#667278'
  },
  quantity: { fontFamily: fonts.bold, fontSize: 16, color: '#587565' },
  requirements: {
    backgroundColor: '#EEEBE1',
    borderLeftWidth: 3,
    borderLeftColor: '#C48B57',
    borderRadius: 12,
    padding: 12,
    gap: 7
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: {
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#587565',
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonText: { fontFamily: fonts.bold, fontSize: 14, color: '#FFFFFF' },
  quiet: { backgroundColor: '#E5EBDD' },
  quietText: { color: '#304B54' },
  selected: { borderWidth: 2, borderColor: '#587565' },
  disabled: { opacity: 0.4 },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#DDD8CB'
  },
  productArt: { width: 44, height: 52 },
  cartName: { flex: 1 },
  returnChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 },
  remove: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  resultBadge: {
    alignItems: 'center',
    padding: 16,
    gap: 8,
    backgroundColor: '#E5EDDF',
    borderWidth: 1,
    borderColor: '#D1DDC9',
    borderRadius: 16
  },
  resultText: { fontFamily: fonts.laundryBold, fontSize: 24, color: '#304B54' },
  stars: { gap: 4, alignItems: 'center' },
  ratingCaption: { textAlign: 'center' },
  starRow: { flexDirection: 'row', justifyContent: 'center' },
  star: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  notice: {
    position: 'absolute',
    bottom: 18,
    left: 20,
    right: 20,
    zIndex: 100,
    padding: 12,
    backgroundColor: '#304B54',
    borderRadius: 12
  },
  noticeText: { fontFamily: fonts.medium, fontSize: 13, color: '#FFFFFF' },
  alarmNotice: { backgroundColor: '#A63E39', bottom: 150, zIndex: 110 },
  alarmNoticeText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 21, color: '#FFFFFF' },
});
