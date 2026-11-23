import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts } from '../../theme';
import { cafeArt } from '../../game/cafeArt';
import { libraryArt } from '../../game/libraryArt';
import { villageNpcArt } from '../../game/villageNpcArt';
import { chibiPlayerAvatar } from '../../game/chibiPlayerAvatar';
import { useInteriorMovement, type InteriorMovementWorld } from '../../game/useInteriorMovement';
import { CAFE_COUNTER, CAFE_COWORKER, CAFE_CUSTOMER, CAFE_PLANTS, CAFE_PLAYER_SCALE, CAFE_ROOM, CAFE_SHELF, CAFE_SPAWN, CAFE_STATIONS, CAFE_TABLES, CAFE_VIEW_SCALE, CAFE_WALL_FLOOR_Y, CAFE_WINDOWS, cafeTargetEdge, findCafePath, moveCafePlayer, type CafeGuestId, type CafeStation, type CafeTargetEdge } from '../../game/cafeWorld';
import { DirectionalAvatar } from './DirectionalAvatar';
import { GameControls } from './GameControls';

export type CafeRoomProps = {
  locked: boolean;
  controlMode: 'joystick' | 'touch';
  onInteract: (station: CafeStation) => void;
  reduceMotion: boolean;
  target: CafeStation | null;
  guestId?: CafeGuestId;
  guestPresent?: boolean;
  guestPhase?: 'waiting' | 'served' | 'leaving';
  carrying?: boolean;
  tableDirty?: boolean;
  navigationRequest?: { id: number; station: CafeStation };
};

const cafeMovementWorld: InteriorMovementWorld<CafeStation> = { room: CAFE_ROOM, spawn: CAFE_SPAWN, viewScale: CAFE_VIEW_SCALE, stations: CAFE_STATIONS, movePlayer: moveCafePlayer, findPath: findCafePath, targetEdge: cafeTargetEdge };

/** The same foot-based movement/camera pipeline as LibraryRoom. Opening a task
 * panel stops input without remounting, teleporting, or restarting the avatar. */
export function CafeRoom({ locked, controlMode, onInteract, reduceMotion, target, guestId = 'minsu', guestPresent = true, guestPhase = 'waiting', carrying = false, tableDirty = false, navigationRequest }: CafeRoomProps) {
  const isAvailable = useCallback((station: CafeStation) => station !== 'customer' || (guestPresent && guestPhase !== 'leaving'), [guestPresent, guestPhase]);
  const { viewport, viewportRef, onLayout, onFloorPress, tapTarget, actor, camera, depth, pose, walkCycle, nearby, targetEdge, navigate, runEnabled, setRunEnabled, onMoveStart, onMove, stop } = useInteriorMovement({ world: cafeMovementWorld, locked, controlMode, onInteract, target, navigationRequest, isAvailable });

  return <View testID="cafe-room" ref={viewportRef} style={s.room} onLayout={onLayout}>
    <Animated.View testID="cafe-camera" style={{ position: 'absolute', left: 0, top: 0, width: CAFE_ROOM.width, height: CAFE_ROOM.height, transform: camera.getTranslateTransform() }}>
      <Pressable accessibilityLabel="카페 바닥" style={StyleSheet.absoluteFill} onPress={onFloorPress}><CafeFloor /></Pressable>
      {tapTarget && <View pointerEvents="none" accessibilityLabel="이동할 위치" style={[s.tapMarker, { left: tapTarget.x - 12, top: tapTarget.y - 6 }]} />}
      <CafeFurniture onSelect={navigate} target={target} tableDirty={tableDirty} />
      {guestPresent && <CafeGuest guestId={guestId} phase={guestPhase} target={target === 'customer'} onSelect={() => navigate('customer')} reduceMotion={reduceMotion} />}
      <Animated.View testID="cafe-player" pointerEvents="none" accessibilityLabel="내 캐릭터" style={{ position: 'absolute', left: -64 * CAFE_PLAYER_SCALE, top: -186 * CAFE_PLAYER_SCALE, transform: actor.getTranslateTransform(), zIndex: depth }}>
        <DirectionalAvatar facing={pose.facing} motion={pose.motion} manifest={chibiPlayerAvatar} walkCycle={walkCycle} scale={CAFE_PLAYER_SCALE} reduceMotion={reduceMotion} />
        {carrying && <View accessible accessibilityLabel="완성한 음료를 들고 있어요" style={s.carriedTray}><View style={s.carriedCup} /><View style={s.trayRim} /></View>}
      </Animated.View>
    </Animated.View>
    {!locked && target && targetEdge && <CafeDirectionHint target={target} edge={targetEdge} viewport={viewport} interactive={controlMode === 'touch'} onPress={() => navigate(target)} />}
    <GameControls controlMode={controlMode} locked={locked} reduceMotion={reduceMotion} runEnabled={runEnabled} onRunEnabledChange={setRunEnabled}
      onMoveStart={onMoveStart} onMove={onMove} onMoveEnd={stop}
      action={{ label: nearby ? CAFE_STATIONS[nearby].label : '이용하기', accessibilityLabel: nearby ? `${CAFE_STATIONS[nearby].label} 이용하기` : '가까이 이동해 주세요', icon: nearby ? CAFE_STATIONS[nearby].icon : 'hand-left', available: Boolean(nearby), onPress: () => nearby && navigate(nearby) }} />
  </View>;
}

