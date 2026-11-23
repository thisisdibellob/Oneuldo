import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { GuardianApp } from '../App';
jest.mock('expo-font', () => ({ useFonts: () => [true, null], isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

function demo() { const screen = render(<GuardianApp />); fireEvent.press(screen.getByRole('button', { name: '시연 화면 둘러보기' })); return screen; }
test('demo navigation, detail and route actions work without a game app or server', async () => {
  const screen = demo();
  expect(screen.getByText('시연 모드')).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: '훈련 기록' }));
  fireEvent.press(screen.getAllByRole('button', { name: /부탁받은 물건을 찾아 장보기 상세 보기/ })[0]);
  fireEvent.press(screen.getByRole('button', { name: '이동 경로' }));
  expect(screen.getByTestId('route-review')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '직원에게 우유 위치를 물었어요 위치 보기' }));
  expect(screen.getByText('1:19 / 2:28')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '상세 닫기' }));
  fireEvent.press(screen.getByRole('button', { name: '시연 종료' }));
  expect(screen.getByText('보호자 로그인')).toBeTruthy();
});
test('switching siblings never keeps the previous child report visible', () => {
  const screen = demo();
  fireEvent.press(screen.getByRole('button', { name: '자녀 선택' }));
  fireEvent.press(screen.getByRole('button', { name: '도윤 기록 선택' }));
  expect(screen.getByText('도윤님의 연습 과정을 살펴봐요.')).toBeTruthy();
  expect(screen.queryByText('부탁받은 물건을 찾아 장보기')).toBeNull();
  expect(screen.getByText('사과 한 개 사 오기')).toBeTruthy();
});
test('explicit demo linking, empty records and confirmation-based unlink work', async () => {
  const screen = demo();
  fireEvent.press(screen.getByRole('tab', { name: '가족 · 설정' }));
  fireEvent.changeText(screen.getByLabelText('자녀 연결 코드'), 'DEMO2026');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: '자녀 연결하기' })));
  expect(screen.getByText('서준')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '서준 연결 해제' }));
  fireEvent.press(screen.getByRole('button', { name: '취소' }));
  expect(screen.getByText('서준')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '서준 연결 해제' }));
  await act(async () => fireEvent.press(screen.getByRole('button', { name: '연결 해제 확인' })));
  expect(screen.queryByText('서준')).toBeNull();
});
test('real login failure stays at login and cannot reveal fictional results', async () => {
  const screen = render(<GuardianApp />);
  fireEvent.changeText(screen.getByLabelText('보호자 이메일'), 'parent@example.com');
  fireEvent.changeText(screen.getByLabelText('보호자 비밀번호'), 'not-a-real-password');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: '로그인' })));
  expect(screen.getByText(/서버 연결이 아직 준비되지/)).toBeTruthy();
  expect(screen.queryByText('시연 모드')).toBeNull();
});
