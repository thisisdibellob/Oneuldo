import { fireEvent, render } from '@testing-library/react-native';
import { Image, StyleSheet, View } from 'react-native';
import {
  MarketCategoryFixture, MarketCheckoutFixture, MarketEnvironmentObjects,
  MarketExitMarker, MarketInteriorBackdrop, MarketPersonFixture, MarketShelfTarget, MarketKioskFixture,
} from '../src/components/game/MarketInteriorLayer';
import { marketCategories } from '../src/game/scenarios';
import { createMarketEnvironment, getMarketRenderDepth, isMarketEnvironmentBlocked, MARKET_LAYOUT_OPTIONS, type MarketEnvironment } from '../src/game/marketEnvironment';
import { MARKET_WORLD_HEIGHT, MARKET_WORLD_WIDTH } from '../src/game/prototypeWorld';
import { MARKET_PERSON_HEIGHT, MARKET_PERSON_WIDTH, getMarketPersonCollider } from '../src/game/marketPersonLayout';
import { getMarketPersonAppearance, MARKET_CUSTOMER_APPEARANCES, MARKET_EMPLOYEE_APPEARANCES } from '../src/game/marketPeople';
import { marketPeopleArt } from '../src/game/marketPeopleArt';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

it('다섯 분류는 통일된 가구에 서로 다른 상품 두 묶음과 하나의 이름표를 공유한다', () => {
  const environment = createMarketEnvironment();
  const screen = render(<View>{marketCategories.map(category => <MarketCategoryFixture key={category.id}
    active={false} category={category} orientation={environment.shelves[category.id].orientation} />)}</View>);
  expect(screen.UNSAFE_getAllByType(Image)).toHaveLength(130);
  for (const category of marketCategories) {
    const first = screen.getByTestId('market-shelf-art-' + category.id + '-1');
    const second = screen.getByTestId('market-shelf-art-' + category.id + '-2');
    expect(first.props.source).toEqual(second.props.source);
    // Explicit sizes prevent RN Web from using the source PNG's large intrinsic dimensions.
    for (const artwork of [first, second]) {
      const size = StyleSheet.flatten(artwork.props.style);
      expect(size.width).toBeCloseTo(category.id === 'produce' ? 148.35 : 162.15);
      expect(size.height).toBeCloseTo(category.id === 'produce' ? 98.9 : 108.1);
    }
    expect(screen.getByTestId(`market-facing-${category.id}-1-0-0`).props.source)
      .not.toEqual(screen.getByTestId(`market-facing-${category.id}-2-0-0`).props.source);
    expect(screen.getAllByText(category.label)).toHaveLength(1);
    const aisleIndex = marketCategories.findIndex(item => item.id === category.id) + 1;
    expect(screen.queryByText(String(aisleIndex).padStart(2, '0'))).toBeNull();
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
    const shelfArt = StyleSheet.flatten(screen.getByTestId(`market-retail-shelf-${category.id}-1`).props.style);
    expect(shelfArt.width).toBeCloseTo(162.15);
    expect(shelfArt.height).toBeCloseTo(108.1);
    screen.unmount();
  }
});

