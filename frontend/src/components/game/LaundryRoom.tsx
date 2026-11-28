import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { chibiPlayerAvatar } from '../../game/chibiPlayerAvatar';
import { laundryArt } from '../../game/laundryArt';
import { libraryArt } from '../../game/libraryArt';
import { useInteriorMovement, type InteriorMovementWorld } from '../../game/useInteriorMovement';
import { LAUNDRY_BASKET, LAUNDRY_BENCH, LAUNDRY_DRYER, LAUNDRY_DRYING_RACK, LAUNDRY_FOLDING_TABLE, LAUNDRY_PLANTS, LAUNDRY_PLAYER_SCALE, LAUNDRY_ROOM, LAUNDRY_SPAWN, LAUNDRY_STATIONS, LAUNDRY_VIEW_SCALE, LAUNDRY_WALL_FLOOR_Y, LAUNDRY_WASHERS, LAUNDRY_WINDOWS, findLaundryPath, laundryTargetEdge, moveLaundryPlayer, type LaundryStation, type LaundryTargetEdge } from '../../game/laundryWorld';
import { fonts } from '../../theme';
import { DirectionalAvatar } from './DirectionalAvatar';
import { GameControls } from './GameControls';

export type LaundryRoomProps = {
  locked: boolean;
  controlMode: 'joystick' | 'touch';
  onInteract: (station: LaundryStation) => void;
  reduceMotion: boolean;
  target: LaundryStation | null;
  navigationRequest?: { id: number; station: LaundryStation };
  washing: boolean;
  drying: boolean;
  airDrying?: boolean;
  carrying: boolean;
};

const laundryMovementWorld: InteriorMovementWorld<LaundryStation> = { room: LAUNDRY_ROOM, spawn: LAUNDRY_SPAWN, viewScale: LAUNDRY_VIEW_SCALE, stations: LAUNDRY_STATIONS, movePlayer: moveLaundryPlayer, findPath: findLaundryPath, targetEdge: laundryTargetEdge };

/** The shop remains mounted while work panels open; feet, camera, and walk
 * phase use the same movement pipeline as the cafe. */
export function LaundryRoom({ locked, controlMode, onInteract, reduceMotion, target, navigationRequest, washing, drying, airDrying = false, carrying }: LaundryRoomProps) {
  const { viewport, viewportRef, onLayout, onFloorPress, tapTarget, actor, camera, depth, pose, walkCycle, nearby, targetEdge, navigate, runEnabled, setRunEnabled, onMoveStart, onMove, stop } = useInteriorMovement({ world: laundryMovementWorld, locked, controlMode, onInteract, target, navigationRequest });
  return <View testID="laundry-room" ref={viewportRef} style={s.room} onLayout={onLayout}>
    <Animated.View testID="laundry-camera" style={{ position: 'absolute', left: 0, top: 0, width: LAUNDRY_ROOM.width, height: LAUNDRY_ROOM.height, transform: camera.getTranslateTransform() }}>
      <Pressable accessibilityLabel="빨래방 바닥" style={StyleSheet.absoluteFill} onPress={onFloorPress}><LaundryFloor /></Pressable>
      {tapTarget && <View pointerEvents="none" accessibilityLabel="이동할 위치" style={[s.tapMarker, { left: tapTarget.x - 12, top: tapTarget.y - 6 }]} />}
      <LaundryFurniture onSelect={navigate} target={target} washing={washing} drying={drying} airDrying={airDrying} reduceMotion={reduceMotion} />
      <Animated.View testID="laundry-player" pointerEvents="none" accessibilityLabel="내 캐릭터" style={{ position: 'absolute', left: -64 * LAUNDRY_PLAYER_SCALE, top: -186 * LAUNDRY_PLAYER_SCALE, transform: actor.getTranslateTransform(), zIndex: depth }}>
        <DirectionalAvatar facing={pose.facing} motion={pose.motion} manifest={chibiPlayerAvatar} walkCycle={walkCycle} scale={LAUNDRY_PLAYER_SCALE} reduceMotion={reduceMotion} />
        {carrying && <Image accessible accessibilityLabel="빨래 바구니를 들고 있어요" source={laundryArt.basket} resizeMode="contain" style={s.carriedBasket} />}
      </Animated.View>
    </Animated.View>
    {!locked && target && targetEdge && <LaundryDirectionHint target={target} edge={targetEdge} viewport={viewport} interactive={controlMode === 'touch'} onPress={() => navigate(target)} />}
    <GameControls controlMode={controlMode} locked={locked} reduceMotion={reduceMotion} runEnabled={runEnabled} onRunEnabledChange={setRunEnabled} onMoveStart={onMoveStart} onMove={onMove} onMoveEnd={stop}
      action={{ label: nearby ? LAUNDRY_STATIONS[nearby].label : '이용하기', accessibilityLabel: nearby ? `${LAUNDRY_STATIONS[nearby].label} 이용하기` : '가까이 이동해 주세요', icon: nearby ? LAUNDRY_STATIONS[nearby].icon : 'hand-left', available: Boolean(nearby), onPress: () => nearby && navigate(nearby) }} />
  </View>;
}

