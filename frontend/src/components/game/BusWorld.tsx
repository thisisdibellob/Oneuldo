import { Ionicons } from '@expo/vector-icons';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { DirectionalAvatar } from './DirectionalAvatar';
import { BusArrivalVehicle } from './BusArrivalPreview';
import { BusRoadBackdrop } from './BusRoadBackdrop';
import { chibiPlayerAvatar } from '../../game/chibiPlayerAvatar';
import { createAvatarWalkCycle, getAvatarMovement, type AvatarFacing, type AvatarMotion } from '../../game/avatarAnimation';
import { RUN_SPEED_MULTIPLIER, type GameMovementInput } from '../../game/movementControls';
import { busArt } from '../../game/busArt';
import { libraryArt } from '../../game/libraryArt';
import { villageDecorationArt } from '../../game/gameAssets';
import { useGamePreferences } from '../../game/gamePreferences';
import { fonts } from '../../theme';
import {
  BUS_INTERIOR_BODY, BUS_PASSENGER_PLACES, getBusPassengerPlace, BUS_PLAYER_SCALE, BUS_STREET, BUS_WORLD_INTERACTIONS, BUS_WORLD_SIZE,
  busRenderDepth, busWorldCamera, busWorldClearSegment, busWorldSide, busWorldSize, busWorldSpawn, busWorldStations, busWorldTargetEdge, findBusWorldPath, moveBusWorldPlayer,
  type BusPassengerPlaceId, type BusPassengerPlace, type BusWorldDirection, type BusWorldGeometryOptions, type BusWorldPoint, type BusWorldScene, type BusWorldStation, type BusWorldTargetEdge,
} from '../../game/busWorld';

const scenery = {
  home: require('../../../assets/images/game/buildings/village/runtime/bld_player_home_v1.png'),
  park: require('../../../assets/images/game/buildings/village/runtime/landmark_park_v1.png'),
  community: require('../../../assets/images/game/buildings/village/runtime/bld_community_v1.png'),
  tree: villageDecorationArt.tree,
  flowers: villageDecorationArt.flowerbed,
  shrub: villageDecorationArt.shrub,
  bench: villageDecorationArt.bench,
  road: require('../../../assets/images/game/environment/village/runtime/env_road_surface_warm_v1.png'),
};

export type BusWorldHandle = {
  move: (input: GameMovementInput) => void;
  stop: () => void;
  nudge: (action: string) => void;
  interact: () => void;
  navigate: (station: BusWorldStation) => void;
  tapPassengerPlace: (screenPoint: BusWorldPoint) => void;
};
export type BusWorldProps = {
  scene: BusWorldScene;
  spawn?: BusWorldPoint;
  stopId?: string;
  stopName?: string;
  direction?: BusWorldDirection;
  locked: boolean;
  travelling: boolean;
  seated?: boolean;
  securedAt?: 'seat' | 'handrail' | 'none';
  passengerPlaceId?: BusPassengerPlaceId | null;
  controlMode: 'joystick' | 'touch';
  reduceMotion: boolean;
  runEnabled?: boolean;
  crossingAllowed?: boolean;
  bus?: { number: string | number; destination: string; id?: string } | null;
  target?: BusWorldStation | null;
  bellRequested?: boolean;
  onNearbyChange: (station: BusWorldStation | null) => void;
  onInteract: (station: BusWorldStation, placeId?: BusPassengerPlaceId) => void;
  onPassengerTransitionChange?: (moving: boolean) => void;
  onSideChange?: (side: BusWorldDirection) => void;
  onPositionChange?: (point: BusWorldPoint) => void;
};

