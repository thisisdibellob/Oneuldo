import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { PressScale } from '../PressScale';
import { BusRouteMap } from './BusRouteMap';
import { LibraryButton, LibraryPanel, LIBRARY_COLORS as C } from './LibraryWorkPanel';
import { useMarketReducedMotion } from './MarketPanelTransition';
import { busArt } from '../../game/busArt';
import { villageBuildingArt } from '../../game/gameAssets';
import { getAvailableBusRoutes, getBusDestination, getBusHelpPlan, getBusRouteStops, getBusTravelStamps, STOP_NAMES, type BusRouteId, type BusSession } from '../../game/busSession';
import { fonts } from '../../theme';

/** Route changes scroll inside one stable frame, including compact mobile viewports. */
export function BusRoutePanel(props: Omit<ComponentProps<typeof LibraryPanel>, 'fixedHeight'>) {
  return <LibraryPanel {...props} fixedHeight={700} testID={props.testID ?? 'bus-route-panel'} />;
}

export function TransitCard({ small = false }: { small?: boolean }) {
  return <View style={[s.card, small && { width: 160, height: 96 }]}>
    <View style={s.cardTop}><Text style={s.cardBrand}>오늘도</Text><Ionicons name="wifi" size={23} color="#EBEFDA" /></View>
    <View style={s.cardBottom}><Ionicons name="bus-outline" size={25} color="#F7F7DE" /><Text style={s.cardTitle}>교통카드</Text></View>
    <View style={s.cardCircle} />
  </View>;
}
export function BusRouteCard({ session }: { session: BusSession }) {
  const plan = getBusHelpPlan(session);
  const destinationName = session.destination === 'village' ? '오늘도 마을' : STOP_NAMES.library;
  const destinationArt = session.destination === 'village' ? villageBuildingArt['player-home'] : busArt.library;
  const rideIndex = plan.steps.findIndex(step => step.kind === 'ride' && step.route !== null && step.stop !== session.stop);
  const ride = rideIndex >= 0 ? plan.steps[rideIndex] : null;
  const boarding = ride ? plan.steps.slice(0, rideIndex).findLast(step => step.kind === 'board' && step.route === ride.route && step.direction === ride.direction) : null;
  const routeStops = ride?.route ? getBusRouteStops(ride.route, ride.direction) : [];
  const startIndex = routeStops.indexOf(boarding?.stop ?? session.stop);
  const endIndex = ride ? routeStops.indexOf(ride.stop) : -1;
  const stops = startIndex >= 0 && endIndex > startIndex ? routeStops.slice(startIndex, endIndex + 1) : [];
  return <View>
    <View style={s.destination}><Image source={destinationArt} resizeMode="contain" style={s.libraryArt} /><Text style={s.destinationName}>{destinationName}</Text></View>
    <View style={s.location}><Ionicons name="location" color={C.green} size={19} /><Text style={s.locationText}>현재 {STOP_NAMES[session.stop]}{session.phase === 'riding' ? ' 출발' : ''}</Text></View>
    {ride?.route && stops.length > 0 ? <>
    <View style={s.routeHeading}><View style={s.number}><Text style={s.numberText}>{ride.route}</Text></View><View style={{ flex: 1 }}><Text style={s.routeTitle}>{getBusDestination(ride.route, ride.direction)}</Text><Text style={s.routeSub}>{boarding ? `${STOP_NAMES[boarding.stop]}에서 타요` : '타고 있는 버스의 다음 이동 구간'}</Text></View></View>
    <View style={s.routePath}>{stops.map((stop, index) => <View key={stop} style={s.routeStep}>
      <View style={s.track}>{index !== stops.length - 1 && <View style={s.trackLine} />}<View style={[s.dot, stop === session.destination && s.dotDestination]} /></View>
      <Text style={[s.stopName, stop === session.destination && { color: C.green, fontFamily: fonts.bold }]}>{STOP_NAMES[stop]}</Text>
      <Text style={s.stopKind}>{index === 0 ? boarding ? '승차' : '출발' : index === stops.length - 1 ? '하차' : ''}</Text>
    </View>)}</View>
    </> : null}
    <Text style={[s.paragraph, { marginTop: 16 }]}>{plan.summary}</Text>
    <BusTravelStamps session={session} />
  </View>;
}

