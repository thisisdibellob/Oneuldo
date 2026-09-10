import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';

import { marketGameArt } from '../../game/gameAssets';
import {
  MARKET_CASHIER_POINT,
  MARKET_CHECKOUT_RECT,
  MARKET_WORLD_HEIGHT,
  MARKET_WORLD_WIDTH,
} from '../../game/prototypeWorld';
import type { MarketCategory } from '../../game/scenarios';
import { fonts } from '../../theme';

/** Visual layers only: the shared world keeps ownership of movement and hit targets. */
export function MarketInteriorBackdrop() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.backdrop}
    >
      <Image
        accessibilityIgnoresInvertColors
        accessible={false}
        resizeMode="stretch"
        source={marketGameArt.base}
        style={styles.backdropImage}
      />
    </View>
  );
}

export function MarketCategoryFixture({
  active,
  category,
}: {
  active: boolean;
  category: MarketCategory;
}) {
  return (
    <View pointerEvents="none" style={styles.fixtureContent}>
      <View style={[styles.floorShadow, active && styles.floorFocus]} />
      <Image
        accessibilityIgnoresInvertColors
        accessible={false}
        resizeMode="contain"
        source={marketGameArt.shelves[category.id]}
        style={styles.shelfArt}
      />
      <View style={[styles.categorySign, active && styles.categorySignActive]}>
        <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
        <Text style={styles.categoryName}>{category.label}</Text>
        {active ? <Ionicons color="#48735F" name="chevron-forward" size={14} /> : null}
      </View>
    </View>
  );
}

export function MarketCheckoutFixture({ active }: { active: boolean }) {
  return (
    <View pointerEvents="none" style={styles.fixtureContent}>
      <View style={styles.cashierFloorMat} testID="market-cashier-workspace" />
      <View
        accessibilityLabel="계산대 뒤에서 기다리는 직원"
        accessibilityRole="image"
        pointerEvents="none"
        style={styles.cashier}
        testID="market-cashier"
      >
        <View style={styles.cashierShadow} />
        <View style={[styles.cashierShoe, styles.cashierShoeLeft]} />
        <View style={[styles.cashierShoe, styles.cashierShoeRight]} />
        <View style={[styles.cashierArm, styles.cashierArmLeft]} />
        <View style={[styles.cashierArm, styles.cashierArmRight]} />
        <View style={styles.cashierShirt} />
        <View style={styles.cashierApron}>
          <View style={styles.cashierNameBadge} />
          <View style={styles.cashierPocket} />
        </View>
        <View style={styles.cashierHairBack} />
        <View style={styles.cashierFace}>
          <View style={[styles.cashierEye, styles.cashierEyeLeft]} />
          <View style={[styles.cashierEye, styles.cashierEyeRight]} />
          <View style={styles.cashierSmile} />
        </View>
        <View style={styles.cashierFringe} />
      </View>
      <View style={[styles.counterShadow, active && styles.floorFocus]} />
      <Image
        accessibilityIgnoresInvertColors
        accessible={false}
        resizeMode="contain"
        source={marketGameArt.checkout}
        style={styles.counterArt}
        testID="market-checkout-art"
      />
      <View style={[styles.categorySign, styles.counterSign, active && styles.categorySignActive]}>
        <Ionicons color="#48735F" name="card-outline" size={15} />
        <Text style={styles.categoryName}>계산대</Text>
        {active ? <Ionicons color="#48735F" name="chevron-forward" size={14} /> : null}
      </View>
    </View>
  );
}

