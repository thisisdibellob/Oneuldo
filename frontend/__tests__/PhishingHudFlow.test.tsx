import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { GameHud } from '../src/components/game/GameHud';
import { getActivityAlbum, resetActivityAlbumForTests } from '../src/game/activityAlbum';
import { DEFAULT_GAME_PREFERENCES, updateGamePreferences } from '../src/game/gamePreferences';
import { PHISHING_SCENARIOS } from '../src/game/phishingSession';
import { clearPhishingSession, getPhishingSession, startPhishingEpisode } from '../src/game/phishingStore';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

const props = () => ({
  controlMode: 'joystick' as const,
  dailyQuests: [],
  onControlModeChange: jest.fn(),
  onEmergencyExit: jest.fn(),
  onExit: jest.fn(),
  onMenuVisibilityChange: jest.fn(),
});

async function finishMenuAnimation() {
  await act(async () => { jest.advanceTimersByTime(240); await Promise.resolve(); });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  updateGamePreferences(DEFAULT_GAME_PREFERENCES);
  clearPhishingSession();
  resetActivityAlbumForTests();
});
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('consumes a requested message screen once and does not reopen a phone the player closed', async () => {
  const callbacks = props();
  const handled = jest.fn();
  const screen = render(<GameHud {...callbacks} phoneRequest={{ key: 1, action: 'messages' }} onPhoneRequestHandled={handled} />);
  await finishMenuAnimation();
  expect(screen.getByTestId('phone-safety')).toBeTruthy();
  expect(screen.getByRole('button', { name: '연락 확인하기' })).toBeTruthy();
  expect(handled).toHaveBeenCalledTimes(1);
  expect(callbacks.onMenuVisibilityChange).toHaveBeenLastCalledWith(true);

  fireEvent.press(screen.getByRole('button', { name: '휴대폰 닫기' }));
  await finishMenuAnimation();
  expect(screen.queryByTestId('phone-screen')).toBeNull();
  screen.rerender(<GameHud {...callbacks} phoneRequest={{ key: 1, action: 'messages' }} onPhoneRequestHandled={handled} />);
  await finishMenuAnimation();
  expect(screen.queryByTestId('phone-screen')).toBeNull();
  expect(handled).toHaveBeenCalledTimes(1);

  screen.rerender(<GameHud {...callbacks} phoneRequest={{ key: 2, action: 'messages' }} onPhoneRequestHandled={handled} />);
  expect(screen.getByTestId('phone-safety')).toBeTruthy();
  expect(handled).toHaveBeenCalledTimes(2);
});

it('opens the same episode from the village diary and keeps the phone home at nine working app slots', async () => {
  const screen = render(<GameHud {...props()} />);
  await finishMenuAnimation();
  fireEvent.press(screen.getByRole('button', { name: '수첩 열기' }));
  fireEvent.press(screen.getByRole('button', { name: '수상한 연락 확인하기' }));
  expect(screen.getByTestId('phone-safety')).toBeTruthy();
  expect(getPhishingSession()).toBeNull();

  fireEvent.press(screen.getAllByRole('button', { name: '휴대폰 홈으로' })[0]);
  expect(screen.getAllByTestId('phone-home-app')).toHaveLength(9);
  expect(screen.queryByRole('button', { name: '금융' })).toBeNull();
  const messages = screen.getByRole('button', { name: '메시지' });
  expect(messages.props.accessibilityState?.disabled).not.toBe(true);
  fireEvent.press(messages);
  expect(screen.getByRole('button', { name: '연락 확인하기' })).toBeTruthy();
});

