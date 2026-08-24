import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';
import { Image, StyleSheet, View } from 'react-native';

export const MODULAR_CHARACTER_CANVAS = {
  height: 192,
  pivotX: 64,
  pivotY: 186,
  width: 128,
} as const;

export const MODULAR_CHARACTER_LAYER_ORDER = [
  'hairBack',
  'bagBack',
  'heldItemBack',
  'bodySkin',
  'shoes',
  'bottom',
  'top',
  'outerwear',
  'face',
  'hairFront',
  'eyewear',
  'headwear',
  'bagFront',
  'heldItemFront',
  'effect',
] as const;

export type CharacterLayerSlot = (typeof MODULAR_CHARACTER_LAYER_ORDER)[number];

export type CharacterArtLayer = {
  id: string;
  opacity?: number;
  slot: CharacterLayerSlot;
  source: ImageSourcePropType;
};

type ModularCharacterProps = {
  accessibilityLabel?: string;
  layers: readonly CharacterArtLayer[];
  scale?: number;
  showShadow?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const layerOrder = new Map<CharacterLayerSlot, number>(
  MODULAR_CHARACTER_LAYER_ORDER.map((slot, index) => [slot, index]),
);

export function ModularCharacter({
  accessibilityLabel,
  layers,
  scale = 0.5,
  showShadow = true,
  style,
  testID,
}: ModularCharacterProps) {
  const height = MODULAR_CHARACTER_CANVAS.height * scale;
  const width = MODULAR_CHARACTER_CANVAS.width * scale;
  const orderedLayers = [...layers].sort((a, b) => (layerOrder.get(a.slot) ?? 0) - (layerOrder.get(b.slot) ?? 0));

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessible={Boolean(accessibilityLabel)}
      pointerEvents="none"
      style={[styles.root, { height, width }, style]}
      testID={testID}
    >
      {showShadow ? (
        <View
          style={[
            styles.shadow,
            {
              bottom: Math.max(1, 2 * scale),
              height: Math.max(6, 24 * scale),
              width: width * 0.68,
            },
          ]}
        />
      ) : null}
      {orderedLayers.map((layer) => (
        <Image
          accessibilityIgnoresInvertColors
          key={layer.id}
          resizeMode="contain"
          source={layer.source}
          style={[styles.layer, { height, opacity: layer.opacity ?? 1, width }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  layer: {
    left: 0,
    position: 'absolute',
    top: 0,
    zIndex: 1,
  },
  shadow: {
    backgroundColor: 'rgba(53,72,90,0.16)',
    borderRadius: 999,
    position: 'absolute',
  },
});
