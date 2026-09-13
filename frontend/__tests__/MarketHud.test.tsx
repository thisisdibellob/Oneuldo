import { fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
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

it('메모에는 구매할 개수만 표시하며 장바구니를 열기 전에는 진행 비율을 노출하지 않는다', () => {
  const screen = render(<MarketHud {...props()} />);
  try {
    const note = within(screen.getByTestId('market-shopping-list'));
    expect(note.getByText('저지방 우유')).toBeTruthy();
    expect(note.getByText('2개')).toBeTruthy();
    expect(note.getByText('AAA 건전지')).toBeTruthy();
    expect(note.getByText('1개')).toBeTruthy();
    expect(screen.getByLabelText('현재 점수 90점')).toBeTruthy();
    expect(note.queryByText(/\d+\s*\/\s*\d+/)).toBeNull();
    expect(note.queryByText(/담은|부족|완료|정답/)).toBeNull();
    expect(note.queryAllByRole('button')).toHaveLength(0);
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
      expect(style.width).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      fireEvent.press(button);
      expect(callback).toHaveBeenCalledTimes(1);
    }
    const anchor = StyleSheet.flatten(screen.getByTestId('market-hud').props.style);
    expect(anchor).toMatchObject({ left: 0, right: 0, paddingHorizontal: 12, alignItems: 'center' });
    expect(StyleSheet.flatten(screen.getByTestId('market-hud-card').props.style)).toMatchObject({ width: '100%', maxWidth: 420 });
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
    expect(StyleSheet.flatten(screen.getByTestId('market-hud').props.style).top).toBe(47);
  } finally { screen.unmount(); }
});