it('preserves replies and the selected episode when the phone closes and opens again', async () => {
  const callbacks = props();
  const screen = render(<GameHud {...callbacks} phoneRequest={{ key: 1, action: 'messages' }} />);
  await finishMenuAnimation();
  fireEvent.press(screen.getByRole('button', { name: '연락 확인하기' }));
  fireEvent.press(screen.getByRole('button', { name: '무슨 일인지 물어보기' }));
  const sessionId = getPhishingSession()!.id;
  expect(getPhishingSession()).toMatchObject({ status: 'active', replied: true, contactEnded: false });
  expect(screen.getByText(PHISHING_SCENARIOS['friend-scam'].followUp)).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: '휴대폰 닫기' }));
  await finishMenuAnimation();
  expect(callbacks.onMenuVisibilityChange).toHaveBeenLastCalledWith(false);
  fireEvent.press(screen.getByRole('button', { name: '휴대폰 열기' }));
  fireEvent.press(screen.getByRole('button', { name: '메시지' }));
  expect(getPhishingSession()?.id).toBe(sessionId);
  expect(screen.getByText(PHISHING_SCENARIOS['friend-scam'].followUp)).toBeTruthy();
  expect(screen.queryByRole('button', { name: '연락 확인하기' })).toBeNull();
  expect(getActivityAlbum()).toHaveLength(0);
});

it('uses the real saved-contacts page to stop the suspect conversation and verify Minsu independently', async () => {
  startPhishingEpisode('friend-scam');
  const callbacks = props();
  const call = jest.fn();
  const screen = render(<GameHud {...callbacks} onCallContact={call} />);
  await finishMenuAnimation();
  fireEvent.press(screen.getByRole('button', { name: '휴대폰 열기' }));
  fireEvent.press(screen.getByRole('button', { name: '전화' }));
  expect(screen.getByTestId('phone-contacts')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '민수에게 전화' }));

  expect(getPhishingSession()).toMatchObject({ contactEnded: true, verification: { method: 'saved-contact', verdict: 'scam' } });
  expect(screen.getByTestId('phone-safety')).toBeTruthy();
  expect(screen.getByText(PHISHING_SCENARIOS['friend-scam'].verificationText)).toBeTruthy();
  expect(call).not.toHaveBeenCalled();
  expect(callbacks.onMenuVisibilityChange).toHaveBeenLastCalledWith(true);
  expect(getActivityAlbum()).toHaveLength(0);
});

it('opens Jiyoung’s actual advice from saved contacts and resumes the episode after leaving help', async () => {
  startPhishingEpisode('authority');
  const callbacks = props();
  const call = jest.fn();
  const screen = render(<GameHud {...callbacks} onCallContact={call} />);
  await finishMenuAnimation();
  fireEvent.press(screen.getByRole('button', { name: '휴대폰 열기' }));
  fireEvent.press(screen.getByRole('button', { name: '전화' }));
  fireEvent.press(screen.getByRole('button', { name: '지영에게 전화' }));
  expect(screen.getByText(PHISHING_SCENARIOS.authority.helpText)).toBeTruthy();
  expect(getPhishingSession()).toMatchObject({ askedForHelp: true, contactEnded: false, verification: null });
  expect(call).not.toHaveBeenCalled();
  expect(callbacks.onMenuVisibilityChange).toHaveBeenLastCalledWith(true);

  fireEvent.press(screen.getByRole('button', { name: '연락을 멈추고 확인하기' }));
  expect(screen.getByRole('button', { name: '공식 연락처로 확인' })).toBeTruthy();
  expect(getPhishingSession()).toMatchObject({ contactEnded: true, verification: null });
  fireEvent.press(screen.getAllByRole('button', { name: '휴대폰 홈으로' })[0]);
  fireEvent.press(screen.getByRole('button', { name: '메시지' }));
  expect(screen.queryByText(PHISHING_SCENARIOS.authority.helpText)).toBeNull();
  expect(screen.getByRole('button', { name: '공식 연락처로 확인' })).toBeTruthy();

  fireEvent.press(screen.getAllByRole('button', { name: '휴대폰 홈으로' })[0]);
  fireEvent.press(screen.getByRole('button', { name: '전화' }));
  fireEvent.press(screen.getByRole('button', { name: '지영에게 전화' }));
  expect(screen.getByText(PHISHING_SCENARIOS.authority.helpText)).toBeTruthy();
  expect(screen.getByRole('button', { name: '확인 방법 살펴보기' })).toBeTruthy();
  expect(getPhishingSession()?.verification).toBeNull();
  expect(getActivityAlbum()).toHaveLength(0);
});

