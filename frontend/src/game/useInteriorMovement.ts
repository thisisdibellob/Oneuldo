import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { createAvatarWalkCycle, getAvatarMovement, type AvatarFacing, type AvatarMotion } from './avatarAnimation';
import { useGamePreferences } from './gamePreferences';
import { RUN_SPEED_MULTIPLIER, type GameMovementInput } from './movementControls';

export type InteriorPoint = { x: number; y: number };
export type InteriorTargetEdge = 'up' | 'down' | 'left' | 'right';
export type InteriorMovementWorld<Station extends string> = {
  room: { width: number; height: number };
  spawn: InteriorPoint;
  viewScale: number;
  stations: Record<Station, { point: InteriorPoint }>;
  movePlayer: (from: InteriorPoint, dx: number, dy: number) => InteriorPoint;
  findPath: (from: InteriorPoint, to: InteriorPoint) => InteriorPoint[];
  targetEdge: (point: InteriorPoint | null, camera: InteriorPoint, viewport: { width: number; height: number }, scale: number) => InteriorTargetEdge | null;
};
type Options<Station extends string> = {
  world: InteriorMovementWorld<Station>;
  locked: boolean;
  controlMode: 'joystick' | 'touch';
  onInteract: (station: Station) => void;
  target: Station | null;
  navigationRequest?: { id: number; station: Station };
  isAvailable?: (station: Station) => boolean;
};

/** Shared by small interiors: preserve fractional world/camera coordinates,
 * step the avatar by distance, and move automatically only in touch mode.
 * Keep the world configuration stable for the lifetime of the room. */
