import { buildMarketScenarioMission, type MarketMission } from '../game/scenarios';
import { MARKET_CATALOG_VERSION, MARKET_SCENARIO_VERSION } from '../game/marketContent';

export const HARD_BASELINE_SCENARIO_ID = 'HARD_BASELINE_V1';

// Authored task conditions only. The learner still chooses every action and the
// application sends the actual session to its existing AI assessment pipeline.
const hardBaselineMission: MarketMission = {
  id: 'market-pilot-hard-baseline-v1',
  scenarioId: 'CUSTOM',
  catalogVersion: MARKET_CATALOG_VERSION,
  scenarioVersion: MARKET_SCENARIO_VERSION,
  title: '규격과 구매 수량 확인',
  description: '흰 우유 900mL 2개, 바나나 1송이, 즉석밥 210g · 3개입 제품 2개, 생수 500mL 3개',
  budget: 22000,
  objectives: [
    { productId: 'milk', quantity: 2, label: '흰 우유 900mL 2개' },
    { productId: 'banana', quantity: 1, label: '바나나 1송이' },
    { productId: 'instant-rice', quantity: 2, label: '즉석밥 210g · 3개입 제품 2개' },
    { productId: 'water', quantity: 3, label: '생수 500mL 3개' },
  ],
  briefing: ['목록에 필요한 물건을 골라요.', '상품의 규격과 구매 단위를 보고 목록과 비교해요.'],
  checkoutDialogue: [
    '장보기를 마쳤군요. 목록과 장바구니를 같이 확인해 볼게요.',
    '최종 구매를 결정하면 수행 기록을 AI가 검토해요.',
  ],
  successMessage: '장보기 연습을 마쳤어요!',
};
hardBaselineMission.objectives.forEach(Object.freeze);
Object.freeze(hardBaselineMission.objectives);
Object.freeze(hardBaselineMission.briefing);
Object.freeze(hardBaselineMission.checkoutDialogue);
Object.freeze(hardBaselineMission);