const CafeFloor = memo(function CafeFloor() {
  return <View pointerEvents="none" style={s.floor}>
    {Array.from({ length: Math.ceil((CAFE_ROOM.height - CAFE_WALL_FLOOR_Y) / 44) }, (_, row) => <View key={row} style={{ position: 'absolute', left: 24, right: 24, top: CAFE_WALL_FLOOR_Y + row * 44, height: 44, backgroundColor: ['#E7D1B4', '#EBD8BC', '#E9D4B7'][row % 3], borderBottomWidth: 1, borderColor: '#CDB28F70' }}>
      {Array.from({ length: 7 }, (_, col) => <View key={col} style={{ position: 'absolute', left: col * 210 + (row % 2 ? 105 : 0), width: 1, height: 44, backgroundColor: '#CDB28F55' }} />)}
    </View>)}
    <View style={s.wall} /><View style={s.wallPanels}>{Array.from({ length: 17 }, (_, index) => <View key={index} style={{ position: 'absolute', left: index * 78 + 8, top: 8, width: 63, height: 35, borderRadius: 3, borderWidth: 1, borderColor: '#9FA98B' }} />)}</View><View style={s.wallRail} />
    <View style={[s.sideWall, { left: 12 }]} /><View style={[s.sideWall, { right: 12 }]} />
    {CAFE_WINDOWS.map(window => <Image key={window.x} source={libraryArt.archedWindow} resizeMode="contain" style={{ position: 'absolute', left: window.x, top: window.y, width: window.width, height: window.height }} />)}
    <Image source={cafeArt.shelf} resizeMode="contain" style={{ position: 'absolute', left: CAFE_SHELF.x, top: CAFE_SHELF.y, width: CAFE_SHELF.width, height: CAFE_SHELF.height }} />
    <View style={s.wallSign}><Ionicons name="cafe" color="#F4E5C8" size={30} /><Text style={s.wallSignText}>느티 카페</Text></View>
    {[285, 655].map(x => <View key={x} style={[s.pendant, { left: x }]}><View style={s.pendantCord} /><View style={s.pendantShade} /><View style={s.pendantLight} /></View>)}
    {CAFE_WINDOWS.slice(1).map(window => <LinearGradient key={window.x} colors={['#FFF5CD45', '#FFF5CD00']} style={{ position: 'absolute', left: window.x - 30, top: CAFE_WALL_FLOOR_Y, width: 235, height: 280, transform: [{ skewX: '-18deg' }] }} />)}
    <View style={s.counterMat}><View style={s.rugInset} /></View>
    <View style={s.guestRug}><View style={s.rugInset} /></View>
    <View style={s.loungeRug}><View style={s.rugInset} /></View>
    <View style={s.windowRug}><View style={s.rugInset} /></View>
    <View style={s.entranceMat}>{[18, 29, 40, 98, 109, 120].map(top => <View key={top} style={{ position: 'absolute', left: 10, right: 10, top, height: 2, backgroundColor: '#BCA38360' }} />)}<Text style={s.entranceText}>출입문</Text><Ionicons name="arrow-down" size={24} color="#7E6F55" /></View>
    <View style={s.threshold} />
  </View>;
});

