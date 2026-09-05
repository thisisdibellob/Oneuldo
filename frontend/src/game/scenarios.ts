import { marketCatalogProducts, getEnabledMarketScenario, MARKET_CATALOG_VERSION, MARKET_SCENARIO_VERSION } from './marketContent';

export type SimulationId = 'market' | 'laundry' | 'cooking' | 'transit';
export type SimulationStatus = 'playable' | 'planned';

export type SimulationScenario = {
  id: SimulationId;
  title: string;
  shortTitle: string;
  description: string;
  location: string;
  npcName: string;
  npcRole: string;
  status: SimulationStatus;
  icon: 'basket-outline' | 'shirt-outline' | 'restaurant-outline' | 'bus-outline';
  accent: string;
  accentSoft: string;
  skills: string[];
};

export const simulationScenarios: SimulationScenario[] = [
  {
    id: 'market',
    title: '마트에서 장보기',
    shortTitle: '장보기',
    description: '목록과 예산을 확인하고 필요한 물건만 골라요.',
    location: '하늘마트',
    npcName: '수진',
    npcRole: '마트 직원',
    status: 'playable',
    icon: 'basket-outline',
    accent: '#E46D4E',
    accentSoft: '#FFF0E8',
    skills: ['목록 확인', '가격 비교', '계산하기'],
  },
  {
    id: 'laundry',
    title: '옷을 나눠서 세탁하기',
    shortTitle: '세탁하기',
    description: '세탁 표시와 옷 색을 보고 알맞은 방법을 골라요.',
    location: '우리 집 세탁실',
    npcName: '지호',
    npcRole: '생활 안내원',
    status: 'planned',
    icon: 'shirt-outline',
    accent: '#397EB8',
    accentSoft: '#EAF5FF',
    skills: ['세탁 표시', '색상 분리', '건조 방법'],
  },
  {
    id: 'cooking',
    title: '간단한 한 끼 만들기',
    shortTitle: '요리하기',
    description: '재료와 조리 순서를 확인하며 안전하게 요리해요.',
    location: '오늘도 주방',
    npcName: '보라',
    npcRole: '요리 선생님',
    status: 'planned',
    icon: 'restaurant-outline',
    accent: '#B56A34',
    accentSoft: '#FFF3DF',
    skills: ['재료 확인', '순서 지키기', '주방 안전'],
  },
  {
    id: 'transit',
    title: '대중교통으로 찾아가기',
    shortTitle: '길 찾기',
    description: '버스와 지하철 정보를 확인하고 목적지까지 이동해요.',
    location: '오늘도 정류장',
    npcName: '민수',
    npcRole: '교통 안내원',
    status: 'planned',
    icon: 'bus-outline',
    accent: '#5476BD',
    accentSoft: '#EDF2FF',
    skills: ['노선 확인', '질문하기', '내릴 곳 찾기'],
  },
];

export type MarketCategoryId = 'fresh' | 'produce' | 'meal' | 'drink';

export type MarketCategory = {
  id: MarketCategoryId;
  label: string;
  helper: string;
  icon: 'snow-outline' | 'leaf-outline' | 'restaurant-outline' | 'cafe-outline';
  color: string;
  softColor: string;
};

export const marketCategories: MarketCategory[] = [
  { id: 'fresh', label: '냉장 식품', helper: '우유 · 달걀', icon: 'snow-outline', color: '#4C8FBA', softColor: '#E8F5FD' },
  { id: 'produce', label: '과일', helper: '사과 · 수박', icon: 'leaf-outline', color: '#4B9560', softColor: '#EAF7EC' },
  { id: 'meal', label: '간편 식품', helper: '카레 · 라면', icon: 'restaurant-outline', color: '#BF783E', softColor: '#FFF1DF' },
  { id: 'drink', label: '음료', helper: '주스 · 탄산', icon: 'cafe-outline', color: '#8D65A8', softColor: '#F5ECFA' },
];

export type MarketProduct = {
  id: string;
  categoryId: MarketCategoryId;
  name: string;
  detail: string;
  price: number;
  salesUnit: string;
  storage: string;
  attributes: Record<string, string | number>;
  initialStock: number;
  icon:
    | 'water-outline'
    | 'ellipse-outline'
    | 'nutrition-outline'
    | 'restaurant-outline'
    | 'cafe-outline'
    | 'fast-food-outline'
    | 'cube-outline'
    | 'leaf-outline'
    | 'flame-outline'
    | 'fish-outline'
    | 'pizza-outline'
    | 'beer-outline';
  color: string;
  packageColor: string;
};

