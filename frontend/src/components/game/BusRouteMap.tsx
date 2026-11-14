import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { getAvailableBusRoutes, getBusDestination, getBusRouteStops, STOP_NAMES, type BusDestination, type BusDirection, type BusRouteId, type BusStopId } from '../../game/busSession';
import { fonts } from '../../theme';
import { PressScale } from '../PressScale';

export type BusRouteContext = {
  currentStop?: BusStopId;
  direction?: BusDirection;
  destination?: BusDestination;
  selectedRoute?: BusRouteId | null;
};

const routeIds = ['201', '305'] as const;
const maximumStopCount = Math.max(...routeIds.map(route => getBusRouteStops(route, 'outbound').length));

/** The phone and physical stop board read the same routes as the bus simulation. */
export function BusRouteMap({ currentStop = 'village', direction = 'outbound', destination, selectedRoute, compact = false }: BusRouteContext & { compact?: boolean }) {
  const [route, setRoute] = useState<BusRouteId>(selectedRoute ?? '201');
  const [viewDirection, setViewDirection] = useState(direction);
  const { fontScale } = useWindowDimensions();
  useEffect(() => { setViewDirection(direction); }, [direction]);
  useEffect(() => { if (selectedRoute) setRoute(selectedRoute); }, [selectedRoute]);
  const stops = getBusRouteStops(route, viewDirection);
  const currentIndex = stops.indexOf(currentStop);
  const canDepart = getAvailableBusRoutes(currentStop, viewDirection).includes(route);
  const oppositeSide = viewDirection !== direction;
  const color = route === '201' ? '#587B68' : '#5E7F94';
  const note = oppositeSide ? '반대편 정류장 방향'
    : !canDepart && currentIndex === stops.length - 1 ? '종점' : null;
  // Reserve the longest route and two hint lines so switching lines never resizes the map.
  const tabHeight = Math.max(46, Math.ceil(30 * fontScale));
  const directionHeight = Math.max(46, Math.ceil(46 * fontScale));
  const stopHeight = Math.max(48, Math.ceil(50 * fontScale));
  const noteHeight = Math.ceil(44 * fontScale);
  const mapHeight = (compact ? 28 + 30 : 36 + 39) + tabHeight + directionHeight + maximumStopCount * stopHeight + noteHeight;
  return <View style={[styles.map, compact && styles.compact, { height: mapHeight }]} testID="bus-route-map">
    <View accessibilityRole="tablist" style={[styles.tabs, { height: tabHeight }]}>
      {routeIds.map(id => <PressScale key={id} accessibilityRole="tab" accessibilityLabel={`${id}번 노선`} accessibilityState={{ selected: route === id }}
        onPress={() => setRoute(id)} style={[styles.tab, route === id && { backgroundColor: id === '201' ? '#587B68' : '#5E7F94' }]}>
        <Ionicons name="bus-outline" size={19} color={route === id ? '#FFFCF3' : '#687769'} /><Text style={[styles.tabText, route === id && styles.selectedText]}>{id}</Text>
      </PressScale>)}
    </View>
    <View style={[styles.directionRow, { height: directionHeight }]}>
      <Text numberOfLines={2} style={styles.direction}>{getBusDestination(route, viewDirection)}</Text>
      <PressScale accessibilityRole="button" accessibilityLabel="반대 방향 노선 보기" onPress={() => setViewDirection(value => value === 'outbound' ? 'inbound' : 'outbound')} style={styles.reverse}>
        <Ionicons name="swap-vertical" size={18} color="#4F6959" /><Text style={styles.reverseText}>반대 방향</Text>
      </PressScale>
    </View>
    <View style={[styles.stops, { height: maximumStopCount * stopHeight }]} accessibilityLabel={`${route}번 ${getBusDestination(route, viewDirection)} 노선`}>
      {stops.map((stop, index) => {
        const current = stop === currentStop;
        const target = stop === destination;
        const passed = currentIndex >= 0 && index < currentIndex;
        return <View key={stop} style={[styles.stop, { height: stopHeight }]} testID={`route-map-stop-${stop}`}>
          <View style={styles.track} accessible={false}>
            {index > 0 && <View style={[styles.lineTop, { backgroundColor: color, opacity: passed ? 0.4 : 1 }]} />}
            {index < stops.length - 1 && <View style={[styles.lineBottom, { backgroundColor: color, opacity: passed ? 0.4 : 1 }]} />}
            <View style={[styles.dot, { borderColor: color }, current && { backgroundColor: color, width: 20, height: 20, borderWidth: 4 }]} />
          </View>
          <Text numberOfLines={2} style={[styles.stopName, passed && styles.passed, current && { color, fontFamily: fonts.bold }]}>{STOP_NAMES[stop]}</Text>
          {current && <View style={[styles.tag, { backgroundColor: '#E2EADF' }]}><Text style={styles.tagText}>현재</Text></View>}
          {target && <View style={[styles.tag, { backgroundColor: '#F1E2BC' }]}><Text style={styles.tagText}>목적지</Text></View>}
        </View>;
      })}
    </View>
    <View style={{ height: noteHeight, justifyContent: 'center' }}>{note ? <Text numberOfLines={2} style={styles.note}>{note}</Text> : null}</View>
  </View>;
}

const styles = StyleSheet.create({
  map: { backgroundColor: '#FFFCF5', borderRadius: 22, padding: 18, gap: 13 },
  compact: { padding: 14, gap: 10 },
  tabs: { flexDirection: 'row', gap: 10 },
  tab: { alignItems: 'center', backgroundColor: '#EAECE2', borderRadius: 13, flexDirection: 'row', gap: 8, justifyContent: 'center', flex: 1, minHeight: 46 },
  tabText: { color: '#526759', fontFamily: fonts.bold, fontSize: 21 },
  selectedText: { color: '#FFFCF3' },
  directionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  direction: { flex: 1, color: '#435849', fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23 },
  reverse: { alignItems: 'center', flexDirection: 'row', gap: 3, minHeight: 44 },
  reverseText: { color: '#5A6E5F', fontFamily: fonts.medium, fontSize: 13 },
  stops: { paddingHorizontal: 2 },
  stop: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  track: { width: 24, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  lineTop: { position: 'absolute', top: 0, bottom: '50%', width: 4 },
  lineBottom: { position: 'absolute', top: '50%', bottom: 0, width: 4 },
  dot: { backgroundColor: '#FFFCF5', borderRadius: 10, borderWidth: 3, width: 14, height: 14 },
  stopName: { color: '#505D50', flex: 1, fontFamily: fonts.medium, fontSize: 17, lineHeight: 25 },
  passed: { color: '#90998B' },
  tag: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  tagText: { color: '#526449', fontFamily: fonts.semibold, fontSize: 12 },
  note: { color: '#7B6A4E', fontFamily: fonts.medium, fontSize: 14, lineHeight: 22 },
});
