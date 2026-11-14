import { getMarketNavigationPath } from '../../game/marketNavigation';
import { cameraBoundActorTransform } from '../../game/cameraBoundActor';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { DirectionalAvatar } from './DirectionalAvatar';
import { chibiPlayerAvatar as freshPlayerAvatar } from '../../game/chibiPlayerAvatar';
import { createAvatarWalkCycle, getAvatarMovement, type AvatarFacing, type AvatarMotion } from '../../game/avatarAnimation';
import { useMarketReducedMotion } from './MarketPanelTransition';
import { PressScale } from '../PressScale';
import {
  MarketShelfTarget,
  MarketCheckoutFixture,
  MarketKioskFixture,
  MarketExitMarker,
  MarketInteriorBackdrop,
  MarketEnvironmentObjects,
  MarketPersonFixture
} from './MarketInteriorLayer';
import { getMarketRenderDepth, getNearestMarketStation, getMarketStationApproachPoint, MARKET_ENVIRONMENT_PLAYER_RADIUS, MarketEnvironment, MarketCashierAvailability, isMarketEnvironmentBlocked } from '../../game/marketEnvironment';
import { getMarketPersonFrame } from '../../game/marketPersonLayout';
import { getWorldCameraFrame, MARKET_DEFAULT_ZOOM, screenPointToWorld } from '../../game/worldZoom';
import { marketCategories } from '../../game/scenarios';
import { RUN_SPEED_MULTIPLIER } from '../../game/movementControls';
import { fonts } from '../../theme';
import { MARKET_CHECKOUT_RECT } from '../../game/prototypeWorld';
import type { MarketStationId } from '../../screens/MarketSimulationScreen';
type MarketPoint = {
  x: number;
  y: number;
};
type MarketControlMode = 'joystick' | 'touch';
const MARKET_MOVE_SPEED = 190,
  MARKET_ACCESSIBILITY_STEP = 24,
  MARKET_JOYSTICK_RADIUS = 34,
  MARKET_JOYSTICK_SIZE = 110,
  MARKET_JOYSTICK_ZONE_HEIGHT = 250;