const CafeFurniture = memo(function CafeFurniture({ onSelect, target, tableDirty }: { onSelect: (station: CafeStation) => void; target: CafeStation | null; tableDirty: boolean }) {
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="카페 동료에게 말 걸기" onPress={() => onSelect('coworker')} style={{ position: 'absolute', left: CAFE_COWORKER.x - 34, top: CAFE_COWORKER.y - 92, width: 68, height: 92, zIndex: CAFE_COWORKER.y }}>
      {/* This sprite is tightly trimmed; match the visible player, not its padded atlas cell. */}
      <Image source={cafeArt.coworker} resizeMode="contain" style={{ width: 68, height: 92 }} />{target === 'coworker' && <Marker />}
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="카페 음료 작업대" onPress={() => onSelect('brew')} style={{ position: 'absolute', left: CAFE_COUNTER.x, top: CAFE_COUNTER.y, width: CAFE_COUNTER.width, height: CAFE_COUNTER.height, zIndex: CAFE_COUNTER.y + CAFE_COUNTER.height }}>
      <Image accessible accessibilityLabel="커피 머신과 컵이 놓인 작업대" source={cafeArt.counter} resizeMode="contain" style={{ width: CAFE_COUNTER.width, height: CAFE_COUNTER.height }} />
      <View style={s.counterLabel}><Ionicons name="cafe" size={18} color="#6C6752" /><Text style={s.stationText}>음료 만들기</Text></View>
      {target === 'brew' && <Marker left={CAFE_STATIONS.brew.point.x - CAFE_COUNTER.x} />}
    </Pressable>
    {CAFE_TABLES.map(table => <View key={table.id} pointerEvents="box-none" style={{ position: 'absolute', left: table.x, top: table.y, width: table.width, height: table.height, zIndex: table.y + table.height }}>
      <Image accessible accessibilityLabel={table.id === 'service' ? '손님 테이블' : '카페 휴식 자리'} source={cafeArt.table} resizeMode="contain" style={{ width: table.width, height: table.height }} />
      {table.id === 'service' && <Pressable accessibilityRole="button" accessibilityLabel="손님 자리 정리하기" onPress={() => onSelect('table')} style={StyleSheet.absoluteFill}>
        {tableDirty && <View testID="cafe-dirty-table" pointerEvents="none" accessibilityLabel="다 마신 컵과 부스러기" style={s.usedPlace}><View style={s.cupRing} /><View style={s.usedCup} /><View style={[s.crumb, { left: 36, top: 27 }]} /><View style={[s.crumb, { left: 46, top: 24 }]} /><View style={[s.crumb, { left: 42, top: 33 }]} /></View>}
        {target === 'table' && <Marker />}
      </Pressable>}
    </View>)}
    {CAFE_PLANTS.map(plant => <Image key={plant.x} source={libraryArt.plantCluster} resizeMode="contain" style={{ position: 'absolute', left: plant.x, top: plant.y, width: plant.width, height: plant.height, zIndex: plant.y + plant.height }} />)}
    <Pressable accessibilityRole="button" accessibilityLabel="카페 출입문" onPress={() => onSelect('exit')} style={{ position: 'absolute', left: 560, top: 980, width: 160, height: 92, zIndex: 5 }}>{target === 'exit' && <Marker />}</Pressable>
  </>;
});

