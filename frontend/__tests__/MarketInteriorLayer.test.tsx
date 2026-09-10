import { render } from '@testing-library/react-native';
import { Image, StyleSheet, View } from 'react-native';

import {
  MarketCategoryFixture,
  MarketCheckoutFixture,
  MarketExitMarker,
  MarketInteriorBackdrop,
} from '../src/components/game/MarketInteriorLayer';
import { marketCategories } from '../src/game/scenarios';
import {
  MARKET_CASHIER_COLLIDER,
  MARKET_CASHIER_POINT,
  MARKET_CHECKOUT_POINT,
  MARKET_CHECKOUT_RECT,
  MARKET_WORLD_HEIGHT,
  MARKET_WORLD_WIDTH,
} from '../src/game/prototypeWorld';

jest.mock('expo-font', () => ({
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
}));

it('마트의 모든 진열대는 접근하기 전에도 카테고리 이름을 보여준다', () => {
  const screen = render(
    <View>
      {marketCategories.map((category) => (
        <MarketCategoryFixture active={false} category={category} key={category.id} />
      ))}
    </View>,
  );

  for (const category of marketCategories) {
    expect(screen.getByText(category.label)).toBeTruthy();
  }
  expect(screen.UNSAFE_getAllByType(Image)).toHaveLength(4);
});

it('마트 배경은 이동 조작의 터치를 가로채지 않는다', () => {
  const screen = render(<MarketInteriorBackdrop />);

  expect(screen.UNSAFE_getByType(View).props.pointerEvents).toBe('none');
  const image = screen.UNSAFE_getByType(Image);
  expect(image.props.accessible).toBe(false);
  expect(image.props.resizeMode).toBe('stretch');
  expect(StyleSheet.flatten(image.props.style)).toEqual(expect.objectContaining({
    width: MARKET_WORLD_WIDTH,
    height: MARKET_WORLD_HEIGHT,
  }));
});

it('선택 강조에도 진열대 아트 크기와 발 위치는 바뀌지 않는다', () => {
  const category = marketCategories[0];
  const screen = render(<MarketCategoryFixture active={false} category={category} />);
  const resting = StyleSheet.flatten(screen.UNSAFE_getByType(Image).props.style);

  screen.rerender(<MarketCategoryFixture active category={category} />);

  expect(StyleSheet.flatten(screen.UNSAFE_getByType(Image).props.style)).toEqual(resting);
  expect(resting.width).toBeGreaterThan(220);
  expect(resting.bottom).toBe(-8);
});

it('계산대와 출구를 항상 알아볼 수 있고 출구에 접근하면 행선지를 알려준다', () => {
  const screen = render(
    <View>
      <MarketCheckoutFixture active={false} />
      <MarketExitMarker active={false} />
    </View>,
  );

  expect(screen.getByText('계산대')).toBeTruthy();
  expect(screen.getByText('출구')).toBeTruthy();
  screen.rerender(
    <View>
      <MarketCheckoutFixture active={false} />
      <MarketExitMarker active />
    </View>,
  );
  expect(screen.getByText('마을로 나가기')).toBeTruthy();
});

it('계산대 뒤 직원 공간과 계산원을 보여주되 이동 입력을 가로채지 않는다', () => {
  const screen = render(<MarketCheckoutFixture active={false} />);
  const cashier = screen.getByTestId('market-cashier');
  const workspace = screen.getByTestId('market-cashier-workspace');
  const cashierStyle = StyleSheet.flatten(cashier.props.style);

  expect(cashier.props.pointerEvents).toBe('none');
  expect(screen.getByLabelText('계산대 뒤에서 기다리는 직원')).toBeTruthy();
  expect(workspace).toBeTruthy();
  expect(cashierStyle.top + cashierStyle.height + MARKET_CHECKOUT_RECT.y).toBe(MARKET_CASHIER_POINT.y);
  expect(cashierStyle.left + cashierStyle.width / 2 + MARKET_CHECKOUT_RECT.x).toBe(MARKET_CASHIER_POINT.x);
  // The 1536×1024 counter image has its worktop at source y336. Keep the
  // employee's whole face above it; only the lower torso should be occluded.
  const counterArt = StyleSheet.flatten(screen.getByTestId('market-checkout-art').props.style);
  const counterImageTop = MARKET_CHECKOUT_RECT.y + MARKET_CHECKOUT_RECT.height - counterArt.bottom - counterArt.height;
  const worktopY = counterImageTop + 336 / 1024 * counterArt.height;
  expect(MARKET_CHECKOUT_RECT.y + cashierStyle.top + 53).toBeLessThan(worktopY);

  const fixtureTree = JSON.stringify(screen.toJSON());
  const cashierIndex = fixtureTree.indexOf('"testID":"market-cashier"');
  const counterIndex = fixtureTree.indexOf('"testID":"market-checkout-art"');
  expect(cashierIndex).toBeGreaterThan(-1);
  expect(counterIndex).toBeGreaterThan(cashierIndex);
});

it('직원은 계산대 뒤, 고객 접근점은 앞에 있으며 중앙 고객 통로가 막히지 않는다', () => {
  const counterBottom = MARKET_CHECKOUT_RECT.y + MARKET_CHECKOUT_RECT.height;
  const cashierBottom = MARKET_CASHIER_COLLIDER.y + MARKET_CASHIER_COLLIDER.height;
  const playerRadius = 22;

  expect(cashierBottom).toBeLessThan(MARKET_CHECKOUT_RECT.y);
  expect(MARKET_CASHIER_POINT.y - 104).toBeGreaterThan(110);
  expect(MARKET_CHECKOUT_POINT.y - playerRadius).toBeGreaterThan(counterBottom);
  expect(MARKET_CHECKOUT_POINT.x).toBeGreaterThan(310 + playerRadius);
  expect(MARKET_CHECKOUT_POINT.x).toBeLessThan(590 - playerRadius);
  for (const point of [MARKET_CHECKOUT_POINT, MARKET_CASHIER_POINT]) {
    expect(point.x).toBeGreaterThan(playerRadius);
    expect(point.x).toBeLessThan(MARKET_WORLD_WIDTH - playerRadius);
    expect(point.y).toBeGreaterThan(playerRadius);
    expect(point.y).toBeLessThan(MARKET_WORLD_HEIGHT - playerRadius);
  }
});
