import { fireEvent, render, waitFor } from '@testing-library/react-native';

import App from '../App';

jest.mock('expo-font', () => ({
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
  useFonts: () => [true, null],
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: () => Promise.resolve(),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

describe('오늘도 앱', () => {
  it('로그인 뒤 메인 화면과 플로팅 내비게이션을 보여준다', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByRole('button', { name: '카카오로 시작하기' }));
    expect(screen.getByText('오늘도 함께 해 볼까요?', { exact: false })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '퀘스트 탭' })).toBeTruthy();
  });

  it('메인 카드의 퀘스트는 화면 이동 없이 목록만 바꾼다', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByRole('button', { name: 'Google로 시작하기' }));
    fireEvent.press(screen.getAllByText('퀘스트')[0]);
    expect(screen.getByText('카페에서 주문하기')).toBeTruthy();
    expect(screen.getByRole('tab', { name: '홈 탭' }).props.accessibilityState.selected).toBe(true);
  });

  it('퀘스트 탭에서 달력과 추천 퀘스트를 보여준다', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByRole('button', { name: 'Google로 시작하기' }));
    fireEvent.press(screen.getByRole('tab', { name: '퀘스트 탭' }));
    expect(screen.getByText('추천 퀘스트')).toBeTruthy();
    expect(screen.getByText('8월')).toBeTruthy();
    expect(screen.getByText('상담 예약')).toBeTruthy();
  });

  it('AI 입력 표시 뒤 답변을 추가하고 여러 대화를 누적한다', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByRole('button', { name: 'Google로 시작하기' }));
    fireEvent.press(screen.getByRole('tab', { name: 'AI 탭' }));

    const firstInput = screen.getByLabelText('AI 친구에게 메시지 보내기');
    fireEvent.changeText(firstInput, '오늘 기분이 조금 어려워');
    fireEvent(firstInput, 'submitEditing');

    const nextInput = screen.getByLabelText('AI 친구에게 메시지 보내기');
    fireEvent.changeText(nextInput, '그래도 연습은 해 보고 싶어');
    fireEvent(nextInput, 'submitEditing');

    expect(screen.getByLabelText('AI가 답변을 입력 중')).toBeTruthy();
    expect(screen.getByText('오늘 기분이 조금 어려워')).toBeTruthy();
    expect(screen.getByText('그래도 연습은 해 보고 싶어')).toBeTruthy();
    await waitFor(
      () => expect(screen.getAllByText('구름이가 듣고 있어요. 우리 같이 천천히 생각해 봐요.')).toHaveLength(2),
      { timeout: 2000 },
    );
  });

  it('퀘스트를 끝내면 XP 보상 애니메이션 뒤 목록으로 돌아온다', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByRole('button', { name: 'Google로 시작하기' }));
    fireEvent.press(screen.getByRole('tab', { name: '퀘스트 탭' }));
    fireEvent.press(screen.getByText('혼자 버스 타기'));

    fireEvent.press(screen.getByRole('button', { name: '이렇게 말할게요' }));
    fireEvent.press(screen.getByRole('button', { name: '이렇게 말할게요' }));
    fireEvent.press(screen.getByRole('button', { name: '이렇게 말할게요' }));
    fireEvent.press(screen.getByRole('button', { name: '이렇게 말할게요' }));

    expect(screen.getByText('완료했어요!')).toBeTruthy();
    expect(screen.getByText('+20 XP')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('추천 퀘스트')).toBeTruthy(), { timeout: 2000 });
  });
});
