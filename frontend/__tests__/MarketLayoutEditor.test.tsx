import { act, fireEvent, render } from '@testing-library/react-native';
import { Share } from 'react-native';
import { MarketLayoutEditor } from '../src/components/game/MarketLayoutEditor';
import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { applyMarketTilemapToConfig, createMarketTilemapFromEnvironment, parseMarketTilemapJson, serializeMarketTilemap } from '../src/game/marketTilemap';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

const makeConfig = () => createMarketEnvironment({ seed: 'grid-test', employeeCount: 2, customerCount: 2,
  pillarCount: 0, chairCount: 0, cashierCount: 2, kioskPresent: false }).config;
const validate = () => act(() => { jest.advanceTimersByTime(500); });

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it('moves the selected shelf one grid cell and only changes the environment after apply', () => {
  const config = makeConfig();
  const before = JSON.stringify(config);
  const map = createMarketTilemapFromEnvironment(createMarketEnvironment(config));
  const onApply = jest.fn();
  const screen = render(<MarketLayoutEditor config={config} onApply={onApply} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  fireEvent.press(screen.getByRole('button', { name: '한 칸 오른쪽' }));
  expect(config.tilemap).toBeUndefined();
  expect(onApply).not.toHaveBeenCalled();
  expect(screen.getByLabelText('선택한 물건 가로 칸').props.value).toBe(String(map.shelves[0].col + 2));
  validate();
  fireEvent.press(screen.getByRole('button', { name: '배치 적용' }));
  expect(onApply).toHaveBeenCalledTimes(1);
  const applied = onApply.mock.calls[0][0];
  expect(applied.tilemap.shelves[0].col).toBe(map.shelves[0].col + 1);
  expect(createMarketEnvironment(applied).shelves.produce.x).toBeGreaterThan(createMarketEnvironment(config).shelves.produce.x);
  expect(JSON.stringify(config)).toBe(before);
});

it('blocks a shelf placed on the outer wall and restores a playable draft with undo', () => {
  const onApply = jest.fn();
  const screen = render(<MarketLayoutEditor config={makeConfig()} onApply={onApply} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  fireEvent.changeText(screen.getByLabelText('선택한 물건 가로 칸'), '1');
  fireEvent(screen.getByLabelText('선택한 물건 가로 칸'), 'endEditing');
  validate();
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByRole('button', { name: '배치 적용' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: '배치 적용' }));
  expect(onApply).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: '배치 실행 취소' }));
  validate();
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '배치 적용' }));
  expect(onApply).toHaveBeenCalledTimes(1);
});

