import { act, fireEvent, render } from '@testing-library/react-native';

import { CashierSimulationScreen } from '../src/screens/CashierSimulationScreen';

jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

function scanProduct(screen: ReturnType<typeof render>, label: string) {
  screen.getByLabelText(label).props.onAccessibilityTap();
}

function handoffReceipt(screen: ReturnType<typeof render>) {
  screen.getByLabelText('영수증 손님에게 전달하기').props.onAccessibilityTap();
}

describe('계산 알바 시뮬레이션', () => {
  it('연습 근무에서 스캔과 거스름돈 확인을 마치면 결과 화면으로 간다', async () => {
    const onExit = jest.fn();
    const screen = render(<CashierSimulationScreen onExit={onExit} />);

    fireEvent.press(screen.getByText('천천히 연습'));
    expect(screen.getByText('첫 손님이 계산을 기다리고 있어요')).toBeTruthy();

    fireEvent.press(screen.getByText('계산 시작'));
    await act(async () => scanProduct(screen, '흰 우유, 2,200원'));
    await act(async () => scanProduct(screen, '사과, 1,200원'));
    expect(screen.getByText('모두 스캔했어요')).toBeTruthy();

    fireEvent.press(screen.getByText('금액 확인하기'));
    fireEvent.press(screen.getByRole('button', { name: '1,600원 거스름돈 건네기' }));
    expect(screen.getByText('1번째 손님 계산 완료')).toBeTruthy();
    await act(async () => handoffReceipt(screen));

    expect(screen.getByText('상품과 금액을 정확하게 확인했어요!')).toBeTruthy();
    expect(screen.getByText('업무 완료')).toBeTruthy();
    fireEvent.press(screen.getByText('마을로 돌아가기'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('도전 근무는 단계별 시간과 영수증 중복 계산 확인을 포함한다', async () => {
    const screen = render(<CashierSimulationScreen onExit={jest.fn()} />);

    fireEvent.press(screen.getByText('도전 근무'));
    expect(screen.getByText('1/2번째 손님')).toBeTruthy();
    expect(screen.getByText('정확하게 확인한 뒤 다음 단계로 넘어가요.')).toBeTruthy();

    fireEvent.press(screen.getByText('계산 시작'));
    expect(screen.getByLabelText('35초 남음')).toBeTruthy();
    await act(async () => scanProduct(screen, '달걀, 3,600원'));
    await act(async () => scanProduct(screen, '순한 카레, 2,800원'));
    await act(async () => scanProduct(screen, '생수, 800원'));
    fireEvent.press(screen.getByText('금액 확인하기'));

    fireEvent.press(screen.getByRole('button', { name: '2,800원 거스름돈 건네기' }));
    await act(async () => handoffReceipt(screen));
    expect(screen.getByText('2/2번째 손님')).toBeTruthy();

    fireEvent.press(screen.getByText('계산 시작'));
    await act(async () => scanProduct(screen, '오렌지 주스, 3,200원'));
    await act(async () => scanProduct(screen, '바나나, 3,600원'));
    fireEvent.press(screen.getByText('금액 확인하기'));

    expect(screen.getByText('상품이 정확히 찍혔을까요?')).toBeTruthy();
    fireEvent.press(screen.getByText('중복 계산됐어요'));
    expect(screen.getByText('맞아요. 같은 상품이 두 번 찍힌 줄을 취소했어요.')).toBeTruthy();
    fireEvent.press(screen.getByText('수정된 금액 받기'));
    fireEvent.press(screen.getByRole('button', { name: '3,200원 거스름돈 건네기' }));
    expect(screen.getByText('2번째 손님 계산 완료')).toBeTruthy();
    await act(async () => handoffReceipt(screen));

    expect(screen.getByText('상품과 금액을 정확하게 확인했어요!')).toBeTruthy();
    expect(screen.getByText('오류 수정')).toBeTruthy();
  });
});
