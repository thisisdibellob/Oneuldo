import { fireEvent, render } from '@testing-library/react-native';

import { MarketEntryScreen } from '../src/components/game/MarketEntryScreen';
import { MarketHud } from '../src/components/game/MarketHud';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

it('시작 화면은 긴 정보 대신 짧은 시나리오 버튼을 보여 주고 누르면 상세를 연다', () => {
  const onPress = jest.fn();
  const screen = render(<MarketEntryScreen difficulty="exact" scenarioChip={{ label: 'S02 공원 간식', onPress }}
    onDifficultyChange={jest.fn()} onStart={jest.fn()} onHistory={jest.fn()} onExit={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: 'S02 공원 간식, 시나리오 자세히 보기' }));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: '장보기 시작' })).toBeTruthy();
});

it('간단 HUD는 위쪽 박스와 메뉴 없이 목록·장바구니 버튼만 둔다', () => {
  const screen = render(<MarketHud compact objectives={[]} budget={4000} controlMode="joystick" onControlModeChange={jest.fn()}
    onContactRequester={jest.fn()} onGiveUp={jest.fn()} onOpenCart={jest.fn()} onOpenHelp={jest.fn()} />);
  expect(screen.queryByTestId('market-hud-header')).toBeNull();
  expect(screen.queryByText('하늘마트')).toBeNull();
  for (const name of ['메뉴 열기', '장보기 포기', '이용 방법', '지영에게 전화', '터치 이동으로 변경']) {
    expect(screen.queryByRole('button', { name })).toBeNull();
  }
  expect(screen.getByRole('button', { name: '장바구니 열기' })).toBeTruthy();
});
