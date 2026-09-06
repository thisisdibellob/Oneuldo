import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AbilityAnalysisScreen } from '../src/screens/AbilityAnalysisScreen';
import { getCurrentUserProfile, refreshCurrentUserProfile, type AiUserProfileResponse } from '../src/api/behaviorAnalysis';

jest.mock('../src/api/behaviorAnalysis', () => ({
  getCurrentUserProfile: jest.fn(),
  refreshCurrentUserProfile: jest.fn(),
}));
jest.mock('../src/components/ui', () => ({ BrandHeader: () => null }));
jest.mock('../src/components/PressScale', () => ({
  PressScale: jest.requireActual('react-native').Pressable,
}));

const current = jest.mocked(getCurrentUserProfile);
const refresh = jest.mocked(refreshCurrentUserProfile);
const ready: AiUserProfileResponse = {
  profileId: 'profile-2', profileVersion: 2, previousProfileId: 'profile-1',
  sourceAnalysisId: 'analysis-1', sourceDatasetId: 'input-1', sourceSessionId: 'session-1',
  status: 'READY', model: 'mock-model', promptVersion: 'profile-v1', latencyMs: 1200,
  createdAt: '2026-09-05T00:00:00Z', errorCode: null,
  profile: {
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

beforeEach(() => { jest.clearAllMocks(); current.mockResolvedValue(null); refresh.mockResolvedValue(null); });

it('누적 프로필을 조회하고 버튼은 최신 완료 세션 하나를 프로필에 반영한다', async () => {
  current.mockResolvedValue(ready);
  refresh.mockResolvedValue(ready);
  const screen = render(<AbilityAnalysisScreen accessToken="token" />);
  await waitFor(() => expect(screen.getByText('수량 비교 연습')).toBeTruthy());
  expect(current).toHaveBeenCalledTimes(1);
  expect(screen.getByText('프로필 버전 2 · 최근 갱신 1.2초')).toBeTruthy();
  fireEvent.press(screen.getByText('최신 플레이 반영하기'));
  await waitFor(() => expect(refresh).toHaveBeenCalledWith('token'));
  expect(current).toHaveBeenCalledTimes(1);
  expect(screen.getByText('조작을 연습했을 수도 있어요.')).toBeTruthy();
  fireEvent.press(screen.getByText('판단 근거 보기'));
  expect(screen.getByText('판단 보류')).toBeTruthy();
  expect(screen.queryByText('독립 성공률')).toBeNull();
});

it('프로필이 없으면 새 플레이 완료가 먼저 필요하다고 안내한다', async () => {
  const screen = render(<AbilityAnalysisScreen accessToken="token" />);
  await waitFor(() => expect(screen.getByText('아직 누적 프로필이 없어요. 장보기 연습을 한 번 완료해 주세요.')).toBeTruthy());
  expect(screen.queryByText('다음 연습 목표')).toBeNull();
});

it('로그아웃하면 이전 사용자 결과를 지운다', async () => {
  current.mockResolvedValue(ready);
  const screen = render(<AbilityAnalysisScreen accessToken="token" />);
  await waitFor(() => expect(screen.getByText('수량 비교 연습')).toBeTruthy());
  screen.rerender(<AbilityAnalysisScreen accessToken={null} />);
  expect(screen.queryByText('수량 비교 연습')).toBeNull();
});

it('이전 계정의 늦은 응답을 새 계정에 표시하지 않는다', async () => {
  let resolveOld!: (value: AiUserProfileResponse) => void;
  current.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  const screen = render(<AbilityAnalysisScreen accessToken="old" />);
  screen.rerender(<AbilityAnalysisScreen accessToken="new" />);
  await waitFor(() => expect(screen.getByText('최신 플레이 반영하기')).toBeTruthy());
  resolveOld(ready);
  await waitFor(() => expect(screen.queryByText('수량 비교 연습')).toBeNull());
});