/** A shared-control world: parent owns the simulation clock and all scenario choices. */
export const BusWorld = forwardRef<BusWorldHandle, BusWorldProps>(function BusWorld(props, ref) {
  const { scene, direction = 'outbound', locked, travelling, reduceMotion, controlMode } = props;
  const { preferences } = useGamePreferences();
  const initial = useRef(props.spawn ?? busWorldSpawn(scene, direction));
  const position = useRef({ ...initial.current });
  const actor = useRef(new Animated.ValueXY(initial.current)).current;
  const depth = useRef(new Animated.Value(busRenderDepth(initial.current.y))).current;
  const camera = useRef(new Animated.ValueXY()).current;
  const cameraPoint = useRef({ x: 0, y: 0 });
  const viewportRef = useRef<View>(null); const viewportOrigin = useRef({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ width: 375, height: 740 });
  const [tapTarget, setTapTarget] = useState<BusWorldPoint | null>(null);
  const [targetEdge, setTargetEdge] = useState<BusWorldTargetEdge | null>(null);
  const targetEdgeRef = useRef<BusWorldTargetEdge | null>(null);
  const [side, setSide] = useState<BusWorldDirection>(busWorldSide(initial.current) ?? direction);
  const sideRef = useRef(side);
  const [pose, setPose] = useState<{ facing: AvatarFacing; motion: AvatarMotion }>({ facing: scene === 'bus' ? 'back' : 'front', motion: 'idle' });
  const poseRef = useRef(pose);
  const vector = useRef<GameMovementInput>({ x: 0, y: 0, running: false });
  const keys = useRef(new Set<string>()); const route = useRef<BusWorldPoint[]>([]); const destination = useRef<BusWorldStation | null>(null);
  const destinationPlace = useRef<BusPassengerPlaceId | undefined>(undefined);
  const passengerMoving = useRef(false);
  const nearby = useRef<BusWorldStation | null>(null);
  const busReady = useRef(reduceMotion);
  const onArrivalReadyChange = useCallback((ready: boolean) => { busReady.current = ready; }, []);
  const walkCycle = useMemo(() => createAvatarWalkCycle(), []);
  const live = useRef({ props, viewport, side, runMode: preferences.runMode }); live.current = { props, viewport, side, runMode: preferences.runMode };
  const geometry = useCallback((): BusWorldGeometryOptions => ({ scene: live.current.props.scene, direction: live.current.props.direction ?? 'outbound', crossingAllowed: live.current.props.crossingAllowed, busPresent: Boolean(live.current.props.bus), travelling: live.current.props.travelling }), []);
  const stations = useCallback(() => {
    const options = geometry(); const result = { ...busWorldStations(options) };
    if (options.scene !== 'bus') result.crossing = { x: 1035, y: sideRef.current === 'inbound' ? 596 : 897 };
    else for (const kind of ['seat', 'handrail'] as const) {
      const closest = BUS_PASSENGER_PLACES.filter(place => place.kind === kind).sort((a, b) =>
        Math.hypot(a.approach.x - position.current.x, a.approach.y - position.current.y) - Math.hypot(b.approach.x - position.current.x, b.approach.y - position.current.y))[0];
      result[kind] = closest.approach;
    }
    return result;
  }, [geometry]);
  const updateTargetEdge = useCallback(() => {
    const goal = live.current.props.target;
    const next = busWorldTargetEdge(goal ? stations()[goal] : undefined, cameraPoint.current, live.current.viewport);
    // Camera motion is per frame; React only receives visibility/direction changes.
    if (next !== targetEdgeRef.current) { targetEdgeRef.current = next; setTargetEdge(next); }
  }, [stations]);
  const syncCamera = useCallback(() => {
    const next = busWorldCamera(position.current, live.current.viewport, live.current.props.scene);
    cameraPoint.current = next; camera.setValue(next); updateTargetEdge();
  }, [camera, updateTargetEdge]);
  const updateNearby = useCallback(() => {
    const all = stations();
    const choice = (Object.entries(all) as [BusWorldStation, BusWorldPoint][])
      .map(([id, p]) => ({ id, distance: Math.hypot(p.x - position.current.x, p.y - position.current.y) }))
      .sort((a, b) => a.distance - b.distance)[0];
    const goal = live.current.props.target; const goalPoint = goal ? all[goal] : undefined;
    const next = goal && goalPoint && Math.hypot(goalPoint.x - position.current.x, goalPoint.y - position.current.y) <= 91
      ? goal : choice && choice.distance <= 91 ? choice.id : null;
    if (nearby.current !== next) { nearby.current = next; live.current.props.onNearbyChange(next); }
  }, [stations]);
  const stop = useCallback(() => {
    vector.current = { x: 0, y: 0, running: false }; keys.current.clear(); route.current = []; destination.current = null; destinationPlace.current = undefined; setTapTarget(null);
    if (poseRef.current.motion !== 'idle') { poseRef.current = { ...poseRef.current, motion: 'idle' }; setPose(poseRef.current); }
  }, []);
  const setPosition = useCallback((next: BusWorldPoint, running: boolean) => {
    const movement = getAvatarMovement(position.current, next, poseRef.current.facing, running ? 'sprint' : 'walk');
    walkCycle.advance(movement.distance); position.current = next;
    if (movement.distance > 0) {
      actor.setValue(next); depth.setValue(busRenderDepth(next.y)); syncCamera(); live.current.props.onPositionChange?.(next);
      if (live.current.props.scene !== 'bus') {
        const nextSide = busWorldSide(next);
        if (nextSide && sideRef.current !== nextSide) { sideRef.current = nextSide; setSide(nextSide); live.current.props.onSideChange?.(nextSide); }
      }
    }
    if (movement.facing !== poseRef.current.facing || movement.motion !== poseRef.current.motion) { poseRef.current = { facing: movement.facing, motion: movement.motion }; setPose(poseRef.current); }
  }, [actor, depth, syncCamera, walkCycle]);
  const selectPlace = useCallback((place: BusPassengerPlace) => {
    const p = live.current.props;
    if (p.locked || p.travelling || passengerMoving.current) return;
    if (p.seated || Math.hypot(place.approach.x - position.current.x, place.approach.y - position.current.y) <= 91) {
      stop(); p.onInteract(place.kind, place.id); return;
    }
    // Choosing a chair/strap is an explicit action, available with either control scheme.
    stop(); route.current = findBusWorldPath(position.current, place.approach, geometry());
    destination.current = route.current.length ? place.kind : null;
    destinationPlace.current = route.current.length ? place.id : undefined;
    setTapTarget(route.current.length ? place.approach : null);
  }, [geometry, stop]);
  const navigate = useCallback((id: BusWorldStation) => {
    const p = live.current.props;
    if (p.locked || passengerMoving.current) return;
    if (p.scene !== 'bus' && (id === 'board' || id === 'driver') && !busReady.current) return;
    // These controls are reachable from the selected safe position during travel.
    if (p.scene === 'bus' && p.travelling) { if (id === 'bell') p.onInteract(id); return; }
    if (p.scene === 'bus' && (id === 'seat' || id === 'handrail')) {
      const closest = BUS_PASSENGER_PLACES.filter(place => place.kind === id).sort((a, b) =>
        Math.hypot(a.approach.x - position.current.x, a.approach.y - position.current.y) - Math.hypot(b.approach.x - position.current.x, b.approach.y - position.current.y))[0];
      selectPlace(closest); return;
    }
    if (p.scene === 'bus' && p.seated) return;
    const target = stations()[id]; if (!target) return;
    if (Math.hypot(target.x - position.current.x, target.y - position.current.y) <= 91) { stop(); p.onInteract(id); return; }
    if (p.controlMode !== 'touch') return;
    route.current = findBusWorldPath(position.current, target, geometry()); destination.current = route.current.length ? id : null; setTapTarget(route.current.length ? target : null);
  }, [geometry, stations, stop, selectPlace]);
  useImperativeHandle(ref, () => ({
    move: input => { if (live.current.props.locked || live.current.props.travelling || live.current.props.seated || passengerMoving.current) return; route.current = []; destination.current = null; destinationPlace.current = undefined; setTapTarget(null); vector.current = input; },
    stop,
    nudge: action => {
      if (live.current.props.locked || live.current.props.travelling || live.current.props.seated || passengerMoving.current) return;
      const shifts: Record<string, [number, number]> = { moveUp: [0, -32], moveDown: [0, 32], moveLeft: [-32, 0], moveRight: [32, 0] };
      const shift = shifts[action]; if (!shift) return;
      stop(); setPosition(moveBusWorldPlayer(position.current, shift[0], shift[1], geometry()), false); updateNearby();
    },
    interact: () => { if (nearby.current) navigate(nearby.current); }, navigate,
    tapPassengerPlace: screenPoint => {
      if (live.current.props.scene !== 'bus') return;
      const point = { x: screenPoint.x - viewportOrigin.current.x - cameraPoint.current.x, y: screenPoint.y - viewportOrigin.current.y - cameraPoint.current.y };
      const place = BUS_PASSENGER_PLACES.find(candidate => point.x >= candidate.hitbox.x && point.x <= candidate.hitbox.x + candidate.hitbox.width && point.y >= candidate.hitbox.y && point.y <= candidate.hitbox.y + candidate.hitbox.height);
      if (place) selectPlace(place);
    },
  }), [geometry, navigate, selectPlace, setPosition, stop, updateNearby]);
  useEffect(() => { syncCamera(); }, [viewport, syncCamera]);
  useEffect(() => { if (locked || travelling) stop(); }, [locked, travelling, stop]);
  const [sitting, setSitting] = useState(false);
  const securedBefore = useRef<BusPassengerPlace | undefined>(undefined);
  const passengerTransferPending = useRef<BusWorldPoint | null>(null);
  useEffect(() => {
    const secured = props.seated ? props.securedAt ?? 'seat' : 'none';
    const requested = getBusPassengerPlace(props.passengerPlaceId);
    const place = secured === 'none' ? undefined : requested?.kind === secured ? requested
      : getBusPassengerPlace(secured === 'seat' ? 'seat-front-left' : 'handrail-middle');
    if (scene !== 'bus' || (securedBefore.current?.id === place?.id && !passengerTransferPending.current)) return;
    const previous = securedBefore.current; securedBefore.current = place;
    stop();
    const next = place?.position ?? previous?.approach ?? passengerTransferPending.current ?? position.current;
    passengerTransferPending.current = next;
    const points: BusWorldPoint[] = [];
    let aisleStart = position.current;
    if (previous?.kind === 'seat') { points.push(previous.approach); aisleStart = previous.approach; }
    if (place) {
      points.push(...findBusWorldPath(aisleStart, place.approach, { scene: 'bus' }));
      if (place.kind === 'seat') points.push(place.position);
    }
    if (!points.length) points.push(next);
    setSitting(false);
    const finish = () => {
      position.current = next; actor.setValue(next); depth.setValue(busRenderDepth(next.y));
      setSitting(secured === 'seat');
      poseRef.current = { facing: secured === 'seat' ? 'back' : 'front', motion: 'idle' }; setPose(poseRef.current);
      syncCamera(); updateNearby(); live.current.props.onPositionChange?.(next);
      passengerTransferPending.current = null;
      passengerMoving.current = false; live.current.props.onPassengerTransitionChange?.(false);
    };
    if (reduceMotion) { finish(); return; }
    passengerMoving.current = true; live.current.props.onPassengerTransitionChange?.(true);
    poseRef.current = { facing: secured === 'seat' ? 'left' : 'front', motion: 'walk' }; setPose(poseRef.current);
    const listener = actor.addListener(point => {
      const movement = getAvatarMovement(position.current, point, poseRef.current.facing, 'walk');
      walkCycle.advance(movement.distance); position.current = point; depth.setValue(busRenderDepth(point.y));
      if (movement.facing !== poseRef.current.facing) { poseRef.current = { facing: movement.facing, motion: 'walk' }; setPose(poseRef.current); }
      syncCamera();
    });
    let listening = true;
    const detach = () => { if (listening) { listening = false; actor.removeListener(listener); } };
    let anchor = position.current;
    const animation = Animated.sequence(points.map((point, index) => {
      const distance = Math.hypot(point.x - anchor.x, point.y - anchor.y); anchor = point;
      return Animated.timing(actor, { toValue: point, duration: Math.max(120, Math.round(distance / 220 * 1000)), easing: index === points.length - 1 ? Easing.out(Easing.quad) : Easing.linear, useNativeDriver: false });
    }));
    let cancelled = false;
    animation.start(({ finished }) => { detach(); if (finished && !cancelled) finish(); });
    return () => {
      cancelled = true; animation.stop(); detach();
      // Keep pending until finish: an async reduced-motion preference must still
      // settle this same destination after cancelling its in-flight animation.
      passengerMoving.current = false; live.current.props.onPassengerTransitionChange?.(false);
    };
  }, [props.seated, props.securedAt, props.passengerPlaceId, scene, actor, depth, stop, syncCamera, updateNearby, reduceMotion, walkCycle]);
  useEffect(() => { stop(); }, [controlMode, stop]);
  useEffect(() => { updateNearby(); updateTargetEdge(); }, [props.bus, props.target, direction, side, updateNearby, updateTargetEdge]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const down = (event: KeyboardEvent) => {
      const p = live.current.props; const element = event.target as HTMLElement | null;
      if (p.locked || element?.closest('input,textarea,select,[contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (!p.travelling && !p.seated && !passengerMoving.current && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'shift'].includes(key)) { event.preventDefault(); keys.current.add(key); route.current = []; destination.current = null; destinationPlace.current = undefined; setTapTarget(null); }
      else if ((key === 'e' || key === ' ') && !event.repeat && !element?.closest('button,a,[role="button"]')) { event.preventDefault(); if (nearby.current) navigate(nearby.current); }
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', stop);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', stop); };
  }, [navigate, stop]);
  useEffect(() => {
    let frame = 0; let last = 0; let lastNearby = 0;
    const tick = (now: number) => {
      const elapsed = Math.min(40, last ? now - last : 16) / 1000; last = now;
      const p = live.current.props;
      if (!p.locked && !p.travelling && !p.seated && !passengerMoving.current) {
        const pressed = keys.current;
        let dx = vector.current.x + (pressed.has('d') || pressed.has('arrowright') ? 1 : 0) - (pressed.has('a') || pressed.has('arrowleft') ? 1 : 0);
        let dy = vector.current.y + (pressed.has('s') || pressed.has('arrowdown') ? 1 : 0) - (pressed.has('w') || pressed.has('arrowup') ? 1 : 0);
        const running = Boolean(vector.current.running || (live.current.runMode === 'toggle' && p.runEnabled) || pressed.has('shift'));
        let distance = 170 * elapsed * (running ? RUN_SPEED_MULTIPLIER : 1);
        if (route.current.length) {
          const point = route.current[0];
          // A smoothed corner can sit exactly on a padded collision boundary.
          // Advancing 1px early leaves the next segment inside that boundary and
          // jams against the planter. Finish the safe segment exactly first.
          if (Math.hypot(point.x - position.current.x, point.y - position.current.y) < 2 && busWorldClearSegment(position.current, point, geometry())) {
            setPosition(point, running); route.current.shift();
            if (!route.current.length) {
              const id = destination.current; const placeId = destinationPlace.current; stop();
              if (id) { if (placeId) live.current.props.onInteract(id, placeId); else live.current.props.onInteract(id); }
            }
          }
          const nextPoint = route.current[0];
          dx = nextPoint ? nextPoint.x - position.current.x : 0;
          dy = nextPoint ? nextPoint.y - position.current.y : 0;
          distance = Math.min(distance, Math.hypot(dx, dy));
        }
        const length = Math.hypot(dx, dy);
        const next = length > 0.03 ? moveBusWorldPlayer(position.current, dx / Math.max(1, length) * distance, dy / Math.max(1, length) * distance, geometry()) : position.current;
        setPosition(next, running);
        if (now - lastNearby > 90) { updateNearby(); lastNearby = now; }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [geometry, setPosition, stop, updateNearby]);
  const worldSize = busWorldSize(scene);
  const currentStations = stations();
  const showSeated = scene === 'bus' && sitting && props.seated && (props.securedAt ?? 'seat') === 'seat';
  const selectedPlace = getBusPassengerPlace(props.passengerPlaceId) ?? getBusPassengerPlace(props.securedAt === 'handrail' ? 'handrail-middle' : 'seat-front-left')!;
  const seatBack = selectedPlace.seatBack;
  return <View ref={viewportRef} testID="bus-world" style={s.world} onLayout={event => { setViewport(event.nativeEvent.layout); viewportRef.current?.measureInWindow((x, y) => { viewportOrigin.current = { x, y }; }); }}>
    {scene === 'bus' && <BusRoadBackdrop viewport={viewport} travelling={travelling && !locked} reduceMotion={reduceMotion} />}
    <Animated.View testID="bus-world-camera" style={{ position: 'absolute', width: worldSize.width, height: worldSize.height, transform: camera.getTranslateTransform() }}>
      <Pressable accessibilityLabel={scene === 'bus' ? '버스 통로' : '동네 보행로'} style={StyleSheet.absoluteFill} onPress={event => {
        if (locked || travelling || props.seated || passengerMoving.current || controlMode !== 'touch') return;
        const { pageX, pageY, locationX, locationY } = event.nativeEvent;
        const point = Number.isFinite(pageX) && Number.isFinite(pageY) ? { x: pageX - viewportOrigin.current.x - cameraPoint.current.x, y: pageY - viewportOrigin.current.y - cameraPoint.current.y } : { x: locationX, y: locationY };
        route.current = findBusWorldPath(position.current, point, geometry()); destination.current = null; destinationPlace.current = undefined; setTapTarget(route.current.length ? point : null);
      }}>
        {scene === 'bus' ? <Image source={busArt.interior} fadeDuration={0} resizeMode="contain" style={{ position: 'absolute', left: BUS_INTERIOR_BODY.x, top: BUS_INTERIOR_BODY.y, width: BUS_INTERIOR_BODY.width, height: BUS_INTERIOR_BODY.height }} /> : <OutdoorFloor crossingAllowed={Boolean(props.crossingAllowed)} />}
      </Pressable>
      {scene === 'bus' ? <InteriorObjects onSelect={navigate} onSelectPlace={selectPlace} selectedPlaceId={props.seated ? selectedPlace.id : null} travelling={travelling} target={props.target} bellRequested={props.bellRequested} /> : <OutdoorObjects {...props} side={side} onSelect={navigate} onArrivalReadyChange={onArrivalReadyChange} />}
      {tapTarget ? <View pointerEvents="none" style={[s.tapMarker, { left: tapTarget.x - 12, top: tapTarget.y - 6 }]} /> : null}
      {scene !== 'bus' && Object.entries(currentStations).filter(([id]) => id === props.target).map(([id, point]) => <View key={id} pointerEvents="none" style={{ position: 'absolute', left: point!.x - 15, top: point!.y - 134, zIndex: 1500 }}><Ionicons name="chevron-down" size={29} color="#456F54" /></View>)}
      <Animated.View pointerEvents="none" accessibilityLabel="내 캐릭터" testID="bus-world-player" style={{ position: 'absolute', left: -64 * BUS_PLAYER_SCALE, top: -186 * BUS_PLAYER_SCALE, zIndex: depth, transform: actor.getTranslateTransform() }}>
        <View testID={showSeated ? 'bus-seated-player' : undefined} style={showSeated ? { height: 77, overflow: 'hidden' } : undefined}><DirectionalAvatar facing={showSeated ? 'back' : pose.facing} motion={showSeated ? 'idle' : pose.motion} manifest={chibiPlayerAvatar} walkCycle={walkCycle} scale={BUS_PLAYER_SCALE} reduceMotion={reduceMotion} /></View>
      </Animated.View>
      {showSeated && seatBack && <View testID="bus-seat-foreground" pointerEvents="none" style={{ position: 'absolute', left: seatBack.x, top: seatBack.y, width: seatBack.width, height: seatBack.height, overflow: 'hidden', zIndex: busRenderDepth(selectedPlace.position.y) + 1 }}>
        <Image source={busArt.interior} fadeDuration={0} style={{ position: 'absolute', left: BUS_INTERIOR_BODY.x - seatBack.x, top: BUS_INTERIOR_BODY.y - seatBack.y, width: BUS_INTERIOR_BODY.width, height: BUS_INTERIOR_BODY.height }} />
      </View>}
    </Animated.View>
    {props.target && targetEdge && !locked && <TargetEdgeHint target={props.target} edge={targetEdge} viewport={viewport}
      interactive={controlMode === 'touch' && ((!travelling && !props.seated) || (travelling && props.target === 'bell'))}
      onPress={() => navigate(props.target!)} />}
  </View>;
});

const targetShortNames: Record<BusWorldStation, string> = {
  card: '교통카드', 'stop-outbound': '정류장', 'stop-inbound': '정류장', crossing: '횡단보도', board: '버스', driver: '기사님',
  'reader-front': '승차 단말기', seat: '빈자리', handrail: '손잡이', bell: '하차벨', 'reader-rear': '하차 단말기',
  'door-front': '앞문', 'door-rear': '내리는 문', library: '도서관 입구',
};
const targetArrows = { left: 'arrow-back', right: 'arrow-forward', up: 'arrow-up', down: 'arrow-down' } as const;
const targetDirections = { left: '왼쪽', right: '오른쪽', up: '위쪽', down: '아래쪽' };
function TargetEdgeHint({ target, edge, viewport, interactive, onPress }: {
  target: BusWorldStation; edge: BusWorldTargetEdge; viewport: { width: number; height: number }; interactive: boolean; onPress: () => void;
}) {
  const horizontal = edge === 'left' || edge === 'right';
  const top = horizontal ? Math.max(260, Math.min(viewport.height * 0.4, viewport.height - 289)) : edge === 'up' ? 260 : viewport.height - 289;
  const left = edge === 'left' ? 18 : edge === 'right' ? viewport.width - 172 : (viewport.width - 154) / 2;
  const label = `${targetDirections[edge]} ${targetShortNames[target]}`;
  const content = <><Ionicons name={targetArrows[edge]} size={21} color="#426450" /><Text style={s.edgeHintText}>{targetShortNames[target]}</Text></>;
  return interactive
    ? <Pressable testID="bus-target-edge" accessibilityRole="button" accessibilityLabel={`${label}까지 이동`} onPress={onPress} style={[s.edgeHint, { top, left }]}>{content}</Pressable>
    : <View testID="bus-target-edge" accessible accessibilityLabel={label} pointerEvents="none" style={[s.edgeHint, { top, left }]}>{content}</View>;
}

const OutdoorFloor = memo(function OutdoorFloor({ crossingAllowed }: { crossingAllowed: boolean }) {
  return <View pointerEvents="none" style={s.outdoorFloor}>
    <View style={s.upperGarden} /><View style={s.upperPath} /><View style={s.lowerPath} />
    <Image source={scenery.road} resizeMode="repeat" style={s.road} />
    <View style={[s.curb, { top: BUS_STREET.top - 8 }]} /><View style={[s.curb, { top: BUS_STREET.bottom }]} />
    {Array.from({ length: 10 }, (_, i) => <View key={i} style={{ position: 'absolute', left: 20 + i * 130, top: 742, width: 60, height: 5, borderRadius: 2, backgroundColor: '#EBD9A2', opacity: i === 8 || i === 7 ? 0 : 0.8 }} />)}
    {Array.from({ length: 7 }, (_, i) => <View key={`stripe${i}`} style={{ position: 'absolute', left: 972, top: 650 + i * 28, width: 126, height: 14, borderRadius: 3, backgroundColor: '#FFF9E8' }} />)}
    {[615, 870].map(y => <View key={y} style={{ position: 'absolute', left: 965, top: y, width: 140, height: 18, backgroundColor: '#DCC68A', borderRadius: 4 }} />)}
    <View style={{ position: 'absolute', left: 1116, top: 607, height: 289, width: 4, backgroundColor: '#A29B85', borderRadius: 5 }} />
    {[595, 880].map(y => <View key={`signal${y}`} style={{ position: 'absolute', left: 1100, top: y, width: 36, height: 39, backgroundColor: '#5C655E', borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={crossingAllowed ? 'walk' : 'hand-left'} size={26} color={crossingAllowed ? '#C8EAA3' : '#DCA190'} /></View>)}
    {Array.from({ length: 11 }, (_, i) => <View key={`pave${i}`} style={{ position: 'absolute', left: 34 + i * 112, top: 870, width: 1, height: 260, backgroundColor: '#DBD4C4' }} />)}
  </View>;
});

function OutdoorObjects(props: BusWorldProps & { side: BusWorldDirection; onSelect: (id: BusWorldStation) => void; onArrivalReadyChange: (ready: boolean) => void }) {
  const { scene, stopName = '마을앞', direction = 'outbound', onSelect, reduceMotion } = props;
  const routes = stopName === '하늘도서관' || stopName === '늘봄주민센터' ? '201' : stopName === '체육관' ? '305' : '201 · 305';
  return <>
    {scene === 'village' ? <Image source={scenery.home} resizeMode="contain" style={{ position: 'absolute', left: 140, top: 65, width: 390, height: 330, zIndex: 370 }} />
      : scene === 'district' ? <><Image source={busArt.library} resizeMode="contain" style={{ position: 'absolute', left: 350, top: 49, width: 540, height: 281, zIndex: 330 }} /><View style={[s.buildingSign, { left: 510, top: 124, width: 220, zIndex: 332 }]}><Text style={s.buildingTitle}>하늘도서관</Text></View></>
        : <Image source={stopName === '중앙공원' || stopName === '느티광장' ? scenery.park : scenery.community} resizeMode="contain" style={{ position: 'absolute', left: 310, top: 50, width: 430, height: 290, zIndex: 325 }} />}
    <OutdoorNature reduceMotion={reduceMotion} />
    {scene === 'village' && <Pressable accessibilityRole="button" accessibilityLabel="교통카드 챙기기" onPress={() => onSelect('card')} style={{ position: 'absolute', left: 414, top: 362, width: 76, height: 66, zIndex: 399 }}>
      <View style={s.cardTable}><View style={s.transitCard}><Ionicons name="bus" size={24} color="#FDF9ED" /></View></View>
    </Pressable>}
    {scene === 'district' && <>
      <Pressable accessibilityRole="button" accessibilityLabel="도서관 입구" onPress={() => onSelect('library')} style={{ position: 'absolute', left: 575, top: 345, width: 95, height: 95, zIndex: 398 }}><View style={[s.doorMat, { top: 20 }]}><Ionicons name="book" size={26} color="#5A765E" /></View></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="사서에게 도착 알리기" onPress={() => onSelect('library')} style={{ position: 'absolute', left: 675, top: 289, width: 66, height: 105, zIndex: 394 }}><Image source={libraryArt.librarian} resizeMode="contain" style={{ width: 66, height: 105 }} /></Pressable>
    </>}
    {(['inbound', 'outbound'] as const).map(side => <Pressable key={side} accessibilityRole="button" accessibilityLabel={`${stopName} ${side === 'outbound' ? props.stopId === 'library' ? '주민센터 방면' : props.stopId === 'civic' || props.stopId === 'gym' ? '종점' : '주민센터·체육관 방면' : '느티광장 방면'} 정류장`} onPress={() => onSelect(side === 'outbound' ? 'stop-outbound' : 'stop-inbound')}
      style={{ position: 'absolute', left: side === 'outbound' ? 315 : 40, top: side === 'outbound' ? 939 : 430, width: 365, height: 188, zIndex: side === 'outbound' ? 1097 : 595 }}>
      <Image source={busArt.shelter} resizeMode="contain" style={{ width: 256, height: 165 }} />
      <View testID={`bus-stop-display-${side}`} pointerEvents="none" style={s.stopDisplay}>
        {routes.split(' · ').map(number => <View key={number} style={s.stopDisplayRow}>
          <Text style={s.stopDisplayRoute}>{number}</Text>
          <Text style={[s.stopDisplayStatus, props.bus && direction === side && String(props.bus.number) === number && s.stopDisplayArrived]}>
            {props.bus && direction === side && String(props.bus.number) === number ? '도착' : '대기'}
          </Text>
        </View>)}
      </View>
      <View style={s.stopSign}><View style={s.stopRound}><Ionicons name="bus" color="#F7F6E9" size={22} /></View><Text style={s.stopName}>{stopName}</Text><Text style={s.stopDirection}>{(side === 'outbound' && (stopName === '늘봄주민센터' || stopName === '체육관')) || (side === 'inbound' && stopName === '느티광장') ? '종점 · 하차' : side === 'outbound' ? `${routes} →` : `← ${routes}`}</Text></View>
    </Pressable>)}
    <Pressable accessibilityRole="button" accessibilityLabel="횡단보도 주변 살피기" onPress={() => onSelect('crossing')} style={{ position: 'absolute', left: 986, top: props.side === 'inbound' ? 548 : 875, width: 98, height: 62, zIndex: 900 }}><View style={s.crossingBadge}><Ionicons name="walk" size={24} color="#5D745D" /></View></Pressable>
    <ParkedBus bus={props.bus ?? null} direction={direction} reduceMotion={reduceMotion} onSelect={onSelect} onArrivalReadyChange={props.onArrivalReadyChange} />
  </>;
}

const OutdoorNature = memo(function OutdoorNature({ reduceMotion }: { reduceMotion: boolean }) {
  const sway = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) { sway.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([Animated.timing(sway, { toValue: 1, duration: 3500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }), Animated.timing(sway, { toValue: 0, duration: 3500, easing: Easing.inOut(Easing.sin), useNativeDriver: true })])); loop.start(); return () => loop.stop();
  }, [reduceMotion, sway]);
  return <>
    {[{ x: 40, y: 280, w: 175, h: 195 }, { x: 1080, y: 290, w: 175, h: 195 }, { x: 45, y: 879, w: 160, h: 178 }, { x: 1100, y: 891, w: 157, h: 175 }].map((tree, index) => <Animated.Image key={index} source={scenery.tree} resizeMode="contain" style={{ position: 'absolute', left: tree.x, top: tree.y, width: tree.w, height: tree.h, zIndex: busRenderDepth(tree.y + tree.h), transform: [{ rotate: sway.interpolate({ inputRange: [0, 1], outputRange: ['-0.35deg', '0.35deg'] }) }] }} />)}
    {[{ x: 215, y: 439 }, { x: 865, y: 443 }, { x: 885, y: 1090 }].map((point, index) => <Image key={`flowers${index}`} source={scenery.flowers} resizeMode="contain" style={{ position: 'absolute', ...{ left: point.x, top: point.y }, width: 105, height: 18, zIndex: point.y + 18 }} />)}
    <Image source={scenery.bench} resizeMode="contain" style={{ position: 'absolute', left: 760, top: 462, width: 145, height: 61, zIndex: 523 }} />
    <Image source={scenery.shrub} resizeMode="contain" style={{ position: 'absolute', left: 795, top: 363, width: 130, height: 42, zIndex: 405 }} />
  </>;
});

function ParkedBus({ bus, direction, reduceMotion, onSelect, onArrivalReadyChange }: { bus: BusWorldProps['bus']; direction: BusWorldDirection; reduceMotion: boolean; onSelect: (id: BusWorldStation) => void; onArrivalReadyChange: (ready: boolean) => void }) {
  const [ready, setReady] = useState(reduceMotion);
  const inbound = direction === 'inbound';
  return <View pointerEvents="box-none" style={{ position: 'absolute', left: 250, top: inbound ? 626 : 637, width: 640, height: 213, zIndex: inbound ? 638 : 850 }}>
    <BusArrivalVehicle bus={bus ?? null} direction={direction} reduceMotion={reduceMotion} onReadyChange={ready => { setReady(ready); onArrivalReadyChange(ready); }} width={640} maxHeight={213}>
      {bus && <>
        <Pressable accessibilityRole="button" accessibilityLabel={String(bus.number) + '번 버스 타기'} accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={() => onSelect('board')} style={{ position: 'absolute', left: inbound ? 55 : 502, top: 56, width: 92, height: 145 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={String(bus.number) + '번 기사에게 말 걸기'} accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={() => onSelect('driver')} style={{ position: 'absolute', left: inbound ? 0 : 588, top: 43, width: 52, height: 110 }} />
      </>}
    </BusArrivalVehicle>
  </View>;
}

const interiorTargets: { id: BusWorldStation; label: string; x: number; y: number; width: number; height: number }[] = [
  { id: 'driver', label: '기사님에게 말 걸기', x: 104, y: 147, width: 129, height: 138 },
  { id: 'reader-front', label: '승차 카드 단말기', x: 287, y: 195, width: 37, height: 57 },
  { id: 'reader-rear', label: '하차 카드 단말기', x: 298, y: 595, width: 42, height: 50 },
  { id: 'bell', label: '하차벨 누르기', x: 177, y: 446, width: 30, height: 38 },
  { id: 'door-front', label: '버스 앞문', x: 327, y: 206, width: 42, height: 102 },
  { id: 'door-rear', label: '버스 뒷문으로 내리기', x: 336, y: 575, width: 39, height: 110 },
];
function InteriorObjects({ onSelect, onSelectPlace, selectedPlaceId, travelling, target, bellRequested }: {
  onSelect: (id: BusWorldStation) => void; onSelectPlace: (place: BusPassengerPlace) => void;
  selectedPlaceId: BusPassengerPlaceId | null; travelling: boolean; target?: BusWorldStation | null; bellRequested?: boolean;
}) {
  return <>{interiorTargets.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => onSelect(item.id)} style={{ position: 'absolute', left: item.x, top: item.y, width: item.width, height: item.height, zIndex: item.y + item.height }} />)}
    {BUS_PASSENGER_PLACES.map(place => {
      const active = selectedPlaceId === place.id; const box = place.hitbox;
      return <Pressable key={place.id} testID={`bus-place-${place.id}`} accessibilityRole="button" accessibilityLabel={place.label}
        accessibilityState={{ selected: active, disabled: travelling }} disabled={travelling} onPress={() => onSelectPlace(place)}
        style={{ position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, zIndex: box.y + box.height }}>
        {place.kind === 'handrail' && <View pointerEvents="none" style={s.passengerStrap}><View style={s.passengerStrapRing} /></View>}
        {(!travelling || active) && <View pointerEvents="none" style={[s.passengerBadge, place.kind === 'handrail' && s.handrailBadge, active && s.passengerBadgeActive]}>
          <Ionicons name={active ? 'checkmark' : place.kind === 'seat' ? 'chevron-down' : 'hand-left'} size={16} color={active ? '#FFFCED' : '#527266'} />
        </View>}
      </Pressable>;
    })}
    {interiorTargets.filter(item => item.id === target).map(item => <View key={`hint-${item.id}`} pointerEvents="none" style={{ position: 'absolute', left: item.x + item.width / 2 - 53, top: item.y - 36, width: 106, alignItems: 'center', zIndex: 1500 }}><View style={s.targetLabel}><Text style={s.targetText}>{BUS_WORLD_INTERACTIONS[item.id].label}</Text></View><Ionicons name="caret-down" size={16} color="#55765E" style={{ marginTop: -4 }} /></View>)}
    {bellRequested && <View pointerEvents="none" style={{ position: 'absolute', left: 181, top: 454, width: 12, height: 12, borderRadius: 8, backgroundColor: '#F5BA76', opacity: 0.75, zIndex: 600 }} />}
  </>;
}

const s = StyleSheet.create({
  stopDisplay: { position: 'absolute', left: 40, top: 47, width: 136, minHeight: 43, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 5, backgroundColor: '#303D38', justifyContent: 'center', shadowColor: '#2F3B30', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 2 },
  stopDisplayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 20 },
  stopDisplayRoute: { fontFamily: fonts.bold, fontSize: 16, color: '#E6D793' }, stopDisplayStatus: { fontFamily: fonts.bold, fontSize: 13, color: '#A9B5AC' }, stopDisplayArrived: { color: '#AFE29C' },
  passengerBadge: { position: 'absolute', top: 4, left: '50%', marginLeft: -13, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFBEDD9', shadowColor: '#334A42', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3 },
  handrailBadge: { top: 34 }, passengerBadgeActive: { backgroundColor: '#5A8372' },
  passengerStrap: { position: 'absolute', left: 18, top: 0, width: 6, height: 18, borderRadius: 3, backgroundColor: '#B9A574' },
  passengerStrapRing: { position: 'absolute', top: 12, left: -8, width: 22, height: 21, borderWidth: 4, borderRadius: 8, borderColor: '#C4AC79', backgroundColor: '#EDE2CA33' },
  edgeHint: { position: 'absolute', width: 154, height: 44, paddingHorizontal: 10, borderRadius: 22, backgroundColor: '#FAF7EDEE', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, zIndex: 2000, shadowColor: '#344334', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 2 }, shadowRadius: 5, elevation: 3 },
  edgeHintText: { fontFamily: fonts.bold, fontSize: 16, color: '#426450' },
  // Unlike hidden, CSS clip cannot be programmatically scrolled when a keyboard
  // user focuses an off-screen world object. The camera remains the sole viewport.
  world: { flex: 1, backgroundColor: '#E9E5D7', overflow: 'hidden', ...Platform.select({ web: { overflow: 'clip' } as never, default: {} }) }, outdoorFloor: { width: BUS_WORLD_SIZE.width, height: BUS_WORLD_SIZE.height, backgroundColor: '#E7E8D4' },
  upperGarden: { position: 'absolute', left: 0, right: 0, top: 0, height: 434, backgroundColor: '#D9DFC5', borderBottomLeftRadius: 65, borderBottomRightRadius: 65 },
  upperPath: { position: 'absolute', left: 0, right: 0, top: 338, height: 309, backgroundColor: '#EEE9D8', borderTopLeftRadius: 58, borderTopRightRadius: 58 },
  lowerPath: { position: 'absolute', left: 0, right: 0, top: 846, height: 330, backgroundColor: '#F0EADD' },
  road: { position: 'absolute', left: 0, right: 0, top: 640, height: 210, backgroundColor: '#B9B2A5' }, curb: { position: 'absolute', left: 0, right: 0, height: 8, backgroundColor: '#D9D2BB' },
  tapMarker: { position: 'absolute', width: 24, height: 12, borderRadius: 14, borderWidth: 2, borderColor: '#8EA579', backgroundColor: '#F5F2D870', zIndex: 4 },
  buildingSign: { position: 'absolute', backgroundColor: '#F9F4E6', borderRadius: 10, paddingVertical: 7 }, buildingTitle: { color: '#506A57', fontFamily: fonts.laundryBold, fontSize: 25, textAlign: 'center' },
  cardTable: { width: 76, height: 38, borderRadius: 8, backgroundColor: '#B69B73', alignItems: 'center', justifyContent: 'center', borderBottomWidth: 7, borderColor: '#9C825D' }, transitCard: { width: 45, height: 28, borderRadius: 5, backgroundColor: '#688D7F', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] },
  doorMat: { position: 'absolute', width: 94, height: 41, backgroundColor: '#CFD7BD', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stopSign: { position: 'absolute', left: 254, top: 2, width: 105, height: 158, alignItems: 'center', gap: 5, backgroundColor: '#F8F4E5', borderRadius: 15, paddingHorizontal: 4, paddingTop: 9 }, stopRound: { width: 38, height: 38, borderRadius: 20, backgroundColor: '#658B76', alignItems: 'center', justifyContent: 'center' }, stopName: { fontSize: 18, lineHeight: 24, fontFamily: fonts.laundryBold, color: '#4D6454', textAlign: 'center' }, stopDirection: { fontFamily: fonts.bold, fontSize: 15, color: '#5D715E' },
  crossingBadge: { width: 42, height: 42, borderRadius: 22, backgroundColor: '#FCF9EACF', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  busDestination: { position: 'absolute', minWidth: 194, maxWidth: 235, backgroundColor: '#364D48', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, busNumber: { fontFamily: fonts.bold, fontSize: 28, color: '#F4E9AD' }, busDestinationText: { fontFamily: fonts.bold, fontSize: 17, color: '#EEEECF', flexShrink: 1 },
  reader: { width: 42, height: 55, borderRadius: 10, paddingTop: 7, alignItems: 'center', gap: 5, borderBottomWidth: 5, borderColor: '#465A50' }, readerLight: { width: 18, height: 3, backgroundColor: '#DCE9B8', borderRadius: 3 },
  strap: { width: 12, height: 53, backgroundColor: '#BAA36E', marginLeft: 20, borderRadius: 4 }, strapRing: { position: 'absolute', bottom: -18, left: -12, width: 36, height: 34, borderWidth: 7, borderColor: '#C5AC73', borderRadius: 13 },
  doorBadge: { position: 'absolute', right: 2, top: 19, width: 38, height: 45, borderRadius: 13, backgroundColor: '#E4E4D5', alignItems: 'center', justifyContent: 'center' },
  targetLabel: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 13, backgroundColor: '#55765E' }, targetText: { fontFamily: fonts.bold, fontSize: 16, color: '#FFFBEF' },
});
