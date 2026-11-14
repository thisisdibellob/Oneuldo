import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { GamePrototypeScreen } from '../src/screens/GamePrototypeScreen';
import { dispatchShoppingErrand, getShoppingErrand, offerShoppingErrand, resetShoppingErrandForTests } from '../src/game/shoppingErrandStore';
import { getShoppingErrandMarketConfig } from '../src/game/shoppingErrand';
import { applyMarketAction, createMarketSession, exportMarketEpisode, type MarketSession } from '../src/game/marketSession';
import { getMarketProduct } from '../src/game/scenarios';
import { getActivityAlbum, resetActivityAlbumForTests } from '../src/game/activityAlbum';
import { resetDayJourneyForTests } from '../src/game/dayJourney';
import type { MarketEnvironmentStationId } from '../src/game/marketEnvironment';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn(() => Promise.resolve()), useAudioPlayer: () => ({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn() }), useAudioPlayerStatus: () => ({ isLoaded: true }) }));
jest.mock('expo-glass-effect', () => ({ GlassView: jest.requireActual('react-native').View, isLiquidGlassAvailable: () => false }));
jest.mock('../src/game/prototypeWorld', () => {
  const real = jest.requireActual('../src/game/prototypeWorld');
  const minsu = { ...real.VILLAGE_NPC_BY_ID.minsu, point: { x: 500, y: 500 } };
  return { ...real, INITIAL_PLAYER_POINT: { x: 500, y: 680 }, MARKET_ENTRANCE_POINT: { x: 500, y: 680 }, MARKET_RETURN_POINT: { x: 500, y: 680 }, VILLAGE_NPCS: [minsu], VILLAGE_NPC_BY_ID: { ...real.VILLAGE_NPC_BY_ID, minsu }, BUS_STOP_POINT: { x: 1600, y: 1600 } };
});
jest.mock('../src/game/villageNavigation', () => ({ ...jest.requireActual('../src/game/villageNavigation'), isVillageNavigationBlocked: () => false, isVillageNavigationSegmentClear: () => true }));

function paidErrand() {
  const now = Date.now() - 60_000;
  offerShoppingErrand('library-finished', now);
  dispatchShoppingErrand({ type: 'accept', at: now + 1 });
  dispatchShoppingErrand({ type: 'market-started', sessionId: 'paid-for-minsu', at: now + 2 });
  let game = createMarketSession({ ...getShoppingErrandMarketConfig(getShoppingErrand()!, { sessionId: 'paid-for-minsu', startedAt: new Date(now + 2).toISOString() }),
    learning: { stockoutEnabled: false, budgetChoiceEnabled: false, checkoutReviewMode: 'normal' }, environment: { cashierCount: 2, kioskLane: 'none' } });
  const visit = (state: MarketSession, station: MarketEnvironmentStationId) => applyMarketAction(applyMarketAction(state, { type: 'setPosition', point: state.environment.stations[station] }), { type: 'interact', station });
  for (const [productId, quantity] of [['milk', 1], ['apple', 2]] as const) game = applyMarketAction(visit(game, getMarketProduct(productId)!.categoryId), { type: 'add', productId, quantity });
  game = applyMarketAction(visit(game, 'checkout'), { type: 'submit' });
  expect(game.paid).toBe(true);
  dispatchShoppingErrand({ type: 'market-finished', episode: exportMarketEpisode(game) });
  expect(getShoppingErrand()?.phase).toBe('ready');
}
beforeEach(() => { resetShoppingErrandForTests(); resetDayJourneyForTests(); resetActivityAlbumForTests(); jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true); });
afterEach(() => jest.restoreAllMocks());

it('requires meeting Minsu after a real purchase and records only one handoff with the actual goods', async () => {
  paidErrand();
  const screen = render(<GamePrototypeScreen initialActivity="errand" onExit={jest.fn()} />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByRole('button', { name: '물건을 건네고 이야기하기' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '민수에게 가져가기' }));
  expect(getShoppingErrand()?.phase).toBe('ready');
  expect(getActivityAlbum()).toHaveLength(0);
  fireEvent(screen.getByLabelText('쿼터뷰 마을'), 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
  fireEvent(screen.getByLabelText('쿼터뷰 마을'), 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
  fireEvent.press(screen.getByRole('button', { name: '민수와 대화 또는 의뢰 선택하기' }));
  fireEvent.press(screen.getByRole('button', { name: '대화 계속하기' }));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 400)); });
  fireEvent.press(screen.getByRole('button', { name: '대화 계속하기' }));
  const continueChoice = screen.queryByRole('button', { name: '대화 계속하기' });
  if (continueChoice) fireEvent.press(continueChoice);
  fireEvent.press(screen.getByRole('button', { name: '부탁한 물건 전달하기' }));
  fireEvent.press(screen.getByRole('button', { name: '물건을 건네고 이야기하기' }));
  expect(getShoppingErrand()?.phase).toBe('delivered');
  expect(screen.getByText('민수에게 전달했어요')).toBeTruthy();
  expect(getActivityAlbum()).toHaveLength(1);
  expect(getActivityAlbum()[0]).toMatchObject({ kind: 'delivery', metrics: [{ label: '전달한 물품', value: 3, unit: '개' }] });
  act(() => { dispatchShoppingErrand({ type: 'deliver', at: Date.now() }); });
  expect(getActivityAlbum()).toHaveLength(1);
  screen.unmount();
});

it('starts the real shared market with the errand receipt id and matching world seed', async () => {
  offerShoppingErrand('new-shift');
  dispatchShoppingErrand({ type: 'accept', at: Date.now() });
  const screen = render(<GamePrototypeScreen initialActivity="errand" onExit={jest.fn()} />);
  await act(async () => { await Promise.resolve(); });
  fireEvent.press(screen.getByRole('button', { name: '부탁 확인했어' }));
  fireEvent.press(screen.getByRole('button', { name: '하늘마트 들어가기' }));
  expect(getShoppingErrand()?.boundSessionId).toMatch(/^minsu-new-shift-visit-/);
  expect(screen.getByText(/민수의 부탁 · 예산/)).toBeTruthy();
  expect(screen.queryByText('마트 설정')).toBeNull();
  expect(getShoppingErrand()?.phase).toBe('accepted');
  expect(getActivityAlbum()).toHaveLength(0);
  await act(async () => { await Promise.resolve(); });
  screen.unmount();
});
