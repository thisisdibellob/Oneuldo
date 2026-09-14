import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import App from '../App';
import { APP_FONT_LOAD_TIMEOUT_MS, onboardingFontAssets, remainingFontAssets } from '../src/useAppFonts';

const mockLoadedFonts = new Set<string>();
const mockRequests: { family: string; resolve: () => void; reject: (error: Error) => void }[] = [];
const mockLoadAsync = jest.fn((family: string) => new Promise<void>((resolve, reject) => {
  mockRequests.push({
    family,
    resolve: () => { mockLoadedFonts.add(family); resolve(); },
    reject,
  });
}));
const mockUnloadAsync = jest.fn((family: string) => {
  mockLoadedFonts.delete(family);
  return Promise.resolve();
});

jest.mock('expo-font', () => ({
  isLoaded: (family: string) => mockLoadedFonts.has(family),
  isLoading: () => false,
  loadAsync: (family: string) => mockLoadAsync(family),
  unloadAsync: (family: string) => mockUnloadAsync(family),
}));
jest.mock('../src/api/quest', () => ({ getQuests: () => Promise.resolve([]) }));
jest.mock('../src/screens/OnboardingScreen', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    OnboardingScreen: ({ onEnter }: { onEnter: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onEnter}><Text>로그인 시작</Text></Pressable>
    ),
  };
});
jest.mock('../src/screens/AppShell', () => {
  const { Text } = jest.requireActual('react-native');
  return { AppShell: () => <Text>앱 본문</Text> };
});
jest.mock('../src/screens/MarketSimulationScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { MarketSimulationScreen: () => <Text>마트 본문</Text> };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaProvider: View };
});

async function resolveGroup(start: number, count: number) {
  await act(async () => { mockRequests.slice(start, start + count).forEach(request => request.resolve()); });
}
async function paintAndPreload() {
  await act(async () => { jest.advanceTimersByTime(32); });
}
function useWebLocation(search: string) {
  const previousPlatform = Platform.OS;
  const previousLocation = window.location;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  Object.defineProperty(window, 'location', { configurable: true, value: { search } });
  return () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: previousPlatform });
    Object.defineProperty(window, 'location', { configurable: true, value: previousLocation });
  };
}
beforeEach(() => {
  jest.useFakeTimers();
  mockLoadedFonts.clear();
  mockRequests.length = 0;
  mockLoadAsync.mockClear();
  mockUnloadAsync.mockClear();
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('로그인에 쓰는 3개 폰트만 먼저 기다리고, 나머지 폰트는 첫 화면 이후 불러온다', async () => {
  const screen = render(<App />);
  expect(mockRequests.map(request => request.family).sort()).toEqual(['LaundryGothic', 'LaundryGothic-Bold', 'Pretendard-Bold']);
  expect(screen.getByText('오늘도를 준비하고 있어요')).toBeTruthy();

  await resolveGroup(0, 3);
  expect(screen.getByRole('button', { name: '로그인 시작' })).toBeTruthy();
  expect(mockLoadAsync).toHaveBeenCalledTimes(3);

  await paintAndPreload();
  const backgroundFamilies = mockRequests.slice(3).map(request => request.family);
  expect(backgroundFamilies).toHaveLength(8);
  expect(backgroundFamilies).toContain('KyoboHandwriting');
  expect(backgroundFamilies.some(name => name in onboardingFontAssets)).toBe(false);

  fireEvent.press(screen.getByRole('button', { name: '로그인 시작' }));
  expect(screen.getByText('화면을 준비하고 있어요')).toBeTruthy();
  expect(screen.queryByText('앱 본문')).toBeNull();
  await resolveGroup(3, 8);
  expect(screen.getByText('앱 본문')).toBeTruthy();
});

it('이미 준비된 11개 폰트는 다시 요청하거나 로그인 진입을 지연하지 않는다', async () => {
  [...Object.keys(onboardingFontAssets), ...Object.keys(remainingFontAssets)].forEach(name => mockLoadedFonts.add(name));
  const screen = render(<App />);
  fireEvent.press(screen.getByRole('button', { name: '로그인 시작' }));
  expect(screen.getByText('앱 본문')).toBeTruthy();
  await paintAndPreload();
  expect(mockLoadAsync).not.toHaveBeenCalled();
});

it('멈춘 로딩은 30초 뒤 재시도를 표시하며 진행 중 요청을 성공한 것으로 오인하지 않는다', async () => {
  const screen = render(<App />);
  await act(async () => { jest.advanceTimersByTime(APP_FONT_LOAD_TIMEOUT_MS); });
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('button', { name: '로그인 시작' })).toBeNull();
  expect(mockLoadAsync).toHaveBeenCalledTimes(3);
  await resolveGroup(0, 3);
  expect(screen.getByRole('button', { name: '로그인 시작' })).toBeTruthy();
});

it('네이티브 본문 폰트 실패는 웹 전용 unloadAsync 없이 재시도한다', async () => {
  const screen = render(<App />);
  await resolveGroup(0, 3);
  await paintAndPreload();
  await act(async () => { mockRequests[3].reject(new Error('network failed')); });
  await resolveGroup(4, 7);
  expect(screen.getByRole('button', { name: '로그인 시작' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '로그인 시작' }));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.queryByText('앱 본문')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  await paintAndPreload();
  expect(mockUnloadAsync).not.toHaveBeenCalled();
  expect(mockRequests).toHaveLength(19);
  await resolveGroup(11, 8);
  expect(screen.getByText('앱 본문')).toBeTruthy();
});

it('웹에서 일부 폰트 실패 후에도 진행 중인 폰트를 지우지 않으며 모두 종료된 후 재시도한다', async () => {
  const restore = useWebLocation('');
  try {
    const screen = render(<App />);
    await act(async () => { mockRequests[0].reject(new Error('network failed')); });
    await act(async () => { jest.advanceTimersByTime(APP_FONT_LOAD_TIMEOUT_MS); });
    fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
    expect(mockUnloadAsync).not.toHaveBeenCalled();
    expect(mockLoadAsync).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('button', { name: '로그인 시작' })).toBeNull();

    await resolveGroup(1, 2);
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
    await act(async () => { await Promise.resolve(); });
    expect(mockUnloadAsync).toHaveBeenCalledTimes(3);
    expect(mockLoadAsync).toHaveBeenCalledTimes(6);
    await resolveGroup(3, 3);
    expect(screen.getByRole('button', { name: '로그인 시작' })).toBeTruthy();
  } finally {
    restore();
  }
});

it('개발용 마트 바로가기도 모든 폰트가 준비되기 전에는 본문을 표시하지 않는다', async () => {
  const restore = useWebLocation('?marketLab=1');
  try {
    const screen = render(<App />);
    expect(screen.getByText('화면을 준비하고 있어요')).toBeTruthy();
    await resolveGroup(0, 3);
    expect(screen.queryByText('마트 본문')).toBeNull();
    expect(screen.queryByText('로그인 시작')).toBeNull();
    await paintAndPreload();
    await resolveGroup(3, 8);
    expect(screen.getByText('마트 본문')).toBeTruthy();
  } finally {
    restore();
  }
});
