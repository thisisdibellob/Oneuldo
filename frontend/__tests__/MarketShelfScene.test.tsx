import { act, fireEvent, render } from '@testing-library/react-native';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  Platform,
  StyleSheet,
} from 'react-native';

import { MarketShelfScene, MarketShelfSceneProps } from '../src/components/game/MarketShelfScene';
import { marketCategories, marketProducts } from '../src/game/scenarios';
import { createMarketSession } from '../src/game/marketSession';

import {
  MarketInteractionRequest,
  MarketSimulationScreen,
} from '../src/screens/MarketSimulationScreen';

async function advanceTransition(milliseconds = 500) {
  await act(async () => {
    jest.advanceTimersByTime(milliseconds);
    await Promise.resolve();
  });
}

function renderEmbeddedMarket() {
  const fixture = createMarketSession({seed:'shelf-tests', environment:{cashierCount:1}});
  const playerPositionRef = {current:fixture.environment.spawn};
  const onExit = jest.fn();
  const onLockChange = jest.fn();
  let request: MarketInteractionRequest | null = null;
  const renderScreen = () => (
    <MarketSimulationScreen
      embedded
      environment={fixture.environment}
      initialConfig={fixture.config}
      playerPositionRef={playerPositionRef}
      interactionRequest={request}
      onExit={onExit}
      onLockChange={onLockChange}
    />
  );
  const screen = render(renderScreen());
  const start = async () => {
    fireEvent.press(screen.getByText('다음'));
    fireEvent.press(screen.getByText('장보기 시작'));
    await advanceTransition();
  };
  const open = async (nextRequest: MarketInteractionRequest) => {
    playerPositionRef.current = fixture.environment.stations[nextRequest.station];
    request = nextRequest;
    screen.rerender(renderScreen());
    await advanceTransition();
  };
  const close = () => {
    fireEvent.press(screen.getAllByRole('button', { name: '진열대 닫기' })[0]);
  };
  return { close, onExit, onLockChange, open, renderScreen, screen, start };
}

describe('몰입형 진열대 진입과 매장 복귀', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('진열대 퇴장 애니메이션이 끝날 때까지 이동을 잠그고 매장 안에 남는다', async () => {
    const market = renderEmbeddedMarket();
    try {
      await market.start();
      expect(market.onLockChange).toHaveBeenLastCalledWith(false);

      await market.open({ id: 1, station: 'fresh' });
      expect(market.onLockChange).toHaveBeenLastCalledWith(true);
      expect(market.screen.getByRole('button', { name: '흰 우유 담기' })).toBeTruthy();

      market.close();
      expect(market.onLockChange).toHaveBeenLastCalledWith(true);
      await advanceTransition();

      expect(market.onLockChange).toHaveBeenLastCalledWith(false);
      expect(market.screen.queryByRole('button', { name: '흰 우유 담기' })).toBeNull();
      expect(market.onExit).not.toHaveBeenCalled();
    } finally {
      market.screen.unmount();
    }
  });

  it('진열대를 닫았다 다시 열어도 담은 수량을 유지하고 오래된 요청으로 다시 열지 않는다', async () => {
    const market = renderEmbeddedMarket();
    try {
      await market.start();
      await market.open({ id: 1, station: 'fresh' });
      fireEvent.press(market.screen.getByRole('button', { name: '흰 우유 담기' }));
      market.close();
      await advanceTransition();

      market.screen.rerender(market.renderScreen());
      await advanceTransition();
      expect(market.screen.queryByLabelText('흰 우유 한 개 빼기')).toBeNull();
      expect(market.onLockChange).toHaveBeenLastCalledWith(false);

      await market.open({ id: 2, station: 'fresh' });
      expect(market.screen.getAllByLabelText('흰 우유 한 개 더 담기').length).toBeGreaterThan(0);
      expect(market.screen.queryByRole('button', { name: '흰 우유 담기' })).toBeNull();
      market.close();
      await advanceTransition();

      await market.open({ id: 3, station: 'produce' });
      expect(market.screen.getByRole('button', { name: '사과 담기' })).toBeTruthy();
      fireEvent.press(market.screen.getByRole('button', { name: '사과 담기' }));
      market.close();
      await advanceTransition();

      fireEvent.press(market.screen.getByRole('button', { name: '장바구니 열기' }));
      expect(market.screen.getByText(/담은 물건 2개/)).toBeTruthy();
      expect(market.onExit).not.toHaveBeenCalled();
    } finally {
      market.screen.unmount();
    }
  });

  it('닫기를 연속으로 눌러도 한 번만 잠금을 해제하고 다음 진입을 방해하지 않는다', async () => {
    const market = renderEmbeddedMarket();
    try {
      await market.start();
      await market.open({ id: 1, station: 'fresh' });
      market.onLockChange.mockClear();

      market.close();
      market.close();
      await advanceTransition();

      expect(market.onLockChange.mock.calls.filter(([locked]) => locked === false)).toHaveLength(1);
      await market.open({ id: 2, station: 'produce' });
      expect(market.onLockChange).toHaveBeenLastCalledWith(true);
      expect(market.screen.getByRole('button', { name: '사과 담기' })).toBeTruthy();
      expect(market.onExit).not.toHaveBeenCalled();
    } finally {
      market.screen.unmount();
    }
  });

  it('진열대가 열린 상태로 장보기 화면이 해제되어도 이동 잠금이 남지 않는다', async () => {
    const market = renderEmbeddedMarket();
    await market.start();
    await market.open({ id: 1, station: 'fresh' });
    expect(market.onLockChange).toHaveBeenLastCalledWith(true);

    market.screen.unmount();
    expect(market.onLockChange).toHaveBeenLastCalledWith(false);
    await advanceTransition();
    expect(market.onExit).not.toHaveBeenCalled();
  });
});