const LaundryFloor = memo(function LaundryFloor() {
  return <View pointerEvents="none" style={s.floor}>
    {Array.from({ length: 11 }, (_, row) => <View key={row} style={{ position: 'absolute', left: 20, right: 20, top: LAUNDRY_WALL_FLOOR_Y + row * 68, height: 68, flexDirection: 'row' }}>
      {Array.from({ length: 18 }, (_, col) => <View key={col} style={{ width: 68, height: 68, backgroundColor: ['#EAE7D8', '#E8E4D4', '#EDEADC'][(row * 5 + col) % 3], borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#CFCDBD55' }} />)}
    </View>)}
    <View style={s.wall} /><View style={s.wallPanels}>{Array.from({ length: 17 }, (_, i) => <View key={i} style={{ position: 'absolute', left: i * 70 + 8, top: 9, width: 54, height: 37, borderRadius: 3, borderWidth: 1, borderColor: '#97ABA0' }} />)}</View><View style={s.wallRail} />
    <View style={[s.sideWall, { left: 10 }]} /><View style={[s.sideWall, { right: 10 }]} />
    {LAUNDRY_WINDOWS.map(window => <Image key={window.x} source={libraryArt.archedWindow} resizeMode="contain" style={{ position: 'absolute', left: window.x, top: window.y, width: window.width, height: window.height }} />)}
    <View style={s.wallSign}><Ionicons name="shirt" size={30} color="#F8F2DD" /><Text style={s.wallSignText}>느티 빨래방</Text></View>
    <View style={s.wallShelf}><View style={[s.foldedTowel, { left: 15, width: 36, bottom: 11, backgroundColor: '#D1A28B' }]} /><View style={[s.foldedTowel, { left: 12, width: 40, bottom: 20, backgroundColor: '#EADBC1' }]} /><View style={[s.foldedTowel, { left: 63, width: 30, bottom: 11, backgroundColor: '#A7BAB5' }]} /><View style={s.bottle}><View style={s.bottleCap} /></View></View>
    {[330, 685].map(x => <View key={x} style={[s.pendant, { left: x }]}><View style={s.pendantCord} /><View style={s.pendantShade} /><View style={s.pendantLight} /></View>)}
    <LinearGradient colors={['#FFF4CB50', '#FFF4CB00']} style={{ position: 'absolute', left: 885, top: LAUNDRY_WALL_FLOOR_Y, width: 260, height: 300, transform: [{ skewX: '-17deg' }] }} />
    <View style={s.machineMat}><View style={s.rugInset} /></View>
    <View style={s.dryerMat}><View style={s.rugInset} /></View>
    <View style={s.foldingRug}><View style={s.rugInset} /></View>
    <View style={s.rackRug}><View style={s.rugInset} /></View>
    <View style={s.entranceMat}><Text style={s.entranceText}>출입문</Text><Ionicons name="arrow-down" size={24} color="#7A705A" /></View><View style={s.threshold} />
  </View>;
});

const LaundryFurniture = memo(function LaundryFurniture({ onSelect, target, washing, drying, airDrying, reduceMotion }: { onSelect: (station: LaundryStation) => void; target: LaundryStation | null; washing: boolean; drying: boolean; airDrying: boolean; reduceMotion: boolean }) {
  return <>
    {LAUNDRY_WASHERS.map(machine => {
      const occupied = machine.id === 'occupied';
      const content = <><Image source={laundryArt.washer} resizeMode="contain" style={{ width: machine.width, height: machine.height }} />
        <MachineActivity kind="washer" active={occupied || washing} reduceMotion={reduceMotion} id={occupied ? 'occupied' : 'washer'} />
        <View style={[s.machinePlate, occupied && s.occupiedPlate]}><Text style={[s.plateText, occupied && { color: '#877B63' }]}>{occupied ? '1번 사용 중' : '2번 세탁기'}</Text></View>
        {!occupied && target === 'washer' && <Marker />}</>;
      const style = { position: 'absolute' as const, left: machine.x, top: machine.y, width: machine.width, height: machine.height, zIndex: machine.y + machine.height };
      return occupied ? <View key={machine.id} testID="laundry-occupied-washer" accessible accessibilityLabel="다른 손님이 사용 중인 1번 세탁기" pointerEvents="none" style={style}>{content}</View>
        : <Pressable key={machine.id} testID="laundry-washer" accessibilityRole="button" accessibilityLabel="빨래방 세탁기" onPress={() => onSelect('washer')} style={style}>{content}</Pressable>;
    })}
    <Pressable testID="laundry-dryer" accessibilityRole="button" accessibilityLabel="빨래방 건조기" onPress={() => onSelect('dryer')} style={{ position: 'absolute', left: LAUNDRY_DRYER.x, top: LAUNDRY_DRYER.y, width: LAUNDRY_DRYER.width, height: LAUNDRY_DRYER.height, zIndex: LAUNDRY_DRYER.y + LAUNDRY_DRYER.height }}>
      <Image source={laundryArt.dryer} resizeMode="contain" style={{ width: LAUNDRY_DRYER.width, height: LAUNDRY_DRYER.height }} /><MachineActivity kind="dryer" active={drying} reduceMotion={reduceMotion} id="dryer" />
      <View style={s.machinePlate}><Text style={s.plateText}>건조기</Text></View>{target === 'dryer' && <Marker />}
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="빨래 개는 테이블" onPress={() => onSelect('fold')} style={{ position: 'absolute', left: LAUNDRY_FOLDING_TABLE.x, top: LAUNDRY_FOLDING_TABLE.y, width: LAUNDRY_FOLDING_TABLE.width, height: LAUNDRY_FOLDING_TABLE.height, zIndex: LAUNDRY_FOLDING_TABLE.y + LAUNDRY_FOLDING_TABLE.height }}>
      <Image source={laundryArt.foldingTable} resizeMode="contain" style={{ width: LAUNDRY_FOLDING_TABLE.width, height: LAUNDRY_FOLDING_TABLE.height }} />{target === 'fold' && <Marker />}
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="빨래방 건조대" onPress={() => onSelect('rack')} style={{ position: 'absolute', left: LAUNDRY_DRYING_RACK.x, top: LAUNDRY_DRYING_RACK.y, width: LAUNDRY_DRYING_RACK.width, height: LAUNDRY_DRYING_RACK.height, zIndex: LAUNDRY_DRYING_RACK.y + LAUNDRY_DRYING_RACK.height }}>
      <Image source={laundryArt.dryingRack} resizeMode="contain" style={{ width: LAUNDRY_DRYING_RACK.width, height: LAUNDRY_DRYING_RACK.height }} />
      <View style={s.rackPlate}><Text style={s.plateText}>공용 건조대</Text></View>
      {airDrying && <View testID="laundry-rack-running" style={s.airDryingBadge}><Ionicons name="leaf" color="#628273" size={16} /><Text style={s.airDryingText}>자연 건조 중</Text></View>}
      {target === 'rack' && <Marker />}
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="빨래방 빨래 바구니" onPress={() => onSelect('basket')} style={{ position: 'absolute', left: LAUNDRY_BASKET.x, top: LAUNDRY_BASKET.y, width: LAUNDRY_BASKET.width, height: LAUNDRY_BASKET.height, zIndex: LAUNDRY_BASKET.y + LAUNDRY_BASKET.height }}>
      <Image source={laundryArt.basket} resizeMode="contain" style={{ width: LAUNDRY_BASKET.width, height: LAUNDRY_BASKET.height }} />{target === 'basket' && <Marker />}
    </Pressable>
    <View accessible accessibilityLabel="빨래를 기다리는 벤치" pointerEvents="none" style={{ position: 'absolute', left: LAUNDRY_BENCH.x, top: LAUNDRY_BENCH.y, width: LAUNDRY_BENCH.width, height: LAUNDRY_BENCH.height, zIndex: LAUNDRY_BENCH.y + LAUNDRY_BENCH.height }}><View style={s.benchShadow} /><View style={s.benchBack} /><View style={[s.benchLeg, { left: 17 }]} /><View style={[s.benchLeg, { right: 17 }]} /><View style={s.benchSeat} /><View style={s.benchCushion} /><View style={s.benchBook} /></View>
    {LAUNDRY_PLANTS.map(plant => <Image key={plant.x} source={libraryArt.plantCluster} resizeMode="contain" style={{ position: 'absolute', left: plant.x, top: plant.y, width: plant.width, height: plant.height, zIndex: plant.y + plant.height }} />)}
    <Pressable accessibilityRole="button" accessibilityLabel="빨래방 출입문" onPress={() => onSelect('exit')} style={{ position: 'absolute', left: 515, top: 900, width: 170, height: 83, zIndex: 5 }}>{target === 'exit' && <Marker />}</Pressable>
  </>;
});

function MachineActivity({ kind, active, reduceMotion, id }: { kind: 'washer' | 'dryer'; active: boolean; reduceMotion: boolean; id: string }) {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    turn.setValue(0);
    if (!active || reduceMotion) return;
    const animation = Animated.loop(Animated.timing(turn, { toValue: 1, duration: kind === 'washer' ? 3200 : 2500, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    animation.start(); return () => { animation.stop(); turn.setValue(0); };
  }, [active, reduceMotion, kind, turn]);
  if (!active) return null;
  return <View testID={`laundry-${id}-running`} accessible accessibilityLabel={kind === 'washer' ? '세탁 중' : '건조 중'} pointerEvents="none" style={StyleSheet.absoluteFill}>
    <View style={[s.drumWindow, kind === 'dryer' && s.dryerWindow]}><Animated.View testID={`laundry-${id}-drum`} style={[s.drumLoad, { transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
      <View style={[s.drumCloth, { left: 2, top: 21, backgroundColor: '#C7B092', transform: [{ rotate: '-25deg' }] }]} /><View style={[s.drumCloth, { left: 22, top: 16, backgroundColor: '#809CA0', transform: [{ rotate: '40deg' }] }]} /><View style={[s.drumCloth, { left: 13, top: 34, backgroundColor: '#E6E0CE' }]} />
    </Animated.View><View style={s.drumGlint} /></View><View style={[s.runningLight, kind === 'dryer' && { backgroundColor: '#E6B56D' }]} />
  </View>;
}

function LaundryDirectionHint({ target, edge, viewport, interactive, onPress }: { target: LaundryStation; edge: LaundryTargetEdge; viewport: { width: number; height: number }; interactive: boolean; onPress: () => void }) {
  const names = { up: '위쪽', down: '아래쪽', left: '왼쪽', right: '오른쪽' }; const arrows = { up: 'arrow-up', down: 'arrow-down', left: 'arrow-back', right: 'arrow-forward' } as const;
  const label = LAUNDRY_STATIONS[target].label;
  const top = edge === 'up' ? Math.min(190, viewport.height * 0.3) : edge === 'down' ? viewport.height - 270 : Math.max(200, Math.min(viewport.height * 0.46, viewport.height - 270));
  const left = edge === 'left' ? 14 : edge === 'right' ? viewport.width - 158 : (viewport.width - 144) / 2;
  const content = <><Ionicons name={arrows[edge]} size={21} color="#58776B" /><Text style={s.directionText}>{label}</Text></>;
  return interactive ? <Pressable testID="laundry-target-edge" accessibilityRole="button" accessibilityLabel={`${names[edge]} ${label}까지 이동`} onPress={onPress} style={[s.directionHint, { left, top }]}>{content}</Pressable>
    : <View testID="laundry-target-edge" accessible accessibilityLabel={`${names[edge]} ${label}`} pointerEvents="none" style={[s.directionHint, { left, top }]}>{content}</View>;
}
function Marker() { return <View pointerEvents="none" style={s.marker}><Ionicons name="chevron-down" color="#6D8E7D" size={28} /></View>; }

const s = StyleSheet.create({
  room: { flex: 1, backgroundColor: '#D1CEC0', overflow: 'hidden' },
  floor: { width: LAUNDRY_ROOM.width, height: LAUNDRY_ROOM.height, backgroundColor: '#EAE7D8', overflow: 'hidden' },
  wall: { position: 'absolute', left: 18, right: 18, top: 0, height: LAUNDRY_WALL_FLOOR_Y, backgroundColor: '#F4F0DF', borderTopWidth: 10, borderTopColor: '#C9BCA1' },
  wallPanels: { position: 'absolute', left: 18, right: 18, top: LAUNDRY_WALL_FLOOR_Y - 68, height: 57, backgroundColor: '#B4C8B9', borderTopWidth: 5, borderTopColor: '#D5D9C4', overflow: 'hidden' },
  wallRail: { position: 'absolute', left: 18, right: 18, top: LAUNDRY_WALL_FLOOR_Y - 13, height: 13, backgroundColor: '#879D8C', borderBottomWidth: 4, borderBottomColor: '#6D8979' },
  sideWall: { position: 'absolute', top: 0, bottom: 16, width: 14, backgroundColor: '#A1AE98', borderRightWidth: 4, borderRightColor: '#D3D5BE' },
  wallSign: { position: 'absolute', left: 463, top: 100, width: 270, height: 76, backgroundColor: '#719184', borderRadius: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 13 },
  wallSignText: { fontFamily: fonts.laundryBold, fontSize: 28, color: '#FAF2DD' },
  wallShelf: { position: 'absolute', left: 762, top: 150, width: 134, height: 56, borderBottomWidth: 9, borderBottomColor: '#B69872' },
  foldedTowel: { position: 'absolute', height: 10, borderRadius: 3, borderBottomWidth: 2, borderBottomColor: '#80694E25' },
  bottle: { position: 'absolute', bottom: 9, right: 10, width: 19, height: 29, borderRadius: 4, backgroundColor: '#C6D9B6', borderBottomWidth: 3, borderBottomColor: '#9CAC8D' }, bottleCap: { position: 'absolute', top: -5, left: 5, width: 10, height: 6, borderRadius: 2, backgroundColor: '#A2B6A3' },
  pendant: { position: 'absolute', top: 0, width: 58, height: 96 }, pendantCord: { position: 'absolute', top: 0, left: 28, width: 3, height: 50, backgroundColor: '#8B7E65' }, pendantShade: { position: 'absolute', top: 47, left: 4, width: 50, height: 26, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderBottomLeftRadius: 5, borderBottomRightRadius: 5, backgroundColor: '#A5BDB1', borderBottomWidth: 4, borderBottomColor: '#6E8C7F' }, pendantLight: { position: 'absolute', top: 73, left: 10, width: 38, height: 5, borderRadius: 5, backgroundColor: '#FFEABC' },
  machineMat: { position: 'absolute', left: 207, top: 412, width: 351, height: 130, borderRadius: 20, backgroundColor: '#B8C9BB' }, dryerMat: { position: 'absolute', left: 593, top: 412, width: 178, height: 130, borderRadius: 20, backgroundColor: '#D7C7A5' },
  foldingRug: { position: 'absolute', left: 766, top: 676, width: 310, height: 220, borderRadius: 42, backgroundColor: '#D4C4A8' }, rackRug: { position: 'absolute', left: 68, top: 706, width: 260, height: 114, borderRadius: 28, backgroundColor: '#C5CCBA' }, rugInset: { position: 'absolute', left: 8, right: 8, top: 8, bottom: 8, borderWidth: 1.5, borderColor: '#F6EFDA77', borderRadius: 34 },
  entranceMat: { position: 'absolute', left: 512, top: 890, width: 176, height: 98, backgroundColor: '#D6C6A6', borderRadius: 13, alignItems: 'center', justifyContent: 'center', gap: 6 }, entranceText: { fontFamily: fonts.laundryBold, fontSize: 19, color: '#7A705A' }, threshold: { position: 'absolute', left: 503, top: 983, width: 194, height: 11, backgroundColor: '#AC9673', borderTopWidth: 3, borderTopColor: '#F1DFC1' },
  tapMarker: { position: 'absolute', width: 24, height: 12, borderWidth: 2, borderColor: '#789D89', borderRadius: 14, backgroundColor: '#FDF9DC70', zIndex: 3 },
  marker: { position: 'absolute', top: -35, left: '50%', marginLeft: -14 },
  machinePlate: { position: 'absolute', bottom: -23, left: 12, right: 12, paddingVertical: 4, backgroundColor: '#F9F3E3', borderRadius: 6, alignItems: 'center' }, occupiedPlate: { backgroundColor: '#E7DDC4' }, plateText: { fontFamily: fonts.laundryBold, fontSize: 18, color: '#56786A' },
  rackPlate: { position: 'absolute', bottom: -26, left: 41, right: 41, paddingVertical: 4, borderRadius: 6, backgroundColor: '#F9F3E3', alignItems: 'center' },
  airDryingBadge: { position: 'absolute', left: 32, top: -29, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14, backgroundColor: '#E6EDDA' }, airDryingText: { fontFamily: fonts.laundryBold, fontSize: 16, color: '#628273' },
  drumWindow: { position: 'absolute', left: 39, top: 73, width: 60, height: 60, borderRadius: 30, overflow: 'hidden', backgroundColor: '#697D7F55' }, dryerWindow: { left: 36.5, top: 63 }, drumLoad: { width: 60, height: 60 }, drumCloth: { position: 'absolute', width: 29, height: 19, borderRadius: 7 }, drumGlint: { position: 'absolute', left: 7, top: 6, width: 20, height: 8, borderRadius: 10, backgroundColor: '#FAFFFF33', transform: [{ rotate: '-30deg' }] }, runningLight: { position: 'absolute', right: 24, top: 30, width: 6, height: 6, borderRadius: 3, backgroundColor: '#85BC9B' },
  benchShadow: { position: 'absolute', left: 3, bottom: 0, width: 174, height: 18, borderRadius: 30, backgroundColor: '#7B735724' }, benchBack: { position: 'absolute', left: 8, right: 8, top: 6, height: 45, borderRadius: 9, backgroundColor: '#C6AA7E', borderWidth: 3, borderColor: '#937C58', borderBottomWidth: 7 }, benchSeat: { position: 'absolute', left: 3, right: 3, top: 48, height: 22, borderRadius: 5, backgroundColor: '#D7BA8B', borderWidth: 3, borderColor: '#937C58', borderBottomWidth: 6 }, benchLeg: { position: 'absolute', top: 65, width: 10, height: 25, backgroundColor: '#9C835D', borderRadius: 2 }, benchCushion: { position: 'absolute', left: 23, top: 31, width: 42, height: 22, borderRadius: 8, backgroundColor: '#98B7A2', borderBottomWidth: 3, borderBottomColor: '#769681' }, benchBook: { position: 'absolute', right: 29, top: 43, width: 28, height: 13, borderRadius: 2, backgroundColor: '#C28F72', borderBottomWidth: 4, borderBottomColor: '#EFE6D1', transform: [{ rotate: '-7deg' }] },
  carriedBasket: { position: 'absolute', left: 28, top: 70, width: 44, height: 21 },
  directionHint: { position: 'absolute', width: 144, minHeight: 45, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FAF5E9ED' }, directionText: { fontFamily: fonts.laundryBold, fontSize: 18, color: '#58776B', flexShrink: 1 },
});
