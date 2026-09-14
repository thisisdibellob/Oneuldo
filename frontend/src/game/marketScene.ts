import { randomUUID } from 'expo-crypto';
import type { MarketMission, MarketProduct } from './scenarios';
import { marketProducts, getObjectiveProductIds } from './scenarios';
import { MARKET_CATALOG_VERSION, MARKET_SCENARIO_VERSION, getEnabledMarketScenario } from './marketContent';

export const MARKET_LAYOUT_VERSION = 'market-list-layout-v1';
export type MarketScene = {
  schemaVersion: 'market-scene-v1'; questInstanceId: string; seed: number | string;
  layoutVersion: string; catalogVersion: string; scenarioVersion: string;
  mission: Omit<MarketMission, 'scene'>; products: MarketProduct[];
  slots: Array<{ slotId: string; stationId: string; productId: string; storage: string }>;
  startingConditions: { cart: Record<string, number>; player: { x: number; y: number };
    supportOptions: string[]; geometry: string; exposureMeaning: string };
};

/** Seed fixes the offered list, not a claim that the user saw every row. No ability-based placement. */
export function createMarketScene(mission: MarketMission, seed: number, questInstanceId = randomUUID()): MarketScene {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('INVALID_SCENE_SEED');
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  const shuffle = <T,>(items: T[]) => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  };
  const required = new Set(mission.objectives.flatMap(getObjectiveProductIds));
  if (mission.scenarioId && mission.scenarioId !== 'CUSTOM') {
    const preset = getEnabledMarketScenario(mission.scenarioId);
    [...preset.mandatoryProductIds, ...preset.distractorProductIds].forEach(id => required.add(id));
  }
  for (const id of required) if (!marketProducts.some(p => p.id === id)) throw new Error('UNKNOWN_SCENE_PRODUCT');
  const products = ['fresh', 'produce', 'meal', 'drink'].flatMap(category => {
    const pool = marketProducts.filter(p => p.categoryId === category);
    const mandatory = pool.filter(p => required.has(p.id));
    if (mandatory.length > 6) throw new Error('SCENE_CAPACITY_EXCEEDED');
    return shuffle([...mandatory, ...shuffle(pool.filter(p => !required.has(p.id))).slice(0, 6 - mandatory.length)]);
  });
  const { scene: ignored, ...original } = mission;
  return JSON.parse(JSON.stringify({
    schemaVersion: 'market-scene-v1', questInstanceId, seed, layoutVersion: MARKET_LAYOUT_VERSION,
    catalogVersion: MARKET_CATALOG_VERSION, scenarioVersion: MARKET_SCENARIO_VERSION, mission: original, products,
    slots: products.map((p, index) => ({ slotId: p.categoryId + '-' + (index % 6 + 1), stationId: p.categoryId, productId: p.id, storage: p.storage })),
    startingConditions: { cart: {}, player: { x: 450, y: 860 },
      supportOptions: ['목록 다시 보기', '글 정보', '거절/중단'],
      geometry: 'existing-market-900x1000-v1; fixed fixtures; storage-tagged virtual list slots',
      exposureMeaning: 'Shelf rows are offered in this order; no viewport or comprehension inference.' },
  }));
}

export function restoreMarketScene(scene: MarketScene): MarketMission {
  if (scene.schemaVersion !== 'market-scene-v1' || scene.layoutVersion !== MARKET_LAYOUT_VERSION
    || scene.products.length !== 24 || scene.slots.length !== 24
    || new Set(scene.products.map(p => p.id)).size !== 24
    || scene.slots.some((slot, i) => slot.productId !== scene.products[i].id
      || slot.stationId !== scene.products[i].categoryId || slot.storage !== scene.products[i].storage)
    || scene.products.some(p => !Number.isSafeInteger(p.price) || p.price < 0 || !Number.isSafeInteger(p.initialStock) || p.initialStock < 0)
    || scene.mission.objectives.some(o => !scene.products.some(p => p.id === o.productId))) {
    throw new Error('INVALID_SCENE_SNAPSHOT');
  }
  const copy = JSON.parse(JSON.stringify(scene)) as MarketScene;
  return { ...copy.mission, catalogVersion: copy.catalogVersion, scenarioVersion: copy.scenarioVersion, scene: copy };
}

