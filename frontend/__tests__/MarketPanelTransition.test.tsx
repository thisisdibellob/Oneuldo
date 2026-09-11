import { useEffect, useState } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, Text, TextInput } from 'react-native';
import { MarketPanelTransition } from '../src/components/game/MarketPanelTransition';

async function advance(milliseconds = 300) {
  await act(async () => { jest.advanceTimersByTime(milliseconds); await Promise.resolve(); });
}

describe('마트 패널의 안전한 전환', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it('내용 전환 시 같은 패널을 다시 마운트하거나 입력 값을 초기화하지 않는다', async () => {
    const mounted = jest.fn();
    function Draft() {
      const [text, setText] = useState('');
      useEffect(() => { mounted(); }, []);
      return <TextInput accessibilityLabel="설정 초안" value={text} onChangeText={setText} />;
    }
    const screen = render(<MarketPanelTransition visible transitionKey="step-1"><Draft /></MarketPanelTransition>);
    fireEvent.changeText(screen.getByLabelText('설정 초안'), '유지할 설정');
    screen.rerender(<MarketPanelTransition visible transitionKey="step-2"><Draft /></MarketPanelTransition>);
    await advance();
    expect(screen.getByDisplayValue('유지할 설정')).toBeTruthy();
    expect(mounted).toHaveBeenCalledTimes(1);
    screen.unmount();
  });

  it('퇴장 화면을 유지하면서 버튼 접근과 이동 잠금을 애니메이션 끝까지 분리한다', async () => {
    const onPresenceChange = jest.fn();
    const screen = render(<MarketPanelTransition visible transitionKey="cart" onPresenceChange={onPresenceChange}><Text>장바구니 내용</Text></MarketPanelTransition>);
    await advance();
    screen.rerender(<MarketPanelTransition visible={false} transitionKey="shopping" onPresenceChange={onPresenceChange}>{null}</MarketPanelTransition>);
    const layer = screen.getByTestId('market-panel-transition', { includeHiddenElements: true });
    expect(layer.props.pointerEvents).toBe('auto');
    expect(layer.props.onStartShouldSetResponder()).toBe(true);
    expect(layer.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.getByText('장바구니 내용', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('장바구니 내용')).toBeNull();
    expect(onPresenceChange).toHaveBeenLastCalledWith(true);
    await advance();
    expect(screen.queryByTestId('market-panel-transition', { includeHiddenElements: true })).toBeNull();
    expect(onPresenceChange).toHaveBeenLastCalledWith(false);
    screen.unmount();
  });

  it('닫는 동안 다른 패널을 열면 이전 퇴장 콜백이 새 화면을 지우지 않는다', async () => {
    const presence = jest.fn();
    const screen = render(<MarketPanelTransition visible transitionKey="cart" onPresenceChange={presence}><Text>장바구니</Text></MarketPanelTransition>);
    await advance();
    screen.rerender(<MarketPanelTransition visible={false} transitionKey="shopping" onPresenceChange={presence}>{null}</MarketPanelTransition>);
    await advance(70);
    screen.rerender(<MarketPanelTransition visible transitionKey="checkout" onPresenceChange={presence}><Text>구매 확인</Text></MarketPanelTransition>);
    await advance();
    expect(screen.getByText('구매 확인')).toBeTruthy();
    expect(screen.queryByText('장바구니')).toBeNull();
    expect(presence).toHaveBeenLastCalledWith(true);
    screen.unmount();
  });

  it('닫는 중 늦게 도착한 네이티브 모션 감소 설정은 퇴장을 즉시 완료한다', async () => {
    let resolveMotion: (enabled: boolean) => void = () => {};
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => new Promise(resolve => { resolveMotion = resolve; }));
    const screen = render(<MarketPanelTransition visible transitionKey="cart"><Text>장바구니</Text></MarketPanelTransition>);
    screen.rerender(<MarketPanelTransition visible={false} transitionKey="shopping">{null}</MarketPanelTransition>);
    await act(async () => { resolveMotion(true); await Promise.resolve(); });
    expect(screen.queryByTestId('market-panel-transition', { includeHiddenElements: true })).toBeNull();
    screen.unmount();
  });

  it('웹의 prefers-reduced-motion을 처음부터 존중하고 변경 리스너를 해제한다', async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const media = { matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() };
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: jest.fn(() => media) } });
    try {
      const screen = render(<MarketPanelTransition visible transitionKey="cart"><Text>장바구니</Text></MarketPanelTransition>);
      screen.rerender(<MarketPanelTransition visible={false} transitionKey="shopping">{null}</MarketPanelTransition>);
      expect(screen.queryByTestId('market-panel-transition', { includeHiddenElements: true })).toBeNull();
      screen.unmount();
      expect(media.removeEventListener).toHaveBeenCalledWith('change', media.addEventListener.mock.calls[0][1]);
    } finally {
      if (platformDescriptor) Object.defineProperty(Platform, 'OS', platformDescriptor);
      if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
});
