import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, BackHandler, StyleSheet } from 'react-native';

import { GameHud } from '../src/components/game/GameHud';
import { DEFAULT_GAME_PREFERENCES, getGamePreferences, updateGamePreferences } from '../src/game/gamePreferences';

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

beforeEach(() => { jest.useFakeTimers(); updateGamePreferences(DEFAULT_GAME_PREFERENCES); });
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
    expect(screen.getAllByTestId('phone-home-app')).toHaveLength(9);
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

it('툴바 설정도 휴대폰의 한 페이지에서 조작·배경·소리를 바꾸고 계속 유지한다', async () => {
  const callbacks = props();
  const screen = render(<GameHud {...callbacks} />);
  try {
    fireEvent.press(screen.getByRole('button', { name: '설정 열기' }));
    expect(screen.getByTestId('phone-settings')).toBeTruthy();
    expect(screen.getByText('조작 방식')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '패드 거리로 걷기·달리기' }).props.accessibilityState.checked).toBe(true);
    fireEvent.press(screen.getByRole('radio', { name: '달리기 버튼 켜기·끄기' }));
    expect(getGamePreferences().runMode).toBe('toggle');
    expect(screen.getByText('배경화면 색상')).toBeTruthy();
    expect(screen.getByText('소리')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '기본 마트' }).props.accessibilityState.checked).toBe(true);
    fireEvent.press(screen.getByRole('radio', { name: '동네 마트' }));
    expect(getGamePreferences().marketInteriorTheme).toBe('cozy');
    fireEvent.press(screen.getByRole('radio', { name: '터치 이동' }));
    expect(callbacks.onControlModeChange).toHaveBeenCalledWith('touch');
    expect(callbacks.onMenuVisibilityChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByTestId('phone-settings')).toBeTruthy();
    fireEvent.press(screen.getByRole('radio', { name: '하늘 배경화면' }));
    expect(StyleSheet.flatten(screen.getByTestId('phone-screen').props.style).backgroundColor).toBe('#DFE9EE');
    fireEvent.press(screen.getByRole('button', { name: '배경음악 음량 줄이기' }));
    fireEvent.press(screen.getByRole('button', { name: '효과음 음소거' }));
    expect(getGamePreferences()).toMatchObject({ musicVolume: 0.75, effectsVolume: 0, wallpaperColor: '#DFE9EE' });
    fireEvent.press(screen.getByRole('button', { name: '휴대폰 닫기' }));
    await finishMenuAnimation();
    expect(callbacks.onMenuVisibilityChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('radio', { name: '터치 이동' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: '휴대폰 열기' }));
    fireEvent.press(screen.getByRole('button', { name: '설정' }));
    expect(screen.getByRole('adjustable', { name: '배경음악 음량' }).props.accessibilityValue.now).toBe(75);
    expect(screen.getByRole('adjustable', { name: '효과음 음량' }).props.accessibilityValue.now).toBe(0);
    expect(screen.getByRole('radio', { name: '동네 마트' }).props.accessibilityState.checked).toBe(true);
    expect(callbacks.onExit).not.toHaveBeenCalled();
  } finally { screen.unmount(); }
});

