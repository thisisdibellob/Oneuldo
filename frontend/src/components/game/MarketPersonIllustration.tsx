import { Image, StyleSheet, View } from 'react-native';
import { getMarketPersonAppearance, type MarketPersonKind } from '../../game/marketPeople';
import { marketPeopleArt } from '../../game/marketPeopleArt';
import { getMarketPersonGeometry, MARKET_PERSON_WIDTH } from '../../game/marketPersonLayout';

/** Balance adult NPCs against the SD player and keep every age on one floor anchor. */
export function MarketPersonIllustration({ kind, appearance, active = false, testID }: {
  kind: MarketPersonKind;
  appearance: number;
  active?: boolean;
  testID: string;
}) {
  const variant = getMarketPersonAppearance(kind, appearance);
  const geometry = getMarketPersonGeometry(kind, appearance);
  return <>
    <View pointerEvents="none" style={[styles.shadow, {
      bottom: -geometry.footprintHeight * 0.25,
      height: geometry.footprintHeight,
      left: (MARKET_PERSON_WIDTH - geometry.footprintWidth) / 2 + geometry.footprintOffsetX,
      width: geometry.footprintWidth,
    }, active && styles.focus]} />
    <Image
      accessibilityIgnoresInvertColors
      accessible={false}
      fadeDuration={0}
      resizeMode="contain"
      source={marketPeopleArt[variant.id]}
      style={[styles.art, {
        height: geometry.imageHeight,
        width: geometry.imageWidth,
        left: (MARKET_PERSON_WIDTH - geometry.imageWidth) / 2,
      }]}
      testID={testID}
    />
  </>;
}

const styles = StyleSheet.create({
  art: { position: 'absolute', bottom: 0 },
  shadow: { backgroundColor: 'rgba(72,80,62,0.16)', borderRadius: 999, position: 'absolute' },
  focus: { backgroundColor: 'rgba(123,152,111,0.22)' },
});
