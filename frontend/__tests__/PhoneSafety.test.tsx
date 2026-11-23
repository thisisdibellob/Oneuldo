import { act, fireEvent, render } from '@testing-library/react-native';
import { PhoneSafety } from '../src/components/game/PhoneSafety';
import { PHISHING_SCENARIOS } from '../src/game/phishingSession';
import { clearPhishingSession, dispatchPhishingAction, getPhishingSession, startPhishingEpisode } from '../src/game/phishingStore';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
beforeEach(() => clearPhishingSession());

it('shows the actual help dialogue when arriving from the saved Jiyoung contact', () => {
  act(() => { startPhishingEpisode('friend-scam'); dispatchPhishingAction({ type: 'ASK_HELP' }); });
  const screen = render(<PhoneSafety reduceMotion initialHelp />);
  expect(screen.getByText(PHISHING_SCENARIOS['friend-scam'].helpText)).toBeTruthy();
  expect(getPhishingSession()?.verification).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '연락을 멈추고 확인하기' }));
  expect(screen.getByRole('button', { name: '저장된 민수에게 전화' })).toBeTruthy();
  act(() => { startPhishingEpisode('parcel'); });
  expect(screen.queryByText(PHISHING_SCENARIOS.parcel.helpText)).toBeNull();
  expect(screen.getByText(PHISHING_SCENARIOS.parcel.initialMessages[0])).toBeTruthy();
});

it('lets a player reply, ask for help and independently verify before completing; reopening preserves progress', () => {
  const screen = render(<PhoneSafety reduceMotion />);
  const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
  press('연락 확인하기');
  press('무슨 일인지 물어보기');
  expect(screen.getByText(PHISHING_SCENARIOS['friend-scam'].followUp)).toBeTruthy();
  expect(screen.queryByRole('button', { name: '확인 마치기' })).toBeNull();
  press('지영에게 물어보기');
  expect(screen.getByText(PHISHING_SCENARIOS['friend-scam'].helpText)).toBeTruthy();
  expect(getPhishingSession()?.askedForHelp).toBe(true);
  expect(getPhishingSession()?.verification).toBeNull();
  press('연락을 멈추고 확인하기');
  press('받은 연락 다시 보기');
  expect(screen.getByText(PHISHING_SCENARIOS['friend-scam'].initialMessages[0])).toBeTruthy();
  press('연락으로 돌아가기');
  screen.unmount();
  const reopened = render(<PhoneSafety reduceMotion />);
  fireEvent.press(reopened.getByRole('button', { name: '저장된 민수에게 전화' }));
  expect(reopened.getByText(PHISHING_SCENARIOS['friend-scam'].verificationText)).toBeTruthy();
  expect(reopened.queryByRole('button', { name: '확인 마치기' })).toBeNull();
  fireEvent.press(reopened.getByRole('button', { name: '이 연락 차단하기' }));
  fireEvent.press(reopened.getByRole('button', { name: '확인 마치기' }));
  expect(reopened.getByTestId('phone-safety-result')).toBeTruthy();
  expect(getPhishingSession()?.status).toBe('completed');
  expect(reopened.getByText('지영에게 도움을 요청했어요.')).toBeTruthy();
});

it('leaves in-person verification to the village interaction rather than completing it from the phone', () => {
  act(() => { startPhishingEpisode('friend-scam'); });
  const onVisitMinsu = jest.fn();
  const screen = render(<PhoneSafety reduceMotion onVisitMinsu={onVisitMinsu} />);
  fireEvent.press(screen.getByRole('button', { name: '답장을 멈추고 확인하기' }));
  fireEvent.press(screen.getByRole('button', { name: '마을에서 민수 만나기' }));
  expect(onVisitMinsu).toHaveBeenCalledTimes(1);
  expect(getPhishingSession()?.verification).toBeNull();
  expect(getPhishingSession()?.status).toBe('active');
});

