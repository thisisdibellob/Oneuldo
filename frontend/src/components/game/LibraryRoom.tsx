import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GameControls } from './GameControls';
import { useGamePreferences } from '../../game/gamePreferences';
import { RUN_SPEED_MULTIPLIER } from '../../game/movementControls';
import { fonts } from '../../theme';
import { DirectionalAvatar } from './DirectionalAvatar';
import { chibiPlayerAvatar } from '../../game/chibiPlayerAvatar';
import { createAvatarWalkCycle, getAvatarMovement, type AvatarFacing, type AvatarMotion } from '../../game/avatarAnimation';
import { libraryArt } from '../../game/libraryArt';
import { getLibraryCategory, type LibraryVisitor } from '../../game/librarySession';
import { villageNpcArt } from '../../game/villageNpcArt';
import { libraryTargetEdge, type LibraryTargetEdge } from '../../game/libraryWorld';
import { advanceLibraryFollower, createLibraryFollower, getLibraryFollowerResumePoint, findLibraryPath, isLibraryVisitorStation, LIBRARY_ROOM, LIBRARY_SPAWN, LIBRARY_VISITOR_SPAWNS, LIBRARY_STATIONS, LIBRARY_SHELVES, LIBRARY_SHELF_FIXTURES, LIBRARY_WALL_FLOOR_Y, LIBRARY_WALL_WINDOWS, LIBRARY_COMPUTERS, LIBRARY_COUNTER, LIBRARY_LOUNGE, LIBRARY_DECORATIONS, LIBRARY_PLAYER_SCALE, LIBRARY_VIEW_SCALE, moveLibraryPlayer, type LibraryFollower, type LibraryPoint, type LibraryStation, type LibraryVisitorStation } from '../../game/libraryWorld';

