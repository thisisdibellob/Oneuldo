import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
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
const nextLetter = async () => { await act(async () => { jest.advanceTimersByTime(34); await Promise.resolve(); }); };

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
