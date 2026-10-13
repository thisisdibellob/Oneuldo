import { Ionicons } from '@expo/vector-icons';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { PressScale } from '../components/PressScale';
import { BusArrivalPreview } from '../components/game/BusArrivalPreview';
import { BusDriverQuizPanel } from '../components/game/BusDriverQuizPanel';
import { BusWorld, type BusWorldHandle } from '../components/game/BusWorld';
import { BusCardTerminal, BusLegProgress, BusRouteCard, BusRoutePanel, BusTimetable, TransitCard } from '../components/game/BusJourneyPanels';
import { GameControls } from '../components/game/GameControls';
import { GameHud } from '../components/game/GameHud';
import { LibraryRoom } from '../components/game/LibraryRoom';
import { LibraryButton as Button, LibraryPanel as Panel, LibraryToast, LIBRARY_COLORS as C } from '../components/game/LibraryWorkPanel';
import { MarketPanelTransition, useMarketReducedMotion } from '../components/game/MarketPanelTransition';
import { MarketStaffDialogue, MarketStaffDialogueChoice as Choice } from '../components/game/MarketStaffDialogue';
import { busWorldSpawn, BUS_WORLD_INTERACTIONS, type BusPassengerPlaceId, type BusWorldDirection, type BusWorldScene, type BusWorldStation } from '../game/busWorld';
import { createBusSession, reduceBusSession, getAvailableBusRoutes, getBusDestination, getBusHelpPlan, getBusRideGuide, getBusRouteStops, getDriverReply, isTerminalStop, STOP_NAMES, type BusAction, type BusSession } from '../game/busSession';
import { saveBusEpisode } from '../game/busEpisodeStore';
import { getBusDriverQuiz } from '../game/busDriverQuiz';
import { useBusAppActive, useBusClock, useBusSpeech } from '../game/useBusRuntime';
import { fonts } from '../theme';

type BusPanel = 'route' | 'timetable' | 'bag' | 'vehicle' | 'driver' | 'driver-quiz' | 'reader-front' | 'reader-rear' | 'crossing' | 'help' | 'call' | 'restore' | 'exit' | 'report' | null;
export type BusSimulationScreenProps = {
  onExit: () => void; onStartLibrary: () => void; onComplete?: () => void;
  onTravel?: (destination: 'village' | 'library') => void;
  onJourneyComplete?: (session: BusSession) => void;
  onSessionChange?: (session: BusSession) => void;
  onOpenJourney?: () => void;
  journeyOpen?: boolean;
  entryPoint?: 'village-stop' | 'library-exterior';
  controlMode?: 'joystick' | 'touch'; onControlModeChange?: (mode: 'joystick' | 'touch') => void;
  initialSession?: BusSession;
};