export function BusTravelStamps({ session }: { session: BusSession }) {
  const stamps = getBusTravelStamps(session);
  return <View style={s.stampSection} testID="bus-travel-stamps">
    <View style={s.stampHeading}><Text style={s.routeTitle}>이번 이동</Text><Text style={s.stampCount}>{stamps.filter(stamp => stamp.earned).length} / {stamps.length}</Text></View>
    <View style={s.stampRow}>{stamps.map(stamp => <View key={stamp.id} accessible accessibilityLabel={`${stamp.label} · ${stamp.earned ? '완료' : '아직'}`} style={s.stampItem}>
      <View style={[s.stampSeal, stamp.earned && s.stampEarned]}><Ionicons name={stamp.earned ? 'checkmark' : stamp.icon} size={23} color={stamp.earned ? '#FFF9E6' : '#959C89'} /></View>
      <Text style={[s.stampLabel, stamp.earned && { color: C.green }]}>{stamp.label}</Text>
    </View>)}</View>
  </View>;
}

/** One compact physical segment instead of an unexplained twenty-second wait. */
export function BusLegProgress({ session, progress, reduceMotion = false }: { session: BusSession; progress: Animated.Value; reduceMotion?: boolean }) {
  const [width, setWidth] = useState(0);
  const moving = session.phase === 'riding' && !!session.nextStop;
  const end = moving ? session.nextStop! : session.stop;
  return <View style={s.leg} testID="bus-leg-progress" accessible accessibilityLabel={moving ? `${STOP_NAMES[session.stop]}에서 ${STOP_NAMES[end]}으로 이동 중` : `${STOP_NAMES[session.stop]} 정차 중`}>
    <View style={s.legLabels}><Text numberOfLines={1} style={s.legLabel}>{moving ? STOP_NAMES[session.stop] : '정차'}</Text><Text numberOfLines={1} style={[s.legLabel, s.legEnd]}>{STOP_NAMES[end]}</Text></View>
    <View style={s.legRail} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      <View style={s.legDot} /><View style={[s.legDot, { left: undefined, right: 0 }]} />
      <Animated.View style={[s.legBus, { transform: [{ translateX: moving ? reduceMotion ? Math.max(0, width - 22) / 2 : progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, width - 22)] }) : Math.max(0, width - 22) }] }]}><Ionicons name="bus" color="#314D40" size={16} /></Animated.View>
    </View>
  </View>;
}
export function BusTimetable({ session, upcomingRoute }: { session: BusSession; upcomingRoute?: BusRouteId }) {
  const routes = getAvailableBusRoutes(session.stop, session.direction);
  const [selectedRoute, setSelectedRoute] = useState<BusRouteId | null>(session.offeredRoute ?? null);
  useEffect(() => { setSelectedRoute(null); }, [session.stop, session.direction]);
  const stopCode = `${({ village: '01', park: '02', library: '03', civic: '04', gym: '05', neuti: '06' } as const)[session.stop]}-${session.direction === 'outbound' ? '101' : '102'}`;
  const approaching = !session.offeredRoute && upcomingRoute && routes.includes(upcomingRoute) ? upcomingRoute : null;
  const displayRoutes = [...routes].sort((a, b) => Number(b === session.offeredRoute || b === approaching) - Number(a === session.offeredRoute || a === approaching));
  return <View>
    <View style={s.bitCase} testID="bus-stop-display">
      <View style={s.bitPlaque}><View style={s.bitBusIcon}><Ionicons name="bus" color="#FFFDF3" size={25} /></View><View style={{ flex: 1 }}><Text style={s.bitStop}>{STOP_NAMES[session.stop]}</Text><Text style={s.bitStopCode}>정류소 {stopCode}</Text></View><View style={s.bitSignal} /></View>
      <View style={s.bitScreen}>
        <View style={s.bitColumns}><Text style={s.bitColumn}>노선 · 방면</Text><Text style={s.bitColumn}>도착 정보</Text></View>
        {routes.length === 0 ? <View style={s.bitTerminal}><Text style={s.bitArrival}>종점</Text><Text style={s.bitDirection}>반대편 정류장에서 타요</Text></View> : displayRoutes.map(route => {
          const arrived = session.offeredRoute === route;
          const next = approaching === route;
          const status = arrived ? '도착' : next ? '곧도착' : '대기';
          return <PressScale key={route} accessibilityRole="button" accessibilityLabel={`${route}번 ${getBusDestination(route, session.direction)}, ${status}. 노선 보기`} onPress={() => setSelectedRoute(route)} style={[s.bitRow, arrived && s.bitRowArrived]}>
            <View style={s.bitRouteInfo}><View style={s.bitNumberRow}><View style={[s.bitRouteBar, { backgroundColor: route === '201' ? '#94CBA3' : '#8EC3DB' }]} /><Text style={s.bitNumber}>{route}</Text></View><Text style={s.bitDirection}>{getBusDestination(route, session.direction)}</Text></View>
            <View style={s.bitStatus}><Text style={[s.bitArrival, arrived && { color: '#B8E799' }, !arrived && !next && { color: '#B2BFB5' }]}>{status}</Text><Text style={s.bitStatusSub}>{arrived ? '승차 중' : next ? '이번 버스' : '다음 운행'}</Text></View>
          </PressScale>;
        })}
        <View style={s.bitTicker} accessibilityLiveRegion="polite"><Ionicons name="bus" size={18} color="#ECD492" /><Text style={s.bitTickerText}>{session.offeredRoute ? `${session.offeredRoute}번 버스가 도착했습니다` : approaching ? `${approaching}번 버스가 들어오고 있습니다` : routes.length ? '버스 도착을 기다리는 중' : '종점 · 하차 전용'}</Text></View>
      </View>
      <View style={s.bitHardware}><View style={s.bitSpeaker} /><Text style={s.bitBrand}>오늘도 교통정보</Text><View style={s.bitSpeaker} /></View>
    </View>
    <View style={s.timetableMapTitle}><Ionicons name="git-branch-outline" size={20} color={C.green} /><Text style={s.routeTitle}>정류장 노선도</Text></View>
    <BusRouteMap currentStop={session.stop} direction={session.direction} destination={session.destination} selectedRoute={selectedRoute ?? session.offeredRoute} compact />
  </View>;
}
export function BusCardTerminal({ approved, hasCard, alighting, onTap }: { approved: boolean; hasCard: boolean; alighting: boolean; onTap: () => void }) {
  const reduce = useMarketReducedMotion();
  const motion = useRef(new Animated.Value(approved ? 1 : 0)).current;
  useEffect(() => { if (reduce) { motion.setValue(approved ? 1 : 0); return; } const a = Animated.spring(motion, { toValue: approved ? 1 : 0, stiffness: 140, damping: 18, useNativeDriver: true }); a.start(); return () => a.stop(); }, [approved, motion, reduce]);
  return <View style={s.terminalContent}>
    <View style={s.reader}>
      <View style={[s.readerScreen, approved && { backgroundColor: '#D2E5BA' }]}>
        <Ionicons name={approved ? 'checkmark-circle' : 'card-outline'} color="#426951" size={43} />
        <Text style={s.readerText}>{approved ? `${alighting ? '하차' : '승차'} 처리되었습니다` : '카드를 대 주세요'}</Text>
      </View>
      <View style={s.readerTarget}><Ionicons name="radio-outline" color="#D9CD9D" size={48} /></View>
    </View>
    {hasCard ? <Animated.View style={{ transform: [{ translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [0, -45] }) }, { rotate: motion.interpolate({ inputRange: [0, 1], outputRange: ['-5deg', '0deg'] }) }] }}>
      <PressScale accessibilityRole="button" accessibilityLabel="교통카드를 단말기에 대기" onPress={onTap} disabled={approved}><TransitCard small /></PressScale>
    </Animated.View> : <View style={s.missingCard}><Ionicons name="bag-outline" size={35} color="#9A8467" /><Text style={s.paragraph}>가방에 교통카드가 없어요.</Text></View>}
    {hasCard && !approved && <LibraryButton icon="card-outline" onPress={onTap}>카드 찍기</LibraryButton>}
  </View>;
}

