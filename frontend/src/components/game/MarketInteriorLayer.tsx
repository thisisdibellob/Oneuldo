import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';

import { marketGameArt } from '../../game/gameAssets';
import { MarketPersonIllustration } from './MarketPersonIllustration';
import {
  MARKET_SHELF_ART_BOTTOM, MARKET_SHELF_ART_HEIGHT, MARKET_SHELF_ART_WIDTH,
  MARKET_SHELF_UNIT_HEIGHT, MARKET_SHELF_UNIT_STEP, MARKET_SHELF_UNIT_WIDTH,
  MARKET_SHELF_VERTICAL_STEP,
} from '../../game/marketFixtureLayout';
import { MARKET_WALKABLE_AREAS, MARKET_WALLS, type MarketCheckoutPlacement, type MarketEnvironment, type MarketPerson } from '../../game/marketEnvironment';
import {
  MARKET_PERSON_HEIGHT,
  MARKET_PERSON_WIDTH,
} from '../../game/marketPersonLayout';
import {
  MARKET_CASHIER_POINT,
  MARKET_CHECKOUT_RECT,
  MARKET_CHECKOUT_SCALE,
  MARKET_WORLD_HEIGHT,
  MARKET_WORLD_WIDTH,
} from '../../game/prototypeWorld';
import type { MarketCategory } from '../../game/scenarios';
import { fonts } from '../../theme';

/** Visual layers only: the shared world keeps ownership of movement and hit targets. */
export function MarketInteriorBackdrop({ environment }: { environment?: MarketEnvironment } = {}) {
  const areas = environment?.walkableAreas ?? MARKET_WALKABLE_AREAS;
  const walls = environment?.walls ?? MARKET_WALLS;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.backdrop}
    >
      {areas.map(area => <View key={area.id} style={[styles.floorArea, { left: area.x, top: area.y, width: area.width, height: area.height }]}>
        {Array.from({ length: 13 }, (_, i) => i * 96).map(x => <View key={`x${x}`} style={[styles.tileLine, { left: x - area.x, width: 1, top: 0, bottom: 0 }]} />)}
        {Array.from({ length: 14 }, (_, i) => i * 96).map(y => <View key={`y${y}`} style={[styles.tileLine, { top: y - area.y, height: 1, left: 0, right: 0 }]} />)}
      </View>)}
      {walls.map((wall, i) => <View key={i} style={[styles.architectureWall, { left: wall.x, top: wall.y, width: wall.width, height: wall.height }]} />)}
      {environment ? <View style={[styles.alarmGate, { left: environment.entrance.gate.x, top: environment.entrance.alarmBoundaryY - 13, width: environment.entrance.gate.width, height: 26 }]}>
        <View style={styles.alarmBeam} />
        <View style={[styles.alarmPillar, { left: -6 }]} />
        <View style={[styles.alarmPillar, { right: -6 }]} />
      </View> : null}
    </View>
  );
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
      {[marketGameArt.shelves[category.id], marketGameArt.shelfVariants[category.id]].map((source, index) => (
        <View key={index} style={[styles.shelfUnit, orientation === 'vertical'
          ? { left: 0, bottom: (1 - index) * MARKET_SHELF_VERTICAL_STEP }
          : { left: index * MARKET_SHELF_UNIT_STEP }]}>
          <View style={[styles.floorShadow, active && styles.floorFocus]} />
          <Image
            accessibilityIgnoresInvertColors
            accessible={false}
            resizeMode="contain"
            source={source}
            style={[styles.shelfArt, category.id === 'fresh' && styles.freshShelfArt]}
            testID={`market-shelf-art-${category.id}-${index + 1}`}
          />
        </View>
      ))}
      <View style={[styles.categorySign, active && styles.categorySignActive]}>
        <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
        <Text numberOfLines={1} style={styles.categoryName}>{category.label}</Text>
        {active ? <Ionicons color="#48735F" name="chevron-forward" size={14} /> : null}
      </View>
    </View>
  );
}

