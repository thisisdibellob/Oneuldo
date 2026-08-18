import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  GestureResponderEvent,
  Image,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { icons } from '../assets';
import { PressScale } from '../components/PressScale';
import {
  evaluateMarketCart,
  getCartQuantity,
  getMarketCartTotal,
  getMarketProduct,
  MarketCart,
  MarketCategory,
  MarketCategoryId,
  MarketEvaluation,
  MarketProduct,
  marketCategories,
  marketMission,
  marketProducts,
} from '../game/scenarios';
import { colors, fonts } from '../theme';

type MarketPhase = 'briefing' | 'shopping' | 'checkout' | 'result';
type IoniconName = ComponentProps<typeof Ionicons>['name'];
export type MarketStationId = MarketCategoryId | 'checkout';
export type MarketInteractionRequest = { id: number; station: MarketStationId };
type MarketPoint = { x: number; y: number };
type MarketControlMode = 'joystick' | 'touch';

const MARKET_WORLD_WIDTH = 900;
const MARKET_WORLD_HEIGHT = 1000;
const MARKET_PLAYER_RADIUS = 22;
const MARKET_MOVE_SPEED = 190;
const MARKET_ACCESSIBILITY_STEP = 58;
const MARKET_INTERACTION_DISTANCE = 105;
const MARKET_JOYSTICK_RADIUS = 34;
const MARKET_JOYSTICK_SIZE = 110;
const MARKET_JOYSTICK_ZONE_HEIGHT = 250;
const MARKET_PLAYER_START: MarketPoint = { x: 450, y: 860 };
const MARKET_STATIONS: Record<MarketStationId, MarketPoint> = {
  checkout: { x: 450, y: 250 },
  fresh: { x: 350, y: 400 },
  produce: { x: 550, y: 400 },
  meal: { x: 350, y: 680 },
  drink: { x: 550, y: 680 },
};

const MARKET_SHELVES: Record<MarketCategoryId, { height: number; width: number; x: number; y: number }> = {
  fresh: { height: 128, width: 220, x: 90, y: 310 },
  produce: { height: 128, width: 220, x: 590, y: 310 },
  meal: { height: 128, width: 220, x: 90, y: 590 },
  drink: { height: 128, width: 220, x: 590, y: 590 },
};

const MARKET_OBSTACLES = [
  { height: 105, width: 250, x: 325, y: 92 },
  ...Object.values(MARKET_SHELVES),
];

function isMarketBlocked(point: MarketPoint) {
  return MARKET_OBSTACLES.some(
    (obstacle) =>
      point.x + MARKET_PLAYER_RADIUS > obstacle.x &&
      point.x - MARKET_PLAYER_RADIUS < obstacle.x + obstacle.width &&
      point.y + MARKET_PLAYER_RADIUS > obstacle.y &&
      point.y - MARKET_PLAYER_RADIUS < obstacle.y + obstacle.height,
  );
}

function clampMarketPoint(point: MarketPoint): MarketPoint {
  return {
    x: Math.max(MARKET_PLAYER_RADIUS, Math.min(point.x, MARKET_WORLD_WIDTH - MARKET_PLAYER_RADIUS)),
    y: Math.max(MARKET_PLAYER_RADIUS, Math.min(point.y, MARKET_WORLD_HEIGHT - MARKET_PLAYER_RADIUS)),
  };
}

function findMarketReachableTarget(current: MarketPoint, desired: MarketPoint): MarketPoint {
  const clamped = clampMarketPoint(desired);
  for (let step = 12; step >= 0; step -= 1) {
    const ratio = step / 12;
    const candidate = {
      x: current.x + (clamped.x - current.x) * ratio,
      y: current.y + (clamped.y - current.y) * ratio,
    };
    if (!isMarketBlocked(candidate)) return candidate;
  }
  return current;
}

const formatPrice = (price: number) => `${price.toLocaleString('ko-KR')}원`;

type MarketSimulationScreenProps = {
  embedded?: boolean;
  interactionRequest?: MarketInteractionRequest | null;
  onExit: () => void;
  onLockChange?: (locked: boolean) => void;
  onMissionComplete?: () => void;
};

