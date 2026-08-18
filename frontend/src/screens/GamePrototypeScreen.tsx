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
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { icons } from '../assets';
import { GameHud, type DailyQuestItem } from '../components/game/GameHud';
import { MODULAR_CHARACTER_CANVAS, ModularCharacter } from '../components/game/ModularCharacter';
import { PressScale } from '../components/PressScale';
import { marketGameArt, playerGameArt } from '../game/gameAssets';
import { MarketCategoryId, marketCategories } from '../game/scenarios';
import { colors, fonts } from '../theme';
import {
  MarketInteractionRequest,
  MarketSimulationScreen,
  MarketStationId,
} from './MarketSimulationScreen';

const VILLAGE_WORLD_WIDTH = 1000;
const VILLAGE_WORLD_HEIGHT = 900;
const MARKET_WORLD_WIDTH = 900;
const MARKET_WORLD_HEIGHT = 1000;
const PLAYER_RADIUS = 22;
const PLAYER_ART_SCALE = 0.5;
const PLAYER_ART_HEIGHT = MODULAR_CHARACTER_CANVAS.height * PLAYER_ART_SCALE;
const PLAYER_ART_WIDTH = MODULAR_CHARACTER_CANVAS.width * PLAYER_ART_SCALE;
const PLAYER_ART_PIVOT_Y = MODULAR_CHARACTER_CANVAS.pivotY * PLAYER_ART_SCALE;
const MOVE_SPEED = 190;
const RUN_SPEED_MULTIPLIER = 1.55;
const BACKGROUND_MUSIC_VOLUME = 0.18;
const BACKGROUND_MUSIC_DUCKED_VOLUME = 0.1;
const ACCESSIBILITY_STEP = 58;
const JOYSTICK_RADIUS = 34;
const JOYSTICK_SIZE = 110;
const JOYSTICK_ZONE_HEIGHT = 270;
const DIALOGUE_CHARACTER_DELAY = 34;
const DIALOGUE_READ_DELAY = 360;
const INTERACTION_DISTANCE = 116;
const NPC_POINT = { x: 610, y: 520 };
const INITIAL_PLAYER_POINT = { x: 480, y: 700 };
const MARKET_ENTRANCE_POINT = { x: 775, y: 346 };
const MARKET_RETURN_POINT = { x: 775, y: 404 };
const MARKET_INTERACTION_DISTANCE = 92;
const MARKET_STATION_INTERACTION_DISTANCE = 105;
const MARKET_PLAYER_POINT = { x: 450, y: 820 };
const MARKET_EXIT_POINT = { x: 450, y: 950 };

const MARKET_STATIONS: Record<MarketStationId | 'exit', Point> = {
  checkout: { x: 450, y: 250 },
  fresh: { x: 350, y: 400 },
  produce: { x: 550, y: 400 },
  meal: { x: 350, y: 680 },
  drink: { x: 550, y: 680 },
  exit: MARKET_EXIT_POINT,
};

const MARKET_SHELVES: Record<MarketCategoryId, Rect> = {
  fresh: { height: 128, width: 220, x: 90, y: 310 },
  produce: { height: 128, width: 220, x: 590, y: 310 },
  meal: { height: 128, width: 220, x: 90, y: 590 },
  drink: { height: 128, width: 220, x: 590, y: 590 },
};

const villageObstacles = [
  { x: 112, y: 116, width: 238, height: 184 },
  { x: 660, y: 122, width: 230, height: 190 },
  { x: 406, y: 330, width: 150, height: 105 },
  { x: 120, y: 548, width: 184, height: 110 },
];

const marketObstacles: Rect[] = [
  { height: 105, width: 250, x: 325, y: 92 },
  ...Object.values(MARKET_SHELVES),
];

type DailyConversationChoice = 'fun' | 'tired';
type DialogueStep =
  | { kind: 'line'; text: string }
  | {
      kind: 'choice';
      options: readonly { id: DailyConversationChoice; label: string }[];
      text: string;
    }
  | { kind: 'response'; responses: Record<DailyConversationChoice, string> };

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
  { kind: 'line', text: '가는 길에 안전하게 건너는 방법도 같이 떠올려 보자.' },
] as const satisfies readonly DialogueStep[];

function resolveDialogueText(
  step: DialogueStep | undefined,
  selectedChoice: DailyConversationChoice | null,
) {
  if (!step) return '';
  if (step.kind !== 'response') return step.text;
  return selectedChoice ? step.responses[selectedChoice] : '';
}

const DAILY_QUEST_DEFINITIONS = [
  {
    description: '안내원 민수와 대화를 시작해요.',
    id: 'greet-minsu',
    rewardXp: 5,
    title: '민수에게 인사하기',
  },
  {
    description: '횡단보도 안전 문제를 맞혀요.',
    id: 'safety-quiz',
    rewardXp: 10,
    title: '안전 퀴즈 풀기',
  },
  {
    description: '마트 입구로 가서 안으로 들어가요.',
    id: 'visit-market',
    rewardXp: 10,
    title: '하늘마트 방문하기',
  },
  {
    description: '목록에 있는 물건을 모두 준비해요.',
    id: 'market-list',
    rewardXp: 30,
    title: '장보기 목록 완성하기',
  },
] as const satisfies readonly Omit<DailyQuestItem, 'completed'>[];

type DailyQuestId = (typeof DAILY_QUEST_DEFINITIONS)[number]['id'];

type Point = { x: number; y: number };
type Rect = { height: number; width: number; x: number; y: number };
type QuizStep = 'question' | 'result' | null;
type ControlMode = 'joystick' | 'touch';
type WorldMapId = 'village' | 'market';
type NearbyMarketStation = MarketStationId | 'exit' | null;

function getWorldBounds(worldMap: WorldMapId) {
  return worldMap === 'market'
    ? { height: MARKET_WORLD_HEIGHT, width: MARKET_WORLD_WIDTH }
    : { height: VILLAGE_WORLD_HEIGHT, width: VILLAGE_WORLD_WIDTH };
}

