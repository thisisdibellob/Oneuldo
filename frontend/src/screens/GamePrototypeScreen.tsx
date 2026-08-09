import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import { PressScale } from '../components/PressScale';
import { colors, fonts } from '../theme';

const WORLD_WIDTH = 1000;
const WORLD_HEIGHT = 900;
const PLAYER_RADIUS = 22;
const PLAYER_SIZE = 54;
const MOVE_SPEED = 190;
const RUN_SPEED_MULTIPLIER = 1.55;
const ACCESSIBILITY_STEP = 58;
const JOYSTICK_RADIUS = 34;
const JOYSTICK_SIZE = 110;
const JOYSTICK_ZONE_HEIGHT = 270;
const DIALOGUE_CHARACTER_DELAY = 34;
const DIALOGUE_READ_DELAY = 360;
const INTERACTION_DISTANCE = 116;
const NPC_POINT = { x: 610, y: 520 };
const INITIAL_PLAYER_POINT = { x: 480, y: 700 };

const obstacles = [
  { x: 112, y: 116, width: 238, height: 184 },
  { x: 660, y: 122, width: 230, height: 190 },
  { x: 406, y: 330, width: 150, height: 105 },
  { x: 120, y: 548, width: 184, height: 110 },
];

const quizAnswers = [
  '초록불인지 확인해요',
  '차가 오기 전에 빨리 건너요',
  '친구가 먼저 가면 따라가요',
];

const dialogueLines = [
  '안녕하세요. 여기는 오늘도 마을이에요.',
  '길을 건널 때 무엇을 먼저 확인하는지 같이 알아볼까요?',
];

type Point = { x: number; y: number };
type QuizStep = 'question' | 'result' | null;
type ControlMode = 'joystick' | 'touch';

function isBlocked(point: Point) {
  return obstacles.some(
    (obstacle) =>
      point.x + PLAYER_RADIUS > obstacle.x &&
      point.x - PLAYER_RADIUS < obstacle.x + obstacle.width &&
      point.y + PLAYER_RADIUS > obstacle.y &&
      point.y - PLAYER_RADIUS < obstacle.y + obstacle.height,
  );
}

function clampPoint(point: Point): Point {
  return {
    x: Math.max(PLAYER_RADIUS, Math.min(point.x, WORLD_WIDTH - PLAYER_RADIUS)),
    y: Math.max(PLAYER_RADIUS, Math.min(point.y, WORLD_HEIGHT - PLAYER_RADIUS)),
  };
}