type RoomVisitor = { id: LibraryVisitorStation; status: LibraryVisitor['status'] | 'hidden'; requestType?: 'find' | 'shelve'; bookId?: string };
type VisitorRuntime = { position: LibraryPoint; actor: Animated.ValueXY; depth: Animated.Value; follower: LibraryFollower | null; status?: RoomVisitor['status'] };
const visitorIds: LibraryVisitorStation[] = ['visitor', 'visitor-2'];
type Props = { locked: boolean; controlMode: 'joystick' | 'touch'; visitors?: readonly RoomVisitor[]; visitorInteractionEnabled?: boolean; visitorVisible?: boolean; visitorStatus?: RoomVisitor['status']; visitorBookTitle?: string; target: LibraryStation | null; navigationRequest?: { id: number; station: LibraryStation }; onInteract: (station: LibraryStation) => void; reduceMotion: boolean };
export function LibraryRoom({ locked, controlMode, visitors, visitorInteractionEnabled, visitorVisible, visitorStatus = 'waiting', target, navigationRequest, onInteract, reduceMotion }: Props) {
  const roster = useMemo<readonly RoomVisitor[]>(() => (visitors ?? (visitorVisible === false && visitorStatus !== 'escorting' && visitorStatus !== 'resolved' ? [] : [{ id: 'visitor', status: visitorStatus }])).filter(visitor => visitor.status !== 'hidden'), [visitors, visitorVisible, visitorStatus]);
  const interactionEnabled = visitorInteractionEnabled ?? visitors === undefined;
  const [viewport, setViewport] = useState({ width: 375, height: 740 });
  const viewportRef = useRef<View>(null);
  const viewportOrigin = useRef({ x: 0, y: 0 });
  const [tapTarget, setTapTarget] = useState<LibraryPoint | null>(null);
  // Match the village's on-screen character size instead of fitting a whole building.
  const scale = LIBRARY_VIEW_SCALE;
  const { preferences } = useGamePreferences();
  const [runEnabled, setRunEnabled] = useState(false);
  const position = useRef<LibraryPoint>({ ...LIBRARY_SPAWN });
  const actor = useRef(new Animated.ValueXY(LIBRARY_SPAWN)).current;
  const camera = useRef(new Animated.ValueXY()).current;
  const depth = useRef(new Animated.Value(Math.round(LIBRARY_SPAWN.y))).current;
  const visitorRuntimes = useRef<Record<LibraryVisitorStation, VisitorRuntime> | null>(null);
  if (!visitorRuntimes.current) visitorRuntimes.current = Object.fromEntries(visitorIds.map(id => {
    const point = roster.some(visitor => visitor.id === id && visitor.status === 'escorting') ? getLibraryFollowerResumePoint(LIBRARY_SPAWN) : { ...LIBRARY_VISITOR_SPAWNS[id] };
    return [id, { position: point, actor: new Animated.ValueXY(point), depth: new Animated.Value(Math.round(point.y)), follower: null }];
  })) as Record<LibraryVisitorStation, VisitorRuntime>;
  const runtimes = visitorRuntimes.current;
  const [visitorHints, setVisitorHints] = useState<Record<LibraryVisitorStation, boolean>>({ visitor: false, 'visitor-2': false });
  const vector = useRef({ x: 0, y: 0, running: false }); const keys = useRef(new Set<string>());
  const route = useRef<LibraryPoint[]>([]); const destination = useRef<LibraryStation | null>(null);
  const walkCycle = useMemo(() => createAvatarWalkCycle(), []);
  const [pose, setPose] = useState<{ facing: AvatarFacing; motion: AvatarMotion }>({ facing: 'back', motion: 'idle' });
  const poseRef = useRef(pose); const [nearby, setNearby] = useState<LibraryStation | null>(null);
  const [targetEdge, setTargetEdge] = useState<LibraryTargetEdge | null>(null);
  const targetEdgeRef = useRef<LibraryTargetEdge | null>(null);
  const live = useRef({ locked, roster, interactionEnabled, onInteract, scale, viewport, controlMode, runEnabled, target, runMode: preferences.runMode });
  live.current = { locked, roster, interactionEnabled, onInteract, scale, viewport, controlMode, runEnabled, target, runMode: preferences.runMode };
  const canTalkToVisitor = useCallback((id: LibraryVisitorStation) => live.current.interactionEnabled && live.current.roster.some(visitor => visitor.id === id && visitor.status !== 'resolved'), []);
  const stationPoint = useCallback((station: LibraryStation): LibraryPoint => {
    if (!isLibraryVisitorStation(station)) return LIBRARY_STATIONS[station].point;
    const point = runtimes[station].position;
    const escorting = live.current.roster.some(visitor => visitor.id === station && visitor.status === 'escorting');
    return { x: point.x, y: point.y + (escorting ? 0 : 60) };
  }, [runtimes]);
  const updateVisitorHints = useCallback(() => {
    const next = { visitor: false, 'visitor-2': false };
    for (const visitor of live.current.roster) {
      const point = runtimes[visitor.id].position;
      next[visitor.id] = visitor.status !== 'resolved' && Math.hypot(position.current.x - point.x, position.current.y - point.y) <= 150;
    }
    setVisitorHints(current => current.visitor === next.visitor && current['visitor-2'] === next['visitor-2'] ? current : next);
  }, [runtimes]);
  const cameraPoint = useRef({ x: 0, y: 0 });
  const updateTargetEdge = useCallback(() => {
    const goal = live.current.target;
    const next = libraryTargetEdge(goal ? stationPoint(goal) : null, cameraPoint.current, live.current.viewport, live.current.scale);
    // Do not rerender the world on every camera frame.
    if (next !== targetEdgeRef.current) { targetEdgeRef.current = next; setTargetEdge(next); }
  }, [stationPoint]);
  const syncCamera = useCallback(() => {
    const { scale: zoom, viewport: size } = live.current;
    const worldWidth = LIBRARY_ROOM.width * zoom; const worldHeight = LIBRARY_ROOM.height * zoom;
    const x = worldWidth <= size.width ? (size.width - worldWidth) / 2 : Math.max(size.width - worldWidth, Math.min(0, size.width / 2 - position.current.x * zoom));
    const usableHeight = Math.max(240, size.height - 190);
    // Leave room for the task card above and the shared controls below the actor.
    // On portrait phones, frame wall labels below the task card when standing
    // at its interaction point. Side controls leave the middle clear; reserve
    // 128px below the feet for the central toolbar even on a 568px-tall phone.
    const focusY = size.width < 600 ? Math.min(size.height - 128, Math.max(445, usableHeight * 0.54)) : usableHeight * 0.54;
    const y = worldHeight <= usableHeight ? (usableHeight - worldHeight) / 2 : Math.max(usableHeight - worldHeight, Math.min(180, focusY - position.current.y * zoom));
    cameraPoint.current = { x, y }; camera.setValue({ x, y }); updateTargetEdge();
  }, [camera, updateTargetEdge]);
  const stop = useCallback(() => {
    vector.current = { x: 0, y: 0, running: false }; keys.current.clear(); route.current = []; destination.current = null; setTapTarget(null);
    if (poseRef.current.motion !== 'idle') { poseRef.current = { ...poseRef.current, motion: 'idle' }; setPose(poseRef.current); }
  }, []);
  useEffect(() => { syncCamera(); }, [viewport, scale, syncCamera]);
  useEffect(() => { updateTargetEdge(); }, [target, roster, updateTargetEdge]);
  useEffect(() => { if (locked) stop(); }, [locked, stop]);
  useEffect(() => stop(), [controlMode, stop]);
  useEffect(() => {
    for (const id of visitorIds) {
      const runtime = runtimes[id];
      const status = roster.find(visitor => visitor.id === id)?.status;
      if (runtime.status !== status) {
        if (status === 'escorting') {
          if (runtime.status === undefined) runtime.position = getLibraryFollowerResumePoint(position.current);
          runtime.follower = createLibraryFollower(runtime.position, position.current);
        } else {
          runtime.follower = null;
          if (status === undefined || status === 'waiting') runtime.position = { ...LIBRARY_VISITOR_SPAWNS[id] };
        }
        runtime.status = status;
        runtime.actor.setValue(runtime.position);
        runtime.depth.setValue(Math.round(runtime.position.y));
      }
    }
    setNearby(current => current && isLibraryVisitorStation(current) && !canTalkToVisitor(current) ? null : current);
    if (destination.current && isLibraryVisitorStation(destination.current) && !canTalkToVisitor(destination.current)) stop();
    updateVisitorHints();
  }, [roster, interactionEnabled, runtimes, canTalkToVisitor, updateVisitorHints, stop]);
  const navigate = useCallback((station: LibraryStation) => {
    if (live.current.locked || (isLibraryVisitorStation(station) && !canTalkToVisitor(station))) return;
    const next = stationPoint(station);
    setTapTarget(null);
    if (Math.hypot(next.x - position.current.x, next.y - position.current.y) <= 86) { stop(); live.current.onInteract(station); return; }
    // An escort already walks toward the player; do not chase its moving position.
    if (isLibraryVisitorStation(station) && live.current.roster.some(visitor => visitor.id === station && visitor.status === 'escorting')) return;
    if (live.current.controlMode !== 'touch') return;
    route.current = findLibraryPath(position.current, next); destination.current = route.current.length ? station : null;
  }, [stop, stationPoint, canTalkToVisitor]);
  const interactRef = useRef(() => {}); interactRef.current = () => { if (nearby && !live.current.locked) navigate(nearby); };
  useEffect(() => { if (navigationRequest) navigate(navigationRequest.station); }, [navigationRequest, navigate]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const down = (e: KeyboardEvent) => {
      const element = e.target as HTMLElement | null;
      if (live.current.locked || element?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'shift'].includes(key)) {
        e.preventDefault(); keys.current.add(key); route.current = []; destination.current = null; setTapTarget(null);
      } else if ((key === 'e' || key === ' ') && !e.repeat && !element?.closest('button, a, [role="button"]')) { e.preventDefault(); interactRef.current(); }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
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
            if (!route.current.length && destination.current) { const station = destination.current; stop(); if (!isLibraryVisitorStation(station) || canTalkToVisitor(station)) live.current.onInteract(station); }
            dx = 0; dy = 0;
          }
        }
        const length = Math.hypot(dx, dy);
        const next = length > 0.03 ? moveLibraryPlayer(position.current, dx / Math.max(1, length) * speed, dy / Math.max(1, length) * speed) : position.current;
        const movement = getAvatarMovement(position.current, next, poseRef.current.facing, running ? 'sprint' : 'walk');
        walkCycle.advance(movement.distance); position.current = next;
        if (movement.distance > 0) {
          actor.setValue(next);
          // zIndex must be an integer on web/native. Fractional foot coordinates
          // are valid for movement, but leave a stale stacking order in CSS.
          depth.setValue(Math.round(next.y));
          syncCamera();
        }
        if (movement.facing !== poseRef.current.facing || movement.motion !== poseRef.current.motion) { poseRef.current = { facing: movement.facing, motion: movement.motion }; setPose(poseRef.current); }
        for (const visitor of live.current.roster) {
          const runtime = runtimes[visitor.id];
          if (visitor.status === 'escorting' && runtime.follower) {
            runtime.position = advanceLibraryFollower(runtime.follower, next, 170 * elapsed * (running ? RUN_SPEED_MULTIPLIER : 1));
            runtime.actor.setValue(runtime.position);
            runtime.depth.setValue(Math.round(runtime.position.y));
          }
        }
        if (now - lastProximity > 90) {
          lastProximity = now;
          const options = (Object.keys(LIBRARY_STATIONS) as LibraryStation[]).filter(s => !isLibraryVisitorStation(s) || canTalkToVisitor(s))
            .map(s => ({ s, distance: Math.hypot(next.x - stationPoint(s).x, next.y - stationPoint(s).y) })).sort((a, b) => a.distance - b.distance);
          setNearby(options[0].distance < 86 ? options[0].s : null);
          updateVisitorHints();
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [actor, depth, runtimes, canTalkToVisitor, stationPoint, updateVisitorHints, stop, syncCamera, walkCycle]);
  return <View ref={viewportRef} testID="library-room" style={s.room} onLayout={e => { setViewport(e.nativeEvent.layout); viewportRef.current?.measureInWindow((x, y) => { viewportOrigin.current = { x, y }; }); }}>
    <Animated.View testID="library-camera" style={{ position: 'absolute', left: 0, top: 0, transform: camera.getTranslateTransform(), width: LIBRARY_ROOM.width * scale, height: LIBRARY_ROOM.height * scale }}>
      <View style={{ width: LIBRARY_ROOM.width, height: LIBRARY_ROOM.height, transform: [{ translateX: (LIBRARY_ROOM.width * scale - LIBRARY_ROOM.width) / 2 }, { translateY: (LIBRARY_ROOM.height * scale - LIBRARY_ROOM.height) / 2 }, { scale }] }}>
        <Pressable accessibilityLabel="도서관 바닥" style={StyleSheet.absoluteFill} onPress={e => {
          if (locked || controlMode !== 'touch') return;
          const { pageX, pageY, locationX, locationY } = e.nativeEvent;
          const p = Number.isFinite(pageX) && Number.isFinite(pageY)
            ? { x: (pageX - viewportOrigin.current.x - cameraPoint.current.x) / scale, y: (pageY - viewportOrigin.current.y - cameraPoint.current.y) / scale }
            : { x: locationX, y: locationY };
          route.current = findLibraryPath(position.current, p); destination.current = null; setTapTarget(route.current.length ? p : null);
        }}><RoomFloor /></Pressable>
        {tapTarget ? <View pointerEvents="none" accessibilityLabel="이동할 위치" style={{ position: 'absolute', left: tapTarget.x - 12, top: tapTarget.y - 6, width: 24, height: 12, borderWidth: 2, borderColor: '#849873', borderRadius: 14, backgroundColor: '#FDF9DC70', zIndex: 3 }} /> : null}
        <RoomFurniture onSelect={navigate} target={target} />
        {roster.map(visitor => <LibraryVisitorActor key={visitor.id} id={visitor.id} actor={runtimes[visitor.id].actor} depth={runtimes[visitor.id].depth} showHint={visitorHints[visitor.id]} reduceMotion={reduceMotion} canTalk={canTalkToVisitor(visitor.id)} onTalk={() => navigate(visitor.id)} />)}
        <Animated.View pointerEvents="none" accessibilityLabel="내 캐릭터" style={{ position: 'absolute', left: -64 * LIBRARY_PLAYER_SCALE, top: -186 * LIBRARY_PLAYER_SCALE, zIndex: depth, transform: actor.getTranslateTransform() }}>
          <DirectionalAvatar facing={pose.facing} motion={pose.motion} manifest={chibiPlayerAvatar} walkCycle={walkCycle} scale={LIBRARY_PLAYER_SCALE} reduceMotion={reduceMotion} />
        </Animated.View>
      </View>
    </Animated.View>
    {!locked && target && targetEdge ? <LibraryDirectionHint target={target} edge={targetEdge} viewport={viewport} interactive={controlMode === 'touch'} onPress={() => navigate(target)} /> : null}
    <GameControls controlMode={controlMode} locked={locked} reduceMotion={reduceMotion}
      runEnabled={runEnabled} onRunEnabledChange={setRunEnabled}
      onMoveStart={() => { route.current = []; destination.current = null; setTapTarget(null); }}
      onMove={input => { vector.current = input; }} onMoveEnd={stop}
      action={{ label: nearby ? LIBRARY_STATIONS[nearby].label : '이용하기', accessibilityLabel: nearby ? `${LIBRARY_STATIONS[nearby].label} 이용하기` : '가까이 이동해 주세요', icon: nearby ? LIBRARY_STATIONS[nearby].icon : 'hand-left', available: Boolean(nearby), onPress: () => nearby && navigate(nearby) }} />
  </View>;
}

