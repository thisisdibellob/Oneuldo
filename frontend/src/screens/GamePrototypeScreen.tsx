import { DIALOGUE_CHARACTER_DELAY, DIALOGUE_CLEAR_VOLUME, isSilentGamePreview } from '../game/dialogueFeedback';
import { useDialogueAudio } from '../components/game/useDialogueAudio';
import { useGamePreferences } from '../game/gamePreferences';
import { getMarketNavigationPath } from '../game/marketNavigation';
import { getMarketRecoveryPoint } from '../game/marketRecovery';
import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
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
} from 'react-native';

import { icons } from '../assets';
import { DirectionalAvatar } from '../components/game/DirectionalAvatar';
import { GameHud } from '../components/game/GameHud';
import { GameContactCall } from '../components/game/GameContactCall';
import { MarketPanelTransition } from '../components/game/MarketPanelTransition';
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
  facingFromVector,
  type AvatarFacing,
  type AvatarMotion,
} from '../game/avatarAnimation';
import { freshPlayerAvatar } from '../game/freshPlayerAvatar';
import { getMarketRenderDepth, getNearestMarketStation, getMarketStationApproachPoint, MARKET_ENVIRONMENT_PLAYER_RADIUS, createMarketEnvironment, isMarketEnvironmentBlocked, type MarketEnvironment, type MarketEnvironmentStationId, type MarketCashierAvailability } from '../game/marketEnvironment';
import {
  BUS_STOP_POINT,
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
import { marketCategories } from '../game/scenarios';
import {
  clampWorldZoom,
  getWorldCameraFrame,
  MARKET_DEFAULT_ZOOM,
  screenPointToWorld,
  WORLD_ZOOM_MIN,
  zoomFromPinch,
  zoomFromWheel,
} from '../game/worldZoom';
import { colors, fonts } from '../theme';
import {
  MarketInteractionRequest,
  MarketSimulationScreen,
} from './MarketSimulationScreen';
import { CashierSimulationScreen } from './CashierSimulationScreen';
import { CookingSimulationScreen } from './CookingSimulationScreen';

// Add ?muteAudio=1 to developer preview URLs for silent interaction checks.

const PLAYER_RADIUS = 22;
const PLAYER_ART_SCALE = 0.5;
const PLAYER_ART_HEIGHT = MODULAR_CHARACTER_CANVAS.height * PLAYER_ART_SCALE;
const PLAYER_ART_WIDTH = MODULAR_CHARACTER_CANVAS.width * PLAYER_ART_SCALE;
const PLAYER_ART_PIVOT_Y = MODULAR_CHARACTER_CANVAS.pivotY * PLAYER_ART_SCALE;
const MOVE_SPEED = 190;
const RUN_SPEED_MULTIPLIER = 1.55;
const BACKGROUND_MUSIC_VOLUME = 0.5;
const BACKGROUND_MUSIC_DUCKED_VOLUME = 0.25;
const ACCESSIBILITY_STEP = 58;
const JOYSTICK_RADIUS = 34;
const JOYSTICK_SIZE = 110;
const JOYSTICK_ZONE_HEIGHT = 270;
const DIALOGUE_READ_DELAY = 360;

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
type NpcInteractionChoice = 'npc-cashier' | 'npc-quest' | 'npc-talk';
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

const quizAnswers = ['초록불인지 확인해요', '차가 오기 전에 빨리 건너요'];

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
  { kind: 'line', text: '그럼 우리 같이 조금 걸을까?' },
  { kind: 'line', text: '좋아! 저기 횡단보도까지 가 보자.' },
  {
    kind: 'line',
    text: '가는 길에 안전하게 건너는 방법도 같이 떠올려 보자.',
  },
] as const satisfies readonly DialogueStep[];

function resolveDialogueText(
  step: DialogueStep | undefined,
  selectedChoice: DailyConversationChoice | null,
) {
  if (!step) return '';
  if (step.kind !== 'response') return step.text;
  return selectedChoice ? step.responses[selectedChoice] : '';
}

type QuizStep = 'question' | 'result' | null;
type ControlMode = 'joystick' | 'touch';
type NearbyMarketStation = MarketEnvironmentStationId | null;
type NearbyHomeStation = HomeStationId | null;
type PendingPortal = VillagePortalId | null;
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
  driver: 'bus-route',
  jiyoung: 'market-shopping',
  minsu: 'minsu-safety',
};
function getWorldBounds(worldMap: WorldMapId, environment?: MarketEnvironment) {
  return worldMap === 'market' && environment ? environment.world : WORLD_BOUNDS[worldMap];
}

function isBlocked(point: Point, worldMap: WorldMapId, environment: MarketEnvironment, cashierCalled: Partial<MarketCashierAvailability> = {}) {
  if (worldMap === 'market') return isMarketEnvironmentBlocked(environment, point, cashierCalled);
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
  onExit: () => void;
};

