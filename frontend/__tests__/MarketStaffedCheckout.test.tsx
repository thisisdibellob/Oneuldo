import { act, fireEvent, render, within } from '@testing-library/react-native';
import { AccessibilityInfo, ScrollView, StyleSheet } from 'react-native';
import { MarketStaffedCheckout } from '../src/components/game/MarketStaffedCheckout';
import { getMarketCartTotal, marketProducts, type MarketCart } from '../src/game/scenarios';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: jest.fn(() => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  }),
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));

const cart: MarketCart = { apple: 2, milk: 1 };
const chargedCart: MarketCart = { apple: 3, milk: 1 };
const props = () => ({
  cart,
  review: { chargedCart, total: getMarketCartTotal(chargedCart), response: null },
  counterNumber: 2,
  onCorrect: jest.fn(() => '확인했어요. 잘못 계산된 수량을 고쳤어요.'),
  onSubmit: jest.fn(), onCancel: jest.fn(), onBackHandlerChange: jest.fn(), onInspectCart: jest.fn(),
});
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const selectApple = async (screen: ReturnType<typeof render>) => {
  fireEvent.press(screen.getByRole('button', { name: '개수가 잘못된 것 같아요' }));
  await flush();
  fireEvent.press(screen.getByRole('button', { name: '사과 계산 수량 확인' }));
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it('계산 내역과 실제 장바구니를 따로 보여주며 비교만으로 내역을 자동 수정하지 않는다', async () => {
  const callbacks = props();
  const screen = render(<MarketStaffedCheckout {...callbacks} />);
  await flush();
  for (const heading of ['상품명', '단가', '수량', '금액']) expect(screen.getByText(heading)).toBeTruthy();
  expect(within(screen.getByTestId('checkout-receipt-row-apple')).getByText('3개')).toBeTruthy();
  expect(within(screen.getByTestId('checkout-receipt-row-apple')).getByText('1,200')).toBeTruthy();
  expect(within(screen.getByTestId('checkout-receipt-row-apple')).getByText('3,600')).toBeTruthy();
  expect(screen.queryByTestId('checkout-basket')).toBeNull();
  expect(screen.getByTestId('checkout-charged-total').props.children).toBe('5,800원');
  fireEvent.press(screen.getByRole('button', { name: '장바구니 확인' }));
  expect(within(screen.getByTestId('checkout-cart-row-apple')).getByText('2개')).toBeTruthy();
  expect(screen.queryByTestId('checkout-receipt')).toBeNull();
  expect(screen.queryByTestId('checkout-charged-total')).toBeNull();
  expect(callbacks.onInspectCart).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('button', { name: '계산 내역으로 돌아가기' }));
  expect(within(screen.getByTestId('checkout-receipt-row-apple')).getByText('3개')).toBeTruthy();
  expect(callbacks.onCorrect).not.toHaveBeenCalled();
  expect(callbacks.onSubmit).not.toHaveBeenCalled();
  expect(callbacks.onInspectCart).toHaveBeenCalledTimes(1);
  screen.unmount();
});

it('직원에게 모든 청구 상품을 물어볼 수 있고 주장 수량은 실제 정답을 채우지 않고 1개부터 시작한다', async () => {
  const screen = render(<MarketStaffedCheckout {...props()} />);
  await flush();
  const question = screen.getByRole('button', { name: '개수가 잘못된 것 같아요' });
  expect(within(question).getByText(/개수가 잘못된\s+것 같아요/)).toBeTruthy();
  fireEvent.press(question);
  await flush();
  expect(screen.getByTestId('market-staff-message-text').props.children).toBe('어떤 상품의 수량을 확인해 드릴까요?');
  expect(screen.getByRole('button', { name: '사과 계산 수량 확인' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '흰 우유 계산 수량 확인' })).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /계산 수량 확인$/ })).toHaveLength(2);
  fireEvent.press(screen.getByRole('button', { name: '사과 계산 수량 확인' }));
  expect(screen.getByTestId('checkout-claimed-quantity').props.children).toEqual([1, '개']);
  const decrease = screen.getByRole('button', { name: '정정 요청 수량 줄이기' });
  expect(decrease.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(decrease);
  expect(screen.getByTestId('checkout-claimed-quantity').props.children).toEqual([1, '개']);
  screen.unmount();
});