const RoomFloor = memo(function RoomFloor() {
  return <View pointerEvents="none" style={s.floor}>
    {Array.from({ length: Math.ceil((LIBRARY_ROOM.height - LIBRARY_WALL_FLOOR_Y) / 39) }, (_, row) => <View key={row} style={{ position: 'absolute', left: 24, right: 24, top: LIBRARY_WALL_FLOOR_Y + row * 39, height: 39, backgroundColor: row % 3 === 0 ? '#E8D5B9' : '#ECDDC5', borderBottomWidth: 1, borderColor: '#D8C5AA' }}>
      {Array.from({ length: Math.ceil(LIBRARY_ROOM.width / 205) }, (_, col) => <View key={col} style={{ position: 'absolute', left: col * 205 + (row % 2 ? 90 : 0), width: 1, height: 39, backgroundColor: '#DDCAAF' }} />)}
    </View>)}
    <View style={s.backWall} />
    <View style={s.wallPanels}>{Array.from({ length: Math.ceil((LIBRARY_ROOM.width - 36) / 80) }, (_, i) => <View key={i} style={{ position: 'absolute', left: i * 80 + 10, top: 5, width: 66, height: 27, borderWidth: 1, borderColor: '#A7B09B', borderRadius: 3 }} />)}</View>
    <View style={s.wallRail} /><View style={s.leftWall} /><View style={s.rightWall} />
    {LIBRARY_SHELF_FIXTURES.filter(fixture => fixture.kind === 'wall').map(fixture => <View key={fixture.id}>
      <View style={{ position: 'absolute', left: fixture.x + 5, top: fixture.y + 7, width: fixture.width, height: fixture.height, borderRadius: 4, backgroundColor: '#62513B12' }} />
      <View style={{ position: 'absolute', left: fixture.x + 3, top: fixture.y + fixture.height - 5, width: fixture.width - 2, height: 13, borderRadius: 8, backgroundColor: '#66553D1C' }} />
    </View>)}
    {LIBRARY_WALL_WINDOWS.map(window => <Image key={window.id} source={libraryArt.archedWindow} resizeMode="contain" style={{ position: 'absolute', left: window.x, top: window.y, width: window.width, height: window.height }} />)}
    {[265, 1574].map(x => <View key={x} style={[s.sconce, { left: x }]}><View style={s.sconceStem} /><View style={s.sconceShade} /></View>)}
    <View style={s.wallClock}><View style={s.clockHour} /><View style={s.clockMinute} /><View style={s.clockCenter} /></View>
    <View style={s.computerCorner}><View style={s.runnerInset} /><Text style={s.computerLabel}>디지털 열람</Text></View>
    <View style={s.rug}><View style={s.rugInset} /><View style={s.rugMotif}><Ionicons name="leaf-outline" size={31} color="#A2AB8E" /></View></View>
    <View style={s.displayMat}><View style={s.runnerInset} /></View>
    <View style={s.rightReadingMat}><View style={s.runnerInset} /></View>
    <View style={s.deskMat}><View style={s.runnerInset} /></View>
    <View style={s.entranceRunner}>{[18, 29, 40, 129, 140, 151].map(y => <View key={y} style={{ position: 'absolute', left: 10, right: 10, top: y, height: 2, backgroundColor: '#B7BEA5' }} />)}</View>
    <View style={s.entryMat}><Text style={s.entryLabel}>출입문</Text><Ionicons name="arrow-down" size={23} color="#73816B" /></View>
    <View style={s.entryThreshold} />
    {[30, LIBRARY_ROOM.width - 84].map(x => <View key={x} style={[s.sideTrim, { left: x }]} />)}
  </View>;
});
const RoomFurniture = memo(function RoomFurniture({ onSelect, target }: { onSelect: (id: LibraryStation) => void; target: LibraryStation | null }) {
  return <>
    {LIBRARY_SHELF_FIXTURES.map(fixture => <View key={fixture.id} pointerEvents="box-none" style={{ position: 'absolute', left: fixture.x, top: fixture.y, width: fixture.width, height: fixture.height, zIndex: Math.round(fixture.y + fixture.height) }}>
      <Image accessible accessibilityLabel={fixture.kind === 'wall' ? '벽면 연결 서가' : '낮은 양면 서가'} source={libraryArt[fixture.art]} resizeMode="stretch" style={{ width: fixture.width, height: fixture.height }} />
      {LIBRARY_SHELVES.filter(shelf => shelf.fixtureId === fixture.id).map(shelf => {
        const category = getLibraryCategory(shelf.id);
        return <Pressable key={shelf.id} accessibilityRole="button" accessibilityLabel={`${category.callRange} 서가`} onPress={() => onSelect(shelf.id)} style={{ position: 'absolute', left: shelf.x - fixture.x, top: 0, width: shelf.width, height: shelf.height, zIndex: Math.round(shelf.y + shelf.height) }}>
          <View style={[s.sign, { top: shelf.labelTop }]}><View style={[s.shelfColor, { backgroundColor: category.color }]} /><Text style={s.shelfCode}>{category.callRange.slice(0, 3)}</Text><Text style={s.shelfTitle}>{category.label}</Text></View>
          {target === shelf.id ? <Marker /> : null}
        </Pressable>;
      })}
    </View>)}
    {LIBRARY_COMPUTERS.map((computer, index) => <Image key={`computer-${index}`} accessible accessibilityLabel={`PC 열람석 ${index + 1}`} source={libraryArt.computerDesk} resizeMode="contain" style={{ position: 'absolute', left: computer.x, top: computer.y, width: computer.width, height: computer.height, zIndex: computer.y + computer.height }} />)}
    <Pressable accessibilityRole="button" accessibilityLabel="사서에게 말 걸기" onPress={() => onSelect('librarian')} style={{ position: 'absolute', left: 300, top: 1088, width: 69, height: 105, zIndex: 1193 }}>
      <Image source={libraryArt.librarian} resizeMode="contain" style={{ width: 69, height: 105 }} />
      {target === 'librarian' && <Marker />}
    </Pressable>
    <View style={{ position: 'absolute', left: LIBRARY_COUNTER.x, top: LIBRARY_COUNTER.y, width: LIBRARY_COUNTER.width, height: LIBRARY_COUNTER.height, zIndex: LIBRARY_COUNTER.y + LIBRARY_COUNTER.height }}>
      <Image accessible accessibilityLabel="두 자리 안내 데스크" source={libraryArt.doubleDesk} resizeMode="contain" style={{ width: LIBRARY_COUNTER.width, height: LIBRARY_COUNTER.height }} />
      <Pressable accessibilityRole="button" accessibilityLabel="안내 데스크 이용" onPress={() => onSelect('librarian')} style={{ position: 'absolute', left: 0, width: '50%', height: '100%' }}><View style={s.deskSign}><Text style={s.signText}>안내</Text></View></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="내 자리에서 도서 검색" onPress={() => onSelect('catalog')} style={{ position: 'absolute', right: 0, width: '50%', height: '100%' }}><View style={s.deskSign}><Text style={s.signText}>도서 검색</Text></View></Pressable>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="반납 도서 카트" onPress={() => onSelect('cart')} style={{ position: 'absolute', left: 742, top: 1135, width: 105, height: 144, zIndex: 1242 }}>
      <Image source={libraryArt.cart} resizeMode="contain" style={{ width: 105, height: 110 }} /><View style={s.smallSign}><Text style={s.smallSignText}>반납 도서</Text></View>{target === 'cart' && <Marker />}
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="담당자 확인함" onPress={() => onSelect('handoff')} style={{ position: 'absolute', left: 634, top: 1250, width: 57, height: 69, zIndex: 1298 }}>
      <Image source={libraryArt.returnBox} resizeMode="contain" style={{ width: 57, height: 43 }} /><Text style={s.boxLabel}>확인함</Text>{target === 'handoff' && <Marker />}
    </Pressable>
    <Image accessible accessibilityLabel="중앙 독서 라운지" source={libraryArt.lounge} resizeMode="contain" style={{ position: 'absolute', left: LIBRARY_LOUNGE.x, top: LIBRARY_LOUNGE.y, width: LIBRARY_LOUNGE.width, height: LIBRARY_LOUNGE.height, zIndex: LIBRARY_LOUNGE.y + LIBRARY_LOUNGE.height }} />
    <Image source={libraryArt.table} resizeMode="contain" style={{ position: 'absolute', left: 1320, top: 1140, width: 150, height: 110, zIndex: 1250 }} />
    {LIBRARY_DECORATIONS.map(item => <View key={item.id} pointerEvents="none" style={{ position: 'absolute', left: item.x, top: item.y, width: item.width, height: item.height, zIndex: item.y + item.height }}><Image accessible accessibilityLabel={item.label} source={libraryArt[item.art]} resizeMode="contain" style={{ width: item.width, height: item.height }} /></View>)}
    <Pressable accessibilityRole="button" accessibilityLabel="도서관 출입문" onPress={() => onSelect('exit')} style={{ position: 'absolute', left: 410, top: 1440, width: 140, height: 70, zIndex: 5 }} />
  </>;
});
const LibraryVisitorActor = memo(function LibraryVisitorActor({ id, actor, depth, showHint, reduceMotion, canTalk, onTalk }: {
  id: LibraryVisitorStation; actor: Animated.ValueXY; depth: Animated.Value; showHint: boolean;
  reduceMotion: boolean; canTalk: boolean; onTalk: () => void;
}) {
  const hintOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    hintOpacity.setValue(1);
    if (reduceMotion || !showHint) return;
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(hintOpacity, { toValue: 0.84, duration: 1050, useNativeDriver: true }),
      Animated.timing(hintOpacity, { toValue: 1, duration: 1050, useNativeDriver: true }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, [showHint, reduceMotion, hintOpacity]);
  const label = id === 'visitor' ? '이용자' : '이용자 2';
  return <Animated.View testID={`library-${id}`} pointerEvents={canTalk ? 'box-none' : 'none'} style={{ position: 'absolute', left: -34, top: -105, width: 68, height: 105, transform: actor.getTranslateTransform(), zIndex: depth }}>
    <Pressable accessibilityRole={canTalk ? 'button' : undefined} accessibilityLabel={canTalk ? `${label}에게 말 걸기` : label} disabled={!canTalk} onPress={onTalk} style={StyleSheet.absoluteFill}>
      <Image source={id === 'visitor' ? villageNpcArt.jiyoung : villageNpcArt.minsu} resizeMode="contain" style={{ width: 68, height: 105 }} />
    </Pressable>
    {showHint && <Animated.View testID={`${id}-nearby-hint`} pointerEvents="none" style={[s.visitorRequest, { opacity: hintOpacity }]}>
      <Text style={s.visitorRequestText} numberOfLines={1}>이 책은...</Text>
      <View style={s.visitorRequestTail} />
    </Animated.View>}
  </Animated.View>;
});
function LibraryDirectionHint({ target, edge, viewport, interactive, onPress }: { target: LibraryStation; edge: LibraryTargetEdge; viewport: { width: number; height: number }; interactive: boolean; onPress: () => void }) {
  const names = { up: '위쪽', down: '아래쪽', left: '왼쪽', right: '오른쪽' };
  const arrows = { up: 'arrow-up', down: 'arrow-down', left: 'arrow-back', right: 'arrow-forward' } as const;
  const label = LIBRARY_STATIONS[target].label;
  const top = edge === 'up' ? Math.min(190, viewport.height * 0.3) : edge === 'down' ? viewport.height - 270 : Math.max(200, Math.min(viewport.height * 0.46, viewport.height - 270));
  const left = edge === 'left' ? 14 : edge === 'right' ? viewport.width - 158 : (viewport.width - 144) / 2;
  const content = <><Ionicons name={arrows[edge]} size={21} color="#526E53" /><Text style={s.directionText}>{label}</Text></>;
  return interactive ? <Pressable testID="library-target-edge" accessibilityRole="button" accessibilityLabel={`${names[edge]} ${label}까지 이동`} onPress={onPress} style={[s.directionHint, { left, top }]}>{content}</Pressable>
    : <View testID="library-target-edge" accessible accessibilityLabel={`${names[edge]} ${label}`} pointerEvents="none" style={[s.directionHint, { left, top }]}>{content}</View>;
}
function Marker() { return <View pointerEvents="none" style={s.marker}><Ionicons name="chevron-down" color="#607952" size={28} /></View>; }
const s = StyleSheet.create({
  directionHint: { position: 'absolute', width: 144, minHeight: 44, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 22, backgroundColor: '#FAF7EDEB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  directionText: { flexShrink: 1, fontFamily: fonts.laundryBold, fontSize: 17, color: '#526E53' },
  room: { flex: 1, backgroundColor: '#DDD8C8', overflow: 'hidden' }, floor: { width: LIBRARY_ROOM.width, height: LIBRARY_ROOM.height, backgroundColor: '#E9DCC7', overflow: 'hidden' },
  backWall: { position: 'absolute', left: 18, right: 18, top: 0, height: LIBRARY_WALL_FLOOR_Y, backgroundColor: '#F4EDDC', borderTopWidth: 9, borderTopColor: '#D5BF9C' },
  wallPanels: { position: 'absolute', left: 18, right: 18, top: LIBRARY_WALL_FLOOR_Y - 48, height: 40, backgroundColor: '#BFC9AF', overflow: 'hidden', borderTopWidth: 4, borderTopColor: '#DBC8A7' },
  wallRail: { position: 'absolute', left: 18, right: 18, top: LIBRARY_WALL_FLOOR_Y - 13, height: 13, backgroundColor: '#B59A76', borderBottomWidth: 5, borderColor: '#917D61' },
  leftWall: { position: 'absolute', left: 12, top: 20, bottom: 20, width: 15, backgroundColor: '#B8C2A9', borderRightWidth: 4, borderRightColor: '#98876D' }, rightWall: { position: 'absolute', right: 12, top: 20, bottom: 20, width: 15, backgroundColor: '#B8C2A9', borderLeftWidth: 4, borderLeftColor: '#98876D' },
  sconce: { position: 'absolute', top: 86, width: 26, height: 42 }, sconceStem: { position: 'absolute', left: 11, top: 14, width: 5, height: 28, borderRadius: 3, backgroundColor: '#A18B69' }, sconceShade: { width: 26, height: 22, borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomLeftRadius: 5, borderBottomRightRadius: 5, backgroundColor: '#F3DDB0', borderBottomWidth: 3, borderBottomColor: '#C4AA7C' },
  wallClock: { position: 'absolute', left: 506, top: 50, width: 58, height: 58, borderRadius: 29, borderWidth: 5, borderColor: '#B4946C', backgroundColor: '#FAF5E7' }, clockHour: { position: 'absolute', left: 23, top: 12, width: 3, height: 13, borderRadius: 2, backgroundColor: '#7C8067' }, clockMinute: { position: 'absolute', left: 23, top: 23, width: 17, height: 3, borderRadius: 2, backgroundColor: '#7C8067' }, clockCenter: { position: 'absolute', left: 21, top: 21, width: 7, height: 7, borderRadius: 4, backgroundColor: '#7C8067' },
  runnerInset: { position: 'absolute', left: 9, top: 9, right: 9, bottom: 9, borderRadius: 29, borderWidth: 1, borderColor: '#FAF5E366' },
  computerCorner: { position: 'absolute', left: 1208, top: 527, width: 402, height: 265, borderRadius: 32, backgroundColor: '#D6DEC8' }, computerLabel: { fontFamily: fonts.laundryBold, color: '#697860', fontSize: 18, textAlign: 'center', marginTop: 13 },
  rug: { position: 'absolute', left: 641, top: 832, width: 490, height: 288, borderRadius: 128, backgroundColor: '#CCD4B8' }, rugInset: { position: 'absolute', left: 12, right: 12, top: 12, bottom: 12, borderRadius: 120, borderWidth: 2, borderColor: '#E7E9D9' }, rugMotif: { position: 'absolute', left: 218, bottom: 22, opacity: 0.7 },
  displayMat: { position: 'absolute', left: 298, top: 880, width: 280, height: 153, borderRadius: 72, backgroundColor: '#DDBFA3' },
  rightReadingMat: { position: 'absolute', left: 1170, top: 862, width: 260, height: 182, borderRadius: 85, backgroundColor: '#E2CCAE' },
  deskMat: { position: 'absolute', left: 225, top: 1156, width: 657, height: 199, borderRadius: 39, backgroundColor: '#DBD3BB' },
  entranceRunner: { position: 'absolute', left: 396, top: 1342, width: 169, height: 168, borderRadius: 24, backgroundColor: '#D0D6BD' },
  entryMat: { position: 'absolute', left: 410, top: 1440, width: 140, height: 70, borderRadius: 18, backgroundColor: '#D0D6BD', alignItems: 'center', justifyContent: 'center' }, entryLabel: { fontFamily: fonts.laundryBold, fontSize: 19, color: '#68745B' },
  entryThreshold: { position: 'absolute', left: 394, top: 1508, width: 172, height: 12, backgroundColor: '#AE9876', borderTopWidth: 3, borderTopColor: '#F2E4CA' },
  sideTrim: { position: 'absolute', top: LIBRARY_WALL_FLOOR_Y, bottom: 20, width: 52, borderRadius: 18, backgroundColor: '#BFA78418' },
  sign: { position: 'absolute', alignSelf: 'center', minWidth: 126, maxWidth: 182, height: 29, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 4, backgroundColor: '#F8EED8', borderWidth: 1.5, borderColor: '#967A57' },
  shelfColor: { width: 4, height: 17, borderRadius: 2 }, shelfCode: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 23, color: '#655D4B' }, shelfTitle: { fontFamily: fonts.laundryBold, fontSize: 18, lineHeight: 23, color: '#655D4B' },
  signText: { fontFamily: fonts.laundryBold, fontSize: 18, lineHeight: 24, color: '#5F6252', textAlign: 'center' }, smallSign: { alignSelf: 'center', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F6F0DE', marginTop: 2 }, smallSignText: { fontFamily: fonts.laundryBold, fontSize: 16, color: '#5F6252', textAlign: 'center' }, deskSign: { position: 'absolute', bottom: 18, left: 53, paddingHorizontal: 18, paddingVertical: 4, borderRadius: 7, backgroundColor: '#EDE9D7' },
  marker: { position: 'absolute', top: -26, left: '50%', marginLeft: -14 }, boxLabel: { fontFamily: fonts.laundryBold, fontSize: 15, color: '#736650', textAlign: 'center', marginTop: 2 },
  visitorRequest: { position: 'absolute', bottom: 112, left: -22, width: 112, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 15, backgroundColor: '#FCF9EE', shadowColor: '#55482E', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.09, shadowRadius: 7, elevation: 2 },
  visitorRequestText: { fontFamily: fonts.laundryBold, fontSize: 17, lineHeight: 23, color: '#52674F', textAlign: 'center' },
  visitorRequestTail: { position: 'absolute', bottom: -5, left: 51, width: 11, height: 11, backgroundColor: '#FCF9EE', transform: [{ rotate: '45deg' }] },
});
