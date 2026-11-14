import type { MarketEnvironment } from './marketEnvironment';
import { marketCategories } from './scenarios';
/** Shared presentation text. Recording these lines does not imply comprehension or mastery. */
export function getMarketHelpLines(alarmPenaltyPoints: number): string[] {
  return [
    '상품 위치는 직원에게 물어볼 수 있어요.',
    '1. 사야 할 물품과 개수를 읽어요.',
    '2. 진열대 가까이 가서 물건을 살펴봐요.',
    '3. 장바구니를 눌러 담은 물건을 확인해요.',
    '4. 내려놓을 물건은 그 물건의 진열대로 돌아가 장바구니를 펼쳐 내려놓아요. 어렵다면 종업원에게 제자리에 놓아 달라고 부탁해요.',
    '5. 출구 옆 두 계산대 중 하나에서 구매를 확정해요. 계산원이 없으면 매장 직원을 찾아 말을 걸어요.',
    `6. 계산하지 않은 물건을 담고 입구·출구·측면 출입문의 빨간 경보기를 지나 매장 밖으로 나가면 ${alarmPenaltyPoints}점이 줄어요. 입구와 출구는 공용 복도로 이어져요. 복도 끝 공동 출입문에서 마을로 나갈 수 있어요.`,
  ];
}

export function marketCashierResponse(checkoutId: 'checkout' | 'checkout-2'): string {
  return `${checkoutId === 'checkout' ? 1 : 2}번 계산대로 와 주세요. 계산을 도와드릴게요.`;
}

export function marketReturnResponse(productName: string, quantity: number): string {
  return `${productName} ${quantity}개를 제자리에 놓아드렸어요.`;
}

/** Same shelf geometry and wording for the visible dialogue, event and replay observation. */
export function marketLocationResponse(environment: MarketEnvironment, categoryId: string): string {
  const category = marketCategories.find(item => item.id === categoryId);
  if (!category) throw new Error('Unknown shelf category');
  const shelves = Object.values(environment.shelves), target = environment.shelves[category.id];
  const row = shelves.filter(item => Math.abs(item.point.y - target.point.y) < 70).sort((a, b) => a.point.x - b.point.x);
  const index = row.indexOf(target);
  const side = row.length === 1 ? '가운데' : index === 0 ? '왼편' : index === row.length - 1 ? '오른편' : '가운데';
  const depth = target.point.y <= Math.min(...shelves.map(item => item.point.y)) + 70 ? '안쪽' : '중앙';
  return `${category.label} 진열대에 있어요. 매장 ${depth} ${side}에서 찾아보세요.`;
}