const s = StyleSheet.create({
  bitCase: { backgroundColor: '#C1C9BF', borderRadius: 15, padding: 9, overflow: 'hidden' },
  bitPlaque: { flexDirection: 'row', gap: 11, alignItems: 'center', paddingHorizontal: 7, paddingVertical: 10 }, bitBusIcon: { width: 42, height: 45, borderRadius: 10, backgroundColor: '#537164', alignItems: 'center', justifyContent: 'center' }, bitStop: { fontFamily: fonts.bold, fontSize: 23, lineHeight: 29, color: '#2F443B' }, bitStopCode: { fontFamily: fonts.medium, fontSize: 13, color: '#52655A', marginTop: 2 }, bitSignal: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#587B51', marginRight: 8 },
  bitScreen: { backgroundColor: '#172922', borderRadius: 6, overflow: 'hidden' }, bitColumns: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#243830' }, bitColumn: { fontFamily: fonts.medium, fontSize: 14, color: '#BDD0BD' }, bitRow: { paddingHorizontal: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 90 }, bitRowArrived: { backgroundColor: '#2B4234' }, bitRouteInfo: { flex: 1, gap: 5 }, bitNumberRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, bitRouteBar: { width: 4, height: 25, borderRadius: 2 }, bitNumber: { fontFamily: fonts.bold, fontSize: 31, lineHeight: 34, color: '#F6F4DC', fontVariant: ['tabular-nums'] }, bitDirection: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: '#CAD3BD' }, bitStatus: { minWidth: 68, alignItems: 'flex-end', gap: 5 }, bitArrival: { fontFamily: fonts.bold, fontSize: 23, lineHeight: 29, color: '#F1D486' }, bitStatusSub: { fontFamily: fonts.medium, fontSize: 13, color: '#B1BFA9' }, bitTicker: { minHeight: 43, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', gap: 7, alignItems: 'center', backgroundColor: '#303D28' }, bitTickerText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: '#ECD492', flex: 1 }, bitHardware: { paddingTop: 9, paddingBottom: 2, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, bitSpeaker: { width: 22, height: 3, borderRadius: 2, backgroundColor: '#919E92' }, bitBrand: { fontFamily: fonts.medium, fontSize: 11, color: '#5A6B5D' }, bitTerminal: { padding: 22, gap: 9, minHeight: 180, justifyContent: 'center', alignItems: 'center' }, timetableMapTitle: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 3, marginTop: 24, marginBottom: 10 },
  stampSection: { marginTop: 22, paddingTop: 17, gap: 14 }, stampHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, stampCount: { fontFamily: fonts.bold, fontSize: 17, color: C.green },
  stampRow: { flexDirection: 'row', gap: 5 }, stampItem: { flex: 1, alignItems: 'center', gap: 8 }, stampSeal: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E8DC' }, stampEarned: { backgroundColor: '#708866' }, stampLabel: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21, color: C.muted, textAlign: 'center' },
  leg: { paddingTop: 5, paddingBottom: 4, gap: 9 }, legLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, legLabel: { color: '#BFCFBA', fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, flexShrink: 1 }, legEnd: { color: '#F1EDD4', textAlign: 'right' }, legRail: { height: 3, marginHorizontal: 8, marginBottom: 8, backgroundColor: '#7B998577', borderRadius: 2 }, legDot: { position: 'absolute', left: 0, width: 7, height: 7, top: -2, borderRadius: 4, backgroundColor: '#BDD1A3' }, legBus: { position: 'absolute', top: -10, width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3D99E' },
  card: { width: 224, height: 138, borderRadius: 17, padding: 18, backgroundColor: '#69816B', overflow: 'hidden', justifyContent: 'space-between', alignSelf: 'center' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 }, cardBrand: { color: '#FAF5DF', fontFamily: fonts.laundryBold, fontSize: 19 }, cardBottom: { flexDirection: 'row', gap: 9, alignItems: 'center', zIndex: 1 }, cardTitle: { fontFamily: fonts.bold, fontSize: 17, color: '#FAF5DF' }, cardCircle: { position: 'absolute', width: 165, height: 165, borderRadius: 90, backgroundColor: '#91A18655', right: -40, top: 25 },
  destination: { alignItems: 'center', marginBottom: 15 }, libraryArt: { width: 180, height: 82 }, destinationName: { fontFamily: fonts.laundryBold, fontSize: 23, color: C.ink, marginTop: 6 }, routeHeading: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 10 }, number: { backgroundColor: '#617D69', borderRadius: 12, paddingHorizontal: 13, minHeight: 45, justifyContent: 'center' }, numberText: { fontFamily: fonts.bold, fontSize: 26, color: '#FFFCF1' }, routeTitle: { fontFamily: fonts.bold, fontSize: 18, color: C.ink, lineHeight: 26 }, routeSub: { fontFamily: fonts.medium, fontSize: 15, color: C.muted, lineHeight: 23 }, routePath: { backgroundColor: '#ECEEE2', borderRadius: 20, paddingHorizontal: 17, paddingVertical: 13 }, routeStep: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 13 }, track: { width: 20, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }, trackLine: { position: 'absolute', top: '50%', width: 3, height: '100%', backgroundColor: '#B8C6AD' }, dot: { width: 13, height: 13, borderRadius: 8, backgroundColor: '#9FAC92' }, dotDestination: { backgroundColor: '#54735B', width: 18, height: 18, borderRadius: 10 }, stopName: { flex: 1, fontFamily: fonts.semibold, fontSize: 19, color: C.ink }, stopKind: { fontFamily: fonts.medium, fontSize: 15, color: C.green }, location: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 16 }, locationText: { fontFamily: fonts.medium, fontSize: 16, color: C.green },
  stopHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 20 }, stopHeaderText: { fontFamily: fonts.laundryBold, fontSize: 26, color: C.ink }, timetableRow: { paddingVertical: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }, arrived: { backgroundColor: '#E4EDD7', padding: 8, borderRadius: 10 }, arrivedText: { color: C.green, fontFamily: fonts.bold, fontSize: 15 }, timetableStops: { backgroundColor: '#EFEEE2', borderRadius: 18, padding: 16, gap: 18, marginTop: 12 }, paragraph: { fontFamily: fonts.medium, fontSize: 17, color: C.ink, lineHeight: 27 }, terminal: { paddingVertical: 20, gap: 12 }, terminalContent: { alignItems: 'center', gap: 22 }, reader: { width: 235, backgroundColor: '#405652', padding: 20, borderRadius: 27, alignItems: 'center', gap: 16 }, readerScreen: { width: '100%', minHeight: 112, borderRadius: 13, backgroundColor: '#E1E8D4', alignItems: 'center', justifyContent: 'center', padding: 12, gap: 10 }, readerText: { fontFamily: fonts.bold, color: '#405E49', fontSize: 17, textAlign: 'center', lineHeight: 24 }, readerTarget: { width: 100, height: 68, borderRadius: 20, backgroundColor: '#344844', alignItems: 'center', justifyContent: 'center' }, missingCard: { alignItems: 'center', gap: 12, padding: 13 },
});
