import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  Image,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { icons } from '../../assets';
import { PressScale } from '../PressScale';
import {
  MarketCategoryFixture,
  MarketCheckoutFixture,
  MarketExitMarker,
  MarketInteriorBackdrop,
  MarketEnvironmentObjects,
  MarketPersonFixture
} from './MarketInteriorLayer';
import { MarketEnvironment, MarketCashierAvailability, isMarketEnvironmentBlocked } from '../../game/marketEnvironment';
import { getMarketPersonFrame } from '../../game/marketPersonLayout';
import { MARKET_SHELF_PAIR_HIT_SLOP } from '../../game/marketFixtureLayout';
import { MARKET_DEFAULT_ZOOM, screenPointToWorld } from '../../game/worldZoom';
import { marketCategories } from '../../game/scenarios';
import { fonts } from '../../theme';
import { MARKET_CHECKOUT_RECT, MARKET_WORLD_HEIGHT, MARKET_WORLD_WIDTH } from '../../game/prototypeWorld';
import type { MarketStationId } from '../../screens/MarketSimulationScreen';
type MarketPoint = {
  x: number;
  y: number;
};
type MarketControlMode = 'joystick' | 'touch';
const MARKET_PLAYER_RADIUS = 22,
  MARKET_MOVE_SPEED = 190,
  MARKET_ACCESSIBILITY_STEP = 24,
  MARKET_INTERACTION_DISTANCE = 105,
  MARKET_JOYSTICK_RADIUS = 34,
  MARKET_JOYSTICK_SIZE = 110,
  MARKET_JOYSTICK_ZONE_HEIGHT = 250;