function clampMarketPoint(point: MarketPoint, bounds: MarketEnvironment['world']): MarketPoint {
  const radius = MARKET_ENVIRONMENT_PLAYER_RADIUS;
  return { x: Math.max(radius, Math.min(point.x, bounds.width - radius)), y: Math.max(radius, Math.min(point.y, bounds.height - radius)) };
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
  const geometryRef = useRef({ environment, cashierCalled });
  geometryRef.current = { environment, cashierCalled };
  const isMarketBlocked = (point: MarketPoint) => isMarketEnvironmentBlocked(geometryRef.current.environment, point, geometryRef.current.cashierCalled);
  const findMarketReachableTarget = (current: MarketPoint, desired: MarketPoint) => {
    const point = clampMarketPoint(desired, geometryRef.current.environment.world);
    return isMarketBlocked(point) ? current : point;
  };
  const viewportNode = useRef<View | null>(null);
  const camera = useRef(new Animated.ValueXY(undefined, { useNativeDriver: Platform.OS !== 'web' })).current;
  const viewportCenterAnimation = useRef(new Animated.ValueXY()).current;
  const playerOffsetAnimation = useRef(new Animated.ValueXY()).current;
  const [actorTransform] = useState(() => cameraBoundActorTransform(camera, viewportCenterAnimation, playerOffsetAnimation));
  const playerDepth = useRef(new Animated.Value(getMarketRenderDepth(environment.spawn.y))).current;
  const cameraCenter = useRef<MarketPoint>({ ...environment.spawn });
  const joystickKnob = useRef(new Animated.ValueXY()).current;
  const playerPoint = useRef<MarketPoint>({ ...environment.spawn });
  const viewport = useRef({ height: 0, width: 0 });
  const viewportOrigin = useRef({ x: 0, y: 0 });
  const direction = useRef<MarketPoint>({ x: 0, y: 0 });
  const keyboardDirection = useRef<MarketPoint>({ x: 0, y: 0 });
  const pressedMovementKeys = useRef(new Set<string>());
  const shiftHeld = useRef(false);
  const runEnabledRef = useRef(false);
  const speedMultiplier = useRef(1);
  const tapTarget = useRef<MarketPoint | null>(null);
  const tapWaypoints = useRef<MarketPoint[]>([]);
  const joystickEngaged = useRef(false);
  const touchHoldActivated = useRef(false);
  const animationFrame = useRef<number | null>(null);
  const previousFrame = useRef<number | null>(null);
  const nearbyStationRef = useRef<MarketStationId | null>(null);
  const controlsLockedRef = useRef(!interactive);
  const joystickZoneSize = useRef({ height: MARKET_JOYSTICK_ZONE_HEIGHT, width: 220 });

  const [avatarPose, setAvatarPose] = useState<{ facing: AvatarFacing; motion: AvatarMotion }>({ facing: 'front', motion: 'idle' });
  const avatarFacing = useRef<AvatarFacing>('front');
  const [playerWalkCycle] = useState(createAvatarWalkCycle);
  const reduceMotion = useMarketReducedMotion();
  const [controlMode, setControlMode] = useState<MarketControlMode>('joystick');
  const [runEnabled, setRunEnabled] = useState(false);
  const [tapTargetMarker, setTapTargetMarker] = useState<MarketPoint | null>(null);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickCenter, setJoystickCenter] = useState({ x: 76, y: 174 });
  controlsLockedRef.current = !interactive;

  const updateCamera = useCallback((point: MarketPoint) => {
    const frame = getWorldCameraFrame(point, viewport.current, MARKET_DEFAULT_ZOOM,
      geometryRef.current.environment.world);
    cameraCenter.current = frame.center;
    camera.setValue(frame.translation);
    playerOffsetAnimation.setValue(frame.playerOffset);
    playerDepth.setValue(getMarketRenderDepth(point.y));
  }, [camera, playerDepth, playerOffsetAnimation]);

  const updateStationProximity = useCallback((point: MarketPoint) => {
    const closest = getNearestMarketStation(geometryRef.current.environment, point, geometryRef.current.cashierCalled)?.id ?? null;
    if (closest !== nearbyStationRef.current) {
      nearbyStationRef.current = closest;
      onNearbyStationChange(closest);
    }
  }, [onNearbyStationChange, environment]);

  const movePlayer = useCallback((dx: number, dy: number, animate = false) => {
    const current = playerPoint.current;
    let next = current;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
    for (let index = 0; index < steps; index += 1) {
      const xCandidate = clampMarketPoint({ x: next.x + dx / steps, y: next.y }, geometryRef.current.environment.world);
      if (!isMarketBlocked(xCandidate)) next = xCandidate;
      const yCandidate = clampMarketPoint({ x: next.x, y: next.y + dy / steps }, geometryRef.current.environment.world);
      if (!isMarketBlocked(yCandidate)) next = yCandidate;
    }
    const movement = getAvatarMovement(current, next, avatarFacing.current, speedMultiplier.current > 1 ? 'sprint' : 'walk');
    avatarFacing.current = movement.facing;
    const motion = animate ? movement.motion : 'idle';
    if (animate) playerWalkCycle.advance(movement.distance);
    setAvatarPose(previous => previous.facing === movement.facing && previous.motion === motion
      ? previous : { facing: movement.facing, motion });
    playerPoint.current = next;
    onPositionChange?.(next);
    updateCamera(next);
    updateStationProximity(next);
    return next;
  }, [playerWalkCycle, updateCamera, updateStationProximity, environment, cashierCalled, onPositionChange]);

  const settleAvatar = useCallback(() => {
    setAvatarPose(previous => previous.motion === 'idle' ? previous : { ...previous, motion: 'idle' });
  }, []);

  const syncSpeedMultiplier = useCallback(() => {
    speedMultiplier.current = runEnabledRef.current || (shiftHeld.current && pressedMovementKeys.current.size > 0)
      ? RUN_SPEED_MULTIPLIER : 1;
  }, []);

  const stopMovement = useCallback(() => {
    settleAvatar();
    direction.current = { x: 0, y: 0 };
    keyboardDirection.current = { x: 0, y: 0 };
    pressedMovementKeys.current.clear();
    syncSpeedMultiplier();
    joystickEngaged.current = false;
    tapTarget.current = null;
    tapWaypoints.current = [];
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
  }, [joystickKnob, settleAvatar, syncSpeedMultiplier]);

  const resetKeyboardMovement = useCallback(() => {
    shiftHeld.current = false;
    stopMovement();
  }, [stopMovement]);

  const runMovement = useCallback((timestamp: number) => {
    if (controlsLockedRef.current) { resetKeyboardMovement(); return; }
    const last = previousFrame.current ?? timestamp;
    const elapsedSeconds = Math.min(timestamp - last, 32) / 1000;
    previousFrame.current = timestamp;
    const target = tapTarget.current;

    if (target) {
      const current = playerPoint.current;
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 3 && tapWaypoints.current.length) {
        movePlayer(dx, dy, true);
        tapTarget.current = tapWaypoints.current.shift()!;
        animationFrame.current = requestAnimationFrame(runMovement);
        return;
      }
      if (distance <= 3) {
        settleAvatar();
        tapTarget.current = null;
        previousFrame.current = null;
        animationFrame.current = null;
        setTapTargetMarker(null);
        return;
      }
      const step = Math.min(distance, MARKET_MOVE_SPEED * speedMultiplier.current * elapsedSeconds);
      const next = movePlayer((dx / distance) * step, (dy / distance) * step, true);
      if (step > 0 && Math.hypot(next.x - current.x, next.y - current.y) < 0.05) {
        settleAvatar();
        tapTarget.current = null;
        previousFrame.current = null;
        animationFrame.current = null;
        setTapTargetMarker(null);
        return;
      }
      animationFrame.current = requestAnimationFrame(runMovement);
      return;
    }

    const dx = direction.current.x + keyboardDirection.current.x;
    const dy = direction.current.y + keyboardDirection.current.y;
    const normalization = Math.max(1, Math.hypot(dx, dy));
    movePlayer(
      dx / normalization * MARKET_MOVE_SPEED * speedMultiplier.current * elapsedSeconds,
      dy / normalization * MARKET_MOVE_SPEED * speedMultiplier.current * elapsedSeconds,
      true,
    );
    if (joystickEngaged.current || pressedMovementKeys.current.size) animationFrame.current = requestAnimationFrame(runMovement);
    else {
      settleAvatar();
      previousFrame.current = null;
      animationFrame.current = null;
    }
  }, [movePlayer, settleAvatar, resetKeyboardMovement]);

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
    if (!interactive) resetKeyboardMovement();
  }, [interactive, resetKeyboardMovement]);

  const handleViewportLayout = (event: LayoutChangeEvent) => {
    viewport.current = event.nativeEvent.layout;
    viewportCenterAnimation.setValue({ x: viewport.current.width / 2, y: viewport.current.height / 2 });
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
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const keys: Record<string, MarketPoint> = {
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
    };
    const physicalKeys: Record<string, string> = { KeyW: 'w', KeyS: 's', KeyA: 'a', KeyD: 'd' };
    const keyName = (event: KeyboardEvent) => physicalKeys[event.code]
      ?? (event.key.length === 1 ? event.key.toLowerCase() : event.key);
    const syncDirection = () => {
      let x = 0, y = 0;
      pressedMovementKeys.current.forEach(key => { x += keys[key].x; y += keys[key].y; });
      const length = Math.hypot(x, y);
      keyboardDirection.current = length ? { x: x / length, y: y / length } : { x: 0, y: 0 };
    };
    const keydown = (event: KeyboardEvent) => {
      const key = keyName(event);
      const target = event.target as HTMLElement | null;
      if (controlsLockedRef.current || event.altKey || event.ctrlKey || event.metaKey ||
        target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(target?.tagName ?? '')) return;
      if (key === 'Shift') {
        shiftHeld.current = true;
        syncSpeedMultiplier();
        return;
      }
      if (!keys[key]) return;
      event.preventDefault();
      if (!pressedMovementKeys.current.size) stopMovement();
      if (typeof event.shiftKey === 'boolean') shiftHeld.current = event.shiftKey;
      pressedMovementKeys.current.add(key);
      syncDirection();
      syncSpeedMultiplier();
      beginMovement();
    };
    const keyup = (event: KeyboardEvent) => {
      const key = keyName(event);
      if (key === 'Shift') {
        shiftHeld.current = event.shiftKey === true;
        syncSpeedMultiplier();
        return;
      }
      if (!keys[key]) return;
      pressedMovementKeys.current.delete(key);
      syncDirection();
      syncSpeedMultiplier();
      if (!pressedMovementKeys.current.size && !joystickEngaged.current) stopMovement();
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', resetKeyboardMovement);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', resetKeyboardMovement);
    };
  }, [beginMovement, stopMovement, resetKeyboardMovement, syncSpeedMultiplier]);

  const startTapMovement = (desired: MarketPoint) => {
    if (controlsLockedRef.current) return;
    stopMovement();
    const target = findMarketReachableTarget(playerPoint.current, desired);
    if (Math.hypot(target.x - playerPoint.current.x, target.y - playerPoint.current.y) < 2) return;
    const path = getMarketNavigationPath(environment, playerPoint.current, target, cashierCalled);
    if (!path?.length) return;
    tapTarget.current = path[0];
    tapWaypoints.current = path.slice(1);
    setTapTargetMarker(target);
    beginMovement();
  };

  const getTouchedWorldPoint = (event: GestureResponderEvent) => {
    const { locationX, locationY, pageX, pageY } = event.nativeEvent;
    const localX = Number.isFinite(pageX) ? pageX - viewportOrigin.current.x : locationX;
    const localY = Number.isFinite(pageY) ? pageY - viewportOrigin.current.y : locationY;
    const safeX = Math.max(0, Math.min(localX, viewport.current.width));
    const safeY = Math.max(0, Math.min(localY, viewport.current.height));
    return screenPointToWorld({ x: safeX, y: safeY }, cameraCenter.current, viewport.current, MARKET_DEFAULT_ZOOM);
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
    const target = getMarketStationApproachPoint(environment, station, playerPoint.current, cashierCalled);
    if (target) startTapMovement(target);
  };

  const selectControlMode = (mode: MarketControlMode) => {
    stopMovement();
    runEnabledRef.current = false;
    syncSpeedMultiplier();
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
      <Animated.View testID="market-world" style={[styles.marketWorld, { width: environment.world.width, height: environment.world.height, transform: camera.getTranslateTransform() }]}>
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
              ...getMarketPersonFrame(person.point),
              zIndex: getMarketRenderDepth(person.point.y)
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
              ...getMarketPersonFrame(person.point),
              zIndex: getMarketRenderDepth(person.point.y)
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

        {environment.checkouts.map((counter, index) => counter.kind === 'kiosk' ? null : <PressScale
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
              height: counter.rect.height,
              zIndex: getMarketRenderDepth(counter.rect.y + counter.rect.height)
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

        {(environment.kiosks ?? []).map(kiosk => <PressScale key={kiosk.id}
          accessibilityRole="button" accessibilityLabel={`셀프 계산대 ${kiosk.number}로 이동`} hitSlop={{ top: 48, bottom: 5, left: 8, right: 8 }}
          disabled={!interactive} onPress={event => handleStationPress(event, kiosk.id)}
          style={{ position: 'absolute', left: kiosk.rect.x, top: kiosk.rect.y, width: kiosk.rect.width, height: kiosk.rect.height,
            zIndex: getMarketRenderDepth(kiosk.rect.y + kiosk.rect.height), overflow: 'visible' }}>
          <MarketKioskFixture kiosk={kiosk} active={nearbyStation === kiosk.id || hintedStation === kiosk.id} />
        </PressScale>)}

        {marketCategories.map(category => <MarketShelfTarget key={category.id}
          placement={environment.shelves[category.id]} categoryId={category.id}
          active={nearbyStation === category.id} highlighted={hintedStation === category.id}
          disabled={!interactive} accessibilityLabel={`${category.label} 진열대`}
          onPress={event => handleStationPress(event, category.id)}
        />)}
        {(['entrance', 'exit'] as const).map(station => <View key={station} pointerEvents="none"
          style={{ position: 'absolute', left: environment.stations[station].x - 64,
            top: environment.stations[station].y + 24, width: 128, height: 46 }}>
          <MarketExitMarker kind={station} active={false}
            blocked={environment.constructionZones?.some(zone => zone.gateId === station)} />
        </View>)}
        {environment.commonDoor ? <PressScale accessibilityRole="button"
          accessibilityLabel="마트 공동 출입문으로 이동" disabled={!interactive}
          onPress={event => handleStationPress(event, 'common-door')}
          style={{ position: 'absolute', left: environment.commonDoor.point.x - 64,
            top: environment.commonDoor.point.y - 54, width: 128, height: 46 }}>
          <MarketExitMarker kind="common-door" active={nearbyStation === 'common-door'} />
        </PressScale> : null}
        <Animated.View testID="market-player-world"
          accessibilityLabel="마트 안 내 캐릭터" pointerEvents="none"
          style={[styles.marketPlayerFixed, { transform: actorTransform, zIndex: playerDepth }]}>
          <DirectionalAvatar facing={avatarPose.facing} manifest={freshPlayerAvatar} motion={avatarPose.motion}
            walkCycle={playerWalkCycle} reduceMotion={reduceMotion} scale={0.5} />
        </Animated.View>
      </Animated.View>

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
              const next = !runEnabledRef.current;
              runEnabledRef.current = next;
              syncSpeedMultiplier();
              setRunEnabled(next);
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
    left: 0,
    position: 'absolute',
    top: 0,
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
    alignItems: 'center', height: 96, justifyContent: 'center', left: 0,
    marginLeft: -32, marginTop: -93, position: 'absolute', top: 0, width: 64,
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
