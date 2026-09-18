import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { PressScale } from '../PressScale';

import { marketGameArt } from '../../game/gameAssets';
import { MarketRetailShelf } from './MarketRetailShelf';
import { MarketPersonIllustration } from './MarketPersonIllustration';
import { MarketArchitectureLayer } from './MarketArchitectureLayer';
import {
  MARKET_SHELF_UNIT_HEIGHT, MARKET_SHELF_UNIT_STEP, MARKET_SHELF_UNIT_WIDTH,
  MARKET_SHELF_VERTICAL_STEP, getMarketShelfUnitRects,
} from '../../game/marketFixtureLayout';
import { getMarketRenderDepth, type MarketConstructionZone, type MarketKioskPlacement, type MarketCheckoutPlacement, type MarketEnvironment, type MarketPerson, type MarketShelfPlacement } from '../../game/marketEnvironment';
import {
  MARKET_PERSON_HEIGHT, getMarketPersonCollider,
  MARKET_PERSON_WIDTH,
} from '../../game/marketPersonLayout';
import {
  MARKET_CASHIER_POINT,
  MARKET_CHECKOUT_RECT,
  MARKET_CHECKOUT_SCALE,
} from '../../game/prototypeWorld';
import { marketCategories, type MarketCategory, type MarketCategoryId } from '../../game/scenarios';
import { fonts } from '../../theme';

/** Visual layers only: movement and hit targets stay with the shared world. */
export function MarketInteriorBackdrop({ environment }: { environment?: MarketEnvironment } = {}) {
  return <MarketArchitectureLayer environment={environment} />;
}

export function MarketCategoryFixture({
  active,
  category,
  orientation = 'horizontal',
}: {
  active: boolean;
  category: MarketCategory;
  orientation?: 'horizontal' | 'vertical';
}) {
  return (
    <View pointerEvents="none" style={styles.fixtureContent}>
      {[0, 1].map((index) => (
        <View key={index} style={[styles.shelfUnit, orientation === 'vertical'
          ? { left: 0, bottom: (1 - index) * MARKET_SHELF_VERTICAL_STEP }
          : { left: index * MARKET_SHELF_UNIT_STEP }]}>
          <View style={[styles.floorShadow, active && styles.floorFocus]} />
          <MarketRetailShelf categoryId={category.id} variant={index} />
        </View>
      ))}
      <MarketCategoryMarker category={category} active={active} />
    </View>
  );
}

function MarketCategoryMarker({ category, active }: { category: MarketCategory; active: boolean }) {
  return (<View testID={`market-aisle-marker-${category.id}`} style={[styles.categorySign, active && styles.categorySignActive]}>
        <Text numberOfLines={1} style={styles.categoryName}>{category.label}</Text>
        {active ? <Ionicons color="#587565" name="chevron-forward" size={11} /> : null}
      </View>
  );
}

/** Each shelf unit owns a touch target. The clear gap between the pair stays
 * available for walking, while both units open the same inventory. */
export function MarketShelfTarget({ placement, categoryId, active, highlighted = false,
  onPress, accessibilityLabel, disabled = false }: {
  placement: MarketShelfPlacement;
  categoryId: MarketCategoryId;
  active: boolean;
  highlighted?: boolean;
  onPress: (event: GestureResponderEvent) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  const category = marketCategories.find(item => item.id === categoryId)!;
  const units = getMarketShelfUnitRects(placement);
  // Both units are direct world siblings: a pillar/player in the aisle can sit
  // in front of the rear fixture and behind the front one at the same time.
  return <>
    {units.map((unit, index) => <View key={index} pointerEvents="box-none"
      testID={index === 0 ? `market-shelf-target-${categoryId}` : `market-shelf-target-${categoryId}-second`}
      style={[styles.shelfTarget, { left: placement.x, top: placement.y, width: placement.width,
        height: placement.height, zIndex: getMarketRenderDepth(unit.y + unit.height) }]}>
      <View pointerEvents="none" style={[styles.shelfUnit, { left: unit.x - placement.x,
        top: unit.y - placement.y, bottom: undefined }]}>
        <View style={[styles.floorShadow, (active || highlighted) && styles.floorFocus]} />
        <MarketRetailShelf categoryId={categoryId} variant={index} />
      </View>
      <PressScale accessible={index === 0} aria-hidden={index !== 0}
        tabIndex={index === 0 ? 0 : -1} accessibilityElementsHidden={index !== 0}
        importantForAccessibility={index === 0 ? 'auto' : 'no-hide-descendants'}
        accessibilityLabel={index === 0 ? accessibilityLabel : undefined}
        accessibilityRole="button"
        accessibilityHint={index === 0 ? '가까이 이동한 뒤 살펴보기 버튼을 누릅니다' : undefined}
        accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} scaleTo={1}
        testID={`market-shelf-touch-${categoryId}-${index + 1}`}
        style={{ position: 'absolute', left: unit.x - placement.x, top: unit.y - placement.y,
          width: unit.width, height: unit.height }}>{null}</PressScale>
    </View>)}
    <View pointerEvents="none" style={{ position: 'absolute', left: placement.x, top: placement.y,
      width: placement.width, height: placement.height, zIndex: getMarketRenderDepth(placement.y + placement.height) + 1 }}>
      <MarketCategoryMarker category={category} active={active || highlighted} />
    </View>
  </>;
}

