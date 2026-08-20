import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import App from '../App';
import { GamePrototypeScreen } from '../src/screens/GamePrototypeScreen';

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
    expect(screen.getByText('주민센터')).toBeTruthy();
    expect(screen.getByText('작은 공원')).toBeTruthy();
    expect(screen.getByTestId('expanded-village-layer')).toBeTruthy();
    const inactiveInteraction = screen.getByRole('button', { name: '상호작용할 대상이 없습니다' });
    expect(inactiveInteraction.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(screen.getByRole('button', { name: '달리기 켜기' }));
    expect(screen.getByRole('button', { name: '달리기 끄기' }).props.accessibilityState.selected).toBe(true);

    const joystick = screen.getByLabelText('이동 조이스틱');
    fireEvent(joystick, 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    fireEvent(joystick, 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
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
  });

  it('집에 들어가 냉장고를 확인하고 마을로 돌아온다', async () => {
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
    moveOnMap(village, 'moveUp', 4);
    moveOnMap(village, 'moveLeft', 4);
    moveOnMap(village, 'moveUp', 2);
    fireEvent.press(screen.getByRole('button', { name: '집으로 이동해 들어가기' }));

    const home = screen.getByLabelText('집 내부 월드');
    expect(screen.getByTestId('home-world-layer')).toBeTruthy();
    expect(screen.getByText('우리 집')).toBeTruthy();
    expect(screen.getByText('냉장고')).toBeTruthy();

    moveOnMap(home, 'moveRight', 7);
    moveOnMap(home, 'moveUp', 6);
    moveOnMap(home, 'moveLeft', 11);
    moveOnMap(home, 'moveUp', 3);
    fireEvent.press(screen.getByRole('button', { name: '냉장고 확인하기' }));
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

  it('의뢰를 받지 않고 마트 연습을 마치면 일일 완료 수에는 반영하지 않는다', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByRole('button', { name: 'Google로 시작하기' }));
    fireEvent.press(screen.getByRole('tab', { name: '게임 탭' }));
    fireEvent.press(screen.getByRole('button', { name: '마을에서 마트 장보기 시작' }));

    const joystick = screen.getByLabelText('이동 조이스틱');
    expect(screen.queryByTestId('market-proximity-cloud')).toBeNull();
    for (let step = 0; step < 5; step += 1) {
      fireEvent(joystick, 'accessibilityAction', { nativeEvent: { actionName: 'moveRight' } });
    }
    for (let step = 0; step < 6; step += 1) {
      fireEvent(joystick, 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    }
    expect(screen.getByTestId('market-proximity-cloud', { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '하늘마트 들어가기' }));

    expect(screen.getByText('안녕하세요. 오늘 저녁에 필요한 물건을 같이 골라볼까요?')).toBeTruthy();
    fireEvent.press(screen.getByText('다음'));
    fireEvent.press(screen.getByText('장보기 시작'));
    const marketMap = screen.getByLabelText('하늘마트 내부 월드');
    const moveInsideMarket = (actionName: string, steps: number) => {
      for (let step = 0; step < steps; step += 1) {
        fireEvent(marketMap, 'accessibilityAction', { nativeEvent: { actionName } });
      }
    };

    moveInsideMarket('moveUp', 8);
    moveInsideMarket('moveLeft', 2);
    fireEvent.press(await screen.findByRole('button', { name: '냉장 식품 살펴보기' }));
    fireEvent.press(screen.getByRole('button', { name: '흰 우유 담기' }));
    fireEvent.press(screen.getAllByRole('button', { name: '진열대 닫기' })[0]);

    moveInsideMarket('moveRight', 4);
    fireEvent.press(await screen.findByRole('button', { name: '과일 살펴보기' }));
    fireEvent.press(screen.getByRole('button', { name: '사과 담기' }));
    fireEvent.press(screen.getByLabelText('사과 한 개 더 담기'));
    fireEvent.press(screen.getAllByRole('button', { name: '진열대 닫기' })[0]);

    moveInsideMarket('moveLeft', 4);
    moveInsideMarket('moveDown', 5);
    fireEvent.press(await screen.findByRole('button', { name: '간편 식품 살펴보기' }));
    fireEvent.press(screen.getByRole('button', { name: '순한 카레 담기' }));
    fireEvent.press(screen.getAllByRole('button', { name: '진열대 닫기' })[0]);

    fireEvent.press(screen.getByRole('button', { name: '장바구니 4개' }));
    expect(screen.getByText('7,400원')).toBeTruthy();
    fireEvent.press(screen.getByText('가방 닫기'));
    moveInsideMarket('moveRight', 2);
    moveInsideMarket('moveUp', 8);
    fireEvent.press(await screen.findByRole('button', { name: '계산대에서 계산하기' }));
    fireEvent.press(screen.getByText('목록 확인'));

    expect(screen.getByText('목록에 맞게 장보기를 마쳤어요!')).toBeTruthy();
    expect(screen.getByText('+30')).toBeTruthy();
    fireEvent.press(screen.getByText('마을로 돌아가기'));
    fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
    expect(screen.getByLabelText('오늘 0/4 완료')).toBeTruthy();
    expect(screen.getByLabelText('하늘마트의 지영을 찾아보세요.')).toBeTruthy();
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
