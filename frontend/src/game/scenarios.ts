import { supplementalMarketProducts } from './marketCatalog';

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
    description: '목록과 개수를 확인하고 필요한 물건을 골라요.',
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

export type MarketCategoryId = 'fresh' | 'produce' | 'meal' | 'drink' | 'household';

export type MarketCategory = {
  id: MarketCategoryId;
  label: string;
  helper: string;
  icon: 'snow-outline' | 'leaf-outline' | 'restaurant-outline' | 'cafe-outline' | 'home-outline';
  color: string;
  softColor: string;
};

export const marketCategories: MarketCategory[] = [
  { id: 'fresh', label: '냉장 식품', helper: '우유 · 달걀', icon: 'snow-outline', color: '#4C8FBA', softColor: '#E8F5FD' },
  { id: 'produce', label: '과일/채소', helper: '사과 · 수박 · 당근 · 양파', icon: 'leaf-outline', color: '#4B9560', softColor: '#EAF7EC' },
  { id: 'meal', label: '간편 식품', helper: '카레 · 라면', icon: 'restaurant-outline', color: '#BF783E', softColor: '#FFF1DF' },
  { id: 'drink', label: '음료', helper: '주스 · 탄산', icon: 'cafe-outline', color: '#8D65A8', softColor: '#F5ECFA' },
  { id: 'household', label: '생활용품', helper: '슬리퍼 · 건전지 · 세제 · 문구', icon: 'home-outline', color: '#89754E', softColor: '#F4EFDF' },
];

export type MarketProduct = {
  id: string;
  categoryId: MarketCategoryId;
  name: string;
  detail: string;
  price: number;
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
  /** Family matching accepts any variant; exact matching accepts only this product ID. */
  familyId?: string;
  familyLabel?: string;
  variantLabel?: string;
};

const originalMarketProducts: MarketProduct[] = [
  { id: 'milk', categoryId: 'fresh', name: '흰 우유', detail: '900mL', price: 2200, icon: 'water-outline', color: '#4A86B5', packageColor: '#EAF6FF' },
  { id: 'eggs', categoryId: 'fresh', name: '달걀', detail: '10개입', price: 3600, icon: 'ellipse-outline', color: '#A26A3E', packageColor: '#FFF1D2' },
  { id: 'premium-eggs', categoryId: 'fresh', name: '해뜰 특란', detail: '무항생제 · 10구', price: 5200, icon: 'ellipse-outline', color: '#8B613F', packageColor: '#F8E4B8' },
  { id: 'sausage', categoryId: 'fresh', name: '소시지', detail: '200g', price: 3200, icon: 'fast-food-outline', color: '#C35F58', packageColor: '#FFE5DE' },
  { id: 'brand-sausage', categoryId: 'fresh', name: '튼튼 소시지', detail: '오리지널 · 300g', price: 4800, icon: 'fast-food-outline', color: '#9C4E46', packageColor: '#FFD8CF' },
  { id: 'tofu', categoryId: 'fresh', name: '부침 두부', detail: '300g', price: 1900, icon: 'cube-outline', color: '#7B9B82', packageColor: '#EEF5E9' },
  { id: 'apple', categoryId: 'produce', name: '사과', detail: '1개', price: 1200, icon: 'nutrition-outline', color: '#C95048', packageColor: '#FFE7E3' },
  { id: 'watermelon', categoryId: 'produce', name: '수박', detail: '1통', price: 9800, icon: 'nutrition-outline', color: '#3A8A57', packageColor: '#E4F6E8' },
  { id: 'banana', categoryId: 'produce', name: '바나나', detail: '1송이', price: 3600, icon: 'nutrition-outline', color: '#C99A32', packageColor: '#FFF5C7' },
  { id: 'tomato', categoryId: 'produce', name: '토마토', detail: '4개입', price: 4500, icon: 'nutrition-outline', color: '#C74D45', packageColor: '#FFE1DD' },
  { id: 'onion', categoryId: 'produce', name: '양파', detail: '1kg', price: 3300, icon: 'leaf-outline', color: '#9E7C43', packageColor: '#F4E8C8' },
  { id: 'carrot', categoryId: 'produce', name: '당근', detail: '3개입', price: 2800, icon: 'leaf-outline', color: '#D77437', packageColor: '#FFE7D4' },
  { id: 'curry', categoryId: 'meal', name: '순한 카레', detail: '4인분', price: 2800, icon: 'restaurant-outline', color: '#B76F27', packageColor: '#FFF0C9' },
  { id: 'ramen', categoryId: 'meal', name: '매운 라면', detail: '1봉', price: 1400, icon: 'restaurant-outline', color: '#D8523B', packageColor: '#FFE4DE' },
  { id: 'brand-curry', categoryId: 'meal', name: '오늘카레 순한맛', detail: '고형 · 4인분', price: 3900, icon: 'restaurant-outline', color: '#A85F25', packageColor: '#FFE3AD' },
  { id: 'mild-ramen', categoryId: 'meal', name: '순한 라면', detail: '5개입', price: 4700, icon: 'flame-outline', color: '#D17A3B', packageColor: '#FFF0DB' },
  { id: 'instant-rice', categoryId: 'meal', name: '즉석밥', detail: '210g · 3개입', price: 4500, icon: 'cube-outline', color: '#9A744A', packageColor: '#F4E7D2' },
  { id: 'dumpling', categoryId: 'meal', name: '고기 만두', detail: '냉동 · 400g', price: 6200, icon: 'pizza-outline', color: '#9C6B52', packageColor: '#F4DED1' },
  { id: 'juice', categoryId: 'drink', name: '오렌지 주스', detail: '1L', price: 3200, icon: 'cafe-outline', color: '#DA7A24', packageColor: '#FFF0D2' },
  { id: 'soda', categoryId: 'drink', name: '탄산음료', detail: '500mL', price: 1900, icon: 'cafe-outline', color: '#6C59A4', packageColor: '#EEE9FF' },
  { id: 'water', categoryId: 'drink', name: '생수', detail: '500mL', price: 800, icon: 'water-outline', color: '#4E8FB8', packageColor: '#E3F4FF' },
  { id: 'sparkling-water', categoryId: 'drink', name: '탄산수', detail: '레몬 · 500mL', price: 1600, icon: 'water-outline', color: '#4B9D9B', packageColor: '#E1F7F3' },
  { id: 'grape-juice', categoryId: 'drink', name: '포도 주스', detail: '무가당 · 1L', price: 3800, icon: 'beer-outline', color: '#76529B', packageColor: '#EEE1F7' },
  { id: 'barley-tea', categoryId: 'drink', name: '보리차', detail: '1.5L', price: 2100, icon: 'cafe-outline', color: '#997343', packageColor: '#F3E6CD' },
];

