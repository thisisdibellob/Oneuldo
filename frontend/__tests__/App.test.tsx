import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import App from '../App';
import { GamePrototypeScreen } from '../src/screens/GamePrototypeScreen';
import { MarketSimulationScreen } from '../src/screens/MarketSimulationScreen';
import { getNearestMarketStation, isMarketEnvironmentBlocked, type MarketEnvironmentStationId, type MarketEnvironment } from '../src/game/marketEnvironment';

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
    ...jest.requireActual('react-native-safe-area-context'),
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

it('게임 수첩에서 발견한 퀘스트만 제목과 이미지를 보여준다', async () => {
  const screen = render(<GamePrototypeScreen onExit={jest.fn()} />);

  fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
  expect(screen.getByText('오늘의 이야기')).toBeTruthy();
  expect(screen.getByText('퀘스트는 매일 아침 7시에 초기화돼요.')).toBeTruthy();
  expect(screen.getByLabelText('오늘 0/4 완료')).toBeTruthy();
  expect(screen.getByLabelText(/냉장고 살펴보기, 진행 중/)).toBeTruthy();
  expect(screen.getByLabelText('마을 중앙의 민수를 찾아보세요.')).toBeTruthy();
  expect(screen.getByLabelText('버스정류장의 기사님을 찾아보세요.')).toBeTruthy();
  expect(screen.getByLabelText('하늘마트의 지영을 찾아보세요.')).toBeTruthy();
  expect(screen.getAllByTestId('daily-quest-row')).toHaveLength(4);
  expect(screen.queryByText('안전하게 길 건너기')).toBeNull();
  expect(screen.queryByText('목적지 버스 찾기')).toBeNull();
  expect(screen.queryByText('장보기 목록 완성하기')).toBeNull();

  fireEvent.press(screen.getByRole('button', { name: '가방 열기' }));
  expect(screen.getByRole('tab', { name: '물건 검색' }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByRole('tab', { name: '최근 순' })).toBeTruthy();
  expect(screen.getAllByTestId('inventory-item-slot')).toHaveLength(4);
  expect(screen.getAllByTestId('inventory-empty-slot')).toHaveLength(6);
  expect(screen.getByText('4/30')).toBeTruthy();

  fireEvent.press(screen.getByRole('tab', { name: '가나다 순' }));
  expect(screen.getByRole('tab', { name: '가나다 순' }).props.accessibilityState.selected).toBe(true);
  expect(screen.getAllByTestId('inventory-item-slot')).toHaveLength(4);

  fireEvent.press(screen.getByRole('button', { name: '가방 열기' }));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 210));
  });
  expect(screen.queryByText('4/30')).toBeNull();
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

  it('민수와 일상 대화 후 의뢰를 받아 안전 퀴즈를 완료한다', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByRole('button', { name: 'Google로 시작하기' }));
    fireEvent.press(screen.getByRole('tab', { name: '게임 탭' }));

    fireEvent.press(screen.getByRole('button', { name: '오늘도 마을 들어가기' }));
    expect(screen.getByLabelText('쿼터뷰 마을')).toBeTruthy();
    expect(screen.getByLabelText('내 캐릭터')).toBeTruthy();

    expect(screen.getByLabelText('안내원 민수')).toBeTruthy();
    expect(screen.getByLabelText('기사님')).toBeTruthy();
    expect(screen.getByLabelText('지영')).toBeTruthy();
    expect(screen.getByLabelText('수진')).toBeTruthy();
    expect(screen.getByText('동쪽 버스정류장')).toBeTruthy();
    expect(screen.getByText('마트 앞 버스정류장')).toBeTruthy();
    expect(screen.getByText('주민센터')).toBeTruthy();
    expect(screen.getByText('마을 공원')).toBeTruthy();
    ['학교', '식당', '지하철역', '편의점', '노래방', 'PC방', '카페', '은행', '부동산', '도서관'].forEach(
      (landmark) => expect(screen.getByText(landmark)).toBeTruthy(),
    );
    expect(screen.getByTestId('expanded-village-layer')).toBeTruthy();
    const inactiveInteraction = screen.getByRole('button', { name: '상호작용할 대상이 없습니다' });
    expect(inactiveInteraction.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(screen.getByRole('button', { name: '달리기 켜기' }));
    expect(screen.getByRole('button', { name: '달리기 끄기' }).props.accessibilityState.selected).toBe(true);

    const joystick = screen.getByLabelText('이동 조이스틱');
    fireEvent(joystick, 'accessibilityAction', { nativeEvent: { actionName: 'moveRight' } });

    const finishLineAndContinue = async (line: string) => {
      fireEvent.press(screen.getByRole('button', { name: '대화 계속하기' }));
      expect(screen.getByText(line)).toBeTruthy();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
      });
      fireEvent.press(screen.getByRole('button', { name: '대화 계속하기' }));
    };

    const openMinsuActionChoices = async () => {
      const interaction = screen.getByRole('button', {
        name: '민수와 대화 또는 의뢰 선택하기',
      });
      expect(interaction.props.accessibilityState.disabled).toBe(false);
      fireEvent.press(interaction);
      await finishLineAndContinue('오늘도 만나서 반가워!');
      fireEvent.press(screen.getByRole('button', { name: '대화 계속하기' }));
      expect(screen.getByText('무엇을 할까요?')).toBeTruthy();
      expect(screen.getByLabelText('민수 행동 선택지')).toBeTruthy();
    };

    await openMinsuActionChoices();
    fireEvent.press(screen.getByRole('button', { name: '대화하기' }));
    await finishLineAndContinue('천천히 마을을 한 바퀴 걸어볼까?');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });

    fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
    expect(screen.getByLabelText('오늘 0/4 완료')).toBeTruthy();
    expect(screen.getByLabelText('마을 중앙의 민수를 찾아보세요.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });

    await openMinsuActionChoices();
    fireEvent.press(screen.getByRole('button', { name: '퀘스트 받기' }));
    expect(screen.getByLabelText('안전하게 길 건너기 의뢰 제안')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('민수의 의뢰 받기'));
    expect(screen.getByText('민수의 의뢰를 받았어요')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('안내 확인'));

    fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
    expect(screen.getByLabelText('오늘 0/4 완료')).toBeTruthy();
    expect(screen.getByLabelText(/안전하게 길 건너기, 진행 중/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });

    await openMinsuActionChoices();
    fireEvent.press(screen.getByRole('button', { name: '퀘스트 진행하기' }));

    await finishLineAndContinue('어, 왔구나! 오늘도 만나서 반가워.');
    await finishLineAndContinue('나는 마을을 한 바퀴 걷고 있었어.');

    fireEvent.press(screen.getByRole('button', { name: '대화 계속하기' }));
    expect(screen.getByText('너는 오늘 하루 어땠어?')).toBeTruthy();
    expect(screen.getByLabelText('오늘 하루 선택지')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '재미있는 일이 있었어' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '조금 피곤한 하루였어' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '일상 선택지를 선택해 주세요' }).props
        .accessibilityState.disabled,
    ).toBe(true);

    fireEvent.press(screen.getByRole('radio', { name: '조금 피곤한 하루였어' }));
    fireEvent.press(screen.getByRole('button', { name: '대화 계속하기' }));
    expect(
      screen.getByText('그랬구나. 오늘도 수고했어. 우리 천천히 걸어가자.'),
    ).toBeTruthy();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    fireEvent.press(screen.getByRole('button', { name: '대화 계속하기' }));

    await finishLineAndContinue('그럼 우리 같이 조금 걸을까?');
    await finishLineAndContinue('좋아! 저기 횡단보도까지 가 보자.');
    await finishLineAndContinue(
      '가는 길에 안전하게 건너는 방법도 같이 떠올려 보자.',
    );

    expect(screen.getByText('횡단보도를 건너기 전에', { exact: false })).toBeTruthy();
    expect(screen.queryByTestId('minsu-dialogue-portrait')).toBeNull();
    expect(screen.getByTestId('minsu-quiz-portrait')).toBeTruthy();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 210));
    });
    fireEvent.press(screen.getByText('초록불인지 확인해요'));

    expect(screen.getByText('퀴즈를 마쳤어요!')).toBeTruthy();
    expect(screen.getByText('+10 XP')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '마을로 돌아가기' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });
    expect(screen.getByRole('button', { name: '민수와 대화 또는 의뢰 선택하기' })).toBeTruthy();
    expect(screen.getByLabelText('이동 조이스틱')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
    expect(screen.getByLabelText('오늘 1/4 완료')).toBeTruthy();
  }, 10_000);

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
    fireEvent.press(screen.getByRole('button', { name: '대화 계속하기' }));
    expect(screen.getByText('오늘도 만나서 반가워!')).toBeTruthy();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    fireEvent.press(screen.getByRole('button', { name: '대화 계속하기' }));
    fireEvent.press(screen.getByRole('button', { name: '대화 계속하기' }));
    expect(screen.getByLabelText('민수 행동 선택지')).toBeTruthy();
    expect(screen.getByRole('button', { name: '대화하기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '퀘스트 받기' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: '대화 선택 닫기' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });
    expect(screen.queryByLabelText('민수 행동 선택지')).toBeNull();
    expect(screen.queryByText('무엇을 할까요?')).toBeNull();
  });

  it('집 냉장고에서 바나나 요거트 컵을 만들고 마을로 돌아온다', async () => {
    const screen = render(<GamePrototypeScreen onExit={jest.fn()} />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.press(screen.getByText('터치 이동'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });

    const moveOnMap = (
      map: ReturnType<typeof screen.getByLabelText>,
      actionName: string,
      steps: number,
    ) => {
      for (let step = 0; step < steps; step += 1) {
        fireEvent(map, 'accessibilityAction', { nativeEvent: { actionName } });
      }
    };

    const village = screen.getByLabelText('쿼터뷰 마을');
    moveOnMap(village, 'moveUp', 3);
    moveOnMap(village, 'moveRight', 21);
    moveOnMap(village, 'moveDown', 8);
    moveOnMap(village, 'moveRight', 4);
    fireEvent.press(screen.getByRole('button', { name: '집으로 이동해 들어가기' }));

    const home = screen.getByLabelText('집 내부 월드');
    expect(screen.getByTestId('home-world-layer')).toBeTruthy();
    expect(screen.getByText('우리 집')).toBeTruthy();
    expect(screen.getByText('냉장고')).toBeTruthy();

    moveOnMap(home, 'moveRight', 7);
    moveOnMap(home, 'moveUp', 6);
    moveOnMap(home, 'moveLeft', 11);
    moveOnMap(home, 'moveUp', 3);
    fireEvent.press(screen.getByRole('button', { name: '냉장고로 이동해 열기' }));
    expect(screen.getByLabelText('냉장고에서 할 일 선택')).toBeTruthy();
    expect(screen.getByRole('button', { name: '냉장고 살펴보기' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '바나나 요거트 컵 요리 시작' }));

    expect(screen.getByTestId('cooking-simulation-screen')).toBeTruthy();
    expect(screen.getByText('시작하기 전에 확인해요')).toBeTruthy();
    fireEvent.press(
      screen.getByRole('button', { name: '연습 모드로 바나나 요거트 컵 만들기 시작' }),
    );

    fireEvent.press(screen.getByRole('button', { name: '그릇 선택' }));
    fireEvent.press(screen.getByRole('button', { name: '숟가락 선택' }));
    fireEvent(screen.getByRole('button', { name: /바나나, 바구니로 끌기/ }), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    fireEvent(screen.getByRole('button', { name: /요거트, 바구니로 끌기/ }), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    fireEvent.press(screen.getByRole('button', { name: '다음 요리 단계' }));

    for (let count = 0; count < 3; count += 1) {
      fireEvent(
        screen.getByRole('button', { name: /바나나 껍질 아래로 벗기기/ }),
        'accessibilityAction',
        { nativeEvent: { actionName: 'activate' } },
      );
    }
    fireEvent.press(screen.getByRole('button', { name: '다음 요리 단계' }));

    for (let count = 0; count < 6; count += 1) {
      fireEvent(
        screen.getByRole('button', { name: /바나나 조각 그릇에 넣기/ }),
        'accessibilityAction',
        { nativeEvent: { actionName: 'activate' } },
      );
    }
    fireEvent.press(screen.getByRole('button', { name: '다음 요리 단계' }));

    for (let count = 0; count < 4; count += 1) {
      fireEvent(
        screen.getByRole('button', { name: /요거트 그릇에 담기/ }),
        'accessibilityAction',
        { nativeEvent: { actionName: 'activate' } },
      );
    }
    fireEvent.press(screen.getByRole('button', { name: '다음 요리 단계' }));

    fireEvent.press(screen.getByRole('button', { name: '토핑 없이 계속하기' }));
    fireEvent.press(screen.getByRole('button', { name: '다음 요리 단계' }));

    for (let count = 0; count < 3; count += 1) {
      fireEvent(
        screen.getByRole('button', { name: /숟가락으로 원 그리며 섞기/ }),
        'accessibilityAction',
        { nativeEvent: { actionName: 'activate' } },
      );
    }
    fireEvent.press(screen.getByRole('button', { name: '다음 요리 단계' }));

    fireEvent(
      screen.getByRole('button', { name: '완성한 그릇 식탁에 차리기' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'activate' } },
    );
    fireEvent.press(screen.getByRole('button', { name: '다음 요리 단계' }));

    fireEvent(
      screen.getByRole('button', { name: '바나나 껍질 음식물 통에 넣기' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'activate' } },
    );
    fireEvent(
      screen.getByRole('button', { name: '빈 요거트 컵 재활용 통에 넣기' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'activate' } },
    );
    fireEvent(
      screen.getByRole('button', { name: '사용한 숟가락 싱크대에 넣기' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'activate' } },
    );
    fireEvent(
      screen.getByRole('button', { name: '사용한 그릇 싱크대에 넣기' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'activate' } },
    );
    fireEvent(
      screen.getByRole('button', { name: '행주로 흘린 요거트 닦기' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'activate' } },
    );
    fireEvent.press(screen.getByRole('button', { name: '요리 완성하기' }));

    expect(screen.getByText('첫 요리 완성!')).toBeTruthy();
    expect(screen.getByText('만든 순서를 다시 볼까요?')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '요리를 마치고 집으로 돌아가기' }));
    expect(screen.queryByTestId('cooking-simulation-screen')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
    expect(screen.getByLabelText('오늘 0/4 완료')).toBeTruthy();
    expect(screen.getByLabelText(/냉장고 살펴보기, 진행 중/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });

    fireEvent.press(screen.getByRole('button', { name: '냉장고로 이동해 열기' }));
    fireEvent.press(screen.getByRole('button', { name: '냉장고 살펴보기' }));
    expect(screen.getByText('냉장고를 확인했어요')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('안내 확인'));

    fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
    expect(screen.getByLabelText('오늘 1/4 완료')).toBeTruthy();
    expect(screen.getByLabelText(/냉장고 살펴보기, 완료/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });

    moveOnMap(home, 'moveDown', 3);
    moveOnMap(home, 'moveRight', 11);
    moveOnMap(home, 'moveDown', 8);
    moveOnMap(home, 'moveLeft', 7);
    fireEvent.press(screen.getByRole('button', { name: '집에서 마을로 나가기' }));

    expect(screen.getByLabelText('쿼터뷰 마을')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
    expect(screen.getByLabelText('오늘 1/4 완료')).toBeTruthy();
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

  // This full-map integration walks real controls through several shelves, staff,
  // the alarm gate and checkout. Give its DOM queries a 15s wall-clock budget;
  // game time remains fake and every movement/inventory assertion is unchanged.
  it('의뢰를 받지 않고 마트 연습을 마치면 일일 완료 수에는 반영하지 않는다', async () => {
    jest.useFakeTimers();
    const screen = render(<App />);
    try {
    fireEvent.press(screen.getByRole('button', { name: 'Google로 시작하기' }));
    fireEvent.press(screen.getByRole('tab', { name: '게임 탭' }));
    fireEvent.press(screen.getByRole('button', { name: '마을에서 마트 장보기 시작' }));

    const joystick = screen.getByLabelText('이동 조이스틱');
    expect(screen.queryByTestId('market-proximity-cloud')).toBeNull();
    for (let step = 0; step < 6; step += 1) {
      fireEvent(joystick, 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    }
    for (let step = 0; step < 10; step += 1) {
      fireEvent(joystick, 'accessibilityAction', { nativeEvent: { actionName: 'moveRight' } });
    }
    expect(screen.getByTestId('market-proximity-cloud', { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '하늘마트 들어가기' }));

    expect(screen.getByText('마트에서 장보기')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '연습 환경 설정' }));
    fireEvent.press(screen.getByRole('button', { name: '연구용 상세 설정 · JSON 가져오기' }));
    fireEvent.changeText(screen.getByLabelText('장보기 설정 JSON'), JSON.stringify({
      seed: 'app-smoke-fixed-layout',
      environment: {
        shelfOrder: ['produce', 'fresh', 'household', 'meal', 'drink'], employeeCount: 1, customerCount: 1,
        employeeSlotIds: ['staff-northwest'], customerSlotIds: ['customer-west'],
        cashierCount: 2, pillarCount: 0, chairCount: 0, kioskPresent: false,
      },
    }));
    fireEvent.press(screen.getByRole('button', { name: '설정 적용' }));
    fireEvent.press(screen.getByText('다음'));
    fireEvent.press(screen.getByText('장보기 시작'));
    // Movement remains locked while the briefing's last frame fades out.
    await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); });
    await waitFor(() => expect(screen.queryByTestId('market-panel-transition', { includeHiddenElements: true })).toBeNull());
    await waitFor(() => expect(screen.getByLabelText('이동 조이스틱')).toBeTruthy());
    expect(screen.getByTestId('game-top-hud')).toBeTruthy();
    expect(screen.getByText('11:45')).toBeTruthy();
    expect(screen.getByText('515')).toBeTruthy();
    expect(screen.getByTestId('game-toolbar')).toBeTruthy();
    for (const menu of ['가방', '수첩', '휴대폰', '설정']) {
      expect(screen.getByRole('button', { name: menu + ' 열기' })).toBeTruthy();
    }
    expect(screen.getByTestId('market-hud')).toBeTruthy();
    const marketMap = screen.getByLabelText('하늘마트 내부 월드');
    const moveInsideMarket = (stationId: MarketEnvironmentStationId) => {
      // Plan on the public environment, then use real directional controls for every step.
      // Never write the position ref or inject session inventory/answers.
      const simulation = screen.UNSAFE_getByType(MarketSimulationScreen);
      const environment = simulation.props.environment as MarketEnvironment;
      const start = { ...simulation.props.playerPositionRef.current } as { x: number; y: number };
      const reached = (point: { x: number; y: number }) => stationId === 'entrance'
        ? point.x > environment.entrance.gate.x + 12 && point.x < environment.entrance.gate.x + environment.entrance.gate.width - 12
          && point.y < environment.entrance.alarmBoundaryY && point.y + 58 >= environment.entrance.alarmBoundaryY
        : getNearestMarketStation(environment, point)?.id === stationId;
      const key = (point: { x: number; y: number }) => `${point.x},${point.y}`;
      const queue = [start], parents = new Map<string, { parent: string; actionName: string } | null>([[key(start), null]]);
      let finish: string | null = null;
      for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        if (reached(current)) { finish = key(current); break; }
        for (const [dx, dy, actionName] of [[58, 0, 'moveRight'], [-58, 0, 'moveLeft'], [0, 58, 'moveDown'], [0, -58, 'moveUp']] as const) {
          const next = { x: current.x + dx, y: current.y + dy };
          if (parents.has(key(next))) continue;
          let blocked = false;
          for (let step = 1; step <= 15; step++) {
            if (isMarketEnvironmentBlocked(environment, { x: current.x + dx * step / 15, y: current.y + dy * step / 15 })) { blocked = true; break; }
          }
          if (blocked) continue;
          parents.set(key(next), { parent: key(current), actionName }); queue.push(next);
        }
      }
      expect(finish).not.toBeNull();
      const actions: string[] = [];
      for (let cursor = finish!; parents.get(cursor); cursor = parents.get(cursor)!.parent) actions.unshift(parents.get(cursor)!.actionName);
      for (const actionName of actions) fireEvent(marketMap, 'accessibilityAction', { nativeEvent: { actionName } });
      expect(reached(simulation.props.playerPositionRef.current)).toBe(true);
    };

    moveInsideMarket('fresh');
    fireEvent.press(await screen.findByRole('button', { name: '냉장 식품 살펴보기' }));
    fireEvent.press(screen.getAllByRole('button', { name: '흰 우유 담기' })[0]);
    fireEvent.press(screen.getAllByLabelText('흰 우유 한 개 더 담기')[0]);
    fireEvent.press(screen.getAllByRole('button', { name: '진열대 닫기' })[0]);
    await waitFor(() => expect(screen.queryAllByRole('button', { name: '진열대 닫기' })).toHaveLength(0));

    moveInsideMarket('produce');
    fireEvent.press(await screen.findByRole('button', { name: '과일/채소 살펴보기' }));
    fireEvent.press(screen.getAllByRole('button', { name: '사과 담기' })[0]);
    fireEvent.press(screen.getAllByLabelText('사과 한 개 더 담기')[0]);
    fireEvent.press(screen.getAllByRole('button', { name: '진열대 닫기' })[0]);
    await waitFor(() => expect(screen.queryAllByRole('button', { name: '진열대 닫기' })).toHaveLength(0));

    moveInsideMarket('meal');
    fireEvent.press(await screen.findByRole('button', { name: '간편 식품 살펴보기' }));
    fireEvent.press(screen.getAllByRole('button', { name: '순한 카레 담기' })[0]);
    fireEvent.press(screen.getAllByRole('button', { name: '진열대 닫기' })[0]);
    await waitFor(() => expect(screen.queryAllByRole('button', { name: '진열대 닫기' })).toHaveLength(0));


    // The common village controls stay available in the market without competing
    // with the shopping memo or mutating its separate cart.
    const expectShoppingCart = async () => {
      fireEvent.press(screen.getByRole('button', { name: '장바구니 열기' }));
      expect(screen.getByText('담은 물건 5개')).toBeTruthy();
      expect(screen.queryByText(/합계/)).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: '계속 고르기' }));
      await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); });
      expect(screen.queryByTestId('market-panel-transition', { includeHiddenElements: true })).toBeNull();
    };
    await expectShoppingCart();
    for (const menu of ['가방', '설정'] as const) {
      const positionBeforeMenu = { ...screen.UNSAFE_getByType(MarketSimulationScreen).props.playerPositionRef.current };
      fireEvent.press(screen.getByRole('button', { name: menu + ' 열기' }));
      expect(screen.getByTestId('game-top-hud')).toBeTruthy();
      expect(screen.getByTestId('game-toolbar')).toBeTruthy();
      expect(screen.queryByTestId('market-hud')).toBeNull();
      expect(screen.queryByLabelText('이동 조이스틱')).toBeNull();
      expect(screen.queryByRole('button', { name: '간편 식품 살펴보기' })).toBeNull();
      for (const actionName of ['moveUp', 'moveDown', 'moveLeft', 'moveRight']) {
        fireEvent(marketMap, 'accessibilityAction', { nativeEvent: { actionName } });
      }
      expect(screen.UNSAFE_getByType(MarketSimulationScreen).props.playerPositionRef.current).toEqual(positionBeforeMenu);
      if (menu === '가방') {
        expect(screen.getByRole('tab', { name: '물건 검색' })).toBeTruthy();
        // Toggle the real toolbar affordance again to close the bag.
        fireEvent.press(screen.getByRole('button', { name: '가방 열기' }));
      } else {
        expect(screen.getByText('조작법 변경')).toBeTruthy();
        fireEvent.press(screen.getByRole('radio', { name: '슬라이드 패드' }));
      }
      // Closing keeps movement locked until the overlay has actually departed.
      expect(screen.queryByTestId('market-hud')).toBeNull();
      await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); });
      expect(screen.queryByRole('button', { name: '게임 메뉴 닫기' })).toBeNull();
      expect(screen.getByTestId('market-hud')).toBeTruthy();
      expect(screen.getByLabelText('이동 조이스틱')).toBeTruthy();
      expect(screen.queryByTestId('market-shelf-scene')).toBeNull();
      expect(screen.queryByTestId('market-panel-transition', { includeHiddenElements: true })).toBeNull();
      expect(screen.UNSAFE_getByType(MarketSimulationScreen).props.playerPositionRef.current).toEqual(positionBeforeMenu);
      expect(screen.getByRole('button', { name: '간편 식품 살펴보기' })).toBeTruthy();
    }
    await expectShoppingCart();

    const environment = screen.UNSAFE_getByType(MarketSimulationScreen).props.environment as MarketEnvironment;
    moveInsideMarket(`staff:${environment.employees[0].id}`);
    fireEvent.press(await screen.findByRole('button', { name: '종업원에게 도움 요청하기' }));
    fireEvent.press(screen.getByRole('button', { name: '직원 대화 계속하기' }));
    fireEvent.press(screen.getByRole('button', { name: '물건 제자리에 놓기 도움 요청' }));
    fireEvent.press(screen.getByRole('button', { name: '직원 대화 계속하기' }));
    fireEvent.press(screen.getByRole('button', { name: '흰 우유 1개 반납 부탁하기' }));
    fireEvent.press(screen.getByRole('button', { name: '직원 대화 계속하기' }));
    expect(screen.getByText('흰 우유 1개를 제자리에 놓아드렸어요.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '흰 우유 전부 반납 부탁하기' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: '아니에요, 감사합니다.' }));
    await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); });
    await waitFor(() => expect(screen.queryByTestId('market-panel-transition', { includeHiddenElements: true })).toBeNull());

    fireEvent.press(screen.getByRole('button', { name: '장바구니 열기' }));
    expect(screen.getByText('담은 물건 4개')).toBeTruthy();
    expect(screen.queryByText(/합계/)).toBeNull();
    fireEvent.press(screen.getByText('계속 고르기'));
    await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); });
    await waitFor(() => expect(screen.queryByTestId('market-panel-transition', { includeHiddenElements: true })).toBeNull());
    await waitFor(() => expect(screen.getByLabelText('이동 조이스틱')).toBeTruthy());
    moveInsideMarket('entrance');
    // A real control-driven out-and-back trip completes before the 500ms position sampler.
    fireEvent(marketMap, 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
    fireEvent(marketMap, 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    expect(screen.getByLabelText('현재 점수 90점')).toBeTruthy();
    moveInsideMarket('checkout');
    fireEvent.press(await screen.findByRole('button', { name: '계산대에서 계산하기' }));
    fireEvent.press(screen.getByText('구매 확정'));

    expect(screen.getByText('장보기에 성공했어요!')).toBeTruthy();
    expect(screen.getByText('구매 시도 1회')).toBeTruthy();
    expect(screen.getByText('최종 점수 90점 · 총 감점 10점')).toBeTruthy();
    fireEvent.press(screen.getByText('평가 건너뛰기'));
    fireEvent.press(screen.getByText('마트 나가기'));
    await waitFor(() => expect(screen.queryByText('장보기 의뢰 완료')).toBeNull(), { timeout: 2000 });
    fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
    expect(screen.getByLabelText('오늘 0/4 완료')).toBeTruthy();
    expect(screen.getByLabelText('하늘마트의 지영을 찾아보세요.')).toBeTruthy();
    } finally {
      screen.unmount();
      jest.useRealTimers();
    }
  }, 15000);

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

  it('퀘스트를 끝내면 결과와 XP를 확인한 뒤 목록으로 돌아온다', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByRole('button', { name: 'Google로 시작하기' }));
    fireEvent.press(screen.getByRole('tab', { name: '퀘스트 탭' }));
    fireEvent.press(screen.getByText('혼자 버스 타기'));

    fireEvent.press(screen.getByText('공공 도서관 가나요?'));
    fireEvent.press(screen.getByRole('button', { name: '정답 확인' }));
    expect(screen.getByText('좋아요! 상대방이 이해하기 쉬운 말이에요.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '다음으로' }));

    fireEvent.press(screen.getByText('드림 시네마 있어요!'));
    fireEvent.press(screen.getByRole('button', { name: '정답 확인' }));
    fireEvent.press(screen.getByRole('button', { name: '결과 보기' }));

    expect(screen.getByText('대화 연습을 마쳤어요!')).toBeTruthy();
    expect(screen.getByText('+20 XP')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '퀘스트 목록으로' }));
    expect(screen.getByText('추천 퀘스트')).toBeTruthy();
  });
});
