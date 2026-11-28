import { MARKET_CUSTOMER_APPEARANCES, MARKET_EMPLOYEE_APPEARANCES, type MarketPersonKind } from '../src/game/marketPeople';
import { getMarketPersonCollider, getMarketPersonFrame, getMarketPersonGeometry } from '../src/game/marketPersonLayout';
import collisionBaseline from './fixtures/marketPersonCollision.v1.json';

const variants = [
  ...MARKET_EMPLOYEE_APPEARANCES.map((variant, appearance) => ({ variant, appearance, kind: 'employee' as MarketPersonKind })),
  ...MARKET_CUSTOMER_APPEARANCES.map((variant, appearance) => ({ variant, appearance, kind: 'customer' as MarketPersonKind })),
];

it('SD 성인 외형을 플레이어와 비슷한 92px 키로 표시하고 어린이는 76% 비율과 발 기준 프레임을 유지한다', () => {
  const frame = getMarketPersonFrame({ x: 0, y: 0 });
  for (const { variant, appearance, kind } of variants) {
    const geometry = getMarketPersonGeometry(kind, appearance);
    expect(geometry.visibleHeight).toBeCloseTo(92 * (variant.age === 'child' ? 0.76 : 1));
    expect(geometry.imageWidth / geometry.imageHeight).toBeCloseTo(2 / 3);
    expect(geometry.imageWidth).toBeLessThanOrEqual(frame.width);
    expect(geometry.imageHeight).toBeLessThanOrEqual(frame.height);
  }
});

it('SD 아트로 바꿔도 몸통 위쪽의 바닥은 막지 않고 기존의 작은 발 충돌 범위를 유지한다', () => {
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
    expect(collider.height).toBeLessThan(variant.age === 'child' ? 14 : 18);
    expect(collider.width).toBeGreaterThan(variant.age === 'child' ? 15 : 20);
    expect(collider.width).toBeLessThan(variant.age === 'child' ? 20 : 28);
  }
  // The canonical physical footprints remain distinct even after an art revision.
  expect(getMarketPersonCollider(point, 'employee', 1).width)
    .toBeGreaterThan(getMarketPersonCollider(point, 'employee', 2).width);
});

it('16종의 발 충돌 사각형은 아트 교체 전 기록과 완전히 같아 기존 배치·접근 판정을 보존한다', () => {
  expect(collisionBaseline).toHaveLength(16);
  for (const { variant, appearance, kind } of variants) {
    const baseline = collisionBaseline.find(entry => entry.id === variant.id)!;
    expect(baseline.kind).toBe(kind);
    expect(getMarketPersonCollider({ x: 0, y: 0 }, kind, appearance)).toEqual(baseline.collider);
  }
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