const CafeGuest = memo(function CafeGuest({ guestId, phase, target, onSelect, reduceMotion }: { guestId: CafeGuestId; phase: 'waiting' | 'served' | 'leaving'; target: boolean; onSelect: () => void; reduceMotion: boolean }) {
  const arrival = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) { arrival.setValue(phase === 'leaving' ? 0 : 1); return; }
    arrival.setValue(phase === 'leaving' ? 1 : 0);
    const animation = Animated.timing(arrival, { toValue: phase === 'leaving' ? 0 : 1, duration: phase === 'leaving' ? 380 : 320, useNativeDriver: true, isInteraction: false });
    animation.start(); return () => animation.stop();
  }, [guestId, phase, reduceMotion, arrival]);
  const name = { minsu: '민수', jiyoung: '지영', sujin: '수진' }[guestId];
  return <Animated.View testID="cafe-guest" style={{ position: 'absolute', left: CAFE_CUSTOMER.x - 35.2, top: CAFE_CUSTOMER.y - 102.3, width: 70.4, height: 105.6, zIndex: CAFE_CUSTOMER.y, opacity: arrival, transform: [{ translateY: arrival.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${name} 손님에게 말 걸기`} disabled={phase === 'leaving'} onPress={onSelect} style={StyleSheet.absoluteFill}>
      <View style={s.npcShadow} /><Image source={villageNpcArt[guestId]} resizeMode="contain" style={{ width: 70.4, height: 105.6 }} />
      {target && <Marker />}
      {phase === 'served' && <View style={s.thanks}><Ionicons name="heart" color="#BC7860" size={21} /></View>}
    </Pressable>
  </Animated.View>;
});

function CafeDirectionHint({ target, edge, viewport, interactive, onPress }: { target: CafeStation; edge: CafeTargetEdge; viewport: { width: number; height: number }; interactive: boolean; onPress: () => void }) {
  const names = { up: '위쪽', down: '아래쪽', left: '왼쪽', right: '오른쪽' }; const arrows = { up: 'arrow-up', down: 'arrow-down', left: 'arrow-back', right: 'arrow-forward' } as const;
  const label = CAFE_STATIONS[target].label;
  const top = edge === 'up' ? Math.min(190, viewport.height * 0.3) : edge === 'down' ? viewport.height - 270 : Math.max(200, Math.min(viewport.height * 0.46, viewport.height - 270));
  const left = edge === 'left' ? 14 : edge === 'right' ? viewport.width - 158 : (viewport.width - 144) / 2;
  const content = <><Ionicons name={arrows[edge]} size={21} color="#6F7358" /><Text style={s.directionText}>{label}</Text></>;
  return interactive ? <Pressable testID="cafe-target-edge" accessibilityRole="button" accessibilityLabel={`${names[edge]} ${label}까지 이동`} onPress={onPress} style={[s.directionHint, { left, top }]}>{content}</Pressable>
    : <View testID="cafe-target-edge" accessible accessibilityLabel={`${names[edge]} ${label}`} pointerEvents="none" style={[s.directionHint, { left, top }]}>{content}</View>;
}
function Marker({ left }: { left?: number }) { return <View pointerEvents="none" style={[s.marker, left !== undefined && { left }]}><Ionicons name="chevron-down" color="#6E7953" size={28} /></View>; }

const s = StyleSheet.create({
  room: { flex: 1, backgroundColor: '#CEC5AF', overflow: 'hidden' },
  floor: { width: CAFE_ROOM.width, height: CAFE_ROOM.height, backgroundColor: '#E9D4B7', overflow: 'hidden' },
  wall: { position: 'absolute', left: 18, right: 18, top: 0, height: CAFE_WALL_FLOOR_Y, backgroundColor: '#F5ECD8', borderTopWidth: 10, borderTopColor: '#CEB38E' },
  wallPanels: { position: 'absolute', left: 18, right: 18, top: CAFE_WALL_FLOOR_Y - 66, height: 55, backgroundColor: '#B6BE9F', borderTopWidth: 5, borderTopColor: '#D6C1A0', overflow: 'hidden' },
  wallRail: { position: 'absolute', left: 18, right: 18, top: CAFE_WALL_FLOOR_Y - 13, height: 13, backgroundColor: '#AD9070', borderBottomWidth: 4, borderBottomColor: '#90785B' },
  sideWall: { position: 'absolute', top: 0, bottom: 16, width: 14, backgroundColor: '#A89574', borderRightWidth: 4, borderRightColor: '#D3BE9E' },
  wallSign: { position: 'absolute', left: 630, top: 93, width: 140, height: 112, borderRadius: 60, backgroundColor: '#738166', alignItems: 'center', justifyContent: 'center', gap: 5 },
  wallSignText: { fontFamily: fonts.laundryBold, fontSize: 24, color: '#F7EDD7' },
  pendant: { position: 'absolute', top: 0, width: 58, height: 130 }, pendantCord: { position: 'absolute', top: 0, left: 28, width: 3, height: 77, backgroundColor: '#8B7A60' },
  pendantShade: { position: 'absolute', top: 72, left: 4, width: 50, height: 28, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, backgroundColor: '#B78C58', borderBottomWidth: 4, borderBottomColor: '#806949' }, pendantLight: { position: 'absolute', top: 100, left: 10, width: 38, height: 5, borderRadius: 5, backgroundColor: '#FFE8A7' },
  counterMat: { position: 'absolute', left: 205, top: 355, width: 490, height: 173, borderRadius: 30, backgroundColor: '#D2C5A3' },
  guestRug: { position: 'absolute', left: 820, top: 655, width: 310, height: 210, borderRadius: 95, backgroundColor: '#BEC6A5' },
  loungeRug: { position: 'absolute', left: 215, top: 700, width: 285, height: 180, borderRadius: 80, backgroundColor: '#D6B89B' },
  windowRug: { position: 'absolute', left: 1005, top: 405, width: 270, height: 155, borderRadius: 70, backgroundColor: '#D5C8A9' },
  rugInset: { position: 'absolute', left: 10, right: 10, top: 10, bottom: 10, borderWidth: 1.5, borderColor: '#F7EDCE66', borderRadius: 85 },
  entranceMat: { position: 'absolute', left: 550, top: 945, width: 180, height: 140, backgroundColor: '#D2BD99', borderRadius: 14, justifyContent: 'center', alignItems: 'center', gap: 6 }, entranceText: { fontFamily: fonts.laundryBold, fontSize: 19, color: '#7E6F55' },
  threshold: { position: 'absolute', left: 535, top: 1080, width: 210, height: 12, backgroundColor: '#A68A67', borderTopWidth: 3, borderTopColor: '#EFDBB8' },
  tapMarker: { position: 'absolute', width: 24, height: 12, borderWidth: 2, borderColor: '#849873', borderRadius: 14, backgroundColor: '#FDF9DC70', zIndex: 3 },
  counterLabel: { position: 'absolute', bottom: 23, right: 30, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 7, backgroundColor: '#F5ECD8', flexDirection: 'row', alignItems: 'center', gap: 7 }, stationText: { fontFamily: fonts.laundryBold, fontSize: 18, color: '#6C6752' },
  marker: { position: 'absolute', top: -32, left: '50%', marginLeft: -14 },
  usedPlace: { position: 'absolute', left: 75, top: 39, width: 64, height: 46 }, cupRing: { position: 'absolute', left: 6, top: 25, width: 23, height: 10, borderRadius: 12, borderWidth: 2, borderColor: '#A5764D55' }, usedCup: { position: 'absolute', left: 8, top: 5, width: 17, height: 24, borderTopWidth: 4, borderColor: '#956F4D', borderBottomLeftRadius: 5, borderBottomRightRadius: 5, backgroundColor: '#EDE6CF' }, crumb: { position: 'absolute', width: 4, height: 3, borderRadius: 2, backgroundColor: '#99724D' },
  npcShadow: { position: 'absolute', left: 8, bottom: 0, width: 54, height: 14, borderRadius: 28, backgroundColor: '#6C685122' },
  thanks: { position: 'absolute', left: 20, top: -33, width: 34, height: 31, borderRadius: 15, backgroundColor: '#FDF7E8', alignItems: 'center', justifyContent: 'center' },
  carriedTray: { position: 'absolute', left: 15, top: 61, width: 45, height: 19 }, carriedCup: { position: 'absolute', left: 19, top: -2, width: 11, height: 16, backgroundColor: '#E2B587', borderTopWidth: 3, borderTopColor: '#8C6146', borderRadius: 3 }, trayRim: { position: 'absolute', left: 0, bottom: 1, width: 45, height: 6, backgroundColor: '#AB7F55', borderRadius: 5, borderBottomWidth: 2, borderBottomColor: '#785E43' },
  directionHint: { position: 'absolute', width: 144, minHeight: 44, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 22, backgroundColor: '#FAF7EDEB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, directionText: { flexShrink: 1, fontFamily: fonts.laundryBold, fontSize: 17, color: '#6F7358' },
});
