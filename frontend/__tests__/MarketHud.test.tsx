import { fireEvent, render, within } from '@testing-library/react-native';
import { Modal, StyleSheet } from 'react-native';
import { MarketHud, type MarketHudProps } from '../src/components/game/MarketHud';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

const objectives = [
  { id: 'milk', label: '저지방 우유', quantity: 2 },
  { id: 'apple', label: '사과', quantity: 3 },
  { id: 'batteries', label: 'AAA 건전지', quantity: 1 },
];

function props(overrides: Partial<MarketHudProps> = {}): MarketHudProps {
  return { objectives, score: 90, onGiveUp: jest.fn(), onOpenCart: jest.fn(), onOpenHelp: jest.fn(), ...overrides };
}

it('목록은 처음에는 숨기고 버튼으로 연 뒤 닫아도 요구 수량을 유지한다', () => {
  const onListVisibilityChange = jest.fn();
  const screen = render(<MarketHud {...props({ onListVisibilityChange })} />);
  try {
    expect(screen.queryByText('저지방 우유')).toBeNull();
    expect(screen.queryByTestId('market-shopping-list')).toBeNull();
    expect(onListVisibilityChange).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: '구매 목록 전체 보기' }));
    const note = within(screen.getByTestId('market-shopping-list-expanded'));
    expect(note.getByText('저지방 우유')).toBeTruthy();
    expect(note.getByText('2개')).toBeTruthy();
    expect(note.getByText('AAA 건전지')).toBeTruthy();
    expect(note.getByText('1개')).toBeTruthy();
    expect(note.queryByText(/\d+\s*\/\s*\d+/)).toBeNull();
    expect(note.queryByText(/담은|부족|완료|정답/)).toBeNull();
    expect(onListVisibilityChange).toHaveBeenLastCalledWith(true);
    fireEvent.press(note.getByRole('button', { name: '구매 목록 닫기' }));
    expect(screen.queryByText('저지방 우유')).toBeNull();
    expect(onListVisibilityChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByLabelText('현재 점수 90점')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '구매 목록 전체 보기' }));
    expect(within(screen.getByTestId('market-shopping-list-expanded')).getByText('2개')).toBeTruthy();
  } finally { screen.unmount(); }
});

it('44px 이상 도움·장바구니·종료 버튼이 각각 요청한 동작만 실행한다', () => {
  const callbacks = props();
  const screen = render(<MarketHud {...callbacks} />);
  try {
    for (const [label, callback] of [
      ['이용 방법', callbacks.onOpenHelp],
      ['장바구니 열기', callbacks.onOpenCart],
      ['장보기 포기', callbacks.onGiveUp],
    ] as const) {
      const button = screen.getByRole('button', { name: label });
      const style = StyleSheet.flatten(button.props.style);
      expect(style.width ?? style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      fireEvent.press(button);
      expect(callback).toHaveBeenCalledTimes(1);
    }
    const anchor = StyleSheet.flatten(screen.getByTestId('market-hud-header').props.style);
    expect(anchor).toMatchObject({ left: 0, right: 0, paddingHorizontal: 12, alignItems: 'center' });
    expect(StyleSheet.flatten(screen.getByTestId('market-hud-card').props.style)).toMatchObject({ width: '100%', maxWidth: 420 });
    expect(StyleSheet.flatten(screen.getByTestId('market-hud-card').props.style).borderWidth).toBe(0);
    expect(screen.getByTestId('market-hud-actions')).toBeTruthy();
  } finally { screen.unmount(); }
});

it('공통 HUD에서도 터치·조이스틱 이동을 왕복 전환하고 안전 영역을 유지한다', () => {
  const onControlModeChange = jest.fn();
  const common = props({ controlMode: 'joystick', onControlModeChange, topInset: 47 });
  const screen = render(<MarketHud {...common} />);
  try {
    fireEvent.press(screen.getByRole('button', { name: '터치 이동으로 변경' }));
    expect(onControlModeChange).toHaveBeenLastCalledWith('touch');
    screen.rerender(<MarketHud {...common} controlMode="touch" />);
    fireEvent.press(screen.getByRole('button', { name: '조이스틱 이동으로 변경' }));
    expect(onControlModeChange).toHaveBeenLastCalledWith('joystick');
    expect(StyleSheet.flatten(screen.getByTestId('market-hud-header').props.style).top).toBe(47);
  } finally { screen.unmount(); }
});

it('전체 목록에서 뒤쪽 네 번째 목표의 긴 규격과 구매 단위를 줄임 없이 확인하고 닫는다', () => {
  const onListVisibilityChange = jest.fn();
  const onOpenHelp = jest.fn();
  const screen = render(<MarketHud {...props({ onListVisibilityChange, onOpenHelp, objectives: [
    ...objectives, { id: 'water', label: '생수 · 500mL 페트병', quantity: 3, quantityUnit: '병' },
  ] })} />);
  try {
    expect(screen.queryByTestId('market-shopping-list-expanded')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: '구매 목록 전체 보기' }));
    const list = within(screen.getByTestId('market-shopping-list-expanded'));
    expect(list.getByText('사야 할 물품')).toBeTruthy();
    expect(list.queryByText(/물품.*종/)).toBeNull();
    expect(StyleSheet.flatten(list.getByText('생수 · 500mL 페트병').parent!.props.style).borderBottomWidth).toBeUndefined();
    expect(list.getByText('생수 · 500mL 페트병').props.numberOfLines).toBeUndefined();
    expect(list.getByText('3병')).toBeTruthy();
    expect(onListVisibilityChange).toHaveBeenLastCalledWith(true);
    expect(onOpenHelp).not.toHaveBeenCalled();
    fireEvent.press(list.getByRole('button', { name: '구매 목록 닫기' }));
    expect(screen.queryByTestId('market-shopping-list-expanded')).toBeNull();
    expect(onListVisibilityChange).toHaveBeenLastCalledWith(false);
  } finally { screen.unmount(); }
});

it('Android 뒤로 가기와 열린 목록에서 화면을 떠나는 경우도 닫기 상태를 전달한다', () => {
  const onListVisibilityChange = jest.fn();
  const screen = render(<MarketHud {...props({ onListVisibilityChange })} />);
  fireEvent.press(screen.getByRole('button', { name: '구매 목록 전체 보기' }));
  fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
  expect(screen.queryByTestId('market-shopping-list-expanded')).toBeNull();
  expect(onListVisibilityChange.mock.calls).toEqual([[true], [false]]);
  fireEvent.press(screen.getByRole('button', { name: '구매 목록 전체 보기' }));
  screen.unmount();
  expect(onListVisibilityChange.mock.calls).toEqual([[true], [false], [true], [false]]);
});