function isBlocked(point: Point, worldMap: WorldMapId) {
  const obstacles = worldMap === 'market' ? marketObstacles : villageObstacles;
  return obstacles.some(
    (obstacle) =>
      point.x + PLAYER_RADIUS > obstacle.x &&
      point.x - PLAYER_RADIUS < obstacle.x + obstacle.width &&
      point.y + PLAYER_RADIUS > obstacle.y &&
      point.y - PLAYER_RADIUS < obstacle.y + obstacle.height,
  );
}

function clampPoint(point: Point, worldMap: WorldMapId): Point {
  const { height, width } = getWorldBounds(worldMap);
  return {
    x: Math.max(PLAYER_RADIUS, Math.min(point.x, width - PLAYER_RADIUS)),
    y: Math.max(PLAYER_RADIUS, Math.min(point.y, height - PLAYER_RADIUS)),
  };
}

function findReachableTarget(current: Point, desired: Point, worldMap: WorldMapId): Point {
  const clamped = clampPoint(desired, worldMap);
  for (let step = 12; step >= 0; step -= 1) {
    const ratio = step / 12;
    const candidate = {
      x: current.x + (clamped.x - current.x) * ratio,
      y: current.y + (clamped.y - current.y) * ratio,
    };
    if (!isBlocked(candidate, worldMap)) return candidate;
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
  nearbyStation,
  onStationPress,
  tapTargetMarker,
}: {
  controlMode: ControlMode;
  nearbyStation: NearbyMarketStation;
  onStationPress: (event: GestureResponderEvent, station: MarketStationId | 'exit') => void;
  tapTargetMarker: Point | null;
}) {
  return (
    <>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="stretch"
        source={marketGameArt.base}
        style={styles.marketArtBase}
      />

      {tapTargetMarker && controlMode === 'touch' ? (
        <View
          pointerEvents="none"
          style={[styles.tapTargetMarker, { left: tapTargetMarker.x - 12, top: tapTargetMarker.y - 12 }]}
          testID="touch-target-marker"
        />
      ) : null}

      <PressScale
        accessibilityLabel={controlMode === 'touch' ? '계산대로 이동' : '계산대'}
        accessibilityRole={controlMode === 'touch' ? 'button' : undefined}
        disabled={controlMode !== 'touch'}
        onPress={(event) => onStationPress(event, 'checkout')}
        scaleTo={0.98}
        style={[
          styles.marketCounter,
          styles.marketCounterIllustrated,
          nearbyStation === 'checkout' && styles.marketObjectActive,
        ]}
      >
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={marketGameArt.checkout}
          style={styles.marketCounterArt}
        />
        {nearbyStation === 'checkout' ? (
          <View pointerEvents="none" style={styles.marketCounterNameplate}>
            <Ionicons color="#3F725B" name="card-outline" size={14} />
            <Text style={styles.marketCounterText}>계산대</Text>
          </View>
        ) : null}
      </PressScale>

      {marketCategories.map((category) => {
        const shelf = MARKET_SHELVES[category.id];
        return (
          <PressScale
            accessibilityLabel={controlMode === 'touch' ? `${category.label} 진열대로 이동` : `${category.label} 진열대`}
            accessibilityRole={controlMode === 'touch' ? 'button' : undefined}
            disabled={controlMode !== 'touch'}
            key={category.id}
            onPress={(event) => onStationPress(event, category.id)}
            scaleTo={0.98}
            style={[
              styles.marketShelf,
              styles.marketShelfIllustrated,
              { height: shelf.height, left: shelf.x, top: shelf.y, width: shelf.width },
              nearbyStation === category.id && styles.marketObjectActive,
            ]}
          >
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="contain"
              source={marketGameArt.shelves[category.id]}
              style={styles.marketShelfArt}
            />
            {nearbyStation === category.id ? (
              <View pointerEvents="none" style={[styles.marketShelfLabel, { backgroundColor: category.color }]}>
                <Ionicons color="#FFFFFF" name={category.icon as 'leaf' | 'fish' | 'fast-food' | 'water'} size={15} />
                <Text style={styles.marketShelfLabelText}>{category.label}</Text>
              </View>
            ) : null}
          </PressScale>
        );
      })}

      <PressScale
        accessibilityLabel={controlMode === 'touch' ? '마트 출구로 이동' : '마트 출구'}
        accessibilityRole={controlMode === 'touch' ? 'button' : undefined}
        disabled={controlMode !== 'touch'}
        onPress={(event) => onStationPress(event, 'exit')}
        scaleTo={0.98}
        style={[
          styles.marketExit,
          nearbyStation !== 'exit' && styles.marketExitInactive,
          nearbyStation === 'exit' && styles.marketObjectActive,
        ]}
      >
        {nearbyStation === 'exit' ? (
          <>
            <Ionicons color="#627269" name="exit-outline" size={20} />
            <Text style={styles.marketExitText}>마을로 나가기</Text>
          </>
        ) : null}
      </PressScale>
    </>
  );
}

type GamePrototypeScreenProps = {
  onExit: () => void;
};