it('마트 설정은 설정에서 휴대폰을 닫은 뒤 편집기로 넘긴다', async () => {
  const callbacks = props();
  const onEditMarketLayout = jest.fn();
  const screen = render(<GameHud {...callbacks} onEditMarketLayout={onEditMarketLayout} />);
  try {
    fireEvent.press(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.press(screen.getByRole('button', { name: '마트 설정' }));
    expect(onEditMarketLayout).not.toHaveBeenCalled();
    await finishMenuAnimation();
    expect(onEditMarketLayout).toHaveBeenCalledTimes(1);
    expect(callbacks.onMenuVisibilityChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByTestId('phone-settings')).toBeNull();
    expect(callbacks.onExit).not.toHaveBeenCalled();
  } finally { screen.unmount(); }
});

it('마트 설정 동작이 없는 화면에서는 설정에 빈 버튼을 만들지 않는다', () => {
  const screen = render(<GameHud {...props()} />);
  try {
    fireEvent.press(screen.getByRole('button', { name: '설정 열기' }));
    expect(screen.queryByRole('button', { name: '마트 설정' })).toBeNull();
  } finally { screen.unmount(); }
});

it('휴대폰 계산기는 수동 계산 결과를 닫았다 열어도 유지한다', async () => {
  const callbacks = props();
  const screen = render(<GameHud {...callbacks} />);
  try {
    fireEvent.press(screen.getByRole('button', { name: '휴대폰 열기' }));
    fireEvent.press(screen.getByRole('button', { name: '계산기' }));
    fireEvent.press(screen.getByRole('button', { name: '숫자 8' }));
    fireEvent.press(screen.getByRole('button', { name: '곱하기' }));
    fireEvent.press(screen.getByRole('button', { name: '숫자 3' }));
    fireEvent.press(screen.getByRole('button', { name: '계산하기' }));
    expect(screen.getByTestId('calculator-result').props.children).toBe('24');
    fireEvent.press(screen.getByRole('button', { name: '휴대폰 닫기' }));
    await finishMenuAnimation();
    fireEvent.press(screen.getByRole('button', { name: '휴대폰 열기' }));
    fireEvent.press(screen.getByRole('button', { name: '계산기' }));
    expect(screen.getByTestId('calculator-result').props.children).toBe('24');
    expect(callbacks.onExit).not.toHaveBeenCalled();
  } finally { screen.unmount(); }
});

it('마트 의뢰인 전화는 휴대폰 닫힘을 알린 뒤 대화를 요청한다', async () => {
  const callbacks = props();
  const call = jest.fn();
  const screen = render(<GameHud {...callbacks} onContactRequester={call} requesterLabel="지영" />);
  try {
    fireEvent.press(screen.getByRole('button', { name: '휴대폰 열기' }));
    fireEvent.press(screen.getByRole('button', { name: '전화' }));
    fireEvent.press(screen.getByRole('button', { name: '지영에게 전화' }));
    await finishMenuAnimation();
    expect(callbacks.onMenuVisibilityChange).toHaveBeenLastCalledWith(false);
    expect(call).toHaveBeenCalledTimes(1);
    expect(callbacks.onMenuVisibilityChange.mock.invocationCallOrder.at(-1)).toBeLessThan(call.mock.invocationCallOrder[0]);
  } finally { screen.unmount(); }
});

it.each([{ id: 'jiyoung', name: '지영' }, { id: 'minsu', name: '민수' }] as const)('전화 앱에서 $name 연락처를 고르면 닫힌 뒤 해당 대상을 전달한다', async ({ id, name }) => {
  const callbacks = props();
  const call = jest.fn();
  const screen = render(<GameHud {...callbacks} onCallContact={call} />);
  try {
    fireEvent.press(screen.getByRole('button', { name: '휴대폰 열기' }));
    expect(screen.queryByTestId('phone-contacts')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: '전화' }));
    expect(screen.getByRole('button', { name: '지영에게 전화' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '민수에게 전화' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: `${name}에게 전화` }));
    await finishMenuAnimation();
    expect(call).toHaveBeenCalledWith(id);
    expect(callbacks.onMenuVisibilityChange).toHaveBeenLastCalledWith(false);
    expect(callbacks.onMenuVisibilityChange.mock.invocationCallOrder.at(-1)).toBeLessThan(call.mock.invocationCallOrder[0]);
  } finally { screen.unmount(); }
});

