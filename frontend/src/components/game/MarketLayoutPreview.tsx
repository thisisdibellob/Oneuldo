import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, AppState, BackHandler, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { createAvatarWalkCycle, getAvatarMovement, type AvatarFacing, type AvatarMotion } from '../../game/avatarAnimation';
import { chibiPlayerAvatar } from '../../game/chibiPlayerAvatar';
import { useGamePreferences } from '../../game/gamePreferences';
import { getMarketRenderDepth, isMarketEnvironmentBlocked, MARKET_ENVIRONMENT_PLAYER_RADIUS, type MarketEnvironment } from '../../game/marketEnvironment';
import { MARKET_INTERIOR_THEME_OPTIONS, type MarketInteriorThemeId } from '../../game/marketInteriorThemes';
import { getMarketPersonFrame } from '../../game/marketPersonLayout';
import { RUN_SPEED_MULTIPLIER, type GameMovementInput } from '../../game/movementControls';
import { marketCategories } from '../../game/scenarios';
import { getWorldCameraFrame, MARKET_DEFAULT_ZOOM } from '../../game/worldZoom';
import { fonts } from '../../theme';
import { PressScale } from '../PressScale';
import { DirectionalAvatar } from './DirectionalAvatar';
import { GameControls } from './GameControls';
import { MarketCheckoutFixture, MarketEnvironmentObjects, MarketExitMarker, MarketInteriorBackdrop, MarketKioskFixture, MarketPersonFixture, MarketShelfTarget } from './MarketInteriorLayer';
import { useMarketReducedMotion } from './MarketPanelTransition';
import { MarketThemePreviewContext } from './MarketThemePreviewContext';

type Point = { x: number; y: number };
type PreviewMode = 'overview' | 'walk';
type Props = { environment: MarketEnvironment; onClose: () => void; initialMode?: PreviewMode };
const SPEED = 190;
const STILL: GameMovementInput = { x: 0, y: 0, running: false };
const KEY_DIRECTIONS: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
};
const PHYSICAL_KEYS: Record<string, string> = { KeyW: 'w', KeyS: 's', KeyA: 'a', KeyD: 'd' };

/** Uses the live market's footprint and small axis steps, including cashier/NPC collision. */
export function moveMarketPreviewPoint(environment: MarketEnvironment, point: Point, dx: number, dy: number): Point {
  let next = { ...point };
  const radius = MARKET_ENVIRONMENT_PLAYER_RADIUS;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
  for (let index = 0; index < steps; index++) {
    const candidateX = { x: Math.max(radius, Math.min(next.x + dx / steps, environment.world.width - radius)), y: next.y };
    if (!isMarketEnvironmentBlocked(environment, candidateX)) next = candidateX;
    const candidateY = { x: next.x, y: Math.max(radius, Math.min(next.y + dy / steps, environment.world.height - radius)) };
    if (!isMarketEnvironmentBlocked(environment, candidateY)) next = candidateY;
  }
  return next;
}

/** The same fixtures/art/depth rules as the game, deliberately without commerce callbacks. */
const PreviewFixtures = memo(function PreviewFixtures({ environment }: { environment: MarketEnvironment }) {
  return <>
    <MarketInteriorBackdrop environment={environment} />
    <MarketEnvironmentObjects environment={environment} />
    {[...environment.employees, ...environment.customers].map(person => <View key={person.id}
      style={{ position: 'absolute', ...getMarketPersonFrame(person.point), zIndex: getMarketRenderDepth(person.point.y) }}>
      <MarketPersonFixture person={person} />
    </View>)}
    {environment.checkouts.map((counter, index) => counter.kind === 'kiosk' ? null : <View key={counter.id}
      style={{ position: 'absolute', left: counter.rect.x, top: counter.rect.y, width: counter.rect.width, height: counter.rect.height,
        zIndex: getMarketRenderDepth(counter.rect.y + counter.rect.height) }}>
      <MarketCheckoutFixture counter={counter} index={index} cashierPresent={counter.cashierPresent} active={false} />
    </View>)}
    {(environment.kiosks ?? []).map(kiosk => <View key={kiosk.id}
      style={{ position: 'absolute', left: kiosk.rect.x, top: kiosk.rect.y, width: kiosk.rect.width, height: kiosk.rect.height,
        zIndex: getMarketRenderDepth(kiosk.rect.y + kiosk.rect.height) }}>
      <MarketKioskFixture kiosk={kiosk} />
    </View>)}
    {marketCategories.map(category => <MarketShelfTarget key={category.id} placement={environment.shelves[category.id]}
      categoryId={category.id} active={false} disabled accessibilityLabel={`${category.label} 진열대`} onPress={() => {}} />)}
    {(['entrance', 'exit'] as const).map(station => <View key={station}
      style={{ position: 'absolute', left: environment.stations[station].x - 64, top: environment.stations[station].y + 24, width: 128, height: 46 }}>
      <MarketExitMarker kind={station} active={false} blocked={environment.constructionZones?.some(zone => zone.gateId === station)} />
    </View>)}
    {environment.commonDoor && <View style={{ position: 'absolute', left: environment.commonDoor.point.x - 64,
      top: environment.commonDoor.point.y - 54, width: 128, height: 46 }}><MarketExitMarker kind="common-door" active={false} /></View>}
  </>;
});

