import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { MarketStaffDialogue, MarketStaffDialogueChoice } from '../src/components/game/MarketStaffDialogue';
import { MarketPanelTransition } from '../src/components/game/MarketPanelTransition';

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: jest.fn(() => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  }),
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
const choices = <MarketStaffDialogueChoice text="계산을 부탁드려요" onPress={jest.fn()} />;
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const nextLetter = async () => { await act(async () => { jest.advanceTimersByTime(17); await Promise.resolve(); }); };

it('types the greeting at village speed and exposes choices only after completing it', async () => {
  const screen = render(<MarketStaffDialogue name="종업원 1" message="안녕">{choices}</MarketStaffDialogue>);
  await flush();
  expect(screen.getByTestId('market-staff-message-text').props.children).toBe('');
  expect(screen.queryByRole('button', { name: '계산을 부탁드려요' })).toBeNull();
  expect(screen.getByTestId('market-staff-dialogue-choices', { includeHiddenElements: true }).props['aria-hidden']).toBe(true);
  await nextLetter();
  expect(screen.getByTestId('market-staff-message-text').props.children).toBe('안');
  await nextLetter();
  expect(screen.getByTestId('market-staff-message-text').props.children).toBe('안녕');
  expect(screen.getByRole('button', { name: '계산을 부탁드려요' })).toBeTruthy();
  expect(screen.getByTestId('market-staff-dialogue-choices').props['aria-hidden']).toBe(false);
  screen.unmount();
});

it('a tap completes the line without sound bursts, and changed responses type independently', async () => {
  const screen = render(<MarketStaffDialogue name="종업원 1" message="무엇을 도와드릴까요?">{choices}</MarketStaffDialogue>);
  await flush();
  fireEvent.press(screen.getByRole('button', { name: '직원 대화 계속하기' }));
  expect(screen.getByTestId('market-staff-message-text').props.children).toBe('무엇을 도와드릴까요?');
  expect(screen.getByRole('button', { name: '계산을 부탁드려요' })).toBeTruthy();
  jest.mocked(useAudioPlayer).mock.results.forEach(result => expect(result.value.play).not.toHaveBeenCalled());
  screen.rerender(<MarketStaffDialogue name="종업원 1" message="무엇을 도와드릴까요?" response="1번 계산대로 와 주세요.">{choices}</MarketStaffDialogue>);
  expect(screen.getByTestId('market-staff-response-text').props.children).toBe('');
  expect(screen.queryByRole('button', { name: '계산을 부탁드려요' })).toBeNull();
  await nextLetter();
  expect(screen.getByTestId('market-staff-response-text').props.children).toBe('1');
  fireEvent.press(screen.getByRole('button', { name: '직원 대화 계속하기' }));
  expect(screen.getByTestId('market-staff-response-text').props.children).toBe('1번 계산대로 와 주세요.');
  screen.rerender(<MarketStaffDialogue name="종업원 1" message="어떤 물건을 놓아드릴까요?">{choices}</MarketStaffDialogue>);
  expect(screen.getByTestId('market-staff-message-text').props.children).toBe('');
  expect(screen.queryByTestId('market-staff-response-text')).toBeNull();
  screen.unmount();
});

it('reduced motion immediately reveals complete text and choices without typing sounds', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
  const screen = render(<MarketStaffDialogue name="종업원 2" message="무엇을 도와드릴까요?">{choices}</MarketStaffDialogue>);
  await flush();
  expect(screen.getByTestId('market-staff-message-text').props.children).toBe('무엇을 도와드릴까요?');
  expect(screen.getByRole('button', { name: '계산을 부탁드려요' })).toBeTruthy();
  await nextLetter();
  jest.mocked(useAudioPlayer).mock.results.forEach(result => expect(result.value.play).not.toHaveBeenCalled());
  screen.unmount();
});

it('stops typing and sound immediately while the parent retains its closing animation', async () => {
  const child = <MarketStaffDialogue name="종업원 1" message="천천히 둘러보세요.">{choices}</MarketStaffDialogue>;
  const screen = render(<MarketPanelTransition visible transitionKey="staff">{child}</MarketPanelTransition>);
  await flush();
  // Finish entry before measuring the independently retained 220ms exit.
  await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); });
  await nextLetter();
  const countBefore = screen.getByTestId('market-staff-message-text').props.children;
  const players = [...new Set(jest.mocked(useAudioPlayer).mock.results.map(result => result.value))];
  players.forEach(player => { player.play.mockClear(); player.pause.mockClear(); });
  screen.rerender(<MarketPanelTransition visible={false} transitionKey="staff">{null}</MarketPanelTransition>);
  // The retained child is still present, but its activity context already stopped sound.
  expect(screen.getByTestId('market-staff-message-text', { includeHiddenElements: true }).props.children).toBe(countBefore);
  players.forEach(player => expect(player.pause).toHaveBeenCalled());
  await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); });
  players.forEach(player => expect(player.play).not.toHaveBeenCalled());
  screen.unmount();
});