it('문의 문구는 모바일에서 두 줄로 나누고 넓은 화면에서는 한 줄로 표시하며 접근성 이름은 유지한다', async () => {
  const screen = render(<MarketStaffedCheckout {...props()} />);
  await flush();
  for (const [width, text] of [[375, '개수가 잘못된\n것 같아요'], [620, '개수가 잘못된 것 같아요']] as const) {
    fireEvent(screen.getByTestId('market-staffed-checkout'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height: 812 } },
    });
    const question = screen.getByRole('button', { name: '개수가 잘못된 것 같아요' });
    expect(within(question).getByText(/개수가 잘못된\s+것 같아요/).props.children).toBe(text);
  }
  screen.unmount();
});

it('고른 상품과 직접 조절한 수량을 요청하고 공유 대화 UI의 답변 후 수정 내역을 다시 확인한다', async () => {
  const callbacks = props();
  const screen = render(<MarketStaffedCheckout {...callbacks} />);
  await flush();
  await selectApple(screen);
  fireEvent.press(screen.getByRole('button', { name: '정정 요청 수량 늘리기' }));
  fireEvent.press(screen.getByRole('button', { name: '수량 확인 부탁하기' }));
  await flush();
  expect(callbacks.onCorrect).toHaveBeenCalledTimes(1);
  expect(callbacks.onCorrect).toHaveBeenCalledWith('apple', 2);
  expect(callbacks.onSubmit).not.toHaveBeenCalled();
  expect(screen.getByTestId('market-staff-message-text').props.children).toBe('확인했어요. 잘못 계산된 수량을 고쳤어요.');
  screen.rerender(<MarketStaffedCheckout {...callbacks} review={{ chargedCart: cart, total: getMarketCartTotal(cart), response: '확인했어요.' }} />);
  await flush();
  fireEvent.press(screen.getByRole('button', { name: '계산 내역 다시 보기' }));
  expect(within(screen.getByTestId('checkout-receipt-row-apple')).getByText('2개')).toBeTruthy();
  expect(screen.getByTestId('checkout-charged-total').props.children).toBe('4,600원');
  screen.unmount();
});

it('잘못된 주장 응답은 그대로 보여주고 계산 내역을 클라이언트에서 고치지 않는다', async () => {
  const callbacks = { ...props(), onCorrect: jest.fn(() => '담은 물건과 수량을 다시 살펴봐 주세요.') };
  const screen = render(<MarketStaffedCheckout {...callbacks} />);
  await flush();
  await selectApple(screen);
  fireEvent.press(screen.getByRole('button', { name: '수량 확인 부탁하기' }));
  await flush();
  expect(callbacks.onCorrect).toHaveBeenCalledWith('apple', 1);
  expect(screen.getByTestId('market-staff-message-text').props.children).toBe('담은 물건과 수량을 다시 살펴봐 주세요.');
  fireEvent.press(screen.getByRole('button', { name: '계산 내역 다시 보기' }));
  expect(within(screen.getByTestId('checkout-receipt-row-apple')).getByText('3개')).toBeTruthy();
  expect(screen.getByTestId('checkout-charged-total').props.children).toBe('5,800원');
  screen.unmount();
});

it.each(['정상', '오청구'] as const)('%s 내역에서도 구매 확정이 활성화되어 정정 없이 판단을 제출할 수 있다', async kind => {
  const callbacks = props();
  if (kind === '정상') callbacks.review = { chargedCart: cart, total: getMarketCartTotal(cart), response: null };
  const screen = render(<MarketStaffedCheckout {...callbacks} />);
  await flush();
  const submit = screen.getByRole('button', { name: '구매 확정' });
  expect(submit.props.accessibilityState.disabled).toBe(false);
  fireEvent.press(submit);
  expect(callbacks.onSubmit).toHaveBeenCalledTimes(1);
  expect(callbacks.onCorrect).not.toHaveBeenCalled();
  screen.unmount();
});

it('수량을 고르는 중 장바구니를 열고 화면 버튼으로 돌아와도 선택 수량을 유지한다', async () => {
  const callbacks = props();
  const screen = render(<MarketStaffedCheckout {...callbacks} />);
  await flush();
  await selectApple(screen);
  fireEvent.press(screen.getByRole('button', { name: '정정 요청 수량 늘리기' }));
  fireEvent.press(screen.getByRole('button', { name: '정정 요청 수량 늘리기' }));
  fireEvent.press(screen.getByRole('button', { name: '장바구니 확인' }));
  expect(within(screen.getByTestId('checkout-cart-row-apple')).getByText('2개')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '수량 선택으로 돌아가기' }));
  expect(screen.getByTestId('checkout-claimed-quantity').props.children).toEqual([3, '개']);
  expect(callbacks.onCancel).not.toHaveBeenCalled();
  screen.unmount();
});

