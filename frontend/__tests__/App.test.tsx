import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import App from '../App';
import { GamePrototypeScreen } from '../src/screens/GamePrototypeScreen';

jest.mock('../src/api/quest', () => {
  class QuestApiError extends Error {}
  const summary = {
    categoryCode: 'PUBLIC_TRANSPORT',
    categoryName: '대중교통',
    difficulty: 'EASY',
    id: 'quest-1',
    rewardPoints: 20,
    summary: '목적지까지 가는 버스를 찾아봐요.',
    title: '혼자 버스 타기',
  };
  return {
    QuestApiError,
    abandonQuestSession: jest.fn(async () => ({ status: 'ABANDONED' })),
    completeQuestSession: jest.fn(async () => ({ status: 'COMPLETED' })),
    getQuest: jest.fn(async () => summary),
    getQuestDetail: jest.fn(async () => ({
      ...summary,
      code: 'TAKE_BUS_ALONE',
      goal: '혼자 버스를 이용한다.',
      steps: [
        {
          choices: [
            { choiceOrder: 1, correct: true, feedback: '좋아요!', id: 'choice-1', label: '목적지가 적힌 노선의 버스 번호를 확인한다.' },
            { choiceOrder: 2, correct: false, feedback: '다시 확인해요.', id: 'choice-2', label: '아무 버스나 탄다.' },
          ],
          hint: '목적지를 확인해요.',
          id: 'step-1',
          instruction: '버스 번호를 찾아보세요.',
          situation: '정류장 안내판이 있습니다.',
          stepOrder: 1,
        },
        {
          choices: [{ choiceOrder: 1, correct: true, feedback: '맞아요!', id: 'choice-3', label: '버스 앞 번호와 확인한 번호를 비교한다.' }],
          hint: null,
          id: 'step-2',
          instruction: '버스를 확인하세요.',
          situation: '버스가 도착했습니다.',
          stepOrder: 2,
        },
        {
          choices: [{ choiceOrder: 1, correct: true, feedback: '잘했어요!', id: 'choice-4', label: '교통카드를 단말기에 댄다.' }],
          hint: null,
          id: 'step-3',
          instruction: '교통카드를 사용하세요.',
          situation: '단말기가 있습니다.',
          stepOrder: 3,
        },
        {
          choices: [{ choiceOrder: 1, correct: true, feedback: '좋아요!', id: 'choice-5', label: '하차 버튼을 누르고 버스가 멈출 때까지 기다린다.' }],
          hint: null,
          id: 'step-4',
          instruction: '목적지에서 내리세요.',
          situation: '목적지에 도착합니다.',
          stepOrder: 4,
        },
      ],
    })),
    getQuests: jest.fn(async () => [summary]),
    getRecommendedQuests: jest.fn(async () => [summary]),
    recordQuestEvent: jest.fn(async () => ({ correct: true })),
    startQuestSession: jest.fn(async () => ({ id: 'session-1', status: 'IN_PROGRESS' })),
  };
});

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

