import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { BackHandler, StyleSheet } from 'react-native';

import { MarketShelfScene } from '../src/components/game/MarketShelfScene';
import { createMarketEnvironment, getMarketWrongWayRearm, type MarketEnvironmentStationId } from '../src/game/marketEnvironment';
import { createMarketSession, type MarketSessionConfig } from '../src/game/marketSession';
import { getMarketProduct } from '../src/game/scenarios';
import { evaluateMarketProductDrop, MarketInteractionRequest, MarketSimulationScreen, type MarketSimulationScreenProps } from '../src/screens/MarketSimulationScreen';

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  },
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

const CASHIER_REQUEST_TEXT = '계산대에 사람이 없어요,\n계산 부탁드릴게요';

function finishStaffLine(screen: ReturnType<typeof render>) {
  const dialogue = screen.queryByRole('button', { name: '직원 대화 계속하기' });
  if (dialogue && !dialogue.props.accessibilityState?.disabled) fireEvent.press(dialogue);
}

async function finishTransition() {
  await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); });
}

function setup(config: Partial<MarketSessionConfig> = {}, cashierCount: 0 | 1 | 2 = 2, extraProps: Partial<MarketSimulationScreenProps> = {}) {
  const environment = createMarketEnvironment({ seed: 'screen-replay', employeeCount: 1, customerCount: 1, cashierCount, kioskLane: 'none', ...config.environment });
  const initialConfig: Partial<MarketSessionConfig> = {
    seed: environment.seed, learning: { stockoutEnabled: false, budgetChoiceEnabled: false }, difficulty: 'exact', objectives: [{ productId: 'milk', quantity: 2 }], ...config,
  };
  const playerPositionRef = { current: { ...environment.spawn } };
  const playerMovementListenerRef: NonNullable<MarketSimulationScreenProps['playerMovementListenerRef']> = { current: null };
  const callbacks = { onExit: jest.fn(), onLockChange: jest.fn(), onMissionComplete: jest.fn(), onCashierCalled: jest.fn(), onEpisodeComplete: jest.fn() };
  let request: MarketInteractionRequest | null = null;
  let requestId = 0;
  let externalMenuOpen = false;
  const element = () => <MarketSimulationScreen embedded environment={environment} initialConfig={initialConfig}
    interactionRequest={request} playerPositionRef={playerPositionRef} playerMovementListenerRef={playerMovementListenerRef} {...callbacks} {...extraProps} externalMenuOpen={externalMenuOpen} />;
  const screen = render(element());
  const setExternalMenuOpen = (open: boolean) => { externalMenuOpen = open; screen.rerender(element()); };
  const start = async () => {
    fireEvent.press(screen.getByRole('button', { name: '다음' }));
    fireEvent.press(screen.getByRole('button', { name: '장보기 시작' }));
    await finishTransition();
  };
  const station = async (id: MarketEnvironmentStationId, approach = true) => {
    if (approach) playerPositionRef.current = { ...environment.stations[id] };
    request = { id: ++requestId, station: id }; screen.rerender(element());
    await act(async () => { await Promise.resolve(); });
    if (id.startsWith('staff:')) finishStaffLine(screen);
  };
  const contactRequester = async () => {
    request = { id: ++requestId, station: 'contact-requester' }; screen.rerender(element());
    await act(async () => { await Promise.resolve(); });
    finishStaffLine(screen);
  };
  const requestGiveUp = async () => {
    request = { id: ++requestId, station: 'give-up' }; screen.rerender(element());
    await act(async () => { await Promise.resolve(); });
  };
  const add = (id: string, count = 1) => {
    for (let index = 0; index < count; index++) act(() => { expect(screen.UNSAFE_getByType(MarketShelfScene).props.onDropProduct(id)).toBe(true); });
  };
  const closeShelf = async () => {
    fireEvent.press(screen.getAllByRole('button', { name: '진열대 닫기' })[0]);
    // Advance the 180ms exit explicitly instead of racing wall-clock frames.
    await finishTransition();
    await waitFor(() => expect(screen.queryByTestId('market-shelf-scene')).toBeNull());
  };
  return { screen, environment, initialConfig, playerPositionRef, playerMovementListenerRef, setExternalMenuOpen, start, station, contactRequester, requestGiveUp, add, closeShelf, ...callbacks };
}

