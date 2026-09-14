import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { CookingSimulationScreen } from '../src/screens/CookingSimulationScreen';

function activate(screen: ReturnType<typeof render>, name: RegExp, count = 1) {
  for (let index = 0; index < count; index += 1) {
    fireEvent(screen.getByRole('button', { name }), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
  }
}

describe('완성형 요리 시뮬레이션 흐름', () => {
  it('단계형 도움을 제공하고 차리기와 정리까지 마쳐 결과를 보여준다', async () => {
    const screen = render(<CookingSimulationScreen onClose={jest.fn()} />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(
      screen.getByRole('button', { name: '연습 모드로 바나나 요거트 컵 만들기 시작' }),
    );

    fireEvent.press(screen.getByRole('button', { name: '도움말 보기' }));
    expect(screen.getByText('도움 1/3')).toBeTruthy();
    expect(screen.getByText(/불과 칼은 쓰지 않아요/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '다음 도움말 보기' }));
    expect(screen.getByText('도움 2/3')).toBeTruthy();
    expect(screen.getByText(/필요한 재료는 두 가지/)).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: '칼 선택' }));
    expect(screen.getByText('칼 대신 담을 그릇과 섞을 숟가락을 골라요.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '그릇 선택' }));
    fireEvent.press(screen.getByRole('button', { name: '숟가락 선택' }));

    activate(screen, /바나나, 바구니로 끌기/);
    activate(screen, /요거트, 바구니로 끌기/);
    fireEvent.press(screen.getByRole('button', { name: '다음 요리 단계' }));

    activate(screen, /바나나 껍질 아래로 벗기기/, 3);
    fireEvent.press(screen.getByRole('button', { name: '다음 요리 단계' }));

    activate(screen, /바나나 조각 그릇에 넣기/, 6);
    fireEvent.press(screen.getByRole('button', { name: '다음 요리 단계' }));

    activate(screen, /요거트 그릇에 담기/, 4);
    fireEvent.press(screen.getByRole('button', { name: '다음 요리 단계' }));

    fireEvent.press(screen.getByRole('button', { name: '토핑 없이 계속하기' }));
    fireEvent.press(screen.getByRole('button', { name: '다음 요리 단계' }));

    activate(screen, /숟가락으로 원 그리며 섞기/, 3);
    fireEvent.press(screen.getByRole('button', { name: '다음 요리 단계' }));

    expect(screen.getByText('식탁에 차리기')).toBeTruthy();
    activate(screen, /완성한 그릇 식탁에 차리기/);
    fireEvent.press(screen.getByRole('button', { name: '다음 요리 단계' }));

    expect(screen.getByText('주방 정리하기')).toBeTruthy();
    activate(screen, /바나나 껍질 음식물 통에 넣기/);
    activate(screen, /빈 요거트 컵 재활용 통에 넣기/);
    activate(screen, /사용한 숟가락 싱크대에 넣기/);
    activate(screen, /사용한 그릇 싱크대에 넣기/);
    activate(screen, /행주로 흘린 요거트 닦기/);
    fireEvent.press(screen.getByRole('button', { name: '요리 완성하기' }));

    expect(screen.getByText('첫 요리 완성!')).toBeTruthy();
    expect(screen.getByText(/식탁에 차리고 주방까지 정리/)).toBeTruthy();
    expect(screen.getByText('목표 완료')).toBeTruthy();
    expect(screen.getByText('스스로 수정')).toBeTruthy();
    expect(screen.getByText('주방 정리 완료')).toBeTruthy();
  });

  it('도전 모드에서 다음 조리 순서를 직접 판단하고 틀린 선택을 바로 고친다', async () => {
    jest.useFakeTimers();
    const appStateDescriptor = Object.getOwnPropertyDescriptor(AppState, 'currentState');
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    const screen = render(<CookingSimulationScreen onClose={jest.fn()} />);
    try {
      await act(async () => {
        await Promise.resolve();
      });

      fireEvent.press(screen.getByRole('button', { name: '도전 모드' }));
      fireEvent.press(
        screen.getByRole('button', { name: '도전 모드로 바나나 요거트 컵 만들기 시작' }),
      );
      for (let count = 0; count < 3; count += 1) {
        await act(async () => {
          jest.advanceTimersByTime(950);
          await Promise.resolve();
        });
      }

      fireEvent.press(screen.getByRole('button', { name: '그릇 선택' }));
      fireEvent.press(screen.getByRole('button', { name: '숟가락 선택' }));
      activate(screen, /바나나, 바구니로 끌기/);
      activate(screen, /요거트, 바구니로 끌기/);
      fireEvent.press(screen.getByRole('button', { name: '다음 요리 단계' }));

      expect(screen.getByText('준비가 끝났어요. 다음에는 무엇을 할까요?')).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: '요거트를 먼저 모두 붓는다' }));
      expect(screen.getByText('재료를 섞기 전에 바나나 껍질부터 벗겨야 해요.')).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: '바나나 껍질을 벗긴다' }));

      expect(screen.getByText('껍질 벗기기')).toBeTruthy();
    } finally {
      screen.unmount();
      if (appStateDescriptor) Object.defineProperty(AppState, 'currentState', appStateDescriptor);
      jest.useRealTimers();
    }
  });
});
