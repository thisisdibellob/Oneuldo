import { act, fireEvent, render } from '@testing-library/react-native';
import { Share } from 'react-native';
import { MarketSetupPanel } from '../src/components/game/MarketSetupPanel';
import { MarketLayoutEditor } from '../src/components/game/MarketLayoutEditor';
import { createMarketSession, parseMarketSessionConfig } from '../src/game/marketSession';
import { applyMarketTilemapToConfig, createMarketTilemapFromEnvironment } from '../src/game/marketTilemap';

jest.mock('expo-font', () => ({
  isLoaded: () => true,
  loadAsync: () => Promise.resolve()
}));
jest.mock('../src/components/game/MarketLayoutEditor', () => ({
  MarketLayoutEditor: jest.fn(() => null)
}));
const editor = jest.mocked(MarketLayoutEditor);
beforeEach(() => jest.clearAllMocks());
const gameConfig = () =>
  createMarketSession({
    seed: 'grid-setup-flow',
    environment: { pillarCount: 0, employeeCount: 1, customerCount: 1 }
  }).config;

it('편집은 하나의 초안에 반영하고 최종 적용 때 전체 설정에 포함한다', () => {
  const game = createMarketSession(gameConfig());
  const onApply = jest.fn();
  const screen = render(<MarketSetupPanel config={game.config} onApply={onApply} onClose={jest.fn()} />);
  expect(screen.queryByLabelText('환경 시드')).toBeNull();
  expect(screen.queryByLabelText('상품별 기본 재고')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '직접 배치 편집' }));
  const props = editor.mock.calls.at(-1)![0];
  const tilemap = createMarketTilemapFromEnvironment(game.environment);
  act(() => props.onApply(applyMarketTilemapToConfig(props.config, tilemap)));
  expect(onApply).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: '상황 설정' }));
  fireEvent.changeText(screen.getByLabelText('상품별 기본 재고'), '8');
  fireEvent.press(screen.getByRole('button', { name: '설정 적용' }));
  const imported = parseMarketSessionConfig(JSON.stringify(onApply.mock.calls[0][0]));
  expect(imported.environment.tilemap).toEqual(tilemap);
  expect(imported.stockPerProduct).toBe(8);
});

it('같은 가져오기에서 배치 JSON은 구매 조건과 재고를 유지한다', () => {
  const config = gameConfig();
  const map = createMarketTilemapFromEnvironment(createMarketSession(config).environment);
  const onApply = jest.fn();
  const screen = render(<MarketSetupPanel config={config} onApply={onApply} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '세이브 · 로드' }));
  fireEvent.changeText(screen.getByLabelText('마트 설정 가져오기 JSON'), JSON.stringify(map));
  fireEvent.press(screen.getByRole('button', { name: '붙여 넣은 설정 불러오기' }));
  expect(screen.getByText(/배치만 불러왔어요/)).toBeTruthy();
  expect(onApply).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: '설정 적용' }));
  expect(onApply.mock.calls[0][0]).toMatchObject({
    objectives: config.objectives,
    stockPerProduct: config.stockPerProduct,
    environment: { tilemap: map }
  });
});

it('전체 JSON은 명시적으로 불러온 뒤 편집과 최종 적용에 사용한다', () => {
  const config = gameConfig();
  const onApply = jest.fn();
  const screen = render(<MarketSetupPanel config={config} onApply={onApply} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '세이브 · 로드' }));
  const imported = {
    ...config,
    stockPerProduct: 9,
    environment: { ...config.environment, layoutId: 'aisles' }
  };
  fireEvent.changeText(screen.getByLabelText('마트 설정 가져오기 JSON'), JSON.stringify(imported));
  fireEvent.press(screen.getByRole('button', { name: '붙여 넣은 설정 불러오기' }));
  fireEvent.press(screen.getByRole('button', { name: '기본 설정' }));
  fireEvent.press(screen.getByRole('button', { name: '직접 배치 편집' }));
  const props = editor.mock.calls.at(-1)![0];
  expect(props.config.layoutId).toBe('aisles');
  act(() => props.onClose());
  fireEvent.press(screen.getByRole('button', { name: '설정 적용' }));
  expect(onApply.mock.calls[0][0]).toMatchObject({
    stockPerProduct: 9,
    environment: { layoutId: 'aisles' }
  });
});

