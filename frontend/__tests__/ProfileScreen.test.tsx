import { act, render } from '@testing-library/react-native';

import { ProfileScreen } from '../src/screens/ProfileScreen';
import { resetUserProgressForTests } from '../src/progress/userProgress';

jest.mock('expo-haptics', () => ({ ImpactFeedbackStyle: { Light: 'light' }, impactAsync: () => Promise.resolve() }));

afterEach(() => resetUserProgressForTests());

it('사용자 탭 가운데에 마을과 같은 내 캐릭터 idle 스프라이트와 개인 레벨을 보여준다', () => {
  act(() => resetUserProgressForTests({ totalXp: 230, bestStreak: 4, activeDays: [], entries: [] }));
  const screen = render(<ProfileScreen />);

  expect(screen.getByTestId('profile-player-avatar')).toBeTruthy();
  expect(screen.getByLabelText('내 캐릭터')).toBeTruthy();
  expect(screen.getByText('Lv.3')).toBeTruthy();
  expect(screen.getByText('다음 레벨까지 70 XP')).toBeTruthy();
  expect(screen.getByText('연속 학습 0일 · 최고 4일')).toBeTruthy();
});