function findReachableTarget(current: Point, desired: Point): Point {
  const clamped = clampPoint(desired);
  for (let step = 12; step >= 0; step -= 1) {
    const ratio = step / 12;
    const candidate = {
      x: current.x + (clamped.x - current.x) * ratio,
      y: current.y + (clamped.y - current.y) * ratio,
    };
    if (!isBlocked(candidate)) return candidate;
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

export function GamePrototypeScreen({ onExit }: { onExit: () => void }) {
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
  const quizPanelProgress = useRef(new Animated.Value(0)).current;
  const resultCelebration = useRef(new Animated.Value(0)).current;
  const playerPoint = useRef<Point>({ ...INITIAL_PLAYER_POINT });
  const viewport = useRef({ width: 0, height: 0 });
  const viewportOrigin = useRef({ x: 0, y: 0 });
  const direction = useRef<Point>({ x: 0, y: 0 });
  const speedMultiplier = useRef(1);
  const tapTarget = useRef<Point | null>(null);
  const pendingNpcInteraction = useRef(false);
  const joystickEngaged = useRef(false);
  const touchHoldActivated = useRef(false);
  const clearSoundTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const animationFrame = useRef<number | null>(null);
  const previousFrame = useRef<number | null>(null);
  const nearbyRef = useRef(false);
  const controlsLockedRef = useRef(false);
  const joystickZoneSize = useRef({ width: 220, height: JOYSTICK_ZONE_HEIGHT });
  const dialogueReadyAt = useRef(Number.POSITIVE_INFINITY);
  const startDialogueRef = useRef<() => void>(() => undefined);

  const [npcNearby, setNpcNearby] = useState(false);
  const [audioModeReady, setAudioModeReady] = useState(false);
  const [controlMode, setControlMode] = useState<ControlMode>('joystick');
  const [controlMenuOpen, setControlMenuOpen] = useState(false);
  const [runEnabled, setRunEnabled] = useState(false);
  const [tapTargetMarker, setTapTargetMarker] = useState<Point | null>(null);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickCenter, setJoystickCenter] = useState({ x: 76, y: 190 });
  const [dialogueIndex, setDialogueIndex] = useState<number | null>(null);
  const [renderedDialogueIndex, setRenderedDialogueIndex] = useState(0);
  const [dialoguePanelMounted, setDialoguePanelMounted] = useState(false);
  const [visibleDialogueCharacters, setVisibleDialogueCharacters] = useState(0);
  const [quizStep, setQuizStep] = useState<QuizStep>(null);
  const [renderedQuizStep, setRenderedQuizStep] = useState<Exclude<QuizStep, null>>('question');
  const [quizPanelMounted, setQuizPanelMounted] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showWrongFeedback, setShowWrongFeedback] = useState(false);
  const currentDialogue = dialogueIndex === null ? '' : dialogueLines[dialogueIndex];
  controlsLockedRef.current =
    dialoguePanelMounted || quizPanelMounted || dialogueIndex !== null || quizStep !== null || controlMenuOpen;

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
    const nearby = Math.hypot(point.x - NPC_POINT.x, point.y - NPC_POINT.y) <= INTERACTION_DISTANCE;
    if (nearby !== nearbyRef.current) {
      nearbyRef.current = nearby;
      setNpcNearby(nearby);
    }
  }, []);

  const movePlayer = useCallback(
    (dx: number, dy: number) => {
      const current = playerPoint.current;
      let next = current;

      const xCandidate = clampPoint({ x: current.x + dx, y: current.y });
      if (!isBlocked(xCandidate)) next = xCandidate;

      const yCandidate = clampPoint({ x: next.x, y: next.y + dy });
      if (!isBlocked(yCandidate)) next = yCandidate;

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
        const interactionReached = pendingNpcInteraction.current && nearbyRef.current;

        if (distance <= 3 || interactionReached) {
          const shouldTalk = pendingNpcInteraction.current && nearbyRef.current;
          tapTarget.current = null;
          pendingNpcInteraction.current = false;
          previousFrame.current = null;
          animationFrame.current = null;
          setTapTargetMarker(null);
          if (shouldTalk) startDialogueRef.current();
          return;
        }

        const step = Math.min(distance, MOVE_SPEED * speedMultiplier.current * elapsedSeconds);
        const next = movePlayer((dx / distance) * step, (dy / distance) * step);
        const moved = Math.hypot(next.x - current.x, next.y - current.y);
        if (step > 0 && moved < 0.05) {
          tapTarget.current = null;
          pendingNpcInteraction.current = false;
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
    [movePlayer],
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
    backgroundMusic.volume = 0.22;
    backgroundMusic.play();
  }, [audioModeReady, backgroundMusic, backgroundMusicStatus.isLoaded]);

  useEffect(() => {
    if (!backgroundMusicStatus.isLoaded) return;
    backgroundMusic.volume = dialoguePanelMounted || quizPanelMounted ? 0.12 : 0.22;
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
    Animated.timing(resultCelebration, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [quizStep, resultCelebration]);

  useEffect(() => {
    dialoguePanelProgress.stopAnimation();
    if (dialogueIndex !== null) {
      setRenderedDialogueIndex(dialogueIndex);
      setDialoguePanelMounted(true);
      dialoguePanelProgress.setValue(0);
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
      Animated.timing(dialoguePanelProgress, {
        duration: 170,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setDialoguePanelMounted(false);
      });
    }
  }, [dialogueIndex, dialoguePanelProgress]);

  useEffect(() => {
    quizPanelProgress.stopAnimation();
    if (quizStep) {
      setRenderedQuizStep(quizStep);
      if (!quizPanelMounted) {
        setQuizPanelMounted(true);
        quizPanelProgress.setValue(0);
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
      Animated.timing(quizPanelProgress, {
        duration: 190,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setQuizPanelMounted(false);
      });
    }
  }, [quizPanelProgress, quizStep]);

  const handleViewportLayout = (event: LayoutChangeEvent) => {
    viewport.current = event.nativeEvent.layout;
    viewportNode.current?.measureInWindow((x, y) => {
      viewportOrigin.current = { x, y };
    });
    updateCamera(playerPoint.current);
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
    stopMovement();
    speedMultiplier.current = 1;
    setRunEnabled(false);
    dialogueReadyAt.current = Number.POSITIVE_INFINITY;
    setVisibleDialogueCharacters(0);
    setDialogueIndex(0);
  };
  startDialogueRef.current = beginDialogue;

  const startTapMovement = (desired: Point, talkWhenNear = false) => {
    if (controlsLockedRef.current) return;
    stopMovement();
    const target = findReachableTarget(playerPoint.current, desired);
    if (Math.hypot(target.x - playerPoint.current.x, target.y - playerPoint.current.y) < 2) return;
    tapTarget.current = target;
    pendingNpcInteraction.current = talkWhenNear;
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

  const selectControlMode = (mode: ControlMode) => {
    stopMovement();
    speedMultiplier.current = 1;
    setRunEnabled(false);
    setControlMode(mode);
    setControlMenuOpen(false);
  };

  const handleInteraction = () => {
    if (quizStep) return;
    if (dialogueIndex === null) {
      beginDialogue();
      return;
    }

    if (visibleDialogueCharacters < currentDialogue.length) {
      setVisibleDialogueCharacters(currentDialogue.length);
      dialogueReadyAt.current = Date.now() + DIALOGUE_READ_DELAY;
      return;
    }

    if (Date.now() < dialogueReadyAt.current) return;
    if (dialogueIndex < dialogueLines.length - 1) {
      dialogueReadyAt.current = Number.POSITIVE_INFINITY;
      setVisibleDialogueCharacters(0);
      setDialogueIndex((index) => (index === null ? 0 : index + 1));
      return;
    }
    openQuiz();
  };

  const closeQuiz = () => {
    setQuizStep(null);
    setSelectedAnswer(null);
    setShowWrongFeedback(false);
  };

  const checkAnswer = () => {
    if (selectedAnswer === null) return;
    if (selectedAnswer === 0) {
      setShowWrongFeedback(false);
      setQuizStep('result');
      return;
    }
    setShowWrongFeedback(true);
  };

  return (
    <Pressable
      accessibilityActions={[
        { label: '위로 이동', name: 'moveUp' },
        { label: '아래로 이동', name: 'moveDown' },
        { label: '왼쪽으로 이동', name: 'moveLeft' },
        { label: '오른쪽으로 이동', name: 'moveRight' },
      ]}
      accessibilityLabel="쿼터뷰 마을"
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
        style={[styles.world, { transform: camera.getTranslateTransform() }]}
      >
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
        <IsoBuilding color="#9AAE98" height={190} label="가게" width={230} x={660} y={122} />

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
      </Animated.View>

      <View accessibilityLabel="내 캐릭터" pointerEvents="none" style={styles.player}>
        <View style={styles.characterShadow} />
        <View style={styles.playerBody}>
          <View style={styles.playerHead} />
          <View style={styles.playerMarker}>
            <Image accessibilityIgnoresInvertColors resizeMode="contain" source={icons.user} style={styles.playerImage} />
          </View>
        </View>
      </View>

      <PressScale
        accessibilityLabel="게임 나가기"
        accessibilityRole="button"
        hitSlop={10}
        onPress={(event) => {
          event?.stopPropagation?.();
          handleExit();
        }}
        style={styles.exitButton}
        testID="game-exit"
      >
        <Ionicons color="rgba(72,78,74,0.64)" name="close" size={27} />
      </PressScale>

      <PressScale
        accessibilityLabel="조작 방식 선택"
        accessibilityRole="button"
        onPress={(event) => {
          event?.stopPropagation?.();
          stopMovement();
          setControlMenuOpen((open) => !open);
        }}
        style={styles.controlModeButton}
      >
        <Ionicons color="rgba(72,78,74,0.64)" name="options" size={23} />
      </PressScale>

      {controlMenuOpen ? (
        <View style={styles.controlMenu}>
          <Text style={styles.controlMenuTitle}>조작 방식</Text>
          <PressScale
            accessibilityRole="radio"
            accessibilityState={{ checked: controlMode === 'joystick' }}
            onPress={(event) => {
              event?.stopPropagation?.();
              selectControlMode('joystick');
            }}
            style={[styles.controlOption, controlMode === 'joystick' && styles.controlOptionSelected]}
          >
            <Ionicons color="#3D5146" name="game-controller" size={20} />
            <Text style={styles.controlOptionText}>슬라이드 패드</Text>
            {controlMode === 'joystick' ? <Ionicons color={colors.mint} name="checkmark" size={21} /> : null}
          </PressScale>
          <PressScale
            accessibilityRole="radio"
            accessibilityState={{ checked: controlMode === 'touch' }}
            onPress={(event) => {
              event?.stopPropagation?.();
              selectControlMode('touch');
            }}
            style={[styles.controlOption, controlMode === 'touch' && styles.controlOptionSelected]}
          >
            <Ionicons color="#3D5146" name="hand-left" size={20} />
            <Text style={styles.controlOptionText}>터치 이동</Text>
            {controlMode === 'touch' ? <Ionicons color={colors.mint} name="checkmark" size={21} /> : null}
          </PressScale>
        </View>
      ) : null}

      {controlMode === 'joystick' ? (
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
        style={styles.joystickZone}
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

      {controlMode === 'joystick' ? (
      <View style={styles.actionCluster}>
        <PressScale
          accessibilityLabel={
            dialogueIndex !== null
              ? '대화 계속하기'
              : npcNearby
                ? '민수와 대화하기'
                : '대화할 대상이 없습니다'
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: (!npcNearby && dialogueIndex === null) || quizPanelMounted }}
          disabled={(!npcNearby && dialogueIndex === null) || quizPanelMounted}
          onPress={(event) => {
            event?.stopPropagation?.();
            handleInteraction();
          }}
          scaleTo={0.92}
          style={[
            styles.actionButton,
            styles.interactionButton,
            !npcNearby && dialogueIndex === null && styles.actionButtonDisabled,
          ]}
        >
          <Ionicons color={colors.white} name={dialogueIndex !== null ? 'play' : 'chatbubble'} size={25} />
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

      {dialoguePanelMounted ? (
        <Animated.View
          pointerEvents={dialogueIndex !== null ? 'auto' : 'none'}
          style={[
            styles.dialogueBox,
            {
              opacity: dialoguePanelProgress,
              transform: [
                {
                  translateY: dialoguePanelProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
                {
                  scale: dialoguePanelProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.98, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            accessibilityLabel={controlMode === 'touch' ? '대화 계속하기' : '대화 내용'}
            accessibilityLiveRegion="polite"
            accessibilityRole={controlMode === 'touch' ? 'button' : undefined}
            onPress={(event) => {
              event?.stopPropagation?.();
              handleInteraction();
            }}
            style={styles.dialoguePressArea}
          >
            <Text style={styles.dialogueSpeaker}>민수</Text>
            <Text style={styles.dialogueText}>
              {dialogueLines[renderedDialogueIndex].slice(0, visibleDialogueCharacters)}
            </Text>
            <View style={styles.dialogueProgress}>
              <View style={[styles.dialogueDot, styles.dialogueDotActive]} />
              <View style={[styles.dialogueDot, renderedDialogueIndex > 0 && styles.dialogueDotActive]} />
            </View>
          </Pressable>
        </Animated.View>
      ) : null}

      {quizPanelMounted ? (
        <View style={styles.quizOverlay}>
          <Animated.View style={[styles.dim, { opacity: quizPanelProgress }]} />
          <Animated.View
            style={[
              styles.quizSheet,
              {
                opacity: quizPanelProgress,
                transform: [
                  {
                    translateY: quizPanelProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [54, 0],
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
                <View style={styles.quizHeader}>
                  <View style={styles.quizNpcAvatar}>
                    <View style={styles.npcHead} />
                  </View>
                  <View style={styles.quizHeaderCopy}>
                    <Text style={styles.quizNpcName}>안내원 민수</Text>
                    <Text style={styles.quizIntro}>안전 퀴즈를 풀어볼까요?</Text>
                  </View>
                  <PressScale accessibilityLabel="퀴즈 닫기" hitSlop={10} onPress={closeQuiz}>
                    <Ionicons color="#777777" name="close" size={26} />
                  </PressScale>
                </View>

                <Text style={styles.quizQuestion}>
                  횡단보도를 건너기 전에{'\n'}무엇을 먼저 확인할까요?
                </Text>
                <View style={styles.quizAnswers}>
                  {quizAnswers.map((answer, index) => {
                    const selected = selectedAnswer === index;
                    const wrong = showWrongFeedback && selected;
                    return (
                      <PressScale
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        key={answer}
                        onPress={() => {
                          setSelectedAnswer(index);
                          setShowWrongFeedback(false);
                        }}
                        style={[
                          styles.quizAnswer,
                          selected && styles.quizAnswerSelected,
                          wrong && styles.quizAnswerWrong,
                        ]}
                      >
                        <Text style={styles.quizAnswerText}>{answer}</Text>
                      </PressScale>
                    );
                  })}
                </View>

                {showWrongFeedback ? (
                  <View style={styles.wrongFeedback}>
                    <Ionicons color="#E97842" name="refresh" size={18} />
                    <Text style={styles.wrongFeedbackText}>괜찮아요. 신호등을 먼저 살펴봐요.</Text>
                  </View>
                ) : null}

                <PressScale
                  accessibilityRole="button"
                  disabled={selectedAnswer === null}
                  onPress={checkAnswer}
                  style={[styles.quizButton, selectedAnswer === null && styles.disabled]}
                >
                  <Text style={styles.quizButtonText}>정답 확인</Text>
                </PressScale>
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
    height: WORLD_HEIGHT,
    left: 0,
    position: 'absolute',
    top: 0,
    width: WORLD_WIDTH,
  },
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
    width: 64,
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
    height: PLAYER_SIZE + 12,
    justifyContent: 'flex-start',
    left: '50%',
    marginLeft: -PLAYER_SIZE / 2,
    marginTop: -(PLAYER_SIZE + 12) / 2,
    position: 'absolute',
    top: '50%',
    width: PLAYER_SIZE,
    zIndex: 12,
  },
  playerBody: {
    alignItems: 'center',
    backgroundColor: '#E1A451',
    borderColor: '#493D31',
    borderRadius: 9,
    borderWidth: 2,
    height: 42,
    justifyContent: 'flex-start',
    width: 30,
  },
  playerHead: {
    backgroundColor: '#D9B695',
    borderColor: '#57463B',
    borderRadius: 14,
    borderWidth: 2,
    height: 28,
    marginTop: -15,
    width: 28,
  },
  playerMarker: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    top: 13,
    width: 22,
  },
  playerImage: { height: 18, width: 18 },
  exitButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: 20,
    borderWidth: 0,
    elevation: 0,
    height: 44,
    justifyContent: 'center',
    left: 16,
    position: 'absolute',
    shadowColor: 'transparent',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    top: 16,
    width: 44,
    zIndex: 20,
  },
  controlModeButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: 20,
    borderWidth: 0,
    elevation: 0,
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: 16,
    shadowColor: 'transparent',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    top: 16,
    width: 44,
    zIndex: 26,
  },
  controlMenu: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderColor: 'rgba(34,47,39,0.14)',
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    position: 'absolute',
    right: 16,
    top: 68,
    width: 224,
    zIndex: 26,
  },
  controlMenuTitle: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: 14,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  controlOption: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 13,
    borderWidth: 2,
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: 11,
  },
  controlOptionSelected: { backgroundColor: '#ECF8F1', borderColor: '#B9E8CE' },
  controlOptionText: {
    color: '#35433B',
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 14,
    marginLeft: 9,
  },
  joystickZone: {
    bottom: 0,
    height: JOYSTICK_ZONE_HEIGHT,
    left: 0,
    position: 'absolute',
    width: '58%',
    zIndex: 20,
  },
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
    bottom: 26,
    height: 112,
    position: 'absolute',
    right: 18,
    width: 132,
    zIndex: 22,
  },
  actionButton: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.7)',
    borderWidth: 2,
    justifyContent: 'center',
    position: 'absolute',
  },
  interactionButton: {
    backgroundColor: colors.mint,
    borderRadius: 34,
    bottom: 0,
    height: 68,
    right: 0,
    width: 68,
  },
  runButton: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 26,
    height: 52,
    left: 0,
    top: 0,
    width: 52,
  },
  runButtonActive: { backgroundColor: '#4C6E5A' },
  actionButtonDisabled: { opacity: 0.34 },
  dialogueBox: {
    backgroundColor: 'rgba(15,18,17,0.78)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 20,
    borderWidth: 2,
    bottom: 154,
    left: 18,
    minHeight: 116,
    paddingBottom: 15,
    paddingHorizontal: 18,
    paddingTop: 15,
    position: 'absolute',
    right: 18,
    zIndex: 22,
  },
  dialogueSpeaker: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
  dialoguePressArea: { flex: 1 },
  dialogueText: {
    color: colors.white,
    fontFamily: fonts.medium,
    fontSize: 17,
    lineHeight: 25,
    marginTop: 6,
    minHeight: 50,
  },
  dialogueProgress: { flexDirection: 'row', gap: 5, position: 'absolute', right: 15, top: 16 },
  dialogueDot: { backgroundColor: 'rgba(255,255,255,0.32)', borderRadius: 4, height: 7, width: 7 },
  dialogueDotActive: { backgroundColor: colors.white },
  quizOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 30 },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17,24,20,0.46)' },
  quizSheet: {
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxWidth: 700,
    paddingBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    width: '100%',
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
    color: colors.ink,
    fontFamily: fonts.laundryBold,
    fontSize: 20,
    lineHeight: 28,
    marginBottom: 16,
    marginTop: 20,
  },
  quizAnswers: { gap: 9 },
  quizAnswer: {
    alignItems: 'center',
    borderColor: '#E8E8E8',
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 14,
  },
  quizAnswerSelected: { backgroundColor: '#EDFFF5', borderColor: colors.brightMint },
  quizAnswerWrong: { backgroundColor: '#FFF4EF', borderColor: '#F4A17B' },
  quizAnswerText: {
    color: '#333333',
    fontFamily: fonts.semibold,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
    width: '100%',
  },
  wrongFeedback: {
    alignItems: 'center',
    backgroundColor: '#FFF7F2',
    borderRadius: 14,
    flexDirection: 'row',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  wrongFeedbackText: { color: '#B65B32', fontFamily: fonts.medium, fontSize: 13, marginLeft: 7 },
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
    width: 64,
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