it('hides layout-only message copies and unrevealed choices in actual web DOM props', async () => {
  // RNW does not translate accessibilityElementsHidden/no-hide-descendants to aria-hidden.
  const createDOMProps = require('react-native-web/dist/cjs/modules/createDOMProps');
  const screen = render(<MarketStaffDialogue name="종업원 1" message="무엇을 도와드릴까요?">{choices}</MarketStaffDialogue>);
  await flush();
  const hiddenChoices = screen.getByTestId('market-staff-dialogue-choices', { includeHiddenElements: true });
  expect(createDOMProps('div', { ...hiddenChoices.props, style: undefined })['aria-hidden']).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: '직원 대화 계속하기' }));
  expect(screen.getAllByText('무엇을 도와드릴까요?')).toHaveLength(1);
  const allCopies = screen.getAllByText('무엇을 도와드릴까요?', { includeHiddenElements: true });
  expect(allCopies).toHaveLength(2);
  const reserve = allCopies.find(copy => copy.props['aria-hidden'] === true);
  expect(reserve).toBeDefined();
  expect(createDOMProps('span', { ...reserve!.props, style: undefined })['aria-hidden']).toBe(true);
  expect(createDOMProps('div', { ...screen.getByTestId('market-staff-dialogue-choices').props, style: undefined })['aria-hidden']).toBeUndefined();
  screen.rerender(<MarketStaffDialogue name="종업원 1" message="무엇을 도와드릴까요?" response="1번 계산대로 와 주세요.">{choices}</MarketStaffDialogue>);
  const responseReserve = screen.getByText('1번 계산대로 와 주세요.', { includeHiddenElements: true });
  expect(createDOMProps('span', { ...responseReserve.props, style: undefined })['aria-hidden']).toBe(true);
  expect(createDOMProps('div', { ...screen.getByTestId('market-staff-dialogue-choices', { includeHiddenElements: true }).props, style: undefined })['aria-hidden']).toBe(true);
  screen.unmount();
});


it.each([
  '계산대에 사람이 없어요,\n계산 부탁드릴게요',
  '물건 제자리에 놓기 도움 요청',
  '아니에요, 감사합니다.',
])('선택지 %s는 내용에 맞는 폭과 줄바꿈으로 표시하며 누를 수 있다', async text => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
  const onPress = jest.fn();
  const screen = render(<MarketStaffDialogue name="종업원 1" message="무엇을 도와드릴까요?">
    <MarketStaffDialogueChoice text={text} onPress={onPress} />
  </MarketStaffDialogue>);
  await flush();
  const choice = screen.getByRole('button', { name: text });
  const style = StyleSheet.flatten(choice.props.style);
  // A full-width or fixed-height pill regresses village-sized labels and multiline access.
  expect(style.width).toBeUndefined();
  expect(style.height).toBeUndefined();
  expect(style.maxWidth).toBe('100%');
  expect(style.alignSelf).toBe('center');
  expect(style.paddingHorizontal).toBe(42);
  expect(style.minHeight).toBeGreaterThanOrEqual(44);
  const label = screen.getByText(text);
  expect(label.props.numberOfLines).toBeUndefined();
  expect(StyleSheet.flatten(label.props.style).lineHeight).toBe(20);
  fireEvent.press(choice);
  expect(onPress).toHaveBeenCalledTimes(1);
  screen.unmount();
});

it('대화가 길거나 반납 목록이 많아도 스크롤을 유지하되 등장 중 표시막대는 노출하지 않는다', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
  const screen = render(<MarketStaffDialogue name="종업원 2" message="어떤 물건을 놓아드릴까요?" bottomInset={132}>
    {Array.from({ length: 15 }, (_, index) => <MarketStaffDialogueChoice key={index}
      text={'상품 ' + (index + 1) + ' 1개 반납 부탁하기'} onPress={jest.fn()} />)}
  </MarketStaffDialogue>);
  await flush();
  const scroll = screen.getByTestId('market-staff-dialogue-scroll');
  expect(scroll.props.showsVerticalScrollIndicator).toBe(false);
  expect(scroll.props.scrollEnabled).toBe(true);
  expect(scroll.props.bounces).toBe(false);
  expect(scroll.props.overScrollMode).toBe('never');
  expect(StyleSheet.flatten(scroll.props.style).maxHeight).toBe('100%');
  expect(screen.getAllByRole('button', { name: /반납 부탁하기$/ })).toHaveLength(15);
  expect(screen.getByRole('button', { name: '상품 15 1개 반납 부탁하기' })).toBeTruthy();
  screen.unmount();
});

it('마을과 같은 200ms 선택지 등장을 문장 완료마다 실행하고 새 답변에서는 이전 애니메이션을 멈춘다', async () => {
  const realTiming = Animated.timing;
  const choiceAnimations: { config: Parameters<typeof Animated.timing>[1]; stop: jest.Mock }[] = [];
  jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    const animation = realTiming(value, config);
    if (config.duration !== 200) return animation;
    const stop = jest.fn(() => animation.stop());
    choiceAnimations.push({ config, stop });
    return { ...animation, stop };
  });
  const screen = render(<MarketStaffDialogue name="종업원 1" message="무엇을 도와드릴까요?">{choices}</MarketStaffDialogue>);
  await flush();
  expect(choiceAnimations).toHaveLength(0);
  fireEvent.press(screen.getByRole('button', { name: '직원 대화 계속하기' }));
  expect(choiceAnimations).toHaveLength(1);
  expect(choiceAnimations[0].config).toMatchObject({ duration: 200, toValue: 1, useNativeDriver: true });
  expect(choiceAnimations[0].config.easing?.(0.5)).toBeCloseTo(0.875); // out(cubic), as village NPC choices.
  screen.rerender(<MarketStaffDialogue name="종업원 1" message="무엇을 도와드릴까요?" response="계산을 도와드릴게요.">{choices}</MarketStaffDialogue>);
  expect(choiceAnimations[0].stop).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '계산을 부탁드려요' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '직원 대화 계속하기' }));
  expect(choiceAnimations).toHaveLength(2);
  expect(choiceAnimations[1].config).toMatchObject({ duration: 200, toValue: 1, useNativeDriver: true });
  screen.unmount();
  expect(choiceAnimations[1].stop).toHaveBeenCalled();
});
