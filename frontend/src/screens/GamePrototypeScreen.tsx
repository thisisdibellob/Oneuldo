import type { MarketViewFrame } from '../components/game/MarketWorldGuidance';
import { getMarketHudControlLift } from '../game/marketHudLayout';
import { useLayoutEffect } from 'react';
import { cameraBoundActorTransform } from '../game/cameraBoundActor';
import { DIALOGUE_CHARACTER_DELAY, DIALOGUE_CLEAR_VOLUME, isSilentGamePreview } from '../game/dialogueFeedback';
import { useDialogueAudio } from '../components/game/useDialogueAudio';
import { useGamePreferences } from '../game/gamePreferences';
import { getMarketNavigationPath } from '../game/marketNavigation';
import { getVillageNavigationPath, isVillageNavigationBlocked, isVillageNavigationSegmentClear, VILLAGE_PLAYER_RADIUS, VILLAGE_BUS_STOP_INTERACTION_DISTANCE } from '../game/villageNavigation';
import { getMarketRecoveryPoint } from '../game/marketRecovery';
import { getVillageRenderDepth } from '../game/villageStreets';
import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  GestureResponderEvent,
  Image,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { icons } from '../assets';
import type { BehaviorSimulationContext } from '../api/behaviorLog';
import { FirstPlayRequiredError, getMarketAiQuest, MarketQuestReadinessError, marketQuestProgressText } from '../api/marketPersonalization';
import { getMarketRuntimeContext, applyAdaptiveMarketEnvironment } from '../game/marketAdaptivePlan';
import { DirectionalAvatar } from '../components/game/DirectionalAvatar';
import { GameHud } from '../components/game/GameHud';
import { GameBackgroundMusic } from '../components/game/GameBackgroundMusic';
import { BusRoutePanel, BusTimetable } from '../components/game/BusJourneyPanels';
import { BusArrivalPreview } from '../components/game/BusArrivalPreview';
import type { PhoneTravelDestination } from '../components/game/GamePhonePanel';
import { GameControls } from '../components/game/GameControls';
import { RUN_SPEED_MULTIPLIER, type GameMovementInput } from '../game/movementControls';
import { GameContactCall } from '../components/game/GameContactCall';
import { MarketPanelTransition } from '../components/game/MarketPanelTransition';
import type { MarketSetupChanges } from '../components/game/MarketSetupPanel';
import { LibraryButton, LibraryPanel } from '../components/game/LibraryWorkPanel';
import { MinsuDialoguePortrait } from '../components/game/MinsuDialoguePortrait';
import {
  MarketShelfTarget,
  MarketCheckoutFixture,
  MarketKioskFixture,
  MarketExitMarker,
  MarketInteriorBackdrop,
  MarketEnvironmentObjects,
  MarketPersonFixture,
} from '../components/game/MarketInteriorLayer';
import { MODULAR_CHARACTER_CANVAS } from '../components/game/ModularCharacter';
import { getMarketPersonFrame } from '../game/marketPersonLayout';
import {
  ExpandedVillageLayer,
  HomeWorldLayer,
  type HomeStationId,
  type VillagePortalId,
} from '../components/game/PrototypeWorldLayers';
import { PressScale } from '../components/PressScale';
import {
  acceptDailyQuest as acceptDailyQuestStatus,
  completeDailyQuest as completeDailyQuestStatus,
  createDailyQuestItems,
  INITIAL_DAILY_QUEST_STATUS,
  type DailyQuestId,
  type DailyQuestStatusMap,
} from '../game/dailyQuests';
import {
  createAvatarWalkCycle,
  getAvatarMovement,
  facingFromVector,
  type AvatarFacing,
  type AvatarMotion,
} from '../game/avatarAnimation';
import { chibiPlayerAvatar as freshPlayerAvatar } from '../game/chibiPlayerAvatar';
import { getMarketRenderDepth, getNearestMarketStation, getMarketStationApproachPoint, MARKET_ENVIRONMENT_PLAYER_RADIUS, createMarketEnvironment, isMarketEnvironmentBlocked, type MarketEnvironment, type MarketEnvironmentConfig, type MarketEnvironmentStationId, type MarketCashierAvailability } from '../game/marketEnvironment';
import { applyMarketEnvironmentPlan, getMarketEnvironmentContext } from '../game/marketEnvironmentPlan';
import {
  BUS_STOP_POINT,
  CAFE_ENTRANCE_POINT,
  CAFE_RETURN_POINT,
  LAUNDRY_ENTRANCE_POINT,
  LAUNDRY_RETURN_POINT,
  HOME_LAUNDRY_POINT,
  HOME_EXIT_POINT,
  HOME_FRIDGE_POINT,
  HOME_PLAYER_POINT,
  HOME_STATION_INTERACTION_DISTANCE,
  HOUSE_ENTRANCE_POINT,
  HOUSE_RETURN_POINT,
  INITIAL_PLAYER_POINT,
  MARKET_CHECKOUT_RECT,
  MARKET_ENTRANCE_POINT,
  MARKET_RETURN_POINT,
  VILLAGE_NPC_BY_ID,
  VILLAGE_NPC_EXIT_DISTANCE,
  VILLAGE_NPC_INTERACTION_DISTANCE,
  VILLAGE_NPCS,
  VILLAGE_PORTAL_INTERACTION_DISTANCE,
  WORLD_BOUNDS,
  WORLD_OBSTACLES,
  type Point,
  type VillageNpcDefinition,
  type VillageNpcId,
  type WorldMapId,
} from '../game/prototypeWorld';
import {
  MarketCategoryId,
  marketCategories,
  marketMission,
  buildRandomMarketScenarioMission,
  buildMarketScenarioMission,
} from '../game/scenarios';
import { getMarketProduct } from '../game/scenarios';
import { createBusSession, getBusDestination, getDriverReply, reduceBusSession, type BusRouteId, type BusSession } from '../game/busSession';
import {
  clampWorldZoom,
  getWorldCameraFrame,
  MARKET_DEFAULT_ZOOM,
  screenPointToWorld,
  WORLD_ZOOM_MIN,
  zoomFromPinch,
  zoomFromWheel,
} from '../game/worldZoom';
import { getMarketWorldCameraFrame } from '../game/marketWorldCamera';
import { useNpcTransportQuest } from '../game/useNpcTransportQuest';
import { colors, fonts } from '../theme';
import {
  MarketInteractionRequest,
  MarketSimulationScreen,
  MarketStationId,
  type MarketTelemetrySink,
} from './MarketSimulationScreen';
import { CashierSimulationScreen } from './CashierSimulationScreen';
import { CookingSimulationScreen } from './CookingSimulationScreen';
import type { ReplayMotionPort, ReplayUiPort } from '../replay/ports';
import { isPilotBaselineScenario, pilotScenario } from '../replay/pilotScenario';
import { pilotEnvironment, pilotSessionConfig } from '../replay/pilotEnvironment';
import { resolveMarketMovement } from '../game/marketMovement';
import { MARKET_DIRECTIONAL_MOVE_SPEED, type ReplayDirectionalInput } from '../game/marketDirectionalInput';
import type { ReplayPresentation } from '../game/marketReplayPerception';
import { LibrarySimulationScreen } from './LibrarySimulationScreen';
import { LaundrySimulationScreen } from './LaundrySimulationScreen';
import { createLaundrySession, getLaundryObjective } from '../game/laundrySession';
import { getLaundryDraft, keepLaundryDraft, useLaundryDraft } from '../game/laundryStore';
import { CafeSimulationScreen } from './CafeSimulationScreen';
import { getCafeDraft, keepCafeDraft } from '../game/cafeStore';
import { BusSimulationScreen } from './BusSimulationScreen';
import { DayJourneyPanel } from '../components/game/DayJourneyPanel';
import { DAY_JOURNEY_GUIDANCE, clearDayBusDraft, dayJourneyStep, dispatchDayJourney, getDayJourney, getDayLibraryDraft, getDayBusDraft, keepDayLibraryDraft, keepDayBusDraft, useDayJourney } from '../game/dayJourney';
import type { LibrarySession } from '../game/librarySession';
import { getLibraryResult } from '../game/librarySession';
import { ShoppingErrandPanel } from '../components/game/ShoppingErrandPanel';
import { getShoppingErrandMarketConfig, type ShoppingErrandAction } from '../game/shoppingErrand';
import { dispatchShoppingErrand, getShoppingErrand, offerShoppingErrand, useShoppingErrand } from '../game/shoppingErrandStore';
import type { MarketSessionConfig } from '../game/marketSession';
import type { MarketStoredEpisode } from '../game/marketEpisodeStore';
import { recordCompletedBusActivity, recordCompletedCafeActivity, recordCompletedLaundryActivity, recordCompletedLibraryActivity, recordCompletedShoppingActivity, recordCompletedDeliveryActivity } from '../game/activityAlbum';
import { dispatchPhishingAction, getPhishingSession, usePhishingSession } from '../game/phishingStore';
import { getPhishingGoal, PHISHING_SCENARIOS } from '../game/phishingSession';

// Add ?muteAudio=1 to developer preview URLs for silent interaction checks.
const MARKET_REPLAY_ENABLED = __DEV__ && Platform.OS === 'web' && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('marketReplay') === '1';

const PLAYER_RADIUS = VILLAGE_PLAYER_RADIUS;
const PLAYER_ART_SCALE = 0.5;
const PLAYER_ART_HEIGHT = MODULAR_CHARACTER_CANVAS.height * PLAYER_ART_SCALE;
const PLAYER_ART_WIDTH = MODULAR_CHARACTER_CANVAS.width * PLAYER_ART_SCALE;
const PLAYER_ART_PIVOT_Y = MODULAR_CHARACTER_CANVAS.pivotY * PLAYER_ART_SCALE;
const MOVE_SPEED = 190;
const ACCESSIBILITY_STEP = 58;
const DIALOGUE_READ_DELAY = 360;
type GamePreviewLocation = 'village-stop' | 'library';
function getPreviewLocation(): GamePreviewLocation | undefined {
  if (!__DEV__ || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  const query = new URLSearchParams(window.location.search);
  if (query.get('busPreview') === '1') return 'village-stop';
  return query.get('libraryPreview') === '1' ? 'library' : undefined;
}

function touchDistance(touches: readonly { pageX: number; pageY: number }[]): number {
  if (touches.length < 2) return 0;
  return Math.hypot(
    touches[0].pageX - touches[1].pageX,
    touches[0].pageY - touches[1].pageY,
  );
}

const WEB_MOVEMENT_KEYS: Record<string, Point> = {
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  KeyS: { x: 0, y: 1 },
  KeyW: { x: 0, y: -1 },
};

type DailyConversationChoice = 'fun' | 'tired';
type NpcInteractionChoice = 'npc-cashier' | 'npc-quest' | 'npc-talk' | 'npc-errand' | 'npc-safety';
type DialogueChoice = DailyConversationChoice | NpcInteractionChoice;
type DialogueStep =
  | { kind: 'line'; text: string }
  | {
      kind: 'choice';
      options: readonly { id: DialogueChoice; label: string }[];
      purpose: 'conversation' | 'npc-action';
      text: string;
    }
  | {
      kind: 'response';
      responses: Record<DailyConversationChoice, string>;
    };

const dialogueSteps = [
  { kind: 'line', text: '어, 왔구나! 오늘도 만나서 반가워.' },
  { kind: 'line', text: '나는 마을을 한 바퀴 걷고 있었어.' },
  {
    kind: 'choice',
    options: [
      { id: 'fun', label: '재미있는 일이 있었어' },
      { id: 'tired', label: '조금 피곤한 하루였어' },
    ],
    purpose: 'conversation',
    text: '너는 오늘 하루 어땠어?',
  },
  {
    kind: 'response',
    responses: {
      fun: '정말? 잘됐다! 무슨 일이었는지 다음에 꼭 들려줘.',
      tired: '그랬구나. 오늘도 수고했어. 우리 천천히 걸어가자.',
    },
  },
  { kind: 'line', text: '그럼 우리 같이 문제를 풀어볼까?' },
  { kind: 'line', text: '좋아! 오늘은 대중교통을 안전하게 이용하는 연습을 해 보자.' },
  { kind: 'line', text: '최근 연습 결과에 맞는 문제를 준비해 줄게.' },
] as const satisfies readonly DialogueStep[];

function resolveDialogueText(
  step: DialogueStep | undefined,
  selectedChoice: DailyConversationChoice | null,
) {
  if (!step) return '';
  if (step.kind !== 'response') return step.text;
  return selectedChoice ? step.responses[selectedChoice] : '';
}

type ControlMode = 'joystick' | 'touch';
type NearbyMarketStation = MarketEnvironmentStationId | null;
type NearbyHomeStation = HomeStationId | null;
type VillageGamePortalId = VillagePortalId;
type PendingPortal = VillageGamePortalId | null;

function getVillagePortalPoint(portal: VillageGamePortalId): Point {
  return portal === 'market' ? MARKET_ENTRANCE_POINT : portal === 'cafe' ? CAFE_ENTRANCE_POINT : portal === 'laundry' ? LAUNDRY_ENTRANCE_POINT : HOUSE_ENTRANCE_POINT;
}
type DialogueMode = 'minsu-quest' | 'npc-greeting' | 'small-talk' | null;
type InfoPanel = { body: string; title: string } | null;
type TapInteractionOptions = {
  busStop?: boolean;
  homeStation?: NearbyHomeStation;
  marketStation?: NearbyMarketStation;
  npcId?: VillageNpcId | null;
  portalId?: PendingPortal;
};

const NPC_QUEST_IDS: Partial<Record<VillageNpcId, DailyQuestId>> = {
  jiyoung: 'market-shopping',
  minsu: 'minsu-safety',
};
function getWorldBounds(worldMap: WorldMapId, environment?: MarketEnvironment) {
  return worldMap === 'market' && environment ? environment.world : WORLD_BOUNDS[worldMap];
}

function isBlocked(point: Point, worldMap: WorldMapId, environment: MarketEnvironment, cashierCalled: Partial<MarketCashierAvailability> = {}) {
  if (worldMap === 'market') return isMarketEnvironmentBlocked(environment, point, cashierCalled);
  if (worldMap === 'village') return isVillageNavigationBlocked(point);
  const obstacles = WORLD_OBSTACLES[worldMap];
  return obstacles.some(
    (obstacle) =>
      point.x + PLAYER_RADIUS > obstacle.x &&
      point.x - PLAYER_RADIUS < obstacle.x + obstacle.width &&
      point.y + PLAYER_RADIUS > obstacle.y &&
      point.y - PLAYER_RADIUS < obstacle.y + obstacle.height,
  );
}

function clampPoint(point: Point, worldMap: WorldMapId, environment?: MarketEnvironment): Point {
  const { height, width } = getWorldBounds(worldMap, environment);
  const radius = worldMap === 'market' ? MARKET_ENVIRONMENT_PLAYER_RADIUS : PLAYER_RADIUS;
  return {
    x: Math.max(radius, Math.min(point.x, width - radius)),
    y: Math.max(radius, Math.min(point.y, height - radius)),
  };
}

function findReachableTarget(current: Point, desired: Point, worldMap: WorldMapId, environment: MarketEnvironment, cashierCalled: Partial<MarketCashierAvailability> = {}): Point {
  const clamped = clampPoint(desired, worldMap, environment);
  for (let step = 12; step >= 0; step -= 1) {
    const ratio = step / 12;
    const candidate = {
      x: current.x + (clamped.x - current.x) * ratio,
      y: current.y + (clamped.y - current.y) * ratio,
    };
    if (!isBlocked(candidate, worldMap, environment, cashierCalled)) return candidate;
  }
  return current;
}

function IsoBuilding({
  color,
  height,
  label,
  width,
  x,
  y,
}: {
  color: string;
  height: number;
  label: string;
  width: number;
  x: number;
  y: number;
}) {
  return (
    <View style={[styles.building, { height, left: x, top: y, width }]}>
      <View style={[styles.buildingFront, { backgroundColor: color }]} />
      <View style={[styles.buildingRoof, { backgroundColor: color, width: width * 0.72 }]} />
      <View style={styles.buildingDoor} />
      <Text style={styles.buildingLabel}>{label}</Text>
    </View>
  );
}

function MarketProximityCloud({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(visible);
  const [reduceMotion, setReduceMotion] = useState(false);
  const visibility = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let driftAnimation: Animated.CompositeAnimation | null = null;
    visibility.stopAnimation();
    drift.stopAnimation();

    if (visible) {
      setMounted(true);
      if (reduceMotion) {
        visibility.setValue(1);
      } else {
        Animated.spring(visibility, {
          damping: 18,
          mass: 0.72,
          stiffness: 190,
          toValue: 1,
          useNativeDriver: true,
        }).start();
        drift.setValue(0);
        driftAnimation = Animated.loop(
          Animated.sequence([
            Animated.timing(drift, {
              duration: 1300,
              easing: Easing.inOut(Easing.sin),
              toValue: 1,
              useNativeDriver: true,
            }),
            Animated.timing(drift, {
              duration: 1300,
              easing: Easing.inOut(Easing.sin),
              toValue: 0,
              useNativeDriver: true,
            }),
          ]),
        );
        driftAnimation.start();
      }
    } else {
      drift.setValue(0);
      Animated.timing(visibility, {
        duration: reduceMotion ? 100 : 150,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }

    return () => {
      driftAnimation?.stop();
    };
  }, [drift, reduceMotion, visibility, visible]);

  if (!mounted) return null;

  const revealY = visibility.interpolate({ inputRange: [0, 1], outputRange: [7, 0] });
  const floatingY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.marketCloudRoot,
        {
          opacity: visibility,
          transform: [
            { translateY: Animated.add(revealY, floatingY) },
            {
              scale: visibility.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }),
            },
          ],
        },
      ]}
      testID="market-proximity-cloud"
    >
      <View style={[styles.marketCloudBubble, styles.marketCloudBubbleLeft]} />
      <View style={[styles.marketCloudBubble, styles.marketCloudBubbleRight]} />
      <View style={styles.marketCloudTail} />
      <View style={styles.marketCloudBody}>
        <View style={styles.marketCloudIcon}>
          <Ionicons color="#4E6758" name="storefront" size={18} />
        </View>
        <Text style={styles.marketCloudText}>하늘마트</Text>
        <Ionicons color="#567466" name="chevron-forward" size={17} />
      </View>
    </Animated.View>
  );
}

function MarketWorldLayer({
  controlMode,
  environment,
  cashierCalled,
  nearbyStation,
  onStationPress,
  tapTargetMarker,
}: {
  controlMode: ControlMode;
  environment: MarketEnvironment;
  cashierCalled: Partial<MarketCashierAvailability>;
  nearbyStation: NearbyMarketStation;
  onStationPress: (event: GestureResponderEvent, station: MarketEnvironmentStationId) => void;
  tapTargetMarker: Point | null;
}) {
  return (
    <>
      <MarketInteriorBackdrop environment={environment} />
      <MarketEnvironmentObjects environment={environment} />

      {[...environment.employees, ...environment.customers].map((person) => (
        <PressScale key={person.id} accessibilityLabel={person.label}
          accessibilityRole={person.kind === 'employee' && controlMode === 'touch' ? 'button' : 'image'}
          disabled={person.kind !== 'employee' || controlMode !== 'touch'}
          onPress={(event) => onStationPress(event, `staff:${person.id}`)}
          style={{ position: 'absolute', ...getMarketPersonFrame(person.point), zIndex: getMarketRenderDepth(person.point.y) }}>
          <MarketPersonFixture person={person} active={nearbyStation === `staff:${person.id}`} />
        </PressScale>
      ))}

      {tapTargetMarker && controlMode === 'touch' ? (
        <View
          pointerEvents="none"
          style={[styles.tapTargetMarker, { left: tapTargetMarker.x - 12, top: tapTargetMarker.y - 12 }]}
          testID="touch-target-marker"
        />
      ) : null}

      {environment.checkouts.map((counter, index) => counter.kind === 'kiosk' ? null : <PressScale
        key={counter.id}
        accessibilityLabel={controlMode === 'touch' ? `${index + 1}번 계산대로 이동` : `${index + 1}번 계산대`}
        accessibilityRole={controlMode === 'touch' ? 'button' : undefined}
        disabled={controlMode !== 'touch'}
        hitSlop={{ bottom: 12, left: 12, right: 12, top: 20 }}
        onPress={(event) => onStationPress(event, counter.id)}
        scaleTo={0.98}
        style={[styles.marketCounter, { left: counter.rect.x, top: counter.rect.y, width: counter.rect.width, height: counter.rect.height, zIndex: getMarketRenderDepth(counter.rect.y + counter.rect.height) }]}
      >
        <MarketCheckoutFixture counter={counter} index={index} active={nearbyStation === counter.id} cashierPresent={cashierCalled[counter.id] ?? counter.cashierPresent} />
      </PressScale>)}

      {(environment.kiosks ?? []).map(kiosk => <PressScale key={kiosk.id}
        accessibilityRole="button" accessibilityLabel={`셀프 계산대 ${kiosk.number}로 이동`} hitSlop={{ top: 48, bottom: 5, left: 8, right: 8 }}
        disabled={controlMode !== 'touch'} onPress={event => onStationPress(event, kiosk.id)}
        style={{ position: 'absolute', left: kiosk.rect.x, top: kiosk.rect.y, width: kiosk.rect.width, height: kiosk.rect.height,
          zIndex: getMarketRenderDepth(kiosk.rect.y + kiosk.rect.height), overflow: 'visible' }}>
        <MarketKioskFixture kiosk={kiosk} active={nearbyStation === kiosk.id} />
      </PressScale>)}

      {marketCategories.map(category => <MarketShelfTarget
        key={category.id} placement={environment.shelves[category.id]} categoryId={category.id}
        active={nearbyStation === category.id} disabled={controlMode !== 'touch'}
        accessibilityLabel={controlMode === 'touch' ? `${category.label} 진열대로 이동` : `${category.label} 진열대`}
        onPress={event => onStationPress(event, category.id)}
      />)}
      {(['entrance', 'exit'] as const).map(station => <View key={station} pointerEvents="none"
        style={[styles.marketExit, { left: environment.stations[station].x - 64,
          top: environment.stations[station].y + 24, width: 128, height: 46 }]}>
        <MarketExitMarker kind={station} active={false}
            blocked={environment.constructionZones?.some(zone => zone.gateId === station)} />
      </View>)}
      {environment.commonDoor ? <PressScale
        accessibilityLabel="마트 공동 출입문으로 이동" accessibilityRole="button"
        disabled={controlMode !== 'touch'} onPress={event => onStationPress(event, 'common-door')}
        style={[styles.marketExit, { left: environment.commonDoor.point.x - 64,
          top: environment.commonDoor.point.y - 54, width: 128, height: 46 }]}>
        <MarketExitMarker kind="common-door" active={nearbyStation === 'common-door'} />
      </PressScale> : null}
    </>
  );
}

