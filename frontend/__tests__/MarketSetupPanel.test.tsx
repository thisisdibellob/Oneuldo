import { fireEvent, render } from '@testing-library/react-native';
import { MarketSetupPanel } from '../src/components/game/MarketSetupPanel';
import { createMarketSession, parseMarketSessionConfig } from '../src/game/marketSession';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

it('기본 배치를 유지하고 가로 통로 배치 선택을 설정과 JSON 왕복에 기록한다', () => {
  const config = createMarketSession({ seed: 'layout-ui-contract' }).config;
  const onApply = jest.fn();
  const screen = render(<MarketSetupPanel config={config} onApply={onApply} onClose={jest.fn()} />);
  expect(screen.getByRole('button', { name: '기본 배치' }).props.accessibilityState.selected).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: '가로 통로 배치' }));
  expect(screen.getByRole('button', { name: '가로 통로 배치' }).props.accessibilityState.selected).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: '설정 적용' }));
  const applied = onApply.mock.calls[0][0];
  expect(applied.environment.layoutId).toBe('aisles');
  expect(applied.seed).toBe(config.seed);
  const imported = parseMarketSessionConfig(JSON.stringify(applied));
  expect(imported.environment.layoutId).toBe('aisles');
  expect(createMarketSession(imported).environment.shelves.household.orientation).toBe('horizontal');
  expect(screen.getByText(/서로 다른 12종/)).toBeTruthy();
});

it('이전 JSON에서 빠진 layoutId는 기본 배치로 가져오며 모르는 배치는 거부한다', () => {
  const config = createMarketSession().config;
  delete config.environment.layoutId;
  expect(parseMarketSessionConfig(JSON.stringify(config)).environment.layoutId).toBe('classic');
  expect(() => parseMarketSessionConfig(JSON.stringify({ ...config, environment: { ...config.environment, layoutId: 'other' } }))).toThrow('layoutId');
});

it('모퉁이 지점과 입구 공사 조건을 함께 저장하고 예전 설정은 공사 없음으로 읽는다', () => {
  const config = createMarketSession().config;
  const onApply = jest.fn();
  const screen = render(<MarketSetupPanel config={config} onApply={onApply} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '모퉁이 지점' }));
  fireEvent.press(screen.getByRole('button', { name: '입구 공사 중' }));
  fireEvent.press(screen.getByRole('button', { name: '설정 적용' }));
  const applied = parseMarketSessionConfig(JSON.stringify(onApply.mock.calls[0][0]));
  expect(applied.environment).toMatchObject({ layoutId: 'corner', entranceConstruction: true });
  const session = createMarketSession(applied);
  expect(session.environment.constructionZones).toHaveLength(1);
  expect(session.environment.world.width).toBe(1280);
  delete config.environment.entranceConstruction;
  expect(parseMarketSessionConfig(JSON.stringify(config)).environment.entranceConstruction).toBe(false);
  expect(() => parseMarketSessionConfig(JSON.stringify({ ...config, environment: { entranceConstruction: 'yes' } }))).toThrow('entranceConstruction');
});

it('전달용 모퉁이 공사 JSON 예제는 실제 설정으로 가져올 수 있다', () => {
  const example = require('../docs/examples/market-corner-construction.json');
  const config = parseMarketSessionConfig(JSON.stringify(example));
  const game = createMarketSession(config);
  expect(game.environment.config).toMatchObject({ layoutId: 'corner', entranceConstruction: true });
  expect(game.environment.spawn).toEqual({ x: 1060, y: 1210 });
  expect(game.environment.constructionZones).toHaveLength(1);
});


it('계산원 확인 감점을 별도로 적용하고 JSON 왕복에서 유지한다', () => {
  const config = createMarketSession().config;
  const onApply = jest.fn();
  const screen = render(<MarketSetupPanel config={config} onApply={onApply} onClose={jest.fn()} />);
  expect(screen.getByLabelText('계산원 확인 감점').props.value).toBe('10');
  fireEvent.changeText(screen.getByLabelText('계산원 확인 감점'), '7');
  fireEvent.press(screen.getByRole('button', { name: '설정 적용' }));
  expect(parseMarketSessionConfig(JSON.stringify(onApply.mock.calls[0][0]))).toMatchObject({ cashierRequestPenaltyPoints: 7, alarmPenaltyPoints: config.alarmPenaltyPoints });
  fireEvent.changeText(screen.getByLabelText('계산원 확인 감점'), '101');
  fireEvent.press(screen.getByRole('button', { name: '설정 적용' }));
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alert').props.children).toMatch(/0~100/);
});

it('셀프 계산 줄과 학습 조건을 저장하고 예산 입력 중 빈 값은 화면을 깨뜨리지 않는다', () => {
  const onApply = jest.fn();
  const screen = render(<MarketSetupPanel config={createMarketSession().config} onApply={onApply} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '1번 줄을 셀프 계산대' }));
  fireEvent.press(screen.getByRole('button', { name: '원래 상품만 구매' }));
  fireEvent.changeText(screen.getByLabelText('선택 상품 예산'), '');
  fireEvent.press(screen.getByRole('button', { name: '설정 적용' }));
  expect(onApply).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').props.children).toMatch(/예산/);
  fireEvent.changeText(screen.getByLabelText('선택 상품 예산'), '3500');
  fireEvent.press(screen.getByRole('button', { name: '설정 적용' }));
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(onApply.mock.calls[0][0]).toMatchObject({ environment: { kioskLane: 'checkout' }, learning: { allowSubstitution: false, choiceBudget: 3500 } });
});
