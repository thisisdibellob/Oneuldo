import { act, fireEvent, render } from '@testing-library/react-native';

import { CookingSimulationScreen } from '../src/screens/CookingSimulationScreen';

describe('요리 시뮬레이션 게임 모드', () => {
  it('도전 모드를 고르면 단계별 제한시간 카운트다운을 보여준다', async () => {
    const screen = render(<CookingSimulationScreen onClose={jest.fn()} />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(screen.getByRole('button', { name: '도전 모드' }));
    expect(
      screen.getByRole('button', { name: '도전 모드' }).props.accessibilityState.selected,
    ).toBe(true);

    fireEvent.press(
      screen.getByRole('button', { name: '도전 모드로 바나나 요거트 컵 만들기 시작' }),
    );

    expect(screen.getByLabelText('도전 시작 3')).toBeTruthy();
    expect(screen.getByText('재료를 잡아 움직이면 시작해요')).toBeTruthy();
  });
});
