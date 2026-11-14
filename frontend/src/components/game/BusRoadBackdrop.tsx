import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { villageDecorationArt } from '../../game/gameAssets';
import { BUS_ROAD_REPEAT, busRoadBackdropLayout } from '../../game/busWorld';

/** The whole roadside repeats together, including shadows and paving, so no seam jumps. */
export const BusRoadBackdrop = memo(function BusRoadBackdrop({ viewport, travelling, reduceMotion }: {
  viewport: { width: number; height: number }; travelling: boolean; reduceMotion: boolean;
}) {
  const road = useRef(new Animated.Value(0)).current;
  const layout = busRoadBackdropLayout(viewport);
  useEffect(() => {
    if (!travelling || reduceMotion) return;
    road.setValue(0);
    // RN Web's loop chooses its native-loop branch from this flag even when timing
    // falls back to JS. That branch completes just one lap on the web (no native module).
    const loop = Animated.loop(Animated.timing(road, {
      toValue: BUS_ROAD_REPEAT, duration: 5100, easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web', isInteraction: false,
    }));
    loop.start();
    return () => loop.stop();
  }, [road, reduceMotion, travelling]);
  const edge = layout.roadLeft + layout.roadWidth;
  return <View pointerEvents="none" testID="bus-interior-road" accessibilityValue={{ text: travelling ? '주행 중' : '정차 중' }} style={s.root}>
    <View style={[s.verge, { left: layout.roadLeft - 160, width: 90 }]} />
    <View style={[s.verge, { left: edge + 70, width: 90 }]} />
    <LinearGradient testID="bus-road-surface" colors={['#A8A79F', '#B7B6AE', '#ADAEA6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      style={{ position: 'absolute', left: layout.roadLeft, width: layout.roadWidth, top: 0, bottom: 0 }} />
    {[layout.roadLeft - 70, edge].map((left, side) => <View key={side} style={[s.sidewalk, { left, borderLeftWidth: side ? 6 : 0, borderRightWidth: side ? 0 : 6 }]} />)}
    <View style={[s.edgeLine, { left: layout.roadLeft + 8, backgroundColor: '#E8D8A1' }]} />
    <View style={[s.edgeLine, { left: edge - 11 }]} />
    <Animated.View testID="bus-road-moving-scenery" style={{ position: 'absolute', left: 0, right: 0, top: layout.tileTop, height: layout.tileHeight, transform: [{ translateY: road }] }}>
      <View testID="bus-moving-road-markings" style={{ position: 'absolute', left: layout.laneLeft, width: layout.laneWidth, top: 0, bottom: 0 }}>
        {Array.from({ length: layout.tileCount * 6 }, (_, i) => <View key={i} style={[s.laneDash, { top: i * 160 }]} />)}
      </View>
      {Array.from({ length: layout.tileCount }, (_, tile) => <View key={tile} style={{ position: 'absolute', left: 0, right: 0, top: tile * BUS_ROAD_REPEAT, height: BUS_ROAD_REPEAT }}>
        {[layout.roadLeft - 70, edge].map((left, side) => <View key={side} style={{ position: 'absolute', left, width: 70, top: 0, bottom: 0 }}>
          {Array.from({ length: 12 }, (_, row) => <View key={row} style={[s.pavingRow, { top: row * 80 }]}>
            <View style={[s.pavingJoint, { left: row % 2 ? 23 : 43 }]} />
          </View>)}
          {[200, 680].map(top => <View key={top} style={[s.drain, { top, left: side ? 7 : 55 }]}>
            {[5, 12, 19, 26].map(y => <View key={y} style={[s.drainSlot, { top: y }]} />)}
          </View>)}
        </View>)}
        {/* Larger screens reveal the green verge. Small screens retain the same bus scale. */}
        {[{ x: layout.roadLeft - 157, y: 90 }, { x: edge + 73, y: 430 }].map((p, side) => <View key={side} style={{ position: 'absolute', left: p.x, top: p.y, width: 108, height: 220 }}>
          <View style={s.treeBed} /><View style={s.treeShadow} />
          <Image source={villageDecorationArt.tree} fadeDuration={0} resizeMode="contain" style={s.tree} />
          <Image source={villageDecorationArt.flowerbed} fadeDuration={0} resizeMode="contain" style={s.flowers} />
        </View>)}
        <Image source={villageDecorationArt.bench} fadeDuration={0} resizeMode="contain" style={{ position: 'absolute', left: layout.roadLeft - 137, top: 460, width: 76, height: 54 }} />
        <Image source={villageDecorationArt.streetlamp} fadeDuration={0} resizeMode="contain" style={{ position: 'absolute', left: edge + 33, top: 110, width: 49, height: 137 }} />
        {[{ x: layout.roadLeft - 180, y: 725 }, { x: edge + 82, y: 825 }].map((p, i) => <Image key={i} source={villageDecorationArt.shrub} fadeDuration={0} resizeMode="contain" style={{ position: 'absolute', left: p.x, top: p.y, width: 88, height: 43 }} />)}
      </View>)}
    </Animated.View>
  </View>;
});

const s = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#D6DFBF', overflow: 'hidden' },
  verge: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#C7D3AE' },
  sidewalk: { position: 'absolute', top: 0, bottom: 0, width: 70, backgroundColor: '#E8E0CC', borderColor: '#C3BEAD' },
  edgeLine: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: '#EEEADF' },
  laneDash: { position: 'absolute', left: 0, right: 0, height: 70, borderLeftWidth: 4, borderRightWidth: 4, borderColor: '#EFEBDD', borderRadius: 2 },
  pavingRow: { position: 'absolute', left: 6, right: 6, height: 80, borderTopWidth: 1, borderColor: '#D2C9B8' },
  pavingJoint: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#D2C9B8' },
  drain: { position: 'absolute', width: 9, height: 34, borderRadius: 2, backgroundColor: '#939789' },
  drainSlot: { position: 'absolute', left: 2, right: 2, height: 2, backgroundColor: '#677266' },
  treeBed: { position: 'absolute', left: 15, top: 107, width: 70, height: 49, borderRadius: 20, backgroundColor: '#B5C49D' },
  treeShadow: { position: 'absolute', left: 32, top: 110, width: 85, height: 33, borderRadius: 25, backgroundColor: '#81937B28', transform: [{ rotate: '-18deg' }] },
  tree: { position: 'absolute', left: 0, top: 0, width: 102, height: 146 },
  flowers: { position: 'absolute', left: 5, top: 173, width: 89, height: 42 },
});
