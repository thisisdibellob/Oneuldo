import { render } from '@testing-library/react-native';
import { Image, StyleSheet, View } from 'react-native';
import {
  MarketCategoryFixture, MarketCheckoutFixture, MarketEnvironmentObjects,
  MarketExitMarker, MarketInteriorBackdrop, MarketPersonFixture,
} from '../src/components/game/MarketInteriorLayer';
import { marketCategories } from '../src/game/scenarios';
import { createMarketEnvironment, isMarketEnvironmentBlocked } from '../src/game/marketEnvironment';
import { MARKET_WORLD_HEIGHT, MARKET_WORLD_WIDTH } from '../src/game/prototypeWorld';
import { MARKET_PERSON_HEIGHT, MARKET_PERSON_WIDTH } from '../src/game/marketPersonLayout';
import { getMarketPersonAppearance, MARKET_CUSTOMER_APPEARANCES, MARKET_EMPLOYEE_APPEARANCES } from '../src/game/marketPeople';
import { marketPeopleArt } from '../src/game/marketPeopleArt';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

it('다섯 분류는 다른 그림 두 개와 하나의 이름표를 공유한다', () => {
  const environment = createMarketEnvironment();
  const screen = render(<View>{marketCategories.map(category => <MarketCategoryFixture key={category.id}
    active={false} category={category} orientation={environment.shelves[category.id].orientation} />)}</View>);
  expect(screen.UNSAFE_getAllByType(Image)).toHaveLength(10);
  for (const category of marketCategories) {
    const first = screen.getByTestId('market-shelf-art-' + category.id + '-1');
    const second = screen.getByTestId('market-shelf-art-' + category.id + '-2');
    expect(first.props.source).not.toEqual(second.props.source);
    expect(screen.getAllByText(category.label)).toHaveLength(1);
  }
});

it('직사각형 바닥과 벽은 게임 입력을 가로채지 않으며 원근 배경을 늘려 쓰지 않는다', () => {
  const screen = render(<MarketInteriorBackdrop />);
  const root = screen.UNSAFE_getAllByType(View)[0];
  expect(root.props.pointerEvents).toBe('none');
  expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);
  expect(StyleSheet.flatten(root.props.style)).toEqual(expect.objectContaining({ width: MARKET_WORLD_WIDTH, height: MARKET_WORLD_HEIGHT }));
});

it('가로와 세로 묶음 모두 선택 강조로 가구 크기와 발 위치가 움직이지 않는다', () => {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    const category = marketCategories[0];
    const screen = render(<MarketCategoryFixture active={false} category={category} orientation={orientation} />);
    const before = screen.UNSAFE_getAllByType(Image).map(image => StyleSheet.flatten(image.props.style));
    screen.rerender(<MarketCategoryFixture active category={category} orientation={orientation} />);
    expect(screen.UNSAFE_getAllByType(Image).map(image => StyleSheet.flatten(image.props.style))).toEqual(before);
    before.forEach(style => expect(style).toEqual(expect.objectContaining({ width: 141, height: 94 })));
    screen.unmount();
  }
});