it('휴대폰 뒤로가기는 장바구니에서 수량 선택으로 돌아오고 내역 첫 화면에서는 부모에게 넘긴다', async () => {
  const callbacks = props();
  const screen = render(<MarketStaffedCheckout {...callbacks} />);
  await flush();
  let consumed: boolean | undefined;
  act(() => { consumed = callbacks.onBackHandlerChange.mock.calls.at(-1)![0](); });
  expect(consumed).toBe(false);
  await selectApple(screen);
  fireEvent.press(screen.getByRole('button', { name: '정정 요청 수량 늘리기' }));
  fireEvent.press(screen.getByRole('button', { name: '장바구니 확인' }));
  act(() => { consumed = callbacks.onBackHandlerChange.mock.calls.at(-1)![0](); });
  expect(consumed).toBe(true);
  expect(screen.getByTestId('checkout-claimed-quantity').props.children).toEqual([2, '개']);
  expect(callbacks.onCancel).not.toHaveBeenCalled();
  screen.unmount();
  expect(callbacks.onBackHandlerChange).toHaveBeenLastCalledWith(null);
});

it('다시 고르기는 결제와 같은 크기의 버튼이며 장보기 포기 없이 계산 화면만 닫는다', async () => {
  const callbacks = props();
  const screen = render(<MarketStaffedCheckout {...callbacks} />);
  await flush();
  const cancel = screen.getByRole('button', { name: '다시 고르기' });
  const submit = screen.getByRole('button', { name: '구매 확정' });
  const cancelStyle = StyleSheet.flatten(cancel.props.style);
  const submitStyle = StyleSheet.flatten(submit.props.style);
  expect(cancelStyle.minHeight).toBeGreaterThanOrEqual(48);
  for (const dimension of ['minHeight', 'paddingHorizontal', 'paddingVertical'] as const) {
    expect(cancelStyle[dimension]).toBe(submitStyle[dimension]);
  }
  expect(screen.queryByRole('button', { name: '장보기 포기' })).toBeNull();
  expect(screen.queryByText('그만두기')).toBeNull();
  fireEvent.press(cancel);
  expect(callbacks.onCancel).toHaveBeenCalledTimes(1);
  expect(callbacks.onCorrect).not.toHaveBeenCalled();
  expect(callbacks.onSubmit).not.toHaveBeenCalled();
  screen.unmount();
});