export function MarketExitMarker({ active }: { active: boolean }) {
  return (
    <View pointerEvents="none" style={[styles.exitMat, active && styles.exitMatActive]}>
      <Ionicons color="#516657" name="arrow-down" size={18} />
      <Text style={styles.exitText}>{active ? '마을로 나가기' : '출구'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#F1EBDD',
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
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    overflow: 'visible',
  },
  floorShadow: {
    backgroundColor: 'rgba(98,87,65,0.10)',
    borderRadius: 50,
    bottom: -5,
    height: 35,
    left: -6,
    position: 'absolute',
    width: 232,
  },
  floorFocus: {
    backgroundColor: 'rgba(113,162,131,0.25)',
  },
  // The collision rectangle is the footprint, not the full upright illustration.
  // Keep the feet on its bottom edge and let the shelving rise above that footprint.
  shelfArt: {
    bottom: -8,
    height: 188,
    left: -31,
    position: 'absolute',
    width: 282,
  },
  categorySign: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#F9F4E8',
    borderRadius: 5,
    bottom: -27,
    flexDirection: 'row',
    gap: 6,
    minHeight: 30,
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
    bottom: -5,
    height: 33,
    left: -3,
    position: 'absolute',
    width: 256,
  },
  cashierFloorMat: {
    backgroundColor: 'rgba(164,182,148,0.22)',
    borderRadius: 12,
    height: 120,
    left: 15,
    position: 'absolute',
    top: -125,
    width: 220,
  },
  // Match the village NPC's small, rounded silhouette. The counter is rendered
  // after the employee so its front naturally hides the lower part of the body.
  cashier: {
    height: 104,
    left: MARKET_CASHIER_POINT.x - MARKET_CHECKOUT_RECT.x - 31,
    position: 'absolute',
    top: MARKET_CASHIER_POINT.y - MARKET_CHECKOUT_RECT.y - 104,
    width: 62,
  },
  cashierShadow: {
    backgroundColor: 'rgba(72,80,62,0.16)',
    borderRadius: 16,
    bottom: 0,
    height: 10,
    left: 10,
    position: 'absolute',
    width: 42,
  },
  cashierShoe: {
    backgroundColor: '#646B60',
    borderRadius: 5,
    bottom: 4,
    height: 13,
    position: 'absolute',
    width: 14,
  },
  cashierShoeLeft: { left: 15 },
  cashierShoeRight: { right: 15 },
  cashierArm: {
    backgroundColor: '#EDDEBF',
    borderRadius: 8,
    height: 35,
    position: 'absolute',
    top: 51,
    width: 13,
  },
  cashierArmLeft: { left: 5, transform: [{ rotate: '7deg' }] },
  cashierArmRight: { right: 5, transform: [{ rotate: '-7deg' }] },
  cashierShirt: {
    backgroundColor: '#F5EDDA',
    borderRadius: 12,
    height: 46,
    left: 11,
    position: 'absolute',
    top: 46,
    width: 40,
  },
  cashierApron: {
    backgroundColor: '#6D8A70',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    height: 39,
    left: 16,
    position: 'absolute',
    top: 54,
    width: 30,
  },
  cashierNameBadge: {
    backgroundColor: '#F6E8C7',
    borderRadius: 2,
    height: 6,
    left: 15,
    position: 'absolute',
    top: 5,
    width: 10,
  },
  cashierPocket: {
    backgroundColor: '#9AAD8C',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    height: 9,
    left: 8,
    position: 'absolute',
    top: 22,
    width: 14,
  },
  cashierHairBack: {
    backgroundColor: '#5D5147',
    borderRadius: 21,
    height: 48,
    left: 8,
    position: 'absolute',
    top: 3,
    width: 46,
  },
  cashierFace: {
    backgroundColor: '#DFC09E',
    borderRadius: 19,
    height: 36,
    left: 13,
    position: 'absolute',
    top: 17,
    width: 36,
  },
  cashierFringe: {
    backgroundColor: '#5D5147',
    borderBottomLeftRadius: 13,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 8,
    height: 21,
    left: 10,
    position: 'absolute',
    top: 8,
    transform: [{ rotate: '-8deg' }],
    width: 29,
  },
  cashierEye: {
    backgroundColor: '#544A3F',
    borderRadius: 2,
    height: 4,
    position: 'absolute',
    top: 16,
    width: 3,
  },
  cashierEyeLeft: { left: 9 },
  cashierEyeRight: { right: 9 },
  cashierSmile: {
    backgroundColor: '#BD8B72',
    borderRadius: 3,
    height: 2,
    left: 15,
    position: 'absolute',
    top: 26,
    width: 6,
  },
  counterArt: {
    bottom: -8,
    height: 190,
    left: -22,
    position: 'absolute',
    width: 294,
  },
  counterSign: {
    bottom: -26,
  },
  exitMat: {
    ...StyleSheet.absoluteFillObject,
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
