import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { getMarketRetailImage } from '../../game/marketRetailImages';
import { MARKET_RETAIL_PRODUCT_BOUNDS, MARKET_RETAIL_STOCK } from '../../game/marketRetailStock';
import { MARKET_SHELF_ART_BOTTOM, MARKET_SHELF_ART_HEIGHT, MARKET_SHELF_ART_WIDTH, MARKET_SHELF_UNIT_WIDTH } from '../../game/marketFixtureLayout';
import type { MarketCategoryId } from '../../game/scenarios';
import { fonts } from '../../theme';

const gondola = require('../../../assets/images/game/market/interior/retail-v4/gondola-empty.png');
const fridge = require('../../../assets/images/game/market/interior/retail-v4/fridge-empty.png');
const produceBench = require('../../../assets/images/game/market/interior/retail-v4/produce-empty.png');

/** A shared furniture family with category-specific facings; the two fixtures still open one inventory. */
export const MarketRetailShelf = memo(function MarketRetailShelf({ categoryId, variant }: { categoryId: MarketCategoryId; variant: number }) {
  const produce = categoryId === 'produce';
  const cold = categoryId === 'fresh';
  const goods = MARKET_RETAIL_STOCK[categoryId][variant];
  const columns = produce ? [0.13, 0.26, 0.425, 0.575, 0.74, 0.87] : [0.18, 0.307, 0.435, 0.565, 0.693, 0.82];
  const frameWidth = produce ? 129 : 141;
  const frameHeight = produce ? 86 : 94;
  return <View pointerEvents="none" testID={`market-retail-shelf-${categoryId}-${variant + 1}`} style={styles.frame}>
    <View style={[styles.canvas, { left: (141 - frameWidth) / 2, bottom: 0, width: frameWidth, height: frameHeight }]}>
      <Image source={produce ? produceBench : cold ? fridge : gondola} resizeMode="contain" accessible={false}
        testID={`market-shelf-art-${categoryId}-${variant + 1}`} style={[StyleSheet.absoluteFill, { width: frameWidth, height: frameHeight }]} />
      {[0, 1].map(row => columns.map((center, column) => {
        const id = goods[row * 3 + Math.floor(column / 2)];
        const bounds = MARKET_RETAIL_PRODUCT_BOUNDS[id];
        const cellWidth = produce ? 17 : 16;
        const cellHeight = produce ? 19 : 23;
        const imageScale = Math.min(cellWidth / bounds.width, cellHeight / bounds.height);
        const baseline = produce ? (row === 0 ? 0.335 : 0.669) * frameHeight : (row === 0 ? 37 : 67);
        return <View key={`${row}-${column}`} style={{ position: 'absolute', overflow: 'hidden',
          left: center * frameWidth - cellWidth / 2, top: baseline - cellHeight,
          width: cellWidth, height: cellHeight }}>
          <Image accessible={false} source={getMarketRetailImage(id)}
            testID={`market-facing-${categoryId}-${variant + 1}-${row}-${column}`}
            style={{ position: 'absolute', width: imageScale, height: imageScale,
              left: (cellWidth - bounds.width * imageScale) / 2 - bounds.x * imageScale,
              top: cellHeight - (bounds.y + bounds.height) * imageScale }} />
        </View>;
      }))}
      {[0, 1].map(row => [0.25, 0.5, 0.75].map(center => <View key={`tag-${row}-${center}`}
        style={[styles.priceTag, { left: center * frameWidth - 5,
          top: produce ? (row === 0 ? 0.363 : 0.703) * frameHeight : row === 0 ? 39 : 69 }]}>
        <View style={styles.priceInk} /><View style={styles.priceAccent} />
      </View>))}
      {!produce ? <Text style={[styles.railBrand, cold && styles.coldBrand]}>{cold ? 'FRESH & COOL' : 'HANEUL MARKET'}</Text> : null}
    </View>
  </View>;
});

const styles = StyleSheet.create({
  frame: { position: 'absolute', bottom: MARKET_SHELF_ART_BOTTOM,
    left: (MARKET_SHELF_UNIT_WIDTH - MARKET_SHELF_ART_WIDTH) / 2,
    width: MARKET_SHELF_ART_WIDTH, height: MARKET_SHELF_ART_HEIGHT },
  canvas: { position: 'absolute' },
  priceTag: { position: 'absolute', width: 10, height: 3.6, paddingHorizontal: 1,
    flexDirection: 'row', alignItems: 'center', gap: 0.6, backgroundColor: '#F9F7ED', borderRadius: 0.3 },
  priceInk: { width: 4, height: 1, backgroundColor: '#6F7C6D' },
  priceAccent: { width: 2, height: 1, backgroundColor: '#B9955E' },
  railBrand: { position: 'absolute', top: 8, left: 28, right: 28, textAlign: 'center',
    fontFamily: fonts.semibold, letterSpacing: 1.1, fontSize: 3.5, color: '#6B7966' },
  coldBrand: { color: '#55747A' },
});