it('두 세로 계산대는 각 번호와 계산원을 따로 표시하며 같은 접근 통로를 사용한다', () => {
  const environment = createMarketEnvironment({ cashierCount: 2, kioskLane: 'none' });
  const screen = render(<View>{environment.checkouts.map((counter, index) => <MarketCheckoutFixture key={counter.id}
    counter={counter} index={index} active={false} cashierPresent={counter.cashierPresent} />)}</View>);
  expect(screen.getByText('1')).toBeTruthy();
  expect(screen.getByLabelText('1번 계산대')).toBeTruthy();
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByLabelText('2번 계산대')).toBeTruthy();
  expect(screen.getAllByTestId('market-cashier')).toHaveLength(2);
  expect(screen.getAllByText('계산 가능')).toHaveLength(2);
  expect(screen.queryByText('직원 호출')).toBeNull();
  environment.checkouts.forEach((counter, index) => {
    const style = StyleSheet.flatten(screen.getAllByTestId('market-cashier')[index].props.style);
    expect(style.left + style.width / 2 + counter.rect.x).toBe(counter.cashierPoint.x);
    expect(style.top + style.height + counter.rect.y).toBe(counter.cashierPoint.y);
    const appearance = getMarketPersonAppearance('employee', counter.cashierAppearance!);
    expect(screen.getByTestId(`market-cashier-art-${index + 1}`).props.source).toEqual(marketPeopleArt[appearance.id]);
    expect(counter.rect.height).toBeGreaterThan(counter.rect.width * 2);
    expect(isMarketEnvironmentBlocked(environment, counter.point)).toBe(false);
    expect(counter.cashierPoint.x).toBeLessThan(counter.rect.x);
    expect(counter.point.x).toBeGreaterThan(counter.rect.x + counter.rect.width);
    const art = StyleSheet.flatten(screen.getAllByTestId('market-checkout-art')[index].props.style);
    expect(art.width).toBeCloseTo(96 * 0.75 * 1.15);
    expect(art.height).toBeCloseTo(190 * 0.75 * 1.15);
    expect(art.left + art.width / 2).toBeCloseTo(counter.rect.width / 2);
    expect(art.transform).toBeUndefined();
    const shadow = StyleSheet.flatten(screen.getAllByTestId('market-checkout-shadow')[index].props.style);
    expect(shadow.width).toBeCloseTo(72 * 0.75 * 1.15);
    expect(shadow.height).toBeCloseTo(158 * 0.75 * 1.15);
    expect(shadow.left + shadow.width / 2).toBeCloseTo(counter.rect.width / 2);
    const mat = StyleSheet.flatten(screen.getAllByTestId('market-cashier-workspace')[index].props.style);
    const footprint = getMarketPersonCollider(counter.cashierPoint, 'employee', counter.cashierAppearance!);
    expect(mat.width).toBe(footprint.width);
    expect(mat.height).toBe(footprint.height);
    expect(mat.left + counter.rect.x).toBeCloseTo(footprint.x);
    expect(mat.top + counter.rect.y).toBeCloseTo(footprint.y);
    const marker = StyleSheet.flatten(screen.getByTestId(`market-checkout-marker-${index + 1}`).props.style);
    expect(marker.left + marker.width / 2).toBe(counter.rect.width / 2);
    expect(marker.top + marker.height).toBeLessThan(0);
    expect(marker.width).toBe(48);
    expect(StyleSheet.flatten(screen.getByText(String(index + 1)).props.style).fontSize).toBe(18);
    const status = StyleSheet.flatten(screen.getByTestId(`market-checkout-status-${index + 1}`).props.style);
    expect(status.left + status.width / 2).toBe(counter.rect.width / 2);
    expect(status.top).toBeGreaterThan(marker.top + marker.height);
  });
  screen.rerender(<View>{environment.checkouts.map((counter, index) => <MarketCheckoutFixture key={counter.id}
    counter={counter} index={index} active={false} cashierPresent={index === 1} />)}</View>);
  expect(screen.getAllByTestId('market-cashier')).toHaveLength(1);
  expect(screen.getByText('계산 가능')).toBeTruthy();
  expect(screen.getByText('직원 호출')).toBeTruthy();
});

it('키오스크 충돌 폭을 넓혀도 이미지 크기와 줄 중심은 유지한다', () => {
  const environment = createMarketEnvironment({ kioskLane: 'checkout-2' });
  for (const kiosk of environment.kiosks) {
    const screen = render(<MarketKioskFixture kiosk={kiosk} />);
    const art = StyleSheet.flatten(screen.getByTestId(`market-kiosk-art-${kiosk.id}`).props.style);
    expect(art.width).toBeCloseTo(73.6);
    expect(art.height).toBeCloseTo(103.5);
    expect(art.left + art.width / 2).toBeCloseTo(kiosk.rect.width / 2);
    screen.unmount();
  }
});

it('안쪽 입구와 출구는 이동 표지이며 공동 출입문에서만 마을로 나간다', () => {
  const screen = render(<View>
    <MarketExitMarker active={false} entrance />
    <MarketExitMarker active={false} />
    <MarketExitMarker active={false} kind="common-door" />
  </View>);
  expect(screen.getByText('입구')).toBeTruthy();
  expect(screen.getByText('출구')).toBeTruthy();
  expect(screen.getByText('공동 출입문')).toBeTruthy();
  for (const kind of ['entrance', 'exit', 'common-door']) {
    const marker = StyleSheet.flatten(screen.getByTestId(`market-wayfinding-${kind}`).props.style);
    expect(marker.backgroundColor).toBeUndefined();
    expect(marker.borderWidth).toBeUndefined();
  }
  screen.rerender(<View>
    <MarketExitMarker active kind="entrance" />
    <MarketExitMarker active kind="exit" />
    <MarketExitMarker active kind="common-door" />
  </View>);
  expect(screen.getByText('입구')).toBeTruthy();
  expect(screen.getByText('출구')).toBeTruthy();
  expect(screen.getAllByText('마을로 나가기')).toHaveLength(1);
});