export function useInteriorMovement<Station extends string>({ world, locked, controlMode, onInteract, target, navigationRequest, isAvailable }: Options<Station>) {
  const [viewport, setViewport] = useState({ width: 375, height: 740 });
  const viewportRef = useRef<View>(null); const viewportOrigin = useRef({ x: 0, y: 0 });
  const [tapTarget, setTapTarget] = useState<InteriorPoint | null>(null);
  const { preferences } = useGamePreferences();
  const [runEnabled, setRunEnabled] = useState(false);
  const position = useRef<InteriorPoint>({ ...world.spawn });
  const actor = useRef(new Animated.ValueXY(world.spawn)).current;
  const camera = useRef(new Animated.ValueXY()).current;
  const depth = useRef(new Animated.Value(Math.round(world.spawn.y))).current;
  const cameraPoint = useRef({ x: 0, y: 0 });
  const vector = useRef({ x: 0, y: 0, running: false }); const keys = useRef(new Set<string>());
  const route = useRef<InteriorPoint[]>([]); const destination = useRef<Station | null>(null);
  const walkCycle = useMemo(() => createAvatarWalkCycle(), []);
  const [pose, setPose] = useState<{ facing: AvatarFacing; motion: AvatarMotion }>({ facing: 'back', motion: 'idle' });
  const poseRef = useRef(pose); const [nearby, setNearby] = useState<Station | null>(null);
  const [targetEdge, setTargetEdge] = useState<InteriorTargetEdge | null>(null); const targetEdgeRef = useRef<InteriorTargetEdge | null>(null);
  const live = useRef({ locked, controlMode, onInteract, target, viewport, runEnabled, runMode: preferences.runMode, isAvailable });
  live.current = { locked, controlMode, onInteract, target, viewport, runEnabled, runMode: preferences.runMode, isAvailable };
  const canInteract = useCallback((station: Station) => live.current.isAvailable?.(station) ?? true, []);
  const updateTargetEdge = useCallback(() => {
    const goal = live.current.target;
    const next = world.targetEdge(goal && canInteract(goal) ? world.stations[goal].point : null, cameraPoint.current, live.current.viewport, world.viewScale);
    if (next !== targetEdgeRef.current) { targetEdgeRef.current = next; setTargetEdge(next); }
  }, [canInteract, world]);
  const syncCamera = useCallback(() => {
    const size = live.current.viewport; const zoom = world.viewScale;
    const width = world.room.width * zoom; const height = world.room.height * zoom;
    const x = width <= size.width ? (size.width - width) / 2 : Math.max(size.width - width, Math.min(0, size.width / 2 - position.current.x * zoom));
    const usableHeight = Math.max(240, size.height - 190);
    const focusY = size.width < 600 ? Math.min(size.height - 128, Math.max(445, usableHeight * 0.54)) : usableHeight * 0.54;
    const y = height <= usableHeight ? (usableHeight - height) / 2 : Math.max(usableHeight - height, Math.min(180, focusY - position.current.y * zoom));
    cameraPoint.current = { x, y }; camera.setValue({ x, y }); updateTargetEdge();
  }, [camera, updateTargetEdge, world]);
  const stop = useCallback(() => {
    vector.current = { x: 0, y: 0, running: false }; keys.current.clear(); route.current = []; destination.current = null; setTapTarget(null);
    if (poseRef.current.motion !== 'idle') { poseRef.current = { ...poseRef.current, motion: 'idle' }; setPose(poseRef.current); }
  }, []);
  useEffect(() => { syncCamera(); }, [viewport, syncCamera]);
  useEffect(() => { updateTargetEdge(); }, [target, isAvailable, updateTargetEdge]);
  useEffect(() => { if (locked) stop(); }, [locked, stop]);
  useEffect(() => stop(), [controlMode, stop]);
  useEffect(() => {
    if (destination.current && !canInteract(destination.current)) stop();
    setNearby(current => current && !canInteract(current) ? null : current);
  }, [isAvailable, canInteract, stop]);
  const navigate = useCallback((station: Station) => {
    if (live.current.locked || !canInteract(station)) return;
    const next = world.stations[station].point;
    setTapTarget(null);
    if (Math.hypot(next.x - position.current.x, next.y - position.current.y) <= 86) { stop(); live.current.onInteract(station); return; }
    if (live.current.controlMode !== 'touch') return;
    route.current = world.findPath(position.current, next); destination.current = route.current.length ? station : null;
  }, [canInteract, stop, world]);
  const interactRef = useRef(() => {}); interactRef.current = () => { if (nearby && !live.current.locked) navigate(nearby); };
  useEffect(() => { if (navigationRequest) navigate(navigationRequest.station); }, [navigationRequest, navigate]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const down = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      if (live.current.locked || element?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'shift'].includes(key)) {
        event.preventDefault(); keys.current.add(key); route.current = []; destination.current = null; setTapTarget(null);
      } else if ((key === 'e' || key === ' ') && !event.repeat && !element?.closest('button, a, [role="button"]')) { event.preventDefault(); interactRef.current(); }
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', stop);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', stop); };
  }, [stop]);
  useEffect(() => {
    let frame = 0; let last = 0; let lastProximity = 0;
    const tick = (now: number) => {
      const elapsed = Math.min(40, last ? now - last : 16) / 1000; last = now;
      if (!live.current.locked) {
        const pressed = keys.current;
        let dx = vector.current.x + (pressed.has('d') || pressed.has('arrowright') ? 1 : 0) - (pressed.has('a') || pressed.has('arrowleft') ? 1 : 0);
        let dy = vector.current.y + (pressed.has('s') || pressed.has('arrowdown') ? 1 : 0) - (pressed.has('w') || pressed.has('arrowup') ? 1 : 0);
        const running = vector.current.running || pressed.has('shift') || (live.current.runMode === 'toggle' && live.current.runEnabled);
        let speed = 170 * elapsed * (running ? RUN_SPEED_MULTIPLIER : 1);
        if (route.current.length) {
          const next = route.current[0]; dx = next.x - position.current.x; dy = next.y - position.current.y;
          const distance = Math.hypot(dx, dy); speed = Math.min(speed, distance);
          if (distance < 3) {
            route.current.shift();
            if (!route.current.length) setTapTarget(null);
            if (!route.current.length && destination.current) { const station = destination.current; stop(); if (canInteract(station)) live.current.onInteract(station); }
            dx = 0; dy = 0;
          }
        }
        const length = Math.hypot(dx, dy);
        const next = length > 0.03 ? world.movePlayer(position.current, dx / Math.max(1, length) * speed, dy / Math.max(1, length) * speed) : position.current;
        const movement = getAvatarMovement(position.current, next, poseRef.current.facing, running ? 'sprint' : 'walk');
        walkCycle.advance(movement.distance); position.current = next;
        if (movement.distance > 0) { actor.setValue(next); depth.setValue(Math.round(next.y)); syncCamera(); }
        if (movement.facing !== poseRef.current.facing || movement.motion !== poseRef.current.motion) { poseRef.current = { facing: movement.facing, motion: movement.motion }; setPose(poseRef.current); }
        if (now - lastProximity > 90) {
          lastProximity = now;
          const options = (Object.keys(world.stations) as Station[]).filter(canInteract).map(station => ({ station, distance: Math.hypot(next.x - world.stations[station].point.x, next.y - world.stations[station].point.y) })).sort((a, b) => a.distance - b.distance);
          setNearby(options[0]?.distance < 86 ? options[0].station : null);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [actor, depth, canInteract, stop, syncCamera, walkCycle, world]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setViewport(event.nativeEvent.layout);
    viewportRef.current?.measureInWindow((x, y) => { viewportOrigin.current = { x, y }; });
  }, []);
  const onFloorPress = useCallback((event: GestureResponderEvent) => {
    if (live.current.locked || live.current.controlMode !== 'touch') return;
    const { pageX, pageY, locationX, locationY } = event.nativeEvent;
    const point = Number.isFinite(pageX) && Number.isFinite(pageY)
      ? { x: (pageX - viewportOrigin.current.x - cameraPoint.current.x) / world.viewScale, y: (pageY - viewportOrigin.current.y - cameraPoint.current.y) / world.viewScale }
      : { x: locationX, y: locationY };
    route.current = world.findPath(position.current, point); destination.current = null; setTapTarget(route.current.length ? point : null);
  }, [world]);
  const onMoveStart = useCallback(() => { route.current = []; destination.current = null; setTapTarget(null); }, []);
  const onMove = useCallback((input: GameMovementInput) => { vector.current = input; }, []);

  return { viewport, viewportRef, onLayout, onFloorPress, tapTarget, actor, camera, depth, pose, walkCycle, nearby, targetEdge, navigate, runEnabled, setRunEnabled, onMoveStart, onMove, stop };
}