function shelfProps(overrides: Partial<MarketShelfSceneProps> = {}): MarketShelfSceneProps {
  return {
    cart: {},
    category: marketCategories[0],
    onChangeQuantity: jest.fn(),
    onClose: jest.fn(),
    onDropProduct: jest.fn(() => true),
    ...overrides,
  };
}

describe('진열대 전체 화면 구성과 뒤로가기', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('진열대 장바구니는 부드럽게 펼치고 접는 동안 수량을 보존하며 숨긴 버튼을 차단한다', async () => {
    const onCartVisibilityChange = jest.fn();
    const onChangeQuantity = jest.fn();
    const screen = render(<MarketShelfScene {...shelfProps({ cart: { milk: 2 }, onCartVisibilityChange, onChangeQuantity })} />);
    try {
      await advanceTransition();
      expect(screen.queryByRole('button', { name: '흰 우유 냉장 식품 진열대에 1개 내려놓기' })).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: '진열대 장바구니 보기' }));
      await advanceTransition();
      expect(screen.getByText('2개')).toBeTruthy();
      expect(screen.getByRole('button', { name: '흰 우유 냉장 식품 진열대에 1개 내려놓기' })).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: '진열대 장바구니 보기' }));
      expect(screen.getByTestId('market-shelf-cart-reveal', { includeHiddenElements: true }).props.pointerEvents).toBe('none');
      expect(screen.queryByRole('button', { name: '흰 우유 냉장 식품 진열대에 1개 내려놓기' })).toBeNull();
      await advanceTransition();
      fireEvent.press(screen.getByRole('button', { name: '진열대 장바구니 보기' }));
      await advanceTransition();
      expect(screen.getByText('2개')).toBeTruthy();
      expect(onCartVisibilityChange.mock.calls.map(call => call[0])).toEqual([true, false, true]);
      expect(onChangeQuantity).not.toHaveBeenCalled();
    } finally { screen.unmount(); }
  });

  it('담은 상품을 모두 보여 주고 현재 진열대 상품만 한 개씩 내려놓도록 안내한다', async () => {
    const onChangeQuantity = jest.fn();
    const props = shelfProps({
      cart: { milk: 2, apple: 1, 'aa-batteries': 3 },
      slots: ['milk'],
      onChangeQuantity,
    });
    const screen = render(<MarketShelfScene {...props} />);
    try {
      await advanceTransition();
      fireEvent.press(screen.getByRole('button', { name: '진열대 장바구니 보기' }));
      await advanceTransition();

      expect(screen.getByText('사과')).toBeTruthy();
      expect(screen.getByText('AA 건전지 4개입')).toBeTruthy();
      expect(screen.getByText('과일/채소 진열대에서 내려놓기')).toBeTruthy();
      expect(screen.getByText('생활용품 진열대에서 내려놓기')).toBeTruthy();
      expect(screen.getByText('물건은 해당 진열대에서 한 개씩 내려놓아요. 종업원에게 도움을 요청해도 돼요.')).toBeTruthy();
      expect(screen.getAllByRole('button', { name: /진열대에 1개 내려놓기$/ })).toHaveLength(1);
      expect(screen.queryByRole('button', { name: /사과.*내려놓기/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /AA 건전지.*내려놓기/ })).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: '흰 우유 냉장 식품 진열대에 1개 내려놓기' }));
      expect(onChangeQuantity.mock.calls).toEqual([['milk', -1]]);

      screen.rerender(<MarketShelfScene {...props} category={marketCategories.find(item => item.id === 'household')!} slots={['aa-batteries']} />);
      expect(screen.getByText('냉장 식품 진열대에서 내려놓기')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /흰 우유.*내려놓기/ })).toBeNull();
      expect(screen.getAllByRole('button', { name: /진열대에 1개 내려놓기$/ })).toHaveLength(1);
      fireEvent.press(screen.getByRole('button', { name: 'AA 건전지 4개입 생활용품 진열대에 1개 내려놓기' }));
      expect(onChangeQuantity.mock.calls).toEqual([['milk', -1], ['aa-batteries', -1]]);
      expect(screen.getByText('3개')).toBeTruthy();
    } finally { screen.unmount(); }
  });

  it('가로 회전과 모바일 폭 변경에도 배경의 실제 표시 폭과 원본 비율을 유지한다', async () => {
    const screen = render(<MarketShelfScene {...shelfProps()} />);
    try {
      for (const width of [320, 375, 430, 1024, 375]) {
        fireEvent(screen.getByTestId('market-shelf-scene'), 'layout', {
          nativeEvent: { layout: { x: 0, y: 0, width, height: 812 } },
        });
        await advanceTransition();
        const backdrop = screen.getByTestId('market-shelf-backdrop-0');
        const rowStyle = StyleSheet.flatten(screen.getByTestId('market-shelf-row-0').props.style);
        const imageStyle = StyleSheet.flatten(backdrop.props.style);
        expect(imageStyle.width).toBe(width);
        expect(imageStyle.width / imageStyle.height).toBeCloseTo(1536 / 1024);
        expect(backdrop.props.resizeMode).toBe('contain');
        expect(rowStyle.overflow).toBe('hidden');
        expect(rowStyle.width).toBe(width);
      }
    } finally {
      screen.unmount();
    }
  });

  it('각 코너의 9종 상품을 4열 3행 12칸에 표시하며 장바구니는 상품 스크롤 밖에 고정한다', async () => {
    const fixture = createMarketSession({seed:'shelf-layout'});
    const visibleProducts = new Set<string>();
    for (const category of marketCategories) {
      const slots = fixture.shelfSlots[category.id];
      const screen = render(<MarketShelfScene {...shelfProps({ category, slots })} />);
      try {
        fireEvent(screen.getByTestId('market-shelf-scene'), 'layout', {
          nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 812 } },
        });
        await advanceTransition();

        const productScroll = screen.getByTestId('market-shelf-scroll');
        expect(productScroll.findAllByProps({ testID: 'market-shelf-basket-dock' })).toHaveLength(0);
        expect(screen.getByTestId('market-shelf-basket-dock')).toBeTruthy();
        expect(screen.getAllByTestId(/^market-shelf-row-/)).toHaveLength(3);
        expect(screen.getAllByTestId(/^market-product-drag-/)).toHaveLength(12);

        for (const product of marketProducts.filter(item => slots.includes(item.id))) {
          expect(screen.getAllByRole('button', { name: `${product.name} 담기` }).length).toBeGreaterThan(0);
          expect(screen.getAllByLabelText(`${product.name} 상품`).length).toBeGreaterThan(0);
          visibleProducts.add(product.id);
        }
      } finally {
        screen.unmount();
      }
    }
    expect(visibleProducts.size).toBe(45);
  });

  it('Android 뒤로가기는 진열대만 닫으며 연속 입력과 리스너 정리를 처리한다', async () => {
    let hardwareBack: Parameters<typeof BackHandler.addEventListener>[1] | undefined;
    const remove = jest.fn();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => {
      hardwareBack = listener;
      return { remove };
    });
    const onClose = jest.fn();
    const screen = render(<MarketShelfScene {...shelfProps({ onClose })} />);
    try {
      await advanceTransition();
      act(() => {
        expect(hardwareBack?.({ type: 'hardwareBackPress', timeStamp: 1 })).toBe(true);
        expect(hardwareBack?.({ type: 'hardwareBackPress', timeStamp: 2 })).toBe(true);
      });
      expect(onClose).not.toHaveBeenCalled();
      await advanceTransition();
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      screen.unmount();
    }
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('모바일 세로 스크롤은 가로채지 않고 길게 잡은 상품을 끌 때만 스크롤을 잠근다', async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const responders: Parameters<typeof PanResponder.create>[0][] = [];
    const createResponder = PanResponder.create;
    jest.spyOn(PanResponder, 'create').mockImplementation(config => {
      responders.push(config);
      return createResponder(config);
    });
    const onDropProduct = jest.fn(() => true);
    const screen = render(<MarketShelfScene {...shelfProps({ onDropProduct })} />);
    try {
      await advanceTransition();
      const product = screen.getByTestId('market-product-drag-milk');
      const event = { nativeEvent: { pageX: 70, pageY: 180 } } as GestureResponderEvent;
      const gesture = { dx: 1, dy: 30, moveX: 70, moveY: 210 } as PanResponderGestureState;
      const responder = responders[0];

      // Drive native callbacks directly to control hold time and responder negotiation separately.
      act(() => product.props.onTouchStart(event));
      expect(responder.onMoveShouldSetPanResponder?.(event, gesture)).toBe(false);
      await advanceTransition(200);
      expect(responder.onMoveShouldSetPanResponder?.(event, gesture)).toBe(false);
      expect(screen.getByTestId('market-shelf-scroll').props.scrollEnabled).toBe(true);

      act(() => product.props.onTouchStart(event));
      await advanceTransition(200);
      expect(responder.onMoveShouldSetPanResponder?.(event, gesture)).toBe(true);
      act(() => responder.onPanResponderGrant?.(event, gesture));
      expect(screen.getByTestId('market-shelf-scroll').props.scrollEnabled).toBe(false);

      act(() => responder.onPanResponderTerminate?.(event, gesture));
      await advanceTransition();
      expect(screen.getByTestId('market-shelf-scroll').props.scrollEnabled).toBe(true);
      expect(onDropProduct).not.toHaveBeenCalled();
    } finally {
      screen.unmount();
      if (platformDescriptor) Object.defineProperty(Platform, 'OS', platformDescriptor);
    }
  });

  it('모션 줄이기 설정에서는 접근성 탈출 동작으로 지연 없이 닫는다', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const onClose = jest.fn();
    const screen = render(<MarketShelfScene {...shelfProps({ onClose })} />);
    try {
      await advanceTransition();
      fireEvent(screen.getByTestId('market-shelf-scene'), 'accessibilityEscape');
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      screen.unmount();
    }
  });

  it('닫는 도중 모션 줄이기 조회 응답이 늦게 와도 퇴장을 마치고 이동 잠금을 해제한다', async () => {
    let resolvePreference: ((enabled: boolean) => void) | undefined;
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => new Promise(resolve => {
      resolvePreference = resolve;
    }));
    const enterStops: jest.Mock[] = [];
    const timing = Animated.timing;
    jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
      const animation = timing(value, config);
      const stop = jest.fn(() => animation.stop());
      if (config.toValue === 1 && config.duration === 220) enterStops.push(stop);
      return { ...animation, stop };
    });
    const market = renderEmbeddedMarket();
    try {
      await market.start();
      // Ignore the briefing entrance; this regression concerns the shelf value.
      enterStops.length = 0;
      await market.open({ id: 1, station: 'fresh' });
      market.close();
      expect(market.onLockChange).toHaveBeenLastCalledWith(true);
      expect(market.screen.getByTestId('market-shelf-scene')).toBeTruthy();

      // The enter-effect cleanup runs now, while the same Animated.Value is closing.
      await act(async () => {
        resolvePreference?.(true);
        await Promise.resolve();
      });
      // Native timing.stop cancels the current animation on this shared value.
      expect(enterStops).toHaveLength(1);
      expect(enterStops[0]).not.toHaveBeenCalled();
      await advanceTransition();

      expect(market.screen.queryByTestId('market-shelf-scene')).toBeNull();
      expect(market.onLockChange).toHaveBeenLastCalledWith(false);
      expect(market.onExit).not.toHaveBeenCalled();
    } finally {
      market.screen.unmount();
    }
  });

  it('PC Escape 키는 진열대 닫기로 소비하고 웹 이벤트 리스너를 해제한다', async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const addEventListener = jest.fn();
    const removeEventListener = jest.fn();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { addEventListener, removeEventListener },
    });
    let screen: ReturnType<typeof render> | undefined;
    try {
      const onClose = jest.fn();
      screen = render(<MarketShelfScene {...shelfProps({ onClose })} />);
      await advanceTransition();
      const listener = addEventListener.mock.calls.find(([name]) => name === 'keydown')?.[1];
      expect(listener).toEqual(expect.any(Function));
      const event = { key: 'Escape', preventDefault: jest.fn(), stopPropagation: jest.fn() };
      act(() => listener(event));
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
      await advanceTransition();
      expect(onClose).toHaveBeenCalledTimes(1);

      screen.unmount();
      screen = undefined;
      expect(removeEventListener).toHaveBeenCalledWith('keydown', listener, true);
    } finally {
      screen?.unmount();
      if (platformDescriptor) Object.defineProperty(Platform, 'OS', platformDescriptor);
      if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
});