// Persona-specific authored baseline tasks; each same-person post probe repeats its complete contract.
const tailoredBaselineMissions: Record<string, MarketMission> = {
  "TAILORED_MINJAE_BASELINE_V1": {
    "id": "market-pilot-tailored-minjae-baseline-v1",
    "scenarioId": "CUSTOM",
    "title": "용량과 구매 단위 장보기",
    "description": "목록에 표시된 상품의 규격과 구매 개수를 함께 맞춰 장바구니에 담아요.",
    "budget": 26000,
    "timeLimitSeconds": 600,
    "objectives": [
      {
        "productId": "milk",
        "quantity": 2,
        "label": "흰 우유 900mL 2개"
      },
      {
        "productId": "banana",
        "quantity": 2,
        "label": "바나나 1송이 제품 2송이"
      },
      {
        "productId": "instant-rice",
        "quantity": 2,
        "label": "즉석밥 210g · 3개입 제품 2개"
      },
      {
        "productId": "water",
        "quantity": 3,
        "label": "생수 500mL 3개"
      }
    ],
    "briefing": [
      "흰 우유 900mL 2개와 바나나 1송이 제품 2송이를 구매합니다.",
      "즉석밥 210g · 3개입 제품 2개와 생수 500mL 3개를 구매합니다."
    ],
    "checkoutDialogue": [
      "목록과 장바구니를 확인하고 최종 구매를 결정해요.",
      "필요하면 일반 도움말이나 직원 도움을 이용할 수 있어요."
    ],
    "successMessage": "장보기 연습을 마쳤어요!",
    "catalogVersion": MARKET_CATALOG_VERSION,
    "scenarioVersion": MARKET_SCENARIO_VERSION
  },
  "TAILORED_SEOYEON_BASELINE_V1": {
    "id": "market-pilot-tailored-seoyeon-baseline-v1",
    "scenarioId": "CUSTOM",
    "title": "새 상품의 조건 연결 장보기",
    "description": "목록에 표시된 상품의 규격과 구매 개수를 함께 맞춰 장바구니에 담아요.",
    "budget": 34000,
    "timeLimitSeconds": 600,
    "objectives": [
      {
        "productId": "premium-eggs-15",
        "quantity": 1,
        "label": "해뜰 특란 15구 1팩"
      },
      {
        "productId": "cucumber",
        "quantity": 2,
        "label": "오이 2개입 제품 2봉"
      },
      {
        "productId": "vegetable-dumpling",
        "quantity": 2,
        "label": "채소 만두 냉동 · 400g 2개"
      },
      {
        "productId": "grape-juice",
        "quantity": 2,
        "label": "포도 주스 무가당 · 1L 2개"
      }
    ],
    "briefing": [
      "해뜰 특란 15구 1팩과 오이 2개입 제품 2봉을 구매합니다.",
      "채소 만두 냉동 · 400g 2개와 포도 주스 무가당 · 1L 2개를 구매합니다."
    ],
    "checkoutDialogue": [
      "목록과 장바구니를 확인하고 최종 구매를 결정해요.",
      "필요하면 일반 도움말이나 직원 도움을 이용할 수 있어요."
    ],
    "successMessage": "장보기 연습을 마쳤어요!",
    "catalogVersion": MARKET_CATALOG_VERSION,
    "scenarioVersion": MARKET_SCENARIO_VERSION
  },
  "TAILORED_MINSU_BASELINE_V1": {
    "id": "market-pilot-tailored-minsu-baseline-v1",
    "scenarioId": "CUSTOM",
    "title": "규격과 팩 구매 개수 장보기",
    "description": "목록에 표시된 상품의 규격과 구매 개수를 함께 맞춰 장바구니에 담아요.",
    "budget": 29000,
    "timeLimitSeconds": 600,
    "objectives": [
      {
        "productId": "chocolate-milk",
        "quantity": 3,
        "label": "초코 우유 200mL 3개"
      },
      {
        "productId": "premium-eggs-15",
        "quantity": 2,
        "label": "해뜰 특란 15구 2팩"
      },
      {
        "productId": "curry-one-mild",
        "quantity": 3,
        "label": "1인분 순한 카레 3개"
      },
      {
        "productId": "apple",
        "quantity": 2,
        "label": "상품 카드 이름이 '사과'인 1개 제품 2개"
      }
    ],
    "briefing": [
      "초코 우유 200mL 3개와 해뜰 특란 15구 2팩을 구매합니다.",
      "1인분 순한 카레 3개와 상품 카드 이름이 '사과'인 1개 제품 2개를 구매합니다."
    ],
    "checkoutDialogue": [
      "목록과 장바구니를 확인하고 최종 구매를 결정해요.",
      "필요하면 일반 도움말이나 직원 도움을 이용할 수 있어요."
    ],
    "successMessage": "장보기 연습을 마쳤어요!",
    "catalogVersion": MARKET_CATALOG_VERSION,
    "scenarioVersion": MARKET_SCENARIO_VERSION
  }
};

export function isPilotBaselineScenario(scenarioId?: string): boolean {
  return scenarioId === HARD_BASELINE_SCENARIO_ID || !!(scenarioId && Object.hasOwn(tailoredBaselineMissions, scenarioId));
}

/** Explicit control/baseline task for an isolated development replay, never a production fallback. */
export function pilotScenario(enabled: boolean, scenarioId?: string): MarketMission | null {
  if (!enabled || !scenarioId) return null;
  if (scenarioId === HARD_BASELINE_SCENARIO_ID) {
    // Return a separate instance so consumers cannot alter later probe conditions.
    return JSON.parse(JSON.stringify(hardBaselineMission)) as MarketMission;
  }
  if (Object.hasOwn(tailoredBaselineMissions, scenarioId)) return JSON.parse(JSON.stringify(tailoredBaselineMissions[scenarioId])) as MarketMission;
  return buildMarketScenarioMission(scenarioId);
}
