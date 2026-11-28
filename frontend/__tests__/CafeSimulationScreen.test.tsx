import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { CafeSimulationScreen } from '../src/screens/CafeSimulationScreen';
import { applyCafeAction, CAFE_CUP_LABELS, CAFE_INGREDIENT_LABELS, CAFE_RECIPES, createCafeSession, getCurrentCafeGuest, type CafeSession } from '../src/game/cafeSession';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const React = jest.requireActual('react');
    return React.useRef({ pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()), setPlaybackRate: jest.fn(), volume: 1 }).current;
  },
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}));
// Keep the real workbench, dialogue, recipes, cleanup, and results. Movement is
// covered by CafeRoom tests; these station buttons exercise the same callbacks.
jest.mock('../src/components/game/CafeRoom', () => {
  const { View, Pressable, Text } = jest.requireActual('react-native');
  return { CafeRoom: ({ locked, onInteract }: { locked: boolean; onInteract: (station: string) => void }) => <View>{['coworker', 'customer', 'brew', 'table', 'exit'].map(station => <Pressable key={station} accessibilityRole="button" accessibilityLabel={`이동 ${station}`} disabled={locked} onPress={() => onInteract(station)}><Text>{station}</Text></Pressable>)}</View> };
});
jest.mock('../src/components/game/GameHud', () => {
  const { View, Pressable, Text } = jest.requireActual('react-native');
  return { GameHud: ({ onOpenNotebook, onOpenInventory }: { onOpenNotebook: () => void; onOpenInventory: () => void }) => <View><Pressable accessibilityRole="button" accessibilityLabel="주문표" onPress={onOpenNotebook}><Text>주문표</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="쟁반" onPress={onOpenInventory}><Text>쟁반</Text></Pressable></View> };
});

