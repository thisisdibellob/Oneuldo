import { fireEvent, render } from '@testing-library/react-native';

import { getGamePreferences, resetGamePreferencesForTests } from '../src/game/gamePreferences';
import { ProfileScreen } from '../src/screens/ProfileScreen';
import { APP_VERSION, SettingsScreen } from '../src/screens/SettingsScreen';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-haptics', () => ({ ImpactFeedbackStyle: { Light: 'light' }, impactAsync: () => Promise.resolve() }));

afterEach(() => resetGamePreferencesForTests());

it('사용자 탭 메뉴는 설정·가족만 누를 수 있고 나머지는 준비 중으로 막혀 있다', () => {
  const onOpenSettings = jest.fn();
  const screen = render(<ProfileScreen onOpenSettings={onOpenSettings} />);
  expect(screen.getByRole('button', { name: '설정' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '가족' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '가계부' })).toBeNull();
  expect(screen.getByLabelText('가계부, 준비 중')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '설정' }));
  expect(onOpenSettings).toHaveBeenCalledTimes(1);
});

it('설정에서 음향을 끄고 켜며, 내 계정·크레딧으로 들어갔다 나온다', () => {
  const onBack = jest.fn(); const onLogout = jest.fn();
  const screen = render(<SettingsScreen accessToken={null} onBack={onBack} onLogout={onLogout} />);
  expect(screen.getByText(APP_VERSION)).toBeTruthy();

  fireEvent.press(screen.getByRole('switch', { name: '배경음악' }));
  expect(getGamePreferences().musicVolume).toBe(0);
  fireEvent.press(screen.getByRole('switch', { name: '효과음' }));
  expect(getGamePreferences().effectsVolume).toBe(0);
  fireEvent.press(screen.getByRole('switch', { name: '배경음악' }));
  expect(getGamePreferences().musicVolume).toBe(1);

  // 음량 막대: 접근성 조절로 한 칸씩 줄이고, 껐다 켜면 직전 음량으로 돌아간다.
  fireEvent(screen.getByLabelText('배경음악 음량'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(getGamePreferences().musicVolume).toBe(0.9);
  fireEvent.press(screen.getByRole('switch', { name: '배경음악' }));
  fireEvent.press(screen.getByRole('switch', { name: '배경음악' }));
  expect(getGamePreferences().musicVolume).toBe(0.9);

  fireEvent.press(screen.getByRole('button', { name: '내 계정' }));
  expect(screen.getByText('게스트')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '로그아웃' }));
  expect(onLogout).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('button', { name: '뒤로' }));

  fireEvent.press(screen.getByRole('button', { name: '제작자 크레딧' }));
  for (const name of ['이진욱', '최정우', '박재현']) expect(screen.getByText(name)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '뒤로' }));
  fireEvent.press(screen.getByRole('button', { name: '뒤로' }));
  expect(onBack).toHaveBeenCalledTimes(1);
});
