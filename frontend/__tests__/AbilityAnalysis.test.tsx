import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AbilityAnalysisScreen } from '../src/screens/AbilityAnalysisScreen';
import { createBehaviorAnalysis, getLatestBehaviorAnalysis, type AiBehaviorAnalysisResponse } from '../src/api/behaviorAnalysis';

jest.mock('../src/api/behaviorAnalysis', () => ({
  createBehaviorAnalysis: jest.fn(), getLatestBehaviorAnalysis: jest.fn(),
}));
jest.mock('../src/components/ui', () => ({ BrandHeader: () => null }));
jest.mock('../src/components/PressScale', () => ({
  PressScale: jest.requireActual('react-native').Pressable,
}));

const latest = jest.mocked(getLatestBehaviorAnalysis);
const create = jest.mocked(createBehaviorAnalysis);
const ready: AiBehaviorAnalysisResponse = {
  analysisId: 'analysis-1', datasetId: 'input-1', status: 'READY', model: 'mock-model',
  promptVersion: 'v1', evidenceVersion: 'NOT_CONNECTED_PHASE1', eventCount: 2, latencyMs: 1200,
  createdAt: '2026-09-05T00:00:00Z', errorCode: null,
  analysis: {
    summary: '수량을 바꾸고 목록을 열었어요.',
    findings: [{ id: 'F1', skill: '수량 확인', observation: '수량을 2개로 바꿨어요.',
      interpretation: '목표 수량을 살펴봤을 가능성이 있어요.', alternativeExplanations: ['조작을 연습했을 수도 있어요.'],
      evidenceEventIds: ['event-1'], suggestedSupport: '목록을 함께 읽어 봐요.' }],
    sessionAssessments: [{ sessionId: 'session-1', judgment: 'UNDETERMINED', explanation: '아직 결제 기록이 없어요.', evidenceEventIds: ['event-1'] }],
    uncertainties: ['실생활 수행은 알 수 없어요.'],
    practicePlan: { targetFindingIds: ['F1'], goal: '수량 비교 연습', rationale: '수량을 바꾸는 행동과 연결돼요.',
      recommendedDifficulty: 1, itemCount: 2, quantityComplexity: 'LOW', budgetPressure: 'LOW', textSupport: 'SIMPLIFIED', reasonCodes: ['PRACTICE'] },
  },
};

beforeEach(() => { jest.clearAllMocks(); latest.mockResolvedValue(null); });

it('조회만으로 AI를 새로 호출하지 않고 버튼으로 분석한다', async () => {
  create.mockResolvedValue(ready);
  const screen = render(<AbilityAnalysisScreen accessToken="token" />);
  await waitFor(() => expect(screen.getByText('새 행동 분석하기')).toBeTruthy());
  expect(create).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('새 행동 분석하기'));
  await waitFor(() => expect(screen.getByText('수량 비교 연습')).toBeTruthy());
  expect(create).toHaveBeenCalledWith('token');
  expect(screen.getByText('조작을 연습했을 수도 있어요.')).toBeTruthy();
  fireEvent.press(screen.getByText('판단 근거 보기'));
  expect(screen.getByText('판단 보류')).toBeTruthy();
  expect(screen.queryByText('독립 성공률')).toBeNull();
});

it.each(['FAILED', 'NO_HISTORY', 'INPUT_TOO_LARGE'] as const)('%s를 능력 판정으로 바꾸지 않는다', async (status) => {
  latest.mockResolvedValue({ ...ready, status, analysis: null });
  const screen = render(<AbilityAnalysisScreen accessToken="token" />);
  await waitFor(() => expect(screen.getByText('새 행동 분석하기')).toBeTruthy());
  expect(screen.queryByText('다음 연습 목표')).toBeNull();
  expect(create).not.toHaveBeenCalled();
});

it('로그아웃하면 이전 사용자 결과를 지운다', async () => {
  latest.mockResolvedValue(ready);
  const screen = render(<AbilityAnalysisScreen accessToken="token" />);
  await waitFor(() => expect(screen.getByText('수량 비교 연습')).toBeTruthy());
  screen.rerender(<AbilityAnalysisScreen accessToken={null} />);
  expect(screen.queryByText('수량 비교 연습')).toBeNull();
});

it('이전 계정의 늦은 응답을 새 계정에 표시하지 않는다', async () => {
  let resolveOld!: (value: AiBehaviorAnalysisResponse) => void;
  latest.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  const screen = render(<AbilityAnalysisScreen accessToken="old" />);
  screen.rerender(<AbilityAnalysisScreen accessToken="new" />);
  await waitFor(() => expect(screen.getByText('새 행동 분석하기')).toBeTruthy());
  resolveOld(ready);
  await waitFor(() => expect(screen.queryByText('수량 비교 연습')).toBeNull());
});