beforeEach(() => { jest.useFakeTimers(); jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
type Screen = ReturnType<typeof render>;
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
async function press(screen: Screen, name: string) { fireEvent.press(screen.getByRole('button', { name })); await flush(); }
const visit = (screen: Screen, station: string) => press(screen, `이동 ${station}`);
async function start(screen: Screen) { await visit(screen, 'coworker'); await press(screen, '시작할게요'); }

it('주문을 받은 뒤 재료를 직접 고르고, 잘못 만든 음료를 버리지 않고 다시 만들 수 있다', async () => {
  let latest = createCafeSession();
  const screen = render(<CafeSimulationScreen initialSession={latest} onExit={jest.fn()} onSessionChange={value => { latest = value; }} />);
  await flush(); await start(screen); await visit(screen, 'customer'); await press(screen, '아이스 라테 한 잔이요'); await visit(screen, 'brew');
  await press(screen, '머그잔 고르기'); await press(screen, '완성하기');
  expect(screen.getByText(/차가운 음료 컵에 담아요/)).toBeTruthy();
  expect(getCurrentCafeGuest(latest)?.stage).toBe('preparing');
  await press(screen, '컵 비우고 다시 만들기'); await press(screen, '차가운 음료 컵 고르기');
  await press(screen, '만드는 법 보기');
  expect(screen.getByTestId('cafe-recipe-notebook')).toBeTruthy();
  expect(screen.getByText('우유 넣기')).toBeTruthy();
  await press(screen, '닫기');
  expect(getCurrentCafeGuest(latest)?.cup).toBe('glass');
  await press(screen, '얼음 넣기'); await press(screen, '우유 넣기'); await press(screen, '에스프레소 넣기'); await press(screen, '완성하기');
  expect(screen.getByTestId('cafe-tray')).toBeTruthy();
  expect(getCurrentCafeGuest(latest)?.stage).toBe('ready');
  await press(screen, '쟁반 들기');
  expect(getCurrentCafeGuest(latest)?.stage).toBe('carrying');
  screen.unmount();
});

it('세 손님 주문, 변경 요청, 전달, 자리 정리, 완료 보고까지 연결하고 한 번만 완료를 알린다', async () => {
  let latest = createCafeSession(); const complete = jest.fn(); const exit = jest.fn();
  const screen = render(<CafeSimulationScreen initialSession={latest} onExit={exit} onSessionChange={value => { latest = value; }} onShiftComplete={complete} />);
  await flush(); await start(screen);
  for (let index = 0; index < 3; index += 1) {
    await visit(screen, 'customer');
    await press(screen, `${CAFE_RECIPES[getCurrentCafeGuest(latest)!.recipeId].name} 한 잔이요`);
    if (index === 1) {
      expect(screen.getByText('아, 만들기 전에 차가운 아메리카노로 바꿔도 될까?')).toBeTruthy();
      expect(getCurrentCafeGuest(latest)?.stage).toBe('order-change');
      await press(screen, '네, 차가운 음료로 바꿔 드릴게요');
    }
    const recipe = CAFE_RECIPES[getCurrentCafeGuest(latest)!.recipeId];
    await visit(screen, 'brew'); await press(screen, `${CAFE_CUP_LABELS[recipe.cup]} 고르기`);
    for (const ingredient of recipe.ingredients) await press(screen, `${CAFE_INGREDIENT_LABELS[ingredient]} 넣기`);
    await press(screen, '완성하기'); await press(screen, '쟁반 들기');
    await visit(screen, 'customer'); await press(screen, `${recipe.name} 나왔어요`); await press(screen, '맛있게 드세요');
    expect(getCurrentCafeGuest(latest)?.stage).toBe('served');
    await visit(screen, 'table');
    expect(screen.getByRole('button', { name: '자리 정리 마치기' }).props.accessibilityState.disabled).toBe(true);
    for (let spot = 1; spot <= 3; spot += 1) await press(screen, `컵 자국 ${spot} 닦기`);
    await press(screen, '자리 정리 마치기');
    expect(getCurrentCafeGuest(latest)?.stage).toBe('cleaned');
    await press(screen, index === 2 ? '동료에게 알려주기' : '다음 손님 맞이하기');
  }
  await visit(screen, 'coworker'); await press(screen, '근무를 마쳤어요');
  expect(screen.getByTestId('cafe-report')).toBeTruthy();
  await press(screen, '음료와 자리 정리를 마쳤어요');
  expect(screen.getByTestId('cafe-result')).toBeTruthy();
  expect(screen.getByText('지영의 변경된 주문을 확인했어요.')).toBeTruthy();
  expect(complete).toHaveBeenCalledTimes(1);
  expect(latest.phase).toBe('finished');
  await press(screen, '한 번 더 일하기');
  expect(latest.phase).toBe('briefing'); expect(complete).toHaveBeenCalledTimes(1);
  screen.unmount();
});

it('중간에 나가도 부모에게 전달한 주문과 재료로 이어서 시작한다', async () => {
  let latest: CafeSession = createCafeSession();
  for (const action of [{ type: 'START' }, { type: 'TAKE_ORDER' }, { type: 'CHOOSE_CUP', cup: 'glass' }, { type: 'ADD_INGREDIENT', ingredient: 'ice' }] as const) latest = applyCafeAction(latest, action);
  const exit = jest.fn();
  const screen = render(<CafeSimulationScreen initialSession={latest} onExit={exit} onSessionChange={value => { latest = value; }} />);
  await flush(); await visit(screen, 'exit'); await press(screen, '마을로 나가기');
  expect(exit).toHaveBeenCalledTimes(1); expect(getCurrentCafeGuest(latest)?.ingredients).toEqual(['ice']);
  screen.unmount();
  const returned = render(<CafeSimulationScreen initialSession={latest} onExit={exit} />);
  await flush(); await visit(returned, 'brew');
  expect(returned.getByRole('button', { name: '얼음 넣기' }).props.accessibilityState.disabled).toBe(true);
  expect(returned.queryByRole('button', { name: '차가운 음료 컵 고르기' })).toBeNull();
  returned.unmount();
});
