import { memo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { getMarketElevatorFacadeRect, MARKET_FIXED_OBJECTS, MARKET_WALKABLE_AREAS, MARKET_WALLS, type MarketEnvironment } from '../../game/marketEnvironment';
import { MARKET_WORLD_HEIGHT, MARKET_WORLD_WIDTH, type Rect } from '../../game/prototypeWorld';
import { fonts } from '../../theme';
import { useMarketInteriorTheme } from './MarketThemePreviewContext';
import { COZY_MARKET_PALETTE as cozy } from '../../game/marketInteriorThemes';

function rectStyle(rect: Rect) {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}
function containsRect(area: Rect, rect: Rect) {
  return rect.x >= area.x && rect.y >= area.y
    && rect.x + rect.width <= area.x + area.width && rect.y + rect.height <= area.y + area.height;
}
function seatingInlay(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const left = Math.min(...rects.map(rect => rect.x)) - 18;
  const top = Math.min(...rects.map(rect => rect.y)) - 32;
  return { x: left, y: top,
    width: Math.max(...rects.map(rect => rect.x + rect.width)) + 18 - left,
    height: Math.max(...rects.map(rect => rect.y + rect.height)) + 18 - top };
}

/** Wall finishes and floor graphics never participate in collision or input.
 * Every structural edge is drawn from the same world data used by movement. */
export const MarketArchitectureLayer = memo(function MarketArchitectureLayer({ environment }: { environment?: MarketEnvironment }) {
  const theme = useMarketInteriorTheme();
  const illustrated = theme === 'cozy';
  const areas = environment?.walkableAreas ?? MARKET_WALKABLE_AREAS;
  const walls = environment?.walls ?? MARKET_WALLS;
  const width = environment?.world.width ?? MARKET_WORLD_WIDTH;
  const height = environment?.world.height ?? MARKET_WORLD_HEIGHT;
  const gates = environment?.alarmGates ?? (environment ? [{ id: 'entrance', gate: environment.entrance.gate,
    axis: 'y' as const, boundary: environment.entrance.alarmBoundaryY }] : []);
  const common = environment?.commonDoor;
  const objects = environment?.objects ?? MARKET_FIXED_OBJECTS;
  const elevatorFacade = getMarketElevatorFacadeRect(objects, walls);
  const lobby = areas.find(area => area.id === 'entrance-lobby');
  const sales = areas.find(area => area.id === 'main-sales-floor');
  const seats = objects.filter(object => object.kind === 'restSet').map(object => object.rect);
  const lobbySeating = seatingInlay(seats.filter(rect => lobby && containsRect(lobby, rect)));
  const salesSeating = seatingInlay(seats.filter(rect => sales && containsRect(sales, rect) && !(lobby && containsRect(lobby, rect))));
  const lobbyBrandLeft = lobby ? Math.max(lobby.x + 22, Math.min((common?.point.x ?? lobby.x + lobby.width / 2) - 80, lobby.x + lobby.width - 182)) : 0;
  const lobbyBrandTop = lobby ? Math.max(lobby.y + 52, Math.min(lobby.y + lobby.height * 0.42, (common?.gate.y ?? lobby.y + lobby.height) - 174)) : 0;
  return <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    testID={`market-interior-${theme}`}
    style={[styles.root, { width, height }, illustrated && { backgroundColor: cozy.background }]}>
    {areas.map(area => <View key={area.id} testID={`market-floor-${area.id}`}
      style={[styles.floor, area.id === 'entrance-lobby' && styles.lobby,
        { left: area.x, top: area.y, width: area.width, height: area.height }]}>
      <LinearGradient colors={illustrated ? area.id === 'entrance-lobby' ? [cozy.lobbyLight, cozy.lobby] : [cozy.floorLight, cozy.floor]
        : area.id === 'entrance-lobby' ? ['#EBEEE8', '#E3E9E2'] : ['#F8F6EF', '#EDECE3']}
        start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      {illustrated ? <MapleFloor width={area.width} height={area.height} lobby={area.id === 'entrance-lobby'} /> : <>
      {Array.from({ length: Math.ceil(width / 48) + 1 }, (_, index) => index * 48).map(x =>
        <View key={`x${x}`} style={[styles.grout, illustrated && { backgroundColor: cozy.grout }, { left: x - area.x, width: 0.6, top: 0, bottom: 0 }]} />)}
      {Array.from({ length: Math.ceil(height / 48) + 1 }, (_, index) => index * 48).map(y =>
        <View key={`y${y}`} testID={`market-floor-row-${area.id}-${y}`}
          style={[styles.grout, illustrated && { backgroundColor: cozy.grout }, { top: y - area.y, height: 0.6, left: 0, right: 0 }]} />)}
      </>}
      {illustrated && <View pointerEvents="none" style={{ position: 'absolute', left: 6, right: 6, top: 6, bottom: 6,
        borderWidth: 6, borderColor: area.id === 'entrance-lobby' ? '#BFCCA960' : '#E6C5AB60', borderRadius: 10 }} />}
    </View>)}
    {/* Inlaid floor borders distinguish the shopping and service areas without obstacles. */}
    {sales ? <View testID="market-sales-floor-border" style={[styles.salesBorder,
      { left: sales.x + 12, top: sales.y + 12, width: sales.width - 24, height: sales.height - 24 }]} /> : null}
    {salesSeating ? <View testID="market-service-seating-inlay" style={[styles.serviceFloor, rectStyle(salesSeating)]} /> : null}
    {lobbySeating ? <View testID="market-lobby-seating-inlay" style={[styles.lobbySeatingFloor, rectStyle(lobbySeating)]} /> : null}
    {environment?.checkouts.map((counter, index) => <View key={counter.id} testID={`market-checkout-lane-${index + 1}`}
      style={[styles.checkoutLane, illustrated && { backgroundColor: '#B7C3A52E', borderColor: '#AFBB9B55', borderRadius: 13 }, { left: counter.rect.x - 63, top: counter.rect.y - 42,
        width: counter.point.x - counter.rect.x + 90, height: counter.rect.height + 72 }]}>
      <View style={[styles.queueLine, { left: counter.point.x - counter.rect.x + 63 }]} />
      <Text style={[styles.queueArrow, { left: counter.point.x - counter.rect.x + 52 }]}>↓</Text>
    </View>)}
    {lobby ? <>
      <View style={[styles.lobbyRule, { left: lobby.x + 22, top: lobby.y + 80, width: lobby.width - 44 }]} />
      <View style={[styles.lobbyInlay, { left: lobbyBrandLeft, top: lobbyBrandTop }]}>
        <View style={[styles.brandMark, illustrated && { backgroundColor: cozy.sage }]}><Text style={styles.brandMarkText}>ㅎ</Text></View>
        <Text style={[styles.lobbyBrand, illustrated && { color: cozy.sageDark }]}>하늘마트</Text>
        {!illustrated && <Text style={styles.lobbyTagline}>좋은 하루를 담아가세요</Text>}
      </View>
    </> : null}
    {elevatorFacade ? <View testID="market-elevator-wall-facade" style={[styles.elevatorFacade, {
      left: elevatorFacade.x, top: elevatorFacade.y,
      width: elevatorFacade.width, height: elevatorFacade.height,
    }]}>
      <View style={styles.elevatorHeader}><Text style={styles.elevatorHeading}>엘리베이터</Text><Text style={styles.elevatorFloor}>1F</Text></View>
      <View style={[styles.elevatorPanel, { left: 0 }]} /><View style={[styles.elevatorPanel, { right: 0 }]} />
    </View> : null}
    {walls.map((wall, index) => {
      const horizontal = wall.width > wall.height;
      return <View key={index} testID={`market-wall-${index}`} style={[styles.wall,
        { left: wall.x, top: wall.y, width: wall.width, height: wall.height }]}>
        <LinearGradient colors={illustrated ? horizontal ? [cozy.cream, cozy.wall, cozy.sage] : [cozy.peach, cozy.wall, cozy.sage]
          : horizontal ? ['#F9F6ED', '#E8E5D9', '#BCC7B8'] : ['#E3E4D8', '#F8F6ED', '#BBC8B8']}
          start={{ x: 0, y: 0 }} end={horizontal ? { x: 0, y: 1 } : { x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        <View style={[styles.wallCoping, horizontal ? { left: 0, right: 0, top: 0, height: 3 }
          : { left: 0, top: 0, bottom: 0, width: 3 }]} />
        <View style={[styles.wallSkirt, illustrated && { backgroundColor: cozy.sageDark }, horizontal ? { left: 0, right: 0, bottom: 0, height: 4 }
          : { right: 0, top: 0, bottom: 0, width: 4 }]} />
      </View>;
    })}
    {sales ? <View testID="market-store-fascia" style={[styles.storeFascia, illustrated && styles.cozyFascia,
      { left: sales.x + 24, top: Math.max(4, sales.y - 76), width: sales.width - 48 }]}>
      <View style={styles.fasciaStripe} />
      {!illustrated && <Text style={styles.fasciaSubheading}>우리 동네, 매일의 신선함</Text>}
      <Text style={styles.fasciaBrand}>하늘마트</Text>
      <View style={styles.fasciaRule} />
      {!illustrated && <Text style={styles.fasciaEnglish}>HANEUL MARKET</Text>}
      {illustrated && <View pointerEvents="none" style={styles.awning}>{Array.from({ length: Math.ceil((sales.width - 48) / 35) }, (_, i) => <View key={i}
        style={{ height: 13, width: 35, backgroundColor: i % 2 ? cozy.cream : cozy.peach, borderBottomLeftRadius: 7, borderBottomRightRadius: 7 }} />)}</View>}
    </View> : null}
    {gates.map(({ id, gate, axis, boundary }) => {
      const vertical = axis === 'x';
      return <View key={id} testID={`market-alarm-gate-${id}`} style={{ position: 'absolute',
        left: gate.x, top: gate.y, width: gate.width, height: gate.height }}>
        <View testID={`market-alarm-beam-${id}`} style={[styles.beam, vertical
          ? { left: boundary - gate.x - 1, top: 0, width: 2, height: gate.height }
          : { left: 0, top: boundary - gate.y - 1, width: gate.width, height: 2 }]} />
        {[0, 1].map(index => <View key={index} style={[styles.alarmColumn, vertical
          ? { left: boundary - gate.x - 5, top: index * gate.height - 38 }
          : { left: index * gate.width - 5, top: boundary - gate.y - 38 }]}>
          <View style={styles.alarmLight} /><View style={styles.alarmSensor} /><View style={styles.alarmFoot} />
        </View>)}
      </View>;
    })}
    {common ? <>
      <View style={[styles.welcomeMat, { left: common.gate.x - 7, top: common.gate.y - 70,
        width: common.gate.width + 14 }]}>
        <View style={styles.welcomeMatInset}><Text style={styles.welcomeText}>어서 오세요</Text></View>
      </View>
      <View testID="market-common-door-frame" style={[styles.door, { left: common.gate.x,
        top: common.gate.y, width: common.gate.width, height: common.gate.height }]}>
        <View style={styles.threshold} />
        <View style={[styles.glass, { left: 0, width: common.gate.width * 0.22 }]} />
        <View style={[styles.glass, { right: 0, width: common.gate.width * 0.22 }]} />
        <View style={[styles.doorJamb, { left: -4 }]} /><View style={[styles.doorJamb, { right: -4 }]} />
      </View>
    </> : null}
  </View>;
});

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, top: 0, backgroundColor: '#BDCABD' },
  floor: { position: 'absolute', overflow: 'hidden', backgroundColor: '#F2F1E9' },
  lobby: { backgroundColor: '#E3E9E2' },
  grout: { position: 'absolute', backgroundColor: 'rgba(114,128,117,0.17)' },
  salesBorder: { position: 'absolute',
    borderWidth: 2, borderColor: 'rgba(167,180,155,0.22)' },
  serviceFloor: { position: 'absolute',
    backgroundColor: '#EAE7DA', borderRadius: 7, borderWidth: 1, borderColor: '#DBDDCF' },
  lobbySeatingFloor: { position: 'absolute',
    borderRadius: 7, borderWidth: 1, borderColor: '#D5D9C9', backgroundColor: '#E8E7DA' },
  checkoutLane: { position: 'absolute', backgroundColor: 'rgba(198,204,185,0.23)',
    borderColor: 'rgba(139,155,125,0.2)', borderWidth: 1, borderRadius: 4 },
  queueLine: { position: 'absolute', top: 38, bottom: 42, width: 1, backgroundColor: 'rgba(107,134,117,0.20)' },
  queueArrow: { position: 'absolute', bottom: 11, width: 23, textAlign: 'center', color: '#90A18A', fontSize: 21 },
  lobbyRule: { height: 1, backgroundColor: '#CDD7C8', position: 'absolute' },
  lobbyInlay: { position: 'absolute', width: 160, alignItems: 'center', opacity: 0.48 },
  brandMark: { width: 30, height: 27, borderRadius: 8, backgroundColor: '#8AA18B', justifyContent: 'center', alignItems: 'center' },
  brandMarkText: { fontFamily: fonts.bold, fontSize: 24, color: '#E9EDE6', lineHeight: 27 },
  lobbyBrand: { fontFamily: fonts.cafe24Ssurround, fontSize: 23, color: '#587565', marginTop: 6 },
  lobbyTagline: { fontFamily: fonts.medium, fontSize: 8, letterSpacing: 1.1, color: '#587565', marginTop: 5 },
  elevatorFacade: { position: 'absolute', backgroundColor: '#DDDCCD', borderColor: '#A5B29E', borderWidth: 1,
    borderBottomWidth: 5, borderBottomColor: '#788D7C' },
  elevatorHeader: { position: 'absolute', left: 6, right: 6, top: 5, height: 23, backgroundColor: '#587565',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 },
  elevatorHeading: { fontFamily: fonts.semibold, fontSize: 10, color: '#F7F4EC', letterSpacing: 1 },
  elevatorFloor: { fontFamily: fonts.bold, fontSize: 10, color: '#D9E2CE' },
  elevatorPanel: { position: 'absolute', width: 3, top: 29, bottom: 0, backgroundColor: '#C4CCBA' },
  wall: { position: 'absolute', borderWidth: 1, borderColor: '#A9B49D', backgroundColor: '#E7E8DC' },
  wallCoping: { position: 'absolute', backgroundColor: '#F8F5EB' },
  wallSkirt: { position: 'absolute', backgroundColor: '#819581' },
  storeFascia: { position: 'absolute', height: 73, borderRadius: 4,
    backgroundColor: '#587565', borderWidth: 2, borderColor: '#38584A', alignItems: 'center', justifyContent: 'center' },
  fasciaStripe: { position: 'absolute', top: 4, bottom: 4, left: 4, right: 4, borderWidth: 0.7, borderColor: '#A7B698', borderRadius: 2 },
  fasciaSubheading: { fontFamily: fonts.medium, fontSize: 8, color: '#DDE5D7', letterSpacing: 2 },
  fasciaBrand: { fontFamily: fonts.cafe24Ssurround, fontSize: 25, color: '#FFF9E8', lineHeight: 30 },
  fasciaRule: { width: 27, height: 1, backgroundColor: '#D6B68C', marginBottom: 3 },
  fasciaEnglish: { fontFamily: fonts.medium, fontSize: 6, color: '#D7DFC9', letterSpacing: 2.4 },
  cozyFascia: { backgroundColor: '#849877', borderColor: '#6E7D5F', borderWidth: 1, borderRadius: 9 },
  awning: { position: 'absolute', height: 13, bottom: -11, left: -1, right: -1, flexDirection: 'row', overflow: 'hidden' },
  beam: { position: 'absolute', backgroundColor: 'rgba(185,107,82,0.35)' },
  alarmColumn: { position: 'absolute', width: 10, height: 45, borderRadius: 3, borderWidth: 1,
    borderColor: '#A78870', backgroundColor: '#F4F1E8' },
  alarmLight: { position: 'absolute', top: 3, left: 2, right: 2, height: 3, backgroundColor: '#C46D5E', borderRadius: 1 },
  alarmSensor: { position: 'absolute', top: 11, left: 3, width: 2, height: 20, backgroundColor: '#C7CBBF' },
  alarmFoot: { position: 'absolute', bottom: -1, left: -3, width: 14, height: 5, borderRadius: 2, backgroundColor: '#8B9C8A' },
  welcomeMat: { position: 'absolute', height: 53, borderRadius: 3, padding: 5, backgroundColor: '#738972', borderColor: '#647E63', borderWidth: 1 },
  welcomeMatInset: { flex: 1, borderWidth: 1, borderColor: '#A7B39A', justifyContent: 'center', alignItems: 'center' },
  welcomeText: { fontFamily: fonts.cafe24Ssurround, fontSize: 15, color: '#ECECDD', letterSpacing: 2 },
  door: { position: 'absolute' },
  threshold: { ...StyleSheet.absoluteFill, backgroundColor: '#B7C3B7', borderTopWidth: 2, borderBottomWidth: 2, borderColor: '#6D8775' },
  glass: { position: 'absolute', height: 32, bottom: 1, backgroundColor: 'rgba(181,216,213,0.64)', borderWidth: 1, borderColor: '#8BA6A0', borderTopWidth: 3 },
  doorJamb: { position: 'absolute', bottom: -2, width: 5, height: 37, backgroundColor: '#698574', borderTopColor: '#D0D9C9', borderTopWidth: 2 },
});