it('직접 배치를 해제하기 전에 확인하고 취소하면 원래 배치를 유지한다', () => {
  const game = createMarketSession(gameConfig());
  const map = createMarketTilemapFromEnvironment(game.environment);
  map.people = map.people.filter((person) => person.kind === 'employee');
  const config = {
    ...game.config,
    environment: applyMarketTilemapToConfig(game.environment.config, map)
  };
  const onApply = jest.fn();
  const screen = render(<MarketSetupPanel config={config} onApply={onApply} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '구조 및 배치' }));
  expect(screen.queryByText('매장 종업원')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '가로 통로 배치' }));
  fireEvent.press(screen.getByRole('button', { name: '직접 배치 유지' }));
  fireEvent.press(screen.getByRole('button', { name: '설정 적용' }));
  expect(onApply.mock.calls[0][0].environment.tilemap).toEqual(map);
  fireEvent.press(screen.getByRole('button', { name: '가로 통로 배치' }));
  fireEvent.press(screen.getByRole('button', { name: '선택한 배치로 변경' }));
  fireEvent.press(screen.getByRole('button', { name: '설정 적용' }));
  expect(onApply.mock.calls[1][0].environment).toMatchObject({
    layoutId: 'aisles',
    customerCount: 1
  });
  expect(onApply.mock.calls[1][0].environment.tilemap).toBeUndefined();
});

it('잘못된 가져오기는 원래 설정을 덮어쓰지 않으며 탭을 바꿔도 입력을 보존한다', () => {
  const config = gameConfig();
  const onApply = jest.fn();
  const screen = render(<MarketSetupPanel config={config} onApply={onApply} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '세이브 · 로드' }));
  fireEvent.changeText(screen.getByLabelText('마트 설정 가져오기 JSON'), '{broken');
  fireEvent.press(screen.getByRole('button', { name: '붙여 넣은 설정 불러오기' }));
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '기본 설정' }));
  fireEvent.press(screen.getByRole('button', { name: '세이브 · 로드' }));
  expect(screen.getByLabelText('마트 설정 가져오기 JSON').props.value).toBe('{broken');
  fireEvent.press(screen.getByRole('button', { name: '설정 적용' }));
  expect(onApply.mock.calls[0][0]).toEqual(config);
});

it('편집 중 저장 메뉴로 이동해도 새 배치를 포함한 전체 설정을 내보낸다', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  try {
    const config = gameConfig();
    const onApply = jest.fn();
    const screen = render(<MarketSetupPanel config={config} onApply={onApply} onClose={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: '직접 배치 편집' }));
    const props = editor.mock.calls.at(-1)![0];
    const map = createMarketTilemapFromEnvironment(createMarketSession(config).environment);
    act(() => props.onOpenTransfer!(applyMarketTilemapToConfig(props.config, map)));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: '전체 설정 저장' }));
    });
    expect(JSON.parse(share.mock.calls[0][0].message!)).toMatchObject({
      environment: { tilemap: map },
      objectives: config.objectives
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: '배치만 저장' }));
    });
    expect(JSON.parse(share.mock.calls[1][0].message!)).toEqual(map);
    expect(onApply).not.toHaveBeenCalled();
  } finally {
    share.mockRestore();
  }
});

it('플레이 중 전체 설정을 가져와도 공간만 바꾸고 과제와 점수 규칙은 유지한다', () => {
  const config = gameConfig();
  const onApply = jest.fn();
  const screen = render(<MarketSetupPanel config={config} layoutOnly onApply={onApply} onClose={jest.fn()} />);
  expect(screen.queryByRole('button', { name: '시설 설정' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '상황 설정' }));
  expect(screen.queryByLabelText('상품별 기본 재고')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '세이브 · 로드' }));
  const other = { ...config, stockPerProduct: 77, alarmPenaltyPoints: 99 };
  fireEvent.changeText(screen.getByLabelText('마트 설정 가져오기 JSON'), JSON.stringify(other));
  fireEvent.press(screen.getByRole('button', { name: '붙여 넣은 설정 불러오기' }));
  expect(screen.getByText(/전체 설정에서 배치만 불러왔어요/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '배치 적용' }));
  expect(onApply.mock.calls[0][0]).toMatchObject({
    stockPerProduct: config.stockPerProduct,
    alarmPenaltyPoints: config.alarmPenaltyPoints
  });
  expect(onApply.mock.calls[0][0].environment.tilemap).toBeDefined();
});
