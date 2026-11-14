import { fireEvent, render } from '@testing-library/react-native';
import { ShoppingErrandPanel } from '../src/components/game/ShoppingErrandPanel';
import { createShoppingErrand, type ShoppingErrand } from '../src/game/shoppingErrand';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('../src/components/game/MarketPanelTransition', () => ({ useMarketReducedMotion: () => true }));

it('부탁을 받기 전에는 수락과 나중에를 고르고 나중에는 화면만 닫는다', () => {
  const onAction = jest.fn(), onClose = jest.fn();
  const screen = render(<ShoppingErrandPanel errand={createShoppingErrand({ id: 'offer', offeredAt: 0 })} onAction={onAction} onClose={onClose} />);
  fireEvent.press(screen.getByRole('button', { name: '나중에 할게' }));
  expect(onAction).toHaveBeenCalledWith({ type: 'defer', at: expect.any(Number) });
  expect(onClose).toHaveBeenCalledTimes(1);
  screen.unmount();
});
it('구매를 마쳐도 민수 근처가 아니면 전달할 수 없으며 실제 구매품을 보여 준다', () => {
  const onAction = jest.fn(), onClose = jest.fn();
  const errand: ShoppingErrand = { ...createShoppingErrand({ id: 'receipt', offeredAt: 0 }), phase: 'ready',
    purchase: { episodeId: 'paid', cart: { apple: 2 }, total: 2400, purchasedAt: 1, replacementId: null, unavailableReason: 'replacement-not-allowed' } };
  const screen = render(<ShoppingErrandPanel errand={errand} onAction={onAction} onClose={onClose} />);
  expect(screen.queryByRole('button', { name: '물건을 건네고 이야기하기' })).toBeNull();
  expect(screen.getByText(/우유는 품절이고.*사지 못했어/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '민수에게 가져가기' }));
  expect(onAction).not.toHaveBeenCalled();
  screen.rerender(<ShoppingErrandPanel errand={errand} onAction={onAction} onClose={onClose} canDeliver />);
  fireEvent.press(screen.getByRole('button', { name: '물건을 건네고 이야기하기' }));
  expect(onAction).toHaveBeenCalledWith({ type: 'deliver', at: expect.any(Number) });
  screen.unmount();
});
