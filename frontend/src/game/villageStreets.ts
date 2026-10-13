import type { Point, Rect } from './prototypeWorld';

export type VillageCrossing = Rect & { id: string; direction: 'across-main' | 'across-side' };

// Keep room beside a 44px player footprint for steering corrections and passing props.
export const VILLAGE_SIDEWALK_WIDTH = 84;
export const VILLAGE_SCENERY_MARGIN = 1536;

/** Continue the visible neighbourhood beyond its unchanged playable boundary. */
export function extendVillageBlock<T extends Rect>(block: T): T {
  const left = block.x < 0 ? -VILLAGE_SCENERY_MARGIN : block.x;
  const top = block.y < 0 ? -VILLAGE_SCENERY_MARGIN : block.y;
  const right = block.x + block.width > 2200 ? 2200 + VILLAGE_SCENERY_MARGIN : block.x + block.width;
  const bottom = block.y + block.height > 1700 ? 1700 + VILLAGE_SCENERY_MARGIN : block.y + block.height;
  return { ...block, x: left, y: top, width: right - left, height: bottom - top };
}

// Crossings sit on the approaches, outside the two junction conflict areas.
export const VILLAGE_CROSSINGS: readonly VillageCrossing[] = [
  { id: 'school', direction: 'across-main', x: 608, y: 687, width: 88, height: 166 },
  { id: 'market', direction: 'across-main', x: 1221, y: 687, width: 88, height: 166 },
  { id: 'east-shops', direction: 'across-main', x: 1565, y: 687, width: 88, height: 166 },
  { id: 'park', direction: 'across-side', x: 377, y: 551, width: 151, height: 76 },
  { id: 'station', direction: 'across-side', x: 1727, y: 551, width: 151, height: 76 },
  { id: 'homes', direction: 'across-side', x: 1727, y: 1182, width: 151, height: 76 },
  { id: 'south-shops', direction: 'across-main', x: 1172, y: 1512, width: 88, height: 121 },
];

export const VILLAGE_JUNCTIONS: readonly Rect[] = [
  { x: 365, y: 675, width: 175, height: 190 },
  { x: 1715, y: 675, width: 175, height: 190 },
  { x: 365, y: 1500, width: 175, height: 145 },
  { x: 1715, y: 1500, width: 175, height: 145 },
];

export const VILLAGE_STREET_BLOCKS = [
  { id: 'park', x: -8, y: -8, width: 373, height: 683, corners: [0, 0, 44, 0] },
  { id: 'north', x: 540, y: -8, width: 1175, height: 683, corners: [0, 0, 44, 44] },
  { id: 'northeast', x: 1890, y: -8, width: 318, height: 683, corners: [0, 0, 0, 44] },
  { id: 'library', x: -8, y: 865, width: 373, height: 843, corners: [0, 44, 0, 0] },
  { id: 'shops', x: 540, y: 865, width: 1175, height: 635, corners: [44, 44, 44, 44] },
  { id: 'homes', x: 1890, y: 865, width: 318, height: 843, corners: [44, 0, 0, 0] },
  { id: 'south', x: -8, y: 1645, width: 1723, height: 63, corners: [0, 32, 0, 0] },
] as const;

export function intersectsStreetArea(a: Rect, b: Rect, padding = 0) {
  return a.x < b.x + b.width + padding && a.x + a.width > b.x - padding &&
    a.y < b.y + b.height + padding && a.y + a.height > b.y - padding;
}

export const VILLAGE_ROAD_DASHES: readonly Rect[] = [
  ...Array.from({ length: 20 }, (_, i) => ({ x: 12 + i * 116, y: 768, width: 48, height: 4 })),
  ...Array.from({ length: 13 }, (_, i) => ({ x: 395 + i * 116, y: 1571, width: 48, height: 4 })),
  ...Array.from({ length: 13 }, (_, i) => ({ x: 450, y: 12 + i * 116, width: 4, height: 48 })),
  ...Array.from({ length: 15 }, (_, i) => ({ x: 1800, y: 12 + i * 116, width: 4, height: 48 })),
].filter(dash => dash.x + dash.width <= 2200 && dash.y + dash.height <= 1700 &&
  ![...VILLAGE_CROSSINGS, ...VILLAGE_JUNCTIONS].some(area => intersectsStreetArea(dash, area, 18)));

export function getVillageRenderDepth(point: Point | number) {
  return 100 + Math.round(typeof point === 'number' ? point : point.y);
}
