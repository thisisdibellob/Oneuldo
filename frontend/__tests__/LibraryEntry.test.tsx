import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { GamePrototypeScreen } from '../src/screens/GamePrototypeScreen';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => ({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn() }),
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native');
  return { GlassView: View, isLiquidGlassAvailable: () => false };
});
jest.mock('../src/screens/BusSimulationScreen', () => {
  const { View, Text, Pressable } = jest.requireActual('react-native');
  return { BusSimulationScreen: ({ entryPoint, controlMode, onStartLibrary }: {
    entryPoint: string; controlMode: string; onStartLibrary: () => void;
  }) => <View testID="library-exterior">
    <Text>{entryPoint}</Text><Text>{controlMode}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="도서관에 다시 들어가기" onPress={onStartLibrary} />
  </View> };
});
jest.mock('../src/screens/LibrarySimulationScreen', () => {
  const { View, Text, Pressable } = jest.requireActual('react-native');
  return { LibrarySimulationScreen: ({ onExit, controlMode, onControlModeChange }: {
    onExit: () => void; controlMode: string; onControlModeChange: (mode: 'touch') => void;
  }) => <View testID="library-interior">
    <Text>{controlMode}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="도서관에서 터치 이동 선택"
      onPress={() => onControlModeChange('touch')} />
    <Pressable accessibilityRole="button" accessibilityLabel="밖으로 나가기" onPress={onExit} />
  </View> };
});

beforeEach(() => { jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true); });
afterEach(() => jest.restoreAllMocks());

it('개발용 도서관 미리보기에서도 문을 나가면 도서관 외부로 이어지고 재입장 때 조작 설정을 유지한다', async () => {
  const onExit = jest.fn();
  const screen = render(<GamePrototypeScreen previewLocation="library" onExit={onExit} />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByTestId('library-interior')).toBeTruthy();
  expect(screen.getByText('joystick')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '도서관에서 터치 이동 선택' }));
  fireEvent.press(screen.getByRole('button', { name: '밖으로 나가기' }));
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByTestId('library-exterior')).toBeTruthy();
  expect(screen.getByText('library-exterior')).toBeTruthy();
  expect(screen.getByText('touch')).toBeTruthy();
  expect(screen.queryByTestId('game-viewport')).toBeNull();
  expect(screen.queryByTestId('library-interior')).toBeNull();
  expect(onExit).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: '도서관에 다시 들어가기' }));
  expect(screen.getByTestId('library-interior')).toBeTruthy();
  expect(screen.getByText('touch')).toBeTruthy();
  screen.unmount();
});

it('마을의 기존 건물은 마을회관이며 원격 도서관으로 바로 들어가는 문을 남기지 않는다', async () => {
  const screen = render(<GamePrototypeScreen onExit={jest.fn()} />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText('마을회관')).toBeTruthy();
  expect(screen.queryByTestId('village-library-portal')).toBeNull();
  expect(screen.queryByRole('button', { name: '도서관 들어가기' })).toBeNull();
  screen.unmount();
});
