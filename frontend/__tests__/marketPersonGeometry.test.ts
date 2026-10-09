import { MARKET_CUSTOMER_APPEARANCES, MARKET_EMPLOYEE_APPEARANCES, type MarketPersonKind } from '../src/game/marketPeople';
import { getMarketPersonCollider, getMarketPersonFrame, getMarketPersonGeometry } from '../src/game/marketPersonLayout';

const variants = [
  ...MARKET_EMPLOYEE_APPEARANCES.map((variant, appearance) => ({ variant, appearance, kind: 'employee' as MarketPersonKind })),
  ...MARKET_CUSTOMER_APPEARANCES.map((variant, appearance) => ({ variant, appearance, kind: 'customer' as MarketPersonKind })),
];

it('모든 성인 외형을 104px 키로 표시하고 어린이는 76% 비율과 발 기준 프레임을 유지한다', () => {
  const frame = getMarketPersonFrame({ x: 0, y: 0 });
  for (const { variant, appearance, kind } of variants) {
    const geometry = getMarketPersonGeometry(kind, appearance);
    expect(geometry.visibleHeight).toBeCloseTo(104 * (variant.age === 'child' ? 0.76 : 1));
    expect(geometry.imageWidth / geometry.imageHeight).toBe(0.5);
    expect(geometry.imageWidth).toBeLessThanOrEqual(frame.width);
    expect(geometry.imageHeight).toBeLessThanOrEqual(frame.height);
  }
});

it('NPC 몸통 위쪽의 빈 바닥은 막지 않고 실제 두 신발 너비만 바닥 충돌로 사용한다', () => {
  const point = { x: 310, y: 670 };
  for (const { variant, appearance, kind } of variants) {
    const geometry = getMarketPersonGeometry(kind, appearance);
    const collider = getMarketPersonCollider(point, kind, appearance);
    const pressFrame = getMarketPersonFrame(point);
    expect(collider.y).toBeGreaterThan(point.y - 13);
    expect(collider.y + collider.height).toBeLessThan(point.y + 5);
    expect(collider.x).toBeLessThan(point.x);
    expect(collider.x + collider.width).toBeGreaterThan(point.x);
    expect(collider.width).toBeLessThan(pressFrame.width * 0.55);
    expect(collider.height).toBeLessThan(geometry.visibleHeight * 0.17);
    expect(collider.width).toBeGreaterThan(variant.age === 'child' ? 15 : 20);
    expect(collider.width).toBeLessThan(variant.age === 'child' ? 20 : 28);
  }
  // These two employees have visibly different shoe spans in the runtime PNGs.
  expect(getMarketPersonCollider(point, 'employee', 1).width)
    .toBeGreaterThan(getMarketPersonCollider(point, 'employee', 2).width);
});

it('발 기준 위치를 옮기면 충돌과 프레임이 똑같이 이동하며 외형 숫자 호환을 유지한다', () => {
  const origin = getMarketPersonCollider({ x: 0, y: 0 }, 'customer', 11);
  const translated = getMarketPersonCollider({ x: 84, y: 193 }, 'customer', 11);
  expect(translated.x - origin.x).toBeCloseTo(84);
  expect(translated.y - origin.y).toBeCloseTo(193);
  expect(translated.width).toBe(origin.width);
  expect(translated.height).toBe(origin.height);
  const frame = getMarketPersonFrame({ x: 84, y: 193 });
  expect(frame.left + frame.width / 2).toBe(84);
  expect(frame.top + frame.height).toBe(193);
  expect(getMarketPersonGeometry('employee', 4)).toEqual(getMarketPersonGeometry('employee', 0));
});