it('게임을 나갈 때 오디오를 안전하게 멈춘다', async () => {
  const onExit = jest.fn();
  const screen = render(<GamePrototypeScreen onExit={onExit} />);

  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.press(screen.getByRole('button', { name: '휴대폰 열기' }));
  fireEvent.press(screen.getByRole('button', { name: '게임 나가기' }));
  fireEvent.press(screen.getByTestId('game-exit'));

  expect(onExit).toHaveBeenCalledTimes(1);
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

  it('게임 탭에서 액션 버튼으로 NPC 대화를 넘기고 퀴즈를 완료한다', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByRole('button', { name: 'Google로 시작하기' }));
    fireEvent.press(screen.getByRole('tab', { name: '게임 탭' }));

    fireEvent.press(screen.getByRole('button', { name: '오늘도 마을 들어가기' }));
    expect(screen.getByLabelText('쿼터뷰 마을')).toBeTruthy();
    expect(screen.getByLabelText('내 캐릭터')).toBeTruthy();

    expect(screen.getByLabelText('안내원 민수')).toBeTruthy();
    const inactiveInteraction = screen.getByRole('button', { name: '대화할 대상이 없습니다' });
    expect(inactiveInteraction.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(screen.getByRole('button', { name: '달리기 켜기' }));
    expect(screen.getByRole('button', { name: '달리기 끄기' }).props.accessibilityState.selected).toBe(true);

    const joystick = screen.getByLabelText('이동 조이스틱');
    fireEvent(joystick, 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    fireEvent(joystick, 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    fireEvent(joystick, 'accessibilityAction', { nativeEvent: { actionName: 'moveRight' } });

    const interaction = screen.getByRole('button', { name: '민수와 대화하기' });
    expect(interaction.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(interaction);

    fireEvent.press(screen.getByRole('button', { name: '대화 계속하기' }));
    expect(screen.getByText('안녕하세요. 여기는 오늘도 마을이에요.')).toBeTruthy();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    fireEvent.press(screen.getByRole('button', { name: '대화 계속하기' }));
    fireEvent.press(screen.getByRole('button', { name: '대화 계속하기' }));
    expect(screen.getByText('길을 건널 때 무엇을 먼저 확인하는지 같이 알아볼까요?')).toBeTruthy();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    fireEvent.press(screen.getByRole('button', { name: '대화 계속하기' }));
    expect(screen.getByText('횡단보도를 건너기 전에', { exact: false })).toBeTruthy();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 210));
    });
    fireEvent.press(screen.getByText('초록불인지 확인해요'));
    fireEvent.press(screen.getByRole('button', { name: '정답 확인' }));

    expect(screen.getByText('퀴즈를 마쳤어요!')).toBeTruthy();
    expect(screen.getByText('+10 XP')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '마을로 돌아가기' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });
    expect(screen.getByRole('button', { name: '민수와 대화하기' })).toBeTruthy();
    expect(screen.getByLabelText('이동 조이스틱')).toBeTruthy();
  });

  it('터치 이동 모드에서 바닥과 NPC를 직접 눌러 이동한다', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByRole('button', { name: 'Google로 시작하기' }));
    fireEvent.press(screen.getByRole('tab', { name: '게임 탭' }));
    fireEvent.press(screen.getByRole('button', { name: '오늘도 마을 들어가기' }));

    fireEvent.press(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.press(screen.getByText('터치 이동'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });
    expect(screen.queryByLabelText('이동 조이스틱')).toBeNull();

    const village = screen.getByLabelText('쿼터뷰 마을');
    fireEvent(village, 'layout', {
      nativeEvent: { layout: { height: 700, width: 375, x: 0, y: 0 } },
    });
    fireEvent.press(village, { nativeEvent: { locationX: 230, locationY: 360 } });

    fireEvent.press(screen.getByRole('button', { name: '안내원 민수로 이동해 대화하기' }));
    await waitFor(
      () => expect(screen.getByRole('button', { name: '대화 계속하기' })).toBeTruthy(),
      { timeout: 2500 },
    );
  });

  it('터치 이동 모드에서 바닥을 누르는 동안 해당 방향으로 계속 이동한다', async () => {
    const screen = render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.press(screen.getByRole('button', { name: 'Google로 시작하기' }));
    fireEvent.press(screen.getByRole('tab', { name: '게임 탭' }));
    fireEvent.press(screen.getByRole('button', { name: '오늘도 마을 들어가기' }));
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.press(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.press(screen.getByText('터치 이동'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });

    const village = screen.getByLabelText('쿼터뷰 마을');
    fireEvent(village, 'layout', {
      nativeEvent: { layout: { height: 700, width: 375, x: 0, y: 0 } },
    });
    const touch = { nativeEvent: { locationX: 320, locationY: 350, pageX: 320, pageY: 350 } };
    fireEvent(village, 'pressIn', touch);
    fireEvent(village, 'longPress', touch);
    expect(screen.getByTestId('touch-target-marker')).toBeTruthy();

    fireEvent(village, 'pressOut', touch);
    expect(screen.queryByTestId('touch-target-marker')).toBeNull();
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

  it('퀘스트를 끝내면 결과와 XP를 확인한 뒤 목록으로 돌아온다', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByRole('button', { name: 'Google로 시작하기' }));
    fireEvent.press(screen.getByRole('tab', { name: '퀘스트 탭' }));
    await waitFor(() => expect(screen.getByText('혼자 버스 타기')).toBeTruthy());
    fireEvent.press(screen.getByText('혼자 버스 타기'));

    await waitFor(() => expect(screen.getByText('목적지가 적힌 노선의 버스 번호를 확인한다.')).toBeTruthy());
    fireEvent.press(screen.getByText('목적지가 적힌 노선의 버스 번호를 확인한다.'));
    fireEvent.press(screen.getByRole('button', { name: '정답 확인' }));
    expect(screen.getByText('좋아요!')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '다음으로' }));

    fireEvent.press(screen.getByText('버스 앞 번호와 확인한 번호를 비교한다.'));
    fireEvent.press(screen.getByRole('button', { name: '정답 확인' }));
    fireEvent.press(screen.getByRole('button', { name: '다음으로' }));
    fireEvent.press(screen.getByText('교통카드를 단말기에 댄다.'));
    fireEvent.press(screen.getByRole('button', { name: '정답 확인' }));
    fireEvent.press(screen.getByRole('button', { name: '다음으로' }));
    fireEvent.press(screen.getByText('하차 버튼을 누르고 버스가 멈출 때까지 기다린다.'));
    fireEvent.press(screen.getByRole('button', { name: '정답 확인' }));
    fireEvent.press(screen.getByRole('button', { name: '결과 보기' }));

    expect(screen.getByText('혼자 버스 타기 연습을 마쳤어요!')).toBeTruthy();
    expect(screen.getByText('+20 XP')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '퀘스트 목록으로' }));
    expect(screen.getByText('추천 퀘스트')).toBeTruthy();
  });
});