it('records the completed UI flow once even after reopening the HUD, and exposes that record in Photos', async () => {
  const callbacks = props();
  const screen = render(<GameHud {...callbacks} phoneRequest={{ key: 1, action: 'messages' }} />);
  await finishMenuAnimation();
  fireEvent.press(screen.getByRole('button', { name: '연락 확인하기' }));
  fireEvent.press(screen.getByRole('button', { name: '답장을 멈추고 확인하기' }));
  fireEvent.press(screen.getByRole('button', { name: '저장된 민수에게 전화' }));
  fireEvent.press(screen.getByRole('button', { name: '이 연락 차단하기' }));
  expect(getActivityAlbum()).toHaveLength(0);
  fireEvent.press(screen.getByRole('button', { name: '확인 마치기' }));
  expect(screen.getByTestId('phone-safety-result')).toBeTruthy();
  expect(getActivityAlbum()).toHaveLength(1);
  const completedRecord = getActivityAlbum()[0];
  expect(completedRecord).toMatchObject({ kind: 'safety', title: '민수에게 온 연락' });

  fireEvent.press(screen.getByRole('button', { name: '휴대폰 닫기' }));
  await finishMenuAnimation();
  screen.unmount();
  const reopened = render(<GameHud {...props()} />);
  await finishMenuAnimation();
  expect(getActivityAlbum()).toEqual([completedRecord]);
  fireEvent.press(reopened.getByRole('button', { name: '휴대폰 열기' }));
  fireEvent.press(reopened.getByRole('button', { name: '메시지' }));
  expect(reopened.getByTestId('phone-safety-result')).toBeTruthy();
  fireEvent.press(reopened.getAllByRole('button', { name: '휴대폰 홈으로' })[0]);
  fireEvent.press(reopened.getByRole('button', { name: '사진' }));
  fireEvent.press(reopened.getByRole('button', { name: '민수에게 온 연락 기록 열기' }));
  expect(reopened.getByText('원래 저장된 민수의 연락처로 확인했어요.')).toBeTruthy();
  expect(reopened.getByTestId('safety-activity-illustration')).toBeTruthy();
  expect(getActivityAlbum()).toEqual([completedRecord]);
});

it('hands the visit back to the world only after the phone closes, without pretending Minsu was met', async () => {
  startPhishingEpisode('friend-scam');
  const callbacks = props();
  const visit = jest.fn();
  const screen = render(<GameHud {...callbacks} phoneRequest={{ key: 1, action: 'messages' }} onVisitMinsu={visit} />);
  await finishMenuAnimation();
  fireEvent.press(screen.getByRole('button', { name: '답장을 멈추고 확인하기' }));
  fireEvent.press(screen.getByRole('button', { name: '마을에서 민수 만나기' }));
  expect(visit).not.toHaveBeenCalled();
  expect(getPhishingSession()).toMatchObject({ contactEnded: true, verification: null, status: 'active' });

  await finishMenuAnimation();
  expect(visit).toHaveBeenCalledTimes(1);
  expect(callbacks.onMenuVisibilityChange).toHaveBeenLastCalledWith(false);
  expect(callbacks.onMenuVisibilityChange.mock.invocationCallOrder.at(-1)).toBeLessThan(visit.mock.invocationCallOrder[0]);
  expect(screen.queryByTestId('phone-screen')).toBeNull();
  expect(getPhishingSession()?.verification).toBeNull();
  expect(getActivityAlbum()).toHaveLength(0);
});
