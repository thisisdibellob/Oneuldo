import { act, fireEvent, render, within } from '@testing-library/react-native';
import { PanResponder, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { MarketKioskCheckout } from '../src/components/game/MarketKioskCheckout';
import { marketProducts } from '../src/game/scenarios';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('../src/components/game/MarketPanelTransition', () => ({ useMarketReducedMotion: () => true }));

it('누락한 상품이 있으면 화면 확인이 잠기고 전부 스캔한 뒤 별도 결제에서만 확정한다', () => {
  const onConfirm = jest.fn();
  const screen = render(<MarketKioskCheckout cart={{ milk: 2, apple: 1 }} onConfirm={onConfirm} onCancel={jest.fn()} />);
  expect(screen.getByLabelText('스캔 화면 확인하기').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByLabelText('흰 우유 한 개 스캔'));
  fireEvent.press(screen.getByLabelText('흰 우유 한 개 스캔'));
  expect(screen.queryByLabelText('흰 우유 한 개 스캔')).toBeNull();
  expect(screen.getByLabelText('스캔 화면 확인하기').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByLabelText('사과 한 개 스캔'));
  fireEvent.press(screen.getByLabelText('스캔 화면 확인하기'));
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('셀프 계산 결제하기'));
  fireEvent.press(screen.getByLabelText('셀프 계산 결제하기'));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledWith({ milk: 2, apple: 1 });
});

it('화면 검토에서 한 개를 취소하면 스캐너와 원래 상품으로 돌아가며 닫기는 결제하지 않는다', () => {
  const onConfirm = jest.fn(), onCancel = jest.fn();
  const screen = render(<MarketKioskCheckout cart={{ apple: 1 }} onConfirm={onConfirm} onCancel={onCancel} />);
  fireEvent.press(screen.getByLabelText('사과 한 개 스캔'));
  fireEvent.press(screen.getByLabelText('스캔 화면 확인하기'));
  fireEvent.press(screen.getByLabelText('사과 스캔 한 개 취소'));
  expect(screen.getByLabelText('사과 한 개 스캔')).toBeTruthy();
  expect(screen.queryByLabelText('셀프 계산 결제하기')).toBeNull();
  fireEvent.press(screen.getByLabelText('셀프 계산 닫기'));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

it('드래그는 실제 스캐너 영역 안에서 놓았을 때만 한 개를 스캔한다', () => {
  let handlers: Parameters<typeof PanResponder.create>[0] | undefined;
  const responder = jest.spyOn(PanResponder, 'create').mockImplementation(value => { handlers ??= value; return { panHandlers: {} }; });
  const measurements = jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(function (this: View, callback) {
    if (this.props.testID === 'kiosk-scanner-zone') callback(100, 100, 200, 80); else callback(0, 0, 500, 800);
  });
  const screen = render(<MarketKioskCheckout cart={{ apple: 2 }} onConfirm={jest.fn()} onCancel={jest.fn()} />);
  const event = (pageX: number, pageY: number) => ({ nativeEvent: { pageX, pageY } }) as never;
  try {
    expect(handlers!.onStartShouldSetPanResponder!(event(40, 400), {} as never)).toBe(true);
    expect(handlers!.onShouldBlockNativeResponder!(event(40, 400), {} as never)).toBe(true);
    act(() => {
      handlers!.onPanResponderGrant!(event(40, 400), {} as never);
    });
    expect(screen.getByTestId('kiosk-drag-ghost')).toBeTruthy();
    expect(screen.getByTestId('kiosk-basket-scroll').props.scrollEnabled).toBe(false);
    act(() => {
      handlers!.onPanResponderMove!(event(50, 50), {} as never);
      handlers!.onPanResponderRelease!(event(50, 50), {} as never);
    });
    expect(screen.queryByTestId('kiosk-scanned-apple')).toBeNull();
    act(() => {
      handlers!.onPanResponderGrant!(event(40, 400), {} as never);
      handlers!.onPanResponderMove!(event(150, 140), {} as never);
      handlers!.onPanResponderRelease!(event(150, 140), {} as never);
    });
    expect(screen.getByTestId('kiosk-scanned-apple')).toBeTruthy();
    expect(screen.getByLabelText('스캔 화면 확인하기').props.accessibilityState.disabled).toBe(true);
    act(() => {
      handlers!.onPanResponderGrant!(event(40, 400), {} as never);
      handlers!.onPanResponderMove!(event(150, 140), {} as never);
      handlers!.onPanResponderTerminate!(event(150, 140), {} as never);
      handlers!.onPanResponderRelease!(event(150, 140), {} as never);
    });
    expect(within(screen.getByTestId('kiosk-scanned-apple')).getByText('1')).toBeTruthy();
    expect(screen.queryByTestId('kiosk-drag-ghost')).toBeNull();
    expect(screen.getByTestId('kiosk-basket-scroll').props.scrollEnabled).toBe(true);
  } finally { screen.unmount(); responder.mockRestore(); measurements.mockRestore(); }
});

it.each([
  { height: 667, top: 0, bottom: 0, stand: true },
  { height: 480, top: 44, bottom: 34, stand: false },
])('375×$height에서는 안전여백 안에 화면·스캐너·고정 확인 버튼이 들어간다', ({ height, top, bottom, stand }) => {
  const screen = render(<SafeAreaInsetsContext.Provider value={{ top, bottom, left: 0, right: 0 }}>
    <MarketKioskCheckout cart={{ apple: 1 }} onConfirm={jest.fn()} onCancel={jest.fn()} />
  </SafeAreaInsetsContext.Provider>);
  fireEvent(screen.getByTestId('market-kiosk-checkout'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 375, height } } });
  const overlay = StyleSheet.flatten(screen.getByTestId('market-kiosk-checkout').props.style);
  const machine = StyleSheet.flatten(screen.getByTestId('kiosk-machine').props.style);
  const deck = StyleSheet.flatten(screen.getByTestId('kiosk-countertop').props.style);
  expect(machine.height + overlay.paddingTop + overlay.paddingBottom).toBe(height);
  expect(!!screen.queryByTestId('kiosk-monitor-stand')).toBe(stand);
  expect(machine.height - deck.height - (stand ? 22 : 6)).toBeGreaterThanOrEqual(182);
  expect(within(screen.getByTestId('kiosk-basket-scroll')).queryByLabelText('스캔 화면 확인하기')).toBeNull();
  expect(screen.getByLabelText('스캔 화면 확인하기')).toBeTruthy();
  expect(screen.queryByText('그만두기')).toBeNull();
  fireEvent.press(screen.getByLabelText('사과 한 개 스캔'));
  fireEvent.press(screen.getByLabelText('스캔 화면 확인하기'));
  expect(StyleSheet.flatten(screen.getByTestId('kiosk-countertop').props.style).height).toBe(deck.height);
  expect(StyleSheet.flatten(screen.getByTestId('kiosk-machine').props.style).height).toBe(machine.height);
  fireEvent.press(screen.getByLabelText('스캔 화면으로 돌아가기'));
  expect(StyleSheet.flatten(screen.getByTestId('kiosk-countertop').props.style).height).toBe(deck.height);
});