/** This sandbox owns only view/locomotion state. It cannot dispatch market-session actions. */
export function MarketLayoutPreview({ environment, onClose, initialMode = 'overview' }: Props) {
  const insets = useContext(SafeAreaInsetsContext);
  const { preferences } = useGamePreferences();
  const reducedMotion = useMarketReducedMotion();
  const [mode, setMode] = useState<PreviewMode>(initialMode);
  const [theme, setTheme] = useState<MarketInteriorThemeId>(preferences.marketInteriorTheme);
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [runEnabled, setRunEnabled] = useState(false);
  const [pose, setPose] = useState<{ facing: AvatarFacing; motion: AvatarMotion }>({ facing: 'front', motion: 'idle' });
  const [walkCycle] = useState(createAvatarWalkCycle);
  const player = useRef<Point>({ ...environment.spawn });
  const playerPosition = useRef(new Animated.ValueXY(environment.spawn)).current;
  const depth = useRef(new Animated.Value(getMarketRenderDepth(environment.spawn.y))).current;
  const camera = useRef(new Animated.ValueXY()).current;
  const facing = useRef<AvatarFacing>('front');
  const frame = useRef<number | null>(null);
  const previousTime = useRef<number | null>(null);
  const held = useRef(new Set<string>());
  const shift = useRef(false);
  const stick = useRef<GameMovementInput>(STILL);
  const active = useRef(true);
  const live = useRef({ environment, mode, size, runEnabled, runMode: preferences.runMode });
  live.current = { environment, mode, size, runEnabled, runMode: preferences.runMode };

  const placePlayer = useCallback((point: Point) => {
    player.current = point;
    const current = live.current;
    playerPosition.setValue(point);
    depth.setValue(getMarketRenderDepth(point.y));
    camera.setValue(getWorldCameraFrame(point, current.size, MARKET_DEFAULT_ZOOM, current.environment.world).translation);
  }, [camera, depth, playerPosition]);
  const stop = useCallback(() => {
    held.current.clear(); shift.current = false; stick.current = STILL;
    previousTime.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (active.current) setPose(current => current.motion === 'idle' ? current : { ...current, motion: 'idle' });
  }, []);
  const move = useCallback((dx: number, dy: number, running: boolean) => {
    const next = moveMarketPreviewPoint(live.current.environment, player.current, dx, dy);
    const movement = getAvatarMovement(player.current, next, facing.current, running ? 'sprint' : 'walk');
    facing.current = movement.facing;
    walkCycle.advance(movement.distance);
    setPose(current => current.facing === movement.facing && current.motion === movement.motion ? current
      : { facing: movement.facing, motion: movement.motion });
    placePlayer(next);
  }, [placePlayer, walkCycle]);
  const tick = useRef((_timestamp: number) => {});
  tick.current = timestamp => {
    frame.current = null;
    if (!active.current || live.current.mode !== 'walk') return;
    const dt = Math.min(32, Math.max(0, timestamp - (previousTime.current ?? timestamp))) / 1000;
    previousTime.current = timestamp;
    let x = stick.current.x, y = stick.current.y;
    held.current.forEach(key => { x += KEY_DIRECTIONS[key].x; y += KEY_DIRECTIONS[key].y; });
    const length = Math.max(1, Math.hypot(x, y));
    const running = held.current.size ? shift.current || (live.current.runMode === 'toggle' && live.current.runEnabled) : stick.current.running;
    const step = SPEED * dt * (running ? RUN_SPEED_MULTIPLIER : 1);
    if (x || y) move(x / length * step, y / length * step, running);
    else setPose(current => current.motion === 'idle' ? current : { ...current, motion: 'idle' });
    if (held.current.size || stick.current.x || stick.current.y) frame.current = requestAnimationFrame(time => tick.current(time));
    else previousTime.current = null;
  };
  const begin = useCallback(() => {
    if (frame.current === null && live.current.mode === 'walk') frame.current = requestAnimationFrame(time => tick.current(time));
  }, []);
  const close = useCallback(() => { stop(); onClose(); }, [onClose, stop]);
  const changeMode = useCallback((next: PreviewMode) => {
    stop(); live.current.mode = next; setMode(next);
  }, [stop]);
  const resetPlayer = () => { stop(); placePlayer({ ...environment.spawn }); };

  useEffect(() => { placePlayer(player.current); }, [size, mode, placePlayer]);
  useEffect(() => {
    active.current = true;
    const appState = AppState.addEventListener('change', state => { if (state !== 'active') stop(); });
    return () => { active.current = false; stop(); appState.remove(); };
  }, [stop]);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => back.remove();
  }, [close]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const name = (event: KeyboardEvent) => PHYSICAL_KEYS[event.code] ?? (event.key.length === 1 ? event.key.toLowerCase() : event.key);
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.altKey || event.ctrlKey || event.metaKey || target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(target?.tagName ?? '')) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (live.current.mode !== 'walk') return;
      const key = name(event);
      if (key === 'Shift') { shift.current = true; return; }
      if (!KEY_DIRECTIONS[key]) return;
      event.preventDefault(); shift.current = event.shiftKey; held.current.add(key); begin();
    };
    const up = (event: KeyboardEvent) => {
      const key = name(event);
      if (key === 'Shift') { shift.current = event.shiftKey === true; return; }
      held.current.delete(key);
      if (!held.current.size && !stick.current.x && !stick.current.y) stop();
    };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', stop);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', stop); stop(); };
  }, [begin, close, stop]);

  const fit = Math.min(size.width / environment.world.width, size.height / environment.world.height);
  const scale = Math.max(0.01, fit * zoom);
  const worldSize = { width: environment.world.width, height: environment.world.height };
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize(current => current.width === width && current.height === height ? current : { width, height });
  };
  const art = <PreviewFixtures environment={environment} />;
  return <View style={[s.overlay, { paddingTop: insets?.top ?? 0, paddingBottom: insets?.bottom ?? 0 }]} accessibilityViewIsModal testID="market-layout-preview">
    <View style={s.header}>
      <PressScale accessibilityRole="button" accessibilityLabel="편집으로 돌아가기" onPress={close} style={s.back}>
        <Ionicons name="arrow-back" size={21} color="#435D4D" /><Text style={s.backText}>편집으로 돌아가기</Text>
      </PressScale>
      <Text accessibilityRole="header" style={s.title}>{mode === 'walk' ? '걸어보기' : '실제 모습'}</Text>
    </View>
    <View style={s.toolbar}>
      <View style={s.themes}>{MARKET_INTERIOR_THEME_OPTIONS.map(option => <PressScale key={option.id} accessibilityRole="button"
        accessibilityLabel={`${option.label} 미리보기`} accessibilityState={{ selected: theme === option.id }} onPress={() => setTheme(option.id)}
        style={[s.pill, theme === option.id && s.selected]}><Text style={[s.pillText, theme === option.id && s.selectedText]}>{option.label}</Text></PressScale>)}</View>
      <PressScale accessibilityRole="button" onPress={() => changeMode(mode === 'overview' ? 'walk' : 'overview')}
        accessibilityLabel={mode === 'overview' ? '여기서 걸어보기' : '전체 모습 보기'} style={s.walkButton}>
        <Ionicons name={mode === 'overview' ? 'footsteps' : 'scan-outline'} size={18} color="#FFFFFF" />
        <Text style={s.walkText}>{mode === 'overview' ? '여기서 걸어보기' : '전체 보기'}</Text>
      </PressScale>
    </View>
    <MarketThemePreviewContext.Provider value={theme}>
      <View style={s.viewport} onLayout={onLayout} testID="market-preview-viewport">
        {mode === 'overview' ? <ScrollView nestedScrollEnabled contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <ScrollView horizontal nestedScrollEnabled contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <View style={{ width: worldSize.width * scale, height: worldSize.height * scale }}>
              <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                style={[s.world, worldSize, { left: (worldSize.width * scale - worldSize.width) / 2,
                  top: (worldSize.height * scale - worldSize.height) / 2, transform: [{ scale }] }]}>{art}</View>
            </View>
          </ScrollView>
        </ScrollView> : <>
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            style={[StyleSheet.absoluteFill, { transform: [{ scale: MARKET_DEFAULT_ZOOM }] }]}>
            <Animated.View style={[s.world, worldSize, { transform: camera.getTranslateTransform() }]} testID="market-preview-world">
              {art}
              <Animated.View testID="market-preview-player" style={[s.player, { transform: playerPosition.getTranslateTransform(), zIndex: depth }]}>
                <DirectionalAvatar facing={pose.facing} manifest={chibiPlayerAvatar} motion={pose.motion} walkCycle={walkCycle} reduceMotion={reducedMotion} scale={0.5} />
              </Animated.View>
            </Animated.View>
          </View>
          <GameControls controlMode="joystick" locked={false} action={{ label: '입구로', icon: 'locate', available: true,
            accessibilityLabel: '미리보기 캐릭터를 입구로 이동', onPress: resetPlayer }}
            onMove={input => { stick.current = input; begin(); }} onMoveEnd={() => { stick.current = STILL; if (!held.current.size) stop(); }}
            onAccessibilityMove={name => { stop(); const delta = { moveUp: { x: 0, y: -24 }, moveDown: { x: 0, y: 24 }, moveLeft: { x: -24, y: 0 }, moveRight: { x: 24, y: 0 } }[name];
              if (delta) { move(delta.x, delta.y, false); setPose(current => ({ ...current, motion: 'idle' })); } }}
            runEnabled={runEnabled} onRunEnabledChange={setRunEnabled} reduceMotion={reducedMotion} />
        </>}
        {mode === 'overview' && <View style={s.zoom}>
          <PressScale accessibilityRole="button" accessibilityLabel="미리보기 축소" disabled={zoom <= 1} onPress={() => setZoom(value => Math.max(1, value - 0.5))} style={s.zoomButton}>
            <Ionicons name="remove" size={22} color={zoom <= 1 ? '#BBC2B6' : '#435D4D'} /></PressScale>
          <PressScale accessibilityRole="button" accessibilityLabel="미리보기 전체 맞춤" onPress={() => setZoom(1)} style={s.zoomReset}><Text style={s.pillText}>{Math.round(zoom * 100)}%</Text></PressScale>
          <PressScale accessibilityRole="button" accessibilityLabel="미리보기 확대" disabled={zoom >= 3} onPress={() => setZoom(value => Math.min(3, value + 0.5))} style={s.zoomButton}>
            <Ionicons name="add" size={22} color={zoom >= 3 ? '#BBC2B6' : '#435D4D'} /></PressScale>
        </View>}
      </View>
    </MarketThemePreviewContext.Provider>
    <Text style={s.hint}>{mode === 'overview' ? '확대한 뒤 화면을 밀어 구석까지 확인해요.'
      : Platform.OS === 'web' ? 'WASD / 방향키 이동 · Shift 달리기 · 장보기 진행은 유지돼요.' : '패드로 통로를 확인해요. 장보기 진행은 유지돼요.'}</Text>
  </View>;
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: '#F8F5EB', zIndex: 1000, elevation: 30 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingRight: 8 },
  backText: { fontFamily: fonts.laundryBold, fontSize: 16, color: '#435D4D' },
  title: { fontFamily: fonts.laundryBold, fontSize: 20, color: '#435D4D' },
  toolbar: { paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' },
  themes: { flexDirection: 'row', backgroundColor: '#E9EBDD', borderRadius: 16, padding: 3 },
  pill: { minHeight: 40, paddingHorizontal: 12, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: '#FFFDF5' },
  pillText: { fontFamily: fonts.laundryBold, fontSize: 15, color: '#6E7969' },
  selectedText: { color: '#385B45' },
  walkButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 15, backgroundColor: '#52785F', flexDirection: 'row', alignItems: 'center', gap: 7 },
  walkText: { fontFamily: fonts.laundryBold, fontSize: 16, color: '#FFFFFF' },
  viewport: { flex: 1, minHeight: 180, position: 'relative', overflow: 'hidden', backgroundColor: '#D2D1C2' },
  world: { position: 'absolute', left: 0, top: 0 },
  player: { position: 'absolute', left: 0, top: 0, width: 64, height: 96, marginLeft: -32, marginTop: -93, alignItems: 'center', justifyContent: 'center' },
  zoom: { position: 'absolute', bottom: 14, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFCF4', borderRadius: 18, padding: 3 },
  zoomButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  zoomReset: { minWidth: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { color: '#6A7466', fontSize: 14, fontFamily: fonts.medium, textAlign: 'center', paddingHorizontal: 14, paddingVertical: 12 },
});
