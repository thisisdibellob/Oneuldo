import { act, render } from '@testing-library/react-native';
import { creditActivities, resetUserProgressForTests } from '../src/progress/userProgress';
import { Text } from 'react-native';

import { MarketPurchaseResult } from '../src/components/game/MarketPurchaseResult';
import { marketProducts } from '../src/game/scenarios';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

it('목록을 다 맞추면 성공 카드와 산 물건, 분석 상태를 보여준다', () => {
  const product = marketProducts[0];
  const screen = render(<MarketPurchaseResult kind="success" details={[]} cart={{ [product.id]: 2 }} budget={10000}
    analysisStatus="분석을 접수했어요."><Text>버튼 자리</Text></MarketPurchaseResult>);
  expect(screen.getByText('장보기 성공!')).toBeTruthy();
  expect(screen.getByLabelText(`${product.name} 2개`)).toBeTruthy();
  expect(screen.getByText('분석을 접수했어요.')).toBeTruthy();
  expect(screen.getByText('버튼 자리')).toBeTruthy();
});

it('받은 경험치를 기본과 성공 보너스로 나눠 보여준다', () => {
  const state = creditActivities({ totalXp: 0, bestStreak: 0, activeDays: [], entries: [] },
    [{ id: 'shopping:s1', kind: 'shopping', sessionId: 's1', completedAt: Date.now() - 1000, title: '장보기 완료', place: '하늘마트',
      summary: '1개', metrics: [], facts: [], favorite: false, outcome: 'success' }]);
  act(() => resetUserProgressForTests(state));
  const screen = render(<MarketPurchaseResult kind="success" details={[]} cart={{}} analysisStatus="접수" xpRecordId="shopping:s1" />);
  expect(screen.getByText('+40')).toBeTruthy();
  expect(screen.getByText('끝까지 함 +30')).toBeTruthy();
  expect(screen.getByText('목록 다 맞춤 +10')).toBeTruthy();
  act(() => resetUserProgressForTests());
});

it('아쉬운 장보기는 고칠 부분을 목록으로 보여준다', () => {
  const screen = render(<MarketPurchaseResult kind="complete" details={['우유: 필요한 수량은 1개, 담은 수량은 0개예요.']} cart={{}}
    analysisStatus="기록을 전송하고 AI가 검토하고 있어요." />);
  expect(screen.getByText('장보기 완료!')).toBeTruthy();
  expect(screen.getByText('다시 확인할 것')).toBeTruthy();
  expect(screen.getByText('우유: 필요한 수량은 1개, 담은 수량은 0개예요.')).toBeTruthy();
});

it('장보기 포기는 같은 카드 모양으로 보여 주고 경험치가 없다고 알려준다', () => {
  const screen = render(<MarketPurchaseResult kind="gave-up" cart={{}} note="물건을 하나도 담지 않고 계산해서 포기로 기록했어요." xpRecordId="shopping:any" />);
  expect(screen.getByText('장보기 포기')).toBeTruthy();
  expect(screen.getByText('물건을 하나도 담지 않고 계산해서 포기로 기록했어요.')).toBeTruthy();
  expect(screen.getByText('이번 장보기는 경험치가 없어요')).toBeTruthy();
  expect(screen.getByText('담았던 물건')).toBeTruthy();
  expect(screen.queryByText(/^\+\d+$/)).toBeNull();
});