export function MarketCheckoutFixture({ active, cashierPresent = true, counter, index = 0 }: {
  active: boolean; cashierPresent?: boolean; counter?: MarketCheckoutPlacement; index?: number;
}) {
  const rect = counter?.rect ?? MARKET_CHECKOUT_RECT;
  const cashierPoint = counter?.cashierPoint ?? MARKET_CASHIER_POINT;
  const appearance = counter?.cashierAppearance ?? (index === 0 ? 0 : 2);
  const cashierFootprint = getMarketPersonCollider(cashierPoint, 'employee', appearance);
  return (
    <View pointerEvents="none" style={styles.fixtureContent}>
      <View style={[styles.cashierFloorMat, { left: cashierFootprint.x - rect.x, top: cashierFootprint.y - rect.y,
        width: cashierFootprint.width, height: cashierFootprint.height }]} testID="market-cashier-workspace" />
      {cashierPresent ? <View
        accessibilityLabel="계산대 왼쪽에서 기다리는 직원"
        accessibilityRole="image"
        pointerEvents="none"
        style={[styles.cashier, { left: cashierPoint.x - rect.x - MARKET_PERSON_WIDTH / 2, top: cashierPoint.y - rect.y - MARKET_PERSON_HEIGHT }]}
        testID="market-cashier"
      >
        <MarketPersonIllustration kind="employee" appearance={appearance}
          testID={`market-cashier-art-${index + 1}`} />
      </View> : null}
      <View testID="market-checkout-shadow" style={[styles.counterShadow, active && styles.floorFocus]} />
      <Image
        accessibilityIgnoresInvertColors
        accessible={false}
        resizeMode="contain"
        source={marketGameArt.checkout}
        style={styles.counterArt}
        testID="market-checkout-art"
      />
      <View style={[styles.counterNumberPole, { left: rect.width / 2 - 1.5 }]} />
      <View testID={`market-checkout-marker-${index + 1}`} accessibilityLabel={`${index + 1}번 계산대`}
        style={[styles.counterSign, { left: (rect.width - 48) / 2 }, active && styles.counterSignActive]}>
        <View style={styles.counterSignHeader}>
          <Ionicons color="#587565" name="card-outline" size={11} />
          <Text numberOfLines={1} style={styles.counterName}>{index + 1}</Text>
        </View>
      </View>
      <View testID={`market-checkout-status-${index + 1}`} style={[styles.counterStatus, { left: (rect.width - 64) / 2 }]}>
        <View style={[styles.statusDot, !cashierPresent && styles.statusDotWaiting]} />
        <Text numberOfLines={1} style={styles.counterStatusText}>{cashierPresent ? '계산 가능' : '직원 호출'}</Text>
      </View>
    </View>
  );
}

/** Preserve the floor anchor while labels stay readable in one line. */
export function MarketPersonFixture({ person, active = false }: { person: MarketPerson; active?: boolean }) {
  const employee = person.kind === 'employee';
  return (
    <View pointerEvents="none" style={styles.personContent} testID={`market-person-${person.id}`}>
      <MarketPersonIllustration kind={person.kind} appearance={person.appearance} active={active}
        testID={`market-person-art-${person.id}`} />
      {employee ? <View testID={`market-staff-badge-${person.id}`} style={[styles.personLabel, active && styles.personLabelActive]}>
        <View style={styles.staffBadgeStripe} />
        <Text numberOfLines={1} style={styles.personLabelText}>{person.label}</Text>
        {active ? <Ionicons name="chatbubble-ellipses-outline" color="#587565" size={11} /> : null}
      </View> : null}
    </View>
  );
}

