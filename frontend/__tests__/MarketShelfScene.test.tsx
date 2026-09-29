jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  },
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));
import { act, fireEvent, render } from '@testing-library/react-native';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Dimensions,
  GestureResponderEvent,
  Modal,
  PanResponder,
  PanResponderGestureState,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { MarketShelfScene, MarketShelfSceneProps, MARKET_PRODUCT_HOLD_MS } from '../src/components/game/MarketShelfScene';
import { marketCategories, marketProducts } from '../src/game/scenarios';
import { createMarketSession } from '../src/game/marketSession';
import type { ReplayShelfPort } from '../src/replay/ports';

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
  const open = async (nextRequest: MarketInteractionRequest & { station: Exclude<MarketInteractionRequest['station'], 'give-up'> }) => {
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

function mockShelfMeasurements() {
  return jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(function (this: View, callback) {
    if (this.props.testID === 'market-shelf-basket-dock') callback(0, 720, 375, 80);
    else callback(0, 0, 375, 812);
  });
}

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
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });


  it('가로 장바구니 팝업은 12개 상품 배치를 유지하며 닫는 동안 뒤의 버튼을 차단한다', async () => {
    const onCartVisibilityChange = jest.fn();
    const onChangeQuantity = jest.fn();
    const screen = render(<MarketShelfScene {...shelfProps({ cart: { milk: 2 }, onCartVisibilityChange, onChangeQuantity })} />);
    try {
      await advanceTransition();
      const rowsBefore = screen.getAllByTestId(/^market-shelf-row-/).map(row => StyleSheet.flatten(row.props.style));
      const dockBefore = StyleSheet.flatten(screen.getByTestId('market-shelf-basket-dock').props.style);
      expect(screen.queryByRole('button', { name: '흰 우유 냉장 식품 진열대에 1개 내려놓기' })).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: '진열대 장바구니 보기' }));
      await advanceTransition();
      expect(screen.getByText('담은 수량 2개')).toBeTruthy();
      expect(screen.getByText('개당 2,200원')).toBeTruthy();
      expect(screen.queryByText('4,400원')).toBeNull();
      expect(screen.getByTestId('market-shelf-cart-items').props.horizontal).toBe(true);
      expect(screen.getByRole('button', { name: '흰 우유 냉장 식품 진열대에 1개 내려놓기' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: '흰 우유 한 개 더 담기' })).toBeNull();
      expect(screen.getAllByTestId(/^market-shelf-row-/, { includeHiddenElements: true }).map(row => StyleSheet.flatten(row.props.style))).toEqual(rowsBefore);
      expect(StyleSheet.flatten(screen.getByTestId('market-shelf-basket-dock', { includeHiddenElements: true }).props.style)).toEqual(dockBefore);
      expect(screen.getAllByTestId(/^market-product-drag-/, { includeHiddenElements: true })).toHaveLength(12);
      expect(screen.getByTestId('market-shelf-scroll', { includeHiddenElements: true }).findAllByProps({ testID: 'market-shelf-cart-popup' })).toHaveLength(0);

      fireEvent.press(screen.getByRole('button', { name: '진열대 장바구니 닫기' }));
      expect(screen.getByTestId('market-shelf-cart-popup', { includeHiddenElements: true }).props.pointerEvents).toBe('none');
      expect(screen.getByTestId('market-shelf-surface', { includeHiddenElements: true }).props.pointerEvents).toBe('none');
      expect(screen.queryByRole('button', { name: '흰 우유 냉장 식품 진열대에 1개 내려놓기' })).toBeNull();
      await advanceTransition();
      expect(screen.queryByTestId('market-shelf-cart-popup')).toBeNull();
      expect(screen.getByRole('button', { name: '흰 우유 한 개 더 담기' })).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: '진열대 장바구니 보기' }));
      await advanceTransition();
      expect(screen.getByText('담은 수량 2개')).toBeTruthy();
      expect(onCartVisibilityChange.mock.calls.map(call => call[0])).toEqual([true, false, true]);
      expect(onChangeQuantity).not.toHaveBeenCalled();
    } finally { screen.unmount(); }
  });

  it.each(['바깥', 'Android 뒤로가기', '접근성 닫기'] as const)('%s는 장바구니 팝업만 닫고 진열대에 남는다', async method => {
    const onClose = jest.fn();
    const onCartVisibilityChange = jest.fn();
    const screen = render(<MarketShelfScene {...shelfProps({ onClose, onCartVisibilityChange })} />);
    try {
      await advanceTransition();
      fireEvent.press(screen.getByRole('button', { name: '진열대 장바구니 보기' }));
      await advanceTransition();
      expect(screen.getByText('아직 담은 상품이 없어요')).toBeTruthy();
      if (method === '바깥') fireEvent.press(screen.getByTestId('market-shelf-cart-backdrop'));
      else if (method === 'Android 뒤로가기') fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
      else fireEvent(screen.getByTestId('market-shelf-cart-popup'), 'accessibilityEscape');
      await advanceTransition();
      expect(screen.queryByTestId('market-shelf-cart-popup')).toBeNull();
      expect(screen.getByRole('button', { name: '흰 우유 담기' })).toBeTruthy();
      expect(onCartVisibilityChange.mock.calls).toEqual([[true], [false]]);
      expect(onClose).not.toHaveBeenCalled();
    } finally { screen.unmount(); }
  });

  it('모션 감소와 작은 세로 공간에서도 팝업 닫기는 지연 없이 되고 본문만 스크롤할 수 있다', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const onClose = jest.fn();
    const screen = render(<MarketShelfScene {...shelfProps({ onClose, cart: { milk: 1, apple: 2 } })} />);
    try {
      fireEvent(screen.getByTestId('market-shelf-scene'), 'layout', { nativeEvent: { layout: { width: 844, height: 320 } } });
      await advanceTransition();
      fireEvent.press(screen.getByRole('button', { name: '진열대 장바구니 보기' }));
      const popup = screen.getByTestId('market-shelf-cart-popup');
      expect(StyleSheet.flatten(popup.props.style).maxHeight).toBeLessThanOrEqual(288);
      expect(screen.getByTestId('market-shelf-cart-body').props.nestedScrollEnabled).toBe(true);
      expect(screen.getByTestId('market-shelf-cart-items').props.horizontal).toBe(true);
      fireEvent.press(screen.getByRole('button', { name: '진열대 장바구니 닫기' }));
      expect(screen.queryByTestId('market-shelf-cart-popup')).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
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
      expect(screen.getByText('담은 수량 3개')).toBeTruthy();
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

  it('각 코너의 서로 다른 12종 상품을 4열 3행 12칸에 표시하며 장바구니는 상품 스크롤 밖에 고정한다', async () => {
    const readDimensions = Dimensions.get;
    jest.spyOn(Dimensions, 'get').mockImplementation(name => ({ ...readDimensions(name), fontScale: 1 }));
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
        expect(new Set(slots).size).toBe(12);
        expect(productScroll.props.scrollEnabled).toBe(false);
        expect(StyleSheet.flatten(screen.getByTestId('market-shelf-surface').props.style).backgroundColor).toBe('#FBF5E9');
        expect(StyleSheet.flatten(screen.getByTestId('market-shelf-material').props.style)).toMatchObject({ top: 0, bottom: 0, backgroundColor: '#FBF5E9' });
        expect(StyleSheet.flatten(screen.getByTestId('market-shelf-header').props.style).backgroundColor).toBe('transparent');


        for (const product of marketProducts.filter(item => slots.includes(item.id))) {
          expect(screen.getAllByRole('button', { name: `${product.name} 담기` }).length).toBeGreaterThan(0);
          expect(screen.getAllByLabelText(`${product.name} 상품`).length).toBeGreaterThan(0);
          visibleProducts.add(product.id);
        }
      } finally {
        screen.unmount();
      }
    }
    expect(visibleProducts.size).toBe(60);
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

  it('모바일 스와이프는 즉시 스크롤하고 350ms 길게 누른 드래그만 점유한다', async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const responders: Parameters<typeof PanResponder.create>[0][] = [];
    const createResponder = PanResponder.create;
    jest.spyOn(PanResponder, 'create').mockImplementation(config => {
      responders.push(config);
      return createResponder(config);
    });
    const onDropProduct = jest.fn(() => true);
    const measured = mockShelfMeasurements();
    const screen = render(<MarketShelfScene {...shelfProps({ onDropProduct })} />);
    try {
      await advanceTransition();
      fireEvent(screen.getByTestId('market-shelf-scroll'), 'layout', { nativeEvent: { layout: { height: 300 } } });
      const product = screen.getByTestId('market-product-drag-milk');
      const event = { nativeEvent: { pageX: 70, pageY: 180 } } as GestureResponderEvent;
      const gesture = { dx: 1, dy: 30, moveX: 70, moveY: 210 } as PanResponderGestureState;
      const responder = responders[0];

      act(() => product.props.onTouchStart(event));
      expect(responder.onMoveShouldSetPanResponder?.(event, gesture)).toBe(false);
      await advanceTransition(500);
      expect(responder.onMoveShouldSetPanResponder?.(event, gesture)).toBe(false);
      expect(screen.getByTestId('market-shelf-scroll').props.scrollEnabled).toBe(true);

      act(() => product.props.onTouchStart(event));
      await advanceTransition(MARKET_PRODUCT_HOLD_MS - 1);
      expect(screen.getByTestId('market-shelf-scroll').props.scrollEnabled).toBe(true);
      await advanceTransition(1);
      expect(responder.onMoveShouldSetPanResponder?.(event, gesture)).toBe(true);
      act(() => responder.onPanResponderGrant?.(event, gesture));
      expect(screen.getByTestId('market-shelf-scroll').props.scrollEnabled).toBe(false);

      const basketEvent = { nativeEvent: { pageX: 100, pageY: 760 } } as GestureResponderEvent;
      act(() => responder.onPanResponderMove?.(basketEvent, gesture));
      expect(measured).toHaveBeenCalled();
      expect(screen.getByText('여기에 놓아요!')).toBeTruthy();
      act(() => responder.onPanResponderRelease?.(basketEvent, gesture));
      act(() => product.props.onTouchEnd(basketEvent));
      expect(onDropProduct.mock.calls).toEqual([['milk']]);
      // Scroll unlocks before the returning/fading ghost has finished animating.
      expect(screen.getByTestId('market-shelf-scroll').props.scrollEnabled).toBe(true);

      act(() => product.props.onTouchStart(event));
      await advanceTransition(MARKET_PRODUCT_HOLD_MS);
      act(() => responder.onPanResponderTerminate?.(event, gesture));
      expect(screen.getByTestId('market-shelf-scroll').props.scrollEnabled).toBe(true);
      expect(onDropProduct).toHaveBeenCalledTimes(1);
    } finally {
      screen.unmount();
      if (platformDescriptor) Object.defineProperty(Platform, 'OS', platformDescriptor);
    }
  });

  it('웹 길게 누르기는 실제 바구니 측정 좌표에 놓고 스와이프·취소·해제 시 리스너를 정리한다', async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const listeners = new Map<string, Set<(event: unknown) => void>>();
    const addEventListener = jest.fn((name: string, callback: (event: unknown) => void) => {
      const group = listeners.get(name) ?? new Set(); group.add(callback); listeners.set(name, group);
    });
    const removeEventListener = jest.fn((name: string, callback: (event: unknown) => void) => {
      listeners.get(name)?.delete(callback);
    });
    const emit = (name: string, event: unknown) => act(() => {
      [...(listeners.get(name) ?? [])].forEach(callback => callback(event));
    });
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener, removeEventListener } });
    const onDropProduct = jest.fn(() => true);
    const measured = mockShelfMeasurements();
    const screen = render(<MarketShelfScene {...shelfProps({ onDropProduct })} />);
    const capture = jest.fn(), release = jest.fn();
    const startPointer = () => fireEvent(screen.getByTestId('market-product-drag-milk'), 'pointerDown', {
      nativeEvent: { button: 0, pointerId: 7, clientX: 70, clientY: 180, pointerType: 'touch', isPrimary: true },
      currentTarget: { setPointerCapture: capture, releasePointerCapture: release },
    });
    try {
      await advanceTransition();
      fireEvent(screen.getByTestId('market-shelf-scroll'), 'layout', { nativeEvent: { layout: { height: 300 } } });
      startPointer();
      const ordinarySwipe = { cancelable: true, preventDefault: jest.fn() };
      emit('touchmove', ordinarySwipe);
      expect(ordinarySwipe.preventDefault).not.toHaveBeenCalled();
      emit('pointermove', { pointerId: 7, clientX: 70, clientY: 210, cancelable: true, preventDefault: jest.fn() });
      await advanceTransition(500);
      expect(capture).not.toHaveBeenCalled();
      expect(screen.getByTestId('market-shelf-scroll').props.scrollEnabled).toBe(true);
      expect(listeners.get('pointermove')?.size).toBe(0);

      startPointer();
      await advanceTransition(MARKET_PRODUCT_HOLD_MS - 1);
      expect(capture).not.toHaveBeenCalled();
      await advanceTransition(1);
      expect(capture).toHaveBeenCalledWith(7);
      expect(screen.getByTestId('market-shelf-scroll').props.scrollEnabled).toBe(false);
      const heldTouch = { cancelable: true, preventDefault: jest.fn() };
      emit('touchmove', heldTouch);
      expect(heldTouch.preventDefault).toHaveBeenCalledTimes(1);
      expect(addEventListener.mock.calls.find(call => call[0] === 'touchmove')).toEqual([
        'touchmove', expect.any(Function), { passive: false, capture: true },
      ]);
      emit('pointermove', { pointerId: 7, clientX: 100, clientY: 760, cancelable: true, preventDefault: jest.fn() });
      expect(measured).toHaveBeenCalled();
      expect(screen.getByText('여기에 놓아요!')).toBeTruthy();
      emit('pointerup', { pointerId: 7, clientX: 100, clientY: 760, type: 'pointerup' });
      expect(onDropProduct.mock.calls).toEqual([['milk']]);
      expect(screen.getByTestId('market-shelf-scroll').props.scrollEnabled).toBe(true);
      expect(release).toHaveBeenCalledWith(7);
      expect(listeners.get('touchmove')?.size).toBe(0);

      startPointer(); await advanceTransition(MARKET_PRODUCT_HOLD_MS);
      emit('pointercancel', { pointerId: 7, clientX: 100, clientY: 760, type: 'pointercancel' });
      expect(onDropProduct).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('market-shelf-scroll').props.scrollEnabled).toBe(true);
      startPointer();
      screen.unmount();
      await advanceTransition(MARKET_PRODUCT_HOLD_MS + 1);
      expect(onDropProduct).toHaveBeenCalledTimes(1);
      for (const name of ['pointermove', 'pointerup', 'pointercancel', 'touchmove', 'blur']) {
        expect(listeners.get(name)?.size).toBe(0);
      }
    } finally {
      screen.unmount();
      if (platformDescriptor) Object.defineProperty(Platform, 'OS', platformDescriptor);
      if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });

  it('진열대 헤더는 균형 있게 중앙에 있고 합계·포기·부가 안내 없이 상품 단가만 표시한다', async () => {
    const screen = render(<MarketShelfScene {...shelfProps({ slots: ['milk'], cart: { milk: 2 }, onGiveUp: jest.fn() })} />);
    try {
      await advanceTransition();
      expect(screen.queryByRole('button', { name: '장보기 포기' })).toBeNull();
      expect(screen.queryByText('하늘마트')).toBeNull();
      expect(screen.queryByText('담은 금액')).toBeNull();
      expect(screen.queryByText(/상품을 담거나/)).toBeNull();
      expect(screen.getByText('2,200원')).toBeTruthy();
      expect(screen.queryByText('4,400원')).toBeNull();
      const header = screen.getByTestId('market-shelf-header');
      expect(StyleSheet.flatten(header.children[0].props.style).width).toBe(72);
      expect(StyleSheet.flatten(header.children[2].props.style).width).toBe(72);
      const label = screen.getByTestId('market-product-label-milk');
      expect(StyleSheet.flatten(label.props.style)).toMatchObject({ backgroundColor: '#FFFBEF', borderRadius: 8 });
    } finally { screen.unmount(); }
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

describe('attention replay observes the visible shelf instead of seeking a hidden product', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });
  afterEach(() => { jest.restoreAllMocks(); jest.clearAllTimers(); jest.useRealTimers(); });
  it('requires an explicit scroll before dragging an off-screen row and keeps v1 auto-scroll', async () => {
    const product = marketProducts.find(p => p.categoryId === marketCategories[0].id)!;
    let rowY = 760;
    jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(function (this: View, callback) {
      const id = this.props.testID;
      if (id === 'market-shelf-basket-dock') callback(0, 720, 375, 80);
      else if (id === 'market-shelf-scroll') callback(0, 90, 375, 620);
      else if (id === `market-product-drag-${product.id}`) callback(12, 130, 75, 70);
      else if (id === `market-product-row-${product.id}`) callback(10, rowY, 80, 180);
      else callback(0, 0, 375, 812);
    });
    const scrolling = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    const port = { current: null as ReplayShelfPort | null };
    const screen = render(<MarketShelfScene {...shelfProps({ slots: [product.id], replayPortRef: port })} />);
    await advanceTransition();
    scrolling.mockClear();
    await expect(port.current!.measure(product.id, { visibleOnly: true })).rejects.toThrow(/explicit browsing/);
    expect(scrolling).not.toHaveBeenCalled();
    rowY = 110;
    await expect(port.current!.measure(product.id, { visibleOnly: true })).resolves.toHaveProperty('product');
    expect(scrolling).not.toHaveBeenCalled();
    const legacy = port.current!.measure(product.id);
    await advanceTransition(430);
    await expect(legacy).resolves.toHaveProperty('product');
    expect(scrolling).toHaveBeenCalledTimes(1);
    screen.unmount();
  });
});