it('requires an explicit recovery practice choice and supports urgent reporting before verification', () => {
  act(() => { startPhishingEpisode('authority'); });
  const screen = render(<PhoneSafety reduceMotion />);
  const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
  press('이미 응했다면 연습');
  press('돈을 보낸 상황');
  expect(getPhishingSession()?.exposure).toBe('none');
  expect(screen.getByText('실제 돈과 개인정보는 사용하지 않아요.')).toBeTruthy();
  press('돌아가기');
  expect(getPhishingSession()?.exposure).toBe('none');
  press('돈을 보낸 상황');
  press('이 상황으로 연습하기');
  expect(getPhishingSession()?.exposure).toBe('money');
  press('전화를 끊고 확인하기');
  press('112에 피해 알리기 · 연습');
  expect(getPhishingSession()?.reported).toBe(false);
  press('연락으로 돌아가기');
  expect(getPhishingSession()?.reported).toBe(false);
  press('112에 피해 알리기 · 연습');
  press('받은 연락과 상황 알리기');
  expect(getPhishingSession()?.reported).toBe(true);
  expect(getPhishingSession()?.verification).toBeNull();
  expect(screen.getByText('상황을 확인했어요. 추가로 돈이나 정보를 보내지 마세요. 받은 문자와 대화 내용은 지우지 말고 남겨 주세요.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '확인 마치기' })).toBeNull();
  press('연락 확인 계속하기');
  press('금융회사에 도움 요청 · 연습');
  expect(getPhishingSession()?.bankContacted).toBe(false);
  press('지급정지 요청하기');
  expect(screen.getByText('송금 내역을 확인하고 지급정지 가능 여부를 살펴볼게요. 돈을 돌려받을 수 있는지는 상황에 따라 달라요.')).toBeTruthy();
  press('연락 확인 계속하기');
  press('공식 연락처로 확인');
  press('이 연락 차단하기');
  press('확인 마치기');
  expect(screen.getByTestId('phone-safety-result')).toBeTruthy();
  expect(screen.getByText('금융회사에 지급정지를 요청하는 연습을 했어요.')).toBeTruthy();
});

it('asks for account protection instead of payment suspension when only information was disclosed', () => {
  act(() => { startPhishingEpisode('parcel'); });
  const screen = render(<PhoneSafety reduceMotion />);
  const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
  press('이미 응했다면 연습');
  press('개인정보를 알려준 상황');
  press('이 상황으로 연습하기');
  press('답장을 멈추고 확인하기');
  press('금융회사에 도움 요청 · 연습');
  expect(screen.queryByRole('button', { name: '지급정지 요청하기' })).toBeNull();
  expect(getPhishingSession()?.bankContacted).toBe(false);
  press('정보 노출 알리고 도움 요청');
  expect(getPhishingSession()?.bankContacted).toBe(true);
  expect(screen.getByText('어떤 정보를 알려줬는지 확인하고, 필요한 계좌 보호 조치를 안내할게요.')).toBeTruthy();
});

it('allows a verified genuine invitation to be declined and exposes the next episodes only after completion', () => {
  act(() => { startPhishingEpisode('friend-real'); });
  const screen = render(<PhoneSafety reduceMotion />);
  const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
  expect(screen.queryByTestId('phone-safety-episodes')).toBeNull();
  press('답장을 멈추고 확인하기');
  press('저장된 민수에게 전화');
  expect(screen.queryByRole('button', { name: '이 연락 차단하기' })).toBeNull();
  press('이번에는 어려워요');
  press('확인 마치기');
  expect(getPhishingSession()?.genuineDecision).toBe('decline');
  expect(getPhishingSession()?.status).toBe('completed');
  press('다른 연락 살펴보기');
  press(`${PHISHING_SCENARIOS.parcel.title} 시작`);
  expect(getPhishingSession()?.scenarioId).toBe('parcel');
  expect(getPhishingSession()?.status).toBe('active');
  press('답장을 멈추고 확인하기');
  press('주문한 곳에서 확인');
  expect(getPhishingSession()?.verification?.method).toBe('order-history');
});
