import {
  evaluateMarketCart,
  getMarketProduct,
  getMarketCartTotal,
  marketMission,
  marketProducts,
} from '../src/game/scenarios';

describe('마트 장보기 시나리오', () => {
  it('기본 품목과 브랜드·등급·규격이 다른 상품을 함께 제공한다', () => {
    expect(marketProducts.length).toBeGreaterThanOrEqual(20);
    expect(getMarketProduct('eggs')?.name).toBe('달걀');
    expect(getMarketProduct('premium-eggs')).toMatchObject({
      name: '해뜰 특란',
      detail: '무항생제 · 10구',
    });
    expect(getMarketProduct('sausage')?.name).toBe('소시지');
    expect(getMarketProduct('brand-sausage')).toMatchObject({
      name: '튼튼 소시지',
      detail: '오리지널 · 300g',
    });
  });

  it('필요한 물건만 목표 수량대로 담고 예산을 지키면 성공한다', () => {
    const cart = { apple: 2, curry: 1, milk: 1 };

    expect(getMarketCartTotal(cart)).toBe(7400);
    expect(evaluateMarketCart(cart)).toEqual({
      success: true,
      total: 7400,
      missing: [],
      extra: [],
      overBudget: 0,
    });
  });

  it('빠진 물건, 목록에 없는 물건, 초과 예산을 데이터로 판정한다', () => {
    const evaluation = evaluateMarketCart({ soda: 6, watermelon: 1 });

    expect(evaluation.success).toBe(false);
    expect(evaluation.missing).toEqual(marketMission.objectives);
    expect(evaluation.extra).toEqual([
      { productId: 'soda', quantity: 6 },
      { productId: 'watermelon', quantity: 1 },
    ]);
    expect(evaluation.overBudget).toBe(11200);
  });
});