function clampMarketPoint(point: MarketPoint): MarketPoint {
  return { x: Math.max(22, Math.min(point.x, MARKET_WORLD_WIDTH - 22)), y: Math.max(22, Math.min(point.y, MARKET_WORLD_HEIGHT - 22)) };
}
export function MarketMap({
  environment,
  cashierCalled = {},
  onPositionChange,
  hintedStation,
  interactive,
  nearbyStation,
  onNearbyStationChange,
}: {
  environment: MarketEnvironment;
  cashierCalled?: Partial<MarketCashierAvailability>;
  onPositionChange?: (point: MarketPoint) => void;
  hintedStation: MarketStationId | null;
  interactive: boolean;
  nearbyStation: MarketStationId | null;
  onNearbyStationChange: (station: MarketStationId | null) => void;
}) {
  const MARKET_STATIONS = environment.stations;
  const MARKET_SHELVES = environment.shelves;
  const geometryRef = useRef({ environment, cashierCalled });
  geometryRef.current = { environment, cashierCalled };
  const isMarketBlocked = (point: MarketPoint) => isMarketEnvironmentBlocked(geometryRef.current.environment, point, geometryRef.current.cashierCalled);
  const findMarketReachableTarget = (current: MarketPoint, desired: MarketPoint) => {
    const point = clampMarketPoint(desired);
    return isMarketBlocked(point) ? current : point;
  };
  const viewportNode = useRef<View | null>(null);
  const camera = useRef(new Animated.ValueXY()).current;
  const joystickKnob = useRef(new Animated.ValueXY()).current;
  const playerPoint = useRef<MarketPoint>({ ...environment.spawn });
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
  }, [onNearbyStationChange, environment]);

  const movePlayer = useCallback((dx: number, dy: number) => {
    const current = playerPoint.current;
    let next = current;
    const xCandidate = clampMarketPoint({ x: current.x + dx, y: current.y });
    if (!isMarketBlocked(xCandidate)) next = xCandidate;
    const yCandidate = clampMarketPoint({ x: next.x, y: next.y + dy });
    if (!isMarketBlocked(yCandidate)) next = yCandidate;
    playerPoint.current = next;
    onPositionChange?.(next);
    updateCamera(next);
    updateStationProximity(next);
    return next;
  }, [updateCamera, updateStationProximity, environment, cashierCalled, onPositionChange]);

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

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const keydown = (event: KeyboardEvent) => {
      if (controlsLockedRef.current || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName ?? '')) return;
      const keys: Record<string, MarketPoint> = {
        ArrowUp: { x: 0, y: -24 },
        ArrowDown: { x: 0, y: 24 },
        ArrowLeft: { x: -24, y: 0 },
        ArrowRight: { x: 24, y: 0 },
        w: { x: 0, y: -24 },
        s: { x: 0, y: 24 },
        a: { x: -24, y: 0 },
        d: { x: 24, y: 0 }
      };
      const delta = keys[event.key];
      if (!delta) return;
      event.preventDefault();
      movePlayer(delta.x, delta.y);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [movePlayer]);

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
    return screenPointToWorld({ x: safeX, y: safeY }, current, viewport.current, MARKET_DEFAULT_ZOOM);
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
      accessibilityState={{ disabled: !interactive }}
      delayLongPress={260}
      disabled={!interactive}
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
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { transform: [{ scale: MARKET_DEFAULT_ZOOM }] }]}>
      <Animated.View style={[styles.marketWorld, { transform: camera.getTranslateTransform() }]}>
        <MarketInteriorBackdrop environment={environment} />
        <MarketEnvironmentObjects environment={environment} />
        {[...environment.employees, ...environment.customers].map(person => person.kind === 'employee'
          ? <PressScale
            key={person.id}
            accessibilityRole="button"
            accessibilityLabel={person.label}
            disabled={!interactive}
            onPress={event => handleStationPress(event, `staff:${person.id}`)}
            style={{
              position: 'absolute',
              ...getMarketPersonFrame(person.point)
            }}
          >
            <MarketPersonFixture person={person} />
          </PressScale>
          : <View
            key={person.id}
            accessible
            accessibilityRole="image"
            accessibilityLabel={person.label}
            style={{
              position: 'absolute',
              ...getMarketPersonFrame(person.point)
            }}
          >
            <MarketPersonFixture person={person} />
          </View>)}

        {tapTargetMarker && controlMode === 'touch'
          ? (
            <View
              pointerEvents="none"
              style={[styles.marketTapTarget, { left: tapTargetMarker.x - 12, top: tapTargetMarker.y - 12 }]}
            />
          )
          : null}

        {environment.checkouts.map((counter, index) => <PressScale
          key={counter.id}
          accessibilityHint="가까이 이동하면 계산할 수 있습니다"
          accessibilityLabel={`${index + 1}번 계산대로 이동`}
          accessibilityRole="button"
          disabled={!interactive}
          hitSlop={{
            bottom: 12,
            left: 12,
            right: 12,
            top: 20
          }}
          onPress={(event) => handleStationPress(event, counter.id)}
          scaleTo={0.98}
          style={[
            styles.counterArea,
            {
              left: counter.rect.x,
              top: counter.rect.y,
              width: counter.rect.width,
              height: counter.rect.height
            },
            { backgroundColor: 'transparent', borderWidth: 0, overflow: 'visible' },
          ]}
        >
          <MarketCheckoutFixture
            counter={counter}
            index={index}
            cashierPresent={cashierCalled[counter.id] ?? counter.cashierPresent}
            active={nearbyStation === counter.id || hintedStation === counter.id}
          />
        </PressScale>)}

        {marketCategories.map((category) => {
          const shelf = MARKET_SHELVES[category.id];
          return (
            <PressScale
              accessibilityLabel={`${category.label} 진열대`}
              accessibilityHint="가까이 이동한 뒤 살펴보기 버튼을 누릅니다"
              accessibilityRole="button"
              accessibilityState={{ disabled: !interactive }}
              disabled={!interactive}
              hitSlop={MARKET_SHELF_PAIR_HIT_SLOP}
              key={category.id}
              onPress={(event) => handleStationPress(event, category.id)}
              scaleTo={0.98}
              style={{
                height: shelf.height,
                left: shelf.x,
                top: shelf.y,
                width: shelf.width,
                position: 'absolute',
                overflow: 'visible'
              }}
            >
              <MarketCategoryFixture
                active={nearbyStation === category.id || hintedStation === category.id}
                category={category}
                orientation={shelf.orientation}
              />
            </PressScale>
          );
        })}

        {(['entrance', 'exit'] as const).map(station => <PressScale key={station}
          accessibilityRole="button" accessibilityLabel={`마트 ${station === 'entrance' ? '입구' : '출구'}로 이동`}
          disabled={!interactive} onPress={event => handleStationPress(event, station)}
          style={{ position: 'absolute', left: environment.stations[station].x - 64,
            top: environment.stations[station].y - (station === 'entrance' ? 15 : 28), width: 128, height: station === 'entrance' ? 96 : 56 }}>
          <MarketExitMarker entrance={station === 'entrance'} active={nearbyStation === station} />
        </PressScale>)}
      </Animated.View>

      <View
        accessibilityLabel="마트 안 내 캐릭터"
        pointerEvents="none"
        style={styles.marketPlayerFixed}
      >
        <View style={styles.playerShadow} />
        <View style={styles.playerMoveRing} />
        <View style={styles.playerHead} />
        <View style={styles.playerBody}>
          <Image
            resizeMode="contain"
            source={icons.user}
            style={styles.playerBadgeImage}
          />
        </View>
        <View style={styles.playerBasket}>
          <Ionicons
            color="#FFFFFF"
            name="basket"
            size={15}
          />
        </View>
      </View>

      </View>
      {interactive
        ? (
          <PressScale
            accessibilityLabel={controlMode === 'joystick' ? '터치 이동으로 변경' : '조이스틱 이동으로 변경'}
            accessibilityRole="button"
            onPress={(event) => {
              event?.stopPropagation?.();
              selectControlMode(controlMode === 'joystick' ? 'touch' : 'joystick');
            }}
            style={styles.marketControlToggle}
          >
            <Ionicons
              color="#FFF8E8"
              name={controlMode === 'joystick' ? 'hand-left-outline' : 'game-controller-outline'}
              size={17}
            />
            <Text style={styles.marketControlToggleText}>
              {controlMode === 'joystick' ? '터치' : '조이스틱'}
            </Text>
          </PressScale>
        )
        : null}

      {interactive
        ? (
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
            <Ionicons
              color={runEnabled ? '#FFFFFF' : '#39493F'}
              name="walk"
              size={22}
            />
          </PressScale>
        )
        : null}

      {controlMode === 'joystick' && interactive
        ? (
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
            onLayout={(event) => {
              joystickZoneSize.current = event.nativeEvent.layout;
            }}
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
              <Animated.View
                style={[styles.marketJoystickKnob, { transform: joystickKnob.getTranslateTransform() }]}
              />
            </Animated.View>
          </View>
        )
        : null}

      {controlMode === 'touch' && interactive
        ? (
          <View pointerEvents="none" style={styles.marketTouchHint}>
            <Ionicons
              color="#FFFFFF"
              name="finger-print"
              size={15}
            />
            <Text style={styles.marketTouchHintText}>누르거나 길게 눌러 이동</Text>
          </View>
        )
        : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  map: {
    cursor: 'auto',
    flex: 1,
    minHeight: 520,
    // CSS clip prevents focus from scrolling the zoomed world independently of its camera.
    // React Native's shared type only lists native overflow values.
    overflow: Platform.OS === 'web' ? 'clip' as 'hidden' : 'hidden',
    position: 'relative'
  },
  marketWorld: {
    height: MARKET_WORLD_HEIGHT,
    left: 0,
    position: 'absolute',
    top: 0,
    width: MARKET_WORLD_WIDTH
  },
  marketTapTarget: {
    borderColor: 'rgba(52,91,68,0.72)',
    borderRadius: 12,
    borderWidth: 3,
    height: 24,
    position: 'absolute',
    width: 24,
    zIndex: 4
  },
  counterArea: {
    height: MARKET_CHECKOUT_RECT.height,
    left: MARKET_CHECKOUT_RECT.x,
    position: 'absolute',
    top: MARKET_CHECKOUT_RECT.y,
    width: MARKET_CHECKOUT_RECT.width
  },
  marketPlayerFixed: {
    alignItems: 'center',
    height: 78,
    justifyContent: 'flex-start',
    left: '50%',
    marginLeft: -25,
    marginTop: -39,
    position: 'absolute',
    top: '50%',
    width: 50,
    zIndex: 16
  },
  playerShadow: {
    backgroundColor: 'rgba(69,70,61,0.25)',
    borderRadius: 18,
    bottom: -8,
    height: 12,
    position: 'absolute',
    width: 42
  },
  playerMoveRing: {
    borderColor: 'rgba(255,244,184,0.64)',
    borderRadius: 23,
    borderWidth: 2,
    bottom: -13,
    height: 46,
    position: 'absolute',
    width: 46
  },
  playerHead: {
    backgroundColor: '#E4B894',
    borderColor: '#604639',
    borderRadius: 14,
    borderWidth: 1.5,
    height: 29,
    width: 29,
    zIndex: 2
  },
  playerBody: {
    alignItems: 'center',
    backgroundColor: '#E39344',
    borderColor: '#704D2B',
    borderRadius: 8,
    borderWidth: 1.5,
    height: 42,
    marginTop: -2,
    overflow: 'hidden',
    width: 33
  },
  playerBadgeImage: { height: 22, marginTop: 10, width: 22 },
  playerBasket: {
    alignItems: 'center',
    backgroundColor: '#C95D46',
    borderColor: '#FFFFFF',
    borderRadius: 11,
    borderWidth: 1,
    height: 25,
    justifyContent: 'center',
    position: 'absolute',
    right: -19,
    top: 37,
    width: 25
  },
  marketEntranceInterior: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
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
    width: 150
  },
  marketControlToggle: {
    alignItems: 'center',
    backgroundColor: 'rgba(35,47,39,0.86)',
    borderColor: 'rgba(255,255,255,0.24)',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: 'absolute',
    right: 14,
    bottom: 230,
    zIndex: 26
  },
  marketControlToggleText: { color: '#FFF8E8', fontFamily: fonts.bold, fontSize: 9 },
  marketRunButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,250,236,0.88)',
    borderColor: 'rgba(75,64,46,0.28)',
    borderRadius: 25,
    borderWidth: 2,
    bottom: 162,
    height: 50,
    justifyContent: 'center',
    position: 'absolute',
    right: 92,
    width: 50,
    zIndex: 24
  },
  marketRunButtonActive: { backgroundColor: '#4C6E5A', borderColor: 'rgba(255,255,255,0.75)' },
  marketJoystickZone: {
    bottom: 72,
    height: MARKET_JOYSTICK_ZONE_HEIGHT,
    left: 0,
    position: 'absolute',
    width: '58%',
    zIndex: 22
  },
  marketJoystick: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.52)',
    borderColor: 'rgba(49,61,52,0.22)',
    borderRadius: 55,
    borderWidth: 2,
    height: MARKET_JOYSTICK_SIZE,
    justifyContent: 'center',
    position: 'absolute',
    width: MARKET_JOYSTICK_SIZE
  },
  marketJoystickGuideHorizontal: {
    backgroundColor: 'rgba(62,78,67,0.12)',
    height: 2,
    position: 'absolute',
    width: 70
  },
  marketJoystickGuideVertical: {
    backgroundColor: 'rgba(62,78,67,0.12)',
    height: 70,
    position: 'absolute',
    width: 2
  },
  marketJoystickKnob: {
    backgroundColor: 'rgba(60,76,65,0.82)',
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 24,
    borderWidth: 2,
    height: 48,
    width: 48
  },
  marketTouchHint: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(38,50,42,0.84)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'absolute',
    bottom: 300,
    zIndex: 24
  },
  marketTouchHintText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 10 },
});