describe('마트 장보기의 최종 결정과 재시도', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });
  it('마트 HUD는 마을 시간·코인 아래 중앙에 있고 외부 메뉴의 입력을 소비하지 않는다', async () => {
    const game = setup({}, 0, { controlMode: 'joystick', onControlModeChange: jest.fn() });
    try {
      await game.start();
      expect(StyleSheet.flatten(game.screen.getByTestId('market-hud').props.style)).toMatchObject({
        top: 112, left: 0, right: 0, alignItems: 'center',
      });
      expect(game.screen.queryByRole('button', { name: '터치 이동으로 변경' })).toBeNull();
      expect(game.onLockChange).toHaveBeenLastCalledWith(false);
      game.onLockChange.mockClear();
      game.setExternalMenuOpen(true);
      expect(game.screen.queryByTestId('market-hud')).toBeNull();
      await game.station(`staff:${game.environment.employees[0].id}`);
      expect(game.screen.queryByTestId('market-staff-dialogue')).toBeNull();
      expect(game.onLockChange).not.toHaveBeenCalled();
      game.setExternalMenuOpen(false);
      expect(game.screen.getByTestId('market-hud')).toBeTruthy();
      expect(game.screen.queryByTestId('market-staff-dialogue')).toBeNull();
      await game.station(`staff:${game.environment.employees[0].id}`);
      expect(game.screen.getByTestId('market-staff-dialogue')).toBeTruthy();
      expect(game.screen.getByRole('header', { name: game.environment.employees[0].label })).toBeTruthy();
      expect(StyleSheet.flatten(game.screen.getByTestId('market-staff-dialogue-card').props.style))
        .toMatchObject({ borderRadius: 22, backgroundColor: 'rgba(75,75,75,0.90)' });
      fireEvent.press(game.screen.getByRole('button', { name: '아니에요, 감사합니다.' }));
      await finishTransition();
      expect(game.screen.queryByTestId('market-staff-dialogue')).toBeNull();
      expect(game.screen.getByTestId('market-hud')).toBeTruthy();
    } finally { game.screen.unmount(); }
  });

  it('직원 대화의 뒤로 가기는 반납 선택지와 대화만 차례로 닫고 명시적인 포기만 게임을 끝낸다', async () => {
    const backEvents = jest.spyOn(BackHandler, 'addEventListener');
    const game = setup({}, 0);
    const staff = `staff:${game.environment.employees[0].id}` as const;
    const goBack = () => {
      const handler = backEvents.mock.calls.filter(([event]) => event === 'hardwareBackPress').at(-1)?.[1];
      expect(handler).toBeDefined();
      act(() => { expect(handler!({ type: 'hardwareBackPress', timeStamp: Date.now() })).toBe(true); });
    };
    try {
      await game.start();
      await game.station('fresh'); game.add('milk'); await game.closeShelf();
      await game.station(staff);
      fireEvent.press(game.screen.getByRole('button', { name: '물건 제자리에 놓기 도움 요청' }));
      finishStaffLine(game.screen);

      goBack();
      finishStaffLine(game.screen);
      expect(game.screen.getByText('무엇을 도와드릴까요?')).toBeTruthy();
      expect(game.screen.queryByRole('button', { name: '흰 우유 1개 반납 부탁하기' })).toBeNull();
      expect(game.screen.getByRole('button', { name: '물건 제자리에 놓기 도움 요청' })).toBeTruthy();
      expect(game.screen.queryByText('실패 (포기)')).toBeNull();

      goBack();
      await finishTransition();
      expect(game.screen.queryByTestId('market-staff-dialogue')).toBeNull();
      expect(game.screen.getByTestId('market-hud')).toBeTruthy();
      expect(game.onEpisodeComplete).not.toHaveBeenCalled();
      fireEvent.press(game.screen.getByRole('button', { name: '장바구니 열기' }));
      expect(within(game.screen.getByTestId('market-cart-contents')).getByText('흰 우유')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '계속 고르기' }));
      await finishTransition();

      await game.station(staff);
      expect(game.screen.queryByRole('button', { name: '장보기 포기' })).toBeNull();
      fireEvent.press(game.screen.getByRole('button', { name: '아니에요, 감사합니다.' }));
      await finishTransition();
      expect(game.onEpisodeComplete).not.toHaveBeenCalled();
      fireEvent.press(game.screen.getByRole('button', { name: '장보기 포기' }));
      expect(game.screen.getByText('실패 (포기)')).toBeTruthy();
      expect(game.screen.getByText('구매 시도 0회')).toBeTruthy();
    } finally {
      game.screen.unmount();
      backEvents.mockRestore();
    }
  });

  it('임베디드 HUD의 상단 여백은 부모 화면에서 지정할 수 있다', async () => {
    const game = setup({}, 2, { hudTopInset: 148 });
    try {
      await game.start();
      expect(StyleSheet.flatten(game.screen.getByTestId('market-hud').props.style).top).toBe(148);
    } finally { game.screen.unmount(); }
  });

  it.each([0, 1, 2] as const)('계산원 %i명 배치 상태를 두 계산대에 각각 적용하고 방문만으로 호출하지 않는다', async cashierCount => {
    const game = setup({}, cashierCount); await game.start();
    try {
      for (const counter of game.environment.checkouts) {
        await game.station(counter.id);
        expect(game.screen.queryByRole('button', { name: '구매 확정' }) !== null).toBe(counter.cashierPresent);
        expect(game.screen.queryByText('계산원이 자리를 비웠어요') !== null).toBe(!counter.cashierPresent);
        fireEvent.press(game.screen.getByRole('button', { name: counter.cashierPresent ? '다시 고르기' : '계산대 다시 살펴보기' }));
        await finishTransition();
      }
      expect(game.onCashierCalled).not.toHaveBeenCalled();
    } finally { game.screen.unmount(); }
  });

  it('빈 2번을 먼저 방문해도 직원에게 일반 요청을 하면 안내받은 1번에서 정상 구매를 완료한다', async () => {
    const game = setup({ objectives: [{ productId: 'milk', quantity: 1 }] }, 0);
    await game.start(); await game.station('fresh'); game.add('milk'); await game.closeShelf();
    try {
      await game.station('checkout-2');
      expect(game.screen.getByText('계산원이 자리를 비웠어요')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '계산대 다시 살펴보기' }));
      await finishTransition();
      await game.station(`staff:${game.environment.employees[0].id}`);
      fireEvent.press(game.screen.getByRole('button', { name: CASHIER_REQUEST_TEXT }));
      finishStaffLine(game.screen);
      expect(game.onCashierCalled).toHaveBeenLastCalledWith({ checkout: true, 'checkout-2': false });
      expect(game.screen.getByText('1번 계산대로 와 주세요. 계산을 도와드릴게요.')).toBeTruthy();
      expect(game.screen.queryByRole('button', { name: CASHIER_REQUEST_TEXT })).toBeNull();
      fireEvent.press(game.screen.getByRole('button', { name: '아니에요, 감사합니다.' })); await finishTransition();
      await game.station('checkout');
      fireEvent.press(game.screen.getByRole('button', { name: '구매 확정' }));
      expect(game.screen.getByText('장보기에 성공했어요!')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '평가 건너뛰기' }));
      expect(game.onEpisodeComplete.mock.calls[0][0]).toMatchObject({ paid: true, selectedCheckoutId: 'checkout', cashierAvailability: { checkout: true, 'checkout-2': false } });
      expect(game.onCashierCalled).toHaveBeenCalledTimes(1);
    } finally { game.screen.unmount(); }
  });

  it('입구 경보선을 넘으면 10점 감점과 안내를 보이고 경계 왕복은 중복 감점하지 않는다', async () => {
    const game = setup(); await game.start(); await game.station('fresh'); game.add('milk'); await game.closeShelf();
    const move = async (y: number) => {
      game.playerPositionRef.current = { x: game.environment.entrance.point.x, y };
      await act(async () => { jest.advanceTimersByTime(500); await Promise.resolve(); });
    };
    try {
      await move(game.environment.entrance.alarmBoundaryY - 15); expect(game.screen.getByLabelText('현재 점수 100점')).toBeTruthy();
      await move(game.environment.entrance.alarmBoundaryY + 15); expect(game.screen.getByLabelText('현재 점수 90점')).toBeTruthy();
      expect(game.screen.getByRole('alert')).toBeTruthy();
      expect(game.screen.getByText(/경보기가 울렸어요.*−10점/)).toBeTruthy();
      await move(game.environment.entrance.alarmBoundaryY - 10); await move(game.environment.entrance.alarmBoundaryY + 10);
      expect(game.screen.getByLabelText('현재 점수 90점')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '장보기 포기' }));
      expect(game.screen.getByText('최종 점수 90점 · 총 감점 10점')).toBeTruthy();
      expect(game.screen.getByText('경보기 10점 (1회) · 출구 역진입 0점 (0회) · 계산원 확인 0점')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '평가 건너뛰기' }));
      expect(game.onEpisodeComplete.mock.calls[0][0]).toMatchObject({ score: 90, penaltyPoints: 10, alarmCount: 1, paid: false });
    } finally { game.screen.unmount(); }
  });

  it('위치 수집 주기 전에 입구를 넘어 즉시 포기해도 경보와 감점을 최종 기록에 남긴다', async () => {
    const game = setup(); await game.start(); await game.station('fresh'); game.add('milk'); await game.closeShelf();
    try {
      game.playerPositionRef.current = { x: game.environment.entrance.point.x, y: game.environment.entrance.alarmBoundaryY + 15 };
      fireEvent.press(game.screen.getByRole('button', { name: '장보기 포기' }));
      expect(game.screen.getByText('최종 점수 90점 · 총 감점 10점')).toBeTruthy();
      expect(game.screen.getByText('경보기 10점 (1회) · 출구 역진입 0점 (0회) · 계산원 확인 0점')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '평가 건너뛰기' }));
      const episode = game.onEpisodeComplete.mock.calls[0][0];
      expect(episode.events.filter((event: { type: string }) => event.type === 'entrance_alarm')).toHaveLength(1);
      expect(episode.score).toBe(90);
    } finally { game.screen.unmount(); }
  });

  it.each([0, 15])('500ms 수집 사이 경보선 +%ipx까지 왕복해도 즉시 감점하고 충분히 복귀한 뒤에만 다시 감점한다', async offset => {
    const game = setup(); await game.start(); await game.station('fresh'); game.add('milk'); await game.closeShelf();
    const boundaryY = game.environment.entrance.alarmBoundaryY + offset;
    const moveImmediately = (...ys: number[]) => act(() => {
      for (const y of ys) {
        const previous = { ...game.playerPositionRef.current };
        const next = { x: game.environment.entrance.point.x, y };
        game.playerPositionRef.current = next;
        game.playerMovementListenerRef.current!(previous, next);
      }
    });
    try {
      expect(game.playerMovementListenerRef.current).toEqual(expect.any(Function));
      // Do not advance timers: the renderer reports the entire out-and-back movement before the next sample.
      moveImmediately(game.environment.entrance.alarmBoundaryY - 15, boundaryY, game.environment.entrance.alarmBoundaryY - 15);
      expect(game.screen.getByLabelText('현재 점수 90점')).toBeTruthy();
      expect(game.screen.getByText(/경보기가 울렸어요.*−10점/)).toBeTruthy();
      moveImmediately(boundaryY, game.environment.entrance.alarmBoundaryY - 15);
      expect(game.screen.getByLabelText('현재 점수 90점')).toBeTruthy();
      moveImmediately(game.environment.entrance.rearmY, game.environment.entrance.alarmBoundaryY - 15, boundaryY, game.environment.entrance.alarmBoundaryY - 15);
      expect(game.screen.getByLabelText('현재 점수 80점')).toBeTruthy();
      await act(async () => { jest.advanceTimersByTime(500); await Promise.resolve(); });
      expect(game.screen.getByLabelText('현재 점수 80점')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '장보기 포기' }));
      expect(game.screen.getByText('최종 점수 80점 · 총 감점 20점')).toBeTruthy();
      expect(game.screen.getByText('경보기 20점 (2회) · 출구 역진입 0점 (0회) · 계산원 확인 0점')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '평가 건너뛰기' }));
      const episode = game.onEpisodeComplete.mock.calls[0][0];
      expect(episode.events.filter((event: { type: string }) => event.type === 'entrance_alarm')).toHaveLength(2);
    } finally { game.screen.unmount(); }
    expect(game.playerMovementListenerRef.current).toBeNull();
  });

  it('옆문 경보기도 수집 사이의 즉시 왕복을 기록하고 매장으로 복귀해야 재감점한다', async () => {
    const game = setup(); await game.start(); await game.station('fresh'); game.add('milk'); await game.closeShelf();
    const gate = game.environment.alarmGates.find(alarm => alarm.id === 'west-door')!;
    const y = gate.gate.y + gate.gate.height / 2;
    const moveImmediately = (...xs: number[]) => act(() => {
      for (const x of xs) {
        const previous = { ...game.playerPositionRef.current };
        const next = { x, y };
        game.playerPositionRef.current = next;
        game.playerMovementListenerRef.current!(previous, next);
      }
    });
    try {
      moveImmediately(gate.boundary + 15, gate.boundary - 15, gate.boundary + 15);
      expect(game.screen.getByLabelText('현재 점수 90점')).toBeTruthy();
      moveImmediately(gate.boundary - 15, gate.boundary + 15);
      expect(game.screen.getByLabelText('현재 점수 90점')).toBeTruthy();
      moveImmediately(gate.rearm, gate.boundary + 15, gate.boundary - 15, gate.boundary + 15);
      expect(game.screen.getByLabelText('현재 점수 80점')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '장보기 포기' }));
      fireEvent.press(game.screen.getByRole('button', { name: '평가 건너뛰기' }));
      const episode = game.onEpisodeComplete.mock.calls[0][0];
      const alarms = episode.events.filter((event: { type: string }) => event.type === 'entrance_alarm');
      expect(alarms).toHaveLength(2);
      expect(alarms.every((event: { payload: { gateId: string } }) => event.payload.gateId === 'west-door')).toBe(true);
    } finally { game.screen.unmount(); }
  });

  it('점수 하한에 도달한 경보 안내는 설정 감점 대신 실제 감점만 표시한다', async () => {
    const game = setup({ alarmPenaltyPoints: 65 }); await game.start(); await game.station('fresh'); game.add('milk'); await game.closeShelf();
    const move = async (y: number) => {
      game.playerPositionRef.current = { x: game.environment.entrance.point.x, y };
      await act(async () => { jest.advanceTimersByTime(500); await Promise.resolve(); });
    };
    try {
      await move(game.environment.entrance.alarmBoundaryY + 15); expect(game.screen.getByText(/경보기가 울렸어요.*−65점/)).toBeTruthy();
      await move(game.environment.entrance.rearmY); await move(game.environment.entrance.alarmBoundaryY + 15);
      expect(game.screen.getByLabelText('현재 점수 0점')).toBeTruthy();
      expect(game.screen.getByText(/경보기가 울렸어요.*−35점/)).toBeTruthy();
      await move(game.environment.entrance.rearmY); await move(game.environment.entrance.alarmBoundaryY + 15);
      expect(game.screen.getByText(/경보기가 울렸어요.*−0점/)).toBeTruthy();
    } finally { game.screen.unmount(); }
  });
  it('사야 할 개수와 담은 개수를 분리하고 구매 확정 전에는 정오를 알리지 않는다', async () => {
    const game = setup(); await game.start();
    expect(within(game.screen.getByTestId('market-shopping-list')).getByText('2개')).toBeTruthy();
    await game.station('fresh');
    fireEvent.press(game.screen.getAllByRole('button', { name: '흰 우유 담기' })[0]);
    await game.closeShelf();
    expect(within(game.screen.getByTestId('market-shopping-list')).getByText('2개')).toBeTruthy();
    expect(within(game.screen.getByTestId('market-shopping-list')).queryByText(/1\s*\/\s*2/)).toBeNull();
    fireEvent.press(game.screen.getByRole('button', { name: '장바구니 열기' }));
    const cart = within(game.screen.getByTestId('market-cart-contents'));
    expect(cart.getByText('1개')).toBeTruthy(); expect(cart.queryByText('2개')).toBeNull();
    expect(cart.queryAllByRole('button')).toHaveLength(0);
    expect(cart.getByText('냉장 식품 진열대에서 내려놓기')).toBeTruthy();
    expect(game.screen.getByText('물건을 내려놓으려면 그 물건의 진열대로 돌아가요. 어렵다면 매장 종업원에게 도움을 청할 수 있어요.')).toBeTruthy();
    expect(game.screen.queryByText(/부족해요|너무 많이|구매 목록에 없어요|필요한 수량은/)).toBeNull();
    fireEvent.press(game.screen.getByRole('button', { name: '계속 고르기' }));
    await game.station('checkout');
    expect(game.screen.getByRole('header', { name: '계산 내역' })).toBeTruthy();
    expect(game.screen.queryByTestId('market-general-feedback')).toBeNull();
    expect(game.screen.queryByTestId('market-detailed-feedback')).toBeNull();
    expect(within(game.screen.getByTestId('checkout-pos')).queryByRole('button', { name: '장보기 포기' })).toBeNull();
    fireEvent.press(game.screen.getByRole('button', { name: '다시 고르기' }));
    await finishTransition();
    expect(game.screen.queryByTestId('market-staffed-checkout')).toBeNull();
    expect(game.screen.getByTestId('market-hud')).toBeTruthy();
    expect(game.screen.queryByText('실패 (포기)')).toBeNull();
    expect(game.onMissionComplete).not.toHaveBeenCalled();
    expect(game.onEpisodeComplete).not.toHaveBeenCalled();
    expect(game.onExit).not.toHaveBeenCalled();
    fireEvent.press(game.screen.getByRole('button', { name: '장보기 포기' }));
    expect(game.screen.getByText('구매 시도 0회')).toBeTruthy();
    game.screen.unmount();
  });

  it('계산원에게 잘못 찍힌 수량을 정정 요청하고 수정 내역으로 구매한다', async () => {
    const game = setup({ learning: { stockoutEnabled: false, budgetChoiceEnabled: false, checkoutReviewMode: 'overcharge' } });
    try {
      await game.start(); await game.station('fresh'); game.add('milk', 2); await game.closeShelf();
      await game.station('checkout');
      expect(within(game.screen.getByTestId('checkout-receipt')).getByText('3개')).toBeTruthy();
      expect(game.screen.getByRole('button', { name: '구매 확정' }).props.accessibilityState.disabled).toBe(false);
      expect(within(game.screen.getByTestId('checkout-receipt')).queryByText(/잘못|오류|필요한 수량/)).toBeNull();
      fireEvent.press(game.screen.getByRole('button', { name: '장바구니 확인' }));
      expect(within(game.screen.getByTestId('checkout-basket')).getByText('2개')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '계산 내역으로 돌아가기' }));
      expect(within(game.screen.getByTestId('checkout-receipt')).getByText('3개')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '개수가 잘못된 것 같아요' })); finishStaffLine(game.screen);
      fireEvent.press(game.screen.getByRole('button', { name: '흰 우유 계산 수량 확인' }));
      expect(game.screen.getByTestId('checkout-claimed-quantity').props.children).toEqual([1, '개']);
      fireEvent.press(game.screen.getByRole('button', { name: '정정 요청 수량 늘리기' }));
      fireEvent.press(game.screen.getByRole('button', { name: '수량 확인 부탁하기' })); finishStaffLine(game.screen);
      expect(game.onMissionComplete).not.toHaveBeenCalled();
      expect(game.screen.getByText('확인했어요. 흰 우유 2개로 바로잡았어요.')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '계산 내역 다시 보기' }));
      expect(within(game.screen.getByTestId('checkout-receipt')).getByText('2개')).toBeTruthy();
      expect(game.screen.getByTestId('checkout-charged-total').props.children).toBe((getMarketProduct('milk')!.price * 2).toLocaleString('ko-KR') + '원');
      fireEvent.press(game.screen.getByRole('button', { name: '구매 확정' }));
      expect(game.screen.getByText('구매 시도 1회')).toBeTruthy();
      expect(game.onMissionComplete).toHaveBeenCalledTimes(1);
      fireEvent.press(game.screen.getByRole('button', { name: '평가 건너뛰기' }));
      const episode = game.onEpisodeComplete.mock.calls[0][0];
      expect(episode.finalCart).toEqual({ milk: 2 });
      expect(episode.events.some((event: { type: string }) => event.type === 'checkout_cart_viewed')).toBe(true);
      expect(episode.events.some((event: { type: string }) => event.type === 'checkout_bill_corrected')).toBe(true);
    } finally { game.screen.unmount(); }
  });

  it('오청구를 놓친 첫 확정은 일반 안내, 같은 내역의 두 번째 확정부터 상세 안내한다', async () => {
    const game = setup({ learning: { stockoutEnabled: false, budgetChoiceEnabled: false, checkoutReviewMode: 'overcharge' } });
    try {
      await game.start(); await game.station('fresh'); game.add('milk', 2); await game.closeShelf();
      await game.station('checkout'); fireEvent.press(game.screen.getByRole('button', { name: '구매 확정' }));
      expect(game.screen.getByTestId('market-general-feedback')).toBeTruthy();
      expect(game.screen.queryByTestId('market-detailed-feedback')).toBeNull();
      expect(game.onMissionComplete).not.toHaveBeenCalled();
      fireEvent.press(game.screen.getByRole('button', { name: '1차 재시도' }));
      await game.station('checkout-2');
      expect(within(game.screen.getByTestId('checkout-receipt')).getByText('3개')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '구매 확정' }));
      expect(within(game.screen.getByTestId('market-detailed-feedback')).getByText(/계산 확인: 흰 우유/)).toBeTruthy();
      expect(game.screen.getByRole('button', { name: '2차 재시도' })).toBeTruthy();
    } finally { game.screen.unmount(); }
  });

  it('계산 내역에서 Android 뒤로 가기는 계산대만 닫고 장보기를 포기하지 않는다', async () => {
    const backEvents = jest.spyOn(BackHandler, 'addEventListener');
    const game = setup();
    try {
      await game.start(); await game.station('checkout');
      const handler = backEvents.mock.calls.filter(([event]) => event === 'hardwareBackPress').at(-1)![1];
      act(() => { expect(handler({ type: 'hardwareBackPress', timeStamp: Date.now() })).toBe(true); });
      await finishTransition();
      expect(game.screen.queryByTestId('market-staffed-checkout')).toBeNull();
      expect(game.screen.getByTestId('market-hud')).toBeTruthy();
      expect(game.screen.queryByText('실패 (포기)')).toBeNull();
    } finally { game.screen.unmount(); backEvents.mockRestore(); }
  });

  it('첫 실패는 정오만, 두 번째부터는 수정 항목을 보여주며 재시도 횟수를 제한하지 않는다', async () => {
    const game = setup(); await game.start(); await game.station('fresh'); game.add('milk'); await game.closeShelf();
    await game.station('checkout'); fireEvent.press(game.screen.getByRole('button', { name: '구매 확정' }));
    expect(game.screen.getByTestId('market-general-feedback')).toBeTruthy();
    expect(game.screen.queryByTestId('market-detailed-feedback')).toBeNull();
    expect(game.screen.queryByText(/필요한 수량은|담은 수량은/)).toBeNull();
    fireEvent.press(game.screen.getByRole('button', { name: '1차 재시도' }));
    for (let attempt = 2; attempt <= 4; attempt++) {
      await game.station('checkout'); fireEvent.press(game.screen.getByRole('button', { name: '구매 확정' }));
      expect(game.screen.getByTestId('market-detailed-feedback')).toBeTruthy();
      expect(game.screen.getByText('• 흰 우유: 필요한 수량은 2개, 담은 수량은 1개예요.')).toBeTruthy();
      if (attempt < 4) fireEvent.press(game.screen.getByRole('button', { name: attempt + '차 재시도' }));
    }
    fireEvent.press(game.screen.getAllByRole('button', { name: '장보기 포기' })[0]);
    expect(game.screen.getByText('실패 (포기)')).toBeTruthy(); expect(game.screen.getByText('구매 시도 4회')).toBeTruthy();
    expect(game.onMissionComplete).not.toHaveBeenCalled();
    fireEvent.press(game.screen.getByRole('button', { name: '평가 건너뛰기' }));
    expect(game.onEpisodeComplete).toHaveBeenCalledTimes(1);
    expect(game.onEpisodeComplete.mock.calls[0][0].outcome).toBe('gave-up');
    fireEvent.press(game.screen.getByRole('button', { name: '마트 나가기' })); expect(game.onExit).toHaveBeenCalledTimes(1);
    game.screen.unmount();
  });

  it('재시도 후 성공 횟수와 두 별점을 기록하고 완료 알림은 한 번만 보낸다', async () => {
    const game = setup(); await game.start(); await game.station('fresh'); game.add('milk'); await game.closeShelf();
    await game.station('checkout'); fireEvent.press(game.screen.getByRole('button', { name: '구매 확정' }));
    fireEvent.press(game.screen.getByRole('button', { name: '1차 재시도' }));
    await game.station('fresh'); game.add('milk'); await game.closeShelf();
    await game.station('checkout'); fireEvent.press(game.screen.getByRole('button', { name: '구매 확정' }));
    expect(game.screen.getByText('장보기에 성공했어요!')).toBeTruthy(); expect(game.screen.getByText('구매 시도 2회')).toBeTruthy();
    expect(game.onMissionComplete).toHaveBeenCalledTimes(1);
    expect(game.screen.getByRole('button', { name: '별점 남기기' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(game.screen.getByRole('button', { name: '난이도 4점' }));
    expect(game.screen.getByRole('button', { name: '별점 남기기' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(game.screen.getByRole('button', { name: '흥미 5점' }));
    fireEvent.press(game.screen.getByRole('button', { name: '별점 남기기' }));
    expect(game.screen.getByText('난이도 4점 · 흥미 5점')).toBeTruthy();
    expect(game.onEpisodeComplete).toHaveBeenCalledTimes(1);
    expect(game.onEpisodeComplete.mock.calls[0][0].ratings).toEqual({ difficulty: 4, interest: 5 });
    expect(game.onMissionComplete).toHaveBeenCalledTimes(1);
    game.screen.unmount();
  });

  it('계산원이 없으면 직원에게 접근해 계산을 요청한 뒤 계산대로 돌아온다', async () => {
    const game = setup({}, 0); await game.start(); await game.station('checkout');
    expect(game.screen.getByText('계산원이 자리를 비웠어요')).toBeTruthy();
    expect(game.screen.queryByRole('button', { name: '구매 확정' })).toBeNull();
    fireEvent.press(game.screen.getByRole('button', { name: '계산대 다시 살펴보기' }));
    const staffId = `staff:${game.environment.employees[0].id}` as const;
    game.playerPositionRef.current = { ...game.environment.spawn };
    await game.station(staffId, false);
    expect(game.screen.getByText('가까이 다가간 뒤 선택해 주세요.')).toBeTruthy();
    expect(game.onCashierCalled).not.toHaveBeenCalled();
    await game.station(staffId);
    expect(game.screen.getByText('무엇을 도와드릴까요?')).toBeTruthy();
    expect(game.onCashierCalled).not.toHaveBeenCalled();
    fireEvent.press(game.screen.getByRole('button', { name: CASHIER_REQUEST_TEXT }));
    finishStaffLine(game.screen);
    expect(game.screen.getByText('1번 계산대로 와 주세요. 계산을 도와드릴게요.')).toBeTruthy();
    expect(game.onCashierCalled).toHaveBeenCalledTimes(1);
    expect(game.onCashierCalled).toHaveBeenLastCalledWith({ checkout: true, 'checkout-2': false });
    fireEvent.press(game.screen.getByRole('button', { name: '아니에요, 감사합니다.' }));
    await game.station('checkout'); expect(game.screen.getByRole('button', { name: '구매 확정' })).toBeTruthy();
    expect(within(game.screen.getByTestId('checkout-pos')).queryByRole('button', { name: '장보기 포기' })).toBeNull();
    fireEvent.press(game.screen.getByRole('button', { name: '다시 고르기' }));
    await finishTransition();
    expect(game.screen.queryByText('실패 (포기)')).toBeNull();
    expect(game.onEpisodeComplete).not.toHaveBeenCalled();
    fireEvent.press(game.screen.getByRole('button', { name: '장보기 포기' }));
    expect(game.screen.getByText('구매 시도 0회')).toBeTruthy(); game.screen.unmount();
  });

  it.each([0, 1, 2] as const)('계산원 %i명이어도 요청은 두 줄 선택지 하나이며 수락 또는 감점 응답을 한 번 처리한다', async cashierCount => {
    const game = setup({ cashierRequestPenaltyPoints: 7 }, cashierCount);
    const staff = `staff:${game.environment.employees[0].id}` as const;
    try {
      await game.start(); await game.station(staff);
      const choices = game.screen.getAllByRole('button', { name: CASHIER_REQUEST_TEXT });
      expect(choices).toHaveLength(1);
      expect(game.screen.queryByRole('button', { name: /[12]번 계산대 계산을 부탁드려요/ })).toBeNull();
      // Dispatch a second press before React can paint the removed choice.
      act(() => { fireEvent.press(choices[0]); fireEvent.press(choices[0]); });
      finishStaffLine(game.screen);
      expect(game.screen.queryByRole('button', { name: CASHIER_REQUEST_TEXT })).toBeNull();
      if (cashierCount === 0) {
        expect(game.screen.getByText('1번 계산대로 와 주세요. 계산을 도와드릴게요.')).toBeTruthy();
        expect(game.screen.queryByTestId('market-staff-request-penalty')).toBeNull();
        expect(game.onCashierCalled).toHaveBeenCalledTimes(1);
        expect(game.onCashierCalled).toHaveBeenLastCalledWith({ checkout: true, 'checkout-2': false });
      } else {
        expect(game.screen.getByTestId('market-staff-response-text').props.children).toMatch(/계산원|직원/);
        expect(game.screen.getByText('계산원 확인 −7점')).toBeTruthy();
        expect(game.onCashierCalled).not.toHaveBeenCalled();
      }
      fireEvent.press(game.screen.getByRole('button', { name: '아니에요, 감사합니다.' })); await finishTransition();
      expect(game.screen.getByLabelText(`현재 점수 ${cashierCount === 0 ? 100 : 93}점`)).toBeTruthy();
      await game.station(staff);
      expect(game.screen.getAllByRole('button', { name: CASHIER_REQUEST_TEXT })).toHaveLength(1);
      expect(game.screen.queryByTestId('market-staff-request-penalty')).toBeNull();
      fireEvent.press(game.screen.getByRole('button', { name: '아니에요, 감사합니다.' })); await finishTransition();
      await game.requestGiveUp();
      expect(game.screen.getByTestId('market-final-score').props.children.join('')).toContain(`총 감점 ${cashierCount === 0 ? 0 : 7}점`);
      fireEvent.press(game.screen.getByRole('button', { name: '평가 건너뛰기' }));
      const episode = game.onEpisodeComplete.mock.calls[0][0];
      expect(episode).toMatchObject({ attempts: 0, paid: false, finalCart: {}, alarmCount: 0,
        score: cashierCount === 0 ? 100 : 93, penaltyPoints: cashierCount === 0 ? 0 : 7 });
      expect(episode.events.filter((event: {type:string}) => event.type === 'cashier_request_declined')).toHaveLength(cashierCount === 0 ? 0 : 1);
      expect(episode.events.filter((event: {type:string}) => event.type === 'cashier_requested')).toHaveLength(cashierCount === 0 ? 1 : 0);
    } finally { game.screen.unmount(); }
  });

  it('계산원 확인 감점을 0으로 설정하면 안내는 하되 점수를 깎지 않는다', async () => {
    const game = setup({ cashierRequestPenaltyPoints: 0 }, 2);
    try {
      await game.start(); await game.station(`staff:${game.environment.employees[0].id}`);
      fireEvent.press(game.screen.getByRole('button', { name: CASHIER_REQUEST_TEXT })); finishStaffLine(game.screen);
      expect(game.screen.getByText('계산원 확인 · 감점 없음')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '아니에요, 감사합니다.' })); await finishTransition();
      expect(game.screen.getByLabelText('현재 점수 100점')).toBeTruthy();
    } finally { game.screen.unmount(); }
  });

  it.each([0, 2] as const)('계산원 %i명 상태에서 직원 반납 도움은 여러 분류의 선택 수량만 돌려놓고 계산 상태를 바꾸지 않는다', async cashierCount => {
    const game = setup({ objectives: [{ productId: 'milk', quantity: 2 }, { productId: 'apple', quantity: 2 }] }, cashierCount);
    const staff = `staff:${game.environment.employees[0].id}` as const;
    try {
      await game.start();
      await game.station('fresh'); game.add('milk', 2); await game.closeShelf();
      await game.station('produce'); game.add('apple', 2); await game.closeShelf();
      await game.station(staff);
      expect(game.screen.getByText('무엇을 도와드릴까요?')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '물건 제자리에 놓기 도움 요청' }));
      finishStaffLine(game.screen);
      expect(game.screen.getByTestId('market-staff-dialogue')).toBeTruthy();
      expect(StyleSheet.flatten(game.screen.getByTestId('market-staff-dialogue-scroll').props.style)).toMatchObject({ width: '89.333%', maxWidth: 335, maxHeight: '100%', flexGrow: 0 });
      expect(game.screen.getByRole('button', { name: '흰 우유 전부 반납 부탁하기' })).toBeTruthy();
      expect(game.screen.getByRole('button', { name: '사과 전부 반납 부탁하기' })).toBeTruthy();
      // Entering and leaving the choices is not itself a return request.
      fireEvent.press(game.screen.getByRole('button', { name: '직원 대화로 돌아가기' }));
      finishStaffLine(game.screen);
      fireEvent.press(game.screen.getByRole('button', { name: '물건 제자리에 놓기 도움 요청' }));
      finishStaffLine(game.screen);
      expect(within(game.screen.getByTestId('market-cart-contents')).getAllByText('2개')).toHaveLength(2);
      fireEvent.press(game.screen.getByRole('button', { name: '흰 우유 1개 반납 부탁하기' }));
      finishStaffLine(game.screen);
      expect(game.screen.getByText('흰 우유 1개를 제자리에 놓아드렸어요.')).toBeTruthy();
      expect(game.screen.queryByRole('button', { name: '흰 우유 전부 반납 부탁하기' })).toBeNull();
      expect(game.screen.getByRole('button', { name: '사과 전부 반납 부탁하기' })).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '사과 전부 반납 부탁하기' }));
      finishStaffLine(game.screen);
      expect(game.screen.getByText('사과 2개를 제자리에 놓아드렸어요.')).toBeTruthy();
      const remaining = within(game.screen.getByTestId('market-cart-contents'));
      expect(remaining.queryByText('사과')).toBeNull();
      expect(remaining.getByText('흰 우유')).toBeTruthy();
      expect(remaining.getByText('1개')).toBeTruthy();
      expect(game.screen.queryByText(/부족해요|너무 많이|필요한 수량은/)).toBeNull();
      fireEvent.press(game.screen.getByRole('button', { name: '흰 우유 1개 반납 부탁하기' }));
      finishStaffLine(game.screen);
      expect(game.screen.getByText('아직 담은 물건이 없어요.')).toBeTruthy();
      expect(within(game.screen.getByTestId('market-cart-contents')).queryAllByRole('button')).toHaveLength(0);
      fireEvent.press(game.screen.getByRole('button', { name: '직원 대화로 돌아가기' }));
      finishStaffLine(game.screen);
      expect(game.screen.queryByRole('button', { name: '물건 제자리에 놓기 도움 요청' })).toBeNull();
      expect(game.screen.getAllByRole('button', { name: CASHIER_REQUEST_TEXT })).toHaveLength(1);
      expect(game.screen.queryByRole('button', { name: /[12]번 계산대 계산을 부탁드려요/ })).toBeNull();
      fireEvent.press(game.screen.getByRole('button', { name: '아니에요, 감사합니다.' })); await finishTransition();
      fireEvent.press(game.screen.getByRole('button', { name: '장보기 포기' }));
      fireEvent.press(game.screen.getByRole('button', { name: '평가 건너뛰기' }));
      const episode = game.onEpisodeComplete.mock.calls[0][0];
      expect(episode).toMatchObject({ finalCart: {}, attempts: 0, score: 100, paid: false, selectedCheckoutId: null,
        cashierAvailability: { checkout: cashierCount === 2, 'checkout-2': cashierCount === 2 } });
      expect(episode.finalStock).toEqual(episode.initialStock);
      expect(episode.events.filter((event: { type: string }) => event.type === 'return_help_requested')).toEqual([
        expect.objectContaining({ payload: expect.objectContaining({ staffStation: staff, productId: 'milk', quantity: 1 }) }),
        expect.objectContaining({ payload: expect.objectContaining({ staffStation: staff, productId: 'apple', quantity: 2 }) }),
        expect.objectContaining({ payload: expect.objectContaining({ staffStation: staff, productId: 'milk', quantity: 1 }) }),
      ]);
      expect(game.onCashierCalled).not.toHaveBeenCalled();
      expect(game.onMissionComplete).not.toHaveBeenCalled();
    } finally { game.screen.unmount(); }
  });

  it('반납 도움 화면에서 실제 위치가 멀어지면 거부하고 가까이 돌아와 대화를 다시 연 뒤 반납한다', async () => {
    const game = setup();
    const staff = `staff:${game.environment.employees[0].id}` as const;
    try {
      await game.start(); await game.station('fresh'); game.add('milk'); await game.closeShelf();
      await game.station(staff);
      fireEvent.press(game.screen.getByRole('button', { name: '물건 제자리에 놓기 도움 요청' }));
      finishStaffLine(game.screen);
      game.playerPositionRef.current = { ...game.environment.spawn };
      fireEvent.press(game.screen.getByRole('button', { name: '흰 우유 1개 반납 부탁하기' }));
      finishStaffLine(game.screen);
      expect(game.screen.getByText('종업원에게 다가가 대화를 연 뒤 물건을 제자리에 놓는 도움을 요청해 주세요.')).toBeTruthy();
      expect(game.screen.queryByText('흰 우유 1개를 제자리에 놓아드렸어요.')).toBeNull();
      expect(within(game.screen.getByTestId('market-cart-contents')).getByText('1개')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '아니에요, 감사합니다.' })); await finishTransition();
      await game.station(staff);
      fireEvent.press(game.screen.getByRole('button', { name: '물건 제자리에 놓기 도움 요청' }));
      finishStaffLine(game.screen);
      fireEvent.press(game.screen.getByRole('button', { name: '흰 우유 1개 반납 부탁하기' }));
      finishStaffLine(game.screen);
      expect(game.screen.getByText('흰 우유 1개를 제자리에 놓아드렸어요.')).toBeTruthy();
      expect(game.screen.getByText('아직 담은 물건이 없어요.')).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '아니에요, 감사합니다.' })); await finishTransition();
      fireEvent.press(game.screen.getByRole('button', { name: '장보기 포기' }));
      fireEvent.press(game.screen.getByRole('button', { name: '평가 건너뛰기' }));
      const episode = game.onEpisodeComplete.mock.calls[0][0];
      expect(episode.events.filter((event: { type: string }) => event.type === 'return_help_requested')).toHaveLength(1);
      expect(episode.finalStock).toEqual(episode.initialStock);
    } finally { game.screen.unmount(); }
  });

  it('같은 부류의 다른 상품은 연습에서 통과하고 정확한 상품 조건에서는 실패한다', async () => {
    for (const difficulty of ['family', 'exact'] as const) {
      const game = setup({ difficulty, objectives: [{ productId: 'milk', quantity: 1 }] });
      const seeded = createMarketSession(game.initialConfig, game.environment);
      const milk = getMarketProduct('milk')!;
      const alternate = seeded.shelfSlots.fresh.find(id => id !== 'milk' && getMarketProduct(id)?.familyId === milk.familyId)!;
      expect(alternate).toBeTruthy(); await game.start(); await game.station('fresh'); game.add(alternate); await game.closeShelf();
      await game.station('checkout'); fireEvent.press(game.screen.getByRole('button', { name: '구매 확정' }));
      expect(game.screen.queryByText('장보기에 성공했어요!') !== null).toBe(difficulty === 'family');
      expect(game.screen.queryByTestId('market-general-feedback') !== null).toBe(difficulty === 'exact');
      game.screen.unmount();
    }
  });

  it('진열대를 닫고 포기하거나 공동 출입문으로 나갈 때 결과와 평가 건너뛰기를 제공한다', async () => {
    const game = setup(); await game.start(); await game.station('fresh');
    await game.closeShelf();
    fireEvent.press(game.screen.getByRole('button', { name: '장보기 포기' }));
    expect(game.screen.getByText('실패 (포기)')).toBeTruthy(); expect(game.screen.getByText('구매 시도 0회')).toBeTruthy();
    fireEvent.press(game.screen.getByRole('button', { name: '평가 건너뛰기' }));
    expect(game.screen.getByText('평가를 건너뛰었어요.')).toBeTruthy(); game.screen.unmount();
    const exitGame = setup(); await exitGame.start();
    for (const innerGate of ['entrance', 'exit'] as const) {
      await exitGame.station(innerGate);
      expect(exitGame.screen.queryByText('실패 (포기)')).toBeNull();
      expect(exitGame.screen.getByRole('button', { name: '장바구니 열기' })).toBeTruthy();
      expect(exitGame.onExit).not.toHaveBeenCalled();
    }
    await exitGame.station('common-door');
    expect(exitGame.screen.getByText('실패 (포기)')).toBeTruthy(); expect(exitGame.onExit).not.toHaveBeenCalled(); exitGame.screen.unmount();
  });

  it.each([false, true])('외부 종료 요청은 장보기 시작=%s 상태에서 문과 멀어도 포기 결과를 제공한다', async started => {
    const game = setup();
    try {
      if (started) await game.start();
      await game.requestGiveUp();
      expect(game.screen.getByText('실패 (포기)')).toBeTruthy();
      expect(game.screen.getByText('구매 시도 0회')).toBeTruthy();
      expect(game.onExit).not.toHaveBeenCalled();
      fireEvent.press(game.screen.getByRole('button', { name: '평가 건너뛰기' }));
      expect(game.onEpisodeComplete.mock.calls[0][0].outcome).toBe('gave-up');
    } finally { game.screen.unmount(); }
  });

  it('개수 초과와 다른 물건도 자유롭게 담되 없는 상품만 거부한다', async () => {
    expect(evaluateMarketProductDrop({ milk: 9 }, 'milk')).toEqual({ accepted: true });
    expect(evaluateMarketProductDrop({}, 'nonexistent')).toEqual({ accepted: false, reason: 'unavailable' });
    const game = setup(); await game.start(); await game.station('fresh'); game.add('milk', 4);
    const another = game.screen.UNSAFE_getByType(MarketShelfScene).props.slots.find((id: string) => id !== 'milk');
    game.add(another); expect(game.screen.queryByText(/목록에 없어요|너무 많이|수량을 다시|예산을 넘/)).toBeNull();
    expect(game.screen.UNSAFE_getByType(MarketShelfScene).props.cart).toEqual({ milk: 4, [another]: 1 }); game.screen.unmount();
  });
});