it('휴대폰 홈은 사진과 버스 노선을 포함한 9개 앱이며 앱을 바꿔도 외곽 크기는 같다', async () => {
  const screen = render(<GameHud {...props()} onTravel={jest.fn()} />);
  try {
    expect(screen.getByLabelText('현재 소지금 30,000원')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '휴대폰 열기' }));
    expect(screen.getAllByTestId('phone-home-app')).toHaveLength(9);
    expect(screen.queryByText('내 휴대폰')).toBeNull();
    expect(screen.queryByText('오늘도, 내 속도로')).toBeNull();
    const messages = screen.getByRole('button', { name: '메시지' });
    expect(messages.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(messages);
    expect(screen.getByTestId('phone-safety')).toBeTruthy();
    fireEvent.press(screen.getAllByRole('button', { name: '휴대폰 홈으로' })[0]);
    expect(screen.getAllByTestId('phone-home-app')).toHaveLength(9);
    const initial = StyleSheet.flatten(screen.getByTestId('phone-case').props.style);
    expect(initial.height).toBeGreaterThan(0);
    expect(initial.width / initial.height).toBeCloseTo(390 / 750);
    const screenClip = StyleSheet.flatten(screen.getByTestId('phone-screen-clip').props.style);
    expect(screenClip.borderRadius + initial.padding + initial.borderWidth).toBeCloseTo(initial.borderRadius);
    expect(screenClip.overflow).toBe('hidden');
    expect(StyleSheet.flatten(screen.getByTestId('phone-screen').props.style).borderRadius).toBeUndefined();
    for (const app of ['사진', '계산기', '전화', '메시지', '설정', '버스 노선', '바로 이동', '비상 탈출', '게임 나가기']) {
      fireEvent.press(screen.getByRole('button', { name: app }));
      const next = StyleSheet.flatten(screen.getByTestId('phone-case').props.style);
      expect([next.height, next.width, next.maxHeight, next.maxWidth]).toEqual([initial.height, initial.width, initial.maxHeight, initial.maxWidth]);
      expect(StyleSheet.flatten(screen.getByTestId('phone-screen-clip').props.style).borderRadius).toBe(screenClip.borderRadius);
      expect(screen.getByTestId('phone-content-scroll')).toBeTruthy();
      fireEvent.press(screen.getAllByRole('button', { name: '휴대폰 홈으로' })[0]);
    }
  } finally { screen.unmount(); }
});

it('현재 정류장의 노선을 열고 휴대폰이 닫힌 다음 선택한 마을로 바로 이동한다', async () => {
  const callbacks = props();
  const travel = jest.fn();
  const routeViewed = jest.fn();
  const screen = render(<GameHud {...callbacks} onTravel={travel} onRouteViewed={routeViewed}
    busRouteContext={{ currentStop: 'library', direction: 'inbound', destination: 'village' }} />);
  try {
    fireEvent.press(screen.getByRole('button', { name: '휴대폰 열기' }));
    fireEvent.press(screen.getByRole('button', { name: '버스 노선' }));
    expect(routeViewed).toHaveBeenCalledTimes(1);
    expect(screen.getByText('느티광장 방면')).toBeTruthy();
    expect(screen.getByTestId('route-map-stop-library').findByProps({ children: '현재' })).toBeTruthy();
    fireEvent.press(screen.getAllByRole('button', { name: '휴대폰 홈으로' })[0]);
    fireEvent.press(screen.getByRole('button', { name: '바로 이동' }));
    fireEvent.press(screen.getByRole('button', { name: '하늘도서관 마을로 바로 이동' }));
    expect(travel).not.toHaveBeenCalled();
    await finishMenuAnimation();
    expect(travel).toHaveBeenCalledWith('library');
    expect(screen.queryByTestId('phone-screen')).toBeNull();
    expect(callbacks.onMenuVisibilityChange.mock.invocationCallOrder.at(-1)).toBeLessThan(travel.mock.invocationCallOrder[0]);
  } finally { screen.unmount(); }
});

it.each([false, true])('실제 터치 이벤트로 휴대폰을 닫아도 이벤트를 콜백으로 실행하지 않는다 (모션 감소 %s)', async (reduceMotion) => {
  const motion = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduceMotion);
  const callbacks = props();
  const screen = render(<GameHud {...callbacks} />);
  const touch = { nativeEvent: { pageX: 280, pageY: 60 }, stopPropagation: jest.fn(), preventDefault: jest.fn() };
  try {
    await act(async () => { await Promise.resolve(); });
    fireEvent.press(screen.getByRole('button', { name: '휴대폰 열기' }), touch);
    fireEvent.press(screen.getByRole('button', { name: '계산기' }), touch);
    fireEvent.press(screen.getByRole('button', { name: '휴대폰 닫기' }), touch);
    await finishMenuAnimation();
    expect(screen.queryByTestId('phone-calculator')).toBeNull();
    expect(callbacks.onMenuVisibilityChange).toHaveBeenLastCalledWith(false);
    expect(callbacks.onExit).not.toHaveBeenCalled();
  } finally { screen.unmount(); motion.mockRestore(); }
});