it('긴 목록은 바구니와 계산 화면 각각 스크롤되며 검토·취소·결제 버튼은 유지된다', () => {
  const products = marketProducts.slice(0, 15);
  const cart = Object.fromEntries(products.map(product => [product.id, 1]));
  const onConfirm = jest.fn();
  const screen = render(<MarketKioskCheckout cart={cart} onConfirm={onConfirm} onCancel={jest.fn()} />);
  fireEvent(screen.getByTestId('market-kiosk-checkout'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 480 } } });
  expect(screen.getByTestId('kiosk-basket-scroll').props.scrollEnabled).toBe(true);
  expect(screen.getByTestId('kiosk-basket-scroll').props.horizontal).toBe(true);
  for (const product of products) fireEvent.press(screen.getByLabelText(`${product.name} 한 개 스캔`));
  for (const product of products) expect(within(screen.getByTestId('kiosk-receipt-scroll')).getByTestId(`kiosk-scanned-${product.id}`)).toBeTruthy();
  expect(within(screen.getByTestId('kiosk-receipt-scroll')).queryByLabelText('스캔 화면 확인하기')).toBeNull();
  fireEvent.press(screen.getByLabelText('스캔 화면 확인하기'));
  expect(within(screen.getByTestId('kiosk-receipt-scroll')).queryByLabelText('셀프 계산 결제하기')).toBeNull();
  const item = products.at(-1)!;
  fireEvent.press(screen.getByLabelText(`${item.name} 스캔 한 개 취소`));
  expect(screen.getByLabelText(`${item.name} 한 개 스캔`)).toBeTruthy();
  fireEvent.press(screen.getByLabelText(`${item.name} 한 개 스캔`));
  fireEvent.press(screen.getByLabelText('스캔 화면 확인하기'));
  fireEvent.press(screen.getByLabelText('스캔 화면으로 돌아가기'));
  fireEvent.press(screen.getByLabelText('스캔 화면 확인하기'));
  fireEvent.press(screen.getByLabelText('셀프 계산 결제하기'));
  expect(onConfirm).toHaveBeenCalledWith(cart);
});
