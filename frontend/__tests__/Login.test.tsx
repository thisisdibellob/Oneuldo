import { fireEvent, render, waitFor } from '@testing-library/react-native';

import App from '../App';

jest.mock('../src/api/auth', () => ({
  login: jest.fn(async () => ({ accessToken: 'test-access-token' })),
  signUp: jest.fn(async () => undefined),
}));

jest.mock('../src/api/quest', () => ({
  getQuestDetail: jest.fn(async () => null),
  getQuests: jest.fn(async () => []),
  getRecommendedQuests: jest.fn(async () => []),
}));

jest.mock('expo-font', () => ({
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
  useFonts: () => [true, null],
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: () => Promise.resolve(),
}));

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => ({
    loop: false,
    pause: jest.fn(),
    play: jest.fn(),
    seekTo: jest.fn(() => Promise.resolve()),
    setPlaybackRate: jest.fn(),
    volume: 1,
  }),
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));

jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native');

  return {
    GlassView: View,
    isLiquidGlassAvailable: () => false,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

describe('로그인 화면', () => {
  it('아이디 로그인 화면에서 입력과 비밀번호 표시를 제어한 뒤 앱에 진입한다', async () => {
    const screen = render(<App />);

    fireEvent.press(screen.getByRole('button', { name: '아이디로 로그인' }));
    await waitFor(() => expect(screen.getByText('로그인')).toBeTruthy());
    expect(screen.getByRole('button', { name: '로그인 첫 화면으로 돌아가기' })).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('이메일'), 'child@example.com');
    fireEvent.changeText(screen.getByLabelText('비밀번호'), 'onuldo-password');
    expect(screen.getByLabelText('비밀번호').props.secureTextEntry).toBe(true);

    fireEvent.press(screen.getByRole('button', { name: '비밀번호 표시' }));
    expect(screen.getByLabelText('비밀번호').props.secureTextEntry).toBe(false);

    fireEvent.press(screen.getByRole('button', { name: '시작하기' }));
    await waitFor(() => expect(screen.getByText('오늘도 함께 해 볼까요?', { exact: false })).toBeTruthy());
  });

  it('회원가입 후 자동 로그인해 앱에 진입한다', async () => {
    const auth = jest.requireMock('../src/api/auth');
    const screen = render(<App />);

    fireEvent.press(screen.getByRole('button', { name: '아이디로 로그인' }));
    await waitFor(() => expect(screen.getByText('로그인')).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: '회원가입' }));
    await waitFor(() => expect(screen.getByLabelText('아이디')).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText('아이디'), 'test-child');
    fireEvent.changeText(screen.getByLabelText('이름'), '테스트');
    fireEvent.changeText(screen.getByLabelText('이메일'), 'test@oneuldo.local');
    fireEvent.changeText(screen.getByLabelText('생년월일 (YYYY-MM-DD)'), '2000-01-01');
    fireEvent.changeText(screen.getByLabelText('비밀번호 (8자 이상)'), 'test-password');
    fireEvent.changeText(screen.getByLabelText('비밀번호 확인'), 'test-password');
    fireEvent.press(screen.getByRole('button', { name: '가입하고 시작하기' }));

    await waitFor(() => expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'test@oneuldo.local', loginId: 'test-child', name: '테스트',
    })));
    await waitFor(() => expect(auth.login).toHaveBeenCalledWith('test@oneuldo.local', 'test-password'));
    await waitFor(() => expect(screen.getByText('오늘도 함께 해 볼까요?', { exact: false })).toBeTruthy());
  });
});