it('두 세로 계산대는 각 번호와 계산원을 따로 표시하며 같은 접근 통로를 사용한다', () => {
  const environment = createMarketEnvironment({ cashierCount: 2 });
  const screen = render(<View>{environment.checkouts.map((counter, index) => <MarketCheckoutFixture key={counter.id}
    counter={counter} index={index} active={false} cashierPresent={counter.cashierPresent} />)}</View>);
  expect(screen.getByText('1번 계산대')).toBeTruthy();
  expect(screen.getByText('2번 계산대')).toBeTruthy();
  expect(screen.getAllByTestId('market-cashier')).toHaveLength(2);
  environment.checkouts.forEach((counter, index) => {
    const style = StyleSheet.flatten(screen.getAllByTestId('market-cashier')[index].props.style);
    expect(style.left + style.width / 2 + counter.rect.x).toBe(counter.cashierPoint.x);
    expect(style.top + style.height + counter.rect.y).toBe(counter.cashierPoint.y);
    const appearance = getMarketPersonAppearance('employee', counter.cashierAppearance!);
    expect(screen.getByTestId(`market-cashier-art-${index + 1}`).props.source).toEqual(marketPeopleArt[appearance.id]);
    expect(counter.rect.height).toBeGreaterThan(counter.rect.width * 2);
    expect(isMarketEnvironmentBlocked(environment, counter.point)).toBe(false);
  });
  screen.rerender(<View>{environment.checkouts.map((counter, index) => <MarketCheckoutFixture key={counter.id}
    counter={counter} index={index} active={false} cashierPresent={index === 1} />)}</View>);
  expect(screen.getAllByTestId('market-cashier')).toHaveLength(1);
});

it('입구 경보기와 출구는 서로 구별되고 둘 다 퇴장할 수 있음을 알린다', () => {
  const screen = render(<View><MarketExitMarker active={false} entrance /><MarketExitMarker active={false} /></View>);
  expect(screen.getByText('입구 · 경보기')).toBeTruthy();
  expect(screen.getByText('출구')).toBeTruthy();
  screen.rerender(<View><MarketExitMarker active entrance /><MarketExitMarker active /></View>);
  expect(screen.getAllByText('마을로 나가기')).toHaveLength(2);
});

it('휴게석 두 묶음과 엘리베이터·ATM은 장식으로 남고 버튼을 만들지 않는다', () => {
  const screen = render(<MarketEnvironmentObjects environment={createMarketEnvironment({ cashierCount: 0, chairCount: 4 })} />);
  expect(screen.getAllByLabelText('의자 · 원형 테이블 · 의자 휴게석')).toHaveLength(2);
  expect(screen.getAllByLabelText('엘리베이터 · 장식')).toHaveLength(2);
  expect(screen.getByLabelText('ATM · 이용 준비 중')).toBeTruthy();
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});

it('16개 인물은 각 PNG를 표시하고 어린이 크기와 선택 강조가 발 좌표·터치 영역을 바꾸지 않는다', () => {
  const environment = createMarketEnvironment();
  for (const kind of ['employee', 'customer'] as const) {
    const pool = kind === 'employee' ? MARKET_EMPLOYEE_APPEARANCES : MARKET_CUSTOMER_APPEARANCES;
    const base = kind === 'employee' ? environment.employees[0] : environment.customers[0];
    pool.forEach((variant, appearance) => {
      const person = { ...base, appearance, appearanceId: variant.id };
      const screen = render(<MarketPersonFixture person={person} />);
      const picture = screen.getByTestId(`market-person-art-${person.id}`);
      const root = screen.getByTestId(`market-person-${person.id}`);
      const style = StyleSheet.flatten(picture.props.style);
      const frame = StyleSheet.flatten(root.props.style);
      expect(picture.props.source).toEqual(marketPeopleArt[variant.id]);
      expect(style.bottom).toBe(0);
      expect(style.left + style.width / 2).toBe(MARKET_PERSON_WIDTH / 2);
      expect(style.height).toBeCloseTo(MARKET_PERSON_HEIGHT * (variant.age === 'child' ? 0.76 : 1));
      expect(frame.height).toBe(MARKET_PERSON_HEIGHT);
      expect(frame.width).toBe(MARKET_PERSON_WIDTH);
      screen.rerender(<MarketPersonFixture person={person} active />);
      expect(StyleSheet.flatten(screen.getByTestId(`market-person-art-${person.id}`).props.style)).toEqual(style);
      expect(StyleSheet.flatten(screen.getByTestId(`market-person-${person.id}`).props.style)).toEqual(frame);
      if (kind === 'employee') expect(screen.getByText(person.label)).toBeTruthy();
      screen.unmount();
    });
  }
});