it('많은 상품은 내역 영역에서만 스크롤하고 확인·구매 버튼은 스크롤 바깥에 유지한다', async () => {
  const longCart = Object.fromEntries(marketProducts.slice(0, 12).map(product => [product.id, 1]));
  const screen = render(<MarketStaffedCheckout {...props()} cart={longCart}
    review={{ chargedCart: longCart, total: getMarketCartTotal(longCart), response: null }} />);
  await flush();
  expect(screen.getAllByTestId(/^checkout-receipt-row-/)).toHaveLength(12);
  const scroll = screen.UNSAFE_getByType(ScrollView);
  expect(scroll.props.showsVerticalScrollIndicator).toBe(false);
  expect(scroll.props.scrollEnabled).not.toBe(false);
  expect(scroll.props.bounces).toBe(false);
  expect(StyleSheet.flatten(scroll.props.style).flexShrink).toBe(1);
  expect(scroll.findAll((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === '구매 확정')).toHaveLength(0);
  expect(screen.getByRole('button', { name: '구매 확정' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '장바구니 확인' })).toBeTruthy();
  screen.unmount();
});

it('빈 장바구니에서는 수량 질문을 열지 않고 기본 구매 판단 동작은 유지한다', async () => {
  const screen = render(<MarketStaffedCheckout {...props()} cart={{}}
    review={{ chargedCart: {}, total: 0, response: null }} />);
  await flush();
  expect(screen.getByText('아직 담은 물건이 없어요.')).toBeTruthy();
  expect(screen.getByRole('button', { name: '개수가 잘못된 것 같아요' }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByRole('button', { name: '구매 확정' }).props.accessibilityState.disabled).toBe(false);
  screen.unmount();
});

it.each([
  ['사과', 'apple'],
  ['흰 우유', 'milk'],
] as const)('POS의 %s 행을 누르면 1개부터 수량을 요청하고 뒤로가기는 계산 화면으로 돌아온다', async (name, id) => {
  const callbacks = props();
  const screen = render(<MarketStaffedCheckout {...callbacks} />);
  await flush();
  // Both the overcharged apple and the normal milk use the same direct action.
  fireEvent.press(screen.getByRole('button', { name: `${name} 계산 수량 확인` }));
  expect(screen.getByTestId('checkout-claimed-quantity').props.children).toEqual([1, '개']);
  expect(screen.getByText(name)).toBeTruthy();
  expect(screen.getByText(`계산 화면에는 ${chargedCart[id]}개`)).toBeTruthy();
  expect(screen.queryByTestId('market-staff-message-text')).toBeNull();
  expect(callbacks.onCorrect).not.toHaveBeenCalled();
  let consumed: boolean | undefined;
  act(() => { consumed = callbacks.onBackHandlerChange.mock.calls.at(-1)![0](); });
  expect(consumed).toBe(true);
  expect(screen.getByTestId('checkout-pos')).toBeTruthy();
  expect(screen.queryByTestId('checkout-claimed-quantity')).toBeNull();
  expect(within(screen.getByTestId('checkout-receipt-row-apple')).getByText('3개')).toBeTruthy();
  expect(callbacks.onCancel).not.toHaveBeenCalled();
  screen.unmount();
});

it('직원에게 먼저 질문해서 수량을 고른 경우에는 뒤로가기가 직원의 상품 선택지로 돌아간다', async () => {
  const callbacks = props();
  const screen = render(<MarketStaffedCheckout {...callbacks} />);
  await flush();
  await selectApple(screen);
  expect(screen.getByRole('button', { name: '다른 상품 선택' })).toBeTruthy();
  let consumed: boolean | undefined;
  act(() => { consumed = callbacks.onBackHandlerChange.mock.calls.at(-1)![0](); });
  await flush();
  expect(consumed).toBe(true);
  expect(screen.queryByTestId('checkout-pos')).toBeNull();
  expect(screen.getByTestId('market-staff-message-text').props.children).toBe('어떤 상품의 수량을 확인해 드릴까요?');
  expect(screen.getByRole('button', { name: '사과 계산 수량 확인' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '흰 우유 계산 수량 확인' })).toBeTruthy();
  expect(callbacks.onCancel).not.toHaveBeenCalled();
  screen.unmount();
});

it('상품 행에서 들어온 수량 확인 중 장바구니를 닫으면 고른 상품과 수량을 보존하고 계산 화면으로 돌아갈 수 있다', async () => {
  const callbacks = props();
  const screen = render(<MarketStaffedCheckout {...callbacks} />);
  await flush();
  fireEvent.press(screen.getByRole('button', { name: '사과 계산 수량 확인' }));
  fireEvent.press(screen.getByRole('button', { name: '정정 요청 수량 늘리기' }));
  fireEvent.press(screen.getByRole('button', { name: '장바구니 확인' }));
  expect(callbacks.onInspectCart).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('checkout-pos')).toBeNull();
  expect(screen.queryByRole('button', { name: '구매 확정' })).toBeNull();
  expect(screen.queryByTestId('checkout-claimed-quantity')).toBeNull();
  expect(within(screen.getByTestId('checkout-cart-row-apple')).getByText('2개')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '수량 선택으로 돌아가기' }));
  expect(screen.getByTestId('checkout-claimed-quantity').props.children).toEqual([2, '개']);
  expect(screen.getByText('사과')).toBeTruthy();
  expect(screen.queryByTestId('checkout-basket')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '계산 내역으로 돌아가기' }));
  expect(screen.getByTestId('checkout-pos')).toBeTruthy();
  expect(within(screen.getByTestId('checkout-receipt-row-apple')).getByText('3개')).toBeTruthy();
  expect(callbacks.onCorrect).not.toHaveBeenCalled();
  expect(callbacks.onCancel).not.toHaveBeenCalled();
  expect(callbacks.onInspectCart).toHaveBeenCalledTimes(1);
  screen.unmount();
});