export function GamePrototypeScreen({ onExit }: GamePrototypeScreenProps) {
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
  const backgroundMusicStatus = useAudioPlayerStatus(backgroundMusic);
  const viewportNode = useRef<View | null>(null);
  const camera = useRef(new Animated.ValueXY()).current;
  const playerCameraOffset = useRef(new Animated.ValueXY()).current;
  const marketPlayerPosition = useRef(new Animated.ValueXY(INITIAL_PLAYER_POINT)).current;
  const marketPlayerDepth = useRef(new Animated.Value(getMarketRenderDepth(INITIAL_PLAYER_POINT.y))).current;
  const cameraCenter = useRef<Point>({ ...INITIAL_PLAYER_POINT });
  const worldZoom = useRef(new Animated.Value(WORLD_ZOOM_MIN)).current;
  const joystickKnob = useRef(new Animated.ValueXY()).current;
  const dialoguePanelProgress = useRef(new Animated.Value(0)).current;
  const dailyChoiceProgress = useRef(new Animated.Value(0)).current;
  const quizPanelProgress = useRef(new Animated.Value(0)).current;
  const speakerTagFloat = useRef(new Animated.Value(0)).current;
  const dialogueArrowFloat = useRef(new Animated.Value(0)).current;
  const resultCelebration = useRef(new Animated.Value(0)).current;
  const playerPoint = useRef<Point>({ ...INITIAL_PLAYER_POINT });
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
  const keyboardDirection = useRef<Point>({ x: 0, y: 0 });
  const keyboardEngaged = useRef(false);
  const pressedMovementKeys = useRef(new Set<string>());
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
  const joystickZoneSize = useRef({ width: 220, height: JOYSTICK_ZONE_HEIGHT });
  const dialogueReadyAt = useRef(Number.POSITIVE_INFINITY);
  const startNpcGreetingRef = useRef<(npcId: VillageNpcId) => void>(() => undefined);
  const playerFacingRef = useRef<AvatarFacing>('front');
  const playerMotionRef = useRef<AvatarMotion>('idle');

  const [nearbyNpcId, setNearbyNpcId] = useState<VillageNpcId | null>(null);
  const [nearbyPortalId, setNearbyPortalId] = useState<PendingPortal>(null);
  const [marketStationNearby, setMarketStationNearby] = useState<NearbyMarketStation>(null);
  const [nearbyHomeStation, setNearbyHomeStation] = useState<NearbyHomeStation>(null);
  const [busStopNearby, setBusStopNearby] = useState(false);
  const [marketScenarioLocked, setMarketScenarioLocked] = useState(false);
  const [marketEnvironment, setMarketEnvironment] = useState(() => createMarketEnvironment());
  const marketEnvironmentRef = useRef(marketEnvironment);
  const [marketCashierCalled, setMarketCashierCalled] = useState<Partial<MarketCashierAvailability>>({});
  const marketCashierCalledRef = useRef<Partial<MarketCashierAvailability>>({});
  const marketVisitNumber = useRef(0);
  const [marketInteractionRequest, setMarketInteractionRequest] =
    useState<MarketInteractionRequest | null>(null);
  const [fridgeMenuOpen, setFridgeMenuOpen] = useState(false);
  const [cookingOpen, setCookingOpen] = useState(false);
  const [cashierOpen, setCashierOpen] = useState(false);
  const [worldMap, setWorldMap] = useState<WorldMapId>('village');
  const [audioModeReady, setAudioModeReady] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [controlMode, setControlMode] = useState<ControlMode>('joystick');
  const [hudMenuOpen, setHudMenuOpen] = useState(false);
  const [phoneContact, setPhoneContact] = useState<'jiyoung' | 'minsu' | null>(null);
  const [phoneCallPresent, setPhoneCallPresent] = useState(false);
  const closePhoneCall = useCallback(() => setPhoneContact(null), []);
  const [runEnabled, setRunEnabled] = useState(false);
  const [playerAvatarPose, setPlayerAvatarPose] = useState<{
    facing: AvatarFacing;
    motion: AvatarMotion;
  }>({ facing: 'front', motion: 'idle' });
  const [tapTargetMarker, setTapTargetMarker] = useState<Point | null>(null);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickCenter, setJoystickCenter] = useState({ x: 76, y: 190 });
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
  const [quizStep, setQuizStep] = useState<QuizStep>(null);
  const [renderedQuizStep, setRenderedQuizStep] = useState<Exclude<QuizStep, null>>('question');
  const [quizPanelMounted, setQuizPanelMounted] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showWrongFeedback, setShowWrongFeedback] = useState(false);
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
    marketScenarioLocked;

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
      const frame = getWorldCameraFrame(point, viewport.current, worldZoomCurrentRef.current,
        worldMapRef.current === 'market' ? marketEnvironmentRef.current.world : undefined);
      cameraCenter.current = frame.center;
      camera.setValue(frame.translation);
      playerCameraOffset.setValue(frame.playerOffset);
      if (worldMapRef.current === 'market') {
        marketPlayerPosition.setValue(point);
        marketPlayerDepth.setValue(getMarketRenderDepth(point.y));
      }
    },
    [camera, playerCameraOffset, marketPlayerPosition, marketPlayerDepth],
  );

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
      if (distance <= limit && distance < closestNpcDistance) {
        closestNpc = npc.id;
        closestNpcDistance = distance;
      }
    });
    setNpc(closestNpc);

    const portalDistances: Array<[VillagePortalId, number]> = [
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
      if (distance <= limit && distance < closestPortalDistance) {
        closestPortal = portal;
        closestPortalDistance = distance;
      }
    });
    setPortal(closestPortal);
    setBusStop(
      Math.hypot(point.x - BUS_STOP_POINT.x, point.y - BUS_STOP_POINT.y) <=
        VILLAGE_PORTAL_INTERACTION_DISTANCE,
    );
  }, []);

  const syncPlayerAvatarPose = useCallback((x: number, y: number, moving: boolean) => {
    const nextFacing = facingFromVector(x, y, playerFacingRef.current);
    const nextMotion: AvatarMotion = moving && Math.hypot(x, y) >= 0.04 ? 'walk' : 'idle';
    if (nextFacing === playerFacingRef.current && nextMotion === playerMotionRef.current) return;

    playerFacingRef.current = nextFacing;
    playerMotionRef.current = nextMotion;
    setPlayerAvatarPose({ facing: nextFacing, motion: nextMotion });
  }, []);

  const movePlayer = useCallback(
    (dx: number, dy: number) => {
      const current = playerPoint.current;
      let next = current;
      const activeMap = worldMapRef.current;

      // Sample large accessibility steps so they cannot cross a thin wall.
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
      for (let index = 0; index < steps; index += 1) {
        const xCandidate = clampPoint({ x: next.x + dx / steps, y: next.y }, activeMap, marketEnvironmentRef.current);
        if (!isBlocked(xCandidate, activeMap, marketEnvironmentRef.current, marketCashierCalledRef.current)) next = xCandidate;
        const yCandidate = clampPoint({ x: next.x, y: next.y + dy / steps }, activeMap, marketEnvironmentRef.current);
        if (!isBlocked(yCandidate, activeMap, marketEnvironmentRef.current, marketCashierCalledRef.current)) next = yCandidate;
      }

      playerPoint.current = next;
      if (activeMap === 'market') marketMovementListener.current?.(current, next);
      updateCamera(next);
      updateNpcProximity(next);
      return next;
    },
    [updateCamera, updateNpcProximity],
  );

  const stopMovement = useCallback(() => {
    direction.current = { x: 0, y: 0 };
    keyboardDirection.current = { x: 0, y: 0 };
    keyboardEngaged.current = false;
    pressedMovementKeys.current.clear();
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
    setJoystickActive(false);
    setTapTargetMarker(null);
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }
    Animated.spring(joystickKnob, {
      damping: 16,
      mass: 0.7,
      stiffness: 240,
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
    }).start();
  }, [joystickKnob, syncPlayerAvatarPose]);

  const handleExit = useCallback(() => {
    stopMovement();
    if (worldMapRef.current === 'market') {
      setMarketInteractionRequest((request) => ({ id: (request?.id ?? 0) + 1, station: 'give-up' }));
      return;
    }
    if (backgroundMusicStatus.isLoaded) {
      try {
        backgroundMusic.pause();
      } catch {
        // The player may already have been released during a fast refresh.
      }
    }
    onExit();
  }, [backgroundMusic, backgroundMusicStatus.isLoaded, onExit, stopMovement]);

  const prepareMapTransition = useCallback(() => {
    stopMovement();
    speedMultiplier.current = 1;
    setRunEnabled(false);
    setQuestOfferId(null);
    setInfoPanel(null);
    setFridgeMenuOpen(false);
    setCookingOpen(false);
  }, [stopMovement]);

  const handleEnterMarket = useCallback(() => {
    if (nearbyPortalIdRef.current !== 'market') return;
    prepareMapTransition();
    marketVisitNumber.current += 1;
    const environment = createMarketEnvironment({ seed: `market-${Date.now()}-${marketVisitNumber.current}` });
    marketEnvironmentRef.current = environment;
    setMarketEnvironment(environment);
    marketCashierCalledRef.current = {};
    setMarketCashierCalled({});
    setMarketScenarioLocked(true);
    worldMapRef.current = 'market';
    setWorldMap('market');
    playerPoint.current = { ...environment.spawn };
    updateCamera(playerPoint.current);
    updateNpcProximity(playerPoint.current);
  }, [prepareMapTransition, updateCamera, updateNpcProximity]);

  const handleMarketEnvironmentChange = useCallback((environment: MarketEnvironment) => {
    marketEnvironmentRef.current = environment;
    setMarketEnvironment(environment);
    marketCashierCalledRef.current = {};
    setMarketCashierCalled({});
    playerPoint.current = { ...environment.spawn };
    updateCamera(playerPoint.current);
    updateNpcProximity(playerPoint.current);
  }, [updateCamera, updateNpcProximity]);

  const handleMarketCashierCalled = useCallback((availability: MarketCashierAvailability) => {
    marketCashierCalledRef.current = availability;
    setMarketCashierCalled(availability);
  }, []);

  const handleLeaveMarket = useCallback(() => {
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
  }, [prepareMapTransition, updateCamera, updateNpcProximity]);

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
          pendingBusStopInteraction.current && busStopNearbyRef.current;

        if (distance <= 3 && tapWaypoints.current.length && !marketStationInteractionReached) {
          movePlayer(dx, dy);
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
          if (portalToUse === 'home') handleEnterHome();
          if (marketStationToUse) {
            setMarketInteractionRequest((currentRequest) => ({
              id: (currentRequest?.id ?? 0) + 1,
              station: marketStationToUse,
            }));
          }
          if (homeStationToUse === 'exit') handleLeaveHome();
          if (homeStationToUse === 'fridge') {
            openFridgeMenu();
          }
          if (shouldCheckBusStop) {
            if (questStatusesRef.current['bus-route'] === 'active') {
              completeDailyQuest('bus-route');
              setInfoPanel({
                body: '목적지로 가는 버스 번호와 정류장 위치를 확인했어요.',
                title: '버스를 찾았어요',
              });
            } else {
              setInfoPanel({
                body: '기사님에게 의뢰를 받은 뒤 목적지 버스를 확인할 수 있어요.',
                title: '동쪽 버스정류장',
              });
            }
          }
          return;
        }

        const step = Math.min(distance, MOVE_SPEED * speedMultiplier.current * elapsedSeconds);
        syncPlayerAvatarPose(dx, dy, true);
        const next = movePlayer((dx / distance) * step, (dy / distance) * step);
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

      const combinedX = direction.current.x + keyboardDirection.current.x;
      const combinedY = direction.current.y + keyboardDirection.current.y;
      const combinedLength = Math.hypot(combinedX, combinedY);
      const movementScale = combinedLength > 1 ? 1 / combinedLength : 1;
      syncPlayerAvatarPose(combinedX, combinedY, combinedLength >= 0.04);
      movePlayer(
        combinedX * movementScale * MOVE_SPEED * speedMultiplier.current * elapsedSeconds,
        combinedY * movementScale * MOVE_SPEED * speedMultiplier.current * elapsedSeconds,
      );
      if (joystickEngaged.current || keyboardEngaged.current) {
        animationFrame.current = requestAnimationFrame(runMovement);
      } else {
        previousFrame.current = null;
        animationFrame.current = null;
      }
    },
    [
      completeDailyQuest,
      handleEnterHome,
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
      if (
        !WEB_MOVEMENT_KEYS[event.code] ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      if (controlsLockedRef.current) return;

      if (pressedMovementKeys.current.size === 0) stopMovement();
      pressedMovementKeys.current.add(event.code);
      syncKeyboardDirection();
      beginMovement();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!WEB_MOVEMENT_KEYS[event.code]) return;
      event.preventDefault();
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

  const joystickResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !controlsLockedRef.current,
      onMoveShouldSetPanResponder: () => !controlsLockedRef.current,
      onPanResponderGrant: (event) => {
        const half = JOYSTICK_SIZE / 2;
        const { height, width } = joystickZoneSize.current;
        setJoystickCenter({
          x: Math.max(half, Math.min(event.nativeEvent.locationX, width - half)),
          y: Math.max(half, Math.min(event.nativeEvent.locationY, height - half)),
        });
        setJoystickActive(true);
        joystickEngaged.current = true;
        joystickKnob.stopAnimation();
        joystickKnob.setValue({ x: 0, y: 0 });
        direction.current = { x: 0, y: 0 };
        beginMovement();
      },
      onPanResponderMove: (_event, gesture) => {
        const distance = Math.hypot(gesture.dx, gesture.dy);
        const scale = distance > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / distance : 1;
        const x = gesture.dx * scale;
        const y = gesture.dy * scale;
        joystickKnob.setValue({ x, y });
        direction.current = { x: x / JOYSTICK_RADIUS, y: y / JOYSTICK_RADIUS };
      },
      onPanResponderRelease: stopMovement,
      onPanResponderTerminate: stopMovement,
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;

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

  useEffect(() => {
    const previousMap = previousZoomMapRef.current;
    previousZoomMapRef.current = worldMap;
    if (previousMap === worldMap) return;
    if (worldMap !== 'market' && previousMap !== 'market') return;
    if (worldMap === 'market') outsideMarketZoomRef.current = worldZoomTargetRef.current;
    const target = worldMap === 'market' ? MARKET_DEFAULT_ZOOM : outsideMarketZoomRef.current;
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
    const volume = DEVELOPMENT_AUDIO_MUTED ? 0 : preferences.musicVolume;
    backgroundMusic.volume = volume * (dialoguePanelMounted || quizPanelMounted
      ? BACKGROUND_MUSIC_DUCKED_VOLUME : BACKGROUND_MUSIC_VOLUME);
    if (volume === 0) { backgroundMusic.pause(); return; }
    if (!audioModeReady || !backgroundMusicStatus.isLoaded) return;
    backgroundMusic.loop = true;
    backgroundMusic.play();
  }, [audioModeReady, backgroundMusic, backgroundMusicStatus.isLoaded, DEVELOPMENT_AUDIO_MUTED,
    dialoguePanelMounted, preferences.musicVolume, quizPanelMounted]);

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
    if (quizStep !== 'result') {
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
  }, [quizStep, reduceMotionEnabled, resultCelebration]);

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
    if (quizStep) {
      setRenderedQuizStep(quizStep);
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
  }, [quizPanelProgress, quizStep, reduceMotionEnabled]);

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
    viewportNode.current?.measureInWindow((x, y) => {
      viewportOrigin.current = { x, y };
    });
    updateCamera(playerPoint.current);
    updateNpcProximity(playerPoint.current);
  };

  const handleJoystickZoneLayout = (event: LayoutChangeEvent) => {
    joystickZoneSize.current = event.nativeEvent.layout;
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
    setSelectedAnswer(null);
    setShowWrongFeedback(false);
    setQuizStep('question');
  };

  const startTapMovement = (
    desired: Point,
    interaction: TapInteractionOptions = {},
  ) => {
    if (controlsLockedRef.current) return;
    stopMovement();
    const target = findReachableTarget(playerPoint.current, desired, worldMapRef.current, marketEnvironmentRef.current, marketCashierCalledRef.current);
    if (Math.hypot(target.x - playerPoint.current.x, target.y - playerPoint.current.y) < 2) return;
    const path = worldMapRef.current === 'market'
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
    setTapTargetMarker(target);
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

    const current = playerPoint.current;
    const dx = current.x - npc.point.x;
    const dy = current.y - npc.point.y;
    const distance = Math.max(Math.hypot(dx, dy), 1);
    const approachDistance = VILLAGE_NPC_INTERACTION_DISTANCE - 18;
    startTapMovement(
      {
        x: npc.point.x + (dx / distance) * approachDistance,
        y: npc.point.y + (dy / distance) * approachDistance,
      },
      { npcId: npc.id },
    );
  };

  const handlePortalPress = (
    event: GestureResponderEvent,
    portalId: VillagePortalId,
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
      else handleEnterHome();
      return;
    }

    const portalPoint =
      portalId === 'market' ? MARKET_ENTRANCE_POINT : HOUSE_ENTRANCE_POINT;
    const current = playerPoint.current;
    const dx = current.x - portalPoint.x;
    const dy = current.y - portalPoint.y;
    const distance = Math.max(Math.hypot(dx, dy), 1);
    const approachDistance = VILLAGE_PORTAL_INTERACTION_DISTANCE - 18;
    startTapMovement(
      {
        x: portalPoint.x + (dx / distance) * approachDistance,
        y: portalPoint.y + (dy / distance) * approachDistance,
      },
      { portalId },
    );
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
      } else {
        openFridgeMenu();
      }
      return;
    }

    const stationPoint = station === 'exit' ? HOME_EXIT_POINT : HOME_FRIDGE_POINT;
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

  const handleBusStopInteraction = () => {
    if (!busStopNearbyRef.current) return;
    if (questStatusesRef.current['bus-route'] === 'active') {
      completeDailyQuest('bus-route');
      setInfoPanel({
        body: '목적지로 가는 버스 번호와 정류장 위치를 확인했어요.',
        title: '버스를 찾았어요',
      });
      return;
    }
    setInfoPanel({
      body: '기사님에게 의뢰를 받은 뒤 목적지 버스를 확인할 수 있어요.',
      title: '동쪽 버스정류장',
    });
  };

  const handleBusStopPress = (event: GestureResponderEvent) => {
    event?.stopPropagation?.();
    if (
      controlMode !== 'touch' ||
      controlsLockedRef.current ||
      zoomGestureActiveRef.current ||
      suppressWorldPressRef.current
    ) return;
    if (busStopNearbyRef.current) {
      handleBusStopInteraction();
      return;
    }
    const current = playerPoint.current;
    const dx = current.x - BUS_STOP_POINT.x;
    const dy = current.y - BUS_STOP_POINT.y;
    const distance = Math.max(Math.hypot(dx, dy), 1);
    const approachDistance = VILLAGE_PORTAL_INTERACTION_DISTANCE - 18;
    startTapMovement(
      {
        x: BUS_STOP_POINT.x + (dx / distance) * approachDistance,
        y: BUS_STOP_POINT.y + (dy / distance) * approachDistance,
      },
      { busStop: true },
    );
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

    if (
      busStopNearbyRef.current &&
      questStatusesRef.current['bus-route'] === 'active'
    ) {
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
          ? '정류장 표지판 가까이에서 행동 버튼을 눌러 목적지 버스를 확인해요.'
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
            ? '동쪽 정류장에서 목적지 버스를 확인해요.'
            : '하늘마트 안에서 장보기 목록을 완성해요.',
      title: VILLAGE_NPC_BY_ID[npcId].name + '의 의뢰를 받았어요',
    });
  };

  const handleDialogueChoicePress = (choice: DialogueChoice) => {
    if (!dialogueChoiceVisible || currentDialogueStep?.kind !== 'choice' || dialogueIndex === null) {
      return;
    }

    if (currentDialogueStep.purpose === 'npc-action') {
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
    setQuizStep(null);
    setDialogueMode(null);
    setSelectedAnswer(null);
    setShowWrongFeedback(false);
  };

  const handleQuizAnswerPress = (index: number) => {
    setSelectedAnswer(index);
    if (index === 0) {
      setShowWrongFeedback(false);
      completeDailyQuest('minsu-safety');
      setQuizStep('result');
      return;
    }
    setShowWrongFeedback(true);
  };

  const marketStationCategory =
    marketStationNearby && marketStationNearby !== 'checkout' && marketStationNearby !== 'exit'
      ? marketCategories.find(({ id }) => id === marketStationNearby)
      : null;
  const nearbyNpcName = nearbyNpcId ? VILLAGE_NPC_BY_ID[nearbyNpcId].name : null;
  const activeBusStopInteraction =
    busStopNearby && dailyQuestStatuses['bus-route'] === 'active';
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
        ? nearbyHomeStation === 'fridge'
          ? '냉장고 열기'
          : nearbyHomeStation === 'exit'
            ? '집에서 마을로 나가기'
            : '가까이 가면 상호작용할 수 있어요'
        : activeBusStopInteraction
          ? '동쪽 버스정류장 확인하기'
          : nearbyNpcName
            ? `${nearbyNpcName}와 대화 또는 의뢰 선택하기`
          : nearbyPortalId === 'market'
            ? '하늘마트 들어가기'
            : nearbyPortalId === 'home'
              ? '집으로 들어가기'
              : busStopNearby
                ? '동쪽 버스정류장 확인하기'
                : '상호작용할 대상이 없습니다';
  const interactionIcon =
    worldMap === 'market'
      ? (marketStationNearby === 'checkout' || marketStationNearby === 'checkout-2' || marketStationNearby?.startsWith('kiosk:'))
        ? 'card-outline'
        : marketStationNearby === 'common-door'
          ? 'exit-outline'
          : 'search'
      : worldMap === 'home'
        ? nearbyHomeStation === 'fridge'
          ? 'snow-outline'
          : 'exit-outline'
        : activeBusStopInteraction
          ? 'bus'
          : nearbyNpcId
            ? 'chatbubbles'
          : nearbyPortalId === 'market'
            ? 'storefront'
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
        ? nearbyHomeStation === 'fridge'
          ? '열기'
          : nearbyHomeStation === 'exit'
            ? '나가기'
            : '행동'
        : activeBusStopInteraction
          ? '확인'
          : nearbyNpcId
            ? '대화'
          : nearbyPortalId
            ? '입장'
            : busStopNearby
              ? '확인'
              : '행동';

  const offeredQuest = questOfferId
    ? dailyQuests.find((quest) => quest.id === questOfferId) ?? null
    : null;
  const offeredNpc = questOfferId
    ? VILLAGE_NPCS.find((npc) => NPC_QUEST_IDS[npc.id] === questOfferId) ?? null
    : null;

  const joystickControlsVisible =
    controlMode === 'joystick' &&
    !hudMenuOpen &&
    !dialoguePanelMounted &&
    !quizPanelMounted &&
    !fridgeMenuOpen &&
    !cookingOpen &&
    !cashierOpen &&
    !marketScenarioLocked;

  if (cashierOpen) {
    return <CashierSimulationScreen onExit={() => setCashierOpen(false)} />;
  }

  return (
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
              />
              <PressScale
                accessibilityHint={
                  controlMode === 'touch'
                    ? busStopNearby
                      ? '목적지 버스를 확인합니다'
                      : '정류장 앞으로 이동합니다'
                    : undefined
                }
                accessibilityLabel="동쪽 버스정류장으로 이동해 확인하기"
                accessibilityRole={controlMode === 'touch' ? 'button' : undefined}
                disabled={controlMode !== 'touch' || controlsLockedRef.current}
                onPress={handleBusStopPress}
                scaleTo={0.96}
                style={styles.busStopHotspot}
              >
                {busStopNearby ? (
                  <View style={styles.busStopActionBadge}>
                    <Ionicons color={colors.white} name="bus" size={17} />
                    <Text style={styles.busStopActionText}>버스 확인</Text>
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
              transform: marketPlayerPosition.getTranslateTransform() }]}>
            <DirectionalAvatar facing={playerAvatarPose.facing} manifest={freshPlayerAvatar}
              motion={playerAvatarPose.motion} reduceMotion={reduceMotionEnabled} scale={PLAYER_ART_SCALE} />
          </Animated.View> : null}
        </Animated.View>

        {worldMap !== 'market' ? <Animated.View accessibilityLabel="내 캐릭터" pointerEvents="none"
          style={[styles.player, { transform: playerCameraOffset.getTranslateTransform() }]}>
          <DirectionalAvatar
            facing={playerAvatarPose.facing}
            manifest={freshPlayerAvatar}
            motion={playerAvatarPose.motion}
            reduceMotion={reduceMotionEnabled}
            scale={PLAYER_ART_SCALE}
          />
        </Animated.View> : null}
      </Animated.View>


      {joystickControlsVisible ? (
      <View
        accessibilityActions={[
          { label: '위로 이동', name: 'moveUp' },
          { label: '아래로 이동', name: 'moveDown' },
          { label: '왼쪽으로 이동', name: 'moveLeft' },
          { label: '오른쪽으로 이동', name: 'moveRight' },
        ]}
        accessibilityLabel="이동 조이스틱"
        accessibilityRole="adjustable"
        accessibilityState={{ disabled: dialoguePanelMounted || quizPanelMounted }}
        onLayout={handleJoystickZoneLayout}
        onAccessibilityAction={(event) => handleAccessibilityMove(event.nativeEvent.actionName)}
        style={[styles.joystickZone, worldMap === 'market' && styles.marketJoystickZone]}
        {...joystickResponder.panHandlers}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.joystick,
            {
              left: joystickCenter.x - JOYSTICK_SIZE / 2,
              opacity: joystickActive ? 1 : 0.42,
              top: joystickCenter.y - JOYSTICK_SIZE / 2,
            },
          ]}
        >
          <View style={styles.joystickGuideHorizontal} />
          <View style={styles.joystickGuideVertical} />
          <Animated.View
            style={[styles.joystickKnob, { transform: joystickKnob.getTranslateTransform() }]}
          />
        </Animated.View>
      </View>
      ) : null}

      {joystickControlsVisible ? (
      <View style={[styles.actionCluster, worldMap === 'market' && styles.marketActionCluster]}>
        <PressScale
          accessibilityLabel={interactionLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: !interactionAvailable || quizPanelMounted }}
          disabled={!interactionAvailable || quizPanelMounted}
          onPress={(event) => {
            event?.stopPropagation?.();
            handleInteraction();
          }}
          scaleTo={0.92}
          style={[
            styles.actionButton,
            styles.interactionButton,
            !interactionAvailable && styles.actionButtonDisabled,
          ]}
        >
          <Ionicons color={colors.white} name={interactionIcon} size={23} />
          <Text style={styles.interactionActionText}>{interactionActionText}</Text>
        </PressScale>
        <PressScale
          accessibilityHint="한 번 누르면 달리기를 켜고 다시 누르면 끕니다"
          accessibilityLabel={runEnabled ? '달리기 끄기' : '달리기 켜기'}
          accessibilityRole="button"
          accessibilityState={{ selected: runEnabled }}
          disabled={dialoguePanelMounted || quizPanelMounted}
          onPress={(event) => {
            event?.stopPropagation?.();
            setRunEnabled((enabled) => {
              const next = !enabled;
              speedMultiplier.current = next ? RUN_SPEED_MULTIPLIER : 1;
              return next;
            });
          }}
          scaleTo={0.9}
          style={[styles.actionButton, styles.runButton, runEnabled && styles.runButtonActive]}
        >
          <Ionicons color={runEnabled ? colors.white : '#39493F'} name="walk" size={23} />
        </PressScale>
      </View>
      ) : null}

      {!cookingOpen && !phoneContact && !phoneCallPresent && (worldMap !== 'market' || !marketScenarioLocked) ? (
        <GameHud
          controlMode={controlMode}
          dailyQuests={dailyQuests}
          onControlModeChange={selectControlMode}
          onEmergencyExit={handleEmergencyExit}
          onExit={handleExit}
          onMenuVisibilityChange={handleHudMenuVisibilityChange}
          onCallContact={contact => {
            stopMovement();
            if (contact === 'jiyoung' && worldMap === 'market') {
              setMarketInteractionRequest(current => ({ id: (current?.id ?? 0) + 1, station: 'contact-requester' }));
            } else setPhoneContact(contact);
          }}
        />
      ) : null}

      {worldMap === 'market' ? (
        <MarketSimulationScreen
          externalMenuOpen={hudMenuOpen || phoneContact !== null || phoneCallPresent}
          controlMode={controlMode}
          onControlModeChange={selectControlMode}
          environment={marketEnvironment}
          onEnvironmentChange={handleMarketEnvironmentChange}
          onCashierCalled={handleMarketCashierCalled}
          playerPositionRef={playerPoint}
          playerMovementListenerRef={marketMovementListener}
          embedded
          interactionRequest={marketInteractionRequest}
          onExit={handleLeaveMarket}
          onLockChange={setMarketScenarioLocked}
          onMissionComplete={() => completeDailyQuest('market-shopping')}
        />
      ) : null}

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
            {renderedQuizStep === 'question' ? (
              <>
                <View style={styles.quizDialogueCard}>
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
                  <Text style={styles.quizQuestion}>
                    {showWrongFeedback
                      ? <>괜찮아요.{'\n'}신호등을 먼저 살펴봐요.</>
                      : <>횡단보도를 건너기 전에{'\n'}무엇을 먼저 확인할까요?</>}
                  </Text>
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.dialogueAdvanceIndicator,
                      { transform: [{ translateY: dialogueArrowFloat }] },
                    ]}
                  />
                </View>

                <Animated.View
                  accessibilityLabel="횡단보도 안전 퀴즈 선택지"
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
                  {quizAnswers.map((answer, index) => {
                    const selected = selectedAnswer === index;
                    const wrong = showWrongFeedback && selected;
                    return (
                      <PressScale
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        key={answer}
                        onPress={() => handleQuizAnswerPress(index)}
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
                          {answer}
                        </Text>
                      </PressScale>
                    );
                  })}
                </Animated.View>

              </>
            ) : (
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
                  <Text style={styles.resultTitle}>퀴즈를 마쳤어요!</Text>
                  <Text style={styles.resultDescription}>신호를 확인하고 안전하게 건너요.</Text>
                  <View style={styles.xpCard}>
                    <Text style={styles.xpLabel}>받은 경험치</Text>
                    <Text style={styles.xpValue}>+10 XP</Text>
                  </View>
                  <PressScale accessibilityRole="button" onPress={closeQuiz} style={styles.quizButton}>
                    <Text style={styles.quizButtonText}>마을로 돌아가기</Text>
                  </PressScale>
                </Animated.View>
              </View>
            )}
          </Animated.View>
        </View>
      ) : null}
      </Pressable>
      <MarketPanelTransition visible={phoneContact !== null} transitionKey={`phone-call-${phoneContact}`} onPresenceChange={setPhoneCallPresent}>
        {phoneContact ? <GameContactCall key={phoneContact} contact={phoneContact} inMarket={worldMap === 'market'} onClose={closePhoneCall} /> : null}
      </MarketPanelTransition>
      {cookingOpen ? (
        <CookingSimulationScreen onClose={() => setCookingOpen(false)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  joystickZone: {
    bottom: 104,
    height: JOYSTICK_ZONE_HEIGHT,
    left: 0,
    position: 'absolute',
    width: '58%',
    zIndex: 20,
  },
  marketJoystickZone: { bottom: 128 },
  joystick: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.52)',
    borderColor: 'rgba(49,61,52,0.22)',
    borderRadius: 55,
    borderWidth: 2,
    height: JOYSTICK_SIZE,
    justifyContent: 'center',
    position: 'absolute',
    width: JOYSTICK_SIZE,
  },
  joystickGuideHorizontal: {
    backgroundColor: 'rgba(62,78,67,0.12)',
    height: 2,
    position: 'absolute',
    width: 70,
  },
  joystickGuideVertical: {
    backgroundColor: 'rgba(62,78,67,0.12)',
    height: 70,
    position: 'absolute',
    width: 2,
  },
  joystickKnob: {
    backgroundColor: 'rgba(60,76,65,0.82)',
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 24,
    borderWidth: 2,
    height: 48,
    width: 48,
  },
  actionCluster: {
    bottom: 142,
    height: 112,
    position: 'absolute',
    right: 18,
    width: 132,
    zIndex: 22,
  },
  marketActionCluster: { bottom: 166 },
  actionButton: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.7)',
    borderWidth: 2,
    justifyContent: 'center',
    position: 'absolute',
  },
  interactionButton: {
    backgroundColor: '#2E8061',
    borderColor: '#F8EDCF',
    borderRadius: 32,
    borderWidth: 3,
    bottom: 0,
    height: 64,
    right: 0,
    shadowColor: '#20352B',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    width: PLAYER_ART_WIDTH,
  },
  interactionActionText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 9,
    letterSpacing: -0.1,
    marginTop: 1,
  },
  runButton: {
    backgroundColor: 'rgba(255,250,236,0.88)',
    borderColor: 'rgba(75,64,46,0.28)',
    borderRadius: 26,
    borderWidth: 2,
    height: 52,
    left: 0,
    top: 0,
    width: 52,
  },
  runButtonActive: { backgroundColor: '#4C6E5A' },
  actionButtonDisabled: { opacity: 0.34 },
  busStopHotspot: {
    alignItems: 'center',
    height: 92,
    justifyContent: 'center',
    left: BUS_STOP_POINT.x - 68,
    position: 'absolute',
    top: BUS_STOP_POINT.y - 46,
    width: 136,
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
  quizDialogueCard: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(75,75,75,0.90)',
    borderRadius: 22,
    bottom: 258,
    height: 128,
    justifyContent: 'center',
    maxWidth: 335,
    paddingHorizontal: 22,
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