export function MarketSimulationScreen({
  embedded = false,
  interactionRequest = null,
  onExit,
  onLockChange,
  onMissionComplete,
}: MarketSimulationScreenProps) {
  const [phase, setPhase] = useState<MarketPhase>('briefing');
  const [briefingIndex, setBriefingIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<MarketCategoryId | null>(null);
  const [cart, setCart] = useState<MarketCart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [evaluation, setEvaluation] = useState<MarketEvaluation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nearbyStation, setNearbyStation] = useState<MarketStationId | null>(null);
  const noticeOpacity = useRef(new Animated.Value(0)).current;
  const handledInteractionId = useRef<number | null>(null);

  const total = getMarketCartTotal(cart);
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const remainingBudget = marketMission.budget - total;

  const objectiveProgress = useMemo(
    () => marketMission.objectives.map((objective) => ({
      ...objective,
      product: getMarketProduct(objective.productId),
      current: getCartQuantity(cart, objective.productId),
    })),
    [cart],
  );

  const showNotice = (message: string) => {
    setNotice(message);
    noticeOpacity.stopAnimation();
    noticeOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(noticeOpacity, { duration: 160, toValue: 1, useNativeDriver: true }),
      Animated.delay(1000),
      Animated.timing(noticeOpacity, { duration: 180, toValue: 0, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setNotice(null);
    });
  };

  const changeQuantity = (productId: string, change: number) => {
    setCart((current) => {
      const nextQuantity = Math.max(0, Math.min(5, getCartQuantity(current, productId) + change));
      const next = { ...current };
      if (nextQuantity === 0) delete next[productId];
      else next[productId] = nextQuantity;
      return next;
    });
    const product = getMarketProduct(productId);
    if (change > 0 && product) showNotice(`${product.name}을 담았어요`);
  };

  const continueBriefing = () => {
    if (briefingIndex < marketMission.briefing.length - 1) {
      setBriefingIndex((index) => index + 1);
      return;
    }
    setPhase('shopping');
  };

  const goToCheckout = () => {
    setCartOpen(false);
    setActiveCategory(null);
    setEvaluation(null);
    setPhase('checkout');
  };

  const useNearbyStation = () => {
    if (!nearbyStation) return;
    if (nearbyStation === 'checkout') {
      if (cartCount === 0) {
        showNotice('가방이 비어 있어요');
        return;
      }
      goToCheckout();
      return;
    }
    setActiveCategory(nearbyStation);
  };

  useEffect(() => {
    if (!embedded || !interactionRequest || phase !== 'shopping') return;
    if (handledInteractionId.current === interactionRequest.id) return;
    handledInteractionId.current = interactionRequest.id;
    if (interactionRequest.station === 'checkout') {
      if (cartCount === 0) {
        showNotice('장바구니가 비어 있어요');
        return;
      }
      goToCheckout();
      return;
    }
    setActiveCategory(interactionRequest.station);
  }, [cartCount, embedded, interactionRequest, phase]);

  useEffect(() => {
    if (!embedded || !onLockChange) return;
    onLockChange(phase !== 'shopping' || activeCategory !== null || cartOpen);
  }, [activeCategory, cartOpen, embedded, onLockChange, phase]);

  const checkCart = () => {
    const nextEvaluation = evaluateMarketCart(cart);
    setEvaluation(nextEvaluation);
    if (nextEvaluation.success) onMissionComplete?.();
    setPhase('result');
  };

  const retryShopping = () => {
    setEvaluation(null);
    setPhase('shopping');
  };

  return (
    <View pointerEvents={embedded ? 'box-none' : 'auto'} style={embedded ? styles.embeddedRoot : styles.root}>
      {!embedded ? <StatusBar style="dark" /> : null}

      {!embedded ? <MarketTopBar
        cartCount={cartCount}
        objectiveProgress={objectiveProgress}
        onExit={onExit}
        remainingBudget={remainingBudget}
      /> : null}

      {!embedded && (phase === 'shopping' || phase === 'briefing') ? (
        <MarketMap
          interactive={phase === 'shopping' && activeCategory === null && !cartOpen}
          nearbyStation={nearbyStation}
          onNearbyStationChange={setNearbyStation}
        />
      ) : !embedded ? (
        <CheckoutScene cart={cart} />
      ) : null}

      {phase === 'shopping' ? (
        <View style={[styles.shoppingFooter, embedded && styles.embeddedShoppingFooter]}>
          <View
            accessibilityLabel={`오늘의 목록, ${objectiveProgress
              .map(({ current, product, quantity }) => `${product?.name ?? '물건'} ${current}/${quantity}`)
              .join(', ')}`}
            accessible
            style={styles.missionStrip}
          >
            <View pointerEvents="none" style={styles.missionTape} />
            <View style={styles.missionStripHeading}>
              <Ionicons color="#9A8061" name="create-outline" size={11} />
              <Text style={styles.missionStripLabel}>오늘의 목록</Text>
            </View>
            <View style={styles.missionChecklist}>
              {objectiveProgress.map(({ current, product, productId, quantity }) => {
                const completed = current >= quantity;
                return (
                  <View key={productId} style={styles.missionChecklistItem}>
                    <View style={styles.missionItemHeading}>
                      <View style={[styles.missionCheckbox, completed && styles.missionCheckboxComplete]}>
                        {completed ? <Ionicons color="#FFFFFF" name="checkmark" size={8} /> : null}
                      </View>
                      <Text
                        ellipsizeMode="tail"
                        numberOfLines={1}
                        style={[styles.missionItemName, completed && styles.missionItemNameComplete]}
                      >
                        {product?.name ?? '물건'}
                      </Text>
                    </View>
                    <Text style={[styles.missionItemCount, completed && styles.missionItemCountComplete]}>
                      {current}/{quantity}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
          <PressScale
            accessibilityLabel={`장바구니 ${cartCount}개`}
            accessibilityRole="button"
            onPress={() => setCartOpen(true)}
            style={styles.cartButton}
          >
            <Ionicons color={colors.white} name="basket" size={24} />
            <Text style={styles.cartButtonText}>가방</Text>
            <View style={styles.cartCountBadge}>
              <Text style={styles.cartCountText}>{cartCount}</Text>
            </View>
          </PressScale>
        </View>
      ) : null}

      {!embedded && phase === 'shopping' && nearbyStation ? (
        <PressScale
          accessibilityLabel={
            nearbyStation === 'checkout'
              ? '계산대에서 계산하기'
              : `${marketCategories.find((category) => category.id === nearbyStation)?.label} 살펴보기`
          }
          accessibilityRole="button"
          onPress={useNearbyStation}
          scaleTo={0.94}
          style={styles.stationActionButton}
        >
          <Ionicons
            color="#FFF8E8"
            name={nearbyStation === 'checkout' ? 'card-outline' : 'search'}
            size={23}
          />
          <Text style={styles.stationActionText}>
            {nearbyStation === 'checkout' ? '계산하기' : '살펴보기'}
          </Text>
        </PressScale>
      ) : null}

      {phase === 'briefing' ? (
        <NpcDialogueCard
          buttonLabel={briefingIndex === marketMission.briefing.length - 1 ? '장보기 시작' : '다음'}
          message={marketMission.briefing[briefingIndex]}
          onContinue={continueBriefing}
          progress={`${briefingIndex + 1}/${marketMission.briefing.length}`}
        />
      ) : null}

      {phase === 'checkout' ? (
        embedded ? (
          <View style={styles.embeddedCheckoutOverlay}>
            <View style={styles.embeddedCheckoutBackdrop} />
            <CheckoutPanel cart={cart} onBack={retryShopping} onCheck={checkCart} total={total} />
          </View>
        ) : (
          <CheckoutPanel cart={cart} onBack={retryShopping} onCheck={checkCart} total={total} />
        )
      ) : null}

      {phase === 'result' && evaluation ? (
        <ResultPanel evaluation={evaluation} onExit={onExit} onRetry={retryShopping} />
      ) : null}

      {activeCategory && phase === 'shopping' ? (
        <ProductShelfSheet
          cart={cart}
          category={marketCategories.find((category) => category.id === activeCategory)!}
          onChangeQuantity={changeQuantity}
          onClose={() => setActiveCategory(null)}
        />
      ) : null}

      {cartOpen && phase === 'shopping' ? (
        <CartSheet
          cart={cart}
          onChangeQuantity={changeQuantity}
          onCheckout={() => {
            setCartOpen(false);
            showNotice('계산대로 이동해 주세요');
          }}
          onClose={() => setCartOpen(false)}
          total={total}
        />
      ) : null}

      {notice ? (
        <Animated.View pointerEvents="none" style={[styles.notice, { opacity: noticeOpacity }]}>
          <Ionicons color="#FFFFFF" name="checkmark" size={18} />
          <Text style={styles.noticeText}>{notice}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

function MarketTopBar({
  cartCount,
  objectiveProgress,
  onExit,
  remainingBudget,
}: {
  cartCount: number;
  objectiveProgress: Array<{ current: number; quantity: number }>;
  onExit: () => void;
  remainingBudget: number;
}) {
  const completed = objectiveProgress.filter(({ current, quantity }) => current >= quantity).length;
  return (
    <View style={styles.topBar}>
      <PressScale accessibilityLabel="장보기 나가기" accessibilityRole="button" hitSlop={8} onPress={onExit} style={styles.topIconButton}>
        <Ionicons color="#FFFFFF" name="close" size={24} />
      </PressScale>
      <View style={styles.locationHeading}>
        <Text style={styles.locationEyebrow}>생활 연습 · 장보기</Text>
        <Text style={styles.locationTitle}>하늘마트</Text>
      </View>
      <View style={styles.topStats}>
        <View style={styles.progressPill}>
          <Ionicons color="#3A785A" name="checkmark-circle" size={17} />
          <Text style={styles.progressPillText}>{completed}/{objectiveProgress.length}</Text>
        </View>
        <View style={[styles.budgetPill, remainingBudget < 0 && styles.budgetPillOver]}>
          <Text style={styles.budgetPillLabel}>남은 돈</Text>
          <Text style={styles.budgetPillValue}>{formatPrice(remainingBudget)}</Text>
        </View>
      </View>
      {cartCount > 0 ? <View style={styles.topCartDot} /> : null}
    </View>
  );
}

function MarketMap({
  interactive,
  nearbyStation,
  onNearbyStationChange,
}: {
  interactive: boolean;
  nearbyStation: MarketStationId | null;
  onNearbyStationChange: (station: MarketStationId | null) => void;
}) {
  const viewportNode = useRef<View | null>(null);
  const camera = useRef(new Animated.ValueXY()).current;
  const joystickKnob = useRef(new Animated.ValueXY()).current;
  const playerPoint = useRef<MarketPoint>({ ...MARKET_PLAYER_START });
  const viewport = useRef({ height: 0, width: 0 });
  const viewportOrigin = useRef({ x: 0, y: 0 });
  const direction = useRef<MarketPoint>({ x: 0, y: 0 });
  const speedMultiplier = useRef(1);
  const tapTarget = useRef<MarketPoint | null>(null);
  const joystickEngaged = useRef(false);
  const touchHoldActivated = useRef(false);
  const animationFrame = useRef<number | null>(null);
  const previousFrame = useRef<number | null>(null);
  const nearbyStationRef = useRef<MarketStationId | null>(null);
  const controlsLockedRef = useRef(!interactive);
  const joystickZoneSize = useRef({ height: MARKET_JOYSTICK_ZONE_HEIGHT, width: 220 });

  const [controlMode, setControlMode] = useState<MarketControlMode>('joystick');
  const [runEnabled, setRunEnabled] = useState(false);
  const [tapTargetMarker, setTapTargetMarker] = useState<MarketPoint | null>(null);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickCenter, setJoystickCenter] = useState({ x: 76, y: 174 });
  controlsLockedRef.current = !interactive;

  const updateCamera = useCallback((point: MarketPoint) => {
    camera.setValue({
      x: viewport.current.width / 2 - point.x,
      y: viewport.current.height / 2 - point.y,
    });
  }, [camera]);

  const updateStationProximity = useCallback((point: MarketPoint) => {
    let closest: MarketStationId | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    (Object.entries(MARKET_STATIONS) as Array<[MarketStationId, MarketPoint]>).forEach(([station, stationPoint]) => {
      const distance = Math.hypot(point.x - stationPoint.x, point.y - stationPoint.y);
      if (distance <= MARKET_INTERACTION_DISTANCE && distance < closestDistance) {
        closest = station;
        closestDistance = distance;
      }
    });
    if (closest !== nearbyStationRef.current) {
      nearbyStationRef.current = closest;
      onNearbyStationChange(closest);
    }
  }, [onNearbyStationChange]);

  const movePlayer = useCallback((dx: number, dy: number) => {
    const current = playerPoint.current;
    let next = current;
    const xCandidate = clampMarketPoint({ x: current.x + dx, y: current.y });
    if (!isMarketBlocked(xCandidate)) next = xCandidate;
    const yCandidate = clampMarketPoint({ x: next.x, y: next.y + dy });
    if (!isMarketBlocked(yCandidate)) next = yCandidate;
    playerPoint.current = next;
    updateCamera(next);
    updateStationProximity(next);
    return next;
  }, [updateCamera, updateStationProximity]);

  const stopMovement = useCallback(() => {
    direction.current = { x: 0, y: 0 };
    joystickEngaged.current = false;
    tapTarget.current = null;
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

  const runMovement = useCallback((timestamp: number) => {
    const last = previousFrame.current ?? timestamp;
    const elapsedSeconds = Math.min(timestamp - last, 32) / 1000;
    previousFrame.current = timestamp;
    const target = tapTarget.current;

    if (target) {
      const current = playerPoint.current;
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 3) {
        tapTarget.current = null;
        previousFrame.current = null;
        animationFrame.current = null;
        setTapTargetMarker(null);
        return;
      }
      const step = Math.min(distance, MARKET_MOVE_SPEED * speedMultiplier.current * elapsedSeconds);
      const next = movePlayer((dx / distance) * step, (dy / distance) * step);
      if (step > 0 && Math.hypot(next.x - current.x, next.y - current.y) < 0.05) {
        tapTarget.current = null;
        previousFrame.current = null;
        animationFrame.current = null;
        setTapTargetMarker(null);
        return;
      }
      animationFrame.current = requestAnimationFrame(runMovement);
      return;
    }

    movePlayer(
      direction.current.x * MARKET_MOVE_SPEED * speedMultiplier.current * elapsedSeconds,
      direction.current.y * MARKET_MOVE_SPEED * speedMultiplier.current * elapsedSeconds,
    );
    if (joystickEngaged.current) animationFrame.current = requestAnimationFrame(runMovement);
    else {
      previousFrame.current = null;
      animationFrame.current = null;
    }
  }, [movePlayer]);

  const beginMovement = useCallback(() => {
    if (animationFrame.current === null) animationFrame.current = requestAnimationFrame(runMovement);
  }, [runMovement]);

  const joystickResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !controlsLockedRef.current,
    onMoveShouldSetPanResponder: () => !controlsLockedRef.current,
    onPanResponderGrant: (event) => {
      const half = MARKET_JOYSTICK_SIZE / 2;
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
      const scale = distance > MARKET_JOYSTICK_RADIUS ? MARKET_JOYSTICK_RADIUS / distance : 1;
      const x = gesture.dx * scale;
      const y = gesture.dy * scale;
      joystickKnob.setValue({ x, y });
      direction.current = { x: x / MARKET_JOYSTICK_RADIUS, y: y / MARKET_JOYSTICK_RADIUS };
    },
    onPanResponderRelease: stopMovement,
    onPanResponderTerminate: stopMovement,
  })).current;

  useEffect(() => () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
  }, []);

  useEffect(() => {
    if (!interactive) stopMovement();
  }, [interactive, stopMovement]);

  const handleViewportLayout = (event: LayoutChangeEvent) => {
    viewport.current = event.nativeEvent.layout;
    viewportNode.current?.measureInWindow((x, y) => {
      viewportOrigin.current = { x, y };
    });
    updateCamera(playerPoint.current);
    updateStationProximity(playerPoint.current);
  };

  const handleAccessibilityMove = (actionName: string) => {
    if (controlsLockedRef.current) return;
    if (actionName === 'moveUp') movePlayer(0, -MARKET_ACCESSIBILITY_STEP);
    if (actionName === 'moveDown') movePlayer(0, MARKET_ACCESSIBILITY_STEP);
    if (actionName === 'moveLeft') movePlayer(-MARKET_ACCESSIBILITY_STEP, 0);
    if (actionName === 'moveRight') movePlayer(MARKET_ACCESSIBILITY_STEP, 0);
  };

  const startTapMovement = (desired: MarketPoint) => {
    if (controlsLockedRef.current) return;
    stopMovement();
    const target = findMarketReachableTarget(playerPoint.current, desired);
    if (Math.hypot(target.x - playerPoint.current.x, target.y - playerPoint.current.y) < 2) return;
    tapTarget.current = target;
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

  const handleWorldPress = (event: GestureResponderEvent) => {
    if (controlMode !== 'touch' || controlsLockedRef.current) return;
    if (touchHoldActivated.current) {
      touchHoldActivated.current = false;
      return;
    }
    startTapMovement(getTouchedWorldPoint(event));
  };

  const handleStationPress = (event: GestureResponderEvent, station: MarketStationId) => {
    event?.stopPropagation?.();
    startTapMovement(MARKET_STATIONS[station]);
  };

  const selectControlMode = (mode: MarketControlMode) => {
    stopMovement();
    speedMultiplier.current = 1;
    setRunEnabled(false);
    setControlMode(mode);
  };

  return (
    <Pressable
      accessibilityActions={[
        { label: '위로 이동', name: 'moveUp' },
        { label: '아래로 이동', name: 'moveDown' },
        { label: '왼쪽으로 이동', name: 'moveLeft' },
        { label: '오른쪽으로 이동', name: 'moveRight' },
      ]}
      accessibilityHint={interactive ? '바깥 마을과 같은 방식으로 캐릭터를 움직입니다' : undefined}
      accessibilityLabel="하늘마트 매장"
      delayLongPress={260}
      onAccessibilityAction={(event) => handleAccessibilityMove(event.nativeEvent.actionName)}
      onLayout={handleViewportLayout}
      onLongPress={handleWorldLongPress}
      onPress={handleWorldPress}
      onPressIn={() => {
        if (controlMode === 'touch' && interactive) touchHoldActivated.current = false;
      }}
      onPressOut={() => {
        if (touchHoldActivated.current) stopMovement();
      }}
      ref={viewportNode}
      style={styles.map}
    >
      <Animated.View style={[styles.marketWorld, { transform: camera.getTranslateTransform() }]}>
        <View style={styles.marketWorldGround} />
        <View style={styles.marketBackWall}>
          <View style={styles.wallStripe} />
          <View style={styles.storeLogo}>
            <Ionicons color="#FFFFFF" name="basket" size={18} />
            <Text style={styles.storeLogoText}>HANEUL MART</Text>
          </View>
          <Text style={styles.wallMessage}>필요한 만큼, 알맞게 골라요</Text>
        </View>
        {[0, 1, 2, 3, 4, 5, 6].map((row) => (
          <View key={row} style={[styles.floorTileRow, { top: 150 + row * 120 }]} />
        ))}
        {[0, 1, 2, 3, 4, 5].map((column) => (
          <View key={column} style={[styles.floorTileColumn, { left: 70 + column * 150 }]} />
        ))}
        <View style={[styles.marketAisle, styles.marketAisleMain]} />
        <View style={[styles.marketAisle, styles.marketAisleCrossTop]} />
        <View style={[styles.marketAisle, styles.marketAisleCrossBottom]} />

        {tapTargetMarker && controlMode === 'touch' ? (
          <View pointerEvents="none" style={[styles.marketTapTarget, { left: tapTargetMarker.x - 12, top: tapTargetMarker.y - 12 }]} />
        ) : null}

        <PressScale
          accessibilityHint="가까이 이동하면 계산할 수 있습니다"
          accessibilityLabel="계산대로 이동"
          accessibilityRole="button"
          disabled={!interactive}
          onPress={(event) => handleStationPress(event, 'checkout')}
          scaleTo={0.98}
          style={[styles.counterArea, nearbyStation === 'checkout' && styles.counterAreaActive]}
        >
          <View style={styles.counterRegister}>
            <View style={styles.registerScreen} />
            <View style={styles.registerBase} />
          </View>
          <View style={styles.cashierCharacter}>
            <View style={styles.cashierHair} />
            <View style={styles.cashierHead} />
            <View style={styles.cashierBody}><View style={styles.cashierApron} /></View>
          </View>
          <View style={styles.cashierNameTag}><Text style={styles.cashierNameText}>수진</Text></View>
          <Text style={styles.counterSign}>계산대</Text>
          {nearbyStation === 'checkout' ? <View pointerEvents="none" style={styles.stationMarker} /> : null}
        </PressScale>

        {marketCategories.map((category) => (
          <ShelfZone
            active={nearbyStation === category.id}
            category={category}
            key={category.id}
            layout={MARKET_SHELVES[category.id]}
            onPress={(event) => handleStationPress(event, category.id)}
          />
        ))}

        <View style={styles.marketEntranceInterior}>
          <Ionicons color="#6D7B72" name="log-out-outline" size={23} />
          <Text style={styles.marketEntranceInteriorText}>입구</Text>
        </View>
      </Animated.View>

      <View accessibilityLabel="마트 안 내 캐릭터" pointerEvents="none" style={styles.marketPlayerFixed}>
        <View style={styles.playerShadow} />
        <View style={styles.playerMoveRing} />
        <View style={styles.playerHead} />
        <View style={styles.playerBody}><Image resizeMode="contain" source={icons.user} style={styles.playerBadgeImage} /></View>
        <View style={styles.playerBasket}><Ionicons color="#FFFFFF" name="basket" size={15} /></View>
      </View>

      {interactive ? (
        <PressScale
          accessibilityLabel={controlMode === 'joystick' ? '터치 이동으로 변경' : '조이스틱 이동으로 변경'}
          accessibilityRole="button"
          onPress={(event) => {
            event?.stopPropagation?.();
            selectControlMode(controlMode === 'joystick' ? 'touch' : 'joystick');
          }}
          style={styles.marketControlToggle}
        >
          <Ionicons color="#FFF8E8" name={controlMode === 'joystick' ? 'hand-left-outline' : 'game-controller-outline'} size={17} />
          <Text style={styles.marketControlToggleText}>{controlMode === 'joystick' ? '터치' : '조이스틱'}</Text>
        </PressScale>
      ) : null}

      {interactive ? (
        <PressScale
          accessibilityHint="한 번 누르면 달리기를 켜고 다시 누르면 끕니다"
          accessibilityLabel={runEnabled ? '마트에서 달리기 끄기' : '마트에서 달리기 켜기'}
          accessibilityRole="button"
          accessibilityState={{ selected: runEnabled }}
          onPress={(event) => {
            event?.stopPropagation?.();
            setRunEnabled((enabled) => {
              const next = !enabled;
              speedMultiplier.current = next ? 1.55 : 1;
              return next;
            });
          }}
          style={[styles.marketRunButton, runEnabled && styles.marketRunButtonActive]}
        >
          <Ionicons color={runEnabled ? '#FFFFFF' : '#39493F'} name="walk" size={22} />
        </PressScale>
      ) : null}

      {controlMode === 'joystick' && interactive ? (
        <View
          accessibilityActions={[
            { label: '위로 이동', name: 'moveUp' },
            { label: '아래로 이동', name: 'moveDown' },
            { label: '왼쪽으로 이동', name: 'moveLeft' },
            { label: '오른쪽으로 이동', name: 'moveRight' },
          ]}
          accessibilityLabel="마트 이동 조이스틱"
          accessibilityRole="adjustable"
          onAccessibilityAction={(event) => handleAccessibilityMove(event.nativeEvent.actionName)}
          onLayout={(event) => { joystickZoneSize.current = event.nativeEvent.layout; }}
          style={styles.marketJoystickZone}
          {...joystickResponder.panHandlers}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.marketJoystick,
              {
                left: joystickCenter.x - MARKET_JOYSTICK_SIZE / 2,
                opacity: joystickActive ? 1 : 0.42,
                top: joystickCenter.y - MARKET_JOYSTICK_SIZE / 2,
              },
            ]}
          >
            <View style={styles.marketJoystickGuideHorizontal} />
            <View style={styles.marketJoystickGuideVertical} />
            <Animated.View style={[styles.marketJoystickKnob, { transform: joystickKnob.getTranslateTransform() }]} />
          </Animated.View>
        </View>
      ) : null}

      {controlMode === 'touch' && interactive ? (
        <View pointerEvents="none" style={styles.marketTouchHint}>
          <Ionicons color="#FFFFFF" name="finger-print" size={15} />
          <Text style={styles.marketTouchHintText}>누르거나 길게 눌러 이동</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function ShelfZone({
  active,
  category,
  layout,
  onPress,
}: {
  active: boolean;
  category: MarketCategory;
  layout: { height: number; width: number; x: number; y: number };
  onPress: (event: GestureResponderEvent) => void;
}) {
  const products = marketProducts.filter((product) => product.categoryId === category.id);
  return (
    <PressScale
      accessibilityLabel={`${category.label} 진열대`}
      accessibilityHint="가까이 이동한 뒤 살펴보기 버튼을 누릅니다"
      accessibilityRole="button"
      onPress={onPress}
      scaleTo={0.97}
      style={[
        styles.shelfZone,
        { height: layout.height, left: layout.x, top: layout.y, width: layout.width },
        active && styles.shelfZoneActive,
      ]}
    >
      <View style={[styles.shelfLabel, { backgroundColor: category.color }]}>
        <Ionicons color="#FFFFFF" name={category.icon} size={15} />
        <Text style={styles.shelfLabelText}>{category.label}</Text>
      </View>
      <View style={styles.shelfProducts}>
        {products.slice(0, 4).map((product) => (
          <View key={product.id} style={[styles.shelfProduct, { backgroundColor: product.packageColor }]}>
            <View style={[styles.shelfProductBand, { backgroundColor: product.color }]} />
          </View>
        ))}
      </View>
      <View style={styles.shelfBoard} />
      <Text style={styles.shelfHelper}>{category.helper}</Text>
      {active ? <View pointerEvents="none" style={styles.stationMarker} /> : null}
    </PressScale>
  );
}

function NpcDialogueCard({
  buttonLabel,
  message,
  onContinue,
  progress,
}: {
  buttonLabel: string;
  message: string;
  onContinue: () => void;
  progress: string;
}) {
  return (
    <View style={styles.dialogueOverlay}>
      <View style={styles.dialogueCard}>
        <View style={styles.dialogueHeader}>
          <View style={styles.dialogueAvatar}>
            <View style={styles.dialogueAvatarHair} />
            <View style={styles.dialogueAvatarFace} />
          </View>
          <View style={styles.dialogueHeaderCopy}>
            <Text style={styles.dialogueName}>수진</Text>
            <Text style={styles.dialogueRole}>하늘마트 직원</Text>
          </View>
          <Text style={styles.dialogueProgress}>{progress}</Text>
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.dialogueMessage}>{message}</Text>
        <PressScale accessibilityRole="button" onPress={onContinue} style={styles.dialogueButton}>
          <Text style={styles.dialogueButtonText}>{buttonLabel}</Text>
          <Ionicons color="#FFFFFF" name="arrow-forward" size={20} />
        </PressScale>
      </View>
    </View>
  );
}

function ProductShelfSheet({
  cart,
  category,
  onChangeQuantity,
  onClose,
}: {
  cart: MarketCart;
  category: MarketCategory;
  onChangeQuantity: (productId: string, change: number) => void;
  onClose: () => void;
}) {
  const products = marketProducts.filter((product) => product.categoryId === category.id);
  return (
    <View style={styles.sheetOverlay}>
      <Pressable accessibilityLabel="진열대 닫기" accessibilityRole="button" onPress={onClose} style={styles.sheetBackdrop} />
      <View style={styles.productSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <View style={[styles.sheetHeaderIcon, { backgroundColor: category.softColor }]}>
            <Ionicons color={category.color} name={category.icon} size={23} />
          </View>
          <View style={styles.sheetHeaderCopy}>
            <Text style={styles.sheetEyebrow}>SHELF · 진열대 살펴보기</Text>
            <Text style={styles.sheetTitle}>{category.label}</Text>
          </View>
          <PressScale accessibilityLabel="진열대 닫기" hitSlop={8} onPress={onClose} style={styles.sheetCloseButton}>
            <Ionicons color="#666A67" name="close" size={23} />
          </PressScale>
        </View>
        <ScrollView
          contentContainerStyle={styles.productGrid}
          showsVerticalScrollIndicator={false}
          style={styles.productScroll}
        >
          {products.map((product) => (
            <ProductCard
              key={product.id}
              onAdd={() => onChangeQuantity(product.id, 1)}
              onRemove={() => onChangeQuantity(product.id, -1)}
              product={product}
              quantity={getCartQuantity(cart, product.id)}
            />
          ))}
        </ScrollView>
        <PressScale accessibilityRole="button" onPress={onClose} style={styles.sheetDoneButton}>
          <Text style={styles.sheetDoneButtonText}>진열대로 돌아가기</Text>
        </PressScale>
      </View>
    </View>
  );
}

function ProductCard({
  onAdd,
  onRemove,
  product,
  quantity,
}: {
  onAdd: () => void;
  onRemove: () => void;
  product: MarketProduct;
  quantity: number;
}) {
  return (
    <View style={[styles.productCard, quantity > 0 && styles.productCardSelected]}>
      <View style={[styles.productVisual, { backgroundColor: product.packageColor }]}>
        <View style={[styles.productVisualBand, { backgroundColor: product.color }]} />
        <Ionicons color={product.color} name={product.icon as IoniconName} size={25} />
        {quantity > 0 ? (
          <View style={styles.selectedCheck}><Ionicons color="#FFFFFF" name="checkmark" size={11} /></View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.productName}>{product.name}</Text>
      <Text numberOfLines={1} style={styles.productDetail}>{product.detail}</Text>
      <Text style={styles.productPrice}>{formatPrice(product.price)}</Text>
      {quantity === 0 ? (
        <PressScale accessibilityLabel={`${product.name} 담기`} accessibilityRole="button" onPress={onAdd} style={styles.addProductButton}>
          <Ionicons color="#FFFFFF" name="add" size={15} />
          <Text style={styles.addProductButtonText}>담기</Text>
        </PressScale>
      ) : (
        <View style={styles.quantityControl}>
          <PressScale accessibilityLabel={`${product.name} 한 개 빼기`} onPress={onRemove} style={styles.quantityButton}>
            <Ionicons color="#4E5D55" name="remove" size={15} />
          </PressScale>
          <Text style={styles.quantityValue}>{quantity}</Text>
          <PressScale accessibilityLabel={`${product.name} 한 개 더 담기`} onPress={onAdd} style={styles.quantityButton}>
            <Ionicons color="#4E5D55" name="add" size={15} />
          </PressScale>
        </View>
      )}
    </View>
  );
}

function CartSheet({
  cart,
  onChangeQuantity,
  onCheckout,
  onClose,
  total,
}: {
  cart: MarketCart;
  onChangeQuantity: (productId: string, change: number) => void;
  onCheckout: () => void;
  onClose: () => void;
  total: number;
}) {
  const lines = Object.entries(cart)
    .map(([productId, quantity]) => ({ product: getMarketProduct(productId), quantity }))
    .filter((line): line is { product: MarketProduct; quantity: number } => Boolean(line.product));
  return (
    <View style={styles.sheetOverlay}>
      <Pressable accessibilityLabel="장바구니 닫기" accessibilityRole="button" onPress={onClose} style={styles.sheetBackdrop} />
      <View style={styles.cartSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.cartSheetHeader}>
          <View>
            <Text style={styles.sheetEyebrow}>INVENTORY · 선택한 물건</Text>
            <Text style={styles.sheetTitle}>내 가방</Text>
          </View>
          <PressScale accessibilityLabel="장바구니 닫기" onPress={onClose} style={styles.sheetCloseButton}>
            <Ionicons color="#666A67" name="close" size={23} />
          </PressScale>
        </View>
        {lines.length === 0 ? (
          <View style={styles.emptyCart}>
            <View style={styles.emptyCartIcon}><Ionicons color="#87A395" name="basket-outline" size={34} /></View>
            <Text style={styles.emptyCartTitle}>아직 담은 물건이 없어요</Text>
            <Text style={styles.emptyCartDescription}>진열대를 눌러 필요한 물건을 찾아보세요.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.cartList} style={styles.cartListScroll}>
            {lines.map(({ product, quantity }) => (
              <View key={product.id} style={styles.cartLine}>
                <View style={[styles.cartLineIcon, { backgroundColor: product.packageColor }]}>
                  <Ionicons color={product.color} name={product.icon as IoniconName} size={21} />
                </View>
                <View style={styles.cartLineCopy}>
                  <Text style={styles.cartLineName}>{product.name}</Text>
                  <Text style={styles.cartLinePrice}>{formatPrice(product.price * quantity)}</Text>
                </View>
                <View style={styles.cartQuantity}>
                  <PressScale accessibilityLabel={`${product.name} 한 개 빼기`} onPress={() => onChangeQuantity(product.id, -1)} style={styles.cartQuantityButton}>
                    <Ionicons color="#4D5751" name="remove" size={16} />
                  </PressScale>
                  <Text style={styles.cartQuantityText}>{quantity}</Text>
                  <PressScale accessibilityLabel={`${product.name} 한 개 더 담기`} onPress={() => onChangeQuantity(product.id, 1)} style={styles.cartQuantityButton}>
                    <Ionicons color="#4D5751" name="add" size={16} />
                  </PressScale>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
        <View style={styles.cartTotalRow}>
          <Text style={styles.cartTotalLabel}>예상 금액</Text>
          <Text style={styles.cartTotalValue}>{formatPrice(total)}</Text>
        </View>
        <PressScale
          accessibilityRole="button"
          disabled={lines.length === 0}
          onPress={onCheckout}
          style={[styles.checkoutButton, lines.length === 0 && styles.buttonDisabled]}
        >
          <Text style={styles.checkoutButtonText}>가방 닫기</Text>
          <Ionicons color="#FFFFFF" name="close" size={20} />
        </PressScale>
      </View>
    </View>
  );
}

function CheckoutScene({ cart }: { cart: MarketCart }) {
  return (
    <View style={styles.checkoutScene}>
      <View style={styles.checkoutWall}>
        <Text style={styles.checkoutWallText}>CHECKOUT</Text>
      </View>
      <View style={styles.checkoutCounterLarge}>
        <View style={styles.checkoutScanner} />
        <View style={styles.checkoutBelt}>
          {Object.entries(cart).slice(0, 4).map(([productId], index) => {
            const product = getMarketProduct(productId);
            return product ? (
              <View key={productId} style={[styles.beltProduct, { backgroundColor: product.packageColor, left: 20 + index * 48 }]}>
                <Ionicons color={product.color} name={product.icon as IoniconName} size={20} />
              </View>
            ) : null;
          })}
        </View>
      </View>
      <View style={styles.checkoutCashierLarge}>
        <View style={styles.checkoutCashierHair} />
        <View style={styles.checkoutCashierHead} />
        <View style={styles.checkoutCashierBody}><View style={styles.checkoutCashierApron} /></View>
      </View>
      <View style={styles.checkoutSpeech}>
        <Text style={styles.checkoutSpeechName}>수진</Text>
        <Text style={styles.checkoutSpeechText}>{marketMission.checkoutDialogue[0]}</Text>
      </View>
    </View>
  );
}

function CheckoutPanel({ cart, onBack, onCheck, total }: { cart: MarketCart; onBack: () => void; onCheck: () => void; total: number }) {
  return (
    <View style={styles.checkoutPanel}>
      <View style={styles.receiptHeader}>
        <View>
          <Text style={styles.receiptEyebrow}>하늘마트 계산대</Text>
          <Text style={styles.receiptTitle}>장바구니 확인</Text>
        </View>
        <View style={styles.receiptTotalBox}>
          <Text style={styles.receiptTotalLabel}>합계</Text>
          <Text style={styles.receiptTotalValue}>{formatPrice(total)}</Text>
        </View>
      </View>
      <View style={styles.checkoutHint}>
        <Ionicons color="#7A654F" name="information-circle" size={19} />
        <Text style={styles.checkoutHintText}>{marketMission.checkoutDialogue[1]}</Text>
      </View>
      <View style={styles.checkoutActions}>
        <PressScale accessibilityRole="button" onPress={onBack} style={styles.checkoutBackButton}>
          <Text style={styles.checkoutBackText}>다시 보기</Text>
        </PressScale>
        <PressScale accessibilityRole="button" onPress={onCheck} style={styles.checkoutCheckButton}>
          <Text style={styles.checkoutCheckText}>목록 확인</Text>
          <Ionicons color="#FFFFFF" name="checkmark" size={20} />
        </PressScale>
      </View>
    </View>
  );
}

function ResultPanel({ evaluation, onExit, onRetry }: { evaluation: MarketEvaluation; onExit: () => void; onRetry: () => void }) {
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState<boolean | null>(null);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardProgress = useRef(new Animated.Value(0)).current;
  const heroProgress = useRef(new Animated.Value(0)).current;
  const detailsProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotionEnabled(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotionEnabled);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotionEnabled === null) return undefined;

    const values = [overlayOpacity, cardOpacity, cardProgress, heroProgress, detailsProgress];
    values.forEach((value) => value.stopAnimation());

    if (reduceMotionEnabled) {
      values.forEach((value) => value.setValue(1));
      return undefined;
    }

    values.forEach((value) => value.setValue(0));
    const entrance = Animated.parallel([
      Animated.timing(overlayOpacity, {
        duration: 180,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(cardOpacity, {
          duration: 260,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(cardProgress, {
          duration: 360,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(120),
        Animated.spring(heroProgress, {
          damping: 13,
          mass: 0.65,
          stiffness: 190,
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(210),
        Animated.timing(detailsProgress, {
          duration: 280,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
    ]);
    entrance.start();

    return () => entrance.stop();
  }, [cardOpacity, cardProgress, detailsProgress, heroProgress, overlayOpacity, reduceMotionEnabled]);

  const overlayAnimationStyle = { opacity: overlayOpacity };
  const cardAnimationStyle = {
    opacity: cardOpacity,
    transform: [
      { translateY: cardProgress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
      { scale: cardProgress.interpolate({ inputRange: [0, 1], outputRange: [0.975, 1] }) },
    ],
  };
  const heroAnimationStyle = {
    opacity: heroProgress,
    transform: [{ scale: heroProgress.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1] }) }],
  };
  const detailsAnimationStyle = {
    opacity: detailsProgress,
    transform: [{ translateY: detailsProgress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  };

  if (evaluation.success) {
    return (
      <Animated.View accessibilityViewIsModal style={[styles.resultOverlay, overlayAnimationStyle]}>
        <Animated.View style={[styles.resultCard, cardAnimationStyle]}>
          <Animated.View style={heroAnimationStyle}>
            <View style={styles.successIconStage}>
              <View style={styles.successRing} />
              <Ionicons color="#FFFFFF" name="checkmark" size={40} />
            </View>
          </Animated.View>
          <View style={styles.resultStamp}>
            <Ionicons color="#FFFFFF" name="star" size={14} />
            <Text style={styles.resultStampText}>MISSION CLEAR</Text>
          </View>
          <Text style={styles.resultEyebrow}>장보기 의뢰 완료</Text>
          <Text style={styles.resultTitle}>{marketMission.successMessage}</Text>
          <Text style={styles.resultDescription}>필요한 물건을 빠뜨리지 않고 예산도 지켰어요.</Text>
          <Animated.View style={[styles.resultStats, detailsAnimationStyle]}>
            <View style={styles.resultStat}>
              <Text style={styles.resultStatValue}>{marketMission.objectives.length}</Text>
              <Text style={styles.resultStatLabel}>목록 완료</Text>
            </View>
            <View style={styles.resultStatDivider} />
            <View style={styles.resultStat}>
              <Text style={styles.resultStatValue}>{formatPrice(evaluation.total)}</Text>
              <Text style={styles.resultStatLabel}>사용 금액</Text>
            </View>
            <View style={styles.resultStatDivider} />
            <View style={styles.resultStat}>
              <Text style={styles.resultStatValue}>+30</Text>
              <Text style={styles.resultStatLabel}>경험치</Text>
            </View>
          </Animated.View>
          <PressScale accessibilityRole="button" onPress={onExit} style={styles.resultPrimaryButton}>
            <Text style={styles.resultPrimaryButtonText}>마을로 돌아가기</Text>
          </PressScale>
        </Animated.View>
      </Animated.View>
    );
  }

  return (
    <Animated.View accessibilityViewIsModal style={[styles.resultOverlay, overlayAnimationStyle]}>
      <Animated.View style={[styles.resultCard, cardAnimationStyle]}>
        <Animated.View style={heroAnimationStyle}>
          <View style={styles.retryIconStage}><Ionicons color="#9A7045" name="basket-outline" size={34} /></View>
        </Animated.View>
        <Text style={styles.resultEyebrow}>한 번 더 확인해요</Text>
        <Text style={styles.resultTitle}>조금만 고치면 완성할 수 있어요</Text>
        <Animated.View style={[styles.feedbackList, detailsAnimationStyle]}>
          {evaluation.missing.length > 0 ? (
            <FeedbackRow icon="list-outline" text={`목록에 있는 물건 ${evaluation.missing.reduce((sum, item) => sum + item.quantity, 0)}개를 더 찾아보세요.`} />
          ) : null}
          {evaluation.extra.length > 0 ? (
            <FeedbackRow icon="remove-circle-outline" text={`목록에 없는 물건 ${evaluation.extra.reduce((sum, item) => sum + item.quantity, 0)}개가 들어 있어요.`} />
          ) : null}
          {evaluation.overBudget > 0 ? (
            <FeedbackRow icon="wallet-outline" text={`예산보다 ${formatPrice(evaluation.overBudget)} 많아요.`} />
          ) : null}
        </Animated.View>
        <PressScale accessibilityRole="button" onPress={onRetry} style={styles.resultPrimaryButton}>
          <Text style={styles.resultPrimaryButtonText}>장바구니 고치기</Text>
        </PressScale>
      </Animated.View>
    </Animated.View>
  );
}

function FeedbackRow({ icon, text }: { icon: IoniconName; text: string }) {
  return (
    <View style={styles.feedbackRow}>
      <View style={styles.feedbackIcon}><Ionicons color="#9A7045" name={icon} size={19} /></View>
      <Text style={styles.feedbackText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#D8D1C2', flex: 1 },
  embeddedRoot: { ...StyleSheet.absoluteFillObject, zIndex: 28 },
  embeddedShoppingFooter: { bottom: undefined, top: 110 },
  embeddedCheckoutOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 52,
  },
  embeddedCheckoutBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24,30,26,0.52)',
  },
  topBar: { alignItems: 'center', flexDirection: 'row', left: 0, paddingHorizontal: 14, paddingTop: 34, position: 'absolute', right: 0, top: 0, zIndex: 20 },
  topIconButton: { alignItems: 'center', backgroundColor: 'rgba(34,44,38,0.84)', borderColor: 'rgba(255,255,255,0.28)', borderRadius: 18, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  locationHeading: { backgroundColor: 'rgba(34,44,38,0.84)', borderColor: 'rgba(255,255,255,0.2)', borderRadius: 13, borderWidth: 1, flex: 1, marginLeft: 8, paddingHorizontal: 11, paddingVertical: 7 },
  locationEyebrow: { color: 'rgba(255,255,255,0.62)', fontFamily: fonts.bold, fontSize: 8, letterSpacing: 0.7 },
  locationTitle: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 15, letterSpacing: -0.3, marginTop: 1 },
  topStats: { alignItems: 'flex-end', gap: 5, marginLeft: 7 },
  progressPill: { alignItems: 'center', backgroundColor: '#F5EBD4', borderColor: '#D9C49A', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  progressPillText: { color: '#466B55', fontFamily: fonts.bold, fontSize: 11 },
  budgetPill: { alignItems: 'flex-end', backgroundColor: 'rgba(34,44,38,0.84)', borderRadius: 8, flexDirection: 'row', gap: 5, paddingHorizontal: 7, paddingVertical: 4 },
  budgetPillOver: { backgroundColor: '#FFF0EC', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 },
  budgetPillLabel: { color: 'rgba(255,255,255,0.58)', fontFamily: fonts.medium, fontSize: 8 },
  budgetPillValue: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 11 },
  topCartDot: { backgroundColor: '#E46D4E', borderColor: '#FFFFFF', borderRadius: 5, borderWidth: 2, height: 10, position: 'absolute', right: 10, top: 28, width: 10 },
  map: { flex: 1, minHeight: 520, overflow: 'hidden', position: 'relative' },
  marketWorld: { height: MARKET_WORLD_HEIGHT, left: 0, position: 'absolute', top: 0, width: MARKET_WORLD_WIDTH },
  marketWorldGround: { ...StyleSheet.absoluteFillObject, backgroundColor: '#DED6C8', borderColor: '#B8AB98', borderWidth: 12 },
  marketBackWall: { backgroundColor: '#F3E6D6', borderBottomColor: '#CFBBA6', borderBottomWidth: 4, height: 120, left: 0, position: 'absolute', top: 0, width: MARKET_WORLD_WIDTH },
  marketAisle: { backgroundColor: 'rgba(250,244,230,0.54)', borderColor: 'rgba(145,125,99,0.16)', borderRadius: 26, borderWidth: 2, position: 'absolute' },
  marketAisleMain: { height: 720, left: 365, top: 205, width: 170 },
  marketAisleCrossTop: { height: 100, left: 245, top: 350, width: 410 },
  marketAisleCrossBottom: { height: 100, left: 245, top: 630, width: 410 },
  marketTapTarget: { borderColor: 'rgba(52,91,68,0.72)', borderRadius: 12, borderWidth: 3, height: 24, position: 'absolute', width: 24, zIndex: 4 },
  backWall: { backgroundColor: '#F3E6D6', borderBottomColor: '#CFBBA6', borderBottomWidth: 3, height: 94, left: 0, position: 'absolute', right: 0, top: 0 },
  wallStripe: { backgroundColor: '#D4775B', bottom: 11, height: 7, left: 0, opacity: 0.8, position: 'absolute', right: 0 },
  storeLogo: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#C95D46', borderRadius: 8, flexDirection: 'row', gap: 7, marginTop: 13, paddingHorizontal: 14, paddingVertical: 8 },
  storeLogoText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.1 },
  wallMessage: { bottom: 16, color: '#8B715E', fontFamily: fonts.medium, fontSize: 9, left: 17, position: 'absolute' },
  mapFloor: { backgroundColor: '#E5DED1', bottom: 0, left: 0, position: 'absolute', right: 0, top: 94 },
  floorTileRow: { backgroundColor: 'rgba(255,255,255,0.45)', height: 1, left: 0, position: 'absolute', right: 0 },
  floorTileColumn: { backgroundColor: 'rgba(255,255,255,0.38)', bottom: 0, position: 'absolute', top: 0, transform: [{ rotate: '8deg' }], width: 1 },
  counterArea: { backgroundColor: '#A97C59', borderColor: '#77563F', borderRadius: 12, borderWidth: 2, height: 105, left: 325, position: 'absolute', top: 92, width: 250 },
  counterAreaActive: { borderColor: '#F3CE62', borderWidth: 3 },
  counterRegister: { left: 12, position: 'absolute', top: -15 },
  registerScreen: { backgroundColor: '#52605C', borderColor: '#36403D', borderRadius: 3, borderWidth: 1, height: 17, width: 28 },
  registerBase: { backgroundColor: '#707B77', height: 6, marginLeft: 9, width: 10 },
  cashierCharacter: { alignItems: 'center', position: 'absolute', right: 15, top: -37 },
  cashierHair: { backgroundColor: '#5B4437', borderRadius: 12, height: 24, position: 'absolute', top: -2, width: 27 },
  cashierHead: { backgroundColor: '#E2B592', borderColor: '#6A4D3D', borderRadius: 11, borderWidth: 1, height: 22, width: 22 },
  cashierBody: { alignItems: 'center', backgroundColor: '#5D8C6B', borderColor: '#456550', borderRadius: 5, borderWidth: 1, height: 31, marginTop: -1, overflow: 'hidden', width: 24 },
  cashierApron: { backgroundColor: '#E7E1CE', height: 21, marginTop: 8, width: 17 },
  cashierNameTag: { backgroundColor: '#FFFFFF', borderRadius: 8, bottom: -19, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', right: 8 },
  cashierNameText: { color: '#60574F', fontFamily: fonts.semibold, fontSize: 9 },
  counterSign: { color: '#FFF4DE', fontFamily: fonts.bold, fontSize: 15, left: 24, letterSpacing: 1, position: 'absolute', top: 56 },
  shelfGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center', left: 14, position: 'absolute', right: 14, top: 176 },
  shelfZone: { backgroundColor: '#9B7456', borderColor: '#6F503B', borderRadius: 12, borderWidth: 2, paddingHorizontal: 14, paddingTop: 16, position: 'absolute' },
  shelfZoneOffset: { transform: [{ translateY: 10 }] },
  shelfZoneActive: { borderColor: '#F3CE62', borderWidth: 3 },
  shelfLabel: { alignItems: 'center', borderRadius: 9, flexDirection: 'row', gap: 5, left: 8, paddingHorizontal: 8, paddingVertical: 5, position: 'absolute', top: -11, zIndex: 3 },
  shelfLabelText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 10 },
  shelfProducts: { flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 9 },
  shelfProduct: { borderColor: 'rgba(66,48,35,0.2)', borderRadius: 4, borderWidth: 1, height: 45, overflow: 'hidden', width: 38 },
  shelfProductBand: { height: 9, marginTop: 8, width: '100%' },
  shelfBoard: { backgroundColor: '#735038', height: 8, marginHorizontal: -4, marginTop: 8 },
  shelfHelper: { color: '#F5EBDD', fontFamily: fonts.medium, fontSize: 9, marginTop: 6, textAlign: 'center' },
  stationMarker: { backgroundColor: 'rgba(255,244,184,0.26)', borderColor: '#FFE889', borderRadius: 14, borderWidth: 3, bottom: -21, height: 28, left: '50%', marginLeft: -14, position: 'absolute', width: 28 },
  playerCharacter: { alignItems: 'center', left: 0, position: 'absolute', top: 0, zIndex: 12 },
  marketPlayerFixed: { alignItems: 'center', height: 78, justifyContent: 'flex-start', left: '50%', marginLeft: -25, marginTop: -39, position: 'absolute', top: '50%', width: 50, zIndex: 16 },
  playerShadow: { backgroundColor: 'rgba(69,70,61,0.25)', borderRadius: 18, bottom: -8, height: 12, position: 'absolute', width: 42 },
  playerMoveRing: { borderColor: 'rgba(255,244,184,0.64)', borderRadius: 23, borderWidth: 2, bottom: -13, height: 46, position: 'absolute', width: 46 },
  playerHead: { backgroundColor: '#E4B894', borderColor: '#604639', borderRadius: 14, borderWidth: 1.5, height: 29, width: 29, zIndex: 2 },
  playerBody: { alignItems: 'center', backgroundColor: '#E39344', borderColor: '#704D2B', borderRadius: 8, borderWidth: 1.5, height: 42, marginTop: -2, overflow: 'hidden', width: 33 },
  playerBadgeImage: { height: 22, marginTop: 10, width: 22 },
  playerBasket: { alignItems: 'center', backgroundColor: '#C95D46', borderColor: '#FFFFFF', borderRadius: 11, borderWidth: 1, height: 25, justifyContent: 'center', position: 'absolute', right: -19, top: 37, width: 25 },
  marketEntranceInterior: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.7)', borderColor: '#B9B0A2', borderRadius: 16, borderStyle: 'dashed', borderWidth: 2, flexDirection: 'row', gap: 7, height: 58, justifyContent: 'center', left: 375, position: 'absolute', top: 900, width: 150 },
  marketEntranceInteriorText: { color: '#647168', fontFamily: fonts.bold, fontSize: 13 },
  marketControlToggle: { alignItems: 'center', backgroundColor: 'rgba(35,47,39,0.86)', borderColor: 'rgba(255,255,255,0.24)', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 8, position: 'absolute', right: 14, top: 112, zIndex: 26 },
  marketControlToggleText: { color: '#FFF8E8', fontFamily: fonts.bold, fontSize: 9 },
  marketRunButton: { alignItems: 'center', backgroundColor: 'rgba(255,250,236,0.88)', borderColor: 'rgba(75,64,46,0.28)', borderRadius: 25, borderWidth: 2, bottom: 162, height: 50, justifyContent: 'center', position: 'absolute', right: 92, width: 50, zIndex: 24 },
  marketRunButtonActive: { backgroundColor: '#4C6E5A', borderColor: 'rgba(255,255,255,0.75)' },
  marketJoystickZone: { bottom: 72, height: MARKET_JOYSTICK_ZONE_HEIGHT, left: 0, position: 'absolute', width: '58%', zIndex: 22 },
  marketJoystick: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.52)', borderColor: 'rgba(49,61,52,0.22)', borderRadius: 55, borderWidth: 2, height: MARKET_JOYSTICK_SIZE, justifyContent: 'center', position: 'absolute', width: MARKET_JOYSTICK_SIZE },
  marketJoystickGuideHorizontal: { backgroundColor: 'rgba(62,78,67,0.12)', height: 2, position: 'absolute', width: 70 },
  marketJoystickGuideVertical: { backgroundColor: 'rgba(62,78,67,0.12)', height: 70, position: 'absolute', width: 2 },
  marketJoystickKnob: { backgroundColor: 'rgba(60,76,65,0.82)', borderColor: 'rgba(255,255,255,0.7)', borderRadius: 24, borderWidth: 2, height: 48, width: 48 },
  marketTouchHint: { alignItems: 'center', alignSelf: 'center', backgroundColor: 'rgba(38,50,42,0.84)', borderColor: 'rgba(255,255,255,0.2)', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8, position: 'absolute', top: 122, zIndex: 24 },
  marketTouchHintText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 10 },
  mapInstruction: { alignItems: 'center', alignSelf: 'center', backgroundColor: 'rgba(38,50,42,0.84)', borderColor: 'rgba(255,255,255,0.2)', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8, position: 'absolute', top: 128 },
  mapInstructionText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 10 },
  stationActionButton: { alignItems: 'center', backgroundColor: '#317A5B', borderColor: '#F5E8C8', borderRadius: 32, borderWidth: 3, bottom: 91, height: 64, justifyContent: 'center', position: 'absolute', right: 18, shadowColor: '#23352C', shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.24, shadowRadius: 6, width: 64, zIndex: 25 },
  stationActionText: { color: '#FFF8E8', fontFamily: fonts.bold, fontSize: 9, marginTop: 2 },
  shoppingFooter: { alignItems: 'stretch', bottom: 14, flexDirection: 'row', gap: 9, left: 13, position: 'absolute', right: 13, zIndex: 24 },
  missionStrip: { backgroundColor: '#FFF9EA', borderColor: '#D8C6A5', borderRadius: 11, borderWidth: 1, elevation: 3, flex: 1, height: 62, justifyContent: 'center', paddingBottom: 6, paddingHorizontal: 9, paddingTop: 9, position: 'relative', shadowColor: '#5D4A34', shadowOffset: { height: 2, width: 0 }, shadowOpacity: 0.14, shadowRadius: 4 },
  missionTape: { alignSelf: 'center', backgroundColor: 'rgba(224,204,163,0.62)', borderRadius: 2, height: 8, position: 'absolute', top: -4, transform: [{ rotate: '-1deg' }], width: 36 },
  missionStripHeading: { alignItems: 'center', flexDirection: 'row', gap: 3, height: 13 },
  missionStripLabel: { color: '#806B53', fontFamily: fonts.handwriting, fontSize: 9, letterSpacing: 0.15 },
  missionChecklist: { alignItems: 'flex-start', flexDirection: 'row', gap: 7, marginTop: 2, minWidth: 0 },
  missionChecklistItem: { flex: 1, flexBasis: 0, minWidth: 0 },
  missionItemHeading: { alignItems: 'center', flexDirection: 'row', gap: 3, minWidth: 0 },
  missionCheckbox: { alignItems: 'center', backgroundColor: '#FFFCF3', borderColor: '#BBAA89', borderRadius: 6, borderWidth: 1, height: 11, justifyContent: 'center', width: 11 },
  missionCheckboxComplete: { backgroundColor: '#4E916B', borderColor: '#4E916B' },
  missionItemName: { color: '#4D4338', flex: 1, fontFamily: fonts.handwriting, fontSize: 12, lineHeight: 15, minWidth: 0 },
  missionItemNameComplete: { color: '#718074', textDecorationLine: 'line-through' },
  missionItemCount: { color: '#8C7559', fontFamily: fonts.bold, fontSize: 9, lineHeight: 10, marginLeft: 14 },
  missionItemCountComplete: { color: '#4E7D60' },
  cartButton: { alignItems: 'center', backgroundColor: '#367A5A', borderColor: '#F5E8C8', borderRadius: 16, borderWidth: 2, height: 62, justifyContent: 'center', position: 'relative', width: 68 },
  cartButtonText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 9, marginTop: 1 },
  cartCountBadge: { alignItems: 'center', backgroundColor: '#F0C95B', borderColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, height: 20, justifyContent: 'center', minWidth: 20, paddingHorizontal: 5, position: 'absolute', right: -4, top: -5 },
  cartCountText: { color: '#317A5B', fontFamily: fonts.bold, fontSize: 11 },
  dialogueOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(25,31,27,0.28)', justifyContent: 'flex-end', padding: 14, zIndex: 30 },
  dialogueCard: { backgroundColor: 'rgba(35,43,38,0.96)', borderColor: '#EED9A8', borderRadius: 16, borderWidth: 3, padding: 17 },
  dialogueHeader: { alignItems: 'center', flexDirection: 'row' },
  dialogueAvatar: { alignItems: 'center', backgroundColor: '#EAF2E9', borderColor: '#EED9A8', borderRadius: 22, borderWidth: 2, height: 44, justifyContent: 'center', marginRight: 10, overflow: 'hidden', width: 44 },
  dialogueAvatarHair: { backgroundColor: '#5B4437', borderRadius: 11, height: 22, position: 'absolute', top: 8, width: 25 },
  dialogueAvatarFace: { backgroundColor: '#E2B592', borderColor: '#6A4D3D', borderRadius: 10, borderWidth: 1, height: 20, marginTop: -3, width: 20 },
  dialogueHeaderCopy: { flex: 1 },
  dialogueName: { color: '#F5D895', fontFamily: fonts.bold, fontSize: 15 },
  dialogueRole: { color: 'rgba(255,255,255,0.58)', fontFamily: fonts.regular, fontSize: 10, marginTop: 2 },
  dialogueProgress: { color: 'rgba(255,255,255,0.54)', fontFamily: fonts.bold, fontSize: 10 },
  dialogueMessage: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 18, letterSpacing: -0.4, lineHeight: 27, marginTop: 16, minHeight: 58 },
  dialogueButton: { alignItems: 'center', alignSelf: 'flex-end', backgroundColor: '#B85C43', borderColor: '#E9A082', borderRadius: 11, borderWidth: 2, flexDirection: 'row', gap: 7, height: 45, justifyContent: 'center', marginTop: 13, paddingHorizontal: 18 },
  dialogueButtonText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 14 },
  sheetOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 50 },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(21,27,23,0.56)' },
  productSheet: { backgroundColor: '#F5E7C8', borderColor: '#77583E', borderRadius: 18, borderWidth: 4, margin: 10, paddingBottom: 15, paddingHorizontal: 14, paddingTop: 13 },
  cartSheet: { backgroundColor: '#F5E7C8', borderColor: '#77583E', borderRadius: 18, borderWidth: 4, margin: 10, maxHeight: '82%', minHeight: 420, paddingBottom: 15, paddingHorizontal: 14, paddingTop: 13 },
  sheetHandle: { alignSelf: 'center', backgroundColor: '#A88962', borderRadius: 3, height: 4, marginBottom: 12, opacity: 0.5, width: 38 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row' },
  cartSheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sheetHeaderIcon: { alignItems: 'center', borderRadius: 14, height: 44, justifyContent: 'center', marginRight: 10, width: 44 },
  sheetHeaderCopy: { flex: 1 },
  sheetEyebrow: { color: '#93734F', fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.45 },
  sheetTitle: { color: '#423326', fontFamily: fonts.laundryBold, fontSize: 21, letterSpacing: -0.4, marginTop: 2 },
  sheetCloseButton: { alignItems: 'center', backgroundColor: '#E2D0AA', borderColor: '#B39468', borderRadius: 10, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  productScroll: { marginHorizontal: -2, marginTop: 13, maxHeight: 390 },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4, paddingHorizontal: 2, width: '100%' },
  productCard: { backgroundColor: '#FFF7E6', borderColor: '#CBB58E', borderRadius: 10, borderWidth: 2, padding: 7, width: '31.5%' },
  productCardSelected: { borderColor: '#39795A', borderWidth: 3, padding: 6 },
  productVisual: { alignItems: 'center', borderColor: 'rgba(87,62,40,0.14)', borderRadius: 8, borderWidth: 1, height: 56, justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  productVisualBand: { height: 7, left: 0, opacity: 0.8, position: 'absolute', right: 0, top: 8 },
  selectedCheck: { alignItems: 'center', backgroundColor: '#317A5B', borderRadius: 8, height: 16, justifyContent: 'center', position: 'absolute', right: 4, top: 4, width: 16 },
  productName: { color: '#333633', fontFamily: fonts.bold, fontSize: 12, marginTop: 7 },
  productDetail: { color: '#94918D', fontFamily: fonts.regular, fontSize: 8, marginTop: 1 },
  productPrice: { color: '#4C514D', fontFamily: fonts.semibold, fontSize: 10, marginTop: 5 },
  addProductButton: { alignItems: 'center', backgroundColor: '#39795A', borderColor: '#285D43', borderRadius: 8, borderWidth: 1.5, flexDirection: 'row', height: 32, justifyContent: 'center', marginTop: 7 },
  addProductButtonText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 10, marginLeft: 2 },
  quantityControl: { alignItems: 'center', backgroundColor: '#E8DFC9', borderColor: '#C4B18D', borderRadius: 8, borderWidth: 1, flexDirection: 'row', height: 32, justifyContent: 'space-between', marginTop: 7, paddingHorizontal: 2 },
  quantityButton: { alignItems: 'center', height: 27, justifyContent: 'center', width: 25 },
  quantityValue: { color: '#34483E', fontFamily: fonts.bold, fontSize: 11 },
  sheetDoneButton: { alignItems: 'center', backgroundColor: '#E0CEA9', borderColor: '#B3966B', borderRadius: 10, borderWidth: 1.5, height: 46, justifyContent: 'center', marginTop: 14 },
  sheetDoneButtonText: { color: '#574530', fontFamily: fonts.bold, fontSize: 13 },
  emptyCart: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 210 },
  emptyCartIcon: { alignItems: 'center', backgroundColor: '#EDF4EF', borderRadius: 28, height: 58, justifyContent: 'center', width: 58 },
  emptyCartTitle: { color: '#404641', fontFamily: fonts.bold, fontSize: 16, marginTop: 13 },
  emptyCartDescription: { color: '#8E918D', fontFamily: fonts.regular, fontSize: 12, marginTop: 5 },
  cartListScroll: { flexGrow: 0, marginTop: 12, maxHeight: 275 },
  cartList: { gap: 8, paddingBottom: 5 },
  cartLine: { alignItems: 'center', backgroundColor: '#FFF7E6', borderColor: '#D1BD98', borderRadius: 10, borderWidth: 1, flexDirection: 'row', padding: 9 },
  cartLineIcon: { alignItems: 'center', borderRadius: 11, height: 42, justifyContent: 'center', marginRight: 10, width: 42 },
  cartLineCopy: { flex: 1 },
  cartLineName: { color: '#343936', fontFamily: fonts.semibold, fontSize: 13 },
  cartLinePrice: { color: '#88847F', fontFamily: fonts.medium, fontSize: 11, marginTop: 3 },
  cartQuantity: { alignItems: 'center', backgroundColor: '#E9DFC8', borderColor: '#CBB792', borderRadius: 8, borderWidth: 1, flexDirection: 'row', padding: 3 },
  cartQuantityButton: { alignItems: 'center', height: 29, justifyContent: 'center', width: 29 },
  cartQuantityText: { color: '#39453E', fontFamily: fonts.bold, fontSize: 12, minWidth: 20, textAlign: 'center' },
  cartTotalRow: { alignItems: 'center', borderStyle: 'dashed', borderTopColor: '#C7AF86', borderTopWidth: 1.5, flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 13 },
  cartTotalLabel: { color: '#77736E', fontFamily: fonts.medium, fontSize: 13 },
  cartTotalValue: { color: '#2F3933', fontFamily: fonts.bold, fontSize: 20 },
  checkoutButton: { alignItems: 'center', backgroundColor: '#39795A', borderColor: '#285D43', borderRadius: 10, borderWidth: 2, flexDirection: 'row', gap: 7, height: 50, justifyContent: 'center', marginTop: 12 },
  checkoutButtonText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 16 },
  buttonDisabled: { opacity: 0.38 },
  checkoutScene: { backgroundColor: '#E5DED1', flex: 1, minHeight: 400, overflow: 'hidden', position: 'relative' },
  checkoutWall: { alignItems: 'center', backgroundColor: '#F2E5D4', borderBottomColor: '#C9B39B', borderBottomWidth: 3, height: 102, paddingTop: 30 },
  checkoutWallText: { color: '#B2634D', fontFamily: fonts.bold, fontSize: 15, letterSpacing: 2 },
  checkoutCounterLarge: { backgroundColor: '#A97C59', borderColor: '#6D4E39', borderRadius: 12, borderWidth: 2, height: 110, left: '9%', position: 'absolute', right: '9%', top: 230 },
  checkoutScanner: { backgroundColor: '#57625F', borderColor: '#37403E', borderRadius: 7, borderWidth: 1, height: 32, position: 'absolute', right: 34, top: -22, width: 54 },
  checkoutBelt: { backgroundColor: '#575C5B', borderRadius: 6, height: 54, left: 18, overflow: 'hidden', position: 'absolute', right: 108, top: 17 },
  beltProduct: { alignItems: 'center', borderRadius: 6, height: 38, justifyContent: 'center', position: 'absolute', top: 8, width: 36 },
  checkoutCashierLarge: { alignItems: 'center', position: 'absolute', right: 48, top: 128 },
  checkoutCashierHair: { backgroundColor: '#594337', borderRadius: 25, height: 47, position: 'absolute', top: -4, width: 54 },
  checkoutCashierHead: { backgroundColor: '#E2B592', borderColor: '#664A3B', borderRadius: 22, borderWidth: 2, height: 44, width: 44 },
  checkoutCashierBody: { alignItems: 'center', backgroundColor: '#5D8C6B', borderColor: '#456550', borderRadius: 10, borderWidth: 2, height: 72, marginTop: -2, overflow: 'hidden', width: 58 },
  checkoutCashierApron: { backgroundColor: '#EAE4D4', borderRadius: 5, height: 46, marginTop: 18, width: 38 },
  checkoutSpeech: { backgroundColor: '#FFFFFF', borderColor: '#DED9D1', borderRadius: 18, borderWidth: 1, left: 24, padding: 14, position: 'absolute', right: 135, top: 118 },
  checkoutSpeechName: { color: '#3A6D54', fontFamily: fonts.bold, fontSize: 11 },
  checkoutSpeechText: { color: '#393D3A', fontFamily: fonts.semibold, fontSize: 13, lineHeight: 19, marginTop: 5 },
  checkoutPanel: { backgroundColor: '#F5E7C8', borderColor: '#77583E', borderLeftWidth: 4, borderRightWidth: 4, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: 4, paddingBottom: 17, paddingHorizontal: 16, paddingTop: 16 },
  receiptHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  receiptEyebrow: { color: '#91887F', fontFamily: fonts.medium, fontSize: 10 },
  receiptTitle: { color: '#2F3531', fontFamily: fonts.bold, fontSize: 19, marginTop: 3 },
  receiptTotalBox: { alignItems: 'flex-end' },
  receiptTotalLabel: { color: '#91887F', fontFamily: fonts.medium, fontSize: 10 },
  receiptTotalValue: { color: '#2F3C35', fontFamily: fonts.bold, fontSize: 19, marginTop: 2 },
  checkoutHint: { alignItems: 'flex-start', backgroundColor: '#FFF6E2', borderColor: '#D2BD94', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 7, marginTop: 13, padding: 11 },
  checkoutHintText: { color: '#6E6257', flex: 1, fontFamily: fonts.regular, fontSize: 11, lineHeight: 17 },
  checkoutActions: { flexDirection: 'row', gap: 9, marginTop: 12 },
  checkoutBackButton: { alignItems: 'center', backgroundColor: '#E0CEA9', borderColor: '#B3966B', borderRadius: 10, borderWidth: 1.5, height: 50, justifyContent: 'center', width: 108 },
  checkoutBackText: { color: '#5F6963', fontFamily: fonts.semibold, fontSize: 14 },
  checkoutCheckButton: { alignItems: 'center', backgroundColor: '#39795A', borderColor: '#285D43', borderRadius: 10, borderWidth: 2, flex: 1, flexDirection: 'row', gap: 6, height: 50, justifyContent: 'center' },
  checkoutCheckText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 15 },
  resultOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', backgroundColor: 'rgba(26,32,28,0.64)', justifyContent: 'center', padding: 18, zIndex: 60 },
  resultCard: { alignItems: 'center', backgroundColor: '#F8EACB', borderColor: '#74543A', borderRadius: 18, borderWidth: 4, maxWidth: 420, padding: 22, width: '100%' },
  successIconStage: { alignItems: 'center', backgroundColor: '#3B8A65', borderRadius: 33, height: 66, justifyContent: 'center', overflow: 'hidden', width: 66 },
  successRing: { borderColor: 'rgba(255,255,255,0.35)', borderRadius: 25, borderWidth: 2, height: 50, position: 'absolute', width: 50 },
  retryIconStage: { alignItems: 'center', backgroundColor: '#F6E9D8', borderRadius: 31, height: 62, justifyContent: 'center', width: 62 },
  resultStamp: { alignItems: 'center', backgroundColor: '#B85641', borderColor: '#D98C72', borderRadius: 8, borderWidth: 2, flexDirection: 'row', gap: 5, marginTop: 14, paddingHorizontal: 10, paddingVertical: 6, transform: [{ rotate: '-2deg' }] },
  resultStampText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.8 },
  resultEyebrow: { color: '#448166', fontFamily: fonts.bold, fontSize: 11, marginTop: 12 },
  resultTitle: { color: '#252A27', fontFamily: fonts.laundryBold, fontSize: 23, letterSpacing: -0.6, lineHeight: 31, marginTop: 5, textAlign: 'center' },
  resultDescription: { color: '#7A7D79', fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  resultStats: { backgroundColor: '#FFF6E3', borderColor: '#D0B98D', borderRadius: 10, borderWidth: 1, flexDirection: 'row', marginTop: 18, paddingVertical: 13, width: '100%' },
  resultStat: { alignItems: 'center', flex: 1 },
  resultStatValue: { color: '#34433B', fontFamily: fonts.bold, fontSize: 14 },
  resultStatLabel: { color: '#8A8E8A', fontFamily: fonts.regular, fontSize: 9, marginTop: 4 },
  resultStatDivider: { backgroundColor: '#DDDFDB', height: 30, width: 1 },
  feedbackList: { gap: 8, marginTop: 18, width: '100%' },
  feedbackRow: { alignItems: 'center', backgroundColor: '#F8F1E7', borderRadius: 13, flexDirection: 'row', padding: 10 },
  feedbackIcon: { alignItems: 'center', backgroundColor: '#FFF9F0', borderRadius: 10, height: 34, justifyContent: 'center', marginRight: 9, width: 34 },
  feedbackText: { color: '#665C52', flex: 1, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  resultPrimaryButton: { alignItems: 'center', backgroundColor: '#39795A', borderColor: '#285D43', borderRadius: 10, borderWidth: 2, height: 50, justifyContent: 'center', marginTop: 18, width: '100%' },
  resultPrimaryButtonText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 16 },
  notice: { alignItems: 'center', alignSelf: 'center', backgroundColor: 'rgba(37,49,42,0.92)', borderRadius: 18, bottom: 92, flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 9, position: 'absolute', zIndex: 70 },
  noticeText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 12 },
});