export function BusSimulationScreen({ onExit, onStartLibrary, onComplete, onTravel, onJourneyComplete, onSessionChange, onOpenJourney, journeyOpen = false, entryPoint = 'village-stop', controlMode: suppliedMode, onControlModeChange, initialSession }: BusSimulationScreenProps) {
  const [session, setSession] = useState(() => initialSession ?? (entryPoint === 'library-exterior'
    ? createBusSession({ destination: 'village' })
    : createBusSession({ phase: 'waiting', cardPacked: true, routeOpened: true })));
  const live = useRef(session); live.current = session;
  const sessionObserver = useRef(onSessionChange); sessionObserver.current = onSessionChange;
  // Leaving work puts the player outside the door. A return trip starts only
  // when the player chooses a stop, so there is no unattended bus countdown.
  const [exploring, setExploring] = useState(!initialSession && entryPoint === 'library-exterior');
  const [panel, setPanel] = useState<BusPanel>(initialSession || entryPoint === 'library-exterior' ? null : 'route');
  const [present, setPresent] = useState(false); const [externalMenu, setExternalMenu] = useState(false);
  const [nearby, setNearby] = useState<BusWorldStation | null>(null);
  const [mode, setMode] = useState<'joystick' | 'touch'>('joystick');
  const [runEnabled, setRunEnabled] = useState(false); const [crossingAllowed, setCrossingAllowed] = useState(false);
  const [vehicleReady, setVehicleReady] = useState(false);
  const [passengerMoving, setPassengerMoving] = useState(false);
  const securedAt = session.securedAt ?? 'seat';
  const [signalReady, setSignalReady] = useState(false);
  const [sceneVisit, setSceneVisit] = useState(0); const [reportRoom, setReportRoom] = useState(false);
  const [side, setSide] = useState<BusWorldDirection>(session.phase === 'prepare' ? 'inbound' : session.direction);
  const [toast, setToast] = useState<{ message: string; positive: boolean } | null>(null); const [reply, setReply] = useState('');
  const [contact, setContact] = useState<'jiyoung' | 'minsu'>('jiyoung');
  const [announcements, setAnnouncements] = useState(true);
  const reduceMotion = useMarketReducedMotion(); const insets = useContext(SafeAreaInsetsContext);
  const active = useBusAppActive(); const speech = useBusSpeech(announcements);
  const world = useRef<BusWorldHandle>(null); const saved = useRef<string | null>(null);
  const boardedInVillage = useRef(initialSession?.phase === 'boarding' && initialSession.stop === 'village' && entryPoint === 'village-stop');
  const villageExitHandled = useRef(false);
  const entrance = useRef(new Animated.Value(0)).current;
  const legProgress = useRef(new Animated.Value(0)).current;
  const controlMode = suppliedMode ?? mode;
  const insideBus = ['boarding', 'riding', 'stopped', 'alighting'].includes(session.phase);
  const completed = session.phase === 'completed'; const visible = panel !== null;
  const locked = visible || present || externalMenu || journeyOpen || !active || completed;
  const travelling = session.phase === 'riding';
  const terminal = !!session.route && isTerminalStop(session.route, session.stop, session.direction);
  const backInVillage = boardedInVillage.current && session.stop === 'village' && session.phase === 'waiting';
  const scene: BusWorldScene = insideBus ? 'bus' : session.stop === 'library' ? 'district' : session.stop === 'village' ? 'village' : 'stop';
  const outsideSpawn = insideBus ? undefined : exploring ? { x: 620, y: 397 }
    : session.phase !== 'prepare' || sceneVisit > 0 ? busWorldSpawn('stop', session.direction) : undefined;
  const worldKey = insideBus ? `bus:${session.rideId}` : `outside:${session.stop}:${sceneVisit}`;
  const notify = useCallback((message: string, positive = false) => setToast({ message, positive }), []);
  const dispatch = useCallback((action: BusAction) => {
    const before = live.current;
    const next = reduceBusSession(before, action); live.current = next; setSession(next);
    if (next.lastActionError) notify(next.lastActionError);
    else if (next.events.length > before.events.length) {
      const event = next.events.at(-1)!;
      if (event.type === 'safe_place_secured' || event.type === 'safe_place_changed') notify(event.payload.position === 'handrail' ? '손잡이를 잡았어요.' : '자리에 앉았어요.', true);
      if (event.type === 'stop_requested') notify(`${STOP_NAMES[next.nextStop!]}에 내려요. 멈출 때까지 기다려요.`, true);
      if (event.type === 'vehicle_stopped') notify(`${STOP_NAMES[next.stop]}에 멈췄어요.`);
      if (event.type === 'alighted' && next.stop === next.destination) notify(`${STOP_NAMES[next.destination]} 도착!`, true);
      if (event.type === 'stop_passed' && next.stop === next.destination && next.guidance === 'guided') notify('목적지를 지났어요. 다음 정류장에서 내려 돌아갈 수 있어요.');
    }
    return next;
  }, [notify]);
  const close = useCallback(() => {
    if (getBusDriverQuiz(live.current)?.status === 'asked') dispatch({ type: 'DISMISS_DRIVER_QUIZ' });
    setPanel(null); setReply('');
  }, [dispatch]);
  const open = useCallback((next: BusPanel) => { world.current?.stop(); setReply(''); setPanel(next); }, []);
  const driverQuiz = getBusDriverQuiz(session);
  // Covers a bus boarded in the village as well as a transfer/return boarding here.
  // Card approval stays visible first. Answering correctly is never a departure condition.
  useEffect(() => {
    if (session.phase !== 'boarding' || !session.boardingApproved || driverQuiz?.status !== 'available' || locked) return;
    dispatch({ type: 'OPEN_DRIVER_QUIZ' });
    open('driver-quiz');
  }, [session.phase, session.boardingApproved, session.rideId, driverQuiz?.status, locked, dispatch, open]);
  useEffect(() => { if (!exploring) sessionObserver.current?.(session); }, [session, exploring]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 3600); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { entrance.setValue(reduceMotion ? 1 : 0); if (!reduceMotion) { const a = Animated.timing(entrance, { toValue: 1, duration: 380, useNativeDriver: true }); a.start(); return () => a.stop(); } }, [entrance, reduceMotion]);
  useEffect(() => { if (visible) setExternalMenu(false); }, [visible]);
  useEffect(() => {
    setSignalReady(false);
    if (panel !== 'crossing' || !active) return;
    const timer = setTimeout(() => setSignalReady(true), 3000);
    return () => clearTimeout(timer);
  }, [panel, active]);
  useEffect(() => { if (locked) { world.current?.stop(); speech.stop(); } }, [locked, speech.stop]);
  useEffect(() => {
    if (!backInVillage || villageExitHandled.current) return;
    villageExitHandled.current = true; speech.stop(); onExit();
  }, [backInVillage, onExit, speech.stop]);
  useEffect(() => {
    if (session.destination === 'village' && session.phase === 'arrived' && session.stop === 'village') {
      dispatch({ type: 'COMPLETE_JOURNEY', at: Date.now() });
    }
  }, [dispatch, session.destination, session.phase, session.stop]);
  useEffect(() => {
    if (!completed || saved.current === session.id) return;
    saved.current = session.id; saveBusEpisode(session); onJourneyComplete?.(session);
    if (session.destination === 'village') onExit();
    else { onComplete?.(); onStartLibrary(); }
  }, [completed, session, onComplete, onExit, onStartLibrary, onJourneyComplete]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (externalMenu) return false;
      if (completed) return true;
      if (panel) close(); else open('exit');
      return true;
    }); return () => subscription.remove();
  }, [completed, externalMenu, open, close, panel]);

  const next = session.nextStop;
  const afterNext = session.route && next ? getBusRouteStops(session.route, session.direction)[getBusRouteStops(session.route, session.direction).indexOf(next) + 1] : null;
  const announcement = travelling && next
    ? `이번 정류장은 ${STOP_NAMES[next]}입니다.${afterNext ? ` 다음 정류장은 ${STOP_NAMES[afterNext]}입니다.` : ' 종점입니다.'}`
    : insideBus && session.phase !== 'boarding' ? `${STOP_NAMES[session.stop]}입니다.${terminal ? ' 종점입니다. 내려 주세요.' : ' 버스가 정차했습니다.'}` : '';
  const announcementKey = travelling ? `${session.rideId}:${next}` : session.phase === 'stopped' ? `${session.rideId}:stopped:${session.stop}` : '';
  const announcementPlayed = useRef('');
  useEffect(() => {
    if (!announcementKey || announcementPlayed.current === announcementKey || locked) return;
    announcementPlayed.current = announcementKey; speech.speak(announcement);
  }, [announcement, announcementKey, locked, speech.speak]);
  const outside = !exploring && (session.phase === 'waiting' || session.phase === 'arrived');
  const routes = getAvailableBusRoutes(session.stop, session.direction);
  const lastOffer = [...session.events].reverse().find(event => event.type === 'vehicle_arrived' && event.payload.stop === session.stop && event.payload.direction === session.direction);
  const offer = routes.length === 1 ? routes[0] : lastOffer?.payload.route === '201' ? '305' : '201';
  const offerKey = `${session.stop}:${session.direction}:${session.events.filter(event => ['vehicle_waited_for', 'checkpoint_restored', 'alighted', 'crossed_road', 'left_before_departure', 'returned_home', 'stop_reached'].includes(event.type)).length}`;
  useBusClock(`arrival:${offerKey}`, 4200, !outside || !!session.offeredRoute || !active || journeyOpen || externalMenu || (locked && panel !== 'vehicle' && panel !== 'timetable') || reportRoom || crossingAllowed || !routes.length, () => dispatch({ type: 'ARRIVE_VEHICLE', route: offer }), 1500);
  useBusClock(`depart-wait:${offerKey}:${session.offeredRoute}`, 18000, !outside || !session.offeredRoute || locked || reportRoom || crossingAllowed, () => dispatch({ type: 'VEHICLE_LEAVE' }));
  useBusClock(`leg:${session.rideId}:${next}`, 20000, !travelling || locked, () => { if (next) dispatch({ type: 'REACH_NEXT_STOP', expectedStop: next }); }, 5000, reduceMotion ? undefined : legProgress);

  const openRoute = () => { dispatch({ type: 'OPEN_ROUTE' }); open('route'); };
  const syncStop = useCallback((wanted: BusWorldDirection) => {
    if (exploring) {
      const returning = createBusSession({ destination: 'village', direction: wanted, guidance: live.current.guidance });
      live.current = returning; setSession(returning); setExploring(false); setSide(wanted);
      return;
    }
    let current = live.current;
    if (current.phase === 'prepare') current = dispatch({ type: 'GO_TO_STOP' });
    if (['waiting', 'arrived'].includes(current.phase) && current.direction !== wanted) dispatch({ type: 'CROSS_ROAD' });
  }, [dispatch, exploring]);
  const handleSideChange = useCallback((wanted: BusWorldDirection) => {
    setSide(wanted); setCrossingAllowed(false);
    const current = live.current;
    if (!exploring && ['waiting', 'arrived'].includes(current.phase) && current.direction !== wanted) dispatch({ type: 'CROSS_ROAD' });
  }, [dispatch, exploring]);
  const handleNearby = useCallback((station: BusWorldStation | null) => {
    setNearby(station);
    if (station === 'stop-inbound' || station === 'stop-outbound') {
      const current = live.current;
      if (!exploring && current.routeOpened && current.phase === 'prepare') syncStop(station === 'stop-inbound' ? 'inbound' : 'outbound');
    }
  }, [exploring, syncStop]);
  const interact = useCallback((station: BusWorldStation, placeId?: BusPassengerPlaceId) => {
    const current = live.current;
    if (station === 'card') { if (!current.cardPacked && current.phase === 'waiting' && current.stop === 'village') dispatch({ type: 'RETURN_HOME' }); open('bag'); }
    else if (station === 'stop-inbound' || station === 'stop-outbound') { syncStop(station === 'stop-inbound' ? 'inbound' : 'outbound'); dispatch({ type: 'CHECK_LOCATION' }); open('timetable'); }
    else if (station === 'crossing') open('crossing');
    else if (station === 'board') open('vehicle');
    else if (station === 'driver') { if (current.phase === 'riding') notify('정차하면 물어볼 수 있어요.'); else open('driver'); }
    else if (station === 'reader-front') open('reader-front');
    else if (station === 'reader-rear') { if (current.phase === 'stopped' || current.phase === 'alighting') open('reader-rear'); else notify('정차한 뒤 하차 카드를 찍어요.'); }
    else if (station === 'seat' || station === 'handrail') {
      if (current.phase === 'riding') notify('다음 정류장에 멈추면 자리를 바꿀 수 있어요.');
      else dispatch({ type: station === 'handrail' ? 'HOLD_HANDRAIL' : 'TAKE_SEAT', placeId });
    }
    else if (station === 'bell') { if (current.phase === 'riding') dispatch({ type: 'REQUEST_STOP' }); else notify('출발한 뒤 하차벨을 누를 수 있어요.'); }
    else if (station === 'door-front') { if (current.phase === 'boarding') { dispatch({ type: 'LEAVE_BEFORE_DEPARTURE' }); setCrossingAllowed(false); } else notify('정차한 뒤 뒷문으로 내려요.'); }
    else if (station === 'door-rear') {
      if (current.phase === 'alighting') { dispatch({ type: 'ALIGHT' }); setCrossingAllowed(false); setSide(current.direction); }
      else if (current.phase === 'stopped') open('reader-rear'); else notify('버스가 정차하면 내릴 수 있어요.');
    } else if (station === 'library') {
      if (exploring) onStartLibrary();
      else if (current.destination === 'library' && current.phase === 'arrived' && current.direction === 'inbound') { setReportRoom(true); setNearby(null); }
      else notify('도서관 앞 인도로 이동해 주세요.');
    }
  }, [dispatch, exploring, notify, onStartLibrary, open, syncStop]);
  const switchMode = (value: 'joystick' | 'touch') => { world.current?.stop(); setMode(value); onControlModeChange?.(value); };
  const openHelp = () => { dispatch({ type: 'ASK_HELP', source: 'phone' }); open('help'); };
  const call = (value: 'jiyoung' | 'minsu') => { setContact(value); dispatch({ type: 'ASK_HELP', source: value }); open('call'); };
  const help = getBusHelpPlan(session);
  const rideGuide = getBusRideGuide(session);
  const destinationLabel = STOP_NAMES[session.destination];
  const plannedBus = help.steps.find(step => step.kind === 'board');
  const helpfulBusPresent = !!session.offeredRoute && session.offeredRoute === plannedBus?.route && help.steps[0]?.kind !== 'cross';
  const waitingInstruction = help.steps[0]?.kind === 'cross' ? '횡단보도를 건너 반대편 정류장으로 가요'
    : helpfulBusPresent ? `${session.offeredRoute}번 · ${getBusDestination(session.offeredRoute!, session.direction)} 버스에 타요`
    : plannedBus?.route ? `${plannedBus.route}번 · ${getBusDestination(plannedBus.route, plannedBus.direction)}을 기다려요`
    : '정류장 노선에서 가는 방향을 확인해요';
  const routeNumber = exploring ? null : session.route ?? session.offeredRoute;
  const target: BusWorldStation | null = session.guidance !== 'guided' ? null
    : exploring ? side === 'inbound' ? 'stop-inbound' : 'crossing'
    : session.phase === 'prepare' ? session.cardPacked ? side === 'inbound' ? 'crossing' : 'stop-outbound' : 'card' : session.phase === 'boarding' ? rideGuide.leaveBeforeDeparture ? 'door-front' : session.boardingApproved ? null : 'reader-front'
    : session.phase === 'riding' && next === rideGuide.alightStop && !session.bellRequested ? 'bell'
    : session.phase === 'stopped' && !session.seatSecured ? rideGuide.alightHere ? 'reader-rear' : null : session.phase === 'alighting' ? 'door-rear'
    : session.phase === 'arrived' && session.destination === 'library' ? session.direction === 'inbound' ? 'library' : 'crossing'
    : session.phase === 'waiting' ? help.steps[0]?.kind === 'cross' ? 'crossing' : helpfulBusPresent ? 'board' : null : null;
  const objective = exploring ? '도서관에 들어가거나 정류장에서 버스를 탈 수 있어요'
    : reportRoom ? '안내 데스크의 사서에게 출근을 알려요'
    : session.guidance === 'independent' ? `${destinationLabel} 가기`
    : session.phase === 'prepare' ? session.cardPacked ? '마을앞 정류장으로 가요' : '집 앞에서 교통카드를 챙겨요'
    : session.phase === 'waiting' ? waitingInstruction
    : insideBus ? rideGuide.objective
    : session.direction === 'outbound' ? '횡단보도를 건너 도서관으로 가요' : '도서관에 들어가 사서에게 출근을 알려요';
  const helpSteps = exploring ? [
    '도서관 업무를 하려면 입구에서 행동 버튼을 눌러요.',
    '마을로 돌아가려면 도서관 쪽 정류장에서 201번 느티광장 방면 버스를 타요.',
  ] : help.steps.map(step => step.text);
  const continueRecommended = session.phase === 'stopped' && session.seatSecured && !terminal && !rideGuide.alightHere && session.guidance === 'guided';
  const primary = travelling ? { label: session.bellRequested ? '하차 요청' : '하차벨', icon: 'notifications' as const, available: !session.bellRequested, onPress: () => dispatch({ type: 'REQUEST_STOP' }) }
    : session.phase === 'boarding' && session.seatSecured ? { label: '출발하기', icon: 'arrow-forward' as const, available: !passengerMoving, onPress: () => { if (!passengerMoving) dispatch({ type: 'DEPART' }); } }
    : continueRecommended ? { label: '계속 타기', icon: 'arrow-forward' as const, available: !passengerMoving, onPress: () => { if (!passengerMoving) dispatch({ type: 'CONTINUE_RIDE' }); } }
    : session.phase === 'stopped' && session.seatSecured ? { label: securedAt === 'handrail' ? '손잡이 놓기' : '일어나기', icon: 'walk' as const, available: !passengerMoving, onPress: () => { if (!passengerMoving) dispatch({ type: 'STAND_UP' }); } }
    : { label: nearby ? BUS_WORLD_INTERACTIONS[nearby].label : '행동', icon: nearby ? BUS_WORLD_INTERACTIONS[nearby].icon : 'hand-left' as const, available: nearby !== null, onPress: () => world.current?.interact() };

  // The original village owns its stop. Do not flash a second village scene
  // while handing a pre-departure exit or checkpoint recovery back to it.
  if (backInVillage) return <View style={s.root} testID="bus-simulation" />;

  return <Animated.View style={[s.root, { opacity: entrance }]} testID="bus-simulation">
    {reportRoom ? <LibraryRoom locked={locked} controlMode={controlMode} reduceMotion={reduceMotion} visitorVisible={false} target="librarian" onInteract={station => {
      if (station === 'librarian') open('report'); else if (station === 'exit') setReportRoom(false); else notify('안내 데스크에서 출근을 알려 주세요.');
    }} /> : <BusWorld key={worldKey} ref={world} scene={scene} stopId={session.stop} stopName={STOP_NAMES[session.stop]}
      direction={session.phase === 'prepare' || exploring ? side : session.direction} spawn={outsideSpawn} locked={locked} travelling={travelling} seated={session.seatSecured} securedAt={session.seatSecured ? securedAt : 'none'}
      passengerPlaceId={session.passengerPlaceId} onPassengerTransitionChange={setPassengerMoving}
      controlMode={controlMode} reduceMotion={reduceMotion} runEnabled={runEnabled} crossingAllowed={crossingAllowed} target={target} bellRequested={session.bellRequested}
      bus={routeNumber ? { number: routeNumber, destination: getBusDestination(routeNumber, session.direction), id: `${session.stop}:${routeNumber}` } : null}
      onNearbyChange={handleNearby} onSideChange={handleSideChange} onInteract={interact} />}
    {!visible && !present && !completed && <>
      <GameHud controlMode={controlMode} dailyQuests={[]} onControlModeChange={switchMode} emergencyNotice={null} onEmergencyExit={() => open(exploring ? 'help' : 'restore')} onExit={() => open('exit')}
        onMenuVisibilityChange={setExternalMenu} onOpenInventory={() => open('bag')} onOpenNotebook={openRoute} onCallContact={call}
        onOpenJourney={onOpenJourney}
        busRouteContext={{ currentStop: session.stop, direction: session.direction, destination: session.destination, selectedRoute: session.route ?? session.offeredRoute }}
        onRouteViewed={() => dispatch({ type: 'OPEN_ROUTE' })}
        onTravel={onTravel ? destination => { world.current?.stop(); speech.stop(); onTravel(destination); } : undefined} />
      {!externalMenu && <View pointerEvents="box-none" style={[s.top, { top: Math.max(106, (insets?.top ?? 0) + 65) }]}>
        {insideBus ? <View style={s.display} testID="bus-stop-display">
          <View style={s.destinationRow}><PressScale accessibilityRole="button" accessibilityLabel={`${destinationLabel} 가는 노선 확인`} onPress={openRoute} style={s.destinationStrip}>
            <Ionicons name="location-outline" size={17} color="#CFDCBF" /><Text style={s.destinationText}>목적지 · {destinationLabel}</Text><Ionicons name="chevron-forward" size={17} color="#CFDCBF" />
          </PressScale><PressScale accessibilityRole="button" accessibilityLabel="이동 도움 보기" onPress={openHelp} style={s.displayControl}><Ionicons name="help-circle-outline" size={24} color="#DCE6CF" /></PressScale></View>
          <View style={s.displayMeta}><Text style={s.displayNumber}>{session.route}</Text><Text numberOfLines={1} style={s.displayStop}>{STOP_NAMES[travelling && next ? next : session.stop]}</Text>
            <PressScale accessibilityRole="button" accessibilityLabel="정류장 안내 다시 듣기" onPress={() => { dispatch({ type: 'REPLAY_ANNOUNCEMENT' }); speech.speak(announcement || `${STOP_NAMES[session.stop]}입니다.`, true); }} style={s.displayControl}><Ionicons name="volume-medium-outline" color="#DCE6CF" size={23} /></PressScale>
            <PressScale accessibilityRole="button" accessibilityLabel="잠시 멈추기" onPress={() => open('exit')} style={s.displayControl}><Ionicons name="pause" color="#DCE6CF" size={22} /></PressScale>
          </View>
          {!travelling && <Text numberOfLines={2} style={s.busObjective}>{objective}</Text>}
          {travelling && session.bellRequested && <View style={s.bellBadge}><Ionicons name="notifications" size={14} color="#F7D6A6" /><Text style={s.requested}>하차벨 눌렀어요</Text></View>}
          {(travelling || session.phase === 'stopped') && <BusLegProgress session={session} progress={legProgress} reduceMotion={reduceMotion} />}
        </View> : <View style={s.taskRow}>
          <PressScale accessibilityRole="button" accessibilityLabel={`${destinationLabel} 가는 길 확인`} onPress={exploring ? openHelp : openRoute} style={s.task}>
            <View style={s.taskIcon}><Ionicons name={reportRoom || exploring ? 'library' : 'bus'} size={23} color={C.green} /></View><Text style={s.objective}>{objective}</Text>
          </PressScale>
          <PressScale accessibilityRole="button" accessibilityLabel="잠시 멈추기" onPress={() => open('exit')} style={s.pauseButton}><Ionicons name="pause" size={23} color={C.green} /></PressScale>
        </View>}
      </View>}
      {!reportRoom && <GameControls controlMode={controlMode} locked={locked} movementDisabled={travelling || session.seatSecured}
        onWorldTap={insideBus ? point => world.current?.tapPassengerPlace(point) : undefined}
        runEnabled={runEnabled} onRunEnabledChange={setRunEnabled} reduceMotion={reduceMotion}
        onMove={input => world.current?.move(input)} onMoveEnd={() => world.current?.stop()} onAccessibilityMove={action => world.current?.nudge(action)} action={primary} />}
      {!externalMenu && !insideBus && <View style={s.helpAnchor}><PressScale accessibilityRole="button" accessibilityLabel="이동 도움 보기" onPress={openHelp} style={s.helpButton}><Ionicons name="help-circle-outline" size={22} color={C.green} /><Text style={s.helpLabel}>도움</Text></PressScale></View>}
      {session.phase === 'boarding' && session.seatSecured && !externalMenu && <PressScale accessibilityRole="button" disabled={passengerMoving} accessibilityLabel={securedAt === 'handrail' ? '손잡이 놓기' : '일어나기'} onPress={() => { if (!passengerMoving) dispatch({ type: 'STAND_UP' }); }} style={s.continueButton}><Ionicons name="walk" size={20} color={C.green} /><Text style={s.continueText}>{securedAt === 'handrail' ? '손잡이 놓기' : '일어나기'}</Text></PressScale>}
      {session.phase === 'stopped' && session.seatSecured && !terminal && !externalMenu && <PressScale accessibilityRole="button" disabled={passengerMoving} accessibilityLabel={continueRecommended ? securedAt === 'handrail' ? '손잡이 놓기' : '일어나기' : '계속 타기'} onPress={() => { if (!passengerMoving) dispatch({ type: continueRecommended ? 'STAND_UP' : 'CONTINUE_RIDE' }); }} style={s.continueButton}><Ionicons name={continueRecommended ? 'walk' : 'arrow-forward'} size={20} color={C.green} /><Text style={s.continueText}>{continueRecommended ? securedAt === 'handrail' ? '손잡이 놓기' : '일어나기' : '계속 타기'}</Text></PressScale>}
    </>}

    <MarketPanelTransition visible={visible} transitionKey={`${panel}`} onPresenceChange={setPresent}>
      {panel === 'route' && !completed && <BusRoutePanel title="가는 길" onClose={close} footer={<Button onPress={close}>확인했어요</Button>}><BusRouteCard session={session} /></BusRoutePanel>}
      {panel === 'timetable' && !completed && <BusRoutePanel title="버스 도착 안내" onClose={close} footer={<Button onPress={close}>닫기</Button>}><BusTimetable session={session} upcomingRoute={offer} /></BusRoutePanel>}
      {panel === 'bag' && !completed && <Panel title={nearby === 'card' ? '준비물 챙기기' : '가방'} onClose={close} footer={session.cardPacked ? <Button onPress={close}>확인했어요</Button> : session.phase === 'prepare' && nearby === 'card' ? <Button icon="bag-handle-outline" onPress={() => { dispatch({ type: 'PACK_CARD' }); notify('교통카드를 챙겼어요.', true); close(); }}>가방에 넣기</Button> : <Button secondary onPress={close}>닫기</Button>}>
        <View style={s.cardPocket}>{session.cardPacked || nearby === 'card' ? <TransitCard /> : <Ionicons name="bag-outline" size={65} color="#ADB19A" />}<Text style={s.cardLabel}>{session.cardPacked ? '교통카드 · 챙겼어요' : nearby === 'card' ? '교통카드' : '교통카드는 집 앞에 있어요.'}</Text></View>
      </Panel>}
      {panel === 'vehicle' && !completed && <Panel title={session.offeredRoute ? session.offeredRoute + '번 버스' : '버스 정류장'} onClose={close} footer={<><Button icon="bus-outline" disabled={!session.offeredRoute || !vehicleReady} onPress={() => { dispatch({ type: 'BOARD' }); setCrossingAllowed(false); close(); }}>버스 타기</Button><Button secondary icon="chatbubble-outline" disabled={!session.offeredRoute || !vehicleReady} onPress={() => open('driver')}>기사님께 물어보기</Button><Button secondary disabled={!session.offeredRoute || !vehicleReady} onPress={() => { setVehicleReady(false); dispatch({ type: 'VEHICLE_LEAVE' }); }}>다음 버스 기다리기</Button></>}>
        <BusArrivalPreview bus={session.offeredRoute ? { number: session.offeredRoute, destination: getBusDestination(session.offeredRoute, session.direction), id: offerKey + session.offeredRoute } : null} direction={session.direction} reduceMotion={reduceMotion} onReadyChange={setVehicleReady} /><Text style={s.vehicleDestination}>{session.offeredRoute ? getBusDestination(session.offeredRoute, session.direction) : '다음 버스를 기다려요'}</Text>
      </Panel>}
      {panel === 'driver' && !completed && <MarketStaffDialogue name="버스 기사" message="어디로 가시나요?" response={reply}>
        {reply ? <Choice text="감사합니다" onPress={close} /> : <>
          <Choice text={`이 버스 ${destinationLabel}에 가나요?`} onPress={() => { dispatch({ type: 'ASK_HELP', source: 'driver' }); setReply(getDriverReply(live.current)); }} />
          {session.phase === 'boarding' && <Choice text="여기서 내릴게요" onPress={() => { dispatch({ type: 'LEAVE_BEFORE_DEPARTURE' }); close(); }} />}
          <Choice text="대화 마치기" onPress={close} />
        </>}
      </MarketStaffDialogue>}
      {panel === 'driver-quiz' && !completed && driverQuiz && <BusDriverQuizPanel state={driverQuiz}
        onAnswer={choiceId => dispatch({ type: 'ANSWER_DRIVER_QUIZ', quizId: driverQuiz.quiz.id, choiceId })}
        onSkip={() => { dispatch({ type: 'DISMISS_DRIVER_QUIZ' }); close(); }} onClose={close} />}
      {(panel === 'reader-front' || panel === 'reader-rear') && !completed && <Panel title={panel === 'reader-front' ? '승차 단말기' : '하차 단말기'} onClose={close} footer={(panel === 'reader-front' ? session.boardingApproved : session.alightingApproved) ? <Button onPress={close}>확인했어요</Button> : !session.cardPacked ? <Button secondary onPress={close}>앞문으로 돌아가기</Button> : undefined}>
        <BusCardTerminal alighting={panel === 'reader-rear'} hasCard={session.cardPacked} approved={panel === 'reader-front' ? session.boardingApproved : session.alightingApproved} onTap={() => dispatch({ type: panel === 'reader-front' ? 'TAP_BOARDING_CARD' : 'TAP_ALIGHTING_CARD' })} />
      </Panel>}
      {panel === 'crossing' && !completed && <Panel title="주변 살피기" onClose={close} footer={<Button icon="walk-outline" disabled={!signalReady} onPress={() => { setCrossingAllowed(true); close(); notify('횡단보도를 따라 걸어가요.'); }}>{signalReady ? '살폈어요' : '초록불 기다리기'}</Button>}>
        <View style={s.crossingVisual}><View style={s.signal}><Ionicons name={signalReady ? 'walk' : 'hand-left'} size={48} color={signalReady ? '#AFE0AA' : '#DCA190'} /></View><View style={s.zebra}>{[0, 1, 2, 3, 4].map(i => <View key={i} style={s.stripe} />)}</View></View><Text style={s.centerText}>{signalReady ? '초록불이에요.\n양쪽 차가 멈춘 것을 확인해요.' : '빨간불이에요.\n인도에서 잠깐 기다려요.'}</Text>
      </Panel>}
      {panel === 'help' && !completed && <Panel title="이동 도움" onClose={close} footer={<Button secondary icon="call-outline" onPress={() => call('jiyoung')}>지영에게 전화하기</Button>}>
        <View style={s.modeRow}>{(['guided', 'independent'] as const).map(value => <PressScale key={value} accessibilityRole="button" accessibilityState={{ selected: session.guidance === value }} onPress={() => dispatch({ type: 'SET_GUIDANCE', guidance: value })} style={[s.mode, session.guidance === value && s.modeSelected]}><Text style={[s.modeText, session.guidance === value && { color: '#FFFDF1' }]}>{value === 'guided' ? '안내와 함께' : '혼자 해보기'}</Text></PressScale>)}</View>
        <View style={s.switchRow}><Text style={s.paragraph}>안내 방송 읽어주기</Text><Switch accessibilityLabel="안내 방송 읽어주기" value={announcements} onValueChange={setAnnouncements} trackColor={{ true: '#789678', false: '#D3D4C7' }} /></View>
        <View style={s.helpSteps}>{helpSteps.map((text, index) => <View style={s.helpStep} key={`${index}:${text}`}><Text style={s.stepIndex}>{index + 1}</Text><Text style={s.paragraph}>{text}</Text></View>)}</View>
        {!exploring && session.checkpoint && <PressScale accessibilityRole="button" onPress={() => open('restore')} style={s.restoreLink}><Ionicons name="refresh" size={20} color={C.green} /><Text style={s.linkText}>마지막 정류장으로 돌아가기</Text></PressScale>}
      </Panel>}
      {panel === 'call' && !completed && <MarketStaffDialogue name={contact === 'jiyoung' ? '지영' : '민수'} message="지금 있는 정류장을 확인해 줄래?" response={reply}>
        {reply ? <><Choice text="가는 길을 다시 볼게" onPress={() => open('help')} /><Choice text="알겠어, 고마워" onPress={close} /></> : <><Choice text={`${STOP_NAMES[session.stop]}${travelling ? '에서 출발했어' : '에 있어'}`} onPress={() => { dispatch({ type: 'CHECK_LOCATION' }); setReply(getBusHelpPlan(live.current).steps.slice(0, 3).map(step => step.text).join('\n')); }} /><Choice text="잠깐 확인하고 전화할게" onPress={close} /></>}
      </MarketStaffDialogue>}
      {panel === 'restore' && !completed && <Panel title="정류장에서 다시 시작할까요?" onClose={close} footer={<><Button disabled={!session.checkpoint} onPress={() => { dispatch({ type: 'RESTORE_CHECKPOINT' }); setReportRoom(false); setSceneVisit(v => v + 1); setCrossingAllowed(false); close(); }}>정류장으로 돌아가기</Button><Button secondary onPress={close}>계속하기</Button></>}><Text style={s.centerText}>{session.checkpoint ? `${STOP_NAMES[session.checkpoint.stop]}에서 다시 이어갈 수 있어요.` : '먼저 마을앞 정류장으로 이동해 주세요.'}</Text></Panel>}
      {panel === 'exit' && !completed && <Panel title="잠시 멈춤" onClose={close} footer={<><Button icon="play" onPress={close}>계속하기</Button><Button secondary icon="help-circle-outline" onPress={openHelp}>다음 행동 확인하기</Button></>}><Text style={s.centerText}>{objective}</Text></Panel>}
      {panel === 'report' && !completed && <MarketStaffDialogue name="사서" message="안녕하세요. 잘 오셨어요." response={reply}>
        <Choice text="안녕하세요. 도서관 업무를 하러 왔어요." onPress={() => { dispatch({ type: 'REPORT_ARRIVAL', at: Date.now() }); close(); setToast(null); }} />
      </MarketStaffDialogue>}
    </MarketPanelTransition>
    {toast && <LibraryToast message={toast.message} positive={toast.positive} />}
  </Animated.View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E7E5D5' },
  top: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 25 },
  taskRow: { width: '100%', maxWidth: 440, flexDirection: 'row', alignItems: 'center', gap: 8 },
  task: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderRadius: 19, backgroundColor: '#FCF9F0F5' },
  taskIcon: { width: 35, height: 38, borderRadius: 12, backgroundColor: '#E6EBD9', alignItems: 'center', justifyContent: 'center' },
  objective: { flex: 1, fontFamily: fonts.semibold, fontSize: 17, lineHeight: 25, color: C.ink },
  pauseButton: { width: 44, height: 44, borderRadius: 17, backgroundColor: '#FCF9F0F5', alignItems: 'center', justifyContent: 'center' },
  display: { width: '100%', maxWidth: 440, minHeight: 102, backgroundColor: '#354D47', borderRadius: 19, padding: 10, gap: 4 },
  destinationRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  destinationStrip: { flex: 1, minHeight: 30, paddingHorizontal: 2, flexDirection: 'row', gap: 5, alignItems: 'center' },
  destinationText: { flex: 1, color: '#CFDCBF', fontFamily: fonts.semibold, fontSize: 15 },
  displayMeta: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 8 },
  displayNumber: { color: '#DFE9C4', fontFamily: fonts.bold, fontSize: 19 },
  displayStop: { flex: 1, color: '#FEF8DC', fontFamily: fonts.laundryBold, fontSize: 21, lineHeight: 27 },
  displayControl: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  busObjective: { minHeight: 23, color: '#FFFBE9', fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  displayBottom: { height: 18, flexDirection: 'row', alignItems: 'center', gap: 8 },
  displayNext: { flex: 1, color: '#C2D0B7', fontFamily: fonts.medium, fontSize: 15, lineHeight: 18 },
  requested: { color: '#FFD6A7', fontFamily: fonts.bold, fontSize: 15, lineHeight: 18 },
  bellBadge: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#77634C77' },
  helpAnchor: { position: 'absolute', left: 21, bottom: 315, zIndex: 24 },
  helpButton: { minHeight: 44, paddingHorizontal: 12, gap: 5, flexDirection: 'row', borderRadius: 24, backgroundColor: '#FCF8ECED', alignItems: 'center', justifyContent: 'center' },
  helpLabel: { fontFamily: fonts.semibold, fontSize: 16, color: C.green },
  continueButton: { position: 'absolute', right: 24, bottom: 224, flexDirection: 'row', gap: 7, alignItems: 'center', backgroundColor: '#FBF8EC', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, zIndex: 24 },
  continueText: { fontFamily: fonts.semibold, fontSize: 16, color: C.green },
  cardPocket: { paddingVertical: 26, gap: 24, alignItems: 'center' }, cardLabel: { fontFamily: fonts.semibold, fontSize: 18, color: C.ink },
  busPreview: { width: '100%', height: 164, marginVertical: 13 }, vehicleDestination: { fontFamily: fonts.laundryBold, fontSize: 23, color: C.green, textAlign: 'center', marginVertical: 14 },
  crossingVisual: { alignItems: 'center', marginVertical: 16, gap: 24 }, signal: { backgroundColor: '#3D5149', padding: 15, borderRadius: 22 },
  zebra: { flexDirection: 'row', gap: 9, backgroundColor: '#B3B2A6', padding: 16, borderRadius: 16 }, stripe: { height: 62, width: 21, backgroundColor: '#FFF9E7', borderRadius: 3 },
  centerText: { fontFamily: fonts.medium, fontSize: 19, color: C.ink, lineHeight: 30, textAlign: 'center', marginVertical: 14 },
  modeRow: { flexDirection: 'row', gap: 9 }, mode: { flex: 1, backgroundColor: '#ECEBDD', padding: 14, borderRadius: 18, alignItems: 'center' },
  modeSelected: { backgroundColor: '#627D60' }, modeText: { color: C.green, fontFamily: fonts.semibold, fontSize: 16 },
  switchRow: { flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginVertical: 22 },
  paragraph: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 17, lineHeight: 27, color: C.ink },
  helpSteps: { gap: 20, backgroundColor: '#EFEEE1', padding: 17, borderRadius: 20 }, helpStep: { flexDirection: 'row', gap: 12 },
  stepIndex: { fontFamily: fonts.bold, color: '#78916A', fontSize: 18, width: 20 },
  restoreLink: { paddingVertical: 22, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' }, linkText: { fontFamily: fonts.semibold, fontSize: 16, color: C.green },
});