describe('직원에게 묻고 의뢰인과 상의하는 장보기', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('위치 질문 다음에는 사야 할 품목과 뒤로가기만 선택할 수 있다', async () => {
    const game = setup({ objectives: [{ productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 2 }] });
    try {
      await game.start();
      await game.station(('staff:' + game.environment.employees[0].id) as 'staff:employee-1');
      fireEvent.press(game.screen.getByRole('button', { name: '이 물건은 어디에 있나요?' }));
      finishStaffLine(game.screen);
      expect(game.screen.getByRole('button', { name: '흰 우유' })).toBeTruthy();
      expect(game.screen.getByRole('button', { name: '사과' })).toBeTruthy();
      expect(game.screen.getByRole('button', { name: '뒤로가기' })).toBeTruthy();
      expect(game.screen.queryByRole('button', { name: CASHIER_REQUEST_TEXT })).toBeNull();
      expect(game.screen.queryByRole('button', { name: '아니에요, 감사합니다.' })).toBeNull();
      fireEvent.press(game.screen.getByRole('button', { name: '흰 우유' }));
      finishStaffLine(game.screen);
      expect(game.screen.getByText(/냉장 식품 진열대에 있어요/)).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '뒤로가기' }));
      finishStaffLine(game.screen);
      expect(game.screen.getByRole('button', { name: CASHIER_REQUEST_TEXT })).toBeTruthy();
    } finally { game.screen.unmount(); }
  });

  it('품절 진열 확인 → 재고 질문 → 전화 승인으로 실제 구매 목표를 바꾼다', async () => {
    const game = setup({ objectives: [{ productId: 'milk', quantity: 1 }], learning: { stockoutEnabled: true, budgetChoiceEnabled: false } });
    try {
      await game.start();
      const staff = ('staff:' + game.environment.employees[0].id) as 'staff:employee-1';
      await game.station(staff);
      expect(game.screen.queryByRole('button', { name: '재고 있나요?' })).toBeNull();
      fireEvent.press(game.screen.getByRole('button', { name: '아니에요, 감사합니다.' })); await finishTransition();
      await game.station('fresh');
      expect(game.screen.UNSAFE_getByType(MarketShelfScene).props.stock.milk).toBe(0);
      expect(game.screen.getByLabelText('흰 우유 품절')).toBeTruthy();
      expect(game.screen.queryByRole('button', { name: '흰 우유 담기' })).toBeNull();
      act(() => { expect(game.screen.UNSAFE_getByType(MarketShelfScene).props.onDropProduct('milk')).toBe(false); });
      await game.closeShelf();
      await game.station(staff);
      fireEvent.press(game.screen.getByRole('button', { name: '재고 있나요?' })); finishStaffLine(game.screen);
      expect(game.screen.getByText(/창고에도 남아 있지 않아요/)).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '아니에요, 감사합니다.' })); await finishTransition();
      await game.contactRequester();
      const replacement = game.screen.getAllByRole('button', { name: /로 바꿔도 될까요\?/ })[0];
      const name = replacement.props.accessibilityLabel.replace('로 바꿔도 될까요?', '');
      fireEvent.press(replacement); finishStaffLine(game.screen);
      expect(game.screen.getByText(/목록에도 바꿔 적었어/)).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '통화 마치기' })); await finishTransition();
      expect(within(game.screen.getByTestId('market-shopping-list')).getByText(name)).toBeTruthy();
      expect(within(game.screen.getByTestId('market-shopping-list')).queryByText('흰 우유')).toBeNull();
    } finally { game.screen.unmount(); }
  });

  it('대체 불가 설정에서는 못 산 이유를 보고한 후에만 목록에서 제외한다', async () => {
    const game = setup({ objectives: [{ productId: 'milk', quantity: 1 }, { productId: 'apple', quantity: 1 }], learning: { stockoutEnabled: true, allowSubstitution: false, budgetChoiceEnabled: false } });
    try {
      await game.start(); await game.station('fresh'); await game.closeShelf();
      await game.station(('staff:' + game.environment.employees[0].id) as 'staff:employee-1');
      fireEvent.press(game.screen.getByRole('button', { name: '재고 있나요?' })); finishStaffLine(game.screen);
      fireEvent.press(game.screen.getByRole('button', { name: '아니에요, 감사합니다.' })); await finishTransition();
      await game.contactRequester();
      expect(game.screen.queryByRole('button', { name: /로 바꿔도 될까요\?/ })).toBeNull();
      fireEvent.press(game.screen.getByRole('button', { name: '재고가 없어서 부탁한 상품을 사지 못했어요.' })); finishStaffLine(game.screen);
      expect(game.screen.getByText(/못 산 이유를 잘 들었어/)).toBeTruthy();
      fireEvent.press(game.screen.getByRole('button', { name: '통화 마치기' })); await finishTransition();
      const list = within(game.screen.getByTestId('market-shopping-list'));
      expect(list.queryByText('흰 우유')).toBeNull();
      expect(list.getByText('사과')).toBeTruthy();
    } finally { game.screen.unmount(); }
  });

  it('빈 장바구니로 출구를 역진입해도 감점하고 공사 시 안쪽 입구를 안내한다', async () => {
    const game = setup({ environment: { entranceConstruction: true }, wrongWayPenaltyPoints: 10 });
    try {
      expect(game.screen.getByText('바깥 입구는 공사 중이에요. 안쪽 입구를 이용해 주세요.')).toBeTruthy();
      await game.start();
      const gate = game.environment.alarmGates.find(item => item.id === 'exit')!;
      const outside = { x: gate.gate.x + gate.gate.width / 2, y: gate.gate.y + gate.gate.height / 2 };
      outside[gate.axis] = getMarketWrongWayRearm(gate) + gate.outward * 10;
      const inside = { ...outside, [gate.axis]: gate.boundary - gate.outward * 15 };
      const cross = (from: typeof outside, to: typeof outside) => act(() => {
        game.playerPositionRef.current = to;
        game.playerMovementListenerRef.current!(from, to);
      });
      cross(outside, inside);
      expect(game.screen.getByLabelText('현재 점수 90점')).toBeTruthy();
      expect(game.screen.getByText(/출구로 들어왔어요.*−10점/)).toBeTruthy();
      expect(game.screen.getByText(/안쪽 입구를 이용해 주세요/)).toBeTruthy();
      const threshold = { ...outside, [gate.axis]: gate.boundary + gate.outward * 1 };
      cross(inside, threshold); cross(threshold, inside);
      expect(game.screen.getByLabelText('현재 점수 90점')).toBeTruthy();
      cross(inside, outside); cross(outside, inside);
      expect(game.screen.getByLabelText('현재 점수 80점')).toBeTruthy();
      await game.requestGiveUp();
      fireEvent.press(game.screen.getByRole('button', { name: '평가 건너뛰기' }));
      await finishTransition();
      expect(game.screen.getByText(/경보기 0점.*출구 역진입 20점/)).toBeTruthy();
    } finally { game.screen.unmount(); }
  });

});