export function GamePrototypeScreen({ onExit }: GamePrototypeScreenProps) {
  const backgroundMusic = useAudioPlayer(require('../../assets/audio/maple-square.mp3'), {
    downloadFirst: true,
    keepAudioSessionActive: true,
  });
  const dialogueBlipOne = useAudioPlayer(require('../../assets/audio/dialogue-blip-1.wav'), {
    downloadFirst: true,
    keepAudioSessionActive: true,
  });
  const dialogueBlipTwo = useAudioPlayer(require('../../assets/audio/dialogue-blip-2.wav'), {
    downloadFirst: true,
    keepAudioSessionActive: true,
  });
  const dialogueBlipThree = useAudioPlayer(require('../../assets/audio/dialogue-blip-3.wav'), {
    downloadFirst: true,
    keepAudioSessionActive: true,
  });
  const backgroundMusicStatus = useAudioPlayerStatus(backgroundMusic);
  const dialogueBlipOneStatus = useAudioPlayerStatus(dialogueBlipOne);
  const dialogueBlipTwoStatus = useAudioPlayerStatus(dialogueBlipTwo);
  const dialogueBlipThreeStatus = useAudioPlayerStatus(dialogueBlipThree);
  const viewportNode = useRef<View | null>(null);
  const camera = useRef(new Animated.ValueXY()).current;
  const joystickKnob = useRef(new Animated.ValueXY()).current;
  const dialoguePanelProgress = useRef(new Animated.Value(0)).current;
  const dailyChoiceProgress = useRef(new Animated.Value(0)).current;
  const quizPanelProgress = useRef(new Animated.Value(0)).current;
  const speakerTagFloat = useRef(new Animated.Value(0)).current;
  const dialogueArrowFloat = useRef(new Animated.Value(0)).current;
  const resultCelebration = useRef(new Animated.Value(0)).current;
  const playerPoint = useRef<Point>({ ...INITIAL_PLAYER_POINT });
  const worldMapRef = useRef<WorldMapId>('village');
  const viewport = useRef({ width: 0, height: 0 });
  const viewportOrigin = useRef({ x: 0, y: 0 });
  const direction = useRef<Point>({ x: 0, y: 0 });
  const speedMultiplier = useRef(1);
  const tapTarget = useRef<Point | null>(null);
  const pendingNpcInteraction = useRef(false);
  const pendingMarketInteraction = useRef(false);
  const pendingMarketStationInteraction = useRef<NearbyMarketStation>(null);
  const joystickEngaged = useRef(false);
  const touchHoldActivated = useRef(false);
  const clearSoundTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const animationFrame = useRef<number | null>(null);
  const previousFrame = useRef<number | null>(null);
  const nearbyRef = useRef(false);
  const marketNearbyRef = useRef(false);
  const marketStationNearbyRef = useRef<NearbyMarketStation>(null);
  const controlsLockedRef = useRef(false);
  const joystickZoneSize = useRef({ width: 220, height: JOYSTICK_ZONE_HEIGHT });
  const dialogueReadyAt = useRef(Number.POSITIVE_INFINITY);
  const startDialogueRef = useRef<() => void>(() => undefined);

  const [npcNearby, setNpcNearby] = useState(false);
  const [marketNearby, setMarketNearby] = useState(false);
  const [marketStationNearby, setMarketStationNearby] = useState<NearbyMarketStation>(null);
  const [marketScenarioLocked, setMarketScenarioLocked] = useState(false);
  const [marketInteractionRequest, setMarketInteractionRequest] =
    useState<MarketInteractionRequest | null>(null);
  const [worldMap, setWorldMap] = useState<WorldMapId>('village');
  const [audioModeReady, setAudioModeReady] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [controlMode, setControlMode] = useState<ControlMode>('joystick');
  const [hudMenuOpen, setHudMenuOpen] = useState(false);
  const [runEnabled, setRunEnabled] = useState(false);
  const [tapTargetMarker, setTapTargetMarker] = useState<Point | null>(null);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickCenter, setJoystickCenter] = useState({ x: 76, y: 190 });
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
  const [completedDailyQuestIds, setCompletedDailyQuestIds] = useState<DailyQuestId[]>([]);
  const completeDailyQuest = useCallback((questId: DailyQuestId) => {
    setCompletedDailyQuestIds((currentIds) =>
      currentIds.includes(questId) ? currentIds : [...currentIds, questId],
    );
  }, []);
  const dailyQuests: DailyQuestItem[] = DAILY_QUEST_DEFINITIONS.map((quest) => ({
    ...quest,
    completed: completedDailyQuestIds.includes(quest.id),
  }));
  const currentDialogueStep = dialogueIndex === null ? undefined : dialogueSteps[dialogueIndex];
  const currentDialogue = resolveDialogueText(currentDialogueStep, selectedDailyChoice);
  const renderedDialogueStep = dialogueSteps[renderedDialogueIndex];
  const renderedDialogue = resolveDialogueText(renderedDialogueStep, selectedDailyChoice);
  const dailyChoiceVisible =
    currentDialogueStep?.kind === 'choice' &&
    visibleDialogueCharacters >= currentDialogue.length;
  controlsLockedRef.current =
    dialoguePanelMounted ||
    quizPanelMounted ||
    dialogueIndex !== null ||
    quizStep !== null ||
    hudMenuOpen ||
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
      camera.setValue({
        x: viewport.current.width / 2 - point.x,
        y: viewport.current.height / 2 - point.y,
      });
    },
    [camera],
  );

  const updateNpcProximity = useCallback((point: Point) => {
    if (worldMapRef.current === 'market') {
      if (nearbyRef.current) {
        nearbyRef.current = false;
        setNpcNearby(false);
      }
      if (marketNearbyRef.current) {
        marketNearbyRef.current = false;
        setMarketNearby(false);
      }
      let closest: NearbyMarketStation = null;
      let closestDistance = Number.POSITIVE_INFINITY;
      (Object.entries(MARKET_STATIONS) as Array<[MarketStationId | 'exit', Point]>).forEach(
        ([station, stationPoint]) => {
          const distance = Math.hypot(point.x - stationPoint.x, point.y - stationPoint.y);
          if (distance <= MARKET_STATION_INTERACTION_DISTANCE && distance < closestDistance) {
            closest = station;
            closestDistance = distance;
          }
        },
      );
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
    const nearby = Math.hypot(point.x - NPC_POINT.x, point.y - NPC_POINT.y) <= INTERACTION_DISTANCE;
    if (nearby !== nearbyRef.current) {
      nearbyRef.current = nearby;
      setNpcNearby(nearby);
    }

    const marketDistance = Math.hypot(
      point.x - MARKET_ENTRANCE_POINT.x,
      point.y - MARKET_ENTRANCE_POINT.y,
    );
    const marketProximityLimit = marketNearbyRef.current
      ? MARKET_INTERACTION_DISTANCE * 1.18
      : MARKET_INTERACTION_DISTANCE;
    const nearMarket = marketDistance <= marketProximityLimit;
    if (nearMarket !== marketNearbyRef.current) {
      marketNearbyRef.current = nearMarket;
      setMarketNearby(nearMarket);
    }
  }, []);

  const movePlayer = useCallback(
    (dx: number, dy: number) => {
      const current = playerPoint.current;
      let next = current;
      const activeMap = worldMapRef.current;

      const xCandidate = clampPoint({ x: current.x + dx, y: current.y }, activeMap);
      if (!isBlocked(xCandidate, activeMap)) next = xCandidate;

      const yCandidate = clampPoint({ x: next.x, y: next.y + dy }, activeMap);
      if (!isBlocked(yCandidate, activeMap)) next = yCandidate;

      playerPoint.current = next;
      updateCamera(next);
      updateNpcProximity(next);
      return next;
    },
    [updateCamera, updateNpcProximity],
  );

  const stopMovement = useCallback(() => {
    direction.current = { x: 0, y: 0 };
    joystickEngaged.current = false;
    tapTarget.current = null;
    pendingNpcInteraction.current = false;
    pendingMarketInteraction.current = false;
    pendingMarketStationInteraction.current = null;
    previousFrame.current = null;
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
  }, [joystickKnob]);

  const handleExit = useCallback(() => {
    stopMovement();
    if (backgroundMusicStatus.isLoaded) {
      try {
        backgroundMusic.pause();
      } catch {
        // The player may already have been released during a fast refresh.
      }
    }
    onExit();
  }, [backgroundMusic, backgroundMusicStatus.isLoaded, onExit, stopMovement]);

  const handleEnterMarket = useCallback(() => {
    if (!marketNearbyRef.current) return;
    stopMovement();
    speedMultiplier.current = 1;
    setRunEnabled(false);
    setMarketScenarioLocked(true);
    worldMapRef.current = 'market';
    setWorldMap('market');
    completeDailyQuest('visit-market');
    playerPoint.current = { ...MARKET_PLAYER_POINT };
    updateCamera(playerPoint.current);
    updateNpcProximity(playerPoint.current);
  }, [completeDailyQuest, stopMovement, updateCamera, updateNpcProximity]);

  const handleLeaveMarket = useCallback(() => {
    stopMovement();
    speedMultiplier.current = 1;
    setRunEnabled(false);
    setMarketScenarioLocked(false);
    setMarketInteractionRequest(null);
    worldMapRef.current = 'village';
    setWorldMap('village');
    playerPoint.current = { ...MARKET_RETURN_POINT };
    updateCamera(playerPoint.current);
    updateNpcProximity(playerPoint.current);
  }, [stopMovement, updateCamera, updateNpcProximity]);

  const handleEmergencyExit = useCallback(() => {
    stopMovement();
    speedMultiplier.current = 1;
    setRunEnabled(false);
    playerPoint.current = {
      ...(worldMapRef.current === 'market' ? MARKET_PLAYER_POINT : INITIAL_PLAYER_POINT),
    };
    updateCamera(playerPoint.current);
    updateNpcProximity(playerPoint.current);
  }, [stopMovement, updateCamera, updateNpcProximity]);

  const handleHudMenuVisibilityChange = useCallback((open: boolean) => {
    if (open) stopMovement();
    setHudMenuOpen(open);
  }, [stopMovement]);

  const runMovement = useCallback(
    (timestamp: number) => {
      const last = previousFrame.current ?? timestamp;
      const elapsedSeconds = Math.min(timestamp - last, 32) / 1000;
      previousFrame.current = timestamp;
      const target = tapTarget.current;

      if (target) {
        const current = playerPoint.current;
        const dx = target.x - current.x;
        const dy = target.y - current.y;
        const distance = Math.hypot(dx, dy);
        const npcInteractionReached = pendingNpcInteraction.current && nearbyRef.current;
        const marketInteractionReached =
          pendingMarketInteraction.current && marketNearbyRef.current;
        const pendingStation = pendingMarketStationInteraction.current;
        const marketStationInteractionReached =
          pendingStation !== null && marketStationNearbyRef.current === pendingStation;

        if (
          distance <= 3 ||
          npcInteractionReached ||
          marketInteractionReached ||
          marketStationInteractionReached
        ) {
          const shouldTalk = pendingNpcInteraction.current && nearbyRef.current;
          const shouldEnterMarket =
            pendingMarketInteraction.current && marketNearbyRef.current;
          const stationToUse = marketStationInteractionReached ? pendingStation : null;
          tapTarget.current = null;
          pendingNpcInteraction.current = false;
          pendingMarketInteraction.current = false;
          pendingMarketStationInteraction.current = null;
          previousFrame.current = null;
          animationFrame.current = null;
          setTapTargetMarker(null);
          if (shouldTalk) startDialogueRef.current();
          if (shouldEnterMarket) handleEnterMarket();
          if (stationToUse === 'exit') handleLeaveMarket();
          else if (stationToUse) {
            setMarketInteractionRequest((currentRequest) => ({
              id: (currentRequest?.id ?? 0) + 1,
              station: stationToUse,
            }));
          }
          return;
        }

        const step = Math.min(distance, MOVE_SPEED * speedMultiplier.current * elapsedSeconds);
        const next = movePlayer((dx / distance) * step, (dy / distance) * step);
        const moved = Math.hypot(next.x - current.x, next.y - current.y);
        if (step > 0 && moved < 0.05) {
          tapTarget.current = null;
          pendingNpcInteraction.current = false;
          pendingMarketInteraction.current = false;
          pendingMarketStationInteraction.current = null;
          previousFrame.current = null;
          animationFrame.current = null;
          setTapTargetMarker(null);
          return;
        }
        animationFrame.current = requestAnimationFrame(runMovement);
        return;
      }

      movePlayer(
        direction.current.x * MOVE_SPEED * speedMultiplier.current * elapsedSeconds,
        direction.current.y * MOVE_SPEED * speedMultiplier.current * elapsedSeconds,
      );
      if (joystickEngaged.current) {
        animationFrame.current = requestAnimationFrame(runMovement);
      } else {
        previousFrame.current = null;
        animationFrame.current = null;
      }
    },
    [handleEnterMarket, handleLeaveMarket, movePlayer],
  );

  const beginMovement = useCallback(() => {
    if (animationFrame.current === null) {
      animationFrame.current = requestAnimationFrame(runMovement);
    }
  }, [runMovement]);

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

    const timer = setTimeout(() => {
      setVisibleDialogueCharacters((count) => Math.min(count + 1, currentDialogue.length));
    }, DIALOGUE_CHARACTER_DELAY);
    return () => clearTimeout(timer);
  }, [currentDialogue, dialogueIndex, visibleDialogueCharacters]);

  useEffect(() => {
    dailyChoiceProgress.stopAnimation();
    if (!dailyChoiceVisible) {
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
  }, [dailyChoiceProgress, dailyChoiceVisible, reduceMotionEnabled]);

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
    if (!audioModeReady || !backgroundMusicStatus.isLoaded) return;
    backgroundMusic.loop = true;
    backgroundMusic.volume = BACKGROUND_MUSIC_VOLUME;
    backgroundMusic.play();
  }, [audioModeReady, backgroundMusic, backgroundMusicStatus.isLoaded]);

  useEffect(() => {
    if (!backgroundMusicStatus.isLoaded) return;
    backgroundMusic.volume = dialoguePanelMounted || quizPanelMounted
      ? BACKGROUND_MUSIC_DUCKED_VOLUME
      : BACKGROUND_MUSIC_VOLUME;
  }, [backgroundMusic, backgroundMusicStatus.isLoaded, dialoguePanelMounted, quizPanelMounted]);

  useEffect(() => {
    dialogueBlipOne.volume = 0.32;
    dialogueBlipTwo.volume = 0.32;
    dialogueBlipThree.volume = 0.32;
  }, [dialogueBlipOne, dialogueBlipThree, dialogueBlipTwo]);

  useEffect(() => {
    if (!audioModeReady || dialogueIndex === null || visibleDialogueCharacters === 0) return;
    const lastCharacter = currentDialogue[visibleDialogueCharacters - 1];
    if (visibleDialogueCharacters % 2 === 0 || !lastCharacter || /[\s.,!?…]/.test(lastCharacter)) return;

    const players = [
      { isLoaded: dialogueBlipOneStatus.isLoaded, player: dialogueBlipOne },
      { isLoaded: dialogueBlipTwoStatus.isLoaded, player: dialogueBlipTwo },
      { isLoaded: dialogueBlipThreeStatus.isLoaded, player: dialogueBlipThree },
    ];
    const { isLoaded, player } = players[visibleDialogueCharacters % players.length];
    if (!isLoaded) return;
    void player
      .seekTo(0)
      .then(() => player.play())
      .catch(() => undefined);
  }, [
    audioModeReady,
    currentDialogue,
    dialogueBlipOne,
    dialogueBlipOneStatus.isLoaded,
    dialogueBlipThree,
    dialogueBlipThreeStatus.isLoaded,
    dialogueBlipTwo,
    dialogueBlipTwoStatus.isLoaded,
    dialogueIndex,
    visibleDialogueCharacters,
  ]);

  useEffect(() => {
    clearSoundTimers.current.forEach(clearTimeout);
    clearSoundTimers.current = [];
    if (!audioModeReady || quizStep !== 'result') return undefined;

    const notes = [
      { delay: 0, isLoaded: dialogueBlipOneStatus.isLoaded, player: dialogueBlipOne },
      { delay: 85, isLoaded: dialogueBlipTwoStatus.isLoaded, player: dialogueBlipTwo },
      { delay: 170, isLoaded: dialogueBlipThreeStatus.isLoaded, player: dialogueBlipThree },
    ];
    clearSoundTimers.current = notes.map(({ delay, isLoaded, player }) =>
      setTimeout(() => {
        if (!isLoaded) return;
        void player
          .seekTo(0)
          .then(() => player.play())
          .catch(() => undefined);
      }, delay),
    );

    return () => {
      clearSoundTimers.current.forEach(clearTimeout);
      clearSoundTimers.current = [];
    };
  }, [
    audioModeReady,
    dialogueBlipOne,
    dialogueBlipOneStatus.isLoaded,
    dialogueBlipThree,
    dialogueBlipThreeStatus.isLoaded,
    dialogueBlipTwo,
    dialogueBlipTwoStatus.isLoaded,
    quizStep,
  ]);

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
    if (actionName === 'moveUp') movePlayer(0, -ACCESSIBILITY_STEP);
    if (actionName === 'moveDown') movePlayer(0, ACCESSIBILITY_STEP);
    if (actionName === 'moveLeft') movePlayer(-ACCESSIBILITY_STEP, 0);
    if (actionName === 'moveRight') movePlayer(ACCESSIBILITY_STEP, 0);
  };

  const openQuiz = () => {
    if (!nearbyRef.current) return;
    stopMovement();
    speedMultiplier.current = 1;
    setRunEnabled(false);
    setDialogueIndex(null);
    setSelectedAnswer(null);
    setShowWrongFeedback(false);
    setQuizStep('question');
  };

  const beginDialogue = () => {
    if (!nearbyRef.current) return;
    completeDailyQuest('greet-minsu');
    stopMovement();
    speedMultiplier.current = 1;
    setRunEnabled(false);
    dialogueReadyAt.current = Number.POSITIVE_INFINITY;
    setVisibleDialogueCharacters(0);
    setSelectedDailyChoice(null);
    setDialogueIndex(0);
  };
  startDialogueRef.current = beginDialogue;

  const startTapMovement = (
    desired: Point,
    talkWhenNear = false,
    enterMarketWhenNear = false,
    marketStationWhenNear: NearbyMarketStation = null,
  ) => {
    if (controlsLockedRef.current) return;
    stopMovement();
    const target = findReachableTarget(playerPoint.current, desired, worldMapRef.current);
    if (Math.hypot(target.x - playerPoint.current.x, target.y - playerPoint.current.y) < 2) return;
    tapTarget.current = target;
    pendingNpcInteraction.current = talkWhenNear;
    pendingMarketInteraction.current = enterMarketWhenNear;
    pendingMarketStationInteraction.current = marketStationWhenNear;
    setTapTargetMarker(target);
    beginMovement();
  };

  const getTouchedWorldPoint = (event: GestureResponderEvent) => {
    const current = playerPoint.current;
    const { locationX, locationY, pageX, pageY } = event.nativeEvent;
    const localX = Number.isFinite(pageX) ? pageX - viewportOrigin.current.x : locationX;
    const localY = Number.isFinite(pageY) ? pageY - viewportOrigin.current.y : locationY;
    const safeX = Math.max(0, Math.min(localX, viewport.current.width));
    const safeY = Math.max(0, Math.min(localY, viewport.current.height));
    return {
      x: current.x + safeX - viewport.current.width / 2,
      y: current.y + safeY - viewport.current.height / 2,
    };
  };

  const handleWorldPressIn = () => {
    if (controlMode !== 'touch' || controlsLockedRef.current) return;
    touchHoldActivated.current = false;
  };

  const handleWorldLongPress = (event: GestureResponderEvent) => {
    if (controlMode !== 'touch' || controlsLockedRef.current) return;
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
    if (!touchHoldActivated.current) return;
    stopMovement();
  };

  const handleWorldPress = (event: GestureResponderEvent) => {
    if (controlMode !== 'touch' || controlsLockedRef.current) return;
    if (touchHoldActivated.current) {
      touchHoldActivated.current = false;
      return;
    }
    startTapMovement(getTouchedWorldPoint(event));
  };

  const handleNpcPress = (event: GestureResponderEvent) => {
    event?.stopPropagation?.();
    if (controlMode !== 'touch' || controlsLockedRef.current) return;
    if (nearbyRef.current) {
      beginDialogue();
      return;
    }

    const current = playerPoint.current;
    const dx = current.x - NPC_POINT.x;
    const dy = current.y - NPC_POINT.y;
    const distance = Math.max(Math.hypot(dx, dy), 1);
    const approachDistance = INTERACTION_DISTANCE - 18;
    startTapMovement(
      {
        x: NPC_POINT.x + (dx / distance) * approachDistance,
        y: NPC_POINT.y + (dy / distance) * approachDistance,
      },
      true,
    );
  };

  const handleMarketPress = (event: GestureResponderEvent) => {
    event?.stopPropagation?.();
    if (controlMode !== 'touch' || controlsLockedRef.current) return;
    if (marketNearbyRef.current) {
      handleEnterMarket();
      return;
    }

    const current = playerPoint.current;
    const dx = current.x - MARKET_ENTRANCE_POINT.x;
    const dy = current.y - MARKET_ENTRANCE_POINT.y;
    const distance = Math.max(Math.hypot(dx, dy), 1);
    const approachDistance = MARKET_INTERACTION_DISTANCE - 18;
    startTapMovement(
      {
        x: MARKET_ENTRANCE_POINT.x + (dx / distance) * approachDistance,
        y: MARKET_ENTRANCE_POINT.y + (dy / distance) * approachDistance,
      },
      false,
      true,
    );
  };

  const handleMarketStationPress = (
    event: GestureResponderEvent,
    station: MarketStationId | 'exit',
  ) => {
    event?.stopPropagation?.();
    if (controlMode !== 'touch' || controlsLockedRef.current) return;
    if (marketStationNearbyRef.current === station) {
      if (station === 'exit') handleLeaveMarket();
      else {
        setMarketInteractionRequest((currentRequest) => ({
          id: (currentRequest?.id ?? 0) + 1,
          station,
        }));
      }
      return;
    }
    const stationPoint = MARKET_STATIONS[station];
    const current = playerPoint.current;
    const dx = current.x - stationPoint.x;
    const dy = current.y - stationPoint.y;
    const distance = Math.max(Math.hypot(dx, dy), 1);
    const approachDistance = MARKET_STATION_INTERACTION_DISTANCE - 18;
    startTapMovement(
      {
        x: stationPoint.x + (dx / distance) * approachDistance,
        y: stationPoint.y + (dy / distance) * approachDistance,
      },
      false,
      false,
      station,
    );
  };

  const selectControlMode = (mode: ControlMode) => {
    stopMovement();
    speedMultiplier.current = 1;
    setRunEnabled(false);
    setControlMode(mode);
  };

  const handleInteraction = () => {
    if (worldMapRef.current === 'market') {
      if (!marketStationNearbyRef.current) return;
      if (marketStationNearbyRef.current === 'exit') {
        handleLeaveMarket();
        return;
      }
      setMarketInteractionRequest((current) => ({
        id: (current?.id ?? 0) + 1,
        station: marketStationNearbyRef.current as MarketStationId,
      }));
      return;
    }
    if (quizStep) return;
    if (dialogueIndex === null && marketNearby) {
      handleEnterMarket();
      return;
    }
    if (dialogueIndex === null) {
      beginDialogue();
      return;
    }

    if (visibleDialogueCharacters < currentDialogue.length) {
      setVisibleDialogueCharacters(currentDialogue.length);
      dialogueReadyAt.current = Date.now() + DIALOGUE_READ_DELAY;
      return;
    }

    if (currentDialogueStep?.kind === 'choice') return;

    if (Date.now() < dialogueReadyAt.current) return;
    if (dialogueIndex < dialogueSteps.length - 1) {
      dialogueReadyAt.current = Number.POSITIVE_INFINITY;
      setVisibleDialogueCharacters(0);
      setDialogueIndex((index) => (index === null ? 0 : index + 1));
      return;
    }
    openQuiz();
  };

  const handleDailyChoicePress = (choice: DailyConversationChoice) => {
    if (!dailyChoiceVisible || currentDialogueStep?.kind !== 'choice' || dialogueIndex === null) {
      return;
    }
    setSelectedDailyChoice(choice);
    dialogueReadyAt.current = Number.POSITIVE_INFINITY;
    setVisibleDialogueCharacters(0);
    setDialogueIndex(dialogueIndex + 1);
  };

  const closeQuiz = () => {
    setQuizStep(null);
    setSelectedAnswer(null);
    setShowWrongFeedback(false);
  };

  const handleQuizAnswerPress = (index: number) => {
    setSelectedAnswer(index);
    if (index === 0) {
      setShowWrongFeedback(false);
      completeDailyQuest('safety-quiz');
      setQuizStep('result');
      return;
    }
    setShowWrongFeedback(true);
  };

  const marketStationCategory =
    marketStationNearby && marketStationNearby !== 'checkout' && marketStationNearby !== 'exit'
      ? marketCategories.find(({ id }) => id === marketStationNearby)
      : null;
  const interactionAvailable =
    worldMap === 'market'
      ? marketStationNearby !== null && !marketScenarioLocked
      : marketNearby || npcNearby || dialogueIndex !== null;
  const interactionLabel =
    worldMap === 'market'
      ? marketStationNearby === 'checkout'
        ? '계산대에서 계산하기'
        : marketStationNearby === 'exit'
          ? '마트에서 마을로 나가기'
          : marketStationCategory
            ? `${marketStationCategory.label} 살펴보기`
            : '가까이 가면 상호작용할 수 있어요'
      : dialogueIndex !== null
      ? '대화 계속하기'
      : marketNearby
        ? '하늘마트 들어가기'
        : npcNearby
          ? '민수와 대화하기'
          : '상호작용할 대상이 없습니다';
  const interactionIcon =
    worldMap === 'market'
      ? marketStationNearby === 'checkout'
        ? 'card-outline'
        : marketStationNearby === 'exit'
          ? 'exit-outline'
          : 'search'
      : dialogueIndex !== null
        ? 'play'
        : marketNearby
          ? 'storefront'
          : 'chatbubble';
  const interactionActionText =
    worldMap === 'market'
      ? marketStationNearby === 'checkout'
        ? '계산'
        : marketStationNearby === 'exit'
          ? '나가기'
          : marketStationNearby
            ? '보기'
            : '행동'
      : dialogueIndex !== null
        ? '다음'
        : marketNearby
          ? '입장'
          : npcNearby
            ? '대화'
            : '행동';

  const joystickControlsVisible =
    controlMode === 'joystick' &&
    !dialoguePanelMounted &&
    !quizPanelMounted &&
    !marketScenarioLocked;
  return (
    <Pressable
      accessibilityActions={[
        { label: '위로 이동', name: 'moveUp' },
        { label: '아래로 이동', name: 'moveDown' },
        { label: '왼쪽으로 이동', name: 'moveLeft' },
        { label: '오른쪽으로 이동', name: 'moveRight' },
      ]}
      accessibilityLabel={worldMap === 'market' ? '하늘마트 내부 월드' : '쿼터뷰 마을'}
      delayLongPress={260}
      onAccessibilityAction={(event) => handleAccessibilityMove(event.nativeEvent.actionName)}
      onLayout={handleViewportLayout}
      onLongPress={handleWorldLongPress}
      onPress={handleWorldPress}
      onPressIn={handleWorldPressIn}
      onPressOut={handleWorldPressOut}
      ref={viewportNode}
      style={styles.root}
    >
      <StatusBar hidden />

      <Animated.View
        pointerEvents={quizPanelMounted ? 'none' : 'auto'}
        style={[
          styles.world,
          {
            height: worldMap === 'market' ? MARKET_WORLD_HEIGHT : VILLAGE_WORLD_HEIGHT,
            transform: camera.getTranslateTransform(),
            width: worldMap === 'market' ? MARKET_WORLD_WIDTH : VILLAGE_WORLD_WIDTH,
          },
        ]}
      >
        {worldMap === 'village' ? (
        <>
        <View style={styles.ground} />
        <View style={[styles.road, styles.roadMain]} />
        <View style={[styles.road, styles.roadBranch]} />
        <View style={[styles.roadEdge, styles.roadEdgeOne]} />
        <View style={[styles.roadEdge, styles.roadEdgeTwo]} />

        {tapTargetMarker && controlMode === 'touch' ? (
          <View
            pointerEvents="none"
            style={[styles.tapTargetMarker, { left: tapTargetMarker.x - 12, top: tapTargetMarker.y - 12 }]}
            testID="touch-target-marker"
          />
        ) : null}

        <IsoBuilding color="#C99C78" height={184} label="집" width={238} x={112} y={116} />
        <IsoBuilding color="#9AAE98" height={190} label="하늘마트" width={230} x={660} y={122} />

        <PressScale
          accessibilityElementsHidden={!marketNearby}
          accessibilityHint={marketNearby && controlMode === 'touch' ? '누르면 하늘마트에 들어갑니다' : undefined}
          accessibilityLabel={
            controlMode === 'touch' ? '하늘마트로 이동해 들어가기' : '하늘마트 입구'
          }
          accessibilityRole={marketNearby && controlMode === 'touch' ? 'button' : undefined}
          disabled={controlMode !== 'touch' || !marketNearby || controlsLockedRef.current}
          importantForAccessibility={marketNearby ? 'auto' : 'no-hide-descendants'}
          onPress={handleMarketPress}
          scaleTo={0.96}
          style={styles.marketEntrance}
        >
          <MarketProximityCloud visible={marketNearby} />
        </PressScale>

        <View style={[styles.obstacleBlock, styles.centerPlanter]}>
          <View style={styles.plantCircle} />
          <View style={[styles.plantCircle, styles.plantCircleRight]} />
        </View>
        <View style={[styles.obstacleBlock, styles.lowerBlock]}>
          <Text style={styles.objectLabel}>공터</Text>
        </View>

        <PressScale
          accessibilityHint={controlMode === 'touch' ? '누르면 가까이 이동해 대화를 시작합니다' : undefined}
          accessibilityLabel={controlMode === 'touch' ? '안내원 민수로 이동해 대화하기' : '안내원 민수'}
          accessibilityRole={controlMode === 'touch' ? 'button' : undefined}
          disabled={controlMode !== 'touch' || controlsLockedRef.current}
          onPress={handleNpcPress}
          scaleTo={0.94}
          style={[styles.npc, !npcNearby && styles.npcInactive]}
        >
          {npcNearby ? (
            <View style={styles.interactionBadge}>
              <Ionicons color={colors.white} name="chatbubble" size={16} />
            </View>
          ) : null}
          <View style={[styles.characterShadow, styles.npcShadow]} />
          <View style={styles.npcBody}>
            <View style={styles.npcHead} />
          </View>
          <Text style={styles.npcName}>민수</Text>
        </PressScale>
        </>
        ) : (
          <MarketWorldLayer
            controlMode={controlMode}
            nearbyStation={marketStationNearby}
            onStationPress={handleMarketStationPress}
            tapTargetMarker={tapTargetMarker}
          />
        )}
      </Animated.View>

      <View accessibilityLabel="내 캐릭터" pointerEvents="none" style={styles.player}>
        <ModularCharacter
          layers={[{ id: 'approved-full-body', slot: 'bodySkin', source: playerGameArt.blueBobFrontIdle }]}
          scale={PLAYER_ART_SCALE}
        />
      </View>


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

      <GameHud
        controlMode={controlMode}
        dailyQuests={dailyQuests}
        onControlModeChange={selectControlMode}
        onEmergencyExit={handleEmergencyExit}
        onExit={handleExit}
        onMenuVisibilityChange={handleHudMenuVisibilityChange}
      />

      {worldMap === 'market' ? (
        <MarketSimulationScreen
          embedded
          interactionRequest={marketInteractionRequest}
          onExit={handleLeaveMarket}
          onLockChange={setMarketScenarioLocked}
          onMissionComplete={() => completeDailyQuest('market-list')}
        />
      ) : null}

      {dialoguePanelMounted ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[styles.dialogueDim, { opacity: dialoguePanelProgress }]}
          />
          <Animated.View
            pointerEvents={dialogueIndex !== null ? 'auto' : 'none'}
            style={[
              styles.dialogueBox,
              currentDialogueStep?.kind === 'choice' && styles.dialogueChoiceBox,
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
              accessibilityLabel={dailyChoiceVisible ? '일상 선택지를 선택해 주세요' : '대화 계속하기'}
              accessibilityLiveRegion="polite"
              accessibilityRole="button"
              accessibilityState={{ disabled: dailyChoiceVisible }}
              disabled={dailyChoiceVisible}
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
                <Text style={styles.dialogueSpeaker}>민수</Text>
              </Animated.View>
              <Text style={styles.dialogueText}>
                {renderedDialogue.slice(0, visibleDialogueCharacters)}
              </Text>
              {!dailyChoiceVisible ? (
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
          {dailyChoiceVisible && currentDialogueStep?.kind === 'choice' ? (
            <Animated.View
              accessibilityLabel="오늘 하루 선택지"
              accessibilityRole="radiogroup"
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
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selectedDailyChoice === option.id }}
                  key={option.id}
                  onPress={(event) => {
                    event?.stopPropagation?.();
                    handleDailyChoicePress(option.id);
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
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#CAD3C3',
    flex: 1,
    overflow: 'hidden',
  },
  world: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  marketArtBase: {
    ...StyleSheet.absoluteFillObject,
    height: MARKET_WORLD_HEIGHT,
    width: MARKET_WORLD_WIDTH,
  },
  marketCounterIllustrated: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    overflow: 'visible',
    padding: 0,
  },
  marketCounterArt: {
    height: 168,
    left: -6,
    position: 'absolute',
    top: -58,
    width: 252,
  },
  marketCounterNameplate: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,253,248,0.94)',
    borderColor: 'rgba(63,114,91,0.24)',
    borderRadius: 12,
    borderWidth: 1,
    bottom: 6,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    position: 'absolute',
  },
  marketShelfIllustrated: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    overflow: 'visible',
    padding: 0,
  },
  marketShelfArt: {
    bottom: -6,
    height: 148,
    left: 0,
    position: 'absolute',
    width: 220,
  },
  marketCounter: {
    alignItems: 'center',
    backgroundColor: '#A97C59',
    borderColor: '#77563F',
    borderRadius: 12,
    borderWidth: 2,
    height: 105,
    justifyContent: 'center',
    left: 325,
    position: 'absolute',
    top: 92,
    width: 250,
    zIndex: 5,
  },
  marketCounterText: { color: '#FFF4DE', fontFamily: fonts.bold, fontSize: 15 },
  marketShelf: {
    backgroundColor: '#9B7456',
    borderColor: '#6F503B',
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingTop: 16,
    position: 'absolute',
    zIndex: 5,
  },
  marketObjectActive: {
    borderColor: '#F3CE62',
    borderWidth: 4,
    shadowColor: '#5C482D',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 7,
  },
  marketShelfLabel: {
    alignItems: 'center',
    borderRadius: 9,
    flexDirection: 'row',
    gap: 5,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: 'absolute',
    top: 13,
    zIndex: 3,
  },
  marketShelfLabelText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 10 },
  marketExit: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderColor: '#B9B0A2',
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 2,
    flexDirection: 'row',
    gap: 7,
    height: 58,
    justifyContent: 'center',
    left: 375,
    position: 'absolute',
    top: 900,
    width: 150,
  },
  marketExitInactive: { backgroundColor: 'transparent', borderColor: 'transparent' },
  marketExitText: { color: '#647168', fontFamily: fonts.bold, fontSize: 13 },
  ground: {
    ...StyleSheet.absoluteFillObject,
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
    left: NPC_POINT.x - 32,
    position: 'absolute',
    top: NPC_POINT.y - 40,
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
  dialogueDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(49,50,46,0.15)',
    zIndex: 26,
  },
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
  dialogueSpeaker: { color: '#333333', fontFamily: fonts.laundryBold, fontSize: 17 },
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
    fontFamily: fonts.laundryBold,
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
  quizOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 30 },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(49,50,46,0.18)' },
  quizSheet: {
    alignSelf: 'center',
    maxWidth: 700,
    width: '100%',
  },
  quizChoiceStage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    maxWidth: undefined,
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
    fontFamily: fonts.laundryBold,
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
    maxWidth: '89.333%',
    overflow: 'hidden',
    paddingHorizontal: 41,
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
    fontFamily: fonts.laundryBold,
    fontSize: 17,
    lineHeight: 20,
    textAlign: 'center',
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