type GamePrototypeScreenProps = {
  accessToken?: string | null;
  onExit: () => void;
  onOpenAnalysis?: () => void;
  initialActivity?: 'day' | 'bus' | 'market' | 'errand' | 'phishing' | 'cafe' | 'laundry';
  /** Development placement only; normal play always starts in the shared village. */
  previewLocation?: GamePreviewLocation;
};

export function GamePrototypeScreen({ accessToken = null, onExit, onOpenAnalysis, initialActivity, previewLocation = getPreviewLocation() }: GamePrototypeScreenProps) {
  const replayWindow = useWindowDimensions();
  const replayInsets = useContext(SafeAreaInsetsContext);
  const marketCameraMetrics = useRef({ fontScale: Math.max(1, replayWindow.fontScale),
    safeArea: { top: replayInsets?.top ?? 0, bottom: replayInsets?.bottom ?? 0 } });
  marketCameraMetrics.current = { fontScale: Math.max(1, replayWindow.fontScale),
    safeArea: { top: replayInsets?.top ?? 0, bottom: replayInsets?.bottom ?? 0 } };
  const journey = useDayJourney();
  const errand = useShoppingErrand();
  const safetySession = usePhishingSession();
  const safetyPhoneRequestKey = useRef(1);
  const [safetyPhoneRequest, setSafetyPhoneRequest] = useState<{ key: number; action: 'messages' } | null>(initialActivity === 'phishing' ? { key: 1, action: 'messages' } : null);
  const [visitingMinsu, setVisitingMinsu] = useState(false);
  const openSafetyPhone = useCallback(() => setSafetyPhoneRequest({ key: ++safetyPhoneRequestKey.current, action: 'messages' }), []);
  const consumeSafetyPhoneRequest = useCallback(() => setSafetyPhoneRequest(null), []);
  const visitMinsuForSafety = useCallback(() => {
    dispatchPhishingAction({ type: 'STOP' });
    setVisitingMinsu(true);
  }, []);
  useEffect(() => {
    if (!safetySession || safetySession.verification || safetySession.status === 'completed') setVisitingMinsu(false);
  }, [safetySession]);
  const [errandPanelOpen, setErrandPanelOpen] = useState(initialActivity === 'errand' && !!getShoppingErrand());
  const [errandMarketConfig, setErrandMarketConfig] = useState<Partial<MarketSessionConfig> | undefined>();
  const openErrandPanel = useCallback(() => setErrandPanelOpen(true), []);
  const [dayPanelOpen, setDayPanelOpen] = useState(initialActivity === 'day' && ['available', 'completed'].includes(getDayJourney().stage));
  const openDayPanel = useCallback(() => setDayPanelOpen(true), []);
  const resumeDayLocation = initialActivity === 'day' || initialActivity === 'errand';
  const initialPlayerPoint = useRef<Point>(initialActivity === 'market' ? { ...MARKET_RETURN_POINT } : initialActivity === 'bus' || (resumeDayLocation && getDayJourney().stage === 'home') || (__DEV__ && previewLocation === 'village-stop') ? { ...BUS_STOP_POINT } : { ...INITIAL_PLAYER_POINT }).current;
  const DEVELOPMENT_AUDIO_MUTED = isSilentGamePreview();
  const { preferences } = useGamePreferences();
  const effectsVolumeRef = useRef(preferences.effectsVolume);
  effectsVolumeRef.current = preferences.effectsVolume;
  // A null source keeps silent previews from downloading or decoding audio at all.
  // Keep every hook mounted so audio-enabled visits retain the same lifecycle.
  const backgroundMusic = useAudioPlayer(DEVELOPMENT_AUDIO_MUTED ? null : require('../../assets/audio/apple-cider.m4a'), {
    downloadFirst: true,
    keepAudioSessionActive: true,
  });
  const viewportNode = useRef<View | null>(null);
  const marketViewFrame = useRef<MarketViewFrame|null>(null);
  const camera = useRef(new Animated.ValueXY({x:-initialPlayerPoint.x,y:-initialPlayerPoint.y}, { useNativeDriver: Platform.OS !== 'web' })).current;
  const playerCameraOffset = useRef(new Animated.ValueXY()).current;
  const viewportCenterAnimation = useRef(new Animated.ValueXY()).current;
  const [actorTransform] = useState(() => cameraBoundActorTransform(camera, viewportCenterAnimation, playerCameraOffset));
  const marketPlayerDepth = useRef(new Animated.Value(getMarketRenderDepth(initialPlayerPoint.y))).current;
  const villagePlayerDepth = useRef(new Animated.Value(getVillageRenderDepth(initialPlayerPoint.y))).current;
  const cameraCenter = useRef<Point>({ ...initialPlayerPoint });
  const worldZoom = useRef(new Animated.Value(WORLD_ZOOM_MIN)).current;
  const dialoguePanelProgress = useRef(new Animated.Value(0)).current;
  const dailyChoiceProgress = useRef(new Animated.Value(0)).current;
  const quizPanelProgress = useRef(new Animated.Value(0)).current;
  const speakerTagFloat = useRef(new Animated.Value(0)).current;
  const dialogueArrowFloat = useRef(new Animated.Value(0)).current;
  const resultCelebration = useRef(new Animated.Value(0)).current;
  const playerPoint = useRef<Point>({ ...initialPlayerPoint });
  const marketTelemetry = useRef<MarketTelemetrySink | null>(null);
  const marketMovementListener = useRef<((previous: Point, next: Point) => void) | null>(null);
  const worldMapRef = useRef<WorldMapId>('village');
  const viewport = useRef({ width: 0, height: 0 });
  const viewportOrigin = useRef({ x: 0, y: 0 });
  const worldZoomCurrentRef = useRef(WORLD_ZOOM_MIN);
  const worldZoomTargetRef = useRef(WORLD_ZOOM_MIN);
  const previousZoomMapRef = useRef<WorldMapId>('village');
  const outsideMarketZoomRef = useRef(WORLD_ZOOM_MIN);
  const pinchStartDistanceRef = useRef(0);
  const pinchStartZoomRef = useRef(WORLD_ZOOM_MIN);
  const zoomGestureActiveRef = useRef(false);
  const suppressWorldPressRef = useRef(false);
  const direction = useRef<Point>({ x: 0, y: 0 });
  const replayFrame = useRef<((timestamp: number, dt: number) => ReplayDirectionalInput) | null>(null);
  const replayUi = useRef<ReplayUiPort | null>(null);
  const replayMotion = useRef<ReplayMotionPort | null>(null);
  const [replayStatus, setReplayStatus] = useState('재생 연결 준비');
  const keyboardDirection = useRef<Point>({ x: 0, y: 0 });
  const keyboardEngaged = useRef(false);
  const pressedMovementKeys = useRef(new Set<string>());
  const keyboardSprintHeld = useRef(false);
  const speedMultiplier = useRef(1);
  const tapTarget = useRef<Point | null>(null);
  const tapWaypoints = useRef<Point[]>([]);
  const pendingNpcInteraction = useRef<VillageNpcId | null>(null);
  const pendingPortalInteraction = useRef<PendingPortal>(null);
  const pendingMarketStationInteraction = useRef<NearbyMarketStation>(null);
  const pendingHomeStationInteraction = useRef<NearbyHomeStation>(null);
  const pendingBusStopInteraction = useRef(false);
  const joystickEngaged = useRef(false);
  const touchHoldActivated = useRef(false);
  const clearSoundTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearSoundGeneration = useRef(0);
  const animationFrame = useRef<number | null>(null);
  const previousFrame = useRef<number | null>(null);
  const nearbyNpcIdRef = useRef<VillageNpcId | null>(null);
  const nearbyPortalIdRef = useRef<PendingPortal>(null);
  const marketStationNearbyRef = useRef<NearbyMarketStation>(null);
  const homeStationNearbyRef = useRef<NearbyHomeStation>(null);
  const busStopNearbyRef = useRef(false);
  const controlsLockedRef = useRef(false);
  const dialogueReadyAt = useRef(Number.POSITIVE_INFINITY);
  const startNpcGreetingRef = useRef<(npcId: VillageNpcId) => void>(() => undefined);
  const playerFacingRef = useRef<AvatarFacing>('front');
  const playerMotionRef = useRef<AvatarMotion>('idle');
  const [playerWalkCycle] = useState(createAvatarWalkCycle);

  const [nearbyNpcId, setNearbyNpcId] = useState<VillageNpcId | null>(null);
  const [nearbyPortalId, setNearbyPortalId] = useState<PendingPortal>(null);
  const [marketStationNearby, setMarketStationNearby] = useState<NearbyMarketStation>(null);
  const [nearbyHomeStation, setNearbyHomeStation] = useState<NearbyHomeStation>(null);
  const [busStopNearby, setBusStopNearby] = useState(false);
  const [marketScenarioLocked, setMarketScenarioLocked] = useState(false);
  const [personalizedMarketMission, setPersonalizedMarketMission] = useState(marketMission);
  const [marketAiStatus, setMarketAiStatus] = useState<'loading' | 'waiting' | 'error' | 'ready' | 'baseline'>('loading');
  const [marketAiNotice, setMarketAiNotice] = useState<string | null>(null);
  const [marketAiRetry, setMarketAiRetry] = useState(0);
  const [marketAiRequestToken, setMarketAiRequestToken] = useState<string | null | undefined>(undefined);
  const marketAiRequestSequence = useRef(0);
  const marketAccountToken = useRef(accessToken);
  marketAccountToken.current = accessToken;
  const [marketDifficulty, setMarketDifficulty] = useState(2);
  const [marketSimulation, setMarketSimulation] = useState<
    Omit<BehaviorSimulationContext, 'simulationStarted'> | undefined
  >(undefined);
  const [marketEnvironment, setMarketEnvironment] = useState(() => createMarketEnvironment());
  const marketEnvironmentRef = useRef(marketEnvironment);
  const applyMarketEnvironment = useRef<(environment: MarketEnvironment) => void>(() => undefined);
  const marketSetupEnvironment = useRef<Partial<MarketEnvironmentConfig>>({});
  const marketLockedSettings = useRef<Record<string,unknown>>({});
  useEffect(()=>{marketLockedSettings.current={};marketSetupEnvironment.current={};},[accessToken]);
  const [marketCashierCalled, setMarketCashierCalled] = useState<Partial<MarketCashierAvailability>>({});
  const marketCashierCalledRef = useRef<Partial<MarketCashierAvailability>>({});
  const marketVisitNumber = useRef(0);
  const [marketInteractionRequest, setMarketInteractionRequest] =
    useState<MarketInteractionRequest | null>(null);
  const [fridgeMenuOpen, setFridgeMenuOpen] = useState(false);
  const [cookingOpen, setCookingOpen] = useState(false);
  const [cashierOpen, setCashierOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState((__DEV__ && previewLocation === 'library') || (resumeDayLocation && getDayJourney().stage === 'working'));
  const [cafeOpen, setCafeOpen] = useState(initialActivity === 'cafe');
  const [laundryLocation, setLaundryLocation] = useState<'home' | 'laundromat' | null>(initialActivity === 'laundry' ? 'home' : null);
  const laundryDraft = useLaundryDraft();
  const [busOpen, setBusOpen] = useState(resumeDayLocation && (getDayJourney().stage === 'returning' || !!getDayBusDraft()));
  const [busEntryPoint, setBusEntryPoint] = useState<'village-stop' | 'library-exterior'>(resumeDayLocation && getDayJourney().stage === 'returning' ? 'library-exterior' : 'village-stop');
  const [busDestinationOpen, setBusDestinationOpen] = useState(false);
  const [busDestinationPresent, setBusDestinationPresent] = useState(false);
  const [villageBusOpen, setVillageBusOpen] = useState(false);
  const [villageBusPresent, setVillageBusPresent] = useState(false);
  const [villageBusSession, setVillageBusSession] = useState<BusSession | null>(null);
  const [villageStopPreview] = useState(() => createBusSession({ id: 'village-stop-sign', startedAt: 0, phase: 'waiting' }));
  const [busInitialSession, setBusInitialSession] = useState<BusSession | undefined>(() => resumeDayLocation ? getDayBusDraft() : undefined);
  const [nextVillageBus, setNextVillageBus] = useState<BusRouteId>('201');
  const [villageDriverReply, setVillageDriverReply] = useState<string | null>(null);
  const [villageBusReady, setVillageBusReady] = useState(false);
  const [villageRouteOpen, setVillageRouteOpen] = useState(false);
  const [busSceneVisit, setBusSceneVisit] = useState(0);
  useEffect(() => {
    if (!villageBusOpen || !villageBusSession || villageBusSession.offeredRoute) return;
    const timer = setTimeout(() => setVillageBusSession(current => current
      ? reduceBusSession(current, { type: 'ARRIVE_VEHICLE', route: nextVillageBus }) : current), 2200);
    return () => clearTimeout(timer);
  }, [villageBusOpen, villageBusSession?.offeredRoute, nextVillageBus]);
  const [worldMap, setWorldMap] = useState<WorldMapId>('village');
  const [audioModeReady, setAudioModeReady] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [controlMode, setControlMode] = useState<ControlMode>('joystick');
  const [hudMenuOpen, setHudMenuOpen] = useState(false);
  const [phoneContact, setPhoneContact] = useState<'jiyoung' | 'minsu' | null>(null);
  const [phoneCallPresent, setPhoneCallPresent] = useState(false);
  const closePhoneCall = useCallback(() => setPhoneContact(null), []);
  const [runEnabled, setRunEnabled] = useState(false);
  const movementSettingsRef = useRef({ runMode: preferences.runMode, runEnabled });
  movementSettingsRef.current = { runMode: preferences.runMode, runEnabled };
  const [playerAvatarPose, setPlayerAvatarPose] = useState<{
    facing: AvatarFacing;
    motion: AvatarMotion;
  }>({ facing: 'front', motion: 'idle' });
  const [tapTargetMarker, setTapTargetMarker] = useState<Point | null>(null);
  const [questOfferId, setQuestOfferId] = useState<DailyQuestId | null>(null);
  const [infoPanel, setInfoPanel] = useState<InfoPanel>(null);
  const [dialogueMode, setDialogueMode] = useState<DialogueMode>(null);
  const [dialogueNpcId, setDialogueNpcId] = useState<VillageNpcId>('minsu');
  const [activeDialogueSteps, setActiveDialogueSteps] =
    useState<readonly DialogueStep[]>(dialogueSteps);
  const [dialogueIndex, setDialogueIndex] = useState<number | null>(null);
  const [renderedDialogueIndex, setRenderedDialogueIndex] = useState(0);
  const [dialoguePanelMounted, setDialoguePanelMounted] = useState(false);
  const [visibleDialogueCharacters, setVisibleDialogueCharacters] = useState(0);
  const [selectedDailyChoice, setSelectedDailyChoice] =
    useState<DailyConversationChoice | null>(null);
  const [renderedQuizStep, setRenderedQuizStep] = useState<'loading' | 'question' | 'result' | 'error'>('question');
  const [quizPanelMounted, setQuizPanelMounted] = useState(false);
  const [dailyQuestStatuses, setDailyQuestStatuses] =
    useState<DailyQuestStatusMap>(INITIAL_DAILY_QUEST_STATUS);
  useEffect(() => {
    if (worldMap === 'market' && marketScenarioLocked) setHudMenuOpen(false);
  }, [worldMap, marketScenarioLocked]);
  const questStatusesRef = useRef<DailyQuestStatusMap>(INITIAL_DAILY_QUEST_STATUS);
  questStatusesRef.current = dailyQuestStatuses;

  const acceptDailyQuest = useCallback((questId: DailyQuestId) => {
    setDailyQuestStatuses((current) => {
      const next = acceptDailyQuestStatus(current, questId);
      questStatusesRef.current = next;
      return next;
    });
  }, []);
  const completeDailyQuest = useCallback((questId: DailyQuestId) => {
    setDailyQuestStatuses((current) => {
      const next = completeDailyQuestStatus(current, questId);
      questStatusesRef.current = next;
      return next;
    });
  }, []);
  const handleTransportQuizCompleted = useCallback(
    () => completeDailyQuest('minsu-safety'),
    [completeDailyQuest],
  );
  const transportQuiz = useNpcTransportQuest({
    accessToken,
    onCompleted: handleTransportQuizCompleted,
  });
  const closeTransportQuiz = transportQuiz.close;
  const quizStep = transportQuiz.stage === 'idle' ? null : transportQuiz.stage;
  const dailyQuests = createDailyQuestItems(dailyQuestStatuses);
  const currentDialogueStep =
    dialogueIndex === null ? undefined : activeDialogueSteps[dialogueIndex];
  const currentDialogue = resolveDialogueText(currentDialogueStep, selectedDailyChoice);
  const dialogueAudio = useDialogueAudio({
    active: dialogueIndex !== null && !reduceMotionEnabled,
    ready: audioModeReady,
    turnKey: `${dialogueNpcId}:${dialogueIndex}:${currentDialogue}`,
  });
  const renderedDialogueStep = activeDialogueSteps[renderedDialogueIndex];
  const renderedDialogue = resolveDialogueText(renderedDialogueStep, selectedDailyChoice);
  const dialogueSpeakerName = VILLAGE_NPC_BY_ID[dialogueNpcId].name;
  const dialoguePortraitExpression =
    dialogueNpcId === 'minsu'
      ? dialogueMode === 'minsu-quest'
        ? 'ready'
        : 'attentive'
      : null;
  const dialogueChoiceVisible =
    currentDialogueStep?.kind === 'choice' &&
    visibleDialogueCharacters >= currentDialogue.length;
  const npcActionChoiceOpen =
    currentDialogueStep?.kind === 'choice' && currentDialogueStep.purpose === 'npc-action';
  controlsLockedRef.current =
    errandPanelOpen ||
    dayPanelOpen ||
    dialoguePanelMounted ||
    quizPanelMounted ||
    dialogueIndex !== null ||
    quizStep !== null ||
    hudMenuOpen ||
    phoneContact !== null ||
    phoneCallPresent ||
    questOfferId !== null ||
    infoPanel !== null ||
    fridgeMenuOpen ||
    cookingOpen ||
    cashierOpen ||
    libraryOpen ||
    cafeOpen || laundryLocation !== null ||
    busOpen ||
    busDestinationOpen ||
    busDestinationPresent ||
    villageBusOpen ||
    villageBusPresent ||
    marketScenarioLocked || (worldMap === 'market' && (marketAiRequestToken !== accessToken || !['ready', 'baseline'].includes(marketAiStatus)));

  useEffect(() => {
    let active = true;
    let readinessTimer: ReturnType<typeof setTimeout> | undefined;
    const requestSequence = ++marketAiRequestSequence.current;
    const isCurrentRequest = () => active && requestSequence === marketAiRequestSequence.current
      && worldMapRef.current === 'market' && marketAccountToken.current === accessToken;

    if (worldMap !== 'market') {
      return () => {
        active = false;
      };
    }

    const pilotScenarioId = __DEV__ && MARKET_REPLAY_ENABLED && typeof window !== 'undefined' && window.location
      ? new URLSearchParams(window.location.search).get('marketPilotScenario') ?? undefined : undefined;
    const fixedPilotMission = pilotScenario(__DEV__ && MARKET_REPLAY_ENABLED, pilotScenarioId);
    if (fixedPilotMission) {
      setMarketAiRequestToken(accessToken);
      setMarketAiStatus('baseline');
      setPersonalizedMarketMission(fixedPilotMission);
      setMarketDifficulty(2);
      setMarketSimulation(isPilotBaselineScenario(pilotScenarioId)
        ? { contentSource: 'STATIC', questInstanceId: randomUUID() } : undefined);
      return () => { active = false; };
    }

    if (!accessToken) {
      const randomMission = buildRandomMarketScenarioMission();
      setMarketAiRequestToken(accessToken);
      setMarketAiStatus('baseline');
      setPersonalizedMarketMission(randomMission);
      setMarketDifficulty(2);
      setMarketSimulation(undefined);
      if (__DEV__) {
        console.info('[market-personalization] random baseline applied', {
          contentSource: 'STATIC',
          scenarioId: randomMission.scenarioId,
        });
      }
      return () => {
        active = false;
      };
    }

    setMarketAiStatus('loading');
    setMarketAiNotice(null);
    setMarketAiRequestToken(accessToken);
    const environmentContext = getMarketEnvironmentContext(marketEnvironmentRef.current, marketSetupEnvironment.current.shelfOrder !== undefined);
    environmentContext.runtimeContext=getMarketRuntimeContext(marketEnvironmentRef.current,marketLockedSettings.current);
    const requestQuest = () => {
      if (!isCurrentRequest()) return;
      void getMarketAiQuest(accessToken, environmentContext,progress=>{if(isCurrentRequest())setMarketAiNotice(marketQuestProgressText(progress));})
      .then((generation) => {
        if (!isCurrentRequest()) return;
        const environment = generation.quest.runtimePlan ? applyAdaptiveMarketEnvironment(marketEnvironmentRef.current,generation.quest) : marketSetupEnvironment.current.shelfOrder !== undefined
          ? marketEnvironmentRef.current
          : applyMarketEnvironmentPlan(marketEnvironmentRef.current, generation.quest.environmentPlan);
        applyMarketEnvironment.current(environment);
        setPersonalizedMarketMission(generation.quest);
        setMarketDifficulty(generation.quest.difficulty);
        setMarketSimulation({
          contentSource: 'GENERATED',
          questInstanceId: generation.generationId,
        });
        setMarketAiStatus('ready');
        if (__DEV__) {
          console.info('[market-personalization] AI quest applied', {
            generationId: generation.generationId,
            source: generation.source,
            contentSource: 'GENERATED',
            model: generation.model,
            difficulty: generation.quest.difficulty,
            mode: generation.personalizationMode,
            summary: generation.adaptationSummary,
            reasons: generation.reasonCodes,
            requestedShelfOrder: generation.quest.environmentPlan?.shelfOrder,
            actualShelfOrder: getMarketEnvironmentContext(environment).shelfSlots.map(slot => slot.categoryId),
            placementSource: marketSetupEnvironment.current.shelfOrder !== undefined ? 'USER_OVERRIDE'
              : generation.quest.environmentPlan ? 'AI' : 'LEGACY',
          });
        }
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest()) return;
        if (error instanceof FirstPlayRequiredError) {
          const firstMission = buildMarketScenarioMission('S01');
          setPersonalizedMarketMission(firstMission);
          setMarketDifficulty(2);
          setMarketSimulation({ contentSource: 'STATIC', questInstanceId: randomUUID() });
          setMarketAiNotice(null);
          setMarketAiStatus('baseline');
          if (__DEV__) console.info('[market-personalization] first-play baseline applied', {
            code: error.code, stage: error.stage, contentSource: 'STATIC', scenarioId: firstMission.scenarioId,
          });
          return;
        }
        if (error instanceof MarketQuestReadinessError) {
          setMarketAiStatus(error.pending ? 'waiting' : 'error');
          setMarketAiNotice(error.message);
          // Pending jobs progress automatically; an unrequested/failed analysis needs the analysis screen.
          if (error.pending && error.stage !== 'NOT_REQUESTED') readinessTimer = setTimeout(requestQuest, 5000);
          return;
        }
        setMarketAiStatus('error');
        setMarketAiNotice(error instanceof Error ? error.message : 'AI 맞춤 장보기를 준비하지 못했어요. 다시 확인해 주세요.');
        if (__DEV__) {
          console.warn('[market-personalization] AI quest unavailable', { error });
        }
      }); };
    requestQuest();

    return () => {
      active = false;
      clearTimeout(readinessTimer);
    };
  }, [accessToken, worldMap, marketAiRetry]);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotionEnabled(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const updateCamera = useCallback(
    (point: Point) => {
      const frame = worldMapRef.current === 'market'
        ? getMarketWorldCameraFrame(point, { viewport: viewport.current, zoom: worldZoomCurrentRef.current,
          ...marketCameraMetrics.current }, marketEnvironmentRef.current.world)
        : getWorldCameraFrame(point, viewport.current, worldZoomCurrentRef.current);
      cameraCenter.current = frame.center;
      marketViewFrame.current={...viewport.current,center:{...frame.center},zoom:worldZoomCurrentRef.current};
      camera.setValue(frame.translation);
      playerCameraOffset.setValue(frame.playerOffset);
      if (worldMapRef.current === 'market') {
        marketPlayerDepth.setValue(getMarketRenderDepth(point.y));
      } else if (worldMapRef.current === 'village') {
        villagePlayerDepth.setValue(getVillageRenderDepth(point.y));
      }
    },
    [camera, playerCameraOffset, marketPlayerDepth, villagePlayerDepth],
  );

  useEffect(() => {
    if (worldMapRef.current === 'market') updateCamera(playerPoint.current);
  }, [replayWindow.fontScale, replayInsets?.top, replayInsets?.bottom, updateCamera]);

  const updateNpcProximity = useCallback((point: Point) => {
    const activeMap = worldMapRef.current;
    const setNpc = (next: VillageNpcId | null) => {
      if (next === nearbyNpcIdRef.current) return;
      nearbyNpcIdRef.current = next;
      setNearbyNpcId(next);
    };
    const setPortal = (next: PendingPortal) => {
      if (next === nearbyPortalIdRef.current) return;
      nearbyPortalIdRef.current = next;
      setNearbyPortalId(next);
    };
    const setHomeStation = (next: NearbyHomeStation) => {
      if (next === homeStationNearbyRef.current) return;
      homeStationNearbyRef.current = next;
      setNearbyHomeStation(next);
    };
    const setBusStop = (next: boolean) => {
      if (next === busStopNearbyRef.current) return;
      busStopNearbyRef.current = next;
      setBusStopNearby(next);
    };

    if (activeMap === 'market') {
      setNpc(null);
      setPortal(null);
      setHomeStation(null);
      setBusStop(false);
      const closest = getNearestMarketStation(marketEnvironmentRef.current, point, marketCashierCalledRef.current)?.id ?? null;
      if (closest !== marketStationNearbyRef.current) {
        marketStationNearbyRef.current = closest;
        setMarketStationNearby(closest);
      }
      return;
    }

    if (marketStationNearbyRef.current) {
      marketStationNearbyRef.current = null;
      setMarketStationNearby(null);
    }

    if (activeMap === 'home') {
      setNpc(null);
      setPortal(null);
      setBusStop(false);
      const stations: Array<[HomeStationId, Point]> = [
        ['fridge', HOME_FRIDGE_POINT],
        ['laundry', HOME_LAUNDRY_POINT],
        ['exit', HOME_EXIT_POINT],
      ];
      let closest: NearbyHomeStation = null;
      let closestDistance = Number.POSITIVE_INFINITY;
      stations.forEach(([station, stationPoint]) => {
        const distance = Math.hypot(point.x - stationPoint.x, point.y - stationPoint.y);
        if (distance <= HOME_STATION_INTERACTION_DISTANCE && distance < closestDistance) {
          closest = station;
          closestDistance = distance;
        }
      });
      setHomeStation(closest);
      return;
    }

    setHomeStation(null);
    let closestNpc: VillageNpcId | null = null;
    let closestNpcDistance = Number.POSITIVE_INFINITY;
    VILLAGE_NPCS.forEach((npc) => {
      const distance = Math.hypot(point.x - npc.point.x, point.y - npc.point.y);
      const limit =
        nearbyNpcIdRef.current === npc.id
          ? VILLAGE_NPC_EXIT_DISTANCE
          : VILLAGE_NPC_INTERACTION_DISTANCE;
      if (distance <= limit && distance < closestNpcDistance && isVillageNavigationSegmentClear(point, npc.point)) {
        closestNpc = npc.id;
        closestNpcDistance = distance;
      }
    });
    setNpc(closestNpc);

    const portalDistances: Array<[VillageGamePortalId, number]> = [
      ['laundry', Math.hypot(point.x - LAUNDRY_ENTRANCE_POINT.x, point.y - LAUNDRY_ENTRANCE_POINT.y)],
      ['cafe', Math.hypot(point.x - CAFE_ENTRANCE_POINT.x, point.y - CAFE_ENTRANCE_POINT.y)],
      [
        'market',
        Math.hypot(point.x - MARKET_ENTRANCE_POINT.x, point.y - MARKET_ENTRANCE_POINT.y),
      ],
      [
        'home',
        Math.hypot(point.x - HOUSE_ENTRANCE_POINT.x, point.y - HOUSE_ENTRANCE_POINT.y),
      ],
    ];
    let closestPortal: PendingPortal = null;
    let closestPortalDistance = Number.POSITIVE_INFINITY;
    portalDistances.forEach(([portal, distance]) => {
      const limit =
        nearbyPortalIdRef.current === portal
          ? VILLAGE_PORTAL_INTERACTION_DISTANCE * 1.18
          : VILLAGE_PORTAL_INTERACTION_DISTANCE;
      const entrance = getVillagePortalPoint(portal);
      if (distance <= limit && distance < closestPortalDistance && isVillageNavigationSegmentClear(point, entrance)) {
        closestPortal = portal;
        closestPortalDistance = distance;
      }
    });
    setPortal(closestPortal);
    setBusStop(
      Math.hypot(point.x - BUS_STOP_POINT.x, point.y - BUS_STOP_POINT.y) <=
        VILLAGE_BUS_STOP_INTERACTION_DISTANCE,
    );
  }, []);

  const syncPlayerAvatarPose = useCallback((x: number, y: number, moving: boolean) => {
    const nextFacing = facingFromVector(x, y, playerFacingRef.current);
    const nextMotion: AvatarMotion = moving && Math.hypot(x, y) >= 0.04
      ? (speedMultiplier.current > 1 ? 'sprint' : 'walk') : 'idle';
    if (nextFacing === playerFacingRef.current && nextMotion === playerMotionRef.current) return;

    playerFacingRef.current = nextFacing;
    playerMotionRef.current = nextMotion;
    setPlayerAvatarPose({ facing: nextFacing, motion: nextMotion });
  }, []);

  const movePlayer = useCallback(
    (dx: number, dy: number, animate = false) => {
      const current = playerPoint.current;
      const activeMap = worldMapRef.current;
      const next = resolveMarketMovement(current, { x: dx, y: dy }, {
        clamp: point => clampPoint(point, activeMap, marketEnvironmentRef.current),
        isBlocked: point => isBlocked(point, activeMap, marketEnvironmentRef.current, marketCashierCalledRef.current),
      }).position;

      if (animate) {
        const movement = getAvatarMovement(current, next, playerFacingRef.current, speedMultiplier.current > 1 ? 'sprint' : 'walk');
        playerWalkCycle.advance(movement.distance);
        if (movement.facing !== playerFacingRef.current || movement.motion !== playerMotionRef.current) {
          playerFacingRef.current = movement.facing;
          playerMotionRef.current = movement.motion;
          setPlayerAvatarPose({ facing: movement.facing, motion: movement.motion });
        }
      }
      playerPoint.current = next;
      if (activeMap === 'market') marketMovementListener.current?.(current, next);
      updateCamera(next);
      updateNpcProximity(next);
      if (activeMap === 'market') {
        const requestedDistance = Math.hypot(dx, dy);
        const movedDistance = Math.hypot(next.x - current.x, next.y - current.y);
        marketTelemetry.current?.observeMovement(
          next,
          controlMode,
          requestedDistance > 0.05 && movedDistance < 0.05,
        );
      }
      return next;
    },
    [controlMode, playerWalkCycle, updateCamera, updateNpcProximity],
  );

  const stopMovement = useCallback(() => {
    if (worldMapRef.current === 'market') marketTelemetry.current?.movementStopped(controlMode);
    direction.current = { x: 0, y: 0 };
    keyboardDirection.current = { x: 0, y: 0 };
    keyboardEngaged.current = false;
    pressedMovementKeys.current.clear();
    keyboardSprintHeld.current = false;
    speedMultiplier.current = movementSettingsRef.current.runMode === 'toggle'
      && movementSettingsRef.current.runEnabled ? RUN_SPEED_MULTIPLIER : 1;
    joystickEngaged.current = false;
    tapTarget.current = null;
    tapWaypoints.current = [];
    pendingNpcInteraction.current = null;
    pendingPortalInteraction.current = null;
    pendingMarketStationInteraction.current = null;
    pendingHomeStationInteraction.current = null;
    pendingBusStopInteraction.current = false;
    previousFrame.current = null;
    syncPlayerAvatarPose(0, 0, false);
    setTapTargetMarker(null);
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }
  }, [controlMode, syncPlayerAvatarPose]);

  const registerMarketTelemetry = useCallback((sink: MarketTelemetrySink | null) => {
    marketTelemetry.current = sink;
  }, []);

  useEffect(() => {
    stopMovement();
    speedMultiplier.current = 1;
    setRunEnabled(false);
  }, [preferences.runMode, stopMovement]);

  const handleExit = useCallback(() => {
    stopMovement();
    if (worldMapRef.current === 'market') {
      setMarketInteractionRequest((request) => ({ id: (request?.id ?? 0) + 1, station: 'give-up' }));
      return;
    }
    if (backgroundMusic.isLoaded) {
      try {
        backgroundMusic.pause();
      } catch {
        // The player may already have been released during a fast refresh.
      }
    }
    onExit();
  }, [backgroundMusic, onExit, stopMovement]);

  const prepareMapTransition = useCallback(() => {
    stopMovement();
    speedMultiplier.current = 1;
    setRunEnabled(false);
    setQuestOfferId(null);
    setInfoPanel(null);
    setFridgeMenuOpen(false);
    setCookingOpen(false);
  }, [stopMovement]);

  const handleVisitCafe = useCallback(() => {
    prepareMapTransition();
    setHudMenuOpen(false);
    setPhoneContact(null);
    setDayPanelOpen(false);
    setErrandPanelOpen(false);
    controlsLockedRef.current = true;
    setCafeOpen(true);
  }, [prepareMapTransition]);

  const handleEnterCafe = useCallback(() => {
    if (nearbyPortalIdRef.current !== 'cafe') return;
    handleVisitCafe();
  }, [handleVisitCafe]);

  const handleLeaveCafe = useCallback(() => {
    prepareMapTransition();
    setCafeOpen(false);
    worldMapRef.current = 'village';
    setWorldMap('village');
    playerPoint.current = { ...CAFE_RETURN_POINT };
    updateCamera(playerPoint.current);
    updateNpcProximity(playerPoint.current);
  }, [prepareMapTransition, updateCamera, updateNpcProximity]);


  const handleHomeLaundry = useCallback(() => {
    prepareMapTransition();
    setHudMenuOpen(false); setPhoneContact(null); setDayPanelOpen(false); setErrandPanelOpen(false);
    if (!getLaundryDraft()) keepLaundryDraft(createLaundrySession());
    setLaundryLocation('home');
  }, [prepareMapTransition]);

  const handleEnterLaundry = useCallback(() => {
    if (nearbyPortalIdRef.current !== 'laundry') return;
    const draft = getLaundryDraft();
    if (!draft || draft.phase === 'packing' || draft.phase === 'finished') {
      prepareMapTransition();
      setInfoPanel({ title: '동네 빨래방', body: '우리 집의 빨래 바구니에서 빨래를 챙겨 오세요.' });
      return;
    }
    prepareMapTransition();
    setHudMenuOpen(false); setDayPanelOpen(false); setErrandPanelOpen(false);
    setLaundryLocation('laundromat');
  }, [prepareMapTransition]);

  const handleLeaveLaundry = useCallback(() => {
    prepareMapTransition();
    setLaundryLocation(null);
    worldMapRef.current = 'village'; setWorldMap('village');
    playerPoint.current = { ...(laundryLocation === 'home' ? HOUSE_RETURN_POINT : LAUNDRY_RETURN_POINT) };
    updateCamera(playerPoint.current); updateNpcProximity(playerPoint.current);
  }, [laundryLocation, prepareMapTransition, updateCamera, updateNpcProximity]);

  const handleLaundryQuest = useCallback(() => {
    prepareMapTransition();
    setHudMenuOpen(false); setDayPanelOpen(false); setErrandPanelOpen(false);
    const draft = getLaundryDraft();
    if (!draft || draft.phase === 'packing' || draft.phase === 'finished') {
      worldMapRef.current = 'home'; setWorldMap('home');
      playerPoint.current = { ...HOME_PLAYER_POINT };
      updateCamera(playerPoint.current); updateNpcProximity(playerPoint.current);
      handleHomeLaundry();
    } else if (worldMapRef.current === 'home' && draft.phase === 'returning') {
      handleHomeLaundry();
    } else {
      setInfoPanel({ title: draft.phase === 'returning' ? '우리 집으로' : '동네 빨래방', body: draft.phase === 'returning'
        ? '마을 오른쪽 아래 우리 집으로 돌아가 옷장에 빨래를 정리해요.'
        : '마을 왼쪽 아래, 마을회관 바로 위의 동네 빨래방으로 가요.' });
    }
  }, [prepareMapTransition, handleHomeLaundry, updateCamera, updateNpcProximity]);

  const handleEnterMarket = useCallback(() => {
    if (nearbyPortalIdRef.current !== 'market') return;
    prepareMapTransition();
    marketAiRequestSequence.current += 1;
    setMarketAiStatus('loading');
    marketVisitNumber.current += 1;
    const pilotQuery = __DEV__ && MARKET_REPLAY_ENABLED && typeof window !== 'undefined' && window.location
      ? new URLSearchParams(window.location.search) : null;
    const fixedPilotEnvironment = pilotEnvironment(__DEV__ && MARKET_REPLAY_ENABLED,
      pilotQuery?.get('marketPilotEnvironment') ?? undefined);
    // This fixture is a starting condition, not a user's manual shelf selection.
    // Keep it out of marketSetupEnvironment so AI rounds may apply their shelf plan.
    const environment = createMarketEnvironment({ ...fixedPilotEnvironment, ...marketSetupEnvironment.current,
      seed: fixedPilotEnvironment?.seed ?? (pilotQuery?.get('marketPilotLayout') || `market-${Date.now()}-${marketVisitNumber.current}`) });
    const request = getShoppingErrand();
    if (request?.phase === 'accepted') {
      const sessionId = `${request.id}-visit-${Date.now()}-${marketVisitNumber.current}`;
      const at = Date.now();
      const startedAt = new Date(at).toISOString();
      dispatchShoppingErrand({ type: 'market-started', sessionId, at });
      setErrandMarketConfig(getShoppingErrandMarketConfig(getShoppingErrand()!, { sessionId, startedAt, seed: environment.seed }));
    } else setErrandMarketConfig(undefined);
    marketEnvironmentRef.current = environment;
    setMarketEnvironment(environment);
    marketCashierCalledRef.current = {};
    setMarketCashierCalled({});
    setMarketScenarioLocked(true);
    worldMapRef.current = 'market';
    // Commit the map's camera and scale together, before its first visible frame.
    outsideMarketZoomRef.current = worldZoomTargetRef.current;
    setWorldMap('market');
    playerPoint.current = { ...environment.spawn };
    updateNpcProximity(playerPoint.current);
  }, [prepareMapTransition, updateNpcProximity]);

  const publishMarketEnvironment = useCallback((environment: MarketEnvironment) => {
    marketEnvironmentRef.current = environment;
    setMarketEnvironment(environment);
    marketCashierCalledRef.current = {};
    setMarketCashierCalled({});
    playerPoint.current = { ...environment.spawn };
    updateCamera(playerPoint.current);
    updateNpcProximity(playerPoint.current);
  }, [updateCamera, updateNpcProximity]);
  applyMarketEnvironment.current = publishMarketEnvironment;
  const handleMarketEnvironmentChange = useCallback((environment: MarketEnvironment, changes?: MarketSetupChanges) => {
    if(changes?.lockedSettings)marketLockedSettings.current={...marketLockedSettings.current,...changes.lockedSettings};
    const categoryPlacementChanged = JSON.stringify(getMarketEnvironmentContext(environment))
      !== JSON.stringify(getMarketEnvironmentContext(marketEnvironmentRef.current));
    const shelfOrderTouched = changes?.shelfOrderTouched
      ?? JSON.stringify(environment.config.shelfOrder) !== JSON.stringify(marketEnvironmentRef.current.config.shelfOrder);
    const { seed: ignoredSeed, shelfOrder: ignoredOrder, ...preferences } = environment.config;
    const previousShelfOrder = marketSetupEnvironment.current.shelfOrder;
    marketSetupEnvironment.current = { ...preferences,
      ...(previousShelfOrder !== undefined ? { shelfOrder: previousShelfOrder } : {}),
      ...(shelfOrderTouched ? { shelfOrder: environment.config.shelfOrder } : {}),
    };
    publishMarketEnvironment(environment);
    if (!changes?.trainingTestTouched && (categoryPlacementChanged || Object.keys(changes?.lockedSettings??{}).length>0) && accessToken && worldMapRef.current === 'market') {
      stopMovement();
      marketAiRequestSequence.current += 1;
      setMarketAiStatus('loading');
      setMarketAiNotice(null);
      setMarketScenarioLocked(true);
      setMarketInteractionRequest(null);
      setMarketAiRetry(value => value + 1);
    }
  }, [accessToken, publishMarketEnvironment, stopMovement]);

  const handleMarketCashierCalled = useCallback((availability: MarketCashierAvailability) => {
    marketCashierCalledRef.current = availability;
    setMarketCashierCalled(availability);
  }, []);

  const handleLeaveMarket = useCallback(() => {
    marketAiRequestSequence.current += 1;
    prepareMapTransition();
    setMarketScenarioLocked(false);
    setMarketInteractionRequest(null);
    worldMapRef.current = 'village';
    setWorldMap('village');
    playerPoint.current = { ...MARKET_RETURN_POINT };
    updateCamera(playerPoint.current);
    updateNpcProximity(playerPoint.current);
  }, [prepareMapTransition, updateCamera, updateNpcProximity]);

  const handleEnterHome = useCallback(() => {
    if (nearbyPortalIdRef.current !== 'home') return;
    prepareMapTransition();
    setMarketScenarioLocked(false);
    worldMapRef.current = 'home';
    setWorldMap('home');
    playerPoint.current = { ...HOME_PLAYER_POINT };
    updateCamera(playerPoint.current);
    updateNpcProximity(playerPoint.current);
    if (getDayJourney().stage === 'home') {
      dispatchDayJourney({ type: 'arrive-home', at: Date.now() });
      setDayPanelOpen(true);
    }
  }, [prepareMapTransition, updateCamera, updateNpcProximity]);

  const handleEnterBus = useCallback(() => {
    if (worldMapRef.current !== 'village' || !busStopNearbyRef.current) return;
    prepareMapTransition();
    setHudMenuOpen(false);
    setPhoneContact(null);
    controlsLockedRef.current = true;
    setBusDestinationOpen(true);
  }, [prepareMapTransition]);

  const handleChooseLibraryDestination = useCallback(() => {
    prepareMapTransition();
    setBusDestinationOpen(false);
    setBusDestinationPresent(false);
    setBusEntryPoint('village-stop');
    controlsLockedRef.current = true;
    const prepared = createBusSession({ destination: 'library', stop: 'village', direction: 'outbound',
      phase: 'waiting', cardPacked: true, routeOpened: true });
    setVillageBusSession(reduceBusSession(prepared, { type: 'ARRIVE_VEHICLE', route: '201' }));
    setVillageDriverReply(null);
    setVillageBusReady(false);
    setVillageRouteOpen(false);
    setVillageBusOpen(true);
  }, [prepareMapTransition]);

  const handleBoardVillageBus = useCallback(() => {
    if (!villageBusSession?.offeredRoute || !villageBusReady) return;
    const boarded = reduceBusSession(villageBusSession, { type: 'BOARD' });
    if (boarded.phase !== 'boarding') return;
    prepareMapTransition();
    setBusInitialSession(boarded);
    setVillageBusOpen(false);
    setVillageBusPresent(false);
    controlsLockedRef.current = true;
    setBusOpen(true);
  }, [prepareMapTransition, villageBusReady, villageBusSession]);

  const handleWaitForVillageBus = useCallback(() => {
    if (!villageBusSession?.offeredRoute || !villageBusReady) return;
    setNextVillageBus(villageBusSession.offeredRoute === '201' ? '305' : '201');
    setVillageBusReady(false);
    setVillageDriverReply(null);
    setVillageBusSession(reduceBusSession(villageBusSession, { type: 'VEHICLE_LEAVE' }));
  }, [villageBusReady, villageBusSession]);

  const handleAskVillageDriver = useCallback(() => {
    if (!villageBusSession?.offeredRoute) return;
    setVillageDriverReply(getDriverReply(villageBusSession));
    setVillageBusSession(reduceBusSession(villageBusSession, { type: 'ASK_HELP', source: 'driver' }));
  }, [villageBusSession]);

  const handleStartLibrary = useCallback(() => {
    prepareMapTransition();
    setBusOpen(false);
    controlsLockedRef.current = true;
    setLibraryOpen(true);
  }, [prepareMapTransition]);

  const handleReturnFromActivity = useCallback(() => {
    prepareMapTransition();
    clearDayBusDraft();
    setBusOpen(false);
    setLibraryOpen(false);
    setBusDestinationOpen(false);
    setBusDestinationPresent(false);
    setVillageBusOpen(false);
    setVillageBusPresent(false);
    setBusInitialSession(undefined);
    worldMapRef.current = 'village';
    setWorldMap('village');
    playerPoint.current = { ...BUS_STOP_POINT };
    updateCamera(playerPoint.current);
    updateNpcProximity(playerPoint.current);
  }, [prepareMapTransition, updateCamera, updateNpcProximity]);

  const handleLeaveLibrary = useCallback(() => {
    prepareMapTransition();
    setLibraryOpen(false);
    setBusEntryPoint('library-exterior');
    setBusInitialSession(undefined);
    controlsLockedRef.current = true;
    setBusOpen(true);
    if (getShoppingErrand()?.phase === 'offered') setErrandPanelOpen(true);
  }, [prepareMapTransition]);

  const handleTravel = useCallback((destination: PhoneTravelDestination) => {
    prepareMapTransition();
    setCafeOpen(false);
    setLaundryLocation(null);
    clearDayBusDraft();
    setHudMenuOpen(false);
    setPhoneContact(null);
    setPhoneCallPresent(false);
    setLibraryOpen(false);
    setCashierOpen(false);
    setBusDestinationOpen(false);
    setBusDestinationPresent(false);
    setVillageBusOpen(false);
    setVillageBusPresent(false);
    setVillageBusSession(null);
    setVillageBusReady(false);
    setVillageRouteOpen(false);
    setBusInitialSession(undefined);
    setMarketScenarioLocked(false);
    setMarketInteractionRequest(null);
    setDialogueIndex(null);
    setDialogueMode(null);
    setDialoguePanelMounted(false);
    closeTransportQuiz();
    setQuizPanelMounted(false);
    worldMapRef.current = 'village';
    setWorldMap('village');
    playerPoint.current = { ...BUS_STOP_POINT };
    updateCamera(playerPoint.current);
    updateNpcProximity(playerPoint.current);
    // A fresh exterior visit cancels the old bus clock and never records a completed trip.
    setBusSceneVisit(visit => visit + 1);
    setBusEntryPoint(destination === 'library' ? 'library-exterior' : 'village-stop');
    setBusOpen(destination === 'library');
    controlsLockedRef.current = destination === 'library';
  }, [closeTransportQuiz, prepareMapTransition, updateCamera, updateNpcProximity]);

  const handleBusComplete = useCallback(() => {
    if (questStatusesRef.current['bus-route'] === 'active') completeDailyQuest('bus-route');
  }, [completeDailyQuest]);
  const handleJourneyComplete = useCallback((session: BusSession) => {
    dispatchDayJourney({ type: 'bus-completed', session });
    recordCompletedBusActivity(session);
  }, []);
  const handleShiftComplete = useCallback((session: LibrarySession) => {
    dispatchDayJourney({ type: 'work-completed', session });
    recordCompletedLibraryActivity(session);
    const result = getLibraryResult(session);
    if (session.phase === 'finished' && result && result.correctlyShelved + result.handedOff === result.total && result.visitorsResolved === result.visitorsTotal)
      offerShoppingErrand(session.sessionId);
  }, []);
  const handleMarketEpisodeComplete = useCallback((episode: MarketStoredEpisode) => {
    dispatchShoppingErrand({ type: 'market-finished', episode });
    if (episode.paid && episode.outcome === 'success' && episode.events.some(event => event.type === 'purchase_submitted')) {
      const items = Object.entries(episode.finalCart);
      const finishedAt = Date.parse(episode.events.findLast(event => event.type === 'session_finished')?.timestamp ?? '');
      recordCompletedShoppingActivity({ sessionId: episode.sessionId, completedAt: Number.isFinite(finishedAt) ? finishedAt : Date.now(),
        itemCount: items.reduce((count, [, quantity]) => count + quantity, 0),
        totalAmount: items.reduce((sum, [id, quantity]) => sum + (getMarketProduct(id)?.price ?? 0) * quantity, 0),
        checkoutKind: episode.selectedKioskId ? 'kiosk' : 'staff' });
    }
  }, []);
  const handleErrandAction = useCallback((action: ShoppingErrandAction) => {
    const before = getShoppingErrand();
    if (action.type === 'deliver' && (worldMapRef.current !== 'village' || nearbyNpcIdRef.current !== 'minsu')) return;
    const next = dispatchShoppingErrand(action);
    if (next?.phase === 'delivered' && before?.phase !== 'delivered') {
      const contents = Object.entries(next.purchase!.cart);
      recordCompletedDeliveryActivity({ sessionId: next.id, completedAt: Date.now(), recipient: '민수',
        itemCount: contents.reduce((count, [, quantity]) => count + quantity, 0),
        items: contents.map(([id, quantity]) => `${getMarketProduct(id)!.name} ${quantity}개`) });
    }
    if (action.type === 'accept' || action.type === 'defer') setErrandPanelOpen(false);
  }, []);

  const handleLeaveHome = useCallback(() => {
    prepareMapTransition();
    worldMapRef.current = 'village';
    setWorldMap('village');
    playerPoint.current = { ...HOUSE_RETURN_POINT };
    updateCamera(playerPoint.current);
    updateNpcProximity(playerPoint.current);
  }, [prepareMapTransition, updateCamera, updateNpcProximity]);

  const handleEmergencyExit = useCallback(() => {
    prepareMapTransition();
    const activeMap = worldMapRef.current;
    playerPoint.current = activeMap === 'market'
      ? getMarketRecoveryPoint(marketEnvironmentRef.current, playerPoint.current, marketCashierCalledRef.current)
        ?? { ...playerPoint.current }
      : { ...(activeMap === 'home' ? HOME_PLAYER_POINT : INITIAL_PLAYER_POINT) };
    updateCamera(playerPoint.current);
    updateNpcProximity(playerPoint.current);
  }, [prepareMapTransition, updateCamera, updateNpcProximity]);

  const handleHudMenuVisibilityChange = useCallback((open: boolean) => {
    if (open) stopMovement();
    setHudMenuOpen(open);
  }, [stopMovement]);

  const openFridgeMenu = useCallback(() => {
    stopMovement();
    setInfoPanel(null);
    setFridgeMenuOpen(true);
  }, [stopMovement]);

  const inspectFridge = useCallback(() => {
    setFridgeMenuOpen(false);
    completeDailyQuest('home-fridge');
    setInfoPanel({
      body: '유통기한이 가까운 우유와 부족한 사과를 장보기 목록에 적었어요.',
      title: '냉장고를 확인했어요',
    });
  }, [completeDailyQuest]);

  const startCooking = useCallback(() => {
    stopMovement();
    setFridgeMenuOpen(false);
    setCookingOpen(true);
  }, [stopMovement]);

  const runMovement = useCallback(
    (timestamp: number) => {
      if (controlsLockedRef.current) {
        stopMovement();
        return;
      }

      const last = previousFrame.current ?? timestamp;
      const elapsedSeconds = Math.min(timestamp - last, 32) / 1000;
      previousFrame.current = timestamp;
      let replayInput: ReplayDirectionalInput | null = null;
      if (__DEV__ && MARKET_REPLAY_ENABLED && replayFrame.current) {
        replayInput = replayFrame.current(timestamp, elapsedSeconds);
        direction.current = replayInput;
      }
      const target = tapTarget.current;

      if (target) {
        const current = playerPoint.current;
        const dx = target.x - current.x;
        const dy = target.y - current.y;
        const distance = Math.hypot(dx, dy);
        const pendingNpc = pendingNpcInteraction.current;
        const npcInteractionReached =
          pendingNpc !== null && nearbyNpcIdRef.current === pendingNpc;
        const pendingPortal = pendingPortalInteraction.current;
        const portalInteractionReached =
          pendingPortal !== null && nearbyPortalIdRef.current === pendingPortal;
        const pendingMarketStation = pendingMarketStationInteraction.current;
        const marketStationInteractionReached =
          pendingMarketStation !== null &&
          marketStationNearbyRef.current === pendingMarketStation;
        const pendingHomeStation = pendingHomeStationInteraction.current;
        const homeStationInteractionReached =
          pendingHomeStation !== null && homeStationNearbyRef.current === pendingHomeStation;
        const busStopInteractionReached =
          pendingBusStopInteraction.current && busStopNearbyRef.current && !tapWaypoints.current.length && distance <= 3;

        if (distance <= 3 && tapWaypoints.current.length && !marketStationInteractionReached) {
          movePlayer(dx, dy, true);
          tapTarget.current = tapWaypoints.current.shift()!;
          animationFrame.current = requestAnimationFrame(runMovement);
          return;
        }
        if (
          distance <= 3 ||
          npcInteractionReached ||
          portalInteractionReached ||
          marketStationInteractionReached ||
          homeStationInteractionReached ||
          busStopInteractionReached
        ) {
          const npcToOpen = npcInteractionReached ? pendingNpc : null;
          const portalToUse = portalInteractionReached ? pendingPortal : null;
          const marketStationToUse = marketStationInteractionReached
            ? pendingMarketStation
            : null;
          const homeStationToUse = homeStationInteractionReached ? pendingHomeStation : null;
          const shouldCheckBusStop = busStopInteractionReached;
          tapTarget.current = null;
          pendingNpcInteraction.current = null;
          pendingPortalInteraction.current = null;
          pendingMarketStationInteraction.current = null;
          pendingHomeStationInteraction.current = null;
          pendingBusStopInteraction.current = false;
          previousFrame.current = null;
          animationFrame.current = null;
          setTapTargetMarker(null);
          syncPlayerAvatarPose(0, 0, false);

          if (npcToOpen) startNpcGreetingRef.current(npcToOpen);
          if (portalToUse === 'market') handleEnterMarket();
          if (portalToUse === 'cafe') handleEnterCafe();
          if (portalToUse === 'laundry') handleEnterLaundry();
          if (portalToUse === 'home') handleEnterHome();
          if (marketStationToUse) {
            setMarketInteractionRequest((currentRequest) => ({
              id: (currentRequest?.id ?? 0) + 1,
              station: marketStationToUse,
            }));
          }
          if (homeStationToUse === 'exit') handleLeaveHome();
          if (homeStationToUse === 'laundry') handleHomeLaundry();
          if (homeStationToUse === 'fridge') {
            openFridgeMenu();
          }
          if (shouldCheckBusStop) {
            handleEnterBus();
          }
          return;
        }

        const step = Math.min(distance, MOVE_SPEED * speedMultiplier.current * elapsedSeconds);
        const next = movePlayer((dx / distance) * step, (dy / distance) * step, true);
        const moved = Math.hypot(next.x - current.x, next.y - current.y);
        if (step > 0 && moved < 0.05) {
          tapTarget.current = null;
          pendingNpcInteraction.current = null;
          pendingPortalInteraction.current = null;
          pendingMarketStationInteraction.current = null;
          pendingHomeStationInteraction.current = null;
          pendingBusStopInteraction.current = false;
          previousFrame.current = null;
          animationFrame.current = null;
          setTapTargetMarker(null);
          syncPlayerAvatarPose(0, 0, false);
          return;
        }
        animationFrame.current = requestAnimationFrame(runMovement);
        return;
      }

      if (replayInput?.directionalSlices) {
        // Preserve canonical collision samples regardless of the display's frame rate.
        for (const slice of replayInput.directionalSlices) {
          movePlayer(slice.input.x * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000,
            slice.input.y * MARKET_DIRECTIONAL_MOVE_SPEED * slice.durationMs / 1000, true);
        }
      } else {
        const combinedX = direction.current.x + keyboardDirection.current.x;
        const combinedY = direction.current.y + keyboardDirection.current.y;
        const combinedLength = Math.hypot(combinedX, combinedY);
        const movementScale = combinedLength > 1 ? 1 / combinedLength : 1;
        movePlayer(
          combinedX * movementScale * MOVE_SPEED * speedMultiplier.current * elapsedSeconds,
          combinedY * movementScale * MOVE_SPEED * speedMultiplier.current * elapsedSeconds,
          true,
        );
      }
      if (joystickEngaged.current || keyboardEngaged.current) {
        animationFrame.current = requestAnimationFrame(runMovement);
      } else {
        previousFrame.current = null;
        animationFrame.current = null;
      }
    },
    [
      handleEnterHome,
      handleEnterCafe,
      handleEnterLaundry,
      handleHomeLaundry,
      handleEnterBus,
      handleEnterMarket,
      handleLeaveHome,
      handleLeaveMarket,
      openFridgeMenu,
      movePlayer,
      stopMovement,
      syncPlayerAvatarPose,
    ],
  );

  const beginMovement = useCallback(() => {
    if (animationFrame.current === null) {
      animationFrame.current = requestAnimationFrame(runMovement);
    }
  }, [runMovement]);

  function replayPresentation(): ReplayPresentation {
    return { viewport: { width: viewport.current.width, height: viewport.current.height }, zoom: worldZoomCurrentRef.current,
      ...marketCameraMetrics.current };
  }
  if (__DEV__ && MARKET_REPLAY_ENABLED) {
    replayMotion.current = {
      read: () => ({ position: { ...playerPoint.current }, environment: marketEnvironmentRef.current,
        cashiers: marketCashierCalledRef.current, locked: controlsLockedRef.current, presentation: replayPresentation() }),
      drive: frame => {
        stopMovement();
        selectControlMode('joystick');
        speedMultiplier.current = 1;
        replayFrame.current = frame;
        joystickEngaged.current = true;
        beginMovement();
      },
      stop: () => { replayFrame.current = null; stopMovement(); },
    };
  }
  useEffect(() => {
    if (!__DEV__ || !MARKET_REPLAY_ENABLED) return;
    let active = true, disconnect: (() => void) | undefined;
    void import('../replay/connection').then(async ({ connectMarketReplay }) => {
      if (!active) return;
      const cleanup = await connectMarketReplay({ accessToken, ui: () => replayUi.current,
        motion: () => replayMotion.current!, status: text => { if (active) setReplayStatus(text); } });
      if (active) disconnect = cleanup; else cleanup();
    }).catch(error => { if (active) setReplayStatus(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; disconnect?.(); };
  }, [accessToken]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;

    const syncKeyboardDirection = () => {
      let x = 0;
      let y = 0;
      pressedMovementKeys.current.forEach((code) => {
        const vector = WEB_MOVEMENT_KEYS[code];
        if (!vector) return;
        x += vector.x;
        y += vector.y;
      });
      const length = Math.hypot(x, y);
      keyboardDirection.current =
        length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
      keyboardEngaged.current = length > 0;
      if (keyboardEngaged.current || !joystickEngaged.current) speedMultiplier.current = (keyboardEngaged.current && keyboardSprintHeld.current) || (
        movementSettingsRef.current.runMode === 'toggle' && movementSettingsRef.current.runEnabled
      ) ? RUN_SPEED_MULTIPLIER : 1;
    };

    const isEditableTarget = (target: EventTarget | null) => {
      const element = target as { isContentEditable?: boolean; tagName?: string } | null;
      const tagName = element?.tagName?.toUpperCase();
      return (
        element?.isContentEditable ||
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT'
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const isShift = event.code === 'ShiftLeft' || event.code === 'ShiftRight';
      if (
        (!WEB_MOVEMENT_KEYS[event.code] && !isShift) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      if (controlsLockedRef.current) return;

      if (isShift) {
        keyboardSprintHeld.current = true;
        syncKeyboardDirection();
        return;
      }
      if (pressedMovementKeys.current.size === 0) stopMovement();
      // Read the modifier after stopMovement, including Shift held before the first WASD key.
      keyboardSprintHeld.current = event.shiftKey;
      pressedMovementKeys.current.add(event.code);
      syncKeyboardDirection();
      beginMovement();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const isShift = event.code === 'ShiftLeft' || event.code === 'ShiftRight';
      if (!WEB_MOVEMENT_KEYS[event.code] && !isShift) return;
      event.preventDefault();
      // shiftKey remains true when the other physical Shift key is still held.
      keyboardSprintHeld.current = event.shiftKey;
      pressedMovementKeys.current.delete(event.code);
      syncKeyboardDirection();
      if (keyboardEngaged.current && !controlsLockedRef.current) beginMovement();
    };

    const handleWindowBlur = () => stopMovement();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      pressedMovementKeys.current.clear();
      keyboardSprintHeld.current = false;
      keyboardDirection.current = { x: 0, y: 0 };
      keyboardEngaged.current = false;
    };
  }, [beginMovement, stopMovement]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;

    const handleWheel = (event: WheelEvent) => {
      const origin = viewportOrigin.current;
      const size = viewport.current;
      const insideViewport =
        event.clientX >= origin.x &&
        event.clientX <= origin.x + size.width &&
        event.clientY >= origin.y &&
        event.clientY <= origin.y + size.height;
      if (!insideViewport || controlsLockedRef.current) return;

      event.preventDefault();
      const deltaPixels =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * Math.max(size.height, 1)
            : event.deltaY;
      const nextZoom = zoomFromWheel(worldZoomTargetRef.current, deltaPixels,
        worldMapRef.current === 'market' ? MARKET_DEFAULT_ZOOM : WORLD_ZOOM_MIN);
      worldZoomTargetRef.current = nextZoom;
      worldZoom.stopAnimation();
      Animated.timing(worldZoom, {
        duration: reduceMotionEnabled ? 0 : 150,
        easing: Easing.out(Easing.cubic),
        toValue: nextZoom,
        useNativeDriver: true,
      }).start();
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [reduceMotionEnabled, worldZoom]);

  const handleJoystickStart = useCallback(() => {
    stopMovement();
    joystickEngaged.current = true;
    beginMovement();
  }, [beginMovement, stopMovement]);
  const handleJoystickMove = useCallback((input: GameMovementInput) => {
    if (controlsLockedRef.current) return;
    direction.current = { x: input.x, y: input.y };
    speedMultiplier.current = input.running ? RUN_SPEED_MULTIPLIER : 1;
    beginMovement();
  }, [beginMovement]);

  const finishPinchZoom = useCallback(() => {
    zoomGestureActiveRef.current = false;
    const settledZoom = clampWorldZoom(worldZoomCurrentRef.current,
      worldMapRef.current === 'market' ? MARKET_DEFAULT_ZOOM : WORLD_ZOOM_MIN);
    worldZoomCurrentRef.current = settledZoom;
    worldZoomTargetRef.current = settledZoom;
    worldZoom.setValue(settledZoom);
    requestAnimationFrame(() => {
      suppressWorldPressRef.current = false;
    });
  }, [worldZoom]);

  const pinchZoomResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (event) =>
        Platform.OS !== 'web' &&
        event.nativeEvent.touches.length >= 2 &&
        !controlsLockedRef.current,
      onPanResponderGrant: (event) => {
        const distance = touchDistance(event.nativeEvent.touches);
        if (distance <= 0) return;
        suppressWorldPressRef.current = true;
        zoomGestureActiveRef.current = true;
        touchHoldActivated.current = false;
        pinchStartDistanceRef.current = distance;
        pinchStartZoomRef.current = worldZoomCurrentRef.current;
        worldZoom.stopAnimation();
        stopMovement();
      },
      onPanResponderMove: (event) => {
        if (!zoomGestureActiveRef.current || controlsLockedRef.current) return;
        const touches = event.nativeEvent.touches;
        if (touches.length < 2) return;
        const distance = touchDistance(touches);
        if (distance <= 0) return;
        const nextZoom = zoomFromPinch(
          pinchStartZoomRef.current,
          pinchStartDistanceRef.current,
          distance,
          worldMapRef.current === 'market' ? MARKET_DEFAULT_ZOOM : WORLD_ZOOM_MIN,
        );
        worldZoomCurrentRef.current = nextZoom;
        worldZoomTargetRef.current = nextZoom;
        worldZoom.setValue(nextZoom);
      },
      onPanResponderRelease: finishPinchZoom,
      onPanResponderTerminate: finishPinchZoom,
      onPanResponderTerminationRequest: () => false,
      onStartShouldSetPanResponderCapture: (event) =>
        Platform.OS !== 'web' &&
        event.nativeEvent.touches.length >= 2 &&
        !controlsLockedRef.current,
    }),
  ).current;

  useEffect(
    () => () => {
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    },
    [],
  );

  useEffect(() => {
    updateNpcProximity(playerPoint.current);
  }, [updateNpcProximity]);

  useEffect(() => {
    if (dialogueIndex === null) return undefined;
    if (visibleDialogueCharacters >= currentDialogue.length) {
      if (!Number.isFinite(dialogueReadyAt.current)) {
        dialogueReadyAt.current = Date.now() + DIALOGUE_READ_DELAY;
      }
      return undefined;
    }

    if (reduceMotionEnabled) {
      setVisibleDialogueCharacters(currentDialogue.length);
      return undefined;
    }
    const timer = setTimeout(() => {
      dialogueAudio.playCharacter(currentDialogue[visibleDialogueCharacters]);
      setVisibleDialogueCharacters((count) => Math.min(count + 1, currentDialogue.length));
    }, DIALOGUE_CHARACTER_DELAY);
    return () => clearTimeout(timer);
  }, [currentDialogue, dialogueAudio.playCharacter, dialogueIndex, reduceMotionEnabled, visibleDialogueCharacters]);

  useEffect(() => {
    dailyChoiceProgress.stopAnimation();
    if (!dialogueChoiceVisible) {
      dailyChoiceProgress.setValue(0);
      return undefined;
    }

    if (reduceMotionEnabled) {
      dailyChoiceProgress.setValue(1);
      return undefined;
    }

    dailyChoiceProgress.setValue(0);
    const animation = Animated.timing(dailyChoiceProgress, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [dailyChoiceProgress, dialogueChoiceVisible, reduceMotionEnabled]);

  useEffect(() => {
    let mounted = true;
    void setAudioModeAsync({
      allowsRecording: false,
      interruptionMode: 'mixWithOthers',
      playsInSilentMode: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    })
      .then(() => {
        if (mounted) setAudioModeReady(true);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const listenerId = worldZoom.addListener(({ value }) => {
      worldZoomCurrentRef.current = value;
      updateCamera(playerPoint.current);
    });
    return () => {
      worldZoom.removeListener(listenerId);
      worldZoom.stopAnimation();
    };
  }, [worldZoom, updateCamera]);

  useLayoutEffect(() => {
    if (worldMap !== 'market') return;
    worldZoom.stopAnimation();
    worldZoomTargetRef.current = MARKET_DEFAULT_ZOOM;
    worldZoomCurrentRef.current = MARKET_DEFAULT_ZOOM;
    worldZoom.setValue(MARKET_DEFAULT_ZOOM);
    updateCamera(playerPoint.current);
  }, [worldMap, updateCamera, worldZoom]);

  useEffect(() => {
    const previousMap = previousZoomMapRef.current;
    previousZoomMapRef.current = worldMap;
    if (previousMap === worldMap) return;
    if (worldMap !== 'market' && previousMap !== 'market') return;
    // Entering was already placed synchronously by handleEnterMarket.
    if (worldMap === 'market') return;
    const target = outsideMarketZoomRef.current;
    worldZoomTargetRef.current = target;
    worldZoom.stopAnimation();
    Animated.timing(worldZoom, {
      toValue: target,
      duration: reduceMotionEnabled ? 0 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduceMotionEnabled, worldMap, worldZoom]);

  useEffect(() => {
    clearSoundTimers.current.forEach(clearTimeout);
    clearSoundTimers.current = [];
    if (DEVELOPMENT_AUDIO_MUTED || !audioModeReady || quizStep !== 'result' || effectsVolumeRef.current === 0) return undefined;
    let cancelled = false;
    const generation = ++clearSoundGeneration.current;
    const notes = dialogueAudio.voices.map((voice, index) => ({ ...voice, delay: index * 85 }));
    clearSoundTimers.current = notes.map(({ delay, isLoaded, player }) =>
      setTimeout(() => {
        if (cancelled || generation !== clearSoundGeneration.current || DEVELOPMENT_AUDIO_MUTED || !isLoaded || effectsVolumeRef.current === 0) return;
        player.volume = DIALOGUE_CLEAR_VOLUME * effectsVolumeRef.current;
        player.shouldCorrectPitch = false;
        player.setPlaybackRate(1);
        void player.seekTo(0).then(() => {
          if (!cancelled && generation === clearSoundGeneration.current && !DEVELOPMENT_AUDIO_MUTED && effectsVolumeRef.current > 0) player.play();
        }).catch(() => undefined);
      }, delay),
    );
    return () => {
      cancelled = true;
      clearSoundTimers.current.forEach(clearTimeout);
      clearSoundTimers.current = [];
      notes.forEach(({ player }) => {
        try { player.pause(); } catch { /* The player may already be released. */ }
      });
    };
  }, [audioModeReady, dialogueAudio.voices, DEVELOPMENT_AUDIO_MUTED, quizStep]);

  useEffect(() => {
    if (quizStep !== 'result') return;
    if (DEVELOPMENT_AUDIO_MUTED || preferences.effectsVolume === 0) {
      clearSoundGeneration.current += 1;
      clearSoundTimers.current.forEach(clearTimeout);
      clearSoundTimers.current = [];
      dialogueAudio.voices.forEach(({ player }) => { try { player.pause(); } catch { /* Released native player. */ } });
    }
    dialogueAudio.voices.forEach(({ player }) => {
      try { player.volume = DEVELOPMENT_AUDIO_MUTED ? 0 : DIALOGUE_CLEAR_VOLUME * preferences.effectsVolume; } catch { /* Released native player. */ }
    });
  }, [DEVELOPMENT_AUDIO_MUTED, dialogueAudio.voices, preferences.effectsVolume, quizStep]);

  useEffect(() => {
    resultCelebration.stopAnimation();
    if (transportQuiz.stage !== 'result') {
      resultCelebration.setValue(0);
      return;
    }
    resultCelebration.setValue(0);
    if (reduceMotionEnabled) {
      resultCelebration.setValue(1);
      return;
    }
    Animated.timing(resultCelebration, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [transportQuiz.stage, reduceMotionEnabled, resultCelebration]);

  useEffect(() => {
    dialoguePanelProgress.stopAnimation();
    if (dialogueIndex !== null) {
      setRenderedDialogueIndex(dialogueIndex);
      setDialoguePanelMounted(true);
      dialoguePanelProgress.setValue(0);
      if (reduceMotionEnabled) {
        dialoguePanelProgress.setValue(1);
        return;
      }
      Animated.spring(dialoguePanelProgress, {
        damping: 16,
        mass: 0.72,
        stiffness: 175,
        toValue: 1,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (dialoguePanelMounted) {
      if (reduceMotionEnabled) {
        dialoguePanelProgress.setValue(0);
        setDialoguePanelMounted(false);
        return;
      }
      Animated.timing(dialoguePanelProgress, {
        duration: 170,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setDialoguePanelMounted(false);
      });
    }
  }, [dialogueIndex, dialoguePanelProgress, reduceMotionEnabled]);

  useEffect(() => {
    quizPanelProgress.stopAnimation();
    if (transportQuiz.stage !== 'idle') {
      setRenderedQuizStep(transportQuiz.stage);
      if (!quizPanelMounted) {
        setQuizPanelMounted(true);
        quizPanelProgress.setValue(0);
        if (reduceMotionEnabled) {
          quizPanelProgress.setValue(1);
          return;
        }
        Animated.spring(quizPanelProgress, {
          damping: 18,
          mass: 0.78,
          stiffness: 165,
          toValue: 1,
          useNativeDriver: true,
        }).start();
      }
      return;
    }

    if (quizPanelMounted) {
      if (reduceMotionEnabled) {
        quizPanelProgress.setValue(0);
        setQuizPanelMounted(false);
        return;
      }
      Animated.timing(quizPanelProgress, {
        duration: 190,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setQuizPanelMounted(false);
      });
    }
  }, [quizPanelProgress, reduceMotionEnabled, transportQuiz.stage]);

  useEffect(() => {
    speakerTagFloat.stopAnimation();
    speakerTagFloat.setValue(0);

    if (reduceMotionEnabled || (!dialoguePanelMounted && !quizPanelMounted)) {
      return undefined;
    }

    const floatingAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(speakerTagFloat, {
          duration: 550,
          easing: Easing.inOut(Easing.sin),
          toValue: -2.25,
          useNativeDriver: true,
        }),
        Animated.timing(speakerTagFloat, {
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          toValue: 2.25,
          useNativeDriver: true,
        }),
        Animated.timing(speakerTagFloat, {
          duration: 550,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    floatingAnimation.start();
    return () => {
      floatingAnimation.stop();
      speakerTagFloat.stopAnimation();
      speakerTagFloat.setValue(0);
    };
  }, [dialoguePanelMounted, quizPanelMounted, reduceMotionEnabled, speakerTagFloat]);

  useEffect(() => {
    dialogueArrowFloat.stopAnimation();
    dialogueArrowFloat.setValue(0);

    if (reduceMotionEnabled || (!dialoguePanelMounted && !quizPanelMounted)) {
      return undefined;
    }

    const arrowAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(dialogueArrowFloat, {
          duration: 800,
          easing: Easing.inOut(Easing.sin),
          toValue: 1.75,
          useNativeDriver: true,
        }),
        Animated.timing(dialogueArrowFloat, {
          duration: 800,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    arrowAnimation.start();
    return () => {
      arrowAnimation.stop();
      dialogueArrowFloat.stopAnimation();
      dialogueArrowFloat.setValue(0);
    };
  }, [dialogueArrowFloat, dialoguePanelMounted, quizPanelMounted, reduceMotionEnabled]);

  const handleViewportLayout = (event: LayoutChangeEvent) => {
    viewport.current = event.nativeEvent.layout;
    viewportCenterAnimation.setValue({ x: viewport.current.width / 2, y: viewport.current.height / 2 });
    viewportNode.current?.measureInWindow((x, y) => {
      viewportOrigin.current = { x, y };
    });
    updateCamera(playerPoint.current);
    updateNpcProximity(playerPoint.current);
  };

  const handleAccessibilityMove = (actionName: string) => {
    if (controlsLockedRef.current) return;
    if (actionName === 'moveUp') {
      syncPlayerAvatarPose(0, -1, false);
      movePlayer(0, -ACCESSIBILITY_STEP);
    }
    if (actionName === 'moveDown') {
      syncPlayerAvatarPose(0, 1, false);
      movePlayer(0, ACCESSIBILITY_STEP);
    }
    if (actionName === 'moveLeft') {
      syncPlayerAvatarPose(-1, 0, false);
      movePlayer(-ACCESSIBILITY_STEP, 0);
    }
    if (actionName === 'moveRight') {
      syncPlayerAvatarPose(1, 0, false);
      movePlayer(ACCESSIBILITY_STEP, 0);
    }
  };

  const startDialogue = (
    npcId: VillageNpcId,
    steps: readonly DialogueStep[],
    mode: Exclude<DialogueMode, null>,
  ) => {
    stopMovement();
    speedMultiplier.current = 1;
    setRunEnabled(false);
    setQuestOfferId(null);
    setDialogueNpcId(npcId);
    setDialogueMode(mode);
    setActiveDialogueSteps(steps);
    dialogueReadyAt.current = Number.POSITIVE_INFINITY;
    setVisibleDialogueCharacters(0);
    setSelectedDailyChoice(null);
    setDialogueIndex(0);
  };

  const startSmallTalk = (npcId: VillageNpcId, skipGreeting = false) => {
    const npc = VILLAGE_NPC_BY_ID[npcId];
    const lines = skipGreeting ? npc.smallTalk.slice(1) : npc.smallTalk;
    if (lines.length === 0) {
      setDialogueIndex(null);
      setDialogueMode(null);
      return;
    }
    startDialogue(
      npcId,
      lines.map((text) => ({ kind: 'line' as const, text })),
      'small-talk',
    );
  };

  const startMinsuQuestDialogue = () => {
    if (questStatusesRef.current['minsu-safety'] !== 'active') return;
    startDialogue('minsu', dialogueSteps, 'minsu-quest');
  };

  const startNpcGreeting = (npcId: VillageNpcId) => {
    if (nearbyNpcIdRef.current !== npcId) return;
    const npc = VILLAGE_NPC_BY_ID[npcId];
    const questId = NPC_QUEST_IDS[npcId];
    const options: { id: NpcInteractionChoice; label: string }[] = [
      { id: 'npc-talk', label: '대화하기' },
    ];
    if (questId) {
      const questStatus = questStatusesRef.current[questId];
      options.push({
        id: 'npc-quest',
        label:
          questStatus === 'available'
            ? '퀘스트 받기'
            : questStatus === 'active'
              ? '퀘스트 진행하기'
              : '완료한 퀘스트',
      });
    }
    if (npcId === 'jiyoung') {
      options.push({ id: 'npc-cashier', label: '계산 알바 연습' });
    }
    if (npcId === 'minsu') options.unshift({ id: 'npc-errand', label: getShoppingErrand()?.phase === 'ready' ? '부탁한 물건 전달하기' : '퇴근길 장보기 부탁' });
    const safety = getPhishingSession();
    if (safety?.status === 'active') {
      if (npcId === 'minsu' && safety.scenarioId.startsWith('friend-') && !safety.verification) options.unshift({ id: 'npc-safety', label: '이 연락 네가 보냈어?' });
      if (npcId === 'jiyoung') options.unshift({ id: 'npc-safety', label: '수상한 연락, 같이 봐 줄래?' });
    }
    startDialogue(
      npcId,
      [
        { kind: 'line', text: npc.smallTalk[0] ?? `${npc.name}이 반갑게 인사했어요.` },
        { kind: 'choice', options, purpose: 'npc-action', text: '무엇을 할까요?' },
      ],
      'npc-greeting',
    );
  };
  startNpcGreetingRef.current = startNpcGreeting;

  const openQuiz = () => {
    if (dialogueMode !== 'minsu-quest') return;
    stopMovement();
    speedMultiplier.current = 1;
    setRunEnabled(false);
    setDialogueIndex(null);
    setDialogueMode(null);
    void transportQuiz.open();
  };

  const startTapMovement = (
    desired: Point,
    interaction: TapInteractionOptions = {},
  ) => {
    if (controlsLockedRef.current) return;
    stopMovement();
    const activeMap = worldMapRef.current;
    const target = activeMap === 'village' ? desired
      : findReachableTarget(playerPoint.current, desired, activeMap, marketEnvironmentRef.current, marketCashierCalledRef.current);
    if (Math.hypot(target.x - playerPoint.current.x, target.y - playerPoint.current.y) < 2) return;
    const path = activeMap === 'village' ? getVillageNavigationPath(playerPoint.current, target)
      : activeMap === 'market'
        ? getMarketNavigationPath(marketEnvironmentRef.current, playerPoint.current, target, marketCashierCalledRef.current)
        : [target];
    if (!path?.length) return;
    tapTarget.current = path[0];
    tapWaypoints.current = path.slice(1);
    pendingNpcInteraction.current = interaction.npcId ?? null;
    pendingPortalInteraction.current = interaction.portalId ?? null;
    pendingMarketStationInteraction.current = interaction.marketStation ?? null;
    pendingHomeStationInteraction.current = interaction.homeStation ?? null;
    pendingBusStopInteraction.current = interaction.busStop ?? false;
    setTapTargetMarker(path[path.length - 1]);
    beginMovement();
  };

  const getTouchedWorldPoint = (event: GestureResponderEvent) => {
    const { locationX, locationY, pageX, pageY } = event.nativeEvent;
    const localX = Number.isFinite(pageX) ? pageX - viewportOrigin.current.x : locationX;
    const localY = Number.isFinite(pageY) ? pageY - viewportOrigin.current.y : locationY;
    const safeX = Math.max(0, Math.min(localX, viewport.current.width));
    const safeY = Math.max(0, Math.min(localY, viewport.current.height));
    return screenPointToWorld(
      { x: safeX, y: safeY },
      cameraCenter.current,
      viewport.current,
      worldZoomCurrentRef.current,
    );
  };

  const handleWorldPressIn = () => {
    if (
      controlMode !== 'touch' ||
      controlsLockedRef.current ||
      zoomGestureActiveRef.current ||
      suppressWorldPressRef.current
    ) {
      return;
    }
    touchHoldActivated.current = false;
  };

  const handleWorldLongPress = (event: GestureResponderEvent) => {
    if (
      controlMode !== 'touch' ||
      controlsLockedRef.current ||
      zoomGestureActiveRef.current ||
      suppressWorldPressRef.current
    ) {
      return;
    }
    const current = playerPoint.current;
    const desired = getTouchedWorldPoint(event);
    const dx = desired.x - current.x;
    const dy = desired.y - current.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 8) return;

    stopMovement();
    touchHoldActivated.current = true;
    direction.current = { x: dx / distance, y: dy / distance };
    joystickEngaged.current = true;
    setTapTargetMarker(desired);
    beginMovement();
  };

  const handleWorldPressOut = () => {
    if (zoomGestureActiveRef.current || suppressWorldPressRef.current) {
      touchHoldActivated.current = false;
      return;
    }
    if (!touchHoldActivated.current) return;
    stopMovement();
  };

  const handleWorldPress = (event: GestureResponderEvent) => {
    if (
      controlMode !== 'touch' ||
      controlsLockedRef.current ||
      zoomGestureActiveRef.current ||
      suppressWorldPressRef.current
    ) {
      return;
    }
    if (touchHoldActivated.current) {
      touchHoldActivated.current = false;
      return;
    }
    startTapMovement(getTouchedWorldPoint(event));
  };

  const handleNpcPress = (event: GestureResponderEvent, npc: VillageNpcDefinition) => {
    event?.stopPropagation?.();
    if (
      controlMode !== 'touch' ||
      controlsLockedRef.current ||
      zoomGestureActiveRef.current ||
      suppressWorldPressRef.current
    ) {
      return;
    }
    if (nearbyNpcIdRef.current === npc.id) {
      startNpcGreeting(npc.id);
      return;
    }

    // Route to the actual contact point; the clear, nearby approach ends the walk.
    startTapMovement(npc.point, { npcId: npc.id });
  };

  const handlePortalPress = (
    event: GestureResponderEvent,
    portalId: VillageGamePortalId,
  ) => {
    event?.stopPropagation?.();
    if (
      controlMode !== 'touch' ||
      controlsLockedRef.current ||
      zoomGestureActiveRef.current ||
      suppressWorldPressRef.current
    ) return;
    if (nearbyPortalIdRef.current === portalId) {
      if (portalId === 'market') handleEnterMarket();
      else if (portalId === 'cafe') handleEnterCafe();
      else if (portalId === 'laundry') handleEnterLaundry();
      else handleEnterHome();
      return;
    }

    const portalPoint = getVillagePortalPoint(portalId);
    startTapMovement(portalPoint, { portalId });
  };

  const handleHomeStationPress = (
    event: GestureResponderEvent,
    station: HomeStationId,
  ) => {
    event?.stopPropagation?.();
    if (
      controlMode !== 'touch' ||
      controlsLockedRef.current ||
      zoomGestureActiveRef.current ||
      suppressWorldPressRef.current
    ) return;
    if (homeStationNearbyRef.current === station) {
      if (station === 'exit') {
        handleLeaveHome();
      } else if (station === 'laundry') {
        handleHomeLaundry();
      } else {
        openFridgeMenu();
      }
      return;
    }

    const stationPoint = station === 'exit' ? HOME_EXIT_POINT : station === 'laundry' ? HOME_LAUNDRY_POINT : HOME_FRIDGE_POINT;
    const current = playerPoint.current;
    const dx = current.x - stationPoint.x;
    const dy = current.y - stationPoint.y;
    const distance = Math.max(Math.hypot(dx, dy), 1);
    const approachDistance = HOME_STATION_INTERACTION_DISTANCE - 18;
    startTapMovement(
      {
        x: stationPoint.x + (dx / distance) * approachDistance,
        y: stationPoint.y + (dy / distance) * approachDistance,
      },
      { homeStation: station },
    );
  };

  const handleMarketStationPress = (
    event: GestureResponderEvent,
    station: MarketEnvironmentStationId,
  ) => {
    event?.stopPropagation?.();
    if (
      controlMode !== 'touch' ||
      controlsLockedRef.current ||
      zoomGestureActiveRef.current ||
      suppressWorldPressRef.current
    ) return;
    if (marketStationNearbyRef.current === station) {
      setMarketInteractionRequest((currentRequest) => ({
        id: (currentRequest?.id ?? 0) + 1,
        station,
      }));
      return;
    }
    const target = getMarketStationApproachPoint(marketEnvironmentRef.current, station,
      playerPoint.current, marketCashierCalledRef.current);
    if (target) startTapMovement(target, { marketStation: station });
  };

  const selectControlMode = (mode: ControlMode) => {
    stopMovement();
    speedMultiplier.current = 1;
    setRunEnabled(false);
    setControlMode(mode);
  };

  const handleBusStopInteraction = handleEnterBus;

  const handleBusStopPress = (event: GestureResponderEvent) => {
    event?.stopPropagation?.();
    if (
      controlMode !== 'touch' ||
      controlsLockedRef.current ||
      zoomGestureActiveRef.current ||
      suppressWorldPressRef.current
    ) return;
    if (Math.hypot(playerPoint.current.x - BUS_STOP_POINT.x, playerPoint.current.y - BUS_STOP_POINT.y) <= 3) {
      handleBusStopInteraction();
      return;
    }
    startTapMovement(BUS_STOP_POINT, { busStop: true });
  };

  const handleInteraction = () => {
    if (worldMapRef.current === 'market') {
      if (!marketStationNearbyRef.current) return;
      setMarketInteractionRequest((current) => ({
        id: (current?.id ?? 0) + 1,
        station: marketStationNearbyRef.current as MarketEnvironmentStationId,
      }));
      return;
    }

    if (worldMapRef.current === 'home') {
      if (homeStationNearbyRef.current === 'exit') {
        handleLeaveHome();
      } else if (homeStationNearbyRef.current === 'laundry') {
        handleHomeLaundry();
      } else if (homeStationNearbyRef.current === 'fridge') {
        openFridgeMenu();
      }
      return;
    }

    if (quizStep) return;
    if (dialogueIndex !== null) {
      if (visibleDialogueCharacters < currentDialogue.length) {
        dialogueAudio.stop();
        setVisibleDialogueCharacters(currentDialogue.length);
        dialogueReadyAt.current = Date.now() + DIALOGUE_READ_DELAY;
        return;
      }
      if (currentDialogueStep?.kind === 'choice') return;
      if (Date.now() < dialogueReadyAt.current) return;
      if (dialogueIndex < activeDialogueSteps.length - 1) {
        dialogueReadyAt.current = Number.POSITIVE_INFINITY;
        setVisibleDialogueCharacters(0);
        setDialogueIndex((index) => (index === null ? 0 : index + 1));
        return;
      }
      if (dialogueMode === 'minsu-quest') {
        openQuiz();
      } else {
        setDialogueIndex(null);
        setDialogueMode(null);
      }
      return;
    }

    if (busStopNearbyRef.current) {
      handleBusStopInteraction();
      return;
    }
    if (nearbyNpcIdRef.current) {
      startNpcGreeting(nearbyNpcIdRef.current);
      return;
    }
    if (nearbyPortalIdRef.current === 'market') {
      handleEnterMarket();
      return;
    }
    if (nearbyPortalIdRef.current === 'laundry') {
      handleEnterLaundry();
      return;
    }
    if (nearbyPortalIdRef.current === 'cafe') {
      handleEnterCafe();
      return;
    }
    if (nearbyPortalIdRef.current === 'home') {
      handleEnterHome();
      return;
    }
    if (busStopNearbyRef.current) handleBusStopInteraction();
  };

  const handleNpcQuestPress = (npcId: VillageNpcId) => {
    const questId = NPC_QUEST_IDS[npcId];
    if (!questId) return;
    const status = questStatusesRef.current[questId];
    if (status === 'available') {
      setQuestOfferId(questId);
      return;
    }
    if (status === 'completed') {
      setInfoPanel({
        body: '오늘 의뢰는 이미 잘 마쳤어요. 내일 또 만나요!',
        title: '완료한 의뢰',
      });
      return;
    }
    if (questId === 'minsu-safety') {
      startMinsuQuestDialogue();
      return;
    }
    setInfoPanel({
      body:
        questId === 'bus-route'
          ? '정류장 표지판 가까이에서 이동 연습을 시작하고, 버스로 하늘도서관에 가서 출근을 알려요.'
          : '하늘마트에 들어가 장보기 목록의 물건을 모두 찾아요.',
      title: questId === 'bus-route' ? '정류장으로 이동해요' : '마트에서 장을 봐요',
    });
  };

  const handleAcceptQuest = (npcId: VillageNpcId, questId: DailyQuestId) => {
    acceptDailyQuest(questId);
    setQuestOfferId(null);
    setInfoPanel({
      body:
        questId === 'minsu-safety'
          ? '민수에게 다시 말을 걸어 함께 연습해요.'
          : questId === 'bus-route'
            ? '동쪽 정류장에서 버스 이동 연습을 시작해 하늘도서관에 출근해요.'
            : '하늘마트 안에서 장보기 목록을 완성해요.',
      title: VILLAGE_NPC_BY_ID[npcId].name + '의 의뢰를 받았어요',
    });
  };

  const handleDialogueChoicePress = (choice: DialogueChoice) => {
    if (!dialogueChoiceVisible || currentDialogueStep?.kind !== 'choice' || dialogueIndex === null) {
      return;
    }

    if (currentDialogueStep.purpose === 'npc-action') {
      if (choice === 'npc-safety' && nearbyNpcIdRef.current === dialogueNpcId) {
        const safety = getPhishingSession();
        if (safety?.status !== 'active') return;
        const scenario = PHISHING_SCENARIOS[safety.scenarioId];
        if (dialogueNpcId === 'minsu' && safety.scenarioId.startsWith('friend-')) {
          dispatchPhishingAction({ type: 'STOP' });
          dispatchPhishingAction({ type: 'VERIFY', method: 'in-person' });
          setVisitingMinsu(false);
          startDialogue('minsu', [{ kind: 'line', text: scenario.verificationText.replace(/^민수:\s*/, '') }], 'small-talk');
        } else if (dialogueNpcId === 'jiyoung') {
          dispatchPhishingAction({ type: 'ASK_HELP' });
          startDialogue('jiyoung', [{ kind: 'line', text: scenario.helpText.replace(/^지영:\s*/, '') }], 'small-talk');
        }
        return;
      }
      if (choice === 'npc-errand' && dialogueNpcId === 'minsu' && nearbyNpcIdRef.current === 'minsu') {
        stopMovement();
        setDialogueIndex(null); setDialogueMode(null); setSelectedDailyChoice(null);
        if (!getShoppingErrand()) offerShoppingErrand('village-request');
        setErrandPanelOpen(true);
        return;
      }
      if (choice === 'npc-cashier' && dialogueNpcId === 'jiyoung') {
        stopMovement();
        setDialogueIndex(null);
        setDialogueMode(null);
        setSelectedDailyChoice(null);
        setCashierOpen(true);
        return;
      }
      if (choice === 'npc-talk') {
        startSmallTalk(dialogueNpcId, true);
        return;
      }
      if (choice === 'npc-quest') {
        setDialogueIndex(null);
        setDialogueMode(null);
        setSelectedDailyChoice(null);
        handleNpcQuestPress(dialogueNpcId);
      }
      return;
    }

    if (choice !== 'fun' && choice !== 'tired') return;
    setSelectedDailyChoice(choice);
    dialogueReadyAt.current = Number.POSITIVE_INFINITY;
    setVisibleDialogueCharacters(0);
    setDialogueIndex(dialogueIndex + 1);
  };

  const dismissNpcActionDialogue = () => {
    if (!npcActionChoiceOpen) return;
    setDialogueIndex(null);
    setDialogueMode(null);
    setSelectedDailyChoice(null);
  };

  const closeQuiz = () => {
    transportQuiz.close();
    setDialogueMode(null);
  };

  const marketStationCategory =
    marketStationNearby && marketStationNearby !== 'checkout' && marketStationNearby !== 'exit'
      ? marketCategories.find(({ id }) => id === marketStationNearby)
      : null;
  const nearbyNpcName = nearbyNpcId ? VILLAGE_NPC_BY_ID[nearbyNpcId].name : null;
  const activeBusStopInteraction = busStopNearby;
  const interactionAvailable =
    worldMap === 'market'
      ? marketStationNearby !== null && !marketScenarioLocked
      : worldMap === 'home'
        ? nearbyHomeStation !== null
        : nearbyNpcId !== null || nearbyPortalId !== null || busStopNearby;
  const interactionLabel =
    worldMap === 'market'
      ? (marketStationNearby === 'checkout' || marketStationNearby === 'checkout-2' || marketStationNearby?.startsWith('kiosk:'))
        ? '계산대에서 계산하기'
        : marketStationNearby === 'common-door'
          ? '마트에서 마을로 나가기'
          : marketStationNearby?.startsWith('staff:')
        ? '종업원에게 도움 요청하기'
          : marketStationCategory
            ? `${marketStationCategory.label} 살펴보기`
            : '가까이 가면 상호작용할 수 있어요'
      : worldMap === 'home'
        ? nearbyHomeStation === 'laundry' ? '빨래 바구니와 옷장 열기'
          : nearbyHomeStation === 'fridge'
          ? '냉장고 열기'
          : nearbyHomeStation === 'exit'
            ? '집에서 마을로 나가기'
            : '가까이 가면 상호작용할 수 있어요'
        : activeBusStopInteraction
          ? '버스 목적지 고르기'
          : nearbyNpcName
            ? `${nearbyNpcName}와 대화 또는 의뢰 선택하기`
          : nearbyPortalId === 'market'
            ? '하늘마트 들어가기'
            : nearbyPortalId === 'laundry' ? '동네 빨래방 들어가기'
            : nearbyPortalId === 'cafe'
              ? '카페 들어가기'
            : nearbyPortalId === 'home'
              ? '집으로 들어가기'
              : busStopNearby
                ? '버스 목적지 고르기'
                : '상호작용할 대상이 없습니다';
  const interactionIcon =
    worldMap === 'market'
      ? (marketStationNearby === 'checkout' || marketStationNearby === 'checkout-2' || marketStationNearby?.startsWith('kiosk:'))
        ? 'card-outline'
        : marketStationNearby === 'common-door'
          ? 'exit-outline'
          : 'search'
      : worldMap === 'home'
        ? nearbyHomeStation === 'laundry' ? 'shirt'
          : nearbyHomeStation === 'fridge'
          ? 'snow-outline'
          : 'exit-outline'
        : activeBusStopInteraction
          ? 'bus'
          : nearbyNpcId
            ? 'chatbubbles'
          : nearbyPortalId === 'market'
            ? 'storefront'
            : nearbyPortalId === 'laundry' ? 'shirt'
            : nearbyPortalId === 'cafe'
              ? 'cafe'
            : nearbyPortalId === 'home'
              ? 'home'
              : 'bus';
  const interactionActionText =
    worldMap === 'market'
      ? (marketStationNearby === 'checkout' || marketStationNearby === 'checkout-2' || marketStationNearby?.startsWith('kiosk:'))
        ? '계산'
        : marketStationNearby === 'common-door'
          ? '나가기'
          : marketStationNearby?.startsWith('staff:')
            ? '대화'
          : marketStationNearby
            ? '보기'
            : '행동'
      : worldMap === 'home'
        ? nearbyHomeStation === 'laundry' ? '정리'
          : nearbyHomeStation === 'fridge'
          ? '열기'
          : nearbyHomeStation === 'exit'
            ? '나가기'
            : '행동'
        : activeBusStopInteraction
          ? '출발'
          : nearbyNpcId
            ? '대화'
          : nearbyPortalId
            ? '입장'
            : busStopNearby
              ? '출발'
              : '행동';

  const offeredQuest = questOfferId
    ? dailyQuests.find((quest) => quest.id === questOfferId) ?? null
    : null;
  const offeredNpc = questOfferId
    ? VILLAGE_NPCS.find((npc) => NPC_QUEST_IDS[npc.id] === questOfferId) ?? null
    : null;

  const gameControlsVisible = !controlsLockedRef.current;
  const backgroundAudio = <GameBackgroundMusic player={backgroundMusic} audioModeReady={audioModeReady}
    muted={DEVELOPMENT_AUDIO_MUTED} musicVolume={preferences.musicVolume}
    ducked={dialoguePanelMounted || quizPanelMounted} />;
  const dayPanel = dayPanelOpen ? <DayJourneyPanel journey={journey} onOpenErrand={errand ? () => { setDayPanelOpen(false); setErrandPanelOpen(true); } : undefined} canStart={!busOpen && !libraryOpen && !cafeOpen && !laundryLocation && worldMap === 'village'} onClose={() => setDayPanelOpen(false)} onStart={() => {
    dispatchDayJourney({ type: 'start', at: Date.now() }); setDayPanelOpen(false);
  }} /> : null;
  const errandPanel = errandPanelOpen && errand ? <ShoppingErrandPanel errand={errand} onAction={handleErrandAction} onClose={() => setErrandPanelOpen(false)} canDeliver={!busOpen && !libraryOpen && !cafeOpen && !laundryLocation && worldMap === 'village' && nearbyNpcId === 'minsu'} /> : null;

  if (cashierOpen) {
    return <>{backgroundAudio}<CashierSimulationScreen onExit={() => setCashierOpen(false)} /></>;
  }
  if (laundryLocation) {
    return <>{backgroundAudio}<LaundrySimulationScreen location={laundryLocation} onExit={handleLeaveLaundry} onReturnHome={handleLeaveLaundry}
      initialSession={getLaundryDraft() ?? undefined} onSessionChange={keepLaundryDraft} onLaundryComplete={recordCompletedLaundryActivity}
      controlMode={controlMode} onControlModeChange={selectControlMode} onTravel={handleTravel} /></>;
  }
  if (cafeOpen) {
    return <>{backgroundAudio}<CafeSimulationScreen onExit={handleLeaveCafe}
      initialSession={getCafeDraft() ?? undefined} onSessionChange={keepCafeDraft}
      onShiftComplete={recordCompletedCafeActivity}
      controlMode={controlMode} onControlModeChange={selectControlMode} onTravel={handleTravel} /></>;
  }
  if (libraryOpen) {
    return <>{backgroundAudio}<LibrarySimulationScreen onExit={handleLeaveLibrary}
      initialSession={getDayLibraryDraft()} onSessionChange={keepDayLibraryDraft} onShiftComplete={handleShiftComplete}
      resumeOnReturn={journey.stage === 'working' || journey.stage === 'returning'}
      onOpenJourney={openDayPanel} journeyOpen={dayPanelOpen || errandPanelOpen}
      controlMode={controlMode} onControlModeChange={selectControlMode} onTravel={handleTravel} />{dayPanel}{errandPanel}</>;
  }
  if (busOpen) {
    return <>{backgroundAudio}<BusSimulationScreen key={`bus-visit-${busSceneVisit}`} entryPoint={busEntryPoint} initialSession={busInitialSession} onExit={handleReturnFromActivity} onStartLibrary={handleStartLibrary}
      onSessionChange={keepDayBusDraft} onJourneyComplete={handleJourneyComplete} onOpenJourney={openDayPanel} journeyOpen={dayPanelOpen || errandPanelOpen}
      onComplete={handleBusComplete} controlMode={controlMode} onControlModeChange={selectControlMode} onTravel={handleTravel} />{dayPanel}{errandPanel}</>;
  }

  return (
    <>{backgroundAudio}
    <View
      onLayout={handleViewportLayout}
      ref={viewportNode}
      style={styles.root}
      testID="game-viewport"
      {...pinchZoomResponder.panHandlers}
    >
      <Pressable
        accessibilityActions={[
          { label: '위로 이동', name: 'moveUp' },
          { label: '아래로 이동', name: 'moveDown' },
          { label: '왼쪽으로 이동', name: 'moveLeft' },
          { label: '오른쪽으로 이동', name: 'moveRight' },
        ]}
        accessibilityLabel={
          worldMap === 'market'
            ? '하늘마트 내부 월드'
            : worldMap === 'home'
              ? '집 내부 월드'
              : '쿼터뷰 마을'
        }
        delayLongPress={260}
        onAccessibilityAction={(event) => handleAccessibilityMove(event.nativeEvent.actionName)}
        onLayout={handleViewportLayout}
        onLongPress={handleWorldLongPress}
        onPress={handleWorldPress}
        onPressIn={handleWorldPressIn}
        onPressOut={handleWorldPressOut}
        style={styles.touchSurface}
      >
      <StatusBar hidden />
      <Animated.View
        pointerEvents="box-none"
        style={[styles.zoomScene, { transform: [{ scale: worldZoom }] }]}
      >
        <Animated.View
          pointerEvents={quizPanelMounted ? 'none' : 'auto'}
          style={[
            styles.world,
            {
              height: worldMap === 'market' ? marketEnvironment.world.height : WORLD_BOUNDS[worldMap].height,
              transform: camera.getTranslateTransform(),
              width: worldMap === 'market' ? marketEnvironment.world.width : WORLD_BOUNDS[worldMap].width,
            },
          ]}
        >
          {worldMap === 'village' ? (
            <>
              <ExpandedVillageLayer
                controlMode={controlMode}
                controlsLocked={controlsLockedRef.current}
                nearbyNpcId={nearbyNpcId}
                nearbyPortalId={nearbyPortalId}
                onNpcPress={handleNpcPress}
                onPortalPress={handlePortalPress}
                tapTargetMarker={controlMode === 'touch' ? tapTargetMarker : null}
              >
                <Animated.View accessibilityLabel="내 캐릭터" pointerEvents="none"
                  testID="village-world-player"
                  style={[styles.player, { left: 0, top: 0, zIndex: villagePlayerDepth,
                    transform: actorTransform }]}>
                  <DirectionalAvatar facing={playerAvatarPose.facing} manifest={freshPlayerAvatar}
                    motion={playerAvatarPose.motion} walkCycle={playerWalkCycle} reduceMotion={reduceMotionEnabled} scale={PLAYER_ART_SCALE} />
                </Animated.View>
              </ExpandedVillageLayer>
              {visitingMinsu && !safetySession?.verification ? <View pointerEvents="none" style={{ position: 'absolute', left: VILLAGE_NPC_BY_ID.minsu.point.x - 68, top: VILLAGE_NPC_BY_ID.minsu.point.y - 162, width: 136, zIndex: 9000, alignItems: 'center' }}><View style={{ backgroundColor: '#FCF8EA', borderRadius: 18, paddingVertical: 9, paddingHorizontal: 14, flexDirection: 'row', gap: 7, alignItems: 'center' }}><Ionicons name="chatbubble-ellipses" size={19} color="#668271" /><Text style={{ color: '#4B6252', fontFamily: fonts.bold, fontSize: 17 }}>연락 확인</Text></View><Ionicons name="caret-down" size={18} color="#FCF8EA" style={{ marginTop: -5 }} /></View> : null}
              <PressScale
                accessibilityHint={
                  controlMode === 'touch'
                    ? busStopNearby
                      ? '정류장에서 버스로 갈 목적지를 고릅니다'
                      : '정류장 앞으로 이동합니다'
                    : undefined
                }
                accessibilityLabel="동쪽 버스정류장으로 이동해 목적지 고르기"
                accessibilityRole={controlMode === 'touch' ? 'button' : undefined}
                disabled={controlMode !== 'touch' || controlsLockedRef.current}
                onPress={handleBusStopPress}
                scaleTo={0.96}
                style={styles.busStopHotspot}
              >
                {busStopNearby ? (
                  <View style={styles.busStopActionBadge}>
                    <Ionicons color={colors.white} name="bus" size={17} />
                    <Text style={styles.busStopActionText}>목적지 선택</Text>
                  </View>
                ) : null}
              </PressScale>
            </>
          ) : worldMap === 'home' ? (
            <HomeWorldLayer
              controlMode={controlMode}
              controlsLocked={controlsLockedRef.current}
              fridgeCompleted={dailyQuestStatuses['home-fridge'] === 'completed'}
              nearbyStationId={nearbyHomeStation}
              onStationPress={handleHomeStationPress}
              tapTargetMarker={controlMode === 'touch' ? tapTargetMarker : null}
            />
          ) : (
            <MarketWorldLayer
              controlMode={controlMode}
              environment={marketEnvironment}
              cashierCalled={marketCashierCalled}
              nearbyStation={marketStationNearby}
              onStationPress={handleMarketStationPress}
              tapTargetMarker={tapTargetMarker}
            />
          )}
          {worldMap === 'market' ? <Animated.View accessibilityLabel="내 캐릭터" pointerEvents="none"
            testID="market-world-player"
            style={[styles.player, { left: 0, top: 0, zIndex: marketPlayerDepth,
              transform: actorTransform }]}>
            <DirectionalAvatar facing={playerAvatarPose.facing} manifest={freshPlayerAvatar}
              motion={playerAvatarPose.motion} walkCycle={playerWalkCycle} reduceMotion={reduceMotionEnabled} scale={PLAYER_ART_SCALE} />
          </Animated.View> : null}
        </Animated.View>

        {worldMap === 'home' ? <Animated.View accessibilityLabel="내 캐릭터" pointerEvents="none"
          style={[styles.player, { transform: playerCameraOffset.getTranslateTransform() }]}>
          <DirectionalAvatar
            facing={playerAvatarPose.facing}
            manifest={freshPlayerAvatar}
            motion={playerAvatarPose.motion}
            walkCycle={playerWalkCycle}
            reduceMotion={reduceMotionEnabled}
            scale={PLAYER_ART_SCALE}
          />
        </Animated.View> : null}
      </Animated.View>

      {laundryDraft && laundryDraft.phase !== 'finished' && worldMap !== 'market' && !hudMenuOpen && !controlsLockedRef.current ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 88, left: 16, right: 16, alignItems: 'center' }}>
          <View style={{ maxWidth: 410, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 18, backgroundColor: '#FFFBEFF2', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="shirt-outline" size={24} color="#708A79" />
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: '#53665B' }}>{getLaundryObjective(laundryDraft)}</Text>
              <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: '#7C8779', marginTop: 3 }}>{laundryDraft.phase === 'returning' ? worldMap === 'home' ? '옷장 옆 바구니에서 정리해요' : '오른쪽 아래 우리 집' : laundryDraft.phase === 'packing' ? '우리 집의 빨래 바구니' : '왼쪽 아래, 마을회관 위 빨래방'}</Text>
            </View>
          </View>
        </View>
      ) : null}
      <GameControls
        bottomOffset={worldMap === 'market' ? getMarketHudControlLift(replayWindow.width) : 0}
        controlMode={controlMode}
        locked={!gameControlsVisible}
        action={{ label: interactionActionText, accessibilityLabel: interactionLabel,
          icon: interactionIcon, available: interactionAvailable, onPress: handleInteraction }}
        onMoveStart={handleJoystickStart}
        onMove={handleJoystickMove}
        onMoveEnd={stopMovement}
        onAccessibilityMove={handleAccessibilityMove}
        runEnabled={runEnabled}
        onRunEnabledChange={enabled => {
          setRunEnabled(enabled);
          speedMultiplier.current = enabled ? RUN_SPEED_MULTIPLIER : 1;
        }}
        reduceMotion={reduceMotionEnabled}
      />
      {!cookingOpen && !phoneContact && !phoneCallPresent && (worldMap !== 'market' || !marketScenarioLocked) ? (
        <GameHud
          controlMode={controlMode}
          dailyQuests={dailyQuests}
          phoneRequest={safetyPhoneRequest}
          onPhoneRequestHandled={consumeSafetyPhoneRequest}
          onVisitMinsu={worldMap === 'village' ? visitMinsuForSafety : undefined}
          onOpenJourney={openDayPanel}
          onOpenErrand={errand ? openErrandPanel : undefined}
          onOpenCafe={worldMap === 'village' ? handleVisitCafe : undefined}
          onOpenLaundry={worldMap !== 'market' ? handleLaundryQuest : undefined}
          onControlModeChange={selectControlMode}
          onEmergencyExit={handleEmergencyExit}
          onExit={handleExit}
          onMenuVisibilityChange={handleHudMenuVisibilityChange}
          onEditMarketLayout={worldMap === 'market' ? () => {
            stopMovement();
            setMarketInteractionRequest(current => ({ id: (current?.id ?? 0) + 1, station: 'edit-layout' }));
          } : undefined}
          onTravel={handleTravel}
          busRouteContext={{ currentStop: 'village', direction: 'outbound', destination: 'library' }}
          onCallContact={contact => {
            stopMovement();
            if (contact === (errandMarketConfig ? 'minsu' : 'jiyoung') && worldMap === 'market') {
              setMarketInteractionRequest(current => ({ id: (current?.id ?? 0) + 1, station: 'contact-requester' }));
            } else setPhoneContact(contact);
          }}
        />
      ) : null}

      {worldMap === 'market' && (marketAiRequestToken !== accessToken || ['loading', 'waiting', 'error'].includes(marketAiStatus)) ? (
        <View style={styles.interactionOverlay}>
          <View style={styles.fridgeMenuSheet}>
            <Text style={styles.fridgeMenuTitle}>{marketAiStatus === 'error' ? '맞춤 장보기를 준비하지 못했어요' : '행동을 분석하고 연습을 준비하고 있어요'}</Text>
            {marketAiNotice ? <Text>{marketAiNotice}</Text> : null}
            {marketAiStatus !== 'error' ? <ActivityIndicator /> : null}
            {marketAiStatus === 'waiting' || marketAiStatus === 'error' ? (
              <Pressable accessibilityRole="button" onPress={() => { marketAiRequestSequence.current += 1; setMarketAiRetry(value => value + 1); }}>
                <Text style={styles.fridgeMenuTitle}>다시 확인</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={handleLeaveMarket}>
              <Text style={styles.fridgeMenuTitle}>마을로 돌아가기</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {worldMap === 'market' && marketAiRequestToken === accessToken && (marketAiStatus === 'ready' || marketAiStatus === 'baseline') ? (
        <MarketSimulationScreen
          viewFrameRef={marketViewFrame}
          replayUiRef={__DEV__ && MARKET_REPLAY_ENABLED ? replayUi : undefined}
          replayPresentation={__DEV__ && MARKET_REPLAY_ENABLED ? replayPresentation : undefined}
          accessToken={accessToken}
          difficulty={marketDifficulty}
          externalMenuOpen={hudMenuOpen || phoneContact !== null || phoneCallPresent || errandPanelOpen || dayPanelOpen}
          requesterName={errandMarketConfig ? '민수' : undefined}
          spendingLimit={errandMarketConfig ? errand?.approvedBudget : undefined}
          onBudgetRequest={errandMarketConfig ? (amount: number) => { dispatchShoppingErrand({ type: 'approve-budget', amount }); } : undefined}
          onEpisodeComplete={handleMarketEpisodeComplete}
          controlMode={controlMode}
          onControlModeChange={selectControlMode}
          environment={marketEnvironment}
          // Minsu's errand is a fixed, budgeted request (feat/8); otherwise the AI/pilot mission applies.
          initialConfig={errandMarketConfig ?? pilotSessionConfig(__DEV__ && MARKET_REPLAY_ENABLED,
            __DEV__ && MARKET_REPLAY_ENABLED && typeof window !== 'undefined' && window.location
              ? new URLSearchParams(window.location.search).get('marketPilotEnvironment') ?? undefined : undefined)}
          onEnvironmentChange={handleMarketEnvironmentChange}
          onCashierCalled={handleMarketCashierCalled}
          playerPositionRef={playerPoint}
          playerMovementListenerRef={marketMovementListener}
          embedded
          interactionRequest={marketInteractionRequest}
          key={errandMarketConfig ? `errand-${errandMarketConfig.sessionId ?? 'pending'}` : `${personalizedMarketMission.id}-${marketDifficulty}-${marketSimulation?.questInstanceId ?? 'static'}`}
          mission={errandMarketConfig ? undefined : personalizedMarketMission}
          onExit={handleLeaveMarket}
          onOpenAnalysis={onOpenAnalysis ? () => {
            stopMovement();
            if (backgroundMusic.isLoaded) {
              try { backgroundMusic.pause(); } catch { /* The audio player may already be released. */ }
            }
            onOpenAnalysis();
          } : undefined}
          onLockChange={setMarketScenarioLocked}
          onMissionComplete={() => { if (!errandMarketConfig) completeDailyQuest('market-shopping'); }}
          simulation={errandMarketConfig ? undefined : marketSimulation}
          onTelemetryReady={registerMarketTelemetry}
        />
      ) : null}

      {__DEV__ && MARKET_REPLAY_ENABLED ? <View style={{ position: 'absolute', left: 12, top: 40, maxWidth: 480,
        backgroundColor: '#f4fff3', borderColor: '#3b6b3b', borderWidth: 1, borderRadius: 8, padding: 8, zIndex: 10000 }}>
        <Text accessibilityLiveRegion="polite" testID="market-replay-status" style={{ fontSize: 12, color: '#234b23' }}>{replayStatus}</Text>
        {worldMap === 'village' ? <Pressable accessibilityRole="button" accessibilityLabel="실험용 매장 입구로 이동"
          onPress={event => {
            event?.stopPropagation?.();
            if (nearbyPortalIdRef.current === 'market') handleEnterMarket();
            else handlePortalPress(event, 'market');
          }}><Text>실험용 매장 입구로 이동</Text></Pressable> : null}
      </View> : null}

      {fridgeMenuOpen ? (
        <View style={styles.interactionOverlay}>
          <Pressable
            accessibilityLabel="냉장고 메뉴 닫기"
            onPress={(event) => {
              event?.stopPropagation?.();
              setFridgeMenuOpen(false);
            }}
            style={styles.interactionOverlayDim}
          />
          <View accessibilityLabel="냉장고에서 할 일 선택" style={styles.fridgeMenuSheet}>
            <View style={styles.fridgeMenuHeader}>
              <View style={styles.fridgeMenuIcon}>
                <Ionicons color="#4F7B68" name="snow" size={23} />
              </View>
              <View style={styles.fridgeMenuHeaderCopy}>
                <Text style={styles.fridgeMenuTitle}>냉장고</Text>
                <Text style={styles.fridgeMenuSubtitle}>무엇을 할까요?</Text>
              </View>
              <PressScale
                accessibilityLabel="냉장고 메뉴 닫기"
                accessibilityRole="button"
                onPress={(event) => {
                  event?.stopPropagation?.();
                  setFridgeMenuOpen(false);
                }}
                scaleTo={0.9}
                style={styles.fridgeMenuClose}
              >
                <Ionicons color="#737B76" name="close" size={22} />
              </PressScale>
            </View>
            <PressScale
              accessibilityLabel="바나나 요거트 컵 요리 시작"
              accessibilityRole="button"
              onPress={(event) => {
                event?.stopPropagation?.();
                startCooking();
              }}
              style={styles.fridgeCookingButton}
            >
              <View style={styles.fridgeCookingIcon}>
                <Ionicons color="#FFFFFF" name="restaurant" size={23} />
              </View>
              <View style={styles.fridgeCookingCopy}>
                <Text style={styles.fridgeCookingEyebrow}>불과 칼 없이 · 약 5분</Text>
                <Text style={styles.fridgeCookingTitle}>바나나 요거트 컵 만들기</Text>
              </View>
              <Ionicons color="#4F7B68" name="chevron-forward" size={21} />
            </PressScale>
            <PressScale
              accessibilityLabel="냉장고 살펴보기"
              accessibilityRole="button"
              onPress={(event) => {
                event?.stopPropagation?.();
                inspectFridge();
              }}
              style={styles.fridgeInspectButton}
            >
              <Ionicons color="#5B6E63" name="search" size={20} />
              <Text style={styles.fridgeInspectText}>냉장고 살펴보기</Text>
            </PressScale>
          </View>
        </View>
      ) : null}

      {questOfferId && offeredQuest && offeredNpc ? (
        <View style={styles.interactionOverlay}>
          <Pressable
            accessibilityLabel="의뢰 제안 닫기"
            onPress={(event) => {
              event?.stopPropagation?.();
              setQuestOfferId(null);
            }}
            style={styles.interactionOverlayDim}
          />
          <View accessibilityLabel={offeredQuest.title + ' 의뢰 제안'} style={styles.questOfferSheet}>
            <View style={styles.questOfferBadge}>
              <Ionicons color="#FFFFFF" name="sparkles" size={16} />
              <Text style={styles.questOfferBadgeText}>새로운 의뢰</Text>
            </View>
            <Text style={styles.questOfferTitle}>{offeredQuest.title}</Text>
            <Text style={styles.questOfferDescription}>{offeredQuest.description}</Text>
            <View style={styles.questOfferMeta}>
              <Text style={styles.questOfferMetaText}>{offeredQuest.region}</Text>
              <Text style={styles.questOfferMetaText}>+{offeredQuest.rewardXp} XP</Text>
            </View>
            <PressScale
              accessibilityLabel={offeredNpc.name + '의 의뢰 받기'}
              onPress={() => handleAcceptQuest(offeredNpc.id, questOfferId)}
              style={styles.npcMenuQuestButton}
            >
              <Text numberOfLines={1} style={styles.npcMenuQuestText}>
                의뢰 받기
              </Text>
            </PressScale>
            <PressScale
              accessibilityLabel="다음에 받기"
              onPress={() => setQuestOfferId(null)}
              style={styles.questOfferLaterButton}
            >
              <Text style={styles.questOfferLaterText}>다음에 받기</Text>
            </PressScale>
          </View>
        </View>
      ) : null}

      {infoPanel ? (
        <View style={styles.interactionOverlay}>
          <Pressable
            accessibilityLabel="안내 닫기"
            onPress={(event) => {
              event?.stopPropagation?.();
              setInfoPanel(null);
            }}
            style={styles.interactionOverlayDim}
          />
          <View accessibilityLiveRegion="polite" style={styles.infoPanelSheet}>
            <View style={styles.infoPanelIcon}>
              <Ionicons color={colors.white} name="checkmark" size={24} />
            </View>
            <Text style={styles.infoPanelTitle}>{infoPanel.title}</Text>
            <Text style={styles.infoPanelBody}>{infoPanel.body}</Text>
            <PressScale
              accessibilityLabel="안내 확인"
              onPress={() => setInfoPanel(null)}
              style={styles.infoPanelButton}
            >
              <Text style={styles.infoPanelButtonText}>확인</Text>
            </PressScale>
          </View>
        </View>
      ) : null}

      {dialoguePanelMounted ? (
        <>
          <Animated.View
            pointerEvents={npcActionChoiceOpen ? 'auto' : 'none'}
            style={[styles.dialogueDim, { opacity: dialoguePanelProgress }]}
          >
            {npcActionChoiceOpen ? (
              <Pressable
                accessibilityLabel="대화 선택 닫기"
                accessibilityRole="button"
                onPress={dismissNpcActionDialogue}
                style={StyleSheet.absoluteFill}
                testID="dialogue-dismiss-backdrop"
              />
            ) : null}
          </Animated.View>
          {dialoguePortraitExpression && !quizPanelMounted ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.dialoguePortraitAnchor,
                renderedDialogueStep?.kind === 'choice' && styles.dialoguePortraitAnchorRaised,
                {
                  opacity: dialoguePanelProgress,
                  transform: [
                    {
                      translateY: dialoguePanelProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [14, 0],
                      }),
                    },
                    {
                      scale: dialoguePanelProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.97, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <MinsuDialoguePortrait expression={dialoguePortraitExpression} />
            </Animated.View>
          ) : null}
          <Animated.View
            pointerEvents={dialogueIndex !== null ? 'auto' : 'none'}
            style={[
              styles.dialogueBox,
              currentDialogueStep?.kind === 'choice' && styles.dialogueChoiceBox,
              currentDialogueStep?.kind === 'choice' &&
                currentDialogueStep.options.length > 2 &&
                styles.dialogueChoiceBoxTall,
              {
                opacity: dialoguePanelProgress,
                transform: [
                  {
                    translateY: dialoguePanelProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [18, 0],
                    }),
                  },
                  {
                    scale: dialoguePanelProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.985, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
              accessibilityLabel={
                dialogueChoiceVisible
                  ? currentDialogueStep?.kind === 'choice' && currentDialogueStep.purpose === 'npc-action'
                    ? '행동을 선택해 주세요'
                    : '일상 선택지를 선택해 주세요'
                  : '대화 계속하기'
              }
              accessibilityLiveRegion="polite"
              accessibilityRole="button"
              accessibilityState={{ disabled: dialogueChoiceVisible }}
              disabled={dialogueChoiceVisible}
              onPress={(event) => {
                event?.stopPropagation?.();
                handleInteraction();
              }}
              style={styles.dialoguePressArea}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.dialogueSpeakerTag,
                  {
                    transform: [{ rotate: '-4deg' }, { translateY: speakerTagFloat }],
                  },
                ]}
              >
                <Text style={styles.dialogueSpeaker}>{dialogueSpeakerName}</Text>
              </Animated.View>
              <Text style={styles.dialogueText}>
                {renderedDialogue.slice(0, visibleDialogueCharacters)}
              </Text>
              {!dialogueChoiceVisible ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.dialogueAdvanceIndicator,
                    { transform: [{ translateY: dialogueArrowFloat }] },
                  ]}
                />
              ) : null}
            </Pressable>
          </Animated.View>
          {dialogueChoiceVisible && currentDialogueStep?.kind === 'choice' ? (
            <Animated.View
              accessibilityLabel={
                currentDialogueStep.purpose === 'npc-action'
                  ? `${dialogueSpeakerName} 행동 선택지`
                  : '오늘 하루 선택지'
              }
              accessibilityRole={currentDialogueStep.purpose === 'npc-action' ? 'menu' : 'radiogroup'}
              style={[
                styles.dialogueChoices,
                {
                  opacity: dailyChoiceProgress,
                  transform: [
                    {
                      translateY: dailyChoiceProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [10, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              {currentDialogueStep.options.map((option) => (
                <PressScale
                  accessibilityRole={currentDialogueStep.purpose === 'npc-action' ? 'button' : 'radio'}
                  accessibilityState={
                    currentDialogueStep.purpose === 'npc-action'
                      ? undefined
                      : { checked: selectedDailyChoice === option.id }
                  }
                  key={option.id}
                  onPress={(event) => {
                    event?.stopPropagation?.();
                    handleDialogueChoicePress(option.id);
                  }}
                  style={styles.quizAnswer}
                >
                  <Text numberOfLines={1} style={styles.quizAnswerText}>
                    {option.label}
                  </Text>
                </PressScale>
              ))}
            </Animated.View>
          ) : null}
        </>
      ) : null}

      {quizPanelMounted ? (
        <View style={styles.quizOverlay}>
          <Animated.View style={[styles.dim, { opacity: quizPanelProgress }]} />
          {renderedQuizStep === 'question' ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.dialoguePortraitAnchor,
                styles.dialoguePortraitAnchorRaised,
                styles.quizPortraitAnchor,
                {
                  opacity: quizPanelProgress,
                  transform: [
                    {
                      translateY: quizPanelProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [14, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <MinsuDialoguePortrait
                expression="curious"
                testID="minsu-quiz-portrait"
              />
            </Animated.View>
          ) : null}
          <Animated.View
            style={[
              styles.quizSheet,
              renderedQuizStep === 'question' ? styles.quizChoiceStage : styles.quizResultSheet,
              {
                opacity: quizPanelProgress,
                transform: [
                  {
                    translateY: quizPanelProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: renderedQuizStep === 'question' ? [127, 0] : [54, 0],
                    }),
                  },
                  {
                    scale: quizPanelProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.985, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            {renderedQuizStep === 'loading' ? (
              <View accessibilityLiveRegion="polite" style={styles.quizLoading}>
                <ActivityIndicator color={colors.mint} size="large" />
                <Text style={styles.quizLoadingTitle}>나에게 맞는 문제를 준비하고 있어요</Text>
                <Text style={styles.quizLoadingDescription}>
                  최근 난이도와 대중교통 퀘스트를 확인해요.
                </Text>
              </View>
            ) : renderedQuizStep === 'error' ? (
              <View accessibilityLiveRegion="assertive" style={styles.quizLoading}>
                <Ionicons color="#D5685D" name="alert-circle-outline" size={42} />
                <Text style={styles.quizLoadingTitle}>문제를 준비하지 못했어요</Text>
                <Text style={styles.quizLoadingDescription}>
                  {transportQuiz.errorMessage ?? '잠시 후 다시 시도해 주세요.'}
                </Text>
                <PressScale
                  accessibilityRole="button"
                  onPress={() => void transportQuiz.open()}
                  style={styles.quizButton}
                >
                  <Text style={styles.quizButtonText}>다시 시도하기</Text>
                </PressScale>
                <PressScale accessibilityRole="button" onPress={closeQuiz} style={styles.quizTextButton}>
                  <Text style={styles.quizTextButtonLabel}>마을로 돌아가기</Text>
                </PressScale>
              </View>
            ) : renderedQuizStep === 'question' && transportQuiz.step && transportQuiz.quest ? (
              <>
                <View
                  style={[
                    styles.quizDialogueCard,
                    { bottom: 157 + transportQuiz.step.choices.length * 60 },
                  ]}
                >
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.dialogueSpeakerTag,
                      {
                        transform: [{ rotate: '-4deg' }, { translateY: speakerTagFloat }],
                      },
                    ]}
                  >
                    <Text style={styles.dialogueSpeaker}>민수</Text>
                  </Animated.View>
                  <View style={styles.quizMetaRow}>
                    <Text style={styles.quizProgressText}>
                      {transportQuiz.stepIndex + 1}/{transportQuiz.quest.steps.length}
                    </Text>
                    {transportQuiz.contentSource === 'ai' ? (
                      <Text style={styles.quizAiBadge}>AI 맞춤 문제</Text>
                    ) : null}
                  </View>
                  <Text style={styles.quizQuestion}>
                    {transportQuiz.step.instruction}
                  </Text>
                  <Text style={styles.quizSituation}>{transportQuiz.step.situation}</Text>
                  {transportQuiz.submittedChoice ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={[
                        styles.quizFeedback,
                        false && styles.quizFeedbackCorrect,
                      ]}
                    >
                      {'선택을 기록했어요. AI가 전체 수행을 검토해요.'}
                    </Text>
                  ) : null}
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.dialogueAdvanceIndicator,
                      { transform: [{ translateY: dialogueArrowFloat }] },
                    ]}
                  />
                </View>

                <Animated.View
                  accessibilityLabel="대중교통 안전 퀴즈 선택지"
                  accessibilityRole="radiogroup"
                  style={[
                    styles.quizAnswers,
                    {
                      opacity: quizPanelProgress.interpolate({
                        extrapolate: 'clamp',
                        inputRange: [0, 0.46, 1],
                        outputRange: [0, 0, 1],
                      }),
                      transform: [
                        {
                          translateY: quizPanelProgress.interpolate({
                            extrapolate: 'clamp',
                            inputRange: [0, 1],
                            outputRange: [12, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  {transportQuiz.step.choices.map((choice) => {
                    const selected = transportQuiz.selectedChoiceId === choice.id;
                    const wrong = false;
                    return (
                      <PressScale
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        disabled={transportQuiz.submittedChoice !== null}
                        key={choice.id}
                        onPress={() => transportQuiz.selectChoice(choice.id)}
                        style={[
                          styles.quizAnswer,
                          selected && styles.quizAnswerSelected,
                          wrong && styles.quizAnswerWrong,
                        ]}
                      >
                        <Text
                          adjustsFontSizeToFit
                          minimumFontScale={0.76}
                          numberOfLines={1}
                          style={styles.quizAnswerText}
                        >
                          {choice.label}
                        </Text>
                      </PressScale>
                    );
                  })}
                </Animated.View>
                {transportQuiz.submittedChoice ? (
                  <PressScale
                    accessibilityRole="button"
                    onPress={transportQuiz.advance}
                    style={styles.quizNextButton}
                  >
                    <Text style={styles.quizButtonText}>
                      {transportQuiz.stepIndex === transportQuiz.quest.steps.length - 1
                        ? '결과 보기'
                        : '다음 문제'}
                    </Text>
                  </PressScale>
                ) : null}
                {transportQuiz.syncNotice ? (
                  <Text style={styles.quizSyncNotice}>{transportQuiz.syncNotice}</Text>
                ) : null}
              </>
            ) : renderedQuizStep === 'result' && transportQuiz.quest ? (
              <View style={styles.result}>
                <View style={styles.resultIconStage}>
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.resultBurst,
                      {
                        opacity: resultCelebration.interpolate({
                          inputRange: [0, 0.18, 1],
                          outputRange: [0, 0.34, 0],
                        }),
                        transform: [
                          {
                            scale: resultCelebration.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.55, 1.7],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.resultIcon,
                      {
                        opacity: resultCelebration,
                        transform: [
                          {
                            scale: resultCelebration.interpolate({
                              inputRange: [0, 0.68, 1],
                              outputRange: [0.65, 1.12, 1],
                            }),
                          },
                          {
                            rotate: resultCelebration.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['-12deg', '0deg'],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <Ionicons color={colors.white} name="checkmark" size={38} />
                  </Animated.View>
                </View>
                <Animated.View
                  style={[
                    styles.resultDetails,
                    {
                      opacity: resultCelebration.interpolate({
                        inputRange: [0, 0.28, 1],
                        outputRange: [0, 0, 1],
                      }),
                      transform: [
                        {
                          translateY: resultCelebration.interpolate({
                            inputRange: [0, 1],
                            outputRange: [12, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Text style={styles.resultTitle}>{transportQuiz.quest.title} 퀴즈를 마쳤어요!</Text>
                  <Text style={styles.resultDescription}>
                    {transportQuiz.quest.steps.length}개의 단계에 선택을 제출했어요. AI 검토를 확인해 주세요.
                  </Text>
                  <View style={styles.xpCard}>
                    <Text style={styles.xpLabel}>받은 경험치</Text>
                    <Text style={styles.xpValue}>보상 미지급</Text>
                  </View>
                  {transportQuiz.syncNotice ? (
                    <Text style={styles.quizSyncNotice}>{transportQuiz.syncNotice}</Text>
                  ) : null}
                  <PressScale accessibilityRole="button" onPress={closeQuiz} style={styles.quizButton}>
                    <Text style={styles.quizButtonText}>마을로 돌아가기</Text>
                  </PressScale>
                </Animated.View>
              </View>
            ) : null}
          </Animated.View>
        </View>
      ) : null}
      </Pressable>
      <MarketPanelTransition visible={phoneContact !== null} transitionKey={`phone-call-${phoneContact}`} onPresenceChange={setPhoneCallPresent}>
        {phoneContact ? <GameContactCall key={phoneContact} contact={phoneContact} inMarket={worldMap === 'market'} onOpenErrand={errand ? () => { closePhoneCall(); setErrandPanelOpen(true); } : undefined} onClose={closePhoneCall} /> : null}
      </MarketPanelTransition>
      {safetySession?.status === 'active' && worldMap === 'village' && !controlsLockedRef.current ? <View pointerEvents="box-none" style={styles.dayJourneyAnchor}>
        <PressScale accessibilityRole="button" accessibilityLabel="연락 확인 이어하기" onPress={openSafetyPhone} style={styles.dayJourneyCard}>
          <Ionicons name="chatbubbles" color="#6B8467" size={23} />
          <View style={{ flex: 1 }}><Text style={styles.dayJourneyTitle}>{PHISHING_SCENARIOS[safetySession.scenarioId].title}</Text><Text style={styles.dayJourneyHint}>{visitingMinsu ? '광장의 민수에게 가까이 가서 말 걸기' : getPhishingGoal(safetySession)}</Text></View>
          <Ionicons name="phone-portrait-outline" color="#7C8C74" size={21} />
        </PressScale>
      </View> : journey.stage !== 'available' && journey.stage !== 'completed' && worldMap !== 'market' && !controlsLockedRef.current ? <View pointerEvents="box-none" style={styles.dayJourneyAnchor}>
        <PressScale accessibilityRole="button" accessibilityLabel="도서관 다녀오기 일정 열기" onPress={openDayPanel} style={styles.dayJourneyCard}>
          <Ionicons name={journey.stage === 'home' ? 'home' : 'book'} color="#6B8467" size={23} />
          <View style={{ flex: 1 }}><Text style={styles.dayJourneyTitle}>도서관 다녀오기 · {dayJourneyStep(journey.stage)}/4</Text><Text style={styles.dayJourneyHint}>{DAY_JOURNEY_GUIDANCE[journey.stage]}</Text></View>
          <Ionicons name="chevron-forward" color="#7C8C74" size={18} />
        </PressScale>
      </View> : null}
      {dayPanel}
      {errandPanel}
      <MarketPanelTransition visible={busDestinationOpen} transitionKey="village-bus-destination" onPresenceChange={setBusDestinationPresent}>
        {busDestinationOpen ? <BusRoutePanel title="어디로 갈까요?" onClose={() => setBusDestinationOpen(false)}
          testID="village-bus-destination" footer={<>
            <LibraryButton onPress={handleChooseLibraryDestination}>하늘도서관으로 가기</LibraryButton>
            <LibraryButton secondary onPress={() => setBusDestinationOpen(false)}>마을에 머물기</LibraryButton>
          </>}>
          <BusTimetable session={villageBusSession ?? villageStopPreview} />
        </BusRoutePanel> : null}
      </MarketPanelTransition>
      <MarketPanelTransition visible={villageBusOpen} transitionKey="village-bus-boarding" onPresenceChange={setVillageBusPresent}>
        {villageBusOpen && villageBusSession ? <LibraryPanel title="마을앞 정류장"
          onClose={() => setVillageBusOpen(false)} testID="village-bus-boarding" footer={<>
            <LibraryButton disabled={!villageBusSession.offeredRoute || !villageBusReady} onPress={handleBoardVillageBus}>
              {villageBusSession.offeredRoute ? villageBusReady ? `${villageBusSession.offeredRoute}번 버스 타기` : `${villageBusSession.offeredRoute}번 도착 중` : '다음 버스를 기다리고 있어요'}
            </LibraryButton>
            <View style={styles.busStopChoices}>
              <View style={{ flex: 1 }}><LibraryButton secondary label="기사님께 물어보기" disabled={!villageBusSession.offeredRoute || !villageBusReady} onPress={handleAskVillageDriver}>기사님께 묻기</LibraryButton></View>
              <View style={{ flex: 1 }}><LibraryButton secondary label="다음 버스 기다리기" disabled={!villageBusSession.offeredRoute || !villageBusReady} onPress={handleWaitForVillageBus}>다음 버스</LibraryButton></View>
            </View>
          </>}>
          <BusArrivalPreview bus={villageBusSession.offeredRoute ? { number: villageBusSession.offeredRoute, destination: getBusDestination(villageBusSession.offeredRoute, villageBusSession.direction) } : null}
            direction={villageBusSession.direction} reduceMotion={reduceMotionEnabled} onReadyChange={setVillageBusReady} compact />
          {villageBusSession.offeredRoute ? <>
            <View style={styles.busStopRouteRow}><View style={styles.busStopRouteBadge}><Text style={styles.busStopRouteNumber}>{villageBusSession.offeredRoute}</Text></View>
              <Text style={styles.busStopRouteTitle}>{getBusDestination(villageBusSession.offeredRoute, villageBusSession.direction)}</Text></View>
            {villageDriverReply ? <Text style={styles.busStopGuidance}>{villageDriverReply}</Text> : null}
          </> : <Text style={styles.busStopGuidance}>인도에서 다음 버스를 기다려요.</Text>}
          <PressScale accessibilityRole="button" accessibilityLabel={villageRouteOpen ? '정류장 노선도 접기' : '정류장 노선도 보기'} accessibilityState={{ expanded: villageRouteOpen }}
            onPress={() => setVillageRouteOpen(open => !open)} style={styles.busRouteButton}>
            <Ionicons name="git-branch-outline" size={21} color="#526D59" /><Text style={styles.busRouteButtonText}>도착 안내판 · 노선도</Text><Ionicons name={villageRouteOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#526D59" />
          </PressScale>
          {villageRouteOpen && <BusTimetable session={villageBusSession} upcomingRoute={nextVillageBus} />}
        </LibraryPanel> : null}
      </MarketPanelTransition>
      {cookingOpen ? (
        <CookingSimulationScreen onClose={() => setCookingOpen(false)} />
      ) : null}
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  dayJourneyAnchor: { position: 'absolute', top: 104, left: 18, right: 18, alignItems: 'center', zIndex: 35 },
  dayJourneyCard: { width: '100%', maxWidth: 410, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FAF7EE', borderRadius: 20, padding: 15, boxShadow: '0 4px 15px #584D3210' },
  dayJourneyTitle: { color: '#4F654D', fontFamily: fonts.bold, fontSize: 17, lineHeight: 23 },
  dayJourneyHint: { color: '#78816F', fontFamily: fonts.medium, fontSize: 14, lineHeight: 21, marginTop: 3 },
  busRouteButton: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, backgroundColor: '#E9EBDD', borderRadius: 13, minHeight: 45, marginTop: 16, marginBottom: 10 },
  busRouteButtonText: { color: '#526D59', fontFamily: fonts.semibold, fontSize: 16 },
  busDestinationTitle: { color: '#4D6651', fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28, marginBottom: 12 },
  busStopRouteRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  busStopRouteBadge: { backgroundColor: '#627D64', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7 },
  busStopRouteNumber: { color: '#FFFBEA', fontFamily: fonts.bold, fontSize: 25 },
  busStopRouteTitle: { flex: 1, color: '#454F44', fontFamily: fonts.semibold, fontSize: 18, lineHeight: 27 },
  busStopRoutePath: { color: '#64755D', fontFamily: fonts.medium, fontSize: 15, lineHeight: 24, marginTop: 13 },
  busStopGuidance: { color: '#675F55', fontFamily: fonts.medium, fontSize: 16, lineHeight: 26, marginTop: 14 },
  busStopChoices: { flexDirection: 'row', gap: 10 },
  root: {
    backgroundColor: '#CAD3C3',
    cursor: 'auto',
    flex: 1,
    // The browser must not scroll the world when a zoomed, off-screen control receives focus.
    overflow: Platform.OS === 'web' ? 'clip' as 'hidden' : 'hidden',
  },
  touchSurface: {
    flex: 1,
  },
  zoomScene: {
    ...StyleSheet.absoluteFill,
  },
  world: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  marketCounter: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    height: MARKET_CHECKOUT_RECT.height,
    justifyContent: 'center',
    left: MARKET_CHECKOUT_RECT.x,
    overflow: 'visible',
    position: 'absolute',
    top: MARKET_CHECKOUT_RECT.y,
    width: MARKET_CHECKOUT_RECT.width,
    zIndex: 5,
  },
  marketShelf: {
    backgroundColor: 'transparent',
    overflow: 'visible',
    position: 'absolute',
    zIndex: 5,
  },
  marketExit: {
    backgroundColor: 'transparent',
    height: 58,
    left: 375,
    position: 'absolute',
    top: 900,
    width: 150,
  },
  ground: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#DDE4D5',
    borderColor: '#B7C1AF',
    borderWidth: 12,
  },
  road: {
    backgroundColor: '#C8C6B8',
    position: 'absolute',
  },
  roadMain: {
    height: 126,
    left: -80,
    top: 444,
    transform: [{ rotate: '-18deg' }],
    width: 1160,
  },
  roadBranch: {
    height: 104,
    left: 420,
    top: 120,
    transform: [{ rotate: '49deg' }],
    width: 760,
  },
  roadEdge: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    height: 3,
    position: 'absolute',
    width: 1120,
  },
  roadEdgeOne: { left: -50, top: 444, transform: [{ rotate: '-18deg' }] },
  roadEdgeTwo: { left: -30, top: 564, transform: [{ rotate: '-18deg' }] },
  tapTargetMarker: {
    borderColor: 'rgba(52,91,68,0.72)',
    borderRadius: 12,
    borderWidth: 3,
    height: 24,
    position: 'absolute',
    width: 24,
    zIndex: 3,
  },
  building: {
    alignItems: 'center',
    position: 'absolute',
  },
  buildingFront: {
    bottom: 0,
    borderColor: 'rgba(54,54,54,0.25)',
    borderWidth: 2,
    height: '66%',
    left: 0,
    opacity: 0.86,
    position: 'absolute',
    right: 0,
  },
  buildingRoof: {
    aspectRatio: 1,
    borderColor: 'rgba(54,54,54,0.3)',
    borderWidth: 2,
    position: 'absolute',
    top: -18,
    transform: [{ rotate: '45deg' }, { scaleY: 0.64 }],
  },
  buildingDoor: {
    backgroundColor: '#5E625D',
    bottom: 0,
    height: 42,
    position: 'absolute',
    width: 28,
  },
  buildingLabel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#B9B9B9',
    borderRadius: 9,
    borderWidth: 1,
    color: '#333333',
    fontFamily: fonts.semibold,
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    position: 'absolute',
    top: 46,
  },
  marketEntrance: {
    alignItems: 'center',
    height: 76,
    justifyContent: 'center',
    left: MARKET_ENTRANCE_POINT.x - 80,
    position: 'absolute',
    top: MARKET_ENTRANCE_POINT.y - 92,
    width: 160,
    zIndex: 7,
  },
  marketCloudRoot: {
    alignItems: 'center',
    height: 74,
    justifyContent: 'center',
    position: 'relative',
    width: 160,
  },
  marketCloudBubble: {
    backgroundColor: 'rgba(255,253,248,0.97)',
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 22,
    borderWidth: 1,
    height: 42,
    position: 'absolute',
    top: 4,
    width: 42,
    zIndex: 0,
  },
  marketCloudBubbleLeft: { left: 24 },
  marketCloudBubbleRight: { right: 26, top: 7 },
  marketCloudTail: {
    backgroundColor: 'rgba(255,253,248,0.97)',
    bottom: 7,
    height: 18,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
    width: 18,
    zIndex: 1,
  },
  marketCloudBody: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,253,248,0.98)',
    borderColor: 'rgba(255,255,255,0.98)',
    borderRadius: 26,
    borderWidth: 1.5,
    elevation: 5,
    flexDirection: 'row',
    gap: 7,
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: 13,
    shadowColor: '#466A60',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    width: 150,
    zIndex: 2,
  },
  marketCloudIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(107,198,164,0.18)',
    borderRadius: 12,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  marketCloudText: {
    color: '#263A31',
    flex: 1,
    fontFamily: fonts.laundryBold,
    fontSize: 15,
    textAlign: 'center',
  },
  obstacleBlock: {
    backgroundColor: '#AAB79B',
    borderColor: '#89947E',
    borderWidth: 2,
    position: 'absolute',
  },
  centerPlanter: {
    height: 105,
    left: 406,
    top: 330,
    transform: [{ rotate: '-8deg' }],
    width: 150,
  },
  lowerBlock: {
    alignItems: 'center',
    height: 110,
    justifyContent: 'center',
    left: 120,
    top: 548,
    width: 184,
  },
  plantCircle: {
    backgroundColor: '#73876C',
    borderRadius: 35,
    height: 70,
    left: 12,
    position: 'absolute',
    top: 14,
    width: 70,
  },
  plantCircleRight: { left: 65, top: 23 },
  objectLabel: { color: '#4D5748', fontFamily: fonts.semibold, fontSize: 13 },
  npc: {
    alignItems: 'center',
    height: 78,
    left: VILLAGE_NPC_BY_ID.minsu.point.x - 32,
    position: 'absolute',
    top: VILLAGE_NPC_BY_ID.minsu.point.y - 40,
    width: PLAYER_ART_WIDTH,
    zIndex: 8,
  },
  npcInactive: { opacity: 0.75 },
  npcBody: {
    alignItems: 'center',
    backgroundColor: '#7D8FA6',
    borderColor: '#3F4D5B',
    borderRadius: 8,
    borderWidth: 2,
    height: 42,
    justifyContent: 'flex-start',
    width: 28,
  },
  npcHead: {
    backgroundColor: '#D8B493',
    borderColor: '#5E493D',
    borderRadius: 13,
    borderWidth: 2,
    height: 26,
    marginTop: -15,
    width: 26,
  },
  npcName: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    color: '#333333',
    fontFamily: fonts.semibold,
    fontSize: 11,
    marginTop: 2,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  interactionBadge: {
    alignItems: 'center',
    backgroundColor: colors.mint,
    borderColor: '#FFFFFF',
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    right: -10,
    top: -22,
    width: 30,
    zIndex: 4,
  },
  characterShadow: {
    backgroundColor: 'rgba(26,35,28,0.22)',
    borderRadius: 22,
    bottom: 0,
    height: 15,
    position: 'absolute',
    width: 46,
  },
  npcShadow: { bottom: 16, width: 38 },
  player: {
    alignItems: 'center',
    height: PLAYER_ART_HEIGHT,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -PLAYER_ART_WIDTH / 2,
    marginTop: -PLAYER_ART_PIVOT_Y,
    position: 'absolute',
    top: '50%',
    width: PLAYER_ART_WIDTH,
    zIndex: 12,
  },
  busStopHotspot: {
    alignItems: 'center',
    height: 100,
    justifyContent: 'center',
    left: BUS_STOP_POINT.x - 82,
    position: 'absolute',
    top: BUS_STOP_POINT.y - 76,
    width: 164,
    zIndex: 9,
  },
  busStopActionBadge: {
    alignItems: 'center',
    backgroundColor: '#3E8B6A',
    borderColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 2,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  busStopActionText: { color: colors.white, fontFamily: fonts.bold, fontSize: 12 },
  interactionOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 42,
  },
  interactionOverlayDim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(38,45,40,0.24)',
  },
  fridgeMenuSheet: {
    backgroundColor: '#FFFDF8',
    borderRadius: 26,
    bottom: 124,
    elevation: 12,
    maxWidth: 360,
    padding: 18,
    position: 'absolute',
    shadowColor: '#26372E',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 22,
    width: '90%',
  },
  fridgeMenuHeader: { alignItems: 'center', flexDirection: 'row' },
  fridgeMenuIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F2EA',
    borderRadius: 21,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  fridgeMenuHeaderCopy: { flex: 1, marginLeft: 11 },
  fridgeMenuTitle: { color: '#28362E', fontFamily: fonts.laundryBold, fontSize: 21 },
  fridgeMenuSubtitle: { color: '#7E8681', fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  fridgeMenuClose: {
    alignItems: 'center',
    backgroundColor: '#F1EEE7',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  fridgeCookingButton: {
    alignItems: 'center',
    backgroundColor: '#EAF3E9',
    borderRadius: 20,
    flexDirection: 'row',
    marginTop: 16,
    minHeight: 76,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  fridgeCookingIcon: {
    alignItems: 'center',
    backgroundColor: '#5D9275',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  fridgeCookingCopy: { flex: 1, marginHorizontal: 11 },
  fridgeCookingEyebrow: { color: '#6D8175', fontFamily: fonts.semibold, fontSize: 10 },
  fridgeCookingTitle: { color: '#2D4438', fontFamily: fonts.bold, fontSize: 15, marginTop: 3 },
  fridgeInspectButton: {
    alignItems: 'center',
    backgroundColor: '#F3F0E9',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 8,
    height: 52,
    justifyContent: 'center',
    marginTop: 9,
  },
  fridgeInspectText: { color: '#526158', fontFamily: fonts.semibold, fontSize: 14 },
  npcMenuSheet: {
    backgroundColor: 'rgba(255,253,248,0.98)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    borderWidth: 2,
    bottom: 128,
    elevation: 10,
    gap: 10,
    maxWidth: 350,
    padding: 18,
    position: 'absolute',
    shadowColor: '#26372E',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    width: '90%',
  },
  npcMenuHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 3,
  },
  npcMenuAvatar: {
    alignItems: 'center',
    borderRadius: 21,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  npcMenuHeaderCopy: { flex: 1, marginLeft: 11 },
  npcMenuName: { color: '#28352E', fontFamily: fonts.laundryBold, fontSize: 20 },
  npcMenuRole: { color: '#7A837D', fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  npcMenuClose: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  npcMenuPrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#EEF6F0',
    borderColor: '#D7E6DC',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    height: 52,
    justifyContent: 'center',
  },
  npcMenuPrimaryText: { color: '#355E4D', fontFamily: fonts.bold, fontSize: 15 },
  npcMenuQuestButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#3E8B6A',
    borderRadius: 26,
    flexDirection: 'row',
    gap: 8,
    height: 52,
    justifyContent: 'center',
    maxWidth: '100%',
    paddingHorizontal: 24,
  },
  npcMenuQuestText: { color: colors.white, fontFamily: fonts.bold, fontSize: 15 },
  questOfferSheet: {
    alignItems: 'center',
    backgroundColor: '#FFFDF8',
    borderColor: '#FFFFFF',
    borderRadius: 26,
    borderWidth: 2,
    bottom: 112,
    elevation: 12,
    maxWidth: 350,
    padding: 21,
    position: 'absolute',
    shadowColor: '#26372E',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 22,
    width: '90%',
  },
  questOfferBadge: {
    alignItems: 'center',
    backgroundColor: '#D5A84E',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  questOfferBadgeText: { color: colors.white, fontFamily: fonts.bold, fontSize: 12 },
  questOfferTitle: {
    color: '#29362F',
    fontFamily: fonts.laundryBold,
    fontSize: 22,
    marginTop: 14,
    textAlign: 'center',
  },
  questOfferDescription: {
    color: '#68726C',
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
  questOfferMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 14,
    width: '100%',
  },
  questOfferMetaText: { color: '#708078', fontFamily: fonts.semibold, fontSize: 12 },
  questOfferLaterButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    marginTop: 4,
    width: '100%',
  },
  questOfferLaterText: { color: '#7C857F', fontFamily: fonts.semibold, fontSize: 14 },
  infoPanelSheet: {
    alignItems: 'center',
    backgroundColor: '#FFFDF8',
    borderColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 2,
    bottom: 142,
    elevation: 12,
    maxWidth: 340,
    padding: 21,
    position: 'absolute',
    shadowColor: '#26372E',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    width: '88%',
  },
  infoPanelIcon: {
    alignItems: 'center',
    backgroundColor: '#4B9875',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  infoPanelTitle: {
    color: '#29362F',
    fontFamily: fonts.laundryBold,
    fontSize: 20,
    marginTop: 11,
    textAlign: 'center',
  },
  infoPanelBody: {
    color: '#69736D',
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
    textAlign: 'center',
  },
  infoPanelButton: {
    alignItems: 'center',
    backgroundColor: '#3E8B6A',
    borderRadius: 17,
    height: 48,
    justifyContent: 'center',
    marginTop: 16,
    width: '100%',
  },
  infoPanelButtonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 15 },
  dialogueDim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(49,50,46,0.15)',
    zIndex: 26,
  },
  dialoguePortraitAnchor: {
    bottom: 215,
    height: 238,
    left: '50%',
    marginLeft: -174,
    position: 'absolute',
    width: 174,
    zIndex: 27,
  },
  dialoguePortraitAnchorRaised: { bottom: 342 },
  dialogueBox: {
    alignSelf: 'center',
    backgroundColor: 'rgba(75,75,75,0.90)',
    borderRadius: 22,
    bottom: 131,
    height: 128,
    maxWidth: 335,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    width: '89.333%',
    zIndex: 27,
  },
  dialogueChoiceBox: { bottom: 258 },
  dialogueChoiceBoxTall: { bottom: 318 },
  dialogueSpeakerTag: {
    alignItems: 'center',
    backgroundColor: '#D4C498',
    borderRadius: 18,
    height: 34,
    justifyContent: 'center',
    left: 21,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    top: -18,
    transform: [{ rotate: '-4deg' }],
    width: 71,
    zIndex: 3,
  },
  dialogueSpeaker: { color: '#333333', fontFamily: fonts.cafe24Ssurround, fontSize: 17 },
  dialoguePressArea: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    width: '100%',
  },
  dialogueChoices: {
    alignItems: 'center',
    bottom: 139,
    gap: 10,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 28,
  },
  dialogueText: {
    color: colors.white,
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 17,
    lineHeight: 27,
    textAlign: 'center',
  },
  dialogueAdvanceIndicator: {
    borderLeftColor: 'transparent',
    borderLeftWidth: 6,
    borderRightColor: 'transparent',
    borderRightWidth: 6,
    borderTopColor: 'rgba(255,255,255,0.94)',
    borderTopWidth: 8,
    bottom: 11,
    height: 0,
    position: 'absolute',
    right: 22,
    width: 0,
  },
  quizOverlay: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', zIndex: 30 },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(49,50,46,0.18)' },
  quizPortraitAnchor: { zIndex: 0 },
  quizSheet: {
    alignSelf: 'center',
    maxWidth: 700,
    width: '100%',
    zIndex: 1,
  },
  quizChoiceStage: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: 'transparent',
    maxWidth: '100%',
    width: '100%',
  },
  quizResultSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  quizLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 310,
    paddingHorizontal: 18,
  },
  quizLoadingTitle: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: 18,
    marginTop: 14,
    textAlign: 'center',
  },
  quizLoadingDescription: {
    color: '#777777',
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
    textAlign: 'center',
  },
  quizTextButton: { marginTop: 14, padding: 8 },
  quizTextButtonLabel: { color: '#68736D', fontFamily: fonts.semibold, fontSize: 14 },
  quizDialogueCard: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(75,75,75,0.90)',
    borderRadius: 22,
    minHeight: 154,
    justifyContent: 'center',
    maxWidth: 335,
    paddingHorizontal: 22,
    paddingVertical: 22,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    width: '89.333%',
  },
  quizHeader: { alignItems: 'center', flexDirection: 'row' },
  quizNpcAvatar: {
    alignItems: 'center',
    backgroundColor: '#EAF0F7',
    borderRadius: 20,
    height: 48,
    justifyContent: 'flex-end',
    width: 48,
  },
  quizHeaderCopy: { flex: 1, marginLeft: 10 },
  quizNpcName: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15 },
  quizIntro: { color: '#888888', fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  quizQuestion: {
    color: colors.white,
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 17,
    lineHeight: 27,
    textAlign: 'center',
  },
  quizMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 7,
  },
  quizProgressText: { color: '#DDE6E1', fontFamily: fonts.bold, fontSize: 11 },
  quizAiBadge: {
    backgroundColor: '#DFF7E9',
    borderRadius: 9,
    color: '#277354',
    fontFamily: fonts.bold,
    fontSize: 10,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  quizSituation: {
    color: '#E8E8E8',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    textAlign: 'center',
  },
  quizFeedback: {
    color: '#FFC1A6',
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 7,
    textAlign: 'center',
  },
  quizFeedbackCorrect: { color: '#9CE7BE' },
  quizAnswers: {
    alignItems: 'center',
    bottom: 139,
    gap: 10,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  quizAnswer: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    maxWidth: 335,
    overflow: 'hidden',
    paddingHorizontal: 42,
  },
  quizAnswerSelected: {
    backgroundColor: '#F2FFF7',
    borderColor: colors.brightMint,
    borderWidth: 2,
  },
  quizAnswerWrong: {
    backgroundColor: '#FFF4EF',
    borderColor: '#F4A17B',
    borderWidth: 2,
  },
  quizAnswerText: {
    color: '#333333',
    flexShrink: 1,
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 17,
    lineHeight: 20,
    textAlign: 'center',
    transform: [{ translateY: 1 }],
  },
  quizButton: {
    alignItems: 'center',
    backgroundColor: colors.mint,
    borderRadius: 18,
    height: 56,
    justifyContent: 'center',
    marginTop: 16,
  },
  quizButtonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 17 },
  quizNextButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.mint,
    borderRadius: 20,
    bottom: 65,
    height: 52,
    justifyContent: 'center',
    maxWidth: 335,
    position: 'absolute',
    width: '89.333%',
  },
  quizSyncNotice: {
    color: '#777777',
    fontFamily: fonts.regular,
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
  disabled: { opacity: 0.38 },
  result: { alignItems: 'center', paddingTop: 10 },
  resultIconStage: { alignItems: 'center', height: 76, justifyContent: 'center', width: 76 },
  resultBurst: {
    backgroundColor: colors.brightMint,
    borderRadius: 38,
    height: 76,
    position: 'absolute',
    width: 76,
  },
  resultIcon: {
    alignItems: 'center',
    backgroundColor: colors.mint,
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: PLAYER_ART_WIDTH,
  },
  resultDetails: { alignItems: 'center', width: '100%' },
  resultTitle: { color: colors.ink, fontFamily: fonts.laundryBold, fontSize: 24, marginTop: 14 },
  resultDescription: { color: '#777777', fontFamily: fonts.regular, fontSize: 14, marginTop: 6 },
  xpCard: {
    alignItems: 'center',
    backgroundColor: '#EEFFF5',
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    width: '100%',
  },
  xpLabel: { color: '#547060', fontFamily: fonts.semibold, fontSize: 14 },
  xpValue: { color: colors.mint, fontFamily: fonts.extraBold, fontSize: 20 },
});
