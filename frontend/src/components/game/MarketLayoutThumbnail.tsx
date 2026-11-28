import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { getMarketLayoutStructure } from '../../game/marketEnvironment';
import { getMarketShelfUnitRects } from '../../game/marketFixtureLayout';
import { getMarketTilemapFootprint, getMarketTilemapPoint, type MarketTilemapV1 } from '../../game/marketTilemap';
import type { Rect } from '../../game/prototypeWorld';
import type { MarketCategoryId } from '../../game/scenarios';

const shelfColors: Record<MarketCategoryId, string> = {
  produce: '#A7B98A', fresh: '#99B7BF', household: '#C1ADD0', meal: '#D6B388', drink: '#CCB890',
};

/** A floor-plan thumbnail of the stored anchors; no session-specific furniture is invented. */
export const MarketLayoutThumbnail = memo(function MarketLayoutThumbnail({ tilemap, width = 112 }: {
  tilemap: MarketTilemapV1; width?: number;
}) {
  const structure = getMarketLayoutStructure(tilemap.layoutId);
  const scale = width / structure.world.width;
  const rectStyle = (rect: Rect) => ({ left: rect.x * scale, top: rect.y * scale, width: rect.width * scale, height: rect.height * scale });
  return <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[s.canvas, { width, height: structure.world.height * scale }]}>
    {structure.walkableAreas.map(area => <View key={area.id} style={[s.rect, rectStyle(area), s.floor]} />)}
    {structure.walls.map((rect, index) => <View key={`wall-${index}`} style={[s.rect, rectStyle(rect), s.wall]} />)}
    {tilemap.shelves.map(shelf => {
      const rect = getMarketTilemapFootprint(shelf);
      return getMarketShelfUnitRects({ ...rect, orientation: shelf.orientation }).map((unit, index) =>
        <View key={`${shelf.categoryId}-${index}`} style={[s.rect, rectStyle(unit), s.shelf, { backgroundColor: shelfColors[shelf.categoryId] }]} />);
    })}
    {tilemap.people.map(person => {
      const point = getMarketTilemapPoint(person);
      const size = person.kind === 'employee' ? 5 : 4;
      return <View key={person.id} style={[s.person, { left: point.x * scale - size / 2, top: point.y * scale - size / 2, width: size, height: size, backgroundColor: person.kind === 'employee' ? '#426F5C' : '#9A708D' }]} />;
    })}
    <View style={[s.door, rectStyle(structure.commonDoor.gate)]} />
  </View>;
});

const s = StyleSheet.create({
  canvas: { overflow: 'hidden', borderRadius: 9, backgroundColor: '#E3DED0' },
  rect: { position: 'absolute' }, floor: { backgroundColor: '#FFFCF0' }, wall: { backgroundColor: '#AB9C83' },
  shelf: { borderRadius: 1 }, person: { position: 'absolute', borderRadius: 4 },
  door: { position: 'absolute', backgroundColor: '#D5AE6D' },
});