export function MarketCheckoutFixture({ active, cashierPresent = true, counter, index = 0 }: {
  active: boolean; cashierPresent?: boolean; counter?: MarketCheckoutPlacement; index?: number;
}) {
  const rect = counter?.rect ?? MARKET_CHECKOUT_RECT;
  const cashierPoint = counter?.cashierPoint ?? MARKET_CASHIER_POINT;
  return (
    <View pointerEvents="none" style={styles.fixtureContent}>
      <View style={[styles.cashierFloorMat, { left: cashierPoint.x - rect.x - 22, top: cashierPoint.y - rect.y - 14 }]} testID="market-cashier-workspace" />
      {cashierPresent ? <View
        accessibilityLabel="계산대 뒤에서 기다리는 직원"
        accessibilityRole="image"
        pointerEvents="none"
        style={[styles.cashier, { left: cashierPoint.x - rect.x - MARKET_PERSON_WIDTH / 2, top: cashierPoint.y - rect.y - MARKET_PERSON_HEIGHT }]}
        testID="market-cashier"
      >
        <MarketPersonIllustration kind="employee" appearance={counter?.cashierAppearance ?? (index === 0 ? 0 : 2)}
          testID={`market-cashier-art-${index + 1}`} />
      </View> : null}
      <View style={[styles.counterShadow, active && styles.floorFocus]} />
      <Image
        accessibilityIgnoresInvertColors
        accessible={false}
        resizeMode="contain"
        source={marketGameArt.checkout}
        style={[styles.counterArt, index === 1 && { transform: [{ scaleX: -1 }] }]}
        testID="market-checkout-art"
      />
      <View style={[styles.categorySign, styles.counterSign, active && styles.categorySignActive]}>
        <Ionicons color="#48735F" name="card-outline" size={13} />
        <Text style={[styles.categoryName, styles.counterName]}>{index + 1}번 계산대</Text>
        {active ? <Ionicons color="#48735F" name="chevron-forward" size={14} /> : null}
      </View>
    </View>
  );
}

/** Keep the smaller body at its floor anchor without shrinking employee labels. */
export function MarketPersonFixture({ person, active = false }: { person: MarketPerson; active?: boolean }) {
  const employee = person.kind === 'employee';
  return (
    <View pointerEvents="none" style={styles.personContent} testID={`market-person-${person.id}`}>
      <MarketPersonIllustration kind={person.kind} appearance={person.appearance} active={active}
        testID={`market-person-art-${person.id}`} />
      {employee ? <View style={[styles.personLabel, active && styles.categorySignActive]}>
        <Text style={styles.personLabelText}>{person.label}</Text>
        {active ? <Ionicons name="chatbubble-ellipses-outline" color="#48735F" size={13} /> : null}
      </View> : null}
    </View>
  );
}

/** Decorative kiosk intentionally has no press handler, focus target or station. */
export function MarketEnvironmentObjects({ environment }: { environment: MarketEnvironment }) {
  return <>
    {environment.objects.map((object) => {
      const { rect } = object;
      return <View key={object.id} pointerEvents="none" accessibilityRole="image"
        accessibilityLabel={object.kind === 'pillar' ? '마트 기둥' : object.kind === 'restSet' ? '의자 · 원형 테이블 · 의자 휴게석'
          : object.kind === 'elevator' ? '엘리베이터 · 장식' : object.kind === 'atm' ? 'ATM · 이용 준비 중'
            : object.kind === 'chair' ? '휴식용 의자' : '무인 계산대 · 이용 준비 중'}
        style={[styles.environmentObject, { left: rect.x, top: rect.y, width: rect.width, height: rect.height }]}
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
          </> : object.kind === 'chair' ? <>
          <View style={[styles.chairLeg, { left: 5 }]} /><View style={[styles.chairLeg, { right: 5 }]} />
          <View style={styles.chairBack} /><View style={styles.chairSeat} />
        </> : <>
          <View style={styles.kioskBase} /><View style={styles.kioskStem} />
          <View style={styles.kioskHead}><View style={styles.kioskScreen}><Ionicons name="scan-outline" size={23} color="#6B978D" /></View></View>
          <View style={styles.kioskLabel}><Text style={styles.kioskLabelText}>이용 준비 중</Text></View>
        </>}
      </View>;
    })}
  </>;
}