it('imports zero customers through the JSON UI and retains explicit positions on apply', () => {
  const config = makeConfig();
  const map = createMarketTilemapFromEnvironment(createMarketEnvironment(config));
  map.people = map.people.filter(person => person.kind === 'employee');
  const onApply = jest.fn();
  const screen = render(<MarketLayoutEditor config={config} onApply={onApply} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  fireEvent.press(screen.getByRole('button', { name: 'JSON 가져오기' }));
  fireEvent.changeText(screen.getByLabelText('마트 배치 JSON'), serializeMarketTilemap(map));
  fireEvent.press(screen.getByRole('button', { name: '붙여 넣은 배치 불러오기' }));
  expect(onApply).not.toHaveBeenCalled();
  expect(screen.getByText('종업원 2/3 · 손님 0/5')).toBeTruthy();
  validate();
  fireEvent.press(screen.getByRole('button', { name: '배치 적용' }));
  expect(onApply.mock.calls[0][0].tilemap).toEqual(map);
  expect(createMarketEnvironment(onApply.mock.calls[0][0]).customers).toEqual([]);
});

it('rejects malformed imports without replacing the draft and cancel discards edits', () => {
  const config = makeConfig();
  const original = createMarketTilemapFromEnvironment(createMarketEnvironment(config));
  const onApply = jest.fn(), onClose = jest.fn();
  const screen = render(<MarketLayoutEditor config={config} onApply={onApply} onClose={onClose} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  fireEvent.press(screen.getByRole('button', { name: 'JSON 가져오기' }));
  fireEvent.changeText(screen.getByLabelText('마트 배치 JSON'), '{bad json');
  fireEvent.press(screen.getByRole('button', { name: '붙여 넣은 배치 불러오기' }));
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '현재 지도 JSON 보기' }));
  expect(parseMarketTilemapJson(screen.getByLabelText('마트 배치 JSON').props.value)).toEqual(original);
  fireEvent.press(screen.getByRole('button', { name: '뒤로가기' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onApply).not.toHaveBeenCalled();
});

it('can remove all customers while keeping the final employee', () => {
  const config = createMarketEnvironment({ ...makeConfig(), employeeCount: 1, customerCount: 1 }).config;
  const screen = render(<MarketLayoutEditor config={config} onApply={jest.fn()} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  fireEvent.press(screen.getByRole('button', { name: '손님 1' }));
  fireEvent.press(screen.getByRole('button', { name: '선택한 사람 삭제' }));
  expect(screen.queryByRole('button', { name: '손님 1' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '종업원 1' }));
  expect(screen.getByRole('button', { name: '선택한 사람 삭제' }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText('종업원 1/3 · 손님 0/5')).toBeTruthy();
});

it('reopens an applied zero-customer layout without invoking the legacy minimum count', () => {
  const config = makeConfig();
  const map = createMarketTilemapFromEnvironment(createMarketEnvironment(config));
  map.people = map.people.filter(person => person.kind === 'employee');
  const screen = render(<MarketLayoutEditor config={applyMarketTilemapToConfig(config, map)} onApply={jest.fn()} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  validate();
  expect(screen.getByText('종업원 2/3 · 손님 0/5')).toBeTruthy();
  expect(screen.getByRole('button', { name: '배치 적용' }).props.accessibilityState.disabled).toBe(false);
});

it('preserves the valid current layout after a structurally correct but blocked JSON import', () => {
  const config = makeConfig();
  const map = createMarketTilemapFromEnvironment(createMarketEnvironment(config));
  const onApply = jest.fn();
  const screen = render(<MarketLayoutEditor config={config} onApply={onApply} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  validate();
  const broken = { ...map, shelves: map.shelves.map((item, index) => index ? item : { ...item, col: 0, row: 0 }) };
  fireEvent.press(screen.getByRole('button', { name: 'JSON 가져오기' }));
  fireEvent.changeText(screen.getByLabelText('마트 배치 JSON'), serializeMarketTilemap(broken));
  fireEvent.press(screen.getByRole('button', { name: '붙여 넣은 배치 불러오기' }));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByRole('button', { name: '배치 적용' }).props.accessibilityState.disabled).toBe(false);
  fireEvent.press(screen.getByRole('button', { name: '배치 적용' }));
  expect(onApply.mock.calls[0][0].tilemap).toEqual(map);
});

it('does not discard a typed coordinate when apply is pressed before the input loses focus', () => {
  const config = makeConfig();
  const map = createMarketTilemapFromEnvironment(createMarketEnvironment(config));
  const onApply = jest.fn();
  const screen = render(<MarketLayoutEditor config={config} onApply={onApply} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  validate();
  fireEvent.changeText(screen.getByLabelText('선택한 물건 가로 칸'), String(map.shelves[0].col + 2));
  fireEvent.press(screen.getByRole('button', { name: '배치 적용' }));
  expect(onApply.mock.calls[0][0].tilemap.shelves[0].col).toBe(map.shelves[0].col + 1);
});

it('exports the pending coordinate and keeps the visible draft identical to the shared JSON', async () => {
  const config = makeConfig();
  const map = createMarketTilemapFromEnvironment(createMarketEnvironment(config));
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  const onApply = jest.fn();
  const screen = render(<MarketLayoutEditor config={config} onApply={onApply} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  validate();
  fireEvent.changeText(screen.getByLabelText('선택한 물건 가로 칸'), String(map.shelves[0].col + 2));
  fireEvent.press(screen.getByRole('button', { name: 'JSON 가져오기' }));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'JSON 저장' })); });
  expect(share).toHaveBeenCalledTimes(1);
  const exported = parseMarketTilemapJson(share.mock.calls[0][0].message!);
  expect(exported.shelves[0].col).toBe(map.shelves[0].col + 1);
  fireEvent.press(screen.getByRole('button', { name: 'JSON 가져오기' }));
  expect(parseMarketTilemapJson(screen.getByLabelText('마트 배치 JSON').props.value)).toEqual(exported);
  expect(onApply).not.toHaveBeenCalled();
});

it('does not export an invalid pending coordinate using an older valid draft', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  const screen = render(<MarketLayoutEditor config={makeConfig()} onApply={jest.fn()} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '목록 보기' }));
  validate();
  fireEvent.changeText(screen.getByLabelText('선택한 물건 가로 칸'), '1');
  fireEvent.press(screen.getByRole('button', { name: 'JSON 가져오기' }));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'JSON 저장' })); });
  expect(share).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeTruthy();
});