it('매장·로비 휴게석 네 묶음과 엘리베이터·ATM은 장식으로 남고 버튼을 만들지 않는다', () => {
  const screen = render(<MarketEnvironmentObjects environment={createMarketEnvironment({ cashierCount: 0, chairCount: 4 })} />);
  expect(screen.getAllByLabelText('의자 · 원형 테이블 · 의자 휴게석')).toHaveLength(4);
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
      if (kind === 'employee') {
        expect(screen.getByText(person.label).props.numberOfLines).toBe(1);
        expect(StyleSheet.flatten(screen.getByText(person.label).props.style).flexShrink).toBe(0);
      }
      screen.unmount();
    });
  }
});

it('확장된 현관까지 타일이 이어지고 두 방향 경보기와 공동 출입문을 실제 모델 위치에 그린다', () => {
  const environment = createMarketEnvironment();
  const screen = render(<MarketInteriorBackdrop environment={environment} />);
  const byId = (id: string) => screen.getByTestId(id, { includeHiddenElements: true });
  expect(byId('market-floor-row-entrance-lobby-1440')).toBeTruthy();
  expect(byId('market-common-door-frame')).toBeTruthy();
  for (const gate of environment.alarmGates) {
    const frame = StyleSheet.flatten(byId(`market-alarm-gate-${gate.id}`).props.style);
    const beam = StyleSheet.flatten(byId(`market-alarm-beam-${gate.id}`).props.style);
    expect(frame).toEqual(expect.objectContaining({ left: gate.gate.x, top: gate.gate.y,
      width: gate.gate.width, height: gate.gate.height }));
    if (gate.axis === 'x') {
      expect(frame.left + beam.left + beam.width / 2).toBe(gate.boundary);
      expect(beam.height).toBe(gate.gate.height);
    } else {
      expect(frame.top + beam.top + beam.height / 2).toBe(gate.boundary);
      expect(beam.width).toBe(gate.gate.width);
    }
  }
  const facade = StyleSheet.flatten(byId('market-elevator-wall-facade').props.style);
  const elevators = environment.objects.filter(object => object.kind === 'elevator');
  expect(facade.top + facade.height).toBe(Math.max(...elevators.map(object => object.rect.y + object.rect.height)));
  expect(environment.walls.some(wall => facade.left === wall.x && facade.width === wall.width)).toBe(true);
  const legacy = { ...environment, alarmGates: undefined, commonDoor: undefined } as unknown as MarketEnvironment;
  screen.rerender(<MarketInteriorBackdrop environment={legacy} />);
  expect(byId('market-alarm-gate-entrance')).toBeTruthy();
  expect(screen.queryByTestId('market-alarm-gate-west-door', { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByTestId('market-common-door-frame', { includeHiddenElements: true })).toBeNull();
});

it('두 진열대는 같은 상품을 열되 중간 40px 통로는 터치 영역으로 덮지 않는다', () => {
  const environment = createMarketEnvironment();
  const placement = environment.shelves.household;
  const onPress = jest.fn();
  const screen = render(<MarketShelfTarget placement={placement} categoryId="household"
    active={false} highlighted onPress={onPress} accessibilityLabel="생활용품 진열대" />);
  const root = screen.getByTestId('market-shelf-target-household');
  expect(root.props.pointerEvents).toBe('box-none');
  const first = screen.getByTestId('market-shelf-touch-household-1');
  const second = screen.getByTestId('market-shelf-touch-household-2', { includeHiddenElements: true });
  const a = StyleSheet.flatten(first.props.style);
  const b = StyleSheet.flatten(second.props.style);
  expect(a).toEqual(expect.objectContaining({ top: 0, left: 0, width: expect.closeTo(139.15), height: expect.closeTo(73.6) }));
  expect(b).toEqual(expect.objectContaining({ top: expect.closeTo(113.6), left: 0, width: expect.closeTo(139.15), height: expect.closeTo(73.6) }));
  expect(b.top - a.top - a.height).toBeCloseTo(40);
  expect(first.props.hitSlop).toBeUndefined();
  expect(second.props.hitSlop).toBeUndefined();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.press(first);
  fireEvent.press(second);
  expect(onPress).toHaveBeenCalledTimes(2);
  screen.rerender(<MarketShelfTarget placement={placement} categoryId="household"
    active disabled onPress={onPress} accessibilityLabel="생활용품 진열대" />);
  fireEvent.press(screen.getByTestId('market-shelf-touch-household-1'));
  fireEvent.press(screen.getByTestId('market-shelf-touch-household-2', { includeHiddenElements: true }));
  expect(onPress).toHaveBeenCalledTimes(2);
});

it('기둥과 세로 진열대 각각은 발판 바닥 순서로 겹치며 통로에 선 기둥은 앞뒤 가구 사이에 놓인다', () => {
  const environment = createMarketEnvironment({ pillarCount: 0 });
  const placement = environment.shelves.household;
  const pillar = { id: 'depth-pillar', kind: 'pillar' as const, slotId: 'test-depth',
    rect: { x: placement.x + 130, y: placement.y + 70, width: 30, height: 30 } };
  const screen = render(<View testID="test-world">
    <MarketEnvironmentObjects environment={{ ...environment, objects: [pillar] }} />
    <MarketShelfTarget placement={placement} categoryId="household" active={false}
      onPress={jest.fn()} accessibilityLabel="생활용품 진열대" />
  </View>);
  const back = screen.getByTestId('market-shelf-target-household');
  const front = screen.getByTestId('market-shelf-target-household-second');
  const column = screen.getByTestId('market-object-depth-pillar');
  const depth = (node: typeof column) => StyleSheet.flatten(node.props.style).zIndex!;
  expect(depth(back)).toBe(getMarketRenderDepth(placement.y + 73.6));
  expect(depth(column)).toBe(getMarketRenderDepth(pillar.rect.y + pillar.rect.height));
  expect(depth(back)).toBeLessThan(depth(column));
  expect(depth(column)).toBeLessThan(depth(front));
  // Host views share the world parent; nested stacking contexts would break this order.
  const hostParent = (node: typeof column) => { let parent = node.parent; while (parent && typeof parent.type !== 'string') parent = parent.parent; return parent; };
  expect(hostParent(back)).toBe(hostParent(column));
  expect(hostParent(front)).toBe(hostParent(column));
  expect(screen.getAllByText('생활용품')).toHaveLength(1);
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

it('휴식 문구를 없애고 하단 공용 로비의 좌석 영역과 화분을 표시한다', () => {
  const environment = createMarketEnvironment();
  const screen = render(<View><MarketInteriorBackdrop environment={environment} /><MarketEnvironmentObjects environment={environment} /></View>);
  expect(screen.queryByText('잠깐 쉬어가요', { includeHiddenElements: true })).toBeNull();
  expect(screen.getByTestId('market-lobby-seating-inlay', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByLabelText('로비 화분')).toBeTruthy();
});


it.each(MARKET_LAYOUT_OPTIONS)('$label에서는 벽·출입문·간판·휴게석이 실제 지점 좌표를 따른다', ({ id: layoutId }) => {
  const environment = createMarketEnvironment({ layoutId, seed: 'architecture-contract' });
  const screen = render(<MarketInteriorBackdrop environment={environment} />);
  const style = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID, { includeHiddenElements: true }).props.style);
  const asStyle = (rect: { x: number; y: number; width: number; height: number }) => ({ left: rect.x, top: rect.y, width: rect.width, height: rect.height });
  for (const area of environment.walkableAreas) {
    expect(style(`market-floor-${area.id}`)).toEqual(expect.objectContaining(asStyle(area)));
  }
  environment.walls.forEach((wall, index) => expect(style(`market-wall-${index}`)).toEqual(expect.objectContaining(asStyle(wall))));
  expect(style('market-common-door-frame')).toEqual(expect.objectContaining(asStyle(environment.commonDoor.gate)));
  const sales = environment.walkableAreas.find(area => area.id === 'main-sales-floor')!;
  const fascia = style('market-store-fascia');
  expect(fascia.left).toBeGreaterThanOrEqual(sales.x);
  expect(fascia.left + fascia.width).toBeLessThanOrEqual(sales.x + sales.width);
  expect(fascia.top + fascia.height).toBeLessThanOrEqual(sales.y);
  const lobby = environment.walkableAreas.find(area => area.id === 'entrance-lobby')!;
  const inlay = style('market-lobby-seating-inlay');
  const lobbySeats = environment.objects.filter(object => object.kind === 'restSet' && object.rect.y >= lobby.y);
  expect(lobbySeats).toHaveLength(2);
  for (const seat of lobbySeats) {
    expect(inlay.left).toBeLessThan(seat.rect.x);
    expect(inlay.top).toBeLessThan(seat.rect.y);
    expect(inlay.left + inlay.width).toBeGreaterThan(seat.rect.x + seat.rect.width);
    expect(inlay.top + inlay.height).toBeGreaterThan(seat.rect.y + seat.rect.height);
  }
  for (const gate of environment.alarmGates) expect(style(`market-alarm-gate-${gate.id}`)).toEqual(expect.objectContaining(asStyle(gate.gate)));
  screen.unmount();
});

it.each(MARKET_LAYOUT_OPTIONS)('$label의 공사는 같은 충돌 사각형에만 펜스를 표시하고 해제하면 그림·통행 제한이 함께 사라진다', ({ id: layoutId }) => {
  const options = { layoutId, seed: 'construction-render', pillarCount: 0, cashierCount: 0 as const, kioskPresent: false };
  const closed = createMarketEnvironment({ ...options, entranceConstruction: true });
  const open = createMarketEnvironment({ ...options, entranceConstruction: false });
  const zone = closed.constructionZones[0];
  const screen = render(<View><MarketEnvironmentObjects environment={closed} />
    <MarketExitMarker kind="entrance" active={false} blocked /></View>);
  const frame = StyleSheet.flatten(screen.getByTestId(`market-construction-${zone.id}`).props.style);
  expect(frame).toEqual(expect.objectContaining({ left: zone.rect.x, top: zone.rect.y,
    width: zone.rect.width, height: zone.rect.height, zIndex: getMarketRenderDepth(zone.rect.y + zone.rect.height) }));
  const art = StyleSheet.flatten(screen.getByTestId(`market-construction-art-${zone.id}`, { includeHiddenElements: true }).props.style);
  expect(art.width / art.height).toBeCloseTo(1983 / 793);
  expect(art.width).toBeLessThanOrEqual(zone.rect.width * 1.1);
  // Source alpha ends at y704/793; transparent lower padding cannot raise the visible feet.
  expect(art.bottom + (793 - 704) * art.width / 1983).toBeCloseTo(0);
  expect(closed.obstacles).toContainEqual(zone.rect);
  expect(isMarketEnvironmentBlocked(closed, closed.entrance.point)).toBe(true);
  expect(screen.queryByText('공사 중')).toBeNull();
  expect(screen.getByText('입구')).toBeTruthy();
  screen.rerender(<View><MarketEnvironmentObjects environment={open} />
    <MarketExitMarker kind="entrance" active={false} /></View>);
  expect(screen.queryByTestId(`market-construction-${zone.id}`)).toBeNull();
  expect(screen.queryByText('공사 중')).toBeNull();
  expect(screen.getByText('입구')).toBeTruthy();
  expect(isMarketEnvironmentBlocked(open, open.entrance.point)).toBe(false);
  screen.unmount();
});


it('모퉁이 지점의 계산대 번호·상태 표지는 진열대 표지와 계산대 그림에 겹치지 않는다', () => {
  const environment = createMarketEnvironment({ layoutId: 'corner', seed: 'corner-sign-clearance', cashierCount: 2 });
  const screen = render(<View>
    {marketCategories.map(category => <MarketShelfTarget key={category.id} placement={environment.shelves[category.id]}
      categoryId={category.id} active={false} onPress={jest.fn()} accessibilityLabel={category.label} />)}
    {environment.checkouts.map((counter, index) => <MarketCheckoutFixture key={counter.id} counter={counter}
      index={index} active={false} cashierPresent />)}
  </View>);
  const flatten = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);
  const shelfSigns = marketCategories.map(category => {
    const placement = environment.shelves[category.id];
    const label = flatten(`market-aisle-marker-${category.id}`);
    return { x: placement.x + (placement.width - label.width) / 2,
      y: placement.y + placement.height - label.bottom - label.height, width: label.width, height: label.height };
  });
  const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  environment.checkouts.forEach((counter, index) => {
    const marker = flatten(`market-checkout-marker-${index + 1}`);
    const status = flatten(`market-checkout-status-${index + 1}`);
    const toWorld = (style: typeof marker) => ({ x: counter.rect.x + style.left, y: counter.rect.y + style.top,
      width: style.width, height: style.height });
    const numberBounds = toWorld(marker), statusBounds = toWorld(status);
    for (const shelfSign of shelfSigns) {
      expect(overlaps(numberBounds, shelfSign)).toBe(false);
      expect(overlaps(statusBounds, shelfSign)).toBe(false);
    }
    expect(overlaps(numberBounds, statusBounds)).toBe(false);
    const artwork = StyleSheet.flatten(screen.getAllByTestId('market-checkout-art')[index].props.style);
    const artTop = counter.rect.y + counter.rect.height - artwork.bottom - artwork.height;
    expect(numberBounds.y + numberBounds.height).toBeLessThan(artTop);
    expect(statusBounds.y + statusBounds.height).toBeLessThan(artTop);
    expect(marker.width).toBe(48);
    expect(StyleSheet.flatten(screen.getByText(String(index + 1)).props.style).fontSize).toBe(18);
  });
  screen.unmount();
});