export function MarketKioskFixture({ kiosk, active = false }: { kiosk: MarketKioskPlacement; active?: boolean }) {
  return <View pointerEvents="none" style={styles.fixtureContent}>
    <View style={[styles.kioskFloorShadow, active && styles.floorFocus]} />
    <Image accessible={false} source={require('../../../assets/images/game/market/interior/self-checkout-v1.png')}
      resizeMode="contain" style={styles.selfCheckoutArt} testID={`market-kiosk-art-${kiosk.id}`} />
    <View style={[styles.selfCheckoutLabel, active && styles.categorySignActive]}>
      <Ionicons name="scan-outline" size={10} color="#587565" />
      <Text style={styles.selfCheckoutText}>셀프 {kiosk.number}</Text>
    </View>
  </View>;
}

/** Decorative objects have no action targets. The working kiosks belong to checkout lanes. */
export function MarketEnvironmentObjects({ environment }: { environment: MarketEnvironment }) {
  return <>
    {environment.objects.filter(object => object.kind !== 'kiosk').map((object) => {
      const { rect } = object;
      return <View key={object.id} pointerEvents="none" accessibilityRole="image"
        accessibilityLabel={object.kind === 'pillar' ? '마트 기둥' : object.kind === 'restSet' ? '의자 · 원형 테이블 · 의자 휴게석'
          : object.kind === 'elevator' ? '엘리베이터 · 장식' : object.kind === 'atm' ? 'ATM · 이용 준비 중'
            : object.kind === 'planter' ? '로비 화분' : object.kind === 'chair' ? '휴식용 의자' : '무인 계산대 · 이용 준비 중'}
        style={[styles.environmentObject, { left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: getMarketRenderDepth(rect.y + rect.height) }]}
        testID={`market-object-${object.id}`}>
        <View style={styles.objectShadow} />
        {object.kind === 'pillar' ? <>
          <View style={styles.pillarBody} /><View style={styles.pillarTop} /><View style={styles.pillarBase} />
        </> : object.kind === 'elevator' || object.kind === 'atm' ? <Image accessible={false} resizeMode="contain"
          source={object.kind === 'atm' ? marketGameArt.atm : marketGameArt.elevator}
          style={object.kind === 'atm' ? styles.atmArt : styles.elevatorArt} />
          : object.kind === 'restSet' ? <>
            {[0, 72].map(left => <View key={left} style={[styles.restChair, { left }]}>
              <View style={[styles.restChairLeg, { left: 3 }]} /><View style={[styles.restChairLeg, { right: 3 }]} />
              <View style={styles.restChairBack} /><View style={styles.restChairSeat} />
            </View>)}
            <View style={styles.roundTableStem} /><View style={styles.roundTableTop} />
          </> : object.kind === 'planter' ? <>
            <View style={styles.plantStem} />
            {[{ left: -2, bottom: 29, rotate: '-34deg' }, { left: 12, bottom: 38, rotate: '24deg' },
              { left: 2, bottom: 46, rotate: '-12deg' }].map((leaf, index) => <View key={index}
                style={[styles.plantLeaf, { left: leaf.left, bottom: leaf.bottom, transform: [{ rotate: leaf.rotate }] }]} />)}
            <View style={styles.planterPot} /><View style={styles.planterRim} />
          </> : object.kind === 'chair' ? <>
          <View style={[styles.chairLeg, { left: 5 }]} /><View style={[styles.chairLeg, { right: 5 }]} />
          <View style={styles.chairBack} /><View style={styles.chairSeat} />
        </> : <>
          <View style={styles.kioskBase} /><View style={styles.kioskStem} />
          <View style={styles.kioskHead}><View style={styles.kioskScreen}><Ionicons name="scan-outline" size={23} color="#B7D4CE" /></View></View>
          <View style={styles.kioskLabel}><Text style={styles.kioskLabelText}>이용 준비 중</Text></View>
        </>}
      </View>;
    })}
    {environment.constructionZones?.map(zone => <MarketConstructionBarrier key={zone.id} zone={zone} />)}
  </>;
}