const productAppearance: Record<string, Pick<MarketProduct, 'icon' | 'color' | 'packageColor'>> = {
  'milk': { icon: 'water-outline', color: '#4A86B5', packageColor: '#EAF6FF' },
  'eggs': { icon: 'ellipse-outline', color: '#A26A3E', packageColor: '#FFF1D2' },
  'premium-eggs': { icon: 'ellipse-outline', color: '#8B613F', packageColor: '#F8E4B8' },
  'sausage': { icon: 'fast-food-outline', color: '#C35F58', packageColor: '#FFE5DE' },
  'brand-sausage': { icon: 'fast-food-outline', color: '#9C4E46', packageColor: '#FFD8CF' },
  'tofu': { icon: 'cube-outline', color: '#7B9B82', packageColor: '#EEF5E9' },
  'apple': { icon: 'nutrition-outline', color: '#C95048', packageColor: '#FFE7E3' },
  'watermelon': { icon: 'nutrition-outline', color: '#3A8A57', packageColor: '#E4F6E8' },
  'banana': { icon: 'nutrition-outline', color: '#C99A32', packageColor: '#FFF5C7' },
  'tomato': { icon: 'nutrition-outline', color: '#C74D45', packageColor: '#FFE1DD' },
  'onion': { icon: 'leaf-outline', color: '#9E7C43', packageColor: '#F4E8C8' },
  'carrot': { icon: 'leaf-outline', color: '#D77437', packageColor: '#FFE7D4' },
  'curry': { icon: 'restaurant-outline', color: '#B76F27', packageColor: '#FFF0C9' },
  'ramen': { icon: 'restaurant-outline', color: '#D8523B', packageColor: '#FFE4DE' },
  'brand-curry': { icon: 'restaurant-outline', color: '#A85F25', packageColor: '#FFE3AD' },
  'mild-ramen': { icon: 'flame-outline', color: '#D17A3B', packageColor: '#FFF0DB' },
  'instant-rice': { icon: 'cube-outline', color: '#9A744A', packageColor: '#F4E7D2' },
  'dumpling': { icon: 'pizza-outline', color: '#9C6B52', packageColor: '#F4DED1' },
  'juice': { icon: 'cafe-outline', color: '#DA7A24', packageColor: '#FFF0D2' },
  'soda': { icon: 'cafe-outline', color: '#6C59A4', packageColor: '#EEE9FF' },
  'water': { icon: 'water-outline', color: '#4E8FB8', packageColor: '#E3F4FF' },
  'sparkling-water': { icon: 'water-outline', color: '#4B9D9B', packageColor: '#E1F7F3' },
  'grape-juice': { icon: 'beer-outline', color: '#76529B', packageColor: '#EEE1F7' },
  'barley-tea': { icon: 'cafe-outline', color: '#997343', packageColor: '#F3E6CD' },
};

export const marketProducts: MarketProduct[] = marketCatalogProducts.map((product) => ({
  ...product,
  ...(productAppearance[product.id] ?? { icon: 'cube-outline' as const, color: '#527461', packageColor: '#EAF4ED' }),
}));

export type MarketObjective = { productId: string; quantity: number; label?: string; acceptedProductIds?: string[] };

export type MarketMission = {
  scene?: import('./marketScene').MarketScene;
  id: string;
  scenarioId?: string;
  catalogVersion?: string;
  scenarioVersion?: string;
  title: string;
  description: string;
  budget: number;
  objectives: MarketObjective[];
  briefing: string[];
  checkoutDialogue: string[];
  successMessage: string;
};

export const marketMission: MarketMission = {
  id: 'market-basic-shopping',
  title: '저녁 장보기',
  description: '목록에 있는 물건만 예산 안에서 골라요.',
  budget: 10000,
  objectives: [
    { productId: 'milk', quantity: 1 },
    { productId: 'apple', quantity: 2 },
    { productId: 'curry', quantity: 1 },
  ],
  briefing: [
    '안녕하세요. 오늘 저녁에 필요한 물건을 같이 골라볼까요?',
    '목록과 남은 예산은 화면 위에서 언제든 확인할 수 있어요.',
  ],
  checkoutDialogue: [
    '장보기를 마쳤군요. 목록과 장바구니를 같이 확인해 볼게요.',
    '필요한 물건과 예산을 모두 지켰는지 살펴봐요.',
  ],
  successMessage: '목록에 맞게 장보기를 마쳤어요!',
};


export function buildMarketScenarioMission(scenarioId: string): MarketMission {
  const scenario = getEnabledMarketScenario(scenarioId);
  return {
    ...marketMission,
    id: `market-scenario-${scenario.id}`,
    scenarioId: scenario.id, catalogVersion: MARKET_CATALOG_VERSION, scenarioVersion: MARKET_SCENARIO_VERSION,
    title: scenario.title,
    description: scenario.objectives.map((objective) => objective.label).join(', '),
    budget: scenario.budget, objectives: scenario.objectives,
    briefing: [`${scenario.title}에 필요한 물건을 골라요.`, '상품의 규격과 구매 단위를 보고 목록과 비교해요.'],
    successMessage: '장보기 연습을 마쳤어요!',
  };
}

