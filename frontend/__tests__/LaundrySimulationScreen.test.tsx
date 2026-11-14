import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { LaundrySimulationScreen } from '../src/screens/LaundrySimulationScreen';
import { applyLaundryAction, createLaundrySession, LAUNDRY_ITEMS, LAUNDRY_BATCHES, type LaundrySession } from '../src/game/laundrySession';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('../src/game/laundryArt', () => ({ laundryArt: { basket: 1, wardrobe: 2, items: { 'cream-tee': 3, 'blue-jeans': 4, 'coral-towel': 5, 'sage-towel': 6, 'sock-left': 7, 'sock-right': 7 } } }));
// Keep the real work panels, timers, reducer and result; room movement has its
// own collision tests. These buttons invoke the same station callbacks.
jest.mock('../src/components/game/LaundryRoom', () => {
  const { View, Pressable, Text } = jest.requireActual('react-native');
  return { LaundryRoom: ({ locked, onInteract }: { locked: boolean; onInteract: (station: string) => void }) => <View>{['basket', 'washer', 'dryer', 'rack', 'fold', 'exit'].map(station => <Pressable key={station} accessibilityRole="button" accessibilityLabel={`이동 ${station}`} disabled={locked} onPress={() => onInteract(station)}><Text>{station}</Text></Pressable>)}</View> };
});
jest.mock('../src/components/game/GameHud', () => {
  const { View, Pressable, Text } = jest.requireActual('react-native');
  return { GameHud: ({ onOpenNotebook, onOpenInventory }: { onOpenNotebook: () => void; onOpenInventory: () => void }) => <View><Pressable accessibilityRole="button" accessibilityLabel="수첩" onPress={onOpenNotebook}><Text>수첩</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="빨래 바구니" onPress={onOpenInventory}><Text>빨래 바구니</Text></Pressable></View> };
});

