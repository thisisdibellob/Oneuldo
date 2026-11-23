import { act, fireEvent, render } from '@testing-library/react-native';
import { MarketLayoutEditor } from '../src/components/game/MarketLayoutEditor';
import { MarketLayoutPreview } from '../src/components/game/MarketLayoutPreview';
import { MarketLayoutLibrary } from '../src/components/game/MarketLayoutLibrary';
import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { createMarketTilemapFromEnvironment } from '../src/game/marketTilemap';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
jest.mock('../src/components/game/MarketLayoutPreview', () => ({ MarketLayoutPreview: jest.fn(() => null) }));
jest.mock('../src/components/game/MarketLayoutLibrary', () => ({ MarketLayoutLibrary: jest.fn(() => null) }));

const configForTest = () => createMarketEnvironment({ seed: 'grid-test', employeeCount: 2, customerCount: 2,
  pillarCount: 0, chairCount: 0, cashierCount: 2, kioskPresent: false }).config;
const previewProps = () => jest.mocked(MarketLayoutPreview).mock.calls.at(-1)![0];
const libraryProps = () => jest.mocked(MarketLayoutLibrary).mock.calls.at(-1)![0];
const validate = () => act(() => { jest.advanceTimersByTime(500); });
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { jest.useRealTimers(); });

it('previews pending edits without applying them and returns to the same undoable draft', () => {
  const config = configForTest(), before = JSON.stringify(config);
  const map = createMarketTilemapFromEnvironment(createMarketEnvironment(config));
  const onApply = jest.fn(), onClose = jest.fn();
  const screen = render(<MarketLayoutEditor config={config} onApply={onApply} onClose={onClose} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  validate();
  fireEvent.changeText(screen.getByLabelText('선택한 물건 가로 칸'), String(map.shelves[0].col + 2));
  fireEvent.press(screen.getByRole('button', { name: '테스트' }));
  fireEvent.press(screen.getByRole('button', { name: '여기서 걸어보기' }));
  expect(previewProps().initialMode).toBe('walk');
  expect(previewProps().environment.config.tilemap!.shelves[0].col).toBe(map.shelves[0].col + 1);
  const closeBeforeValidation = previewProps().onClose;
  validate();
  expect(previewProps().onClose).toBe(closeBeforeValidation);
  expect(onApply).not.toHaveBeenCalled();
  expect(JSON.stringify(config)).toBe(before);
  act(() => previewProps().onClose());
  fireEvent.press(screen.getByRole('button', { name: '그리드 편집' }));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByLabelText('선택한 물건 가로 칸').props.value).toBe(String(map.shelves[0].col + 2));
  fireEvent.press(screen.getByRole('button', { name: '배치 실행 취소' }));
  expect(screen.getByLabelText('선택한 물건 가로 칸').props.value).toBe(String(map.shelves[0].col + 1));
});

