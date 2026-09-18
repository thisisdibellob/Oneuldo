import { act, fireEvent, render } from '@testing-library/react-native';
import { PanResponder, View } from 'react-native';
import { MarketKioskCheckout } from '../src/components/game/MarketKioskCheckout';

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
    act(() => {
      handlers!.onPanResponderGrant!(event(40, 400), {} as never);
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
  } finally { screen.unmount(); responder.mockRestore(); measurements.mockRestore(); }
});