export function MarketExitMarker({ active, entrance = false }: { active: boolean; entrance?: boolean }) {
  return (
    <View pointerEvents="none" style={[styles.exitMat, active && styles.exitMatActive, entrance && styles.entranceMat]}>
      <Ionicons color={entrance ? '#A34B44' : '#516657'} name={entrance ? 'arrow-up' : 'arrow-down'} size={18} />
      <Text style={[styles.exitText, entrance && { color: '#A34B44' }]}>{active ? '마을로 나가기' : entrance ? '입구 · 경보기' : '출구'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  floorArea: { position: 'absolute', backgroundColor: '#F1ECDF', overflow: 'hidden' },
  tileLine: { position: 'absolute', backgroundColor: '#C8C0AC' },
  architectureWall: { position: 'absolute', backgroundColor: '#D2CDB8', borderColor: '#AAA78E', borderWidth: 2, borderBottomWidth: 5 },
  alarmGate: { position: 'absolute', zIndex: 4 },
  alarmBeam: { height: 4, position: 'absolute', left: 0, right: 0, top: 11, backgroundColor: '#CE5650', opacity: 0.8 },
  alarmPillar: { position: 'absolute', bottom: 0, height: 51, width: 10, backgroundColor: '#DFDCD1', borderWidth: 2, borderColor: '#B75C53', borderRadius: 3 },
  entranceMat: { backgroundColor: '#F6E1D4', bottom: 0, top: 40 },
  atmArt: { position: 'absolute', bottom: 0, left: -10, width: 80, height: 125 },
  elevatorArt: { position: 'absolute', bottom: 0, left: -7, width: 94, height: 110 },
  restChair: { position: 'absolute', bottom: 0, width: 28, height: 58 },
  restChairLeg: { position: 'absolute', bottom: 0, height: 18, width: 3, backgroundColor: '#7F7357' },
  restChairBack: { position: 'absolute', bottom: 23, height: 27, left: 1, width: 26, borderRadius: 4, borderWidth: 1, borderColor: '#937A4F', backgroundColor: '#BBA070' },
  restChairSeat: { position: 'absolute', bottom: 12, height: 16, left: 0, width: 28, borderRadius: 4, borderWidth: 1, borderColor: '#937A4F', backgroundColor: '#D5BE8E' },
  roundTableStem: { position: 'absolute', bottom: 0, left: 48, height: 29, width: 4, backgroundColor: '#7F7357' },
  roundTableTop: { position: 'absolute', bottom: 20, left: 32, width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#A3916C', backgroundColor: '#E4D5AE' },
  personContent: { ...StyleSheet.absoluteFill, height: MARKET_PERSON_HEIGHT, width: MARKET_PERSON_WIDTH, overflow: 'visible' },
  personLabel: { alignItems: 'center', backgroundColor: '#F9F4E8', borderRadius: 5, bottom: -25, flexDirection: 'row', gap: 4, left: (MARKET_PERSON_WIDTH - 72) / 2, minWidth: 72, paddingHorizontal: 7, paddingVertical: 4, position: 'absolute' },
  personLabelText: { color: '#465448', fontFamily: fonts.cafe24Ssurround, fontSize: 12, lineHeight: 17 },
  environmentObject: { position: 'absolute', overflow: 'visible', zIndex: 3 },
  objectShadow: { backgroundColor: 'rgba(76,67,52,0.15)', borderRadius: 30, bottom: -5, height: 16, left: -8, position: 'absolute', right: -8 },
  pillarBody: { backgroundColor: '#D8D1BE', borderColor: '#AAA58F', borderWidth: 1.5, bottom: 2, height: 150, left: 1, position: 'absolute', width: 34 },
  pillarTop: { backgroundColor: '#EFE8D7', borderColor: '#AAA58F', borderRadius: 3, borderWidth: 1.5, bottom: 144, height: 12, left: -3, position: 'absolute', width: 42 },
  pillarBase: { backgroundColor: '#BBB69F', borderColor: '#96947D', borderRadius: 3, borderWidth: 1.5, bottom: 0, height: 12, left: -3, position: 'absolute', width: 42 },
  chairLeg: { backgroundColor: '#79725C', bottom: 0, height: 24, position: 'absolute', width: 5 },
  chairBack: { backgroundColor: '#B49B6E', borderColor: '#8A7757', borderRadius: 6, borderWidth: 1.5, bottom: 34, height: 35, left: 1, position: 'absolute', width: 36 },
  chairSeat: { backgroundColor: '#CEB784', borderColor: '#8A7757', borderRadius: 5, borderWidth: 1.5, bottom: 15, height: 23, left: -2, position: 'absolute', width: 42 },
  kioskBase: { backgroundColor: '#A5B2AA', borderColor: '#6E8076', borderRadius: 5, borderWidth: 1.5, bottom: 0, height: 15, left: 5, position: 'absolute', width: 54 },
  kioskStem: { backgroundColor: '#D6DFD6', borderColor: '#879B8C', borderWidth: 1.5, bottom: 12, height: 57, left: 21, position: 'absolute', width: 22 },
  kioskHead: { backgroundColor: '#E2E6D9', borderColor: '#809482', borderRadius: 7, borderWidth: 2, bottom: 53, height: 66, left: 0, padding: 6, position: 'absolute', width: 64 },
  kioskScreen: { alignItems: 'center', backgroundColor: '#30483F', borderRadius: 3, flex: 1, justifyContent: 'center' },
  kioskLabel: { backgroundColor: '#F9F4E8', borderRadius: 4, bottom: -24, left: -10, paddingHorizontal: 5, paddingVertical: 4, position: 'absolute', width: 85 },
  kioskLabelText: { color: '#6E746A', fontFamily: fonts.medium, fontSize: 11, textAlign: 'center' },
  backdrop: {
    backgroundColor: '#D6D5C9',
    height: MARKET_WORLD_HEIGHT,
    left: 0,
    position: 'absolute',
    top: 0,
    width: MARKET_WORLD_WIDTH,
  },
  // RN Web also applies the asset's intrinsic dimensions. Explicit dimensions
  // prevent a larger source image from overflowing this fixed world rectangle.
  backdropImage: {
    height: MARKET_WORLD_HEIGHT,
    left: 0,
    position: 'absolute',
    top: 0,
    width: MARKET_WORLD_WIDTH,
  },
  fixtureContent: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    overflow: 'visible',
  },
  floorShadow: {
    backgroundColor: 'rgba(98,87,65,0.10)',
    borderRadius: 50,
    bottom: -2.5,
    height: 17.5,
    left: -3,
    position: 'absolute',
    width: 116,
  },
  floorFocus: {
    backgroundColor: 'rgba(113,162,131,0.25)',
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
  shelfArt: {
    bottom: MARKET_SHELF_ART_BOTTOM,
    height: MARKET_SHELF_ART_HEIGHT,
    left: (MARKET_SHELF_UNIT_WIDTH - MARKET_SHELF_ART_WIDTH) / 2,
    position: 'absolute',
    width: MARKET_SHELF_ART_WIDTH,
  },
  freshShelfArt: { transform: [{ scaleX: 1.12 }] },
  categorySign: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#F9F4E8',
    borderRadius: 5,
    bottom: -27,
    flexDirection: 'row',
    gap: 6,
    minHeight: 30,
    minWidth: 130,
    justifyContent: 'center',
    paddingHorizontal: 11,
    paddingVertical: 5,
    position: 'absolute',
  },
  categorySignActive: {
    backgroundColor: '#E6EFDF',
  },
  categoryDot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  categoryName: {
    color: '#465448',
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 15,
    lineHeight: 19,
    paddingTop: 1,
  },
  counterShadow: {
    backgroundColor: 'rgba(98,87,65,0.10)',
    borderRadius: 50,
    bottom: -5 * MARKET_CHECKOUT_SCALE,
    height: 158,
    left: -4,
    position: 'absolute',
    width: 72,
  },
  cashierFloorMat: {
    backgroundColor: 'rgba(164,182,148,0.22)',
    borderRadius: 12,
    height: 28,
    left: 15 * MARKET_CHECKOUT_SCALE,
    position: 'absolute',
    top: -125 * MARKET_CHECKOUT_SCALE,
    width: 44,
  },
  // Match the smaller random NPCs. The counter is rendered
  // after the employee so its front naturally hides the lower part of the body.
  cashier: {
    height: MARKET_PERSON_HEIGHT,
    left: MARKET_CASHIER_POINT.x - MARKET_CHECKOUT_RECT.x - MARKET_PERSON_WIDTH / 2,
    position: 'absolute',
    top: MARKET_CASHIER_POINT.y - MARKET_CHECKOUT_RECT.y - MARKET_PERSON_HEIGHT,
    width: MARKET_PERSON_WIDTH,
  },
  counterArt: {
    bottom: 0,
    height: 190,
    left: -16,
    position: 'absolute',
    width: 96,
  },
  counterSign: {
    bottom: -26 * MARKET_CHECKOUT_SCALE,
    left: -23,
    right: undefined,
    width: 110,
    minWidth: 110,
    gap: 4,
    minHeight: 26,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  counterName: {
    fontSize: 13,
    lineHeight: 17,
  },
  exitMat: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: '#CFD6BB',
    borderRadius: 7,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  exitMatActive: {
    backgroundColor: '#BCCAAC',
  },
  exitText: {
    color: '#516657',
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 13,
    lineHeight: 19,
    paddingTop: 1,
  },
});
