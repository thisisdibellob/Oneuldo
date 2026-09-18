import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { GameContactCall } from '../src/components/game/GameContactCall';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  },
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));
beforeEach(() => { jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true); });
afterEach(() => jest.restoreAllMocks());

it('민수와 마트에서 원격 대화하고 거리나 이동 버튼에 의존하지 않고 통화를 마친다', async () => {
  const onClose = jest.fn();
  const screen = render(<GameContactCall contact="minsu" inMarket onClose={onClose} />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText('민수 · 전화')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '지금 장보기를 하고 있어.' }));
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText(/지영이 부탁한 물건을 바꾸려면 지영에게 확인/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '통화 마치기' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  screen.unmount();
});

it('마트 밖에서도 지영에게 연락하여 장보기 장소를 확인한다', async () => {
  const screen = render(<GameContactCall contact="jiyoung" inMarket={false} onClose={jest.fn()} />);
  await act(async () => { await Promise.resolve(); });
  fireEvent.press(screen.getByRole('button', { name: '어디에서 장을 보면 될까요?' }));
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText(/하늘마트에서 부탁할게/)).toBeTruthy();
  screen.unmount();
});
