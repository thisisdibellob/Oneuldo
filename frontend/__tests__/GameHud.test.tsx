import { act, fireEvent, render } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import { GameHud } from '../src/components/game/GameHud';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

const props = () => ({
  controlMode: 'joystick' as const,
  dailyQuests: [],
  onControlModeChange: jest.fn(),
  onEmergencyExit: jest.fn(),
  onExit: jest.fn(),
  onMenuVisibilityChange: jest.fn(),
});

async function finishMenuAnimation() {
  await act(async () => { jest.advanceTimersByTime(240); await Promise.resolve(); });
}

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

it('휴대폰에서 게임 종료를 확정하면 종료 콜백과 메뉴 닫힘을 모두 전달한다', async () => {
  const callbacks = props();
  const screen = render(<GameHud {...callbacks} />);
  try {
    fireEvent.press(screen.getByRole('button', { name: '휴대폰 열기' }));
    expect(callbacks.onMenuVisibilityChange).toHaveBeenLastCalledWith(true);
    fireEvent.press(screen.getByRole('button', { name: '게임 나가기' }));
    expect(screen.getByText('게임에서 나갈까요?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('game-exit'));
    expect(callbacks.onExit).toHaveBeenCalledTimes(1);
    expect(callbacks.onEmergencyExit).not.toHaveBeenCalled();
    await finishMenuAnimation();
    expect(callbacks.onMenuVisibilityChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('button', { name: '게임 메뉴 닫기' })).toBeNull();
    expect(screen.getByTestId('game-top-hud')).toBeTruthy();
    expect(screen.getByTestId('game-toolbar')).toBeTruthy();
  } finally { screen.unmount(); }
});

it('안드로이드 뒤로 가기는 종료 확인에서 휴대폰으로, 그다음 게임으로 돌아간다', async () => {
  const callbacks = props();
  const listeners = new Set<Parameters<typeof BackHandler.addEventListener>[1]>();
  const subscription = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    listeners.add(handler);
    return { remove: () => { listeners.delete(handler); } };
  });
  const screen = render(<GameHud {...callbacks} />);
  const back = () => {
    let consumed = false;
    act(() => { consumed = [...listeners].reverse().some(listener => listener({ type: 'hardwareBackPress', timeStamp: Date.now() }) === true); });
    expect(consumed).toBe(true);
  };
  try {
    fireEvent.press(screen.getByRole('button', { name: '휴대폰 열기' }));
    fireEvent.press(screen.getByRole('button', { name: '게임 나가기' }));
    back();
    expect(screen.queryByText('게임에서 나갈까요?')).toBeNull();
    expect(screen.getByText('내 휴대폰')).toBeTruthy();
    expect(callbacks.onMenuVisibilityChange).toHaveBeenLastCalledWith(true);
    expect(callbacks.onExit).not.toHaveBeenCalled();
    back();
    await finishMenuAnimation();
    expect(screen.queryByText('내 휴대폰')).toBeNull();
    expect(callbacks.onMenuVisibilityChange).toHaveBeenLastCalledWith(false);
    expect(callbacks.onExit).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  } finally {
    screen.unmount();
    subscription.mockRestore();
  }
});

it('설정의 조작법 변경은 선택한 모드를 전달하고 메뉴를 닫는다', async () => {
  const callbacks = props();
  const screen = render(<GameHud {...callbacks} />);
  try {
    fireEvent.press(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.press(screen.getByRole('radio', { name: '터치 이동' }));
    expect(callbacks.onControlModeChange).toHaveBeenCalledWith('touch');
    await finishMenuAnimation();
    expect(callbacks.onMenuVisibilityChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('radio', { name: '터치 이동' })).toBeNull();
    expect(callbacks.onExit).not.toHaveBeenCalled();
  } finally { screen.unmount(); }
});
