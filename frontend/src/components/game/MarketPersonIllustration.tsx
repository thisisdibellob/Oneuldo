import { Image, StyleSheet, View } from 'react-native';
import { getMarketPersonAppearance, type MarketPersonKind } from '../../game/marketPeople';
import { marketPeopleArt } from '../../game/marketPeopleArt';
import { MARKET_PERSON_HEIGHT, MARKET_PERSON_WIDTH } from '../../game/marketPersonLayout';

/** All cutouts share a foot baseline. A smaller child never moves the touch target. */
export function MarketPersonIllustration({ kind, appearance, active = false, testID }: {
  kind: MarketPersonKind;
  appearance: number;
  active?: boolean;
  testID: string;
}) {
  const variant = getMarketPersonAppearance(kind, appearance);
  const height = MARKET_PERSON_HEIGHT * variant.heightScale;
  const width = height / 2;
  return <>
    <View pointerEvents="none" style={[styles.shadow, active && styles.focus]} />
    <Image
      accessibilityIgnoresInvertColors
      accessible={false}
      resizeMode="contain"
      source={marketPeopleArt[variant.id]}
      style={[styles.art, { height, width, left: (MARKET_PERSON_WIDTH - width) / 2 }]}
      testID={testID}
    />
  </>;
}

const styles = StyleSheet.create({
  art: { position: 'absolute', bottom: 0 },
  shadow: { backgroundColor: 'rgba(72,80,62,0.16)', borderRadius: 16, bottom: -3,
    height: 7, left: (MARKET_PERSON_WIDTH - 25) / 2, position: 'absolute', width: 25 },
  focus: { backgroundColor: 'rgba(123,152,111,0.22)' },
});