const originalProductFamilies: Record<string, [string, string, string]> = {
  milk: ['milk', '우유', '흰 우유'],
  eggs: ['eggs', '달걀', '일반'],
  'premium-eggs': ['eggs', '달걀', '특란'],
  sausage: ['sausage', '소시지', '일반'],
  'brand-sausage': ['sausage', '소시지', '튼튼 오리지널'],
  tofu: ['tofu', '두부', '부침용'],
  apple: ['apple', '사과', '빨간 사과'],
  watermelon: ['watermelon', '수박', '일반'],
  banana: ['banana', '바나나', '일반'],
  tomato: ['tomato', '토마토', '일반'],
  onion: ['onion', '양파', '일반'],
  carrot: ['carrot', '당근', '일반'],
  curry: ['curry', '카레', '순한맛'],
  ramen: ['ramen', '라면', '매운맛'],
  'brand-curry': ['curry', '카레', '오늘카레 순한맛'],
  'mild-ramen': ['ramen', '라면', '순한맛'],
  'instant-rice': ['rice', '즉석밥', '백미'],
  dumpling: ['dumpling', '만두', '고기'],
  juice: ['juice', '주스', '오렌지'],
  soda: ['soda', '탄산음료', '일반'],
  water: ['water', '생수', '일반'],
  'sparkling-water': ['sparkling-water', '탄산수', '레몬'],
  'grape-juice': ['juice', '주스', '포도'],
  'barley-tea': ['tea', '차', '보리'],
};

export const marketProducts: MarketProduct[] = [
  ...originalMarketProducts.map((product) => {
    const [familyId, familyLabel, variantLabel] = originalProductFamilies[product.id];
    return { ...product, familyId, familyLabel, variantLabel };
  }),
  ...supplementalMarketProducts,
];

export type MarketObjective = { productId: string; quantity: number };

export type MarketMission = {
  id: string;
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
  description: '목록에 있는 물건을 필요한 개수만큼 골라요.',
  budget: 10000,
  objectives: [
    { productId: 'milk', quantity: 1 },
    { productId: 'apple', quantity: 2 },
    { productId: 'curry', quantity: 1 },
  ],
  briefing: [
    '안녕하세요. 오늘 저녁에 필요한 물건을 같이 골라볼까요?',
    '사야 할 목록은 화면 위에서, 담은 물건은 장바구니에서 확인해요.',
  ],
  checkoutDialogue: [
    '장보기를 마쳤군요. 목록과 장바구니를 같이 확인해 볼게요.',
    '최종 구매를 결정하면 목록과 개수가 맞는지 확인할 수 있어요.',
  ],
  successMessage: '목록에 맞게 장보기를 마쳤어요!',
};

export type MarketCart = Record<string, number>;

export type MarketEvaluation = {
  success: boolean;
  total: number;
  missing: MarketObjective[];
  extra: Array<{ productId: string; quantity: number }>;
  overBudget: number;
};

export function getMarketProduct(productId: string) {
  return marketProducts.find((product) => product.id === productId);
}

export function getCartQuantity(cart: MarketCart, productId: string) {
  return cart[productId] ?? 0;
}

export function getMarketCartTotal(cart: MarketCart) {
  return Object.entries(cart).reduce((total, [productId, quantity]) => {
    const product = getMarketProduct(productId);
    return total + (product?.price ?? 0) * quantity;
  }, 0);
}

export function evaluateMarketCart(cart: MarketCart, mission: MarketMission = marketMission): MarketEvaluation {
  const total = getMarketCartTotal(cart);
  const objectiveIds = new Set(mission.objectives.map((objective) => objective.productId));
  const missing = mission.objectives
    .map((objective) => ({
      productId: objective.productId,
      quantity: Math.max(0, objective.quantity - getCartQuantity(cart, objective.productId)),
    }))
    .filter((objective) => objective.quantity > 0);
  const extra = Object.entries(cart)
    .filter(([productId, quantity]) => quantity > 0 && !objectiveIds.has(productId))
    .map(([productId, quantity]) => ({ productId, quantity }));
  const overBudget = Math.max(0, total - mission.budget);

  return {
    success: missing.length === 0 && extra.length === 0 && overBudget === 0,
    total,
    missing,
    extra,
    overBudget,
  };
}