it('blocks a preview of invalid placement instead of showing the older valid map', () => {
  const screen = render(<MarketLayoutEditor config={configForTest()} onApply={jest.fn()} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  fireEvent.changeText(screen.getByLabelText('선택한 물건 가로 칸'), '1');
  fireEvent.press(screen.getByRole('button', { name: '테스트' }));
  fireEvent.press(screen.getByRole('button', { name: '실제 모습' }));
  expect(MarketLayoutPreview).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeTruthy();
});

it('saves the latest coordinates and loads a stored map into the draft until explicit apply', () => {
  const config = configForTest(), before = JSON.stringify(config);
  const initial = createMarketTilemapFromEnvironment(createMarketEnvironment(config));
  const onApply = jest.fn();
  const screen = render(<MarketLayoutEditor config={config} onApply={onApply} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  fireEvent.changeText(screen.getByLabelText('선택한 물건 가로 칸'), String(initial.shelves[0].col + 2));
  fireEvent.press(screen.getByRole('button', { name: '보관함' }));
  let saved: ReturnType<typeof createMarketTilemapFromEnvironment> | undefined;
  act(() => { saved = libraryProps().getCurrentLayout(); });
  expect(saved!.shelves[0].col).toBe(initial.shelves[0].col + 1);
  const withoutCustomers = { ...initial, people: initial.people.filter(person => person.kind === 'employee') };
  act(() => libraryProps().onLoad(withoutCustomers));
  expect(screen.getByText('종업원 2/3 · 손님 0/5')).toBeTruthy();
  expect(onApply).not.toHaveBeenCalled();
  expect(JSON.stringify(config)).toBe(before);
  validate();
  fireEvent.press(screen.getByRole('button', { name: '배치 적용' }));
  expect(onApply.mock.calls[0][0].tilemap).toEqual(withoutCustomers);
});

it('rejects incompatible stored positions and leaves the previous draft intact', () => {
  const config = configForTest();
  const initial = createMarketTilemapFromEnvironment(createMarketEnvironment(config));
  const invalid = { ...initial, shelves: initial.shelves.map((shelf, index) => index ? shelf : { ...shelf, col: 0 }) };
  const screen = render(<MarketLayoutEditor config={config} onApply={jest.fn()} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  fireEvent.press(screen.getByRole('button', { name: '보관함' }));
  expect(() => libraryProps().onLoad(invalid)).toThrow();
  let current: ReturnType<typeof createMarketTilemapFromEnvironment> | undefined;
  act(() => { current = libraryProps().getCurrentLayout(); });
  expect(current).toEqual(initial);
});

it('cancels an edited preview without committing the market setup', () => {
  const onApply = jest.fn(), onClose = jest.fn();
  const screen = render(<MarketLayoutEditor config={configForTest()} onApply={onApply} onClose={onClose} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  fireEvent.press(screen.getByRole('button', { name: '한 칸 오른쪽' }));
  fireEvent.press(screen.getByRole('button', { name: '테스트' }));
  fireEvent.press(screen.getByRole('button', { name: '실제 모습' }));
  expect(previewProps().initialMode).toBe('overview');
  act(() => previewProps().onClose());
  fireEvent.press(screen.getByRole('button', { name: '그리드 편집' }));
  fireEvent.press(screen.getByRole('button', { name: '뒤로가기' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onApply).not.toHaveBeenCalled();
});

it('clears unfinished coordinate typing when the user explicitly restores the starting layout', () => {
  const config = configForTest();
  const initial = createMarketTilemapFromEnvironment(createMarketEnvironment(config));
  const onApply = jest.fn();
  const screen = render(<MarketLayoutEditor config={config} onApply={onApply} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  fireEvent.changeText(screen.getByLabelText('선택한 물건 가로 칸'), String(initial.shelves[0].col + 2));
  fireEvent.press(screen.getByRole('button', { name: '편집 전 배치로' }));
  expect(screen.getByLabelText('선택한 물건 가로 칸').props.value).toBe(String(initial.shelves[0].col + 1));
  validate();
  fireEvent.press(screen.getByRole('button', { name: '배치 적용' }));
  expect(onApply.mock.calls[0][0].tilemap).toEqual(initial);
});

it('commits both pending axes together when a native coordinate field loses focus', () => {
  const config = configForTest();
  const initial = createMarketTilemapFromEnvironment(createMarketEnvironment(config));
  const screen = render(<MarketLayoutEditor config={config} onApply={jest.fn()} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  fireEvent.changeText(screen.getByLabelText('선택한 물건 가로 칸'), String(initial.shelves[0].col + 2));
  fireEvent.changeText(screen.getByLabelText('선택한 물건 세로 칸'), String(initial.shelves[0].row + 2));
  fireEvent(screen.getByLabelText('선택한 물건 가로 칸'), 'endEditing');
  expect(screen.getByLabelText('선택한 물건 가로 칸').props.value).toBe(String(initial.shelves[0].col + 2));
  expect(screen.getByLabelText('선택한 물건 세로 칸').props.value).toBe(String(initial.shelves[0].row + 2));
});