/** 서버와 앱 콘텐츠 버전이 다르면 현재 가격으로 몰래 바꿔 실행하지 않는다. */
export function resolveMarketAiMission(mission: MarketMission): MarketMission {
  if (mission.catalogVersion !== MARKET_CATALOG_VERSION || mission.scenarioVersion !== MARKET_SCENARIO_VERSION) {
    throw new Error('장보기 콘텐츠 버전이 달라요. 서버와 앱을 함께 업데이트해 주세요.');
  }
  for (const objective of mission.objectives) {
    if (!getMarketProduct(objective.productId)) throw new Error('앱에 없는 상품이 포함되어 있어요.');
  }
  if (mission.scenarioId === 'CUSTOM') return mission;
  const scenario = getEnabledMarketScenario(mission.scenarioId ?? '');
  if (mission.budget !== scenario.budget || mission.objectives.length !== scenario.objectives.length
    || scenario.objectives.some((expected) => !mission.objectives.some(
      (actual) => actual.productId === expected.productId && actual.quantity === expected.quantity))) {
    throw new Error('시나리오 콘텐츠가 앱과 일치하지 않아요.');
  }
  return { ...mission, objectives: scenario.objectives };
}

export function getObjectiveProductIds(objective: MarketObjective) {
  return objective.acceptedProductIds ?? [objective.productId];
}
export function getObjectiveQuantity(cart: MarketCart, objective: MarketObjective) {
  return getObjectiveProductIds(objective).reduce((sum, id) => sum + getCartQuantity(cart, id), 0);
}

export type MarketMissionRecommendation = {
  recommendedDifficulty: 1 | 2 | 3;
  adjustments: {
    itemCount: 2 | 3 | 4;
    quantityComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
    budgetPressure: 'LOW' | 'MEDIUM' | 'HIGH';
    textSupport: 'SIMPLIFIED' | 'STANDARD' | 'REDUCED';
  };
};

export function buildPersonalizedMarketMission(
  recommendation: MarketMissionRecommendation,
): MarketMission {
  const products = ['milk', 'apple', 'curry', 'juice'].slice(
    0,
    recommendation.adjustments.itemCount,
  );
  const quantities = recommendation.adjustments.quantityComplexity === 'LOW'
    ? [1, 1, 1, 1]
    : recommendation.adjustments.quantityComplexity === 'HIGH'
      ? [2, 3, 2, 1]
      : [1, 2, 1, 1];
  const objectives = products.map((productId, index) => ({
    productId,
    quantity: quantities[index],
  }));
  const objectiveTotal = objectives.reduce((sum, objective) => {
    const product = getMarketProduct(objective.productId);
    return sum + (product?.price ?? 0) * objective.quantity;
  }, 0);
  const margin = recommendation.adjustments.budgetPressure === 'LOW'
    ? 3500
    : recommendation.adjustments.budgetPressure === 'HIGH' ? 500 : 2500;
  const budget = Math.ceil((objectiveTotal + margin) / 500) * 500;
  const briefing = recommendation.adjustments.textSupport === 'SIMPLIFIED'
    ? ['목록에 있는 물건을 필요한 수만큼 담아요.', '모두 담은 뒤 계산대로 가요.']
    : recommendation.adjustments.textSupport === 'REDUCED'
      ? ['목록과 예산을 확인하고 장보기를 시작해요.']
      : marketMission.briefing;

  return {
    ...marketMission,
    id: `market-personalized-d${recommendation.recommendedDifficulty}`,
    budget,
    objectives,
    briefing,
  };
}

export type MarketCart = Record<string, number>;

export type MarketEvaluation = {
  success: boolean;
  total: number;
  missing: MarketObjective[];
  quantityMismatches: Array<{
    productId: string;
    requiredQuantity: number;
    selectedQuantity: number;
  }>;
  extra: Array<{ productId: string; quantity: number }>;
  overBudget: number;
};

export function getMarketProduct(productId: string, products = marketProducts) {
  return products.find((product) => product.id === productId);
}

export function getCartQuantity(cart: MarketCart, productId: string) {
  return cart[productId] ?? 0;
}

export function getMarketCartTotal(cart: MarketCart, products = marketProducts) {
  return Object.entries(cart).reduce((total, [productId, quantity]) => {
    const product = getMarketProduct(productId, products);
    return total + (product?.price ?? 0) * quantity;
  }, 0);
}

export function evaluateMarketCart(cart: MarketCart, mission: MarketMission = marketMission): MarketEvaluation {
  const total = getMarketCartTotal(cart);
  const objectiveIds = new Set(mission.objectives.flatMap(getObjectiveProductIds));
  const missing = mission.objectives
    .map((objective) => ({
      productId: objective.productId,
      quantity: Math.max(0, objective.quantity - getObjectiveQuantity(cart, objective)),
    }))
    .filter((objective) => objective.quantity > 0);
  const quantityMismatches = mission.objectives
    .map((objective) => ({
      productId: objective.productId,
      requiredQuantity: objective.quantity,
      selectedQuantity: getObjectiveQuantity(cart, objective),
    }))
    .filter(({ requiredQuantity, selectedQuantity }) => requiredQuantity !== selectedQuantity);
  const extra = Object.entries(cart)
    .filter(([productId, quantity]) => quantity > 0 && !objectiveIds.has(productId))
    .map(([productId, quantity]) => ({ productId, quantity }));
  const overBudget = Math.max(0, total - mission.budget);

  return {
    success: quantityMismatches.length === 0 && extra.length === 0 && overBudget === 0,
    total,
    missing,
    quantityMismatches,
    extra,
    overBudget,
  };
}