/** One shared ground rectangle drives the fence image, painter order and collision. */
export function MarketConstructionBarrier({ zone }: { zone: MarketConstructionZone }) {
  const { rect } = zone;
  const artWidth = rect.width * 1.04;
  const artHeight = artWidth * 793 / 1983;
  return <View pointerEvents="none" accessibilityRole="image" accessibilityLabel="공사 중인 입구"
    testID={`market-construction-${zone.id}`} style={[styles.environmentObject, {
      left: rect.x, top: rect.y, width: rect.width, height: rect.height,
      zIndex: getMarketRenderDepth(rect.y + rect.height),
    }]}>
    <Image accessible={false} aria-hidden resizeMode="contain"
      source={require('../../../assets/images/game/market/interior/construction-fence-v1.png')}
      testID={`market-construction-art-${zone.id}`}
      style={{ position: 'absolute', width: artWidth, height: artHeight,
        left: (rect.width - artWidth) / 2, bottom: -89 * artWidth / 1983 }} />
  </View>;
}

export function MarketExitMarker({ active, entrance = false, kind, blocked = false }: {
  active: boolean;
  blocked?: boolean;
  entrance?: boolean;
  kind?: 'entrance' | 'exit' | 'common-door';
}) {
  const markerKind = kind ?? (entrance ? 'entrance' : 'exit');
  const entering = markerKind === 'entrance';
  const common = markerKind === 'common-door';
  const label = common ? (active ? '마을로 나가기' : '공동 출입문') : entering ? '입구' : '출구';
  return (
    <View pointerEvents="none" testID={`market-wayfinding-${markerKind}`}
      style={[styles.exitMat, active && styles.exitMatActive]}>
      <View style={[styles.floorDirectionRule, entering && styles.entranceRule, common && styles.commonRule]} />
      <View style={styles.floorDirectionContent}>
        <Ionicons color={entering ? '#A66754' : '#587565'}
          name={common ? 'exit-outline' : entering ? (blocked ? 'construct-outline' : 'arrow-up') : 'arrow-down'} size={common ? 20 : 18} />
        <Text numberOfLines={1} style={[styles.exitText, entering && styles.entranceText,
          common && styles.commonDoorText]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  selfCheckoutArt: { position: 'absolute', left: -8, bottom: -8, width: 64, height: 90 },
  kioskFloorShadow: { position: 'absolute', left: -3, bottom: -3, width: 54, height: 18, borderRadius: 20, backgroundColor: 'rgba(48,75,84,0.10)' },
  selfCheckoutLabel: { position: 'absolute', bottom: -19, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, width: 54, height: 18, borderRadius: 3, borderWidth: 1, borderColor: '#D8D4C7', backgroundColor: '#F7F4EC' },
  selfCheckoutText: { fontFamily: fonts.bold, fontSize: 9, color: '#304B54' },
  shelfTarget: { position: 'absolute', overflow: 'visible' },
  plantStem: { position: 'absolute', left: 13, bottom: 17, width: 3, height: 33, backgroundColor: '#587565' },
  plantLeaf: { position: 'absolute', width: 17, height: 25, borderRadius: 13, backgroundColor: '#789B78', borderWidth: 1, borderColor: '#587565' },
  planterPot: { position: 'absolute', bottom: 0, left: 3, width: 22, height: 23, backgroundColor: '#C48B57', borderColor: '#9B724F', borderWidth: 1, borderBottomLeftRadius: 7, borderBottomRightRadius: 7 },
  planterRim: { position: 'absolute', bottom: 18, left: 1, width: 26, height: 7, borderRadius: 3, backgroundColor: '#DAB187', borderWidth: 1, borderColor: '#A9815D' },
  atmArt: { position: 'absolute', bottom: 0, left: -10, width: 80, height: 125 },
  elevatorArt: { position: 'absolute', bottom: 0, left: -7, width: 94, height: 110 },
  restChair: { position: 'absolute', bottom: 0, width: 28, height: 58 },
  restChairLeg: { position: 'absolute', bottom: 0, height: 18, width: 3, backgroundColor: '#788175' },
  restChairBack: { position: 'absolute', bottom: 23, height: 27, left: 1, width: 26, borderRadius: 4, borderWidth: 1, borderColor: '#B59371', backgroundColor: '#D9BB92' },
  restChairSeat: { position: 'absolute', bottom: 12, height: 16, left: 0, width: 28, borderRadius: 4, borderWidth: 1, borderColor: '#B59371', backgroundColor: '#E8CFA9' },
  roundTableStem: { position: 'absolute', bottom: 0, left: 48, height: 29, width: 4, backgroundColor: '#788175' },
  roundTableTop: { position: 'absolute', bottom: 20, left: 32, width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#B8A88D', backgroundColor: '#F1E7D5' },
  personContent: { ...StyleSheet.absoluteFill, height: MARKET_PERSON_HEIGHT, width: MARKET_PERSON_WIDTH, overflow: 'visible' },
  personLabel: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F4EC',
    borderColor: '#D3DBD0', borderWidth: 1, borderRadius: 3, bottom: -20, flexDirection: 'row', gap: 3,
    left: (MARKET_PERSON_WIDTH - 82) / 2, width: 82, height: 20, paddingHorizontal: 5, position: 'absolute' },
  personLabelActive: { borderColor: '#587565', backgroundColor: '#F0F5ED' },
  staffBadgeStripe: { alignSelf: 'stretch', width: 3, backgroundColor: '#587565', borderRadius: 1, marginVertical: 3 },
  personLabelText: { color: '#304B54', flexShrink: 0, fontFamily: fonts.cafe24Ssurround, fontSize: 10, lineHeight: 14 },
  environmentObject: { position: 'absolute', overflow: 'visible' },
  constructionLabel: { position: 'absolute', top: -20, width: 72, height: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F0E3', borderWidth: 1, borderColor: '#C48B57', borderRadius: 3 },
  constructionLabelText: { color: '#795632', fontFamily: fonts.bold, fontSize: 10, lineHeight: 13 },
  objectShadow: { backgroundColor: 'rgba(48,75,84,0.10)', borderRadius: 30, bottom: -5, height: 16, left: -8, position: 'absolute', right: -8 },
  pillarBody: { backgroundColor: '#E9E6DD', borderColor: '#B5BCAF', borderWidth: 1.5, bottom: 2, height: 150, left: 1, position: 'absolute', width: 34 },
  pillarTop: { backgroundColor: '#F7F4EC', borderColor: '#B5BCAF', borderRadius: 3, borderWidth: 1.5, bottom: 144, height: 12, left: -3, position: 'absolute', width: 42 },
  pillarBase: { backgroundColor: '#BDC8BE', borderColor: '#94A699', borderRadius: 3, borderWidth: 1.5, bottom: 0, height: 12, left: -3, position: 'absolute', width: 42 },
  chairLeg: { backgroundColor: '#788175', bottom: 0, height: 24, position: 'absolute', width: 5 },
  chairBack: { backgroundColor: '#D9BB92', borderColor: '#B59371', borderRadius: 6, borderWidth: 1.5, bottom: 34, height: 35, left: 1, position: 'absolute', width: 36 },
  chairSeat: { backgroundColor: '#E8CFA9', borderColor: '#B59371', borderRadius: 5, borderWidth: 1.5, bottom: 15, height: 23, left: -2, position: 'absolute', width: 42 },
  kioskBase: { backgroundColor: '#A9B9B0', borderColor: '#6E897C', borderRadius: 5, borderWidth: 1.5, bottom: 0, height: 15, left: 5, position: 'absolute', width: 54 },
  kioskStem: { backgroundColor: '#DFE7E0', borderColor: '#99ADA0', borderWidth: 1.5, bottom: 12, height: 57, left: 21, position: 'absolute', width: 22 },
  kioskHead: { backgroundColor: '#F7F4EC', borderColor: '#87A28F', borderRadius: 7, borderWidth: 2, bottom: 53, height: 66, left: 0, padding: 6, position: 'absolute', width: 64 },
  kioskScreen: { alignItems: 'center', backgroundColor: '#304B54', borderRadius: 3, flex: 1, justifyContent: 'center' },
  kioskLabel: { backgroundColor: '#F7F4EC', borderColor: '#D1D9CF', borderWidth: 1, borderRadius: 3, bottom: -19, left: -8, paddingHorizontal: 4, paddingVertical: 2, position: 'absolute', width: 80 },
  kioskLabelText: { color: '#5D746C', fontFamily: fonts.medium, fontSize: 9, lineHeight: 12, textAlign: 'center' },
  fixtureContent: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    overflow: 'visible',
  },
  floorShadow: {
    backgroundColor: 'rgba(48,75,84,0.10)',
    borderRadius: 50,
    bottom: -2.5,
    height: 17.5,
    left: -3,
    position: 'absolute',
    width: 116,
  },
  floorFocus: {
    backgroundColor: 'rgba(88,117,101,0.16)',
  },
  // The collision rectangle is the footprint, not the full upright illustration.
  // Keep the feet on its bottom edge and let the shelving rise above that footprint.
  shelfUnit: {
    bottom: 0,
    height: MARKET_SHELF_UNIT_HEIGHT,
    width: MARKET_SHELF_UNIT_WIDTH,
    position: 'absolute',
    overflow: 'visible',
  },
  categorySign: {
    alignItems: 'center', alignSelf: 'center', backgroundColor: '#F7F4EC',
    borderColor: '#D8D4C7', borderLeftColor: '#C48B57', borderWidth: 1, borderLeftWidth: 3,
    borderRadius: 3, bottom: -22, flexDirection: 'row', gap: 5, height: 24, minWidth: 62, maxWidth: 92,
    justifyContent: 'center', paddingHorizontal: 9, position: 'absolute',
  },
  categorySignActive: { borderColor: '#8DAB95', borderLeftColor: '#587565', backgroundColor: '#F0F5ED' },
  aisleCode: { alignItems: 'center', justifyContent: 'center', height: 16, width: 19, borderRadius: 2, backgroundColor: '#EBDCC6' },
  aisleCodeActive: { backgroundColor: '#587565' },
  aisleCodeText: { color: '#705539', fontFamily: fonts.bold, fontSize: 9, lineHeight: 12 },
  aisleCodeTextActive: { color: '#F7F4EC' },
  categoryName: { color: '#304B54', fontFamily: fonts.cafe24Ssurround, fontSize: 11, lineHeight: 15, paddingTop: 1 },
  counterShadow: {
    backgroundColor: 'rgba(48,75,84,0.10)',
    borderRadius: 50,
    bottom: -5 * MARKET_CHECKOUT_SCALE,
    height: 118.5,
    left: -3,
    position: 'absolute',
    width: 54,
  },
  cashierFloorMat: {
    backgroundColor: 'rgba(88,117,101,0.11)',
    borderRadius: 999,
    position: 'absolute',
  },
  // Both employees stand at the same left-hand working side of their counter.
  cashier: {
    height: MARKET_PERSON_HEIGHT,
    left: MARKET_CASHIER_POINT.x - MARKET_CHECKOUT_RECT.x - MARKET_PERSON_WIDTH / 2,
    position: 'absolute',
    top: MARKET_CASHIER_POINT.y - MARKET_CHECKOUT_RECT.y - MARKET_PERSON_HEIGHT,
    width: MARKET_PERSON_WIDTH,
  },
  counterArt: {
    bottom: 0,
    height: 142.5,
    left: -12,
    position: 'absolute',
    width: 72,
  },
  counterNumberPole: { backgroundColor: '#8C9E92', borderRightColor: '#6B8073', borderRightWidth: 1,
    position: 'absolute', top: -68, width: 3, height: 50 },
  counterSign: { backgroundColor: '#F7F4EC', borderColor: '#CCD5C8', borderTopColor: '#587565',
    borderWidth: 1, borderTopWidth: 3, borderRadius: 3, position: 'absolute', top: -104, width: 48, height: 34,
    justifyContent: 'center', alignItems: 'center', gap: 2 },
  counterSignActive: { borderColor: '#587565', borderTopColor: '#304B54' },
  counterSignHeader: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  counterName: { color: '#304B54', fontFamily: fonts.cafe24Ssurround, fontSize: 18, lineHeight: 23 },
  counterStatus: { position: 'absolute', top: -66, width: 64, height: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: '#F7F4EC', borderRadius: 3 },
  statusDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#587565' },
  statusDotWaiting: { backgroundColor: '#C48B57' },
  counterStatusText: { color: '#5E746A', fontFamily: fonts.medium, fontSize: 8, lineHeight: 11 },
  exitMat: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', opacity: 0.82 },
  exitMatActive: { opacity: 1 },
  floorDirectionRule: { width: 36, height: 2, marginBottom: 4, backgroundColor: '#587565' },
  entranceRule: { backgroundColor: '#A66754' },
  commonRule: { width: 72, backgroundColor: '#7193A5' },
  floorDirectionContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  entranceText: { color: '#A66754' },
  commonDoorText: { color: '#304B54' },
  exitText: { color: '#587565', fontFamily: fonts.cafe24Ssurround, fontSize: 11, lineHeight: 16, paddingTop: 1 },
});
