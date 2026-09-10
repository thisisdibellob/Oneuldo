import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';

import { MarketShelfScene } from '../src/components/game/MarketShelfScene';

import {
  evaluateMarketProductDrop,
  MarketInteractionRequest,
  MarketSimulationScreen,
} from '../src/screens/MarketSimulationScreen';

async function closeShelf(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getAllByRole('button', { name: '진열대 닫기' })[0]);
  await waitFor(() => {
    expect(screen.queryAllByRole('button', { name: '진열대 닫기' })).toHaveLength(0);
  });
}

describe('마트 장보기 게임 화면', () => {
  it('도전 모드에서 영수증 오류를 해결한 뒤 미션 배지를 받는다', async () => {
    jest.useFakeTimers();
    const onExit = jest.fn();
    const onLockChange = jest.fn();
    const onMissionComplete = jest.fn();
    let request: MarketInteractionRequest | null = null;
    const renderScreen = () => (
      <MarketSimulationScreen
        embedded
        interactionRequest={request}
        onExit={onExit}
        onLockChange={onLockChange}
        onMissionComplete={onMissionComplete}
      />
    );
    const screen = render(renderScreen());

    fireEvent.press(screen.getByText('도전 모드'));
    fireEvent.press(screen.getByText('다음'));
    fireEvent.press(screen.getByText('장보기 시작'));

    const openStation = async (nextRequest: MarketInteractionRequest) => {
      request = nextRequest;
      screen.rerender(renderScreen());
      await act(async () => {
        await Promise.resolve();
      });
    };

    await openStation({ id: 1, station: 'fresh' });
    fireEvent.press(screen.getByRole('button', { name: '흰 우유 담기' }));
    await closeShelf(screen);

    await openStation({ id: 2, station: 'produce' });
    fireEvent.press(screen.getByRole('button', { name: '사과 담기' }));
    fireEvent.press(screen.getByLabelText('사과 한 개 더 담기'));
    await closeShelf(screen);

    await openStation({ id: 3, station: 'meal' });
    expect(screen.getByText('순한 카레가 품절이에요')).toBeTruthy();
    expect(screen.getByLabelText('순한 카레 품절')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '오늘카레 순한맛 담기' }));
    await closeShelf(screen);

    await openStation({ id: 4, station: 'checkout' });
    expect(screen.getByText('9,700원')).toBeTruthy();
    expect(screen.getByRole('button', { name: '목록 확인' }).props.accessibilityState.disabled).toBe(true);

    fireEvent.press(screen.getByRole('button', { name: '영수증 문제를 직원에게 알려요' }));
    expect(screen.getByText('중복 계산을 바로잡았어요')).toBeTruthy();
    expect(screen.getByRole('button', { name: '목록 확인' }).props.accessibilityState.disabled).toBe(false);

    fireEvent.press(screen.getByRole('button', { name: '목록 확인' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('목록에 맞게 장보기를 마쳤어요!')).toBeTruthy();
    expect(screen.getByText('영수증 해결')).toBeTruthy();
    expect(screen.getByText('대체 상품 비교')).toBeTruthy();
    expect(screen.getByText('예산 지킴')).toBeTruthy();
    expect(onMissionComplete).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText('출구로 이동하기'));
    expect(screen.getByLabelText('장보기를 마치고 출구로 이동 중')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1400);
      await Promise.resolve();
    });
    expect(onExit).toHaveBeenCalledTimes(1);
    screen.unmount();
    jest.useRealTimers();
  });

  it('목표 수량을 넘겨도 고르는 동안 알리지 않고 계산대에서 검토한다', async () => {
    const onMissionComplete = jest.fn();
    let request: MarketInteractionRequest | null = null;
    const renderScreen = () => (
      <MarketSimulationScreen
        embedded
        interactionRequest={request}
        onExit={jest.fn()}
        onLockChange={jest.fn()}
        onMissionComplete={onMissionComplete}
      />
    );
    const screen = render(renderScreen());
    fireEvent.press(screen.getByText('다음'));
    fireEvent.press(screen.getByText('장보기 시작'));

    const openStation = async (nextRequest: MarketInteractionRequest) => {
      request = nextRequest;
      screen.rerender(renderScreen());
      await act(async () => {
        await Promise.resolve();
      });
    };

    await openStation({ id: 1, station: 'produce' });
    fireEvent.press(screen.getByRole('button', { name: '사과 담기' }));
    fireEvent.press(screen.getByLabelText('사과 한 개 더 담기'));
    fireEvent.press(screen.getByLabelText('사과 한 개 더 담기'));
    expect(screen.queryByText(/개만 필요해요|수량을 다시 확인해|목록을 채웠어요/, { includeHiddenElements: true })).toBeNull();
    await closeShelf(screen);

    await openStation({ id: 2, station: 'fresh' });
    fireEvent.press(screen.getByRole('button', { name: '흰 우유 담기' }));
    await closeShelf(screen);

    await openStation({ id: 3, station: 'meal' });
    fireEvent.press(screen.getByRole('button', { name: '순한 카레 담기' }));
    await closeShelf(screen);

    await openStation({ id: 4, station: 'checkout' });
    fireEvent.press(screen.getByRole('button', { name: '목록 확인' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('사과 1개를 너무 많이 담았어요.')).toBeTruthy();
    expect(onMissionComplete).not.toHaveBeenCalled();
    screen.unmount();
  });

  it('도전 모드의 품절 상황에서 보이는 직원에게 대체 상품 도움을 받을 수 있다', async () => {
    let request: MarketInteractionRequest | null = null;
    const renderScreen = () => (
      <MarketSimulationScreen
        embedded
        interactionRequest={request}
        onExit={jest.fn()}
        onLockChange={jest.fn()}
      />
    );
    const screen = render(renderScreen());
    fireEvent.press(screen.getByText('도전 모드'));
    fireEvent.press(screen.getByText('다음'));
    fireEvent.press(screen.getByText('장보기 시작'));

    request = { id: 1, station: 'meal' };
    screen.rerender(renderScreen());
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('지영 · 매장 직원')).toBeTruthy();
    expect(screen.getByText('어려우면 상품 조건을 함께 확인해요.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '품절 상품을 직원에게 물어보기' }));
    expect(screen.getByText('대체 가능한 상품을 알려줬어요.')).toBeTruthy();
    expect(screen.getByText(
      '직원이 같은 순한맛·4인분인 오늘카레를 알려줬어요.',
      { includeHiddenElements: true },
    )).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '오늘카레 순한맛 담기' }));
    expect(screen.queryByText(
      '같은 순한맛·4인분 대체 상품을 골랐어요!',
      { includeHiddenElements: true },
    )).toBeNull();
    screen.unmount();
  });

  it('드래그는 목록 밖 상품, 초과 수량, 예산 초과도 허용하고 품절만 막는다', () => {
    expect(evaluateMarketProductDrop({}, 'ramen', 'practice')).toEqual({
      accepted: true,
    });
    expect(evaluateMarketProductDrop({ apple: 2 }, 'apple', 'practice')).toEqual({
      accepted: true,
    });
    expect(evaluateMarketProductDrop({ watermelon: 2 }, 'milk', 'practice')).toEqual({ accepted: true });
    expect(evaluateMarketProductDrop({}, 'curry', 'challenge')).toEqual({
      accepted: false,
      reason: 'unavailable',
    });
    expect(evaluateMarketProductDrop({}, 'brand-curry', 'challenge')).toEqual({
      accepted: true,
    });
    expect(evaluateMarketProductDrop({}, 'nonexistent-product', 'practice')).toEqual({
      accepted: false,
      reason: 'unavailable',
    });
  });

  it('담기 버튼과 드래그 모두 자유롭게 담으며 선택 평가 알림을 띄우지 않는다', async () => {
    let request: MarketInteractionRequest | null = null;
    const renderScreen = () => (
      <MarketSimulationScreen embedded interactionRequest={request} onExit={jest.fn()} />
    );
    const screen = render(renderScreen());
    fireEvent.press(screen.getByText('다음'));
    fireEvent.press(screen.getByText('장보기 시작'));
    request = { id: 1, station: 'produce' };
    screen.rerender(renderScreen());
    await act(async () => { await Promise.resolve(); });

    fireEvent.press(screen.getByRole('button', { name: '사과 담기' }));
    for (let index = 0; index < 5; index += 1) {
      fireEvent.press(screen.getByLabelText('사과 한 개 더 담기'));
    }
    act(() => {
      expect(screen.UNSAFE_getByType(MarketShelfScene).props.onDropProduct('watermelon')).toBe(true);
    });
    expect(screen.UNSAFE_getByType(MarketShelfScene).props.cart).toEqual({ apple: 6, watermelon: 1 });
    expect(screen.queryByText(/목록에 없어요|개만 필요해요|예산을.*넘어요|바로잡았어요|목록을 채웠어요/, { includeHiddenElements: true })).toBeNull();
    await closeShelf(screen);
    request = { id: 2, station: 'checkout' };
    screen.rerender(renderScreen());
    fireEvent.press(screen.getByRole('button', { name: '목록 확인' }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('사과 4개를 너무 많이 담았어요.')).toBeTruthy();
    screen.unmount();
  });

  it('연습과 도전을 빠르게 바꿔도 마지막 선택으로 부드럽게 전환한다', async () => {
    jest.useFakeTimers();
    const motionPreference = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const timing = jest.spyOn(Animated, 'timing');
    const screen = render(<MarketSimulationScreen embedded onExit={jest.fn()} />);
    await act(async () => { await Promise.resolve(); });
    timing.mockClear();

    fireEvent.press(screen.getByText('도전 모드'));
    fireEvent.press(screen.getByText('연습 모드'));
    fireEvent.press(screen.getByText('도전 모드'));
    expect(screen.getByRole('radio', { name: /^도전 모드/ }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('radio', { name: /^연습 모드/ }).props.accessibilityState.checked).toBe(false);
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 210, useNativeDriver: true }));
    // Native animations do not advance on the Jest mock host; check the last targets.
    expect(timing.mock.calls.slice(-2).map(([, config]) => config.toValue)).toEqual([0, 1]);
    act(() => jest.advanceTimersByTime(400));
    screen.unmount();
    timing.mockRestore();
    motionPreference.mockRestore();
    jest.useRealTimers();
  });

  it('동작 줄이기 설정에서는 모드 선택 애니메이션을 생략한다', async () => {
    const motionPreference = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const timing = jest.spyOn(Animated, 'timing');
    const screen = render(<MarketSimulationScreen embedded onExit={jest.fn()} />);
    await act(async () => { await Promise.resolve(); });
    timing.mockClear();
    fireEvent.press(screen.getByText('도전 모드'));
    expect(timing).not.toHaveBeenCalled();
    expect(StyleSheet.flatten(screen.getByTestId('market-mode-challenge-highlight').props.style).opacity).toBe(1);
    screen.unmount();
    timing.mockRestore();
    motionPreference.mockRestore();
  });
});
