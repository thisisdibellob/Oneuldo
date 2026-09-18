import { Ionicons } from '@expo/vector-icons';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { BackHandler, Image, Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { PressScale } from '../components/PressScale';
import { MarketRequesterCall } from '../components/game/MarketRequesterCall';
import { MarketKioskCheckout } from '../components/game/MarketKioskCheckout';
import { MarketMap } from '../components/game/MarketMap';
import { MarketHud, type MarketHudControlMode } from '../components/game/MarketHud';
import { MarketStaffDialogue, MarketStaffDialogueChoice } from '../components/game/MarketStaffDialogue';
import { MarketPanelTransition } from '../components/game/MarketPanelTransition';
import { MarketShelfScene } from '../components/game/MarketShelfScene';
import { MarketSetupPanel } from '../components/game/MarketSetupPanel';
import { getMarketWrongWayRearm, MarketEnvironment, MarketEnvironmentStationId, MarketCashierAvailability } from '../game/marketEnvironment';
import {
  applyMarketAction,
  createMarketSession,
  exportMarketEpisode,
  MarketAction,
  MarketSessionConfig
} from '../game/marketSession';
import { getMarketProductImage } from '../game/marketProductImages';
import { getMarketCartTotal, getMarketProduct, marketCategories, MarketCart } from '../game/scenarios';
import { fonts } from '../theme';
import { listMarketEpisodes, saveMarketEpisode, MarketStoredEpisode } from '../game/marketEpisodeStore';

export type MarketStationId = MarketEnvironmentStationId;
export type MarketInteractionRequest = {
  id: number;
  station: MarketStationId | 'give-up' | 'contact-requester';
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
export type MarketSimulationScreenProps = {
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
  onEnvironmentChange?: (environment: MarketEnvironment) => void;
  onCashierCalled?: (availability: MarketCashierAvailability) => void;
  onEpisodeComplete?: (episode: ReturnType<typeof exportMarketEpisode>) => void;
  onExit: () => void;
  onLockChange?: (locked: boolean) => void;
  onMissionComplete?: () => void;
};
const price = (value: number) => value.toLocaleString('ko-KR') + '원';
const CASHIER_REQUEST_TEXT = '계산대에 사람이 없어요,\n계산 부탁드릴게요';

export function MarketSimulationScreen({
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
  onExit,
  onLockChange,
  onMissionComplete
}: MarketSimulationScreenProps) {
  const insets = useContext(SafeAreaInsetsContext);
  const [session, setSession] = useState(() => createMarketSession({
    seed: environment?.seed ?? 'market-' + Date.now(),
    ...initialConfig,
    startedAt: new Date().toISOString()
  }, environment));
  const live = useRef(session);
  live.current = session;
  const localPosition = useRef(session.environment.spawn);
  const [briefing, setBriefing] = useState(true),
    [briefingStep, setBriefingStep] = useState(0);
  const [settings, setSettings] = useState(false),
    [cartOpen, setCartOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false);
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
  const position = playerPositionRef ?? localPosition;
  const shelf = marketCategories.find(category => category.id === session.activeStation);
  const requesterOpen = session.view === 'requester';
  const panelVisible = requesterOpen || briefing || settings || historyOpen || session.phase !== 'shopping' || cartOpen || helpOpen || staffMessage;
  const locked = panelVisible || panelPresent || !!shelf;
  const dispatch = useCallback((action: MarketAction, sync = false) => {
    let current = live.current;
    const at = new Date().toISOString();
    if (sync) current = applyMarketAction(current, { type: 'setPosition', point: { ...position.current }, at });
    const next = applyMarketAction(current, { ...action, at });
    live.current = next;
    setSession(next);
    return next;
  }, [position]);
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
    if (!crossesGate) return;
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
      handled.current = interactionRequest.id;
      return;
    }
    if (interactionRequest.station !== 'give-up' && (briefing || session.phase !== 'shopping')) return;
    handled.current = interactionRequest.id;
    if (interactionRequest.station === 'give-up') giveUp();
    else if (interactionRequest.station === 'contact-requester') contactRequester();
    else interact(interactionRequest.station);
  }, [briefing, interactionRequest, interact, giveUp, contactRequester, session.phase, externalMenuOpen]);
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
    if (session.outcome === 'success' && !completed.current) {
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
    if (briefing || session.phase === 'finished') return;
    const timer = setInterval(() => {
      const old = live.current.playerPosition,
        point = position.current;
      if (Math.hypot(old.x - point.x, old.y - point.y) >= 3) dispatch({ type: 'setPosition', point: { ...point } });
    }, 500);
    return () => clearInterval(timer);
  }, [briefing, session.phase, dispatch, position]);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (externalMenuOpen) return false;
      if (panelPresent && !panelVisible) return true;
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
      else if (session.phase !== 'finished') giveUp();
      else return false;
      return true;
    });
    return () => back.remove();
  }, [shelf, settings, historyOpen, cartOpen, helpOpen, staffMessage, staffReturnHelp, staffLocationHelp, requesterOpen, session.phase, giveUp, dispatch, resetStaffReply, panelPresent, panelVisible, externalMenuOpen]);
  const configure = (config: Partial<MarketSessionConfig>) => {
    const next = createMarketSession({ ...config, startedAt: new Date().toISOString() });
    live.current = next;
    setSession(next);
    localPosition.current = next.environment.spawn;
    onEnvironmentChange?.(next.environment);
    setSettings(false);
    setBriefingStep(0);
  };
  const selectDifficulty = (difficulty: 'family' | 'exact') => configure({
    ...session.config,
    difficulty,
    objectives: session.config.objectives.map(({ productId, quantity }) => ({ productId, quantity }))
  });
  const start = () => {
    const next = createMarketSession({ ...session.config, startedAt: new Date().toISOString() }, session.environment);
    live.current = next;
    setSession(next);
    setBriefing(false);
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
  const askLocation = (objectiveId: string) => {
    const next = dispatch({ type: 'askLocation', objectiveId }, true);
    if (next.lastActionError) return;
    const event = next.events[next.events.length - 1];
    const categoryId = String(event?.payload.categoryId ?? '');
    const category = marketCategories.find(item => item.id === categoryId);
    if (!category) return;
    const shelves = Object.values(next.environment.shelves);
    const target = next.environment.shelves[category.id];
    const row = shelves.filter(item => Math.abs(item.point.y - target.point.y) < 70).sort((a, b) => a.point.x - b.point.x);
    const index = row.indexOf(target);
    const side = row.length === 1 ? '가운데' : index === 0 ? '왼편' : index === row.length - 1 ? '오른편' : '가운데';
    const depth = target.point.y <= Math.min(...shelves.map(item => item.point.y)) + 70 ? '안쪽' : '중앙';
    setStaffResponse(`${category.label} 진열대에 있어요. 매장 ${depth} ${side}에서 찾아보세요.`);
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
  }] : [])];
  const cartCount = Object.values(session.cart).reduce((a, b) => a + b, 0);
  const isFinished = session.phase === 'finished',
    ratingDone = !!session.ratings || session.ratingSkipped;
  const cashierPenaltyTotal = isFinished ? session.events.reduce((total, event) =>
    total + (event.type === 'cashier_request_declined' ? Math.abs(Number(event.payload.delta ?? 0)) : 0), 0) : 0;
  const wrongWayPenaltyTotal = isFinished ? session.events.reduce((total, event) =>
    total + (event.type === 'wrong_way_entry' ? Math.abs(Number(event.payload.delta ?? 0)) : 0), 0) : 0;
  const constructionActive = !!session.environment.constructionZones?.length;
  const panelKey = settings ? 'settings' : historyOpen ? 'history' : briefing ? 'briefing-' + briefingStep
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
  const quit = <Button
    text="그만두기"
    label="장보기 포기"
    quiet
    onPress={giveUp}
  />;

  return <View pointerEvents={embedded ? 'box-none' : 'auto'} style={embedded ? s.embeddedRoot : s.root}>
    {!embedded
      ? <MarketMap
        key={JSON.stringify(session.environment.config)}
        environment={session.environment}
        cashierCalled={session.cashierAvailability}
        hintedStation={null}
        interactive={!locked && !externalMenuOpen}
        nearbyStation={nearby}
        onNearbyStationChange={setNearby}
        onPositionChange={point => {
          const previous = localPosition.current;
          localPosition.current = point;
          syncMovementSegment(previous, point);
        }}
      />
      : null}
    {!externalMenuOpen && !briefing && session.phase === 'shopping' && !shelf && !cartOpen && !helpOpen && !staffMessage && !requesterOpen
      ? <MarketHud
        objectives={shoppingObjectives}
        onContactRequester={!embedded ? contactRequester : undefined}
        score={session.score}
        topInset={hudTopInset ?? (embedded ? Math.max(112, (insets?.top ?? 0) + 64) : Math.max(12, insets?.top ?? 0))}
        controlMode={embedded ? undefined : controlMode}
        onControlModeChange={embedded ? undefined : onControlModeChange}
        onGiveUp={giveUp}
        onOpenHelp={() => {
          dispatch({ type: 'viewHelp' });
          setHelpOpen(true);
        }}
        onOpenCart={() => {
          dispatch({ type: 'viewCart' });
          setCartOpen(true);
        }}
      />
      : null}
    {!embedded && !externalMenuOpen && !locked && nearby
      ? <View style={s.stationAction}>
        <Button
          text={nearby === 'checkout' || nearby === 'checkout-2'
            ? '계산대 살펴보기'
            : nearby.startsWith('kiosk:') ? '무인 계산하기' : nearby === 'common-door' ? '마을로 나가기' : nearby.startsWith('staff:') ? '직원에게 말 걸기' : (marketCategories.find(category => category.id === nearby)?.label ?? '진열대') + ' 살펴보기'}
          onPress={() => interact(nearby)}
        />
      </View>
      : null}
    {shelf && !briefing && session.phase === 'shopping'
      ? <MarketShelfScene
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
    {briefing && !settings && !historyOpen
      ? modal('마트에서 장보기', <>
        <Text style={s.body}>
          {briefingStep === 0
            ? '목록을 보고 필요한 물건을 골라 보세요. 물건의 이름과 종류를 천천히 살펴봐요.'
            : `다 골랐다면 출구 옆 계산대로 가요. 계산하지 않은 물건을 담고 입구·출구·측면 출입문의 빨간 경보기를 지나 매장 밖으로 나가면 ${session.config.alarmPenaltyPoints}점이 줄어요. 원하면 다시 해보거나 언제든 그만둘 수 있어요.`}
        </Text>
        <View style={s.choices}>
          <Button
            text="연습 모드"
            selected={session.config.difficulty === 'family'}
            quiet
            onPress={() => selectDifficulty('family')}
          />
          <Button
            text="도전 모드"
            selected={session.config.difficulty === 'exact'}
            quiet
            onPress={() => selectDifficulty('exact')}
          />
        </View>
        <Text style={s.small}>
          {session.config.difficulty === 'family'
            ? (session.learning.stockout ? '같은 종류의 상품을 골라도 돼요. 다만 이름을 정확히 부탁한 상품은 바꾸기 전에 지영에게 물어봐요.' : '종류가 같으면 괜찮아요. 예: 우유는 맛과 지방 함량에 관계없이 골라요.')
            : '목록에 적힌 상품을 정확히 골라요. 예: 저지방 우유는 저지방 우유만 골라요.'}
        </Text>
        <View style={s.requirements}>
          {shoppingObjectives.map(o => <View key={o.id} style={s.row}>
            <Text style={s.body}>
              {o.label}
            </Text>
            <Text style={s.quantity}>{o.quantity}개</Text>
          </View>)}
        </View>
        {session.learning.choiceTask ? <Text style={s.small}>음료는 가격표를 보고 원하는 것으로 골라요. 필요하면 휴대폰의 계산기를 이용해요.</Text> : null}
        {constructionActive ? <Text style={s.small}>바깥 입구는 공사 중이에요. 안쪽 입구를 이용해 주세요.</Text> : null}
        <Text style={s.small}>출구로 들어가면 {session.config.wrongWayPenaltyPoints}점이 줄어요. 들어갈 때는 입구를 이용해요.</Text>
        {session.learning.stockout ? <Text style={s.small}>물건이 없으면 직원에게 물어보고, 부탁을 바꾸려면 휴대폰의 전화에서 지영을 선택해요.</Text> : null}
        <Button
          text={briefingStep === 0 ? '다음' : '장보기 시작'}
          onPress={() => briefingStep === 0 ? setBriefingStep(1) : start()}
        />
        <Button
          text="연습 환경 설정"
          quiet
          onPress={() => setSettings(true)}
        />
        <Button
          text="이전 게임 기록"
          quiet
          onPress={() => setHistoryOpen(true)}
        />
        {quit}
      </>, '오늘도 · 생활 연습')
      : null}
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
        <Text style={s.small}>물건을 내려놓으려면 그 물건의 진열대로 돌아가요. 어렵다면 매장 종업원에게 도움을 청할 수 있어요.</Text>
        <Button text="계속 고르기" onPress={() => {
          dispatch({ type: 'closeView' });
          setCartOpen(false);
        }} />
      </>, '내가 담은 물품', () => {
        dispatch({ type: 'closeView' });
        setCartOpen(false);
      })
      : null}
    {helpOpen
      ? modal('이렇게 이용해요', <>
        <Text style={s.body}>1. 사야 할 물품과 개수를 읽어요.{'\n\n'}2. 진열대 가까이 가서 물건을 살펴봐요.{'\n\n'}3. 장바구니를 눌러 담은 물건을 확인해요.{'\n\n'}4. 내려놓을 물건은 그 물건의 진열대로 돌아가 장바구니를 펼쳐 내려놓아요. 어렵다면 종업원에게 제자리에 놓아 달라고 부탁해요.{'\n\n'}5. 유인 계산대에서 구매를 확정하거나, 무인 계산대에 물건을 끌어 스캔한 뒤 화면 확인 → 결제로 마무리해요. 유인 계산대가 모두 비어 있으면 매장 직원에게 부탁해요. 계산원이 있는 상태에서 없다고 요청하면 {session.config.cashierRequestPenaltyPoints}점이 줄어요.{'\n\n'}6. 계산하지 않은 물건을 담고 입구·출구·측면 출입문의 빨간 경보기를 지나 매장 밖으로 나가면 {session.config.alarmPenaltyPoints}점이 줄어요. 입구와 출구는 공용 복도로 이어져요. 복도 끝 공동 출입문에서 마을로 나갈 수 있어요.</Text>
        <Text style={s.body}>출구로 들어가면 {session.config.wrongWayPenaltyPoints}점이 줄어요. {constructionActive ? '바깥 입구는 공사 중이에요. 안쪽 입구를 이용해 주세요.' : '들어갈 때는 입구를 이용해요.'}</Text>
        <Text style={s.body}>상품 위치는 직원에게 물어볼 수 있어요. 품절을 확인하면 재고를 물어보고 휴대폰의 전화에서 지영을 선택해요. 계산기는 휴대폰 메뉴에 있어요.</Text>
        <Button text="알겠어요" onPress={() => {
          dispatch({ type: 'closeView' });
          setHelpOpen(false);
        }} />
      </>, undefined, () => {
        dispatch({ type: 'closeView' });
        setHelpOpen(false);
      })
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
          <MarketStaffDialogueChoice text="뒤로가기" onPress={() => { setStaffLocationHelp(false); resetStaffReply(); }} />
        </> : staffReturnHelp ? <>
          <CartContents cart={session.cart} onRequestReturn={requestProductReturn} dialogue />
          <MarketStaffDialogueChoice text="직원 대화로 돌아가기" onPress={() => { setStaffReturnHelp(false); resetStaffReply(); }} />
        </> : <>
          <MarketStaffDialogueChoice text="이 물건은 어디에 있나요?" onPress={() => { setStaffLocationHelp(true); resetStaffReply(); }} />
          {session.learning.stockout?.shelfVisited && session.learning.stockout.status === 'unresolved' ? <MarketStaffDialogueChoice text="재고 있나요?" onPress={checkStock} /> : null}
          {!cashierAnswered ? <MarketStaffDialogueChoice text={CASHIER_REQUEST_TEXT} onPress={requestCashier} /> : null}
          {staffRequestPenalty !== null ? <Text accessibilityLiveRegion="polite"
            testID="market-staff-request-penalty" style={s.staffPenaltyNotice}>
            {staffRequestPenalty > 0 ? `계산원 확인 −${staffRequestPenalty}점` : '계산원 확인 · 감점 없음'}
          </Text> : null}
          {cartCount > 0 ? <MarketStaffDialogueChoice text="물건 제자리에 놓기 도움 요청" onPress={() => { setStaffReturnHelp(true); resetStaffReply(); }} /> : null}
        </>}
        {!staffLocationHelp ? <MarketStaffDialogueChoice text="아니에요, 감사합니다." onPress={closeStation} /> : null}
      </MarketStaffDialogue>
      : null}
    {requesterOpen ? <MarketRequesterCall session={session} onAction={dispatch} onClose={() => dispatch({ type: 'closeView' })}
      bottomInset={embedded ? Math.max(132, (insets?.bottom ?? 0) + 112) : Math.max(24, insets?.bottom ?? 0)} /> : null}
    {!briefing && session.phase === 'checkout' && session.selectedKioskId ? <MarketKioskCheckout
      key={session.selectedKioskId + '-' + session.attempts}
      cart={session.cart} kioskLabel="무인 계산대"
      onConfirm={scannedCart => dispatch({ type: 'submitKiosk', scannedCart })}
      onCancel={closeStation} /> : null}
    {!briefing && session.phase === 'checkout' && !session.selectedKioskId
      ? modal(session.cashierAvailable ? '이대로 구매할까요?' : '계산원이 자리를 비웠어요', <>
        <CartContents cart={session.cart} />
        <Text style={s.body}>결제 금액 {price(getMarketCartTotal(session.cart))}</Text>
        {session.cashierAvailable
          ? <>
            <Text style={s.small}>구매를 확정하면 이번 시도가 기록되고 결과가 나와요.</Text>
            <Button text="구매 확정" onPress={() => dispatch({ type: 'submit' })} />
          </>
          : <>
            <Text style={s.body}>계산원이 있는 계산대나 무인 계산대를 이용해 주세요. 유인 계산대가 모두 비어 있으면 직원에게 부탁해요.</Text>
            <Button text="계산대 다시 살펴보기" onPress={closeStation} />
          </>}
        <Button
          text="다시 고르기"
          quiet
          onPress={closeStation}
        />
        {quit}
      </>, `${session.selectedCheckoutId === 'checkout-2' ? 2 : 1}번 계산대 · 최종 결정`)
      : null}
    {session.phase === 'feedback'
      ? modal('이번 구매는 맞지 않았어요', <>
        {session.feedback?.details?.length
          ? <View testID="market-detailed-feedback">
            {session.feedback.details.map((detail, i) => <Text key={i} style={s.body}>• {detail}</Text>)}
          </View>
          : <Text testID="market-general-feedback" style={s.body}>목록과 장바구니를 스스로 다시 살펴보세요.</Text>}
        <Button
          text={session.attempts === 1 ? '1차 재시도' : session.attempts + '차 재시도'}
          onPress={() => dispatch({ type: 'retry' })}
        />
        {quit}
      </>, session.attempts + '번째 시도 결과')
      : null}
    {isFinished
      ? modal(session.outcome === 'success' ? '장보기에 성공했어요!' : '장보기를 마쳤어요', <>
        <View style={s.resultBadge}>
          <Ionicons
            name={session.outcome === 'success' ? 'checkmark-circle-outline' : 'flag-outline'}
            size={42}
            color="#517660"
          />
          <Text style={s.resultText}>
            {session.outcome === 'success' ? '성공' : '실패 (포기)'}
          </Text>
          <Text style={s.body}>구매 시도 {session.attempts}회</Text>
          {session.learning.stockout?.status === 'replacement-approved' ? <Text style={s.small}>지영에게 확인하고 대체 상품을 골랐어요.</Text> : null}
          {session.learning.stockout?.status === 'waived' ? <Text style={s.small}>구매하지 못한 이유를 지영에게 전달했어요.</Text> : null}
          <Text testID="market-final-score" style={s.body}>최종 점수 {session.score}점 · 총 감점 {session.penaltyPoints}점</Text>
          <Text style={s.small}>경보기 {session.penaltyPoints - cashierPenaltyTotal - wrongWayPenaltyTotal}점 ({session.alarmCount}회) · 출구 역진입 {wrongWayPenaltyTotal}점 ({session.wrongWayEntryCount}회) · 계산원 확인 {cashierPenaltyTotal}점</Text>
        </View>
        {!ratingDone
          ? <>
            <Text style={s.body}>오늘 장보기는 어땠나요? 평가를 건너뛰어도 괜찮아요.</Text>
            <Stars
              title="난이도"
              hint="1 쉬웠어요 · 5 어려웠어요"
              value={difficultyRating}
              onChange={setDifficultyRating}
            />
            <Stars
              title="흥미"
              hint="1 재미없었어요 · 5 재미있었어요"
              value={interestRating}
              onChange={setInterestRating}
            />
            <Button
              text="별점 남기기"
              disabled={!difficultyRating || !interestRating}
              onPress={() => finishRating(true)}
            />
            <Button
              text="평가 건너뛰기"
              quiet
              onPress={() => finishRating(false)}
            />
          </>
          : <>
            <Text style={s.body}>
              {session.ratings
                ? '난이도 ' + session.ratings.difficulty + '점 · 흥미 ' + session.ratings.interest + '점'
                : '평가를 건너뛰었어요.'}
            </Text>
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
            <Button text="마트 나가기" onPress={onExit} />
          </>}
      </>, '최종 결과')
      : null}
    </MarketPanelTransition>
    {alarmNotice !== null ? <View pointerEvents="none" style={[s.notice, s.alarmNotice]}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={s.alarmNoticeText}>
        경보기가 울렸어요. 계산하지 않은 물건이 있어요. −{alarmNotice}점
      </Text>
    </View> : null}
    {wrongWayNotice !== null ? <View pointerEvents="none" style={[s.notice, s.alarmNotice]}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={s.alarmNoticeText}>
        출구로 들어왔어요. −{wrongWayNotice.delta}점{'\n'}{wrongWayNotice.message}
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
    <Text style={s.body}>
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
          name={star <= value ? 'star' : 'star-outline'}
          color="#B58331"
          size={28}
        />
      </PressScale>)}
    </View>
    <Text style={s.small}>
      {hint}
    </Text>
  </View>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F4EC' },
  embeddedRoot: { ...StyleSheet.absoluteFill, zIndex: 28 },
  stationAction: {
    position: 'absolute',
    bottom: 100,
    right: 14,
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
  stars: { gap: 4 },
  starRow: { flexDirection: 'row' },
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