const MapleFloor = memo(function MapleFloor({ width, height, lobby }: { width: number; height: number; lobby: boolean }) {
  const rowHeight = 42;
  return <View testID="market-maple-floor" pointerEvents="none" style={StyleSheet.absoluteFill}>
    {Array.from({ length: Math.ceil(height / rowHeight) }, (_, row) => <View key={row} style={{
      position: 'absolute', left: 0, right: 0, top: row * rowHeight, height: rowHeight,
      backgroundColor: (lobby ? ['#E6E4CC', '#E9E7D0', '#E2E1C8'] : ['#E9D3B3', '#EEDABD', '#EBD5B6', '#F0DEC3'])[row % (lobby ? 3 : 4)],
      borderBottomWidth: 0.8, borderBottomColor: '#BCA58742',
    }}>
      {Array.from({ length: Math.ceil(width / 220) }, (_, col) => <View key={col} style={{ position: 'absolute',
        left: col * 220 + (row % 3) * 73, width: 0.7, top: 0, bottom: 0, backgroundColor: '#B99A7640' }} />)}
      <View style={{ position: 'absolute', left: 14 + row % 3 * 47, width: width * 0.56, height: 1,
        top: 17 + row % 3 * 3, backgroundColor: '#C7AA8020' }} />
    </View>)}
  </View>;
});