beforeEach(() => { jest.useFakeTimers(); jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
type Screen = ReturnType<typeof render>;
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
async function press(screen: Screen, name: string) { fireEvent.press(screen.getByRole('button', { name })); await flush(); }
async function inspect(screen: Screen, name: string) { fireEvent(screen.getByRole('button', { name: `${name} 확인` }), 'accessibilityTap'); await flush(); }
const visit = (screen: Screen, station: string) => press(screen, `이동 ${station}`);
const advanceCycle = async () => { await act(async () => { jest.advanceTimersByTime(6100); }); await flush(); };
function packedSession(): LaundrySession {
  let session = createLaundrySession();
  session = applyLaundryAction(session, { type: 'PACK_ALL' });
  return applyLaundryAction(session, { type: 'LEAVE_HOME' });
}

it('집에서 여섯 빨래를 챙긴 뒤에만 실제 마을로 출발하고, 빨래방에 도착하면 분류를 시작한다', async () => {
  let latest = createLaundrySession(); const exit = jest.fn(); const complete = jest.fn();
  const home = render(<LaundrySimulationScreen location="home" initialSession={latest} onExit={exit} onReturnHome={jest.fn()} onSessionChange={value => { latest = value; }} onLaundryComplete={complete} />);
  await flush();
  expect(home.getByRole('button', { name: '빨래방으로 출발하기' }).props.accessibilityState.disabled).toBe(true);
  for (const item of LAUNDRY_ITEMS) await press(home, `${item.name} 챙기기`);
  await press(home, '빨래방으로 출발하기');
  expect(exit).toHaveBeenCalledTimes(1); expect(latest.phase).toBe('travel'); expect(complete).not.toHaveBeenCalled();
  home.unmount();
  const shop = render(<LaundrySimulationScreen location="laundromat" initialSession={latest} onExit={exit} onReturnHome={jest.fn()} onSessionChange={value => { latest = value; }} />);
  await flush(); expect(latest.phase).toBe('sorting'); await visit(shop, 'basket');
  await inspect(shop, '청바지'); await press(shop, '주머니·안쪽 확인하기');
  expect(shop.getByText('주머니에 영수증이 있어요.')).toBeTruthy();
  await press(shop, '영수증 꺼내기'); await press(shop, '밝은 빨래에 담기');
  expect(latest.items.find(item => item.itemId === 'blue-jeans')?.batchId).toBeNull();
  expect(latest.lastActionError).toBeTruthy();
  await inspect(shop, '청바지'); await press(shop, '색 있는 빨래에 담기');
  expect(latest.items.find(item => item.itemId === 'blue-jeans')?.receiptRemoved).toBe(true);
  expect(latest.items.find(item => item.itemId === 'blue-jeans')?.batchId).toBe('colors');
  shop.unmount();
});

it('두 번의 결제와 세탁, 표시별 건조, 접기와 양말 짝, 실제 귀가와 옷장 정리까지 완료해야 결과가 나온다', async () => {
  let latest = packedSession(); const returnHome = jest.fn(); const complete = jest.fn();
  const screen = render(<LaundrySimulationScreen location="laundromat" initialSession={latest} onExit={jest.fn()} onReturnHome={returnHome} onSessionChange={value => { latest = value; }} onLaundryComplete={complete} />);
  await flush(); await visit(screen, 'basket');
  for (const item of LAUNDRY_ITEMS) {
    await inspect(screen, item.name); await press(screen, '주머니·안쪽 확인하기');
    if (item.pocketItem) await press(screen, '영수증 꺼내기');
    await press(screen, `${LAUNDRY_BATCHES[item.batchId].name}에 담기`);
  }
  expect(latest.phase).toBe('washing'); await press(screen, '분류 마치기'); await visit(screen, 'washer');
  await press(screen, '1번 세탁기 선택');
  expect(latest.occupiedMachineSeen).toBe(true); expect(latest.payments).toHaveLength(0);
  for (let batch = 0; batch < 2; batch += 1) {
    await press(screen, '2번 세탁기 선택');
    expect(screen.getByTestId('laundry-payment')).toBeTruthy(); expect(latest.washJobs).toHaveLength(batch);
    await press(screen, '결제하고 세탁 시작');
    expect(latest.payments).toHaveLength(batch + 1);
    expect(screen.getByRole('button', { name: '세탁물 꺼내기' }).props.accessibilityState.disabled).toBe(true);
    await advanceCycle(); await press(screen, '세탁물 꺼내기');
  }
  expect(latest.phase).toBe('drying'); await press(screen, '닫기'); await visit(screen, 'dryer');
  await press(screen, '청바지 건조기에 넣기');
  expect(latest.items.find(item => item.itemId === 'blue-jeans')?.dryMethod).toBeNull();
  expect(latest.lastActionError).toBeTruthy();
  for (const item of LAUNDRY_ITEMS.filter(item => item.dryMethod === 'low')) await press(screen, `${item.name} 건조기에 넣기`);
  await press(screen, '저온 건조 시작'); await press(screen, '닫기'); await visit(screen, 'rack');
  await press(screen, '청바지 건조대에 널기'); await press(screen, '널어서 말리기 시작');
  expect(screen.getByRole('button', { name: '마른 빨래 걷기' }).props.accessibilityState.disabled).toBe(true);
  await advanceCycle(); await press(screen, '마른 빨래 걷기'); await press(screen, '닫기'); await visit(screen, 'dryer'); await press(screen, '마른 빨래 걷기');
  expect(latest.phase).toBe('folding'); await press(screen, '닫기'); await visit(screen, 'fold');
  for (const item of LAUNDRY_ITEMS.filter(item => item.foldable)) {
    await press(screen, `${item.name} 접기`); await press(screen, '옆으로 접기'); await press(screen, '반으로 접기'); await press(screen, '접은 옷 담기');
  }
  await press(screen, '양말 짝 맞추기');
  expect(screen.getByRole('button', { name: '짝 맞춰 담기' }).props.accessibilityState.disabled).toBe(true);
  await press(screen, '양말 한 짝 짝 고르기'); await press(screen, '나머지 양말 짝 고르기'); await press(screen, '짝 맞춰 담기');
  expect(latest.phase).toBe('returning'); expect(screen.queryByTestId('laundry-result')).toBeNull(); expect(complete).not.toHaveBeenCalled();
  await press(screen, '깨끗한 빨래 들고 집으로'); expect(returnHome).toHaveBeenCalledTimes(1);
  screen.unmount();
  const home = render(<LaundrySimulationScreen location="home" initialSession={latest} onExit={jest.fn()} onReturnHome={returnHome} onSessionChange={value => { latest = value; }} onLaundryComplete={complete} />);
  await flush(); expect(latest.homeArrivalConfirmed).toBe(true); expect(complete).not.toHaveBeenCalled();
  await press(home, '옷장에 넣고 마무리');
  expect(home.getByTestId('laundry-result')).toBeTruthy(); expect(latest.phase).toBe('finished'); expect(complete).toHaveBeenCalledTimes(1);
  await press(home, '한 번 더 해보기'); expect(latest.phase).toBe('packing'); expect(complete).toHaveBeenCalledTimes(1);
  home.unmount();
});

it('세탁 중 나갔다 다시 들어와도 결제와 세탁 시간을 유지하고 다시 결제하지 않는다', async () => {
  let latest = applyLaundryAction(packedSession(), { type: 'ARRIVE_LAUNDROMAT' });
  for (const item of LAUNDRY_ITEMS) {
    latest = applyLaundryAction(latest, { type: 'INSPECT_CARE', itemId: item.id });
    latest = applyLaundryAction(latest, { type: 'INSPECT_POCKET', itemId: item.id });
    if (item.pocketItem) latest = applyLaundryAction(latest, { type: 'REMOVE_RECEIPT', itemId: item.id });
    latest = applyLaundryAction(latest, { type: 'SORT', itemId: item.id, batchId: item.batchId });
  }
  latest = applyLaundryAction(latest, { type: 'PAY_WASH', batchId: 'lights', machineId: 'washer-2' });
  latest = applyLaundryAction(latest, { type: 'START_WASH', batchId: 'lights', machineId: 'washer-2', now: Date.now() });
  const exit = jest.fn();
  const first = render(<LaundrySimulationScreen location="laundromat" initialSession={latest} onExit={exit} onReturnHome={jest.fn()} onSessionChange={value => { latest = value; }} />);
  await flush(); await visit(first, 'exit'); await press(first, '마을로 나가기'); expect(exit).toHaveBeenCalledTimes(1); first.unmount();
  await advanceCycle();
  const second = render(<LaundrySimulationScreen location="laundromat" initialSession={latest} onExit={exit} onReturnHome={jest.fn()} onSessionChange={value => { latest = value; }} />);
  await flush(); await visit(second, 'washer');
  expect(second.getByRole('button', { name: '세탁물 꺼내기' }).props.accessibilityState.disabled).toBe(false);
  await press(second, '세탁물 꺼내기'); expect(latest.payments).toHaveLength(1); expect(latest.washJobs[0]?.completedAt).not.toBeNull(); second.unmount();
});